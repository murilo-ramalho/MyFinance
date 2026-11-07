import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AcquisitionPlan, CommandContext, FinanceBook, FinanceCommand, Obligation, Operation, OperationInput, ProductionCost } from '../domain/book';
import { accountBalance, assetPosition, bookMovements, budgetSummary, invoiceSummary, monthEnd, operationPaidMinor, paidMinor,
  productionSummary, protectedMinor, remainingMinor, stockPosition, toolCostPerUse, financialPosition, dailyCashForecast, recurrenceCancellationPreview, obligationStatus, acquisitionSimulationPreview, reserveAvailability } from '../domain/bookSelectors';
import { brlInputFromMinor, formatBrl, parseBrlToMinor } from '../domain/money';
import { formatBrazilianDate, parseBrazilianDate } from '../domain/dates';
import { formatQuantity, parseQuantity } from '../domain/exact';
import { monthAtOffset, monthOf, type CivilDate } from '../domain/movements';
import { addDays, expandRecurrence, type RecurrenceRule } from '../domain/recurrences';
import { RecordEditor, type EditorDefinition, type EditorField } from './RecordEditor';
import { exportMovementsCsv, previewMovementsCsv, type CsvPreview } from '../application/movementCsv';
import { deviceToday } from '../platform/deviceDate';

type Panel = 'operations' | 'accounts' | 'plans' | 'series' | 'budgets' | 'inventory' | 'production' | 'investments' | 'tools' | 'categories' | 'audit' | 'files' | 'cash';
const PANELS: { key: Panel; label: string }[] = [
  { key: 'operations', label: 'Compras e pagamentos' }, { key: 'accounts', label: 'Contas e reservas' },
  { key: 'plans', label: 'Aquisições' }, { key: 'series', label: 'Recorrências' }, { key: 'budgets', label: 'Orçamentos' },
  { key: 'inventory', label: 'Estoque' }, { key: 'production', label: 'Custos e resultados' },
  { key: 'investments', label: 'Investimentos' }, { key: 'tools', label: 'Ferramentas' },
  { key: 'categories', label: 'Categorias' }, { key: 'audit', label: 'Histórico' },
  { key: 'files', label: 'Importar e exportar' },
  { key: 'cash', label: 'Caixa diário' },
];
const optional = { value: '', label: 'Nenhum' };
const historyLabels: Record<string, string> = {
  movements: 'Movimentação', accounts: 'Conta', categories: 'Categoria', projects: 'Projeto', cards: 'Cartão',
  preferences: 'Preferências', operations: 'Operação', obligations: 'Parcela', settlements: 'Liquidação', refunds: 'Reembolso',
  transfers: 'Transferência', reserves: 'Reserva', plans: 'Aquisição', budgets: 'Orçamento', recurrenceRules: 'Recorrência',
  recurrenceExceptions: 'Exceção da recorrência', stockItems: 'Material', stockLots: 'Compra de material', stockUses: 'Consumo de material',
  productionCosts: 'Custo informado', assets: 'Ativo', trades: 'Investimento', tools: 'Ferramenta', settings: 'Margem de segurança',
};
function historyValue(value: unknown): string {
  if (value === null) return 'Ausente';
  if (typeof value === 'number') return formatBrl(value);
  if (typeof value !== 'object') return 'Registrado';
  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title : typeof record.name === 'string' ? record.name : '';
  const money = typeof record.amountMinor === 'number' ? formatBrl(record.amountMinor) : '';
  const date = [record.settledOn, record.plannedOn, record.occurredOn].find((entry) => typeof entry === 'string');
  return [title, money, typeof date === 'string' ? formatBrazilianDate(date as CivilDate) : ''].filter(Boolean).join(' · ') || 'Registrado';
}
function inputMoney(value: number | null | undefined): string { return value == null ? '' : value === 0 ? '0,00' : `${value < 0 ? '-' : ''}${brlInputFromMinor(Math.abs(value))}`; }
function amount(text: string, zero = false, negative = false): number {
  const trimmed = text.trim();
  if (zero && /^(?:0|0,0{1,2})$/.test(trimmed)) return 0;
  const sign = negative && trimmed.startsWith('-') ? -1 : 1;
  const result = parseBrlToMinor(sign < 0 ? trimmed.slice(1) : trimmed);
  if (result === null) throw new Error('Informe um valor válido em reais, por exemplo 25,90.');
  return result * sign;
}
function date(text: string, required = true): CivilDate | null {
  if (!required && !text.trim()) return null;
  const result = parseBrazilianDate(text);
  if (!result) throw new Error('Confira a data no formato DD/MM/AAAA.');
  return result;
}
function positiveInteger(text: string): number {
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < 1) throw new Error('Informe uma quantidade inteira positiva.');
  return Number(text);
}
function quantity(text: string): number {
  const value = parseQuantity(text);
  if (value === null) throw new Error('Informe uma quantidade positiva com até seis casas decimais.');
  return value;
}
function Action({ label, onPress, testID }: { label: string; onPress(): void; testID?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} testID={testID} onPress={onPress} style={ws.action}><Text style={ws.actionText}>{label}</Text></Pressable>;
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={ws.card}><Text style={ws.cardTitle}>{title}</Text>{children}</View>;
}
export interface WorkspaceProps {
  book: FinanceBook; today: CivilDate;
  onCommand(command: FinanceCommand, context: CommandContext): void;
  selectedOperationId?: string | null;
  onSelectOperation(id: string | null): void;
}

