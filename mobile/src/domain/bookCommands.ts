import type { AuditChange, CommandContext, FinanceBook, FinanceCommand, OperationInput } from './book.ts';
import { accountBalance, assetPosition, invoiceSummary, operationPaidMinor, paidMinor, remainingMinor, stockPosition, sumMinor } from './bookSelectors.ts';
import { addMonths, expandRecurrence, validateRecurrence } from './recurrences.ts';
import { allocateMinor, integer } from './exact.ts';
import { monthAtOffset, monthOf, validateCivilDate, validateMovement, validateOptionalTime, type CivilDate } from './movements.ts';

export const BOOK_TABLES = ['movements', 'accounts', 'categories', 'projects', 'cards', 'preferences', 'operations', 'obligations',
  'settlements', 'refunds', 'transfers', 'reserves', 'plans', 'budgets', 'recurrenceRules',
  'recurrenceExceptions', 'stockItems', 'stockLots', 'stockUses', 'productionCosts', 'assets', 'trades', 'tools'] as const;

function required(value: string, label: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`Informe ${label}.`);
}
function nonnegative(value: number, label: string): void {
  integer(value, label);
  if (value < 0) throw new RangeError(`${label} não pode ser negativo.`);
}
function reference<T extends { id: string }>(records: T[], id: string, label: string): T {
  const record = records.find((entry) => entry.id === id);
  if (!record) throw new TypeError(`${label} inexistente.`);
  return record;
}
function put<T extends { id: string }>(records: T[], record: T): void {
  const index = records.findIndex((entry) => entry.id === record.id);
  if (index < 0) records.push(record); else records[index] = record;
}
function fresh<T extends { id: string }>(records: T[], record: T): void {
  required(record.id, 'identificador');
  if (records.some((entry) => entry.id === record.id)) throw new TypeError('Esse identificador já está em uso.');
  records.push(record);
}
function actualDate(date: CivilDate, context: CommandContext): void {
  validateCivilDate(date, 'Data efetiva');
  if (date > context.today) throw new RangeError('Um evento efetivo não pode estar no futuro.');
}
function operationReferences(book: FinanceBook, operation: { accountId: string; projectId: string | null; categoryId: string | null; cardId?: string | null }): void {
  const account = reference(book.accounts, operation.accountId, 'Conta');
  if (account.kind !== 'cash') throw new TypeError('Escolha uma conta de caixa para a liquidação.');
  if (operation.cardId && account.moneyType !== 'digital') throw new TypeError('Cartão exige uma conta digital para pagamento.');
  if (operation.projectId !== null) reference(book.projects, operation.projectId, 'Projeto');
  if (operation.categoryId !== null) reference(book.categories, operation.categoryId, 'Categoria');
  if (operation.cardId) reference(book.cards, operation.cardId, 'Cartão');
}

function createOperation(book: FinanceBook, input: OperationInput, context: CommandContext): void {
  required(input.title, 'descrição');
  integer(input.amountMinor, 'Valor', true);
  validateCivilDate(input.dueOn, 'Vencimento');
  operationReferences(book, input);
  validateOptionalTime(input.settledTime, input.initialPaidMinor ? input.settledOn ?? null : null);
  if (input.cardId && input.direction !== 'expense') throw new TypeError('Cartão de crédito é usado em compras.');
  const operation = {
    id: input.id, title: input.title, currency: 'BRL' as const, direction: input.direction,
    amountMinor: input.amountMinor, baselineAmountMinor: input.amountMinor, nature: input.nature,
    occurredOn: input.occurredOn, expectedOn: input.expectedOn, accountId: input.accountId,
    categoryId: input.categoryId, projectId: input.projectId, cardId: input.cardId,
    planId: null, recurrenceKey: null,
    occurredTime: input.occurredTime ?? null,
  };
  if (operation.occurredOn) actualDate(operation.occurredOn, context);
  fresh(book.operations, operation);
  const installments = allocateMinor(input.amountMinor, input.installmentCount);
  installments.forEach((amountMinor, index) => {
    const dueOn = addMonths(input.dueOn, index, input.shortMonthPolicy);
    if (!dueOn) throw new TypeError('Parcelamento precisa de todos os vencimentos. Escolha outra política para mês curto.');
    fresh(book.obligations, { id: `${input.id}:installment:${index + 1}`, operationId: input.id,
      position: index + 1, amountMinor, dueOn, plannedOn: dueOn, status: 'open' });
  });
  if (input.initialPaidMinor) {
    if (input.cardId) throw new TypeError('Registre o pagamento de cartão pela fatura.');
    integer(input.initialPaidMinor, 'Pagamento inicial', true);
    if (input.initialPaidMinor > input.amountMinor || !input.settledOn) throw new RangeError('Pagamento inicial inválido.');
    actualDate(input.settledOn, context);
    let remaining = input.initialPaidMinor;
    for (const obligation of book.obligations.filter((entry) => entry.operationId === input.id)) {
      const amountMinor = Math.min(remaining, obligation.amountMinor);
      if (amountMinor > 0) book.settlements.push({ id: `${input.id}:initial:${obligation.position}`,
        obligationId: obligation.id, amountMinor, accountId: input.accountId, settledOn: input.settledOn,
        method: 'cash', creditRefundId: null });
      if (amountMinor > 0) book.settlements.at(-1)!.settledTime = input.settledTime ?? null;
      remaining -= amountMinor;
    }
  }
}