export function FinanceWorkspace({ book, today, onCommand, selectedOperationId, onSelectOperation }: WorkspaceProps) {
  const [panel, setPanel] = useState<Panel>('operations');
  const [panelPickerOpen, setPanelPickerOpen] = useState(false);
  const [editor, setEditor] = useState<EditorDefinition | null>(null);
  const [notice, setNotice] = useState('');
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const sequence = useRef(book.audit.length + 1);
  const id = (prefix: string) => `${prefix}-${Date.now()}-${sequence.current++}`;
  const execute = (command: FinanceCommand, requestId: string, reason = '') => onCommand(command,
    { requestId, today, recordedAt: new Date().toISOString(), reason });
  const open = (definition: Omit<EditorDefinition, 'id'>) => { setNotice(''); setEditor({ id: id('form'), ...definition }); };
  const choices = (records: readonly { id: string; name: string }[], none = false) => [ ...(none ? [optional] : []), ...records.map((entry) => ({ value: entry.id, label: entry.name })) ];
  const accounts = book.accounts.filter((entry) => entry.kind === 'cash');
  const accountField = (key = 'account', value?: string): EditorField => ({ key, label: key === 'from' ? 'Conta de origem' : key === 'to' ? 'Conta de destino' : 'Conta', value: value ?? accounts[0]?.id ?? '', choices: choices(key === 'from' || key === 'to' ? book.accounts : accounts) });
  const projectField = (value?: string | null): EditorField => ({ key: 'project', label: 'Projeto', value: value ?? '', choices: choices(book.projects, true) });
  const categoryField = (value?: string | null): EditorField => ({ key: 'category', label: 'Categoria', value: value ?? '', choices: choices(book.categories, true) });
  const todayText = formatBrazilianDate(today);
  const operationFields = (existing?: Operation, plan?: AcquisitionPlan): EditorField[] => [
    { key: 'title', label: 'Descrição do registro', value: existing?.title ?? plan?.title ?? '' },
    { key: 'direction', label: 'Tipo', value: existing?.direction ?? 'expense', readOnly: !!existing,
      choices: [{ value: 'expense', label: 'Despesa' }, { value: 'income', label: 'Receita' }] },
    { key: 'amount', label: 'Valor total em reais', value: inputMoney(existing?.amountMinor ?? plan?.estimatedMinor) },
    { key: 'nature', label: 'Natureza', value: existing?.nature ?? 'commitment', readOnly: !!existing,
      choices: [{ value: 'commitment', label: 'Compromisso confirmado' }, { value: 'forecast', label: 'Previsão' }] },
    { key: 'occurred', label: 'Data do fato, se aconteceu', value: existing?.occurredOn ? formatBrazilianDate(existing.occurredOn) : '', hint: 'Deixe vazia se a compra ou venda ainda não aconteceu.' },
    { key: 'occurredTime', label: 'Hora conhecida do fato, opcional', value: existing?.occurredTime ?? '', hint: 'HH:MM. Deixe vazia quando não souber.' },
    { key: 'expected', label: 'Data prevista do evento', value: existing?.expectedOn ? formatBrazilianDate(existing.expectedOn) : '' },
    accountField('account', existing?.accountId), categoryField(existing?.categoryId), projectField(existing?.projectId ?? plan?.projectId),
    { key: 'card', label: 'Cartão de crédito', value: existing?.cardId ?? '', choices: choices(book.cards, true), readOnly: !!existing },
    ...(!existing ? [
      { key: 'due', label: 'Primeiro vencimento', value: todayText },
      { key: 'count', label: 'Número de parcelas', value: '1' },
      { key: 'paid', label: 'Valor já pago ou recebido', value: '', hint: 'Opcional. Não preencha para compra no cartão; use o pagamento da fatura.' },
      { key: 'settled', label: 'Data efetiva do valor já pago', value: todayText },
      { key: 'settledTime', label: 'Hora do valor já pago, opcional', hint: 'HH:MM, somente quando houver pagamento informado.' },
    ] : []),
  ];
  const operationInput = (values: Record<string, string>, operationId: string): OperationInput => ({
    id: operationId, title: values.title.trim(), direction: values.direction as 'income' | 'expense', amountMinor: amount(values.amount),
    nature: values.nature as 'forecast' | 'commitment', occurredOn: date(values.occurred, false), expectedOn: date(values.expected, false),
    accountId: values.account, categoryId: values.category || null, projectId: values.project || null, cardId: values.card || null,
    dueOn: date(values.due)!, installmentCount: positiveInteger(values.count), shortMonthPolicy: 'last-day',
    initialPaidMinor: values.paid.trim() ? amount(values.paid) : 0, settledOn: values.paid.trim() ? date(values.settled) : null,
    occurredTime: values.occurredTime.trim() || null, settledTime: values.settledTime.trim() || null,
  });
  const openOperation = (existing?: Operation, plan?: AcquisitionPlan) => {
    const request = id('save-operation'); const operationId = existing?.id ?? id('operation');
    open({ title: existing ? 'Editar registro' : plan ? 'Converter aquisição em registro' : 'Novo registro com parcelas',
      note: 'Registro manual: informar um pagamento aqui não movimenta sua conta bancária.', fields: operationFields(existing, plan),
      submit: (values) => {
        if (existing) execute({ kind: 'revise-operation', operationId, title: values.title.trim(), amountMinor: amount(values.amount),
          occurredOn: date(values.occurred, false), expectedOn: date(values.expected, false), accountId: values.account,
          categoryId: values.category || null, projectId: values.project || null, occurredTime: values.occurredTime.trim() || null }, request);
        // Existing payment dates/times are edited only through their payment record.
        else execute(plan ? { kind: 'convert-plan', planId: plan.id, operation: operationInput(values, operationId) }
          : { kind: 'create-operation', operation: operationInput(values, operationId) }, request);
        onSelectOperation(operationId);
      } });
  };
  const recordPayment = (obligation: Obligation) => {
    const request = id('payment');
    open({ title: 'Registrar pagamento ou recebimento', note: `Em aberto: ${formatBrl(remainingMinor(book, obligation))}. O vencimento original será preservado.`,
      fields: [{ key: 'amount', label: 'Valor efetivo', value: inputMoney(remainingMinor(book, obligation)) },
        { key: 'date', label: 'Data efetiva', value: todayText }, { key: 'time', label: 'Hora efetiva, opcional', value: '' }, accountField()],
      submit: (values) => execute({ kind: 'settle', settlement: { id: request, obligationId: obligation.id,
        amountMinor: amount(values.amount), settledOn: date(values.date)!, settledTime: values.time.trim() || null, accountId: values.account, method: 'cash', creditRefundId: null } }, request) });
  };
  const refund = (operation: Operation) => {
    const request = id('refund');
    open({ title: operation.direction === 'expense' ? 'Registrar reembolso' : 'Registrar devolução ao comprador',
      note: 'A compra ou venda e seus pagamentos continuam no histórico. Um reembolso pendente só aumenta o caixa ao ser recebido.',
      fields: [{ key: 'amount', label: 'Valor do reembolso' }, { key: 'status', label: 'Situação do reembolso', value: 'pending', choices: [{ value: 'pending', label: 'A receber' }, { value: 'received', label: 'Já recebido ou devolvido' }] },
        { key: 'date', label: 'Data prevista ou efetiva', value: todayText },
        { key: 'destination', label: 'Destino', value: 'account', choices: [{ value: 'account', label: 'Dinheiro em conta' }, ...(operation.cardId ? [{ value: 'card', label: 'Crédito no cartão' }] : [])] },
        accountField(), { key: 'reason', label: 'Motivo', multiline: true }],
      submit: (values) => execute({ kind: 'request-refund', refund: { id: request, operationId: operation.id, amountMinor: amount(values.amount),
        status: values.status as 'pending' | 'received', plannedOn: date(values.date)!, receivedOn: values.status === 'received' ? date(values.date) : null,
        destination: values.destination as 'account' | 'card', accountId: values.destination === 'account' ? values.account : null,
        cardId: values.destination === 'card' ? operation.cardId : null, reason: values.reason } }, request) });
  };
  const waive = (obligations: Obligation[]) => {
    const request = id('waive');
    const pending = obligations.filter((entry) => remainingMinor(book, entry) > 0);
    const paid = obligations.filter((entry) => paidMinor(book, entry.id) > 0).length;
    const forecasts = pending.filter((entry) => book.operations.find((operation) => operation.id === entry.operationId)?.nature === 'forecast').length;
    open({ title: 'Confirmar cancelamento ou dispensa', note: `${forecasts} previsões e ${pending.length - forecasts} obrigações confirmadas atingidas; ${paid} parcelas têm pagamentos históricos preservados. Nenhum reembolso será criado.`,
      fields: [{ key: 'confirmed', label: 'A obrigação deixou de existir?', value: 'no', choices: [{ value: 'no', label: 'Não confirmado' }, { value: 'yes', label: 'Sim, houve dispensa ou cancelamento real' }] },
        { key: 'reason', label: 'Motivo da dispensa', multiline: true }], submitLabel: 'Confirmar efeito nos registros',
      submit: (values) => execute({ kind: 'waive', obligationIds: pending.map((entry) => entry.id), legalReleaseConfirmed: values.confirmed === 'yes' }, request, values.reason) });
  };
  const planEditor = (plan?: AcquisitionPlan) => {
    const request = id('save-plan'); const planId = plan?.id ?? id('plan');
    open({ title: plan ? 'Editar aquisição' : 'Aquisição sem data', note: 'Esta intenção não entra no saldo, na fatura ou nas previsões até você convertê-la em registro.',
      fields: [{ key: 'title', label: 'Compra desejada', value: plan?.title }, { key: 'estimate', label: 'Preço estimado, opcional', value: inputMoney(plan?.estimatedMinor) },
        { key: 'target', label: 'Preço-alvo, opcional', value: inputMoney(plan?.targetMinor) }, projectField(plan?.projectId), { key: 'notes', label: 'Notas', value: plan?.notes, multiline: true }],
      submit: (values) => execute({ kind: 'save-plan', plan: { id: planId, title: values.title.trim(), currency: 'BRL',
        estimatedMinor: values.estimate.trim() ? amount(values.estimate) : null, targetMinor: values.target.trim() ? amount(values.target) : null,
        notes: values.notes, projectId: values.project || null, convertedOperationId: plan?.convertedOperationId ?? null } }, request) });
  };
  const selected = book.operations.find((entry) => entry.id === selectedOperationId);
  const costEditor = (cost?: ProductionCost) => {
    const request = id('cost-revision'); const costId = cost?.id ?? id('production-cost');
    open({ title: cost ? 'Editar custo informado' : 'Custo informado de produção', fields: [
      { key: 'title', label: 'Descrição do custo', value: cost?.title }, projectField(cost?.projectId),
      { key: 'sale', label: 'Venda relacionada, opcional', choices: [optional, ...book.operations.filter((entry) => entry.direction === 'income').map((entry) => ({ value: entry.id, label: entry.title }))], value: cost?.saleOperationId ?? '' },
      { key: 'amount', label: 'Custo total tido', value: inputMoney(cost?.amountMinor) },
      { key: 'date', label: 'Data do custo', value: cost ? formatBrazilianDate(cost.occurredOn) : todayText },
    ], submit: (values) => execute({ kind: 'save-production-cost', cost: { id: costId, title: values.title.trim(), projectId: values.project,
      saleOperationId: values.sale || null, amountMinor: amount(values.amount, true), occurredOn: date(values.date)! } }, request) });
  };
  const openToolEditor = () => {
    const request = id('tool');
    open({ title: 'Ferramenta', note: 'Selecione a compra original. O cadastro não gera outro pagamento.', fields: [{ key: 'name', label: 'Nome da ferramenta' },
      { key: 'purchase', label: 'Compra de origem', choices: book.operations.filter((entry) => entry.direction === 'expense').map((entry) => ({ value: entry.id, label: entry.title })) },
      { key: 'extra', label: 'Outros custos atribuídos', value: '0,00' }, { key: 'residual', label: 'Valor residual estimado', value: '0,00' }],
      submit: (values) => execute({ kind: 'save-tool', tool: { id: request, name: values.name.trim(), operationId: values.purchase,
        attributedMinor: amount(values.extra, true), residualMinor: amount(values.residual, true), uses: 0 } }, request) });
  };
  const position = financialPosition(book, today);
  const selectedPanel = PANELS.find((entry) => entry.key === panel)!;
  return <>
    <Text style={ws.title}>Organizar seus registros</Text>
    <Text style={ws.note}>Tudo é informado por você e calculado localmente.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Seção atual: ${selectedPanel.label}. Abrir seções.`}
      accessibilityState={{ expanded: panelPickerOpen }} testID="workspace-panel-picker"
      onPress={() => setPanelPickerOpen(true)} style={ws.panelPicker}>
      <View style={ws.panelPickerCopy}>
        <Text style={ws.panelPickerCaption}>SEÇÃO</Text>
        <Text style={ws.panelPickerValue}>{selectedPanel.label}</Text>
      </View>
      <Text style={ws.panelPickerChevron}>⌄</Text>
    </Pressable>
    <Modal visible={panelPickerOpen} transparent animationType="slide" onRequestClose={() => setPanelPickerOpen(false)}
      statusBarTranslucent testID="workspace-panel-picker-modal">
      <View style={ws.panelPickerBackdrop}>
        <Pressable style={ws.panelPickerDismiss} onPress={() => setPanelPickerOpen(false)} accessibilityLabel="Fechar seções" />
        <View style={ws.panelPickerSheet}>
          <View style={ws.panelPickerHandle} />
          <View style={ws.panelPickerSheetHeader}>
            <View>
              <Text style={ws.panelPickerCaption}>ORGANIZAR</Text>
              <Text style={ws.panelPickerSheetTitle}>Escolha uma seção</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar seções" testID="workspace-panel-picker-close"
              onPress={() => setPanelPickerOpen(false)} style={ws.panelPickerClose}>
              <Text style={ws.panelPickerCloseText}>×</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ws.panelPickerList}>
            {PANELS.map((entry) => <Pressable accessibilityRole="button" key={entry.key} testID={`workspace-${entry.key}`}
              accessibilityState={{ selected: panel === entry.key }} onPress={() => { setPanel(entry.key); setNotice(''); setPanelPickerOpen(false); }}
              style={[ws.panelPickerOption, panel === entry.key && ws.panelPickerOptionSelected]}>
              <Text style={[ws.panelPickerOptionText, panel === entry.key && ws.panelPickerOptionTextSelected]}>{entry.label}</Text>
              {panel === entry.key ? <Text style={ws.panelPickerCheck}>✓</Text> : null}
            </Pressable>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
    {notice ? <Text style={ws.note} testID="workspace-notice">{notice}</Text> : null}
    {panel === 'operations' ? <>
      <Action label="Novo registro com parcelas" testID="workspace-new-operation" onPress={() => openOperation()} />
      <Action label="Cadastrar cartão" onPress={() => { const request = id('card'); open({ title: 'Cartão de crédito', fields: [{ key: 'name', label: 'Nome do cartão' }], submit: (values) => execute({ kind: 'save-card', card: { id: request, name: values.name.trim() } }, request) }); }} />
      {book.operations.map((operation) => <Card key={operation.id} title={operation.title}>
        <Text style={ws.note}>{formatBrl(operation.amountMinor)} · liquidado {formatBrl(operationPaidMinor(book, operation.id))}</Text>
        <Action label={`Abrir ${operation.title}`} onPress={() => onSelectOperation(operation.id)} />
      </Card>)}
      {book.cards.map((card) => {
        const month = monthOf(today); const invoice = invoiceSummary(book, card.id, month);
        return <Card key={card.id} title={`${card.name} · fatura de ${month}`}>
          <Text>Em aberto {formatBrl(invoice.remainingMinor)} · créditos {formatBrl(invoice.creditMinor)}</Text>
          <Action label={`Registrar pagamento da fatura de ${card.name}`} onPress={() => {
            const request = id('invoice'); open({ title: 'Registrar pagamento de fatura', note: 'O aplicativo só registra o pagamento que você informar.',
              fields: [{ key: 'month', label: 'Mês da fatura (AAAA-MM)', value: month }, { key: 'amount', label: 'Valor pago em dinheiro', value: inputMoney(invoice.payableMinor) }, { key: 'date', label: 'Data do pagamento', value: todayText }, accountField()],
              submit: (values) => execute({ kind: 'pay-invoice', cardId: card.id, month: values.month as `${number}-${number}`, amountMinor: amount(values.amount, true), accountId: values.account, settledOn: date(values.date)! }, request) });
          }} />
        </Card>;
      })}
    </> : null}
    {panel === 'accounts' ? <>
      <Action label="Nova conta" onPress={() => {
        const request = id('account'); open({ title: 'Conta local', fields: [{ key: 'name', label: 'Nome da conta' },
          { key: 'kind', label: 'Tipo de conta', value: 'cash', choices: [{ value: 'cash', label: 'Caixa para pagamentos' }, { value: 'investment', label: 'Dinheiro em corretora' }] },
          { key: 'medium', label: 'Meio', value: 'digital', choices: [{ value: 'digital', label: 'Digital' }, { value: 'physical', label: 'Físico' }] },
          { key: 'opening', label: `Saldo de abertura em 01/${book.openingMonth.slice(5)}/${book.openingMonth.slice(0, 4)}`, value: '0,00', hint: 'Aceita saldo negativo. Informe a abertura, não o saldo de hoje.' },
          { key: 'eligible', label: 'Usar no disponível para gastar', value: 'yes', choices: [{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }] }],
          submit: (values) => execute({ kind: 'save-account', account: { id: request, name: values.name.trim(), currency: 'BRL', kind: values.kind as 'cash' | 'investment', moneyType: values.medium as 'digital' | 'physical',
            openingOn: `${book.openingMonth}-01`, openingMinor: amount(values.opening, true, true), eligible: values.kind === 'cash' && values.eligible === 'yes' } }, request) });
      }} />
      <Action label="Registrar transferência" onPress={() => {
        const request = id('transfer'); open({ title: 'Transferência entre suas contas', note: 'Apenas registra uma transferência já feita. Não é receita nem despesa.',
          fields: [accountField('from'), accountField('to', book.accounts[1]?.id), { key: 'amount', label: 'Valor da transferência' }, { key: 'date', label: 'Data da transferência', value: todayText }],
          submit: (values) => execute({ kind: 'transfer', transfer: { id: request, fromAccountId: values.from, toAccountId: values.to, amountMinor: amount(values.amount), occurredOn: date(values.date)! } }, request) });
      }} />
      <Action label="Nova reserva" onPress={() => {
        const request = id('reserve'); open({ title: 'Destinar dinheiro à reserva', note: 'A reserva continua dentro da conta e não gera pagamento.',
          fields: [{ key: 'name', label: 'Nome da reserva' }, accountField(), { key: 'amount', label: 'Valor reservado' }],
          submit: (values) => execute({ kind: 'save-reserve', reserve: { id: request, name: values.name.trim(), accountId: values.account, amountMinor: amount(values.amount, true) } }, request) });
      }} />
      {book.accounts.map((account) => <Card key={account.id} title={account.name}>
        <Text>Saldo registrado: {formatBrl(accountBalance(book, account.id, today))}</Text>
        <Text style={ws.note}>{account.kind === 'investment' ? 'Fora do caixa para gastar' : account.eligible ? 'Incluída no disponível' : 'Fora do disponível para gastar'}</Text>
        {reserveAvailability(book, account.id, today).insufficient ? <Text style={ws.note}>O saldo registrado não cobre as reservas destinadas a esta conta.</Text> : null}
        <Action label={`Editar conta ${account.name}`} onPress={() => { const request = id('edit-account'); open({ title: 'Editar conta', fields: [{ key: 'name', label: 'Nome da conta', value: account.name },
          { key: 'opening', label: 'Saldo de abertura', value: inputMoney(account.openingMinor) }, { key: 'eligible', label: 'Usar no disponível', value: account.eligible ? 'yes' : 'no', choices: [{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }] }],
          submit: (values) => execute({ kind: 'save-account', account: { ...account, name: values.name.trim(), openingMinor: amount(values.opening, true, true), eligible: account.kind === 'cash' && values.eligible === 'yes' } }, request) }); }} />
      </Card>)}
      {book.reserves.map((reserve) => <Card key={reserve.id} title={reserve.name}><Text>{formatBrl(reserve.amountMinor)} protegidos na conta</Text>
        <Action label={`Ajustar reserva ${reserve.name}`} onPress={() => { const request = id('edit-reserve'); open({ title: 'Ajustar reserva', fields: [{ key: 'amount', label: 'Novo valor reservado', value: inputMoney(reserve.amountMinor), hint: 'Use zero para liberar toda a reserva.' }], submit: (values) => execute({ kind: 'save-reserve', reserve: { ...reserve, amountMinor: amount(values.amount, true) } }, request) }); }} />
      </Card>)}
      <Text style={ws.note}>Total protegido: {formatBrl(protectedMinor(book))}</Text>
      <Action label="Ajustar margem de segurança" onPress={() => { const request = id('cushion'); open({ title: 'Margem de segurança', fields: [{ key: 'amount', label: 'Margem protegida', value: inputMoney(book.cushionMinor) }], submit: (values) => execute({ kind: 'set-cushion', amountMinor: amount(values.amount, true) }, request) }); }} />
      <Action label="Configurar horizonte e fuso" onPress={() => { const request = id('preferences'); open({ title: 'Previsão e calendário', note: 'O fuso interpreta hoje e a virada do mês. Datas e horários já registrados não serão reescritos.', fields: [
        { key: 'horizon', label: 'Horizonte do disponível', value: book.preferences.find((entry) => entry.id === 'safe-horizon')?.value ?? 'next-income', choices: [{ value: 'next-income', label: 'Até a próxima entrada prevista' }, { value: '30-days', label: 'Próximos 30 dias' }, { value: '90-days', label: 'Próximos 90 dias' }] },
        { key: 'zone', label: 'Fuso de planejamento', value: book.preferences.find((entry) => entry.id === 'time-zone')?.value ?? 'device', hint: 'Use device para seguir o aparelho, ou um nome como America/Sao_Paulo.' },
      ], submit: (values) => onCommand({ kind: 'set-preferences', timeZone: values.zone.trim(), horizon: values.horizon as 'next-income' | '30-days' | '90-days' },
        { requestId: request, recordedAt: new Date().toISOString(), today: deviceToday(values.zone.trim()) }) }); }} />
    </> : null}
    {panel === 'plans' ? <>
      <Action label="Nova aquisição sem data" testID="workspace-new-plan" onPress={() => planEditor()} />
      {book.plans.map((plan) => <Card key={plan.id} title={plan.title}>
        <Text style={ws.note}>{plan.convertedOperationId ? 'Convertida em registro' : 'Intenção sem data · não afeta o saldo'}</Text>
        <Text>{plan.estimatedMinor ? `Estimado ${formatBrl(plan.estimatedMinor)}` : 'Preço não informado'}</Text>
        <Action label={`Editar aquisição ${plan.title}`} onPress={() => planEditor(plan)} />
        {!plan.convertedOperationId ? <>
          <Action label={`Converter ${plan.title} em registro`} onPress={() => openOperation(undefined, plan)} />
          <Action label={`Simular ${plan.title}`} onPress={() => open({ title: 'Simulação isolada', fields: [{ key: 'date', label: 'Data hipotética', value: todayText }, accountField()], submit: (values) => {
            const simulated = acquisitionSimulationPreview(book, plan.id, date(values.date)!, values.account, today);
            setNotice(`Simulação em ${simulated.month}: fechamento-base ${formatBrl(simulated.baselineClosingMinor)}, com a compra ${formatBrl(simulated.scenarioClosingMinor)}; impacto ${formatBrl(simulated.impactMinor)}. Nenhum registro foi criado.`);
          } })} />
        </> : null}
      </Card>)}
    </> : null}
    {panel === 'series' ? <>
      <Action label="Nova recorrência" onPress={() => {
        const request = id('series'); open({ title: 'Recorrência', note: 'Meses curtos usam o último dia. Nenhuma ocorrência vira pagamento automaticamente.', fields: [
          { key: 'title', label: 'Nome da série' }, { key: 'amount', label: 'Valor por ocorrência' },
          { key: 'kind', label: 'Repetição', value: 'monthly', choices: [{ value: 'monthly', label: 'Mensal' }, { value: 'interval', label: 'Intervalo em dias' }, { value: 'after-completion', label: 'Meses após execução' }, { value: 'condition', label: 'Sugestão por condição' }] },
          { key: 'direction', label: 'Tipo da série', value: 'expense', choices: [{ value: 'expense', label: 'Despesa' }, { value: 'income', label: 'Receita' }] },
          { key: 'anchor', label: 'Data inicial', value: todayText }, { key: 'interval', label: 'Intervalo', value: '1' },
          { key: 'end', label: 'Data final, opcional' }, { key: 'count', label: 'Quantidade de ciclos, opcional' },
          { key: 'contract', label: 'Existe obrigação contratada?', value: 'no', choices: [{ value: 'no', label: 'Compra voluntária' }, { value: 'yes', label: 'Obrigação contratada' }] },
          accountField(), categoryField(), projectField(), { key: 'condition', label: 'Condição, se aplicável', multiline: true }],
          submit: (values) => execute({ kind: 'save-recurrence', rule: { id: request, title: values.title.trim(), amountMinor: amount(values.amount),
            direction: values.direction as 'income' | 'expense', version: 1, kind: values.kind as RecurrenceRule['kind'], anchorOn: date(values.anchor)!,
            interval: positiveInteger(values.interval), endOn: date(values.end, false), count: values.count.trim() ? positiveInteger(values.count) : null,
            shortMonthPolicy: 'last-day', canceledFrom: null, contractual: values.contract === 'yes', accountId: values.account,
            categoryId: values.category || null, projectId: values.project || null, lastCompletedOn: null, completedCount: 0, conditionNote: values.condition.trim() || null } }, request) });
      }} />
      {book.recurrenceRules.map((rule) => {
        const through = monthEnd(monthAtOffset(monthOf(today), 2));
        const occurrences = expandRecurrence(rule, book.recurrenceExceptions, `${book.openingMonth}-01`, through);
        return <Card key={rule.id} title={rule.title}>
          <Text style={ws.note}>{rule.contractual ? 'Obrigação contratada' : 'Compra voluntária'} · {rule.endOn ? `até ${formatBrazilianDate(rule.endOn)}` : 'Sem data final'}</Text>
          {rule.kind === 'condition' ? <Text>Condição a acompanhar: {rule.conditionNote}. Nenhum registro foi gerado. Confirme manualmente quando acontecer.</Text> : null}
          {occurrences.map((occurrence) => <View key={occurrence.key} style={ws.part}>
            <Text>{formatBrazilianDate(occurrence.date)} · {formatBrl(occurrence.amountMinor)}</Text>
            <Action label={`Abrir ocorrência ${formatBrazilianDate(occurrence.date)}`} onPress={() => {
              try {
                const request = id('materialize'); execute({ kind: 'materialize-occurrence', ruleId: rule.id, position: occurrence.position, through }, request);
                onSelectOperation(`occurrence:${occurrence.key}`);
              } catch (failure) { setNotice(failure instanceof Error ? failure.message : 'Não foi possível abrir a ocorrência.'); }
            }} />
            <Action label={`Alterar ocorrência ${formatBrazilianDate(occurrence.date)}`} onPress={() => {
              const request = id('exception'); open({ title: 'Alterar ocorrência', fields: [{ key: 'scope', label: 'Alcance', value: 'this', choices: [{ value: 'this', label: 'Somente esta' }, { value: 'future', label: 'Esta e próximas' }] },
                { key: 'title', label: 'Título', value: rule.title }, { key: 'amount', label: 'Novo valor', value: inputMoney(occurrence.amountMinor) }, { key: 'date', label: 'Nova data, apenas nesta', value: formatBrazilianDate(occurrence.date) }],
                submit: (values) => execute(values.scope === 'this' ? { kind: 'recurrence-exception', exception: { id: `${rule.id}:exception:${occurrence.position}`, ruleId: rule.id,
                  position: occurrence.position, action: 'override', title: values.title.trim(), date: date(values.date), amountMinor: amount(values.amount) } }
                  : { kind: 'revise-recurrence', ruleId: rule.id, fromPosition: occurrence.position, amountMinor: amount(values.amount), title: values.title.trim() }, request) });
            }} />
            <Action label={`Cancelar a partir de ${formatBrazilianDate(occurrence.date)}`} onPress={() => {
              const request = id('cancel-series'); open({ title: 'Alcance do cancelamento', note: 'Pagamentos históricos serão preservados. Esta ação registra uma decisão; não cancela contratos com instituições.', fields: [
                { key: 'scope', label: 'Alcance', value: 'this', choices: [{ value: 'this', label: 'Somente esta' }, { value: 'future', label: 'Esta e próximas' }, { value: 'pending', label: 'Todas as pendentes' }, { value: 'rule', label: 'Regra inteira' }] },
                { key: 'confirmed', label: 'Obrigação dispensada?', value: 'no', choices: [{ value: 'no', label: 'Sem obrigação ou não confirmado' }, { value: 'yes', label: 'Dispensa real confirmada' }] }],
                preview: (values) => { const impact = recurrenceCancellationPreview(book, rule.id, occurrence.position, values.scope, through);
                  return `${impact.virtualCount} ocorrências projetadas na janela até ${formatBrazilianDate(through)}, ${impact.openCount} pendências materializadas e ${impact.paidCount} parcelas com pagamentos históricos preservados. ${values.scope === 'this' ? 'Outras ocorrências continuam.' : 'A geração posterior ao alcance também será interrompida.'}`; },
                submit: (values) => execute({ kind: 'cancel-recurrence', ruleId: rule.id, from: occurrence.date, position: occurrence.position,
                  scope: values.scope as 'this' | 'future' | 'pending' | 'rule', legalReleaseConfirmed: values.confirmed === 'yes' }, request) });
            }} />
          </View>)}
          {rule.kind === 'after-completion' ? <Action label={`Registrar execução de ${rule.title}`} onPress={() => { const request = id('execution'); open({ title: 'Data real de execução', fields: [{ key: 'date', label: 'Data da execução', value: todayText }], submit: (values) => execute({ kind: 'complete-recurrence', ruleId: rule.id, completedOn: date(values.date)! }, request) }); }} /> : null}
        </Card>;
      })}
    </> : null}
    {panel === 'budgets' ? <>
      <Action label="Novo orçamento mensal" onPress={() => { const request = id('budget'); open({ title: 'Orçamento mensal', note: 'Orçamento não cria pagamento. O gasto é comparado pela data da compra.', fields: [categoryField(), { key: 'month', label: 'Mês (AAAA-MM)', value: monthOf(today) }, { key: 'amount', label: 'Valor planejado' }],
        submit: (values) => execute({ kind: 'save-budget', budget: { id: request, categoryId: values.category, month: values.month as `${number}-${number}`, amountMinor: amount(values.amount, true), baselineMinor: amount(values.amount, true) } }, request) }); }} />
      {book.budgets.map((budget) => { const summary = budgetSummary(book, budget.id); return <Card key={budget.id} title={`${book.categories.find((entry) => entry.id === budget.categoryId)?.name} · ${budget.month}`}>
        <Text>Planejado {formatBrl(summary.plannedMinor)} · gasto {formatBrl(summary.spentMinor)}</Text>
        <Text>Diferença {formatBrl(summary.deviationMinor)}</Text>
        <Action label="Revisar orçamento" onPress={() => { const request = id('edit-budget'); open({ title: 'Revisar orçamento', fields: [{ key: 'amount', label: 'Novo orçamento', value: inputMoney(budget.amountMinor) }], submit: (values) => execute({ kind: 'save-budget', budget: { ...budget, amountMinor: amount(values.amount, true) } }, request) }); }} />
      </Card>; })}
    </> : null}
    {panel === 'inventory' ? <>
      <Action label="Novo item de estoque" onPress={() => { const request = id('item'); open({ title: 'Item de estoque', fields: [{ key: 'name', label: 'Nome do material' }, { key: 'unit', label: 'Unidade', value: 'un', choices: ['un', 'kg', 'g', 'L', 'mL', 'm'].map((value) => ({ value, label: value })) }], submit: (values) => execute({ kind: 'save-stock-item', item: { id: request, name: values.name.trim(), unit: values.unit as 'kg' | 'g' | 'un' | 'L' | 'mL' | 'm' } }, request) }); }} />
      {book.stockItems.map((item) => <Card key={item.id} title={item.name}>
        <Text>Disponível: {formatQuantity(stockPosition(book, item.id).quantity)} {item.unit}</Text>
        <Action label={`Registrar compra de ${item.name}`} onPress={() => { const request = id('stock-purchase'); const operationId = id('stock-operation'); open({ title: 'Compra e entrada em estoque', fields: [{ key: 'quantity', label: `Quantidade em ${item.unit}` }, ...operationFields()], submit: (values) => {
          const input = operationInput(values, operationId);
          execute({ kind: 'purchase-stock', operation: { ...input, direction: 'expense' }, lot: { id: request, itemId: item.id, operationId,
            quantity: quantity(values.quantity), costMinor: input.amountMinor, acquiredOn: input.occurredOn ?? today } }, request);
        } }); }} />
        <Action label={`Registrar consumo de ${item.name}`} onPress={() => { const request = id('stock-use'); open({ title: 'Consumo ou perda de material', note: 'Não gera outro pagamento. Informe os custos de produção separadamente.', fields: [{ key: 'quantity', label: `Quantidade consumida em ${item.unit}` }, { key: 'date', label: 'Data do consumo', value: todayText }, projectField(), { key: 'kind', label: 'Motivo', value: 'consumption', choices: [{ value: 'consumption', label: 'Consumo' }, { value: 'loss', label: 'Perda' }] }], submit: (values) => execute({ kind: 'consume-stock', id: request, itemId: item.id, quantity: quantity(values.quantity), occurredOn: date(values.date)!, projectId: values.project || null, loss: values.kind === 'loss' }, request) }); }} />
      </Card>)}
    </> : null}
    {panel === 'production' ? <>
      <Text style={ws.note}>Você informa o custo tido. O app não calcula custo por lote nem cria um novo pagamento por ele.</Text>
      <Action label="Informar custo de produção" testID="workspace-production-cost" onPress={() => costEditor()} />
      {book.projects.map((project) => { const report = productionSummary(book, project.id); return <Card key={project.id} title={project.name}>
        <Text>Vendas registradas {formatBrl(report.salesMinor)}</Text><Text>Custos informados {formatBrl(report.informedCostMinor)}</Text>
        {report.refundedSalesMinor > 0 ? <Text>Devoluções efetivadas {formatBrl(report.refundedSalesMinor)}</Text> : null}
        <Text>Resultado dos valores informados {formatBrl(report.grossResultMinor)}</Text>
        <Text style={ws.note}>Este resultado não garante dinheiro recebido. Não subtrai novamente compras de material já incluídas no custo informado.</Text>
      </Card>; })}
      {book.productionCosts.map((cost) => <Card key={cost.id} title={cost.title}><Text>{formatBrl(cost.amountMinor)} · {formatBrazilianDate(cost.occurredOn)}</Text><Action label={`Editar custo ${cost.title}`} onPress={() => costEditor(cost)} /></Card>)}
    </> : null}
    {panel === 'investments' ? <>
      <Card title="Patrimônio financeiro registrado"><Text>Caixa {formatBrl(position.cashMinor)} · investimentos {formatBrl(position.investmentMinor)}</Text>
        <Text>Obrigações {formatBrl(position.debtMinor)} · recebíveis de fatos registrados {formatBrl(position.receivableMinor)}</Text>
        <Text>Patrimônio líquido financeiro {formatBrl(position.netMinor)}</Text><Text style={ws.note}>Não soma reservas novamente. Não inclui avaliação de estoque ou ferramentas sem valor patrimonial informado.</Text>
      </Card>
      <Action label="Cadastrar ativo" onPress={() => { const request = id('asset'); open({ title: 'Ativo e avaliação manual', fields: [{ key: 'name', label: 'Nome do ativo' }, { key: 'price', label: 'Preço de mercado por unidade' }, { key: 'date', label: 'Data da avaliação', value: todayText }], submit: (values) => execute({ kind: 'save-asset', asset: { id: request, name: values.name.trim(), marketUnitPriceMinor: amount(values.price, true), valuedOn: date(values.date)! } }, request) }); }} />
      {book.assets.map((asset) => { const position = assetPosition(book, asset.id); return <Card key={asset.id} title={asset.name}>
        <Text>{formatQuantity(position.quantity)} unidades · custo {formatBrl(position.costMinor)}</Text>
        <Text>Mercado {formatBrl(position.marketMinor)} · resultado realizado {formatBrl(position.realizedGainMinor)}</Text>
        <Text style={ws.note}>Variação ainda não realizada {formatBrl(position.unrealizedGainMinor)} · avaliação {formatBrazilianDate(asset.valuedOn)}</Text>
        <Action label={`Registrar aporte ou resgate de ${asset.name}`} onPress={() => { const request = id('trade'); open({ title: 'Aporte ou resgate já realizado', fields: [{ key: 'kind', label: 'Movimentação', value: 'buy', choices: [{ value: 'buy', label: 'Aporte / compra' }, { value: 'sell', label: 'Resgate / venda' }] },
          { key: 'quantity', label: 'Quantidade de unidades' }, { key: 'amount', label: 'Valor total em dinheiro, com taxas' },
          { key: 'cost', label: 'Custo de aquisição baixado no resgate', value: '0,00', hint: 'Informe o custo da parte vendida. Não é o valor de venda.' }, accountField(), { key: 'date', label: 'Data efetiva do investimento', value: todayText }],
          submit: (values) => execute({ kind: 'trade', trade: { id: request, assetId: asset.id, kind: values.kind as 'buy' | 'sell', quantity: quantity(values.quantity), amountMinor: amount(values.amount),
            costBasisMinor: amount(values.cost, true), accountId: values.account, occurredOn: date(values.date)! } }, request) }); }} />
        <Action label={`Atualizar avaliação de ${asset.name}`} onPress={() => { const request = id('valuation'); open({ title: 'Avaliação manual', fields: [{ key: 'price', label: 'Novo preço por unidade', value: inputMoney(asset.marketUnitPriceMinor) }, { key: 'date', label: 'Data da avaliação', value: todayText }], submit: (values) => execute({ kind: 'save-asset', asset: { ...asset, marketUnitPriceMinor: amount(values.price, true), valuedOn: date(values.date)! } }, request) }); }} />
      </Card>; })}
      <Text style={ws.note}>Dividendos podem ser registrados como receitas previstas ou efetivamente recebidas em Compras e pagamentos, com suas datas. Não são confirmados automaticamente.</Text>
    </> : null}
    {panel === 'tools' ? <>
      {book.tools.length === 0 ? (
        <View style={ws.emptyTools} testID="workspace-tools-empty">
          <View style={ws.emptyToolsIcon}><Text style={ws.emptyToolsGlyph}>⚒</Text></View>
          <Text style={ws.emptyToolsTitle}>Acompanhe o custo por uso</Text>
          <Text style={ws.emptyToolsDescription}>Vincule a ferramenta à compra original e informe custos adicionais ou valor residual. Depois, registre os usos para calcular o custo por uso.</Text>
          <Text style={ws.emptyToolsNote}>O cadastro não gera outro pagamento. O custo por uso fica indefinido até registrar ao menos um uso.</Text>
          <Action label="Cadastrar ferramenta" onPress={openToolEditor} />
        </View>
      ) : <>
        <Text style={ws.note}>Vincule cada ferramenta à compra original. Registrar usos atualiza o custo por uso sem criar novos pagamentos.</Text>
        <Action label="Cadastrar ferramenta" onPress={openToolEditor} />
        {book.tools.map((tool) => <Card key={tool.id} title={tool.name}><Text>{tool.uses} usos · {toolCostPerUse(book, tool.id) === null ? 'Custo por uso ainda indefinido' : `${formatBrl(toolCostPerUse(book, tool.id)!)} por uso`}</Text>
          <Action label={`Registrar uso de ${tool.name}`} onPress={() => { const request = id('tool-use'); open({ title: 'Registrar usos', fields: [{ key: 'count', label: 'Quantidade de novos usos', value: '1' }], submit: (values) => execute({ kind: 'tool-use', toolId: tool.id, count: positiveInteger(values.count) }, request) }); }} />
        </Card>)}
      </>}
    </> : null}
    {panel === 'categories' ? <>
      <Text style={ws.note}>Categoria descreve o motivo do registro. Projeto identifica a atividade. São campos independentes.</Text>
      <Action label="Nova categoria" onPress={() => { const request = id('category'); open({ title: 'Categoria', fields: [{ key: 'name', label: 'Nome da categoria' }], submit: (values) => execute({ kind: 'save-category', category: { id: request, name: values.name.trim() } }, request) }); }} />
      {book.categories.map((category) => <Card key={category.id} title={category.name}><Action label={`Renomear ${category.name}`} onPress={() => { const request = id('rename-category'); open({ title: 'Editar categoria', fields: [{ key: 'name', label: 'Nome da categoria', value: category.name }], submit: (values) => execute({ kind: 'save-category', category: { ...category, name: values.name.trim() } }, request) }); }} /></Card>)}
    </> : null}
    {panel === 'audit' ? <>
      <Text style={ws.note}>Cada alteração conserva seus registros anteriores. O histórico é salvo no livro local protegido.</Text>
      {book.audit.slice().reverse().map((entry) => <Card key={entry.requestId} title={`Alteração registrada · ${entry.recordedAt}`}>
        <Text style={ws.note}>{entry.reason || 'Sem motivo adicional'} · {entry.changes.length} registros alterados</Text>
        {entry.changes.map((change) => <Text style={ws.note} key={`${change.table}:${change.id}`}>{historyLabels[change.table] ?? 'Registro'}: {historyValue(change.before)} → {historyValue(change.after)}</Text>)}
      </Card>)}
    </> : null}
    {panel === 'files' ? <>
      <Text style={ws.note}>CSV é um relatório sem cifra. Não contém o livro completo, as relações de parcelas ou a auditoria. Para recuperar tudo em outro aparelho, use o backup cifrado no modo local protegido.</Text>
      <Action label="Exportar relatório CSV sem cifra" onPress={() => open({ title: 'Confirmar exportação sem cifra', note: 'O arquivo pode revelar descrições e valores a quem tiver acesso a ele. Escolha conscientemente onde salvá-lo.',
        fields: [{ key: 'confirm', label: 'Exportar dados legíveis?', value: 'no', choices: [{ value: 'no', label: 'Não confirmado' }, { value: 'yes', label: 'Sim, exportar sem cifra' }] }], submit: async (values) => {
          if (values.confirm !== 'yes') throw new Error('Confirme a exportação sem cifra.');
          await (await import('../platform/reportFiles')).shareCsvFile(exportMovementsCsv(bookMovements(book, monthEnd(monthAtOffset(monthOf(today), 1)))));
        } })} />
      <Action label="Revisar CSV para importação" onPress={() => open({ title: 'Prévia de importação CSV', note: 'Cole o conteúdo no formato do relatório exportado. O arquivo não será executado.',
        fields: [{ key: 'csv', label: 'Conteúdo CSV', multiline: true, maxLength: 2 * 1024 * 1024 }], submitLabel: 'Validar e revisar', submit: (values) => setCsvPreview(previewMovementsCsv(values.csv, book, today)) })} />
      {Platform.OS === 'web' ? <Action label="Selecionar arquivo CSV" onPress={() => { void (async () => {
        try { const text = await (await import('../platform/reportFiles')).readCsvFile(); if (text !== null) setCsvPreview(previewMovementsCsv(text, book, today)); }
        catch (failure) { setNotice(failure instanceof Error ? failure.message : 'Não foi possível ler o CSV.'); }
      })(); }} /> : <Text style={ws.note}>No modo protegido, arquivos CSV também podem ser selecionados em Segurança e backup, com nova confirmação de senha.</Text>}
      {csvPreview ? <Card title={`Prévia: ${csvPreview.records.length} movimentos`}>
        <Text>{csvPreview.duplicateIds.length} identificadores já existem. Valores ou dias iguais não serão mesclados.</Text>
        {csvPreview.warnings.map((warning, index) => <Text key={index} style={ws.note}>{warning}</Text>)}
        {csvPreview.records.slice(0, 20).map((record) => <Text key={record.id}>{record.title} · {formatBrl(record.amountMinor)}</Text>)}
        <Action label="Confirmar importação revisada" onPress={() => { const request = id('import'); open({ title: 'Confirmar importação', fields: [
          { key: 'duplicates', label: 'Identificadores existentes', value: 'skip', choices: [{ value: 'skip', label: 'Ignorar os IDs já existentes' }, { value: 'new', label: 'São registros distintos: gerar novos IDs' }] },
          { key: 'confirm', label: 'Conferiu se esses gastos já estão registrados?', value: 'no', choices: [{ value: 'no', label: 'Ainda não conferi' }, { value: 'yes', label: 'Conferi e quero importar' }] }],
          submit: (values) => {
            if (values.confirm !== 'yes') throw new Error('Revise possíveis duplicidades antes de importar.');
            const duplicates = new Set(csvPreview.duplicateIds);
            const records = csvPreview.records.filter((record) => values.duplicates === 'new' || !duplicates.has(record.id))
              .map((record) => ({ ...record, id: duplicates.has(record.id) ? id('imported') : record.id }));
            execute({ kind: 'import-movements', movements: records }, request);
            setCsvPreview(null); setNotice(`${records.length} movimentos importados em uma única operação.`);
          } }); }} />
        <Action label="Descartar prévia" onPress={() => setCsvPreview(null)} />
      </Card> : null}
    </> : null}
    {panel === 'cash' ? <>
      <Text style={ws.note}>Projeção conservadora de fim do dia nos próximos 30 dias, com pendências e receitas confirmadas. Receitas ainda previstas ficam fora deste cenário. Sem horários conhecidos, entradas e saídas do mesmo dia são agregadas.</Text>
      {dailyCashForecast(book, today, addDays(today, 29), true).map((row) => <Card key={row.date} title={formatBrazilianDate(row.date)}>
        <Text>Caixa projetado {formatBrl(row.projectedCashMinor)}</Text><Text>Após reservas e margem {formatBrl(row.freeMinor)}</Text>
      </Card>)}
    </> : null}
    {selected ? <Modal visible={editor === null} transparent animationType="slide" onRequestClose={() => onSelectOperation(null)} testID="operation-details">
      <View style={ws.backdrop}><View style={ws.detailSheet}><ScrollView contentContainerStyle={ws.detailContent} keyboardShouldPersistTaps="handled">
        <Text style={ws.title}>{selected.title}</Text><Text>Total {formatBrl(selected.amountMinor)} · previsão-base {formatBrl(selected.baselineAmountMinor)}</Text>
        <Text style={ws.note}>{selected.occurredOn ? `Fato em ${formatBrazilianDate(selected.occurredOn)}` : 'Data do fato ainda não informada'}</Text>
        <Action label="Editar registro" onPress={() => openOperation(selected)} />
        {selected.nature === 'forecast' ? <Action label="Confirmar compra ou compromisso" onPress={() => { const request = id('confirm-operation'); open({ title: 'Confirmar previsão', note: 'A confirmação cria o compromisso, sem presumir pagamento. A previsão-base permanece no histórico.',
          fields: [{ key: 'amount', label: 'Total confirmado', value: inputMoney(selected.amountMinor) }, { key: 'date', label: 'Data do fato, se já aconteceu', value: selected.occurredOn ? formatBrazilianDate(selected.occurredOn) : '' }],
          submit: (values) => execute({ kind: 'confirm-operation', operationId: selected.id, amountMinor: amount(values.amount), occurredOn: date(values.date, false) }, request) }); }} /> : null}
        <Action label="Registrar reembolso ou devolução" onPress={() => refund(selected)} />
        <Action label="Cancelar ou dispensar pendências deste registro" onPress={() => waive(book.obligations.filter((entry) => entry.operationId === selected.id))} />
        {book.obligations.filter((entry) => entry.operationId === selected.id).map((obligation) => <Card key={obligation.id} title={`Parcela ${obligation.position}`}>
          <Text>{obligationStatus(book, obligation, today)}</Text>
          <Text>Vencimento original {formatBrazilianDate(obligation.dueOn)}</Text><Text>Previsão {formatBrazilianDate(obligation.plannedOn)}</Text>
          <Text>Liquidado {formatBrl(paidMinor(book, obligation.id))} · aberto {formatBrl(remainingMinor(book, obligation))}</Text>
          {remainingMinor(book, obligation) > 0 ? <>
            <Action label={`Registrar pagamento da parcela ${obligation.position}`} onPress={() => recordPayment(obligation)} />
            <Action label={`Reagendar parcela ${obligation.position}`} onPress={() => { const request = id('reschedule'); open({ title: 'Reagendar pagamento', note: 'O vencimento original será preservado.', fields: [{ key: 'date', label: 'Nova data prevista', value: formatBrazilianDate(obligation.plannedOn) }], submit: (values) => execute({ kind: 'reschedule', obligationId: obligation.id, plannedOn: date(values.date)! }, request) }); }} />
            <Action label={`Dispensar somente parcela ${obligation.position}`} onPress={() => waive([obligation])} />
          </> : null}
          {book.settlements.filter((entry) => entry.obligationId === obligation.id).map((payment) => <View key={payment.id} style={ws.part}>
            <Text>{formatBrl(payment.amountMinor)} em {formatBrazilianDate(payment.settledOn)}{payment.settledTime ? ` ${payment.settledTime}` : ''} · {payment.method === 'cash' ? 'dinheiro' : 'crédito no cartão'}</Text>
            {payment.method === 'cash' ? <Action label={`Corrigir pagamento de ${formatBrl(payment.amountMinor)}`} onPress={() => { const request = id('correct-payment'); open({ title: 'Corrigir erro no pagamento', note: 'Para dinheiro devolvido, registre reembolso. Correção é para erro de cadastro.', fields: [
              { key: 'amount', label: 'Valor correto', value: inputMoney(payment.amountMinor) }, { key: 'date', label: 'Data correta', value: formatBrazilianDate(payment.settledOn) }, { key: 'time', label: 'Hora efetiva, opcional', value: payment.settledTime ?? '' }, accountField('account', payment.accountId!), { key: 'reason', label: 'Motivo da correção' }],
              submit: (values) => execute({ kind: 'correct-settlement', settlement: { ...payment, amountMinor: amount(values.amount), settledOn: date(values.date)!, settledTime: values.time.trim() || null, accountId: values.account } }, request, values.reason) }); }} /> : null}
          </View>)}
        </Card>)}
        {book.refunds.filter((entry) => entry.operationId === selected.id).map((entry) => <Card key={entry.id} title={`Reembolso ${formatBrl(entry.amountMinor)}`}>
          <Text>{entry.status === 'received' ? 'Recebido' : entry.status === 'cancelled' ? 'Previsão retirada' : 'Pendente'} · {entry.destination === 'card' ? 'crédito no cartão' : 'dinheiro em conta'}</Text>
          {entry.status === 'pending' ? <Action label={`Confirmar recebimento de ${formatBrl(entry.amountMinor)}`} onPress={() => { const request = id('receive-refund'); open({ title: 'Confirmar valor recebido', fields: [{ key: 'date', label: 'Data do recebimento', value: todayText }], submit: (values) => execute({ kind: 'receive-refund', refundId: entry.id, receivedOn: date(values.date)! }, request) }); }} /> : null}
          {entry.status === 'pending' ? <Action label={`Retirar previsão de reembolso de ${formatBrl(entry.amountMinor)}`} onPress={() => { const request = id('cancel-refund'); open({ title: 'Retirar previsão de reembolso', note: 'O recebimento ainda não aconteceu. Retirar a previsão não movimenta dinheiro nem apaga a compra.', fields: [{ key: 'reason', label: 'Motivo, opcional' }], submit: (values) => execute({ kind: 'cancel-refund', refundId: entry.id }, request, values.reason) }); }} /> : null}
        </Card>)}
        <Action label="Fechar detalhes" testID="operation-details-close" onPress={() => onSelectOperation(null)} />
      </ScrollView></View></View>
    </Modal> : null}
    {editor ? <RecordEditor key={editor.id} definition={editor} onClose={() => setEditor(null)} /> : null}
  </>;
}

const ws = StyleSheet.create({
  title: { fontSize: 25, fontWeight: '900', color: '#1B2335', marginBottom: 5, letterSpacing: -0.5 }, note: { color: '#657087', fontSize: 13, lineHeight: 20, marginVertical: 5 },
  panelPicker: { minHeight: 54, borderRadius: 12, backgroundColor: '#EBEEFF', borderWidth: 1, borderColor: '#D8DEFF', paddingHorizontal: 13, paddingVertical: 8, marginTop: 7, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelPickerCopy: { gap: 2 }, panelPickerCaption: { color: '#657087', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  panelPickerValue: { color: '#1B2335', fontSize: 14, fontWeight: '800' }, panelPickerChevron: { color: '#334BD2', fontSize: 22, fontWeight: '700', paddingHorizontal: 4 },
  panelPickerBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 27, 49, 0.48)' }, panelPickerDismiss: { flex: 1 },
  panelPickerSheet: { maxHeight: '82%', backgroundColor: '#F3F5F9', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18 },
  panelPickerHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 3, backgroundColor: '#C8CEDA', marginBottom: 14 },
  panelPickerSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12 },
  panelPickerSheetTitle: { color: '#1B2335', fontSize: 20, fontWeight: '900', marginTop: 3 },
  panelPickerClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  panelPickerCloseText: { color: '#657087', fontSize: 23, lineHeight: 25 }, panelPickerList: { gap: 5, paddingBottom: 8 },
  panelPickerOption: { minHeight: 46, borderRadius: 11, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE2EC', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelPickerOptionSelected: { backgroundColor: '#FFF5C7', borderColor: '#F0D754' }, panelPickerOptionText: { color: '#47536C', fontSize: 13, fontWeight: '700' },
  panelPickerOptionTextSelected: { color: '#1B2335', fontWeight: '900' }, panelPickerCheck: { color: '#334BD2', fontSize: 16, fontWeight: '900' },
  emptyTools: { borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE2EC', padding: 17, marginTop: 7, gap: 9 },
  emptyToolsIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#FFF5C7', alignItems: 'center', justifyContent: 'center' },
  emptyToolsGlyph: { color: '#1B2335', fontSize: 25 }, emptyToolsTitle: { color: '#1B2335', fontSize: 17, fontWeight: '900', marginTop: 2 },
  emptyToolsDescription: { color: '#47536C', fontSize: 13, lineHeight: 19 }, emptyToolsNote: { color: '#657087', fontSize: 11, lineHeight: 16 },
  card: { borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE2EC', padding: 15, marginVertical: 7, gap: 7 }, cardTitle: { color: '#1B2335', fontSize: 17, fontWeight: '800' },
  action: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#EBEEFF', borderWidth: 1, borderColor: '#D8DEFF', marginVertical: 4 }, actionText: { color: '#334BD2', fontWeight: '800' },
  part: { borderTopWidth: 1, borderColor: '#DDE2EC', paddingTop: 10, marginTop: 5, gap: 5 },
  backdrop: { flex: 1, backgroundColor: 'rgba(17, 27, 49, 0.58)', justifyContent: 'flex-end' }, detailSheet: { maxHeight: '94%', backgroundColor: '#F3F5F9', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  detailContent: { padding: 20, paddingBottom: 40 },
});