function promote(book: FinanceBook, movementId: string, context: CommandContext): void {
  const movement = reference(book.movements, movementId, 'Movimentação');
  if (movement.flowKind && movement.flowKind !== 'external') throw new TypeError('Abra a operação de origem desse evento.');
  const account = movement.accountId ? reference(book.accounts, movement.accountId, 'Conta')
    : book.accounts.find((entry) => entry.kind === 'cash' && entry.moneyType === movement.moneyType);
  if (!account) throw new TypeError('Cadastre a conta dessa movimentação.');
  createOperation(book, {
    id: movement.id, title: movement.title, direction: movement.direction, amountMinor: movement.amountMinor,
    nature: movement.nature === 'forecast' ? 'forecast' : 'commitment', occurredOn: movement.occurredOn,
    expectedOn: movement.expectedOn, accountId: account.id, categoryId: movement.categoryId ?? null,
    projectId: movement.projectId, cardId: movement.cardId, dueOn: movement.plannedSettlementOn ?? movement.settledOn!,
    installmentCount: 1, shortMonthPolicy: 'last-day',
    initialPaidMinor: movement.nature === 'realized' ? movement.amountMinor : 0, settledOn: movement.settledOn,
    occurredTime: movement.occurredTime, settledTime: movement.settledTime,
  }, context);
  book.movements = book.movements.filter((entry) => entry.id !== movementId);
}

function validateSettlement(book: FinanceBook, settlement: FinanceBook['settlements'][number], context: CommandContext): void {
  integer(settlement.amountMinor, 'Valor pago', true);
  actualDate(settlement.settledOn, context);
  validateOptionalTime(settlement.settledTime, settlement.settledOn);
  const obligation = reference(book.obligations, settlement.obligationId, 'Obrigação');
  if (settlement.amountMinor > remainingMinor(book, obligation)) throw new RangeError('O pagamento excede o saldo em aberto.');
  if (settlement.method === 'cash') {
    if (!settlement.accountId || reference(book.accounts, settlement.accountId, 'Conta').kind !== 'cash' || settlement.creditRefundId) {
      throw new TypeError('Pagamento precisa de uma conta de caixa.');
    }
  } else {
    if (settlement.accountId || !settlement.creditRefundId) throw new TypeError('Crédito de cartão não é dinheiro em conta.');
    const refund = reference(book.refunds, settlement.creditRefundId, 'Crédito');
    const operation = reference(book.operations, obligation.operationId, 'Compra');
    const used = sumMinor(book.settlements.filter((entry) => entry.creditRefundId === refund.id).map((entry) => entry.amountMinor));
    if (refund.status !== 'received' || refund.receivedOn! > settlement.settledOn || refund.destination !== 'card' || refund.cardId !== operation.cardId
      || used + settlement.amountMinor > refund.amountMinor) throw new RangeError('Crédito de cartão insuficiente ou incompatível.');
  }
}

function validateStockHistory(book: FinanceBook, itemId: string): void {
  const events = book.stockUses.filter((entry) => entry.itemId === itemId)
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id));
  let consumed = 0;
  for (const event of events) {
    consumed = sumMinor([consumed, event.quantity]);
    const acquired = sumMinor(book.stockLots.filter((entry) => entry.itemId === itemId && entry.acquiredOn <= event.occurredOn).map((entry) => entry.quantity));
    if (consumed > acquired) throw new RangeError('Consumo excede o estoque disponível nessa data.');
  }
}

/** Validates all persisted relationships as well as aggregate financial invariants. */
export function validateBook(book: FinanceBook): void {
  if (!book || book.version !== 1) throw new TypeError('Versão de dados não suportada.');
  monthAtOffset(book.openingMonth, 0);
  nonnegative(book.cushionMinor, 'Margem');
  for (const table of BOOK_TABLES) {
    if (!Array.isArray(book[table])) throw new TypeError(`Tabela inválida: ${table}.`);
    const ids = new Set<string>();
    for (const entry of book[table]) {
      required(entry.id, 'identificador');
      if (ids.has(entry.id)) throw new TypeError(`Identificador duplicado em ${table}.`);
      ids.add(entry.id);
    }
  }
  if (!Array.isArray(book.baselineMovements) || !Array.isArray(book.audit) || !Array.isArray(book.requests)) throw new TypeError('Histórico inválido.');
  const requestIds = new Set<string>();
  for (const request of book.requests) {
    required(request.id, 'identificador da solicitação'); required(request.content, 'conteúdo da solicitação');
    if (requestIds.has(request.id)) throw new TypeError('Solicitação duplicada no histórico.');
    requestIds.add(request.id);
  }
  const auditIds = new Set<string>();
  for (const entry of book.audit) {
    if (!requestIds.has(entry.requestId) || auditIds.has(entry.requestId) || typeof entry.kind !== 'string'
      || typeof entry.reason !== 'string' || !Array.isArray(entry.changes)
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.recordedAt)
      || !Number.isFinite(Date.parse(entry.recordedAt)) || new Date(entry.recordedAt).toISOString() !== entry.recordedAt) throw new TypeError('Auditoria inválida.');
    auditIds.add(entry.requestId);
    for (const change of entry.changes) {
      if (![...BOOK_TABLES, 'settings'].includes(change.table as typeof BOOK_TABLES[number]) || typeof change.id !== 'string'
        || change.before === undefined || change.after === undefined) throw new TypeError('Revisão de auditoria inválida.');
    }
  }
  if (requestIds.size !== auditIds.size) throw new TypeError('Solicitações e auditoria não correspondem.');
  book.baselineMovements.forEach(validateMovement);
  for (const preference of book.preferences) {
    if (preference.id === 'safe-horizon') {
      if (!['next-income', '30-days', '90-days'].includes(preference.value)) throw new TypeError('Horizonte de previsão inválido.');
    } else if (preference.id === 'time-zone') {
      if (preference.value !== 'device') {
        try { new Intl.DateTimeFormat('pt-BR', { timeZone: preference.value }); } catch { throw new TypeError('Informe um fuso IANA válido ou device.'); }
      }
    } else throw new TypeError('Preferência não reconhecida.');
  }
  for (const movement of book.movements) {
    validateMovement(movement);
    if (movement.operationId || movement.obligationId || movement.displayOn) throw new TypeError('Eventos derivados não podem ser persistidos como novos movimentos simples.');
    if (movement.accountId) reference(book.accounts, movement.accountId, 'Conta da movimentação');
    if (movement.categoryId) reference(book.categories, movement.categoryId, 'Categoria');
    if (movement.projectId) reference(book.projects, movement.projectId, 'Projeto');
    if (movement.cardId) reference(book.cards, movement.cardId, 'Cartão');
  }
  for (const account of book.accounts) {
    required(account.name, 'nome da conta');
    validateCivilDate(account.openingOn, 'Abertura');
    integer(account.openingMinor, 'Saldo de abertura');
    if (account.currency !== 'BRL' || !['cash', 'investment'].includes(account.kind)
      || !['digital', 'physical'].includes(account.moneyType) || typeof account.eligible !== 'boolean') throw new TypeError('Conta inválida.');
    if (account.kind === 'investment' && account.eligible) throw new TypeError('Investimento não é caixa livre.');
    if (monthOf(account.openingOn) !== book.openingMonth || !account.openingOn.endsWith('-01')) throw new TypeError('Informe a abertura no início do livro.');
  }
  for (const record of [...book.categories, ...book.projects, ...book.cards, ...book.stockItems, ...book.assets, ...book.tools]) required(record.name, 'nome');
  for (const operation of book.operations) {
    required(operation.title, 'descrição');
    operationReferences(book, operation);
    integer(operation.amountMinor, 'Total', true); integer(operation.baselineAmountMinor, 'Previsão-base', true);
    if (operation.currency !== 'BRL' || !['forecast', 'commitment'].includes(operation.nature)
      || !['income', 'expense'].includes(operation.direction) || (operation.cardId && operation.direction !== 'expense')) throw new TypeError('Operação inválida.');
    for (const date of [operation.occurredOn, operation.expectedOn]) if (date !== null) validateCivilDate(date, 'Data da operação');
    validateOptionalTime(operation.occurredTime, operation.occurredOn);
    const obligations = book.obligations.filter((entry) => entry.operationId === operation.id);
    if (!obligations.length || sumMinor(obligations.map((entry) => entry.amountMinor)) !== operation.amountMinor) throw new RangeError('A soma das parcelas deve coincidir com o total.');
    if (operation.planId && reference(book.plans, operation.planId, 'Aquisição').convertedOperationId !== operation.id) throw new TypeError('Vínculo da aquisição inválido.');
  }
  const occurrenceKeys = book.operations.map((entry) => entry.recurrenceKey).filter(Boolean);
  if (new Set(occurrenceKeys).size !== occurrenceKeys.length) throw new TypeError('Ocorrência materializada em duplicidade.');
  for (const obligation of book.obligations) {
    reference(book.operations, obligation.operationId, 'Operação');
    integer(obligation.amountMinor, 'Parcela', true); integer(obligation.position, 'Posição', true);
    validateCivilDate(obligation.dueOn, 'Vencimento original'); validateCivilDate(obligation.plannedOn, 'Previsão de pagamento');
    if (!['open', 'waived', 'cancelled-forecast'].includes(obligation.status)) throw new TypeError('Estado de parcela inválido.');
    if (paidMinor(book, obligation.id) > obligation.amountMinor) throw new RangeError('Há pagamento maior que a obrigação.');
  }
  for (const payment of book.settlements) {
    reference(book.obligations, payment.obligationId, 'Obrigação'); integer(payment.amountMinor, 'Pagamento', true);
    validateCivilDate(payment.settledOn, 'Liquidação');
    validateOptionalTime(payment.settledTime, payment.settledOn);
    if (payment.method === 'cash') {
      if (!payment.accountId || reference(book.accounts, payment.accountId, 'Conta').kind !== 'cash' || payment.creditRefundId) throw new TypeError('Conta de pagamento inválida.');
    } else if (payment.method === 'card-credit') {
      if (!payment.creditRefundId || payment.accountId !== null) throw new TypeError('Aplicação de crédito inválida.');
      const refund = reference(book.refunds, payment.creditRefundId, 'Crédito');
      const operation = reference(book.operations, reference(book.obligations, payment.obligationId, 'Obrigação').operationId, 'Compra');
      if (refund.status !== 'received' || refund.receivedOn! > payment.settledOn || refund.destination !== 'card' || refund.cardId !== operation.cardId) throw new TypeError('Crédito incompatível com a compra ou ainda indisponível na data da liquidação.');
    } else throw new TypeError('Meio de liquidação inválido.');
  }
  for (const refund of book.refunds) {
    const operation = reference(book.operations, refund.operationId, 'Compra original');
    integer(refund.amountMinor, 'Reembolso', true); validateCivilDate(refund.plannedOn, 'Previsão de reembolso');
    if (!['pending', 'received', 'cancelled'].includes(refund.status)) throw new TypeError('Estado de reembolso inválido.');
    if ((refund.status === 'received') !== (refund.receivedOn !== null)) throw new TypeError('Reembolso recebido exige data efetiva.');
    if (refund.receivedOn) validateCivilDate(refund.receivedOn, 'Recebimento');
    if (refund.destination === 'account') {
      if (!refund.accountId || reference(book.accounts, refund.accountId, 'Conta').kind !== 'cash' || refund.cardId) throw new TypeError('Destino de reembolso inválido.');
    } else if (refund.destination === 'card') {
      if (!refund.cardId || refund.cardId !== operation.cardId || refund.accountId) throw new TypeError('Crédito deve pertencer ao cartão original.');
    } else throw new TypeError('Destino de reembolso inválido.');
    const eligible = operation.cardId ? operation.amountMinor : operationPaidMinor(book, operation.id);
    if (sumMinor(book.refunds.filter((entry) => entry.operationId === operation.id && entry.status !== 'cancelled').map((entry) => entry.amountMinor)) > eligible) throw new RangeError('Reembolso excede o valor elegível, incluindo os pendentes.');
    const used = sumMinor(book.settlements.filter((entry) => entry.creditRefundId === refund.id).map((entry) => entry.amountMinor));
    if (used > refund.amountMinor) throw new RangeError('Crédito utilizado em excesso.');
  }
  for (const transfer of book.transfers) {
    reference(book.accounts, transfer.fromAccountId, 'Conta de origem'); reference(book.accounts, transfer.toAccountId, 'Conta de destino');
    if (transfer.fromAccountId === transfer.toAccountId) throw new TypeError('Escolha contas diferentes.');
    integer(transfer.amountMinor, 'Transferência', true); validateCivilDate(transfer.occurredOn, 'Transferência');
  }
  for (const reserve of book.reserves) {
    required(reserve.name, 'nome da reserva'); nonnegative(reserve.amountMinor, 'Reserva');
    if (reference(book.accounts, reserve.accountId, 'Conta').kind !== 'cash') throw new TypeError('Reserva exige conta de caixa.');
  }
  for (const plan of book.plans) {
    required(plan.title, 'título da aquisição');
    if (plan.currency !== 'BRL') throw new TypeError('Moeda inválida.');
    for (const amount of [plan.estimatedMinor, plan.targetMinor]) if (amount !== null) integer(amount, 'Preço', true);
    if (plan.projectId) reference(book.projects, plan.projectId, 'Projeto');
    if (plan.convertedOperationId && reference(book.operations, plan.convertedOperationId, 'Compra').planId !== plan.id) throw new TypeError('Vínculo da compra inválido.');
  }
  const budgetKeys = new Set<string>();
  for (const budget of book.budgets) {
    reference(book.categories, budget.categoryId, 'Categoria'); monthAtOffset(budget.month, 0);
    nonnegative(budget.amountMinor, 'Orçamento'); nonnegative(budget.baselineMinor, 'Orçamento-base');
    const key = `${budget.month}:${budget.categoryId}`;
    if (budgetKeys.has(key)) throw new TypeError('Já existe orçamento para essa categoria e mês.');
    budgetKeys.add(key);
  }
  for (const rule of book.recurrenceRules) { validateRecurrence(rule); operationReferences(book, rule); }
  const exceptionKeys = new Set<string>();
  for (const exception of book.recurrenceExceptions) {
    const rule = reference(book.recurrenceRules, exception.ruleId, 'Série');
    integer(exception.position, 'Posição');
    const key = `${rule.id}:${exception.position}`;
    if (exception.position < 0 || exceptionKeys.has(key)) throw new TypeError('Exceção repetida ou inválida.');
    exceptionKeys.add(key);
    if (!['skip', 'override'].includes(exception.action) || (exception.action === 'skip' && rule.contractual)) throw new TypeError('Não é permitido ignorar dívida contratada.');
    if (exception.date) validateCivilDate(exception.date, 'Data excepcional');
    if (exception.amountMinor !== null) integer(exception.amountMinor, 'Valor excepcional', true);
    if (exception.title != null) required(exception.title, 'título excepcional');
  }
  for (const item of book.stockItems) {
    if (!['kg', 'g', 'un', 'L', 'mL', 'm'].includes(item.unit)) throw new TypeError('Escolha a unidade.');
    const position = stockPosition(book, item.id);
    if (position.quantity < 0) throw new RangeError('Estoque inconsistente.');
    validateStockHistory(book, item.id);
  }
  for (const lot of book.stockLots) {
    reference(book.stockItems, lot.itemId, 'Item'); const operation = reference(book.operations, lot.operationId, 'Compra');
    if (operation.direction !== 'expense') throw new TypeError('Entrada de estoque exige compra.');
    integer(lot.quantity, 'Quantidade', true); integer(lot.costMinor, 'Custo', true); validateCivilDate(lot.acquiredOn, 'Aquisição');
    if (sumMinor(book.stockLots.filter((entry) => entry.operationId === operation.id).map((entry) => entry.costMinor)) > operation.amountMinor) throw new RangeError('Custo dos itens excede o total da compra.');
  }
  for (const use of book.stockUses) {
    reference(book.stockItems, use.itemId, 'Item'); integer(use.quantity, 'Consumo', true); validateCivilDate(use.occurredOn, 'Consumo');
    if (use.projectId) reference(book.projects, use.projectId, 'Projeto');
    if (!['consumption', 'loss'].includes(use.kind)) throw new TypeError('Tipo de uso de estoque inválido.');
  }
  for (const cost of book.productionCosts) {
    required(cost.title, 'descrição do custo'); reference(book.projects, cost.projectId, 'Projeto');
    nonnegative(cost.amountMinor, 'Custo informado'); validateCivilDate(cost.occurredOn, 'Data do custo');
    if (cost.saleOperationId) {
      const sale = reference(book.operations, cost.saleOperationId, 'Venda');
      if (sale.direction !== 'income' || sale.projectId !== cost.projectId) throw new TypeError('Vincule uma venda desse projeto.');
    }
  }
  for (const asset of book.assets) { nonnegative(asset.marketUnitPriceMinor, 'Valor de mercado'); validateCivilDate(asset.valuedOn, 'Avaliação'); }
  for (const trade of book.trades) {
    reference(book.assets, trade.assetId, 'Ativo'); reference(book.accounts, trade.accountId, 'Conta');
    if (!['buy', 'sell'].includes(trade.kind)) throw new TypeError('Movimento de investimento inválido.');
    integer(trade.quantity, 'Quantidade', true); integer(trade.amountMinor, 'Valor', true); nonnegative(trade.costBasisMinor, 'Custo baixado'); validateCivilDate(trade.occurredOn, 'Investimento');
  }
  for (const asset of book.assets) {
    let quantity = 0; let cost = 0;
    for (const trade of book.trades.filter((entry) => entry.assetId === asset.id).sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === 'buy' ? -1 : 1))) {
      quantity = sumMinor([quantity, trade.kind === 'buy' ? trade.quantity : -trade.quantity]);
      cost = sumMinor([cost, trade.kind === 'buy' ? trade.amountMinor : -trade.costBasisMinor]);
      if (quantity < 0 || cost < 0 || (quantity === 0 && cost !== 0)) throw new RangeError('Venda de investimento antecede a posição disponível ou baixa de custo inconsistente.');
    }
    const position = assetPosition(book, asset.id);
    if (position.quantity < 0 || position.costMinor < 0 || (position.quantity === 0 && position.costMinor !== 0)) throw new RangeError('Posição de investimento inconsistente.');
  }
  for (const tool of book.tools) {
    const operation = reference(book.operations, tool.operationId, 'Compra da ferramenta');
    if (operation.direction !== 'expense') throw new TypeError('Ferramenta exige compra de origem.');
    nonnegative(tool.uses, 'Usos'); nonnegative(tool.attributedMinor, 'Despesas atribuídas'); nonnegative(tool.residualMinor, 'Valor residual');
    if (tool.residualMinor > sumMinor([operation.amountMinor, tool.attributedMinor])) throw new RangeError('Residual excede o custo da ferramenta.');
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Pure, atomic and idempotent command processing. No IO, device clock or banking API. */
export function applyFinanceCommand(book: FinanceBook, command: FinanceCommand, context: CommandContext): FinanceBook {
  required(context.requestId, 'identificador da solicitação'); validateCivilDate(context.today, 'Hoje');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(context.recordedAt)
    || !Number.isFinite(Date.parse(context.recordedAt)) || new Date(context.recordedAt).toISOString() !== context.recordedAt) throw new TypeError('Informe o instante UTC de registro.');
  const content = canonical({ command, context });
  const previous = book.requests.find((entry) => entry.id === context.requestId);
  if (previous) {
    if (previous.content !== content) throw new TypeError('Solicitação repetida com conteúdo diferente.');
    return book;
  }
  const next = JSON.parse(JSON.stringify(book)) as FinanceBook;
  switch (command.kind) {
    case 'import-movements': {
      if (!command.movements.length || command.movements.length > 10000) throw new RangeError('Selecione de 1 a 10.000 registros para importar.');
      for (const movement of command.movements) {
        validateMovement(movement);
        if (movement.nature === 'realized') actualDate(movement.settledOn!, context);
        if (movement.occurredOn) actualDate(movement.occurredOn, context);
        if (!movement.accountId || reference(next.accounts, movement.accountId, 'Conta').kind !== 'cash') throw new TypeError('Informe uma conta de caixa em cada registro.');
        if (next.operations.some((entry) => entry.id === movement.id)) throw new TypeError('Identificador pertence a uma operação existente.');
        fresh(next.movements, movement);
      }
      break;
    }
    case 'save-movement': {
      validateMovement(command.movement);
      if (command.movement.nature === 'realized') actualDate(command.movement.settledOn!, context);
      if (command.movement.occurredOn) actualDate(command.movement.occurredOn, context);
      if (next.operations.some((entry) => entry.id === command.movement.id)) throw new TypeError('Edite a operação de origem.');
      const account = command.movement.accountId ? reference(next.accounts, command.movement.accountId, 'Conta')
        : next.accounts.find((entry) => entry.kind === 'cash' && entry.moneyType === command.movement.moneyType);
      if (!account || account.kind !== 'cash' || account.moneyType !== command.movement.moneyType) throw new TypeError('Cadastre ou selecione uma conta de caixa compatível.');
      put(next.movements, { ...command.movement, accountId: account.id });
      break;
    }
    case 'save-account': {
      const previousAccount = next.accounts.find((entry) => entry.id === command.account.id);
      if (previousAccount && (previousAccount.kind !== command.account.kind || previousAccount.moneyType !== command.account.moneyType)) throw new TypeError('Tipo e meio de uma conta existente não podem ser reescritos.');
      put(next.accounts, command.account); break;
    }
    case 'save-category': put(next.categories, command.category); break;
    case 'save-project': put(next.projects, command.project); break;
    case 'save-card': put(next.cards, command.card); break;
    case 'create-operation': createOperation(next, command.operation, context); break;
    case 'edit-operation': {
      const operation = reference(next.operations, command.operationId, 'Operação');
      if (command.occurredOn) actualDate(command.occurredOn, context);
      Object.assign(operation, { title: command.title, categoryId: command.categoryId, projectId: command.projectId, occurredOn: command.occurredOn });
      break;
    }
    case 'revise-operation':
    case 'confirm-operation': {
      const operation = reference(next.operations, command.operationId, 'Operação');
      if (command.occurredOn) actualDate(command.occurredOn, context);
      const obligations = next.obligations.filter((entry) => entry.operationId === operation.id).sort((a, b) => a.position - b.position);
      const installments = allocateMinor(command.amountMinor, obligations.length);
      obligations.forEach((obligation, index) => {
        if (installments[index] < paidMinor(next, obligation.id)) throw new RangeError('O total revisado não pode ser inferior aos pagamentos históricos. Corrija o pagamento ou registre devolução.');
        obligation.amountMinor = installments[index];
      });
      if (command.kind === 'confirm-operation') Object.assign(operation, { amountMinor: command.amountMinor, occurredOn: command.occurredOn, nature: 'commitment' });
      else Object.assign(operation, { title: command.title, amountMinor: command.amountMinor, occurredOn: command.occurredOn,
        expectedOn: command.expectedOn, accountId: command.accountId, categoryId: command.categoryId, projectId: command.projectId });
      operation.occurredTime = command.occurredTime === undefined ? command.occurredOn ? operation.occurredTime ?? null : null : command.occurredTime;
      break;
    }
    case 'correct-settlement': {
      if (!context.reason?.trim()) throw new TypeError('Informe o motivo da correção do pagamento.');
      const original = reference(next.settlements, command.settlement.id, 'Pagamento');
      if (original.obligationId !== command.settlement.obligationId || original.method !== command.settlement.method) throw new TypeError('O vínculo e o meio do pagamento não podem ser reescritos.');
      next.settlements = next.settlements.filter((entry) => entry.id !== original.id);
      validateSettlement(next, command.settlement, context); next.settlements.push(command.settlement); break;
    }
    case 'promote-movement': promote(next, command.movementId, context); break;
    case 'settle': validateSettlement(next, command.settlement, context); fresh(next.settlements, command.settlement); break;
    case 'reschedule': reference(next.obligations, command.obligationId, 'Obrigação').plannedOn = command.plannedOn; break;
    case 'waive': {
      if (!command.obligationIds.length || new Set(command.obligationIds).size !== command.obligationIds.length) throw new TypeError('Selecione obrigações distintas.');
      for (const id of command.obligationIds) {
        const obligation = reference(next.obligations, id, 'Obrigação');
        const operation = reference(next.operations, obligation.operationId, 'Operação');
        if (remainingMinor(next, obligation) <= 0) continue;
        if (operation.nature === 'commitment' && !command.legalReleaseConfirmed) throw new TypeError('Confirme que a obrigação foi efetivamente dispensada.');
        obligation.status = operation.nature === 'commitment' ? 'waived' : 'cancelled-forecast';
      }
      break;
    }
    case 'request-refund': {
      if (command.refund.status === 'received') actualDate(command.refund.receivedOn!, context);
      fresh(next.refunds, command.refund); break;
    }
    case 'receive-refund': {
      const refund = reference(next.refunds, command.refundId, 'Reembolso');
      if (refund.status !== 'pending') throw new TypeError('O reembolso já foi recebido.');
      actualDate(command.receivedOn, context); refund.status = 'received'; refund.receivedOn = command.receivedOn; break;
    }
    case 'cancel-refund': {
      const refund = reference(next.refunds, command.refundId, 'Reembolso');
      if (refund.status !== 'pending') throw new TypeError('Somente a previsão de reembolso pendente pode ser retirada. Um recebimento real não pode ser apagado.');
      refund.status = 'cancelled'; break;
    }
    case 'pay-invoice': {
      monthAtOffset(command.month, 0); actualDate(command.settledOn, context);
      nonnegative(command.amountMinor, 'Pagamento'); reference(next.accounts, command.accountId, 'Conta');
      const invoice = invoiceSummary(next, command.cardId, command.month, command.settledOn);
      if (command.amountMinor > invoice.payableMinor) throw new RangeError('Pagamento maior que a fatura após créditos.');
      let cash = command.amountMinor;
      const credits = next.refunds.filter((entry) => entry.cardId === command.cardId && entry.status === 'received'
        && entry.receivedOn! <= command.settledOn && entry.destination === 'card');
      for (const obligation of invoice.obligations.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id))) {
        for (const credit of credits) {
          const available = sumMinor([credit.amountMinor, -sumMinor(next.settlements.filter((entry) => entry.creditRefundId === credit.id).map((entry) => entry.amountMinor))]);
          const amountMinor = Math.min(remainingMinor(next, obligation), available);
          if (amountMinor > 0) next.settlements.push({ id: `${context.requestId}:credit:${credit.id}:${obligation.id}`,
            obligationId: obligation.id, amountMinor, accountId: null, settledOn: command.settledOn, method: 'card-credit', creditRefundId: credit.id });
        }
        const amountMinor = Math.min(cash, remainingMinor(next, obligation));
        if (amountMinor > 0) next.settlements.push({ id: `${context.requestId}:cash:${obligation.id}`, obligationId: obligation.id,
          amountMinor, accountId: command.accountId, settledOn: command.settledOn, method: 'cash', creditRefundId: null });
        cash -= amountMinor;
      }
      if (command.amountMinor === 0 && invoice.creditMinor === 0) throw new RangeError('Informe um pagamento ou crédito disponível.');
      break;
    }
    case 'transfer': actualDate(command.transfer.occurredOn, context); fresh(next.transfers, command.transfer); break;
    case 'save-reserve': {
      const other = sumMinor(next.reserves.filter((entry) => entry.accountId === command.reserve.accountId && entry.id !== command.reserve.id).map((entry) => entry.amountMinor));
      const previousReserve = next.reserves.find((entry) => entry.id === command.reserve.id && entry.accountId === command.reserve.accountId);
      const previousTotal = sumMinor([other, previousReserve?.amountMinor ?? 0]);
      const nextTotal = sumMinor([other, command.reserve.amountMinor]);
      if (nextTotal > previousTotal && nextTotal > Math.max(0, accountBalance(next, command.reserve.accountId, context.today))) throw new RangeError('Reserva maior que o saldo disponível nessa conta.');
      put(next.reserves, command.reserve); break;
    }
    case 'save-plan': {
      const previousPlan = next.plans.find((entry) => entry.id === command.plan.id);
      if (previousPlan?.convertedOperationId && previousPlan.convertedOperationId !== command.plan.convertedOperationId) throw new TypeError('Vínculo da aquisição não pode ser removido.');
      put(next.plans, command.plan); break;
    }
    case 'convert-plan': {
      const plan = reference(next.plans, command.planId, 'Aquisição');
      if (plan.convertedOperationId) throw new TypeError('Essa aquisição já foi convertida.');
      createOperation(next, command.operation, context);
      plan.convertedOperationId = command.operation.id;
      reference(next.operations, command.operation.id, 'Compra').planId = plan.id;
      break;
    }
    case 'save-budget': {
      const original = next.budgets.find((entry) => entry.id === command.budget.id);
      put(next.budgets, { ...command.budget, baselineMinor: original?.baselineMinor ?? command.budget.amountMinor }); break;
    }
    case 'save-recurrence': {
      const original = next.recurrenceRules.find((entry) => entry.id === command.rule.id);
      if (original && canonical({ ...original, version: 0 }) !== canonical({ ...command.rule, version: 0 })) throw new TypeError('Altere ocorrências por exceção ou encerre a regra e crie a próxima versão.');
      put(next.recurrenceRules, command.rule); break;
    }
    case 'revise-recurrence': {
      const rule = reference(next.recurrenceRules, command.ruleId, 'Série');
      integer(command.fromPosition, 'Posição'); integer(command.amountMinor, 'Valor', true); required(command.title, 'título');
      if (command.fromPosition < 0) throw new RangeError('Posição inválida.');
      rule.revisions ??= [];
      rule.revisions = [...rule.revisions.filter((entry) => entry.fromPosition !== command.fromPosition), { fromPosition: command.fromPosition, amountMinor: command.amountMinor, title: command.title }];
      rule.version += 1;
      for (const operation of next.operations.filter((entry) => entry.recurrenceKey?.startsWith(`${rule.id}:`)
        && Number(entry.recurrenceKey.split(':').at(-1)) >= command.fromPosition)) {
        if (operationPaidMinor(next, operation.id) > 0) continue;
        operation.title = command.title; operation.amountMinor = command.amountMinor;
        const obligations = next.obligations.filter((entry) => entry.operationId === operation.id);
        const parts = allocateMinor(command.amountMinor, obligations.length);
        obligations.forEach((entry, index) => { entry.amountMinor = parts[index]; });
      }
      break;
    }
    case 'recurrence-exception': {
      const key = `${command.exception.ruleId}:${command.exception.position}`;
      if (next.operations.some((entry) => entry.recurrenceKey === key && operationPaidMinor(next, entry.id) > 0)) throw new TypeError('Ocorrência com pagamento histórico não pode ser reescrita pela série.');
      const rule = reference(next.recurrenceRules, command.exception.ruleId, 'Série');
      if (command.exception.action === 'skip' && rule.contractual) throw new TypeError('Não é permitido ignorar dívida contratada.');
      put(next.recurrenceExceptions, command.exception);
      for (const operation of next.operations.filter((entry) => entry.recurrenceKey === key)) {
        if (command.exception.title) operation.title = command.exception.title;
        const obligations = next.obligations.filter((entry) => entry.operationId === operation.id);
        if (command.exception.action === 'skip') obligations.forEach((entry) => { entry.status = 'cancelled-forecast'; });
        else {
          if (command.exception.amountMinor !== null) {
            operation.amountMinor = command.exception.amountMinor;
            const parts = allocateMinor(operation.amountMinor, obligations.length);
            obligations.forEach((entry, index) => { entry.amountMinor = parts[index]; });
          }
          if (command.exception.date) {
            operation.expectedOn = command.exception.date;
            obligations.forEach((entry) => { entry.plannedOn = command.exception.date!; });
          }
        }
      }
      break;
    }
    case 'materialize-occurrence': {
      const rule = reference(next.recurrenceRules, command.ruleId, 'Série');
      const occurrence = expandRecurrence(rule, next.recurrenceExceptions, rule.anchorOn, command.through).find((entry) => entry.position === command.position);
      if (!occurrence) throw new TypeError('Ocorrência fora da janela ou encerrada.');
      if (next.operations.some((entry) => entry.recurrenceKey === occurrence.key)) break;
      createOperation(next, { id: `occurrence:${occurrence.key}`, title: occurrence.title, direction: rule.direction,
        amountMinor: occurrence.amountMinor, nature: rule.contractual ? 'commitment' : 'forecast', occurredOn: null,
        expectedOn: occurrence.date, accountId: rule.accountId, projectId: rule.projectId, categoryId: rule.categoryId,
        cardId: null, dueOn: occurrence.date, installmentCount: 1, shortMonthPolicy: rule.shortMonthPolicy }, context);
      reference(next.operations, `occurrence:${occurrence.key}`, 'Ocorrência').recurrenceKey = occurrence.key;
      break;
    }
    case 'cancel-recurrence': {
      const rule = reference(next.recurrenceRules, command.ruleId, 'Série');
      validateCivilDate(command.from, 'Início do alcance');
      if (!['this', 'future', 'pending', 'rule'].includes(command.scope)) throw new TypeError('Escolha o alcance.');
      if (rule.contractual && !command.legalReleaseConfirmed) throw new TypeError('Confirme a dispensa real das obrigações.');
      const selected = next.operations.filter((entry) => entry.recurrenceKey?.startsWith(`${rule.id}:`)
        && (command.scope === 'rule' || command.scope === 'pending' || (command.scope === 'this'
          ? entry.recurrenceKey === `${rule.id}:${command.position}` : Number(entry.recurrenceKey.split(':').at(-1)) >= command.position)));
      for (const operation of selected) for (const obligation of next.obligations.filter((entry) => entry.operationId === operation.id)) {
        if (remainingMinor(next, obligation) > 0) obligation.status = rule.contractual ? 'waived' : 'cancelled-forecast';
      }
      if (command.scope === 'this') {
        if (rule.contractual) {
          // A dispensed contracted occurrence is persisted, so regeneration cannot recreate it.
          const occurrence = expandRecurrence(rule, next.recurrenceExceptions, rule.anchorOn, command.from).find((entry) => entry.position === command.position);
          if (occurrence && !selected.length) {
            createOperation(next, { id: `occurrence:${occurrence.key}`, title: occurrence.title, direction: rule.direction, amountMinor: occurrence.amountMinor,
              nature: 'commitment', occurredOn: null, expectedOn: occurrence.date, accountId: rule.accountId, projectId: rule.projectId,
              categoryId: rule.categoryId, cardId: null, dueOn: occurrence.date, installmentCount: 1, shortMonthPolicy: rule.shortMonthPolicy }, context);
            reference(next.operations, `occurrence:${occurrence.key}`, 'Ocorrência').recurrenceKey = occurrence.key;
            reference(next.obligations, `occurrence:${occurrence.key}:installment:1`, 'Obrigação').status = 'waived';
          }
        } else put(next.recurrenceExceptions, { id: `${rule.id}:exception:${command.position}`, ruleId: rule.id,
          position: command.position, action: 'skip', date: null, amountMinor: null });
      } else {
        const stop = command.scope === 'rule' || command.scope === 'pending' ? rule.anchorOn : command.from;
        rule.canceledFrom = rule.canceledFrom && rule.canceledFrom < stop ? rule.canceledFrom : stop;
        rule.version += 1;
      }
      break;
    }
    case 'complete-recurrence': {
      const rule = reference(next.recurrenceRules, command.ruleId, 'Série');
      if (rule.kind !== 'after-completion') throw new TypeError('Essa série não depende de execução.');
      actualDate(command.completedOn, context); rule.lastCompletedOn = command.completedOn; rule.version += 1; rule.completedCount += 1; break;
    }
    case 'save-stock-item': {
      const original = next.stockItems.find((entry) => entry.id === command.item.id);
      if (original && next.stockLots.some((entry) => entry.itemId === original.id)
        && original.unit !== command.item.unit) throw new TypeError('Não altere a unidade de um estoque movimentado.');
      put(next.stockItems, command.item); break;
    }
    case 'purchase-stock': {
      actualDate(command.lot.acquiredOn, context);
      if (command.operation.id !== command.lot.operationId) throw new TypeError('Lote deve apontar para a compra criada.');
      createOperation(next, command.operation, context); fresh(next.stockLots, command.lot); break;
    }
    case 'consume-stock': {
      actualDate(command.occurredOn, context); integer(command.quantity, 'Quantidade', true);
      fresh(next.stockUses, { id: command.id, itemId: command.itemId, quantity: command.quantity,
        occurredOn: command.occurredOn, projectId: command.projectId, kind: command.loss ? 'loss' : 'consumption' });
      break;
    }
    case 'save-production-cost': actualDate(command.cost.occurredOn, context); put(next.productionCosts, command.cost); break;
    case 'save-asset': actualDate(command.asset.valuedOn, context); put(next.assets, command.asset); break;
    case 'trade': {
      actualDate(command.trade.occurredOn, context);
      const position = assetPosition(next, command.trade.assetId);
      if (command.trade.kind === 'sell' && (command.trade.quantity > position.quantity || command.trade.costBasisMinor > position.costMinor
        || (command.trade.quantity === position.quantity && command.trade.costBasisMinor !== position.costMinor))) throw new RangeError('Resgate excede posição ou baixa de custo informada.');
      if (command.trade.kind === 'buy' && command.trade.costBasisMinor !== 0) throw new TypeError('Aporte não baixa custo anterior.');
      fresh(next.trades, command.trade); break;
    }
    case 'save-tool': put(next.tools, command.tool); break;
    case 'tool-use': {
      integer(command.count, 'Usos adicionais', true); const tool = reference(next.tools, command.toolId, 'Ferramenta'); tool.uses = sumMinor([tool.uses, command.count]); break;
    }
    case 'set-cushion': next.cushionMinor = command.amountMinor; break;
    case 'set-preferences':
      put(next.preferences, { id: 'time-zone', value: command.timeZone });
      put(next.preferences, { id: 'safe-horizon', value: command.horizon });
      break;
    default: throw new TypeError('Comando não reconhecido.');
  }
  validateBook(next);
  const changes: AuditChange[] = BOOK_TABLES.flatMap((table) => {
    const before = new Map<string, unknown>(book[table].map((entry) => [entry.id, entry]));
    const after = new Map<string, unknown>(next[table].map((entry) => [entry.id, entry]));
    return [...new Set([...before.keys(), ...after.keys()])].filter((id) => canonical(before.get(id) ?? null) !== canonical(after.get(id) ?? null))
      .map((id) => ({ table, id, before: before.get(id) ?? null, after: after.get(id) ?? null }));
  });
  if (book.cushionMinor !== next.cushionMinor) changes.push({ table: 'settings', id: 'cushion', before: book.cushionMinor, after: next.cushionMinor });
  next.audit.push({ requestId: context.requestId, recordedAt: context.recordedAt, kind: command.kind, reason: context.reason ?? '', changes });
  next.requests.push({ id: context.requestId, content });
  return next;
}
