import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  createDemoBook,
  type Project,
} from './src/demo/demoData';
import { formatBrazilianDate, parseBrazilianDate } from './src/domain/dates';
import { brlInputFromMinor, formatBrl, parseBrlToMinor } from './src/domain/money';
import {
  listMovementsForMonth,
  displayDateOf,
  displayTimeOf,
  monthAtOffset,
  monthOf,
  currentCashByType,
  estimateSafeToSpend,
  summarizeProjectFlow,
  summarizeMonth,
  type Movement,
  type MovementDirection,
  type MovementMoneyType,
  type MovementNature,
  type ProjectFlowSummary,
  type SafeSpendEstimate,
  type SafeSpendScenario,
  type YearMonth,
} from './src/domain/movements';
import { deviceToday } from './src/platform/deviceDate';
import { openingCashForMonth, projectCashMonths } from './src/domain/projections';
import { FinanceStore } from './src/application/financeStore';
import { bookMovements, bookOpeningCash, eligibleMovements, monthEnd, protectedMinor, financialPosition, eligibleOpeningBalance, forecastHorizon, bookTimeZone, historicalMonthSummary } from './src/domain/bookSelectors';
import type { Account, Category, CommandContext, CreditCard, FinanceBook, FinanceCommand } from './src/domain/book';
import { FinanceWorkspace } from './src/ui/FinanceWorkspace';

type Screen = 'home' | 'movements' | 'views' | 'workspace';
type PortfolioView = 'cards' | 'projects' | 'money';
type NatureFilter = 'all' | MovementNature;
type DirectionFilter = 'all' | MovementDirection;
type SortOrder = 'newest' | 'oldest';

const COLORS = {
  background: '#F4F3ED',
  card: '#FFFFFF',
  ink: '#182A24',
  muted: '#718078',
  line: '#E5E8E1',
  green: '#214B3D',
  greenSoft: '#E7F0E9',
  lime: '#D8F27A',
  red: '#A63838',
};

function monthLabel(month: YearMonth): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthNumber - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function natureLabel(nature: MovementNature): string {
  if (nature === 'realized') return 'Realizado';
  if (nature === 'commitment') return 'Compromisso';
  return 'Previsão';
}

function movementLabel(id: string | null, options: readonly { id: string; name: string }[]): string | null {
  return id === null ? null : options.find((option) => option.id === id)?.name ?? 'Etiqueta de teste';
}

function moneyTypeLabel(moneyType: MovementMoneyType): string {
  return moneyType === 'digital' ? 'Digital' : 'Físico';
}

function movementPaymentLabel(movement: Movement, cards: readonly CreditCard[]): string {
  if (movement.cardId !== null) {
    return `Crédito · ${movementLabel(movement.cardId, cards) ?? 'Cartão'}`;
  }
  if (movement.direction === 'expense' && movement.moneyType === 'digital') return 'Débito';
  return moneyTypeLabel(movement.moneyType);
}

function MovementRow({ movement, projects, cards, onPress }: { movement: Movement; projects: readonly Project[]; cards: readonly CreditCard[]; onPress?: () => void }) {
  const displayDate = displayDateOf(movement);
  const displayTime = displayTimeOf(movement);
  const cashDate = movement.settledOn ?? movement.plannedSettlementOn;
  const amount = movement.direction === 'expense'
    ? -movement.amountMinor
    : movement.amountMinor;
  const isForecast = movement.nature !== 'realized';

  const content = (
    <View style={styles.movementRow}>
      <View style={styles.movementIcon}>
        <Text style={styles.movementIconText}>{movement.direction === 'income' ? '↗' : '↘'}</Text>
      </View>
      <View style={styles.movementCopy}>
        <Text style={styles.movementTitle} numberOfLines={1}>{movement.title}</Text>
        <Text style={styles.movementMeta}>
          {natureLabel(movement.nature)} · {displayDate ? formatBrazilianDate(displayDate) : 'sem data'}
          {displayTime ? ` ${displayTime}` : null}
        </Text>
        {cashDate && displayDate && (cashDate !== displayDate || (movement.settledTime && movement.settledTime !== displayTime)) ? (
          <Text style={styles.movementMeta}>
            Caixa {isForecast ? 'previsto' : 'efetivo'}: {formatBrazilianDate(cashDate)}
            {movement.settledTime ? ` ${movement.settledTime}` : null}
          </Text>
        ) : null}
        <Text style={styles.movementMeta}>
          {[
            movementPaymentLabel(movement, cards),
            movementLabel(movement.projectId, projects) ? `Projeto: ${movementLabel(movement.projectId, projects)}` : null,
          ].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={[styles.movementAmount, amount < 0 && styles.expenseAmount]}>
        {amount > 0 ? '+' : '−'}{formatBrl(Math.abs(amount))}
      </Text>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Editar ${movement.title}, ${natureLabel(movement.nature)}`}
      testID={`movement-row-${movement.id}`}
    >
      {content}
    </Pressable>
  );
}

function ProjectFlowOverview({ projectId, summary }: { projectId: string; summary: ProjectFlowSummary }) {
  const rows = [
    { key: 'realized', label: 'Realizado', flow: summary.realized },
    { key: 'commitment', label: 'Compromissos', flow: summary.commitment },
    { key: 'forecast', label: 'Previsões', flow: summary.forecast },
  ];

  return (
    <View style={styles.projectFlowSummary} testID={`project-flow-${projectId}`}>
      <Text style={styles.projectFlowHeading}>Fluxo de caixa acumulado</Text>
      {rows.map(({ key, label, flow }) => (
        <View key={key} style={styles.projectFlowLine} testID={`project-flow-${key}-${projectId}`}>
          <View style={styles.projectFlowCopy}>
            <Text style={styles.projectFlowLabel}>{label}</Text>
            <Text style={styles.projectFlowDetail}>
              Entradas {formatBrl(flow.inflowMinor)} · Saídas {formatBrl(flow.outflowMinor)}
            </Text>
          </View>
          <Text
            style={[styles.projectFlowNet, flow.netMinor < 0 && styles.projectFlowNegative]}
            testID={`project-flow-net-${key}-${projectId}`}
          >
            {formatBrl(flow.netMinor)}
          </Text>
        </View>
      ))}
      <View style={styles.projectFlowTotal}>
        <Text style={styles.projectFlowTotalLabel}>Saldo projetado acumulado</Text>
        <Text
          style={[styles.projectFlowTotalValue, summary.projectedNetMinor < 0 && styles.projectFlowNegative]}
          testID={`project-flow-net-projected-${projectId}`}
        >
          {formatBrl(summary.projectedNetMinor)}
        </Text>
      </View>
    </View>
  );
}

function MonthCard({
  summary,
  subtitle,
}: {
  summary: ReturnType<typeof summarizeMonth>;
  subtitle: string;
}) {
  const balanceIsNegative = summary.closingBalanceMinor < 0;

  return (
    <View style={styles.monthCard}>
      <View style={styles.monthCardHeader}>
        <View>
          <Text style={styles.monthTitle}>{monthLabel(summary.month)}</Text>
          <Text style={styles.monthSubtitle}>{subtitle}</Text>
        </View>
        <View style={styles.monthIcon}><Text style={styles.monthIconText}>↗</Text></View>
      </View>

      <Text style={styles.balanceCaption}>Saldo previsto no fechamento</Text>
      <Text
        testID={`closing-balance-${summary.month}`}
        style={[styles.balanceValue, balanceIsNegative && styles.negativeBalance]}
      >
        {formatBrl(summary.closingBalanceMinor)}
      </Text>

      <View style={styles.summaryDivider} />
      <View style={styles.summaryGrid}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Entradas</Text>
          <Text style={styles.summaryValue}>{formatBrl(summary.inflowMinor)}</Text>
          <Text style={styles.summaryBreakdown} testID={`realized-inflow-${summary.month}`}>Realizadas {formatBrl(summary.realizedInflowMinor)}</Text>
          <Text style={styles.summaryBreakdown} testID={`committed-inflow-${summary.month}`}>Compromissos {formatBrl(summary.committedInflowMinor)}</Text>
          <Text style={styles.summaryBreakdown} testID={`forecast-inflow-${summary.month}`}>Previsões {formatBrl(summary.forecastInflowMinor)}</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Saídas</Text>
          <Text style={styles.summaryValue}>−{formatBrl(summary.outflowMinor)}</Text>
          <Text style={styles.summaryBreakdown} testID={`realized-outflow-${summary.month}`}>Realizadas {formatBrl(summary.realizedOutflowMinor)}</Text>
          <Text style={styles.summaryBreakdown} testID={`committed-outflow-${summary.month}`}>Compromissos {formatBrl(summary.committedOutflowMinor)}</Text>
          <Text style={styles.summaryBreakdown} testID={`forecast-outflow-${summary.month}`}>Previsões {formatBrl(summary.forecastOutflowMinor)}</Text>
        </View>
      </View>

      <View style={styles.lowestBalance}>
        <Text style={styles.lowestIcon}>⌁</Text>
        <Text style={styles.lowestText}>
          Menor saldo: <Text style={styles.lowestStrong}>{formatBrl(summary.lowestBalanceMinor)}</Text>
          {' · '}{formatBrazilianDate(summary.lowestBalanceOn)}
          {summary.lowestBalanceTime ? ` ${summary.lowestBalanceTime}` : null}
        </Text>
      </View>
      {summary.lowestBalanceMinor < 0 ? (
        <Text style={styles.negativeNote}>A projeção fica negativa em parte do mês.</Text>
      ) : null}
    </View>
  );
}

function DemoBanner() {
  return (
    <View style={styles.demoBanner} accessibilityRole="summary">
      <View style={styles.demoDot} />
      <Text style={styles.demoBannerText}>TESTE · dados fictícios, só na memória</Text>
    </View>
  );
}

function SafeSpendCard({
  estimate,
  onScenarioChange,
  demo = true,
}: {
  estimate: SafeSpendEstimate | null;
  onScenarioChange: (scenario: SafeSpendScenario) => void;
  demo?: boolean;
}) {
  if (!estimate) {
    return (
      <View style={styles.safeSpendCard} testID="safe-spend-unavailable">
        <Text style={styles.safeSpendEyebrow}>ESTIMATIVA DE DEMONSTRAÇÃO</Text>
        <Text style={styles.safeSpendUnavailableTitle}>Sem entrada futura para definir o horizonte</Text>
        <Text style={styles.safeSpendFootnote}>Adicione uma entrada prevista fictícia para experimentar o indicador.</Text>
      </View>
    );
  }

  return (
    <View style={styles.safeSpendCard} accessibilityRole="summary">
      <Text style={styles.safeSpendEyebrow}>GASTO SEGURO · ESTIMATIVA</Text>
      <Text style={styles.safeSpendHorizon}>Até {formatBrazilianDate(estimate.horizonDate)}</Text>
      <Text
        testID="safe-spend-amount"
        style={[styles.safeSpendAmount, estimate.spendableMinor < 0 && styles.safeSpendNegative]}
      >
        {formatBrl(estimate.spendableMinor)}
      </Text>
      <View style={styles.safeScenarioRow}>
        <FilterChip
          label="Conservador"
          selected={estimate.scenario === 'conservative'}
          testID="safe-scenario-conservative"
          onPress={() => onScenarioChange('conservative')}
        />
        <FilterChip
          label="Esperado"
          selected={estimate.scenario === 'expected'}
          testID="safe-scenario-expected"
          onPress={() => onScenarioChange('expected')}
        />
      </View>
      <Text style={styles.safeSpendDetails}>
        Caixa de teste: {formatBrl(estimate.currentCashMinor)} · menor saldo projetado: {formatBrl(estimate.lowestProjectedBalanceMinor)} em {formatBrazilianDate(estimate.lowestBalanceOn)}
      </Text>
      {estimate.firstInsufficientOn !== null ? (
        <Text style={styles.safeSpendWarning} accessibilityRole="alert">
          Atenção: a projeção fica abaixo da reserva e da margem em {formatBrazilianDate(estimate.firstInsufficientOn)}.
        </Text>
      ) : null}
      <Text style={styles.safeSpendFootnote}>
        {demo ? 'Caixa e reserva são fictícios. ' : 'Baseada nos registros informados. '}Exclui {formatBrl(estimate.protectedMinor)} protegidos e margem de {formatBrl(estimate.cushionMinor)}.
        {estimate.scenario === 'conservative' ? ' Ignora receitas previstas incertas.' : ' Inclui receitas previstas.'}
      </Text>
    </View>
  );
}

export default function App({ store: suppliedStore, protectedSession = false, onSettings }: {
  store?: FinanceStore; protectedSession?: boolean; onSettings?: () => void;
} = {}) {
  const [screen, setScreen] = useState<Screen>('home');
  const [portfolioView, setPortfolioView] = useState<PortfolioView>('cards');
  const [monthOffset, setMonthOffset] = useState(0);
  const [natureFilter, setNatureFilter] = useState<NatureFilter>('all');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [searchText, setSearchText] = useState('');
  const [safeSpendScenario, setSafeSpendScenario] = useState<SafeSpendScenario>('conservative');
  const [formOpen, setFormOpen] = useState(false);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const nextTestId = useRef(1);
  const nextProjectId = useRef(1);
  const [ledger] = useState(() => {
    const initialToday = deviceToday();
    const month = monthOf(initialToday);
    return { store: suppliedStore ?? new FinanceStore(createDemoBook(month, initialToday)) };
  });
  const [book, setBook] = useState<FinanceBook>(() => ledger.store.snapshot());
  const projects = book.projects;
  const nextRequestId = useRef(book.audit.length + 1);
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const pendingSave = useRef<{ requestId: string; recordedAt: string; movementId: string } | null>(null);

  const today = deviceToday(bookTimeZone(book));
  const currentMonth = monthOf(today);
  const followingMonth = monthAtOffset(currentMonth, 1);
  const selectedMonth = monthAtOffset(currentMonth, monthOffset);
  const projectionThrough = selectedMonth > followingMonth ? selectedMonth : followingMonth;
  const movements = useMemo(() => bookMovements(book, monthEnd(projectionThrough)), [book, projectionThrough]);
  const opening = useMemo(() => ({ month: book.openingMonth, cash: bookOpeningCash(book) }), [book]);
  const monthSummaries = useMemo(
    () => projectCashMonths(movements, book.baselineMovements, opening, today, projectionThrough),
    [movements, book, opening, today, projectionThrough],
  );
  const currentSummary = monthSummaries[0];
  const followingSummary = monthSummaries[1];
  const openingCash = useMemo(
    () => openingCashForMonth(movements, book.baselineMovements, opening, currentMonth),
    [movements, book, opening, currentMonth],
  );
  const currentCash = useMemo(
    () => currentCashByType(movements, currentMonth, today, openingCash),
    [movements, currentMonth, today, openingCash],
  );
  const safeMovements = useMemo(() => eligibleMovements(book, movements), [book, movements]);
  const safeOpening = useMemo(() => eligibleOpeningBalance(book, movements, currentMonth), [book, currentMonth, movements]);
  const investmentBalance = useMemo(() => financialPosition(book, today).investmentMinor, [book, today]);
  const nextIncomeDate = useMemo(() => forecastHorizon(book, safeMovements, today), [book, safeMovements, today]);
  const safeSpendEstimate = useMemo(() => nextIncomeDate === null ? null : estimateSafeToSpend(safeMovements, {
    asOf: today,
    horizonDate: nextIncomeDate,
    openingBalanceMinor: safeOpening,
    protectedMinor: protectedMinor(book, true),
    cushionMinor: book.cushionMinor,
    scenario: safeSpendScenario,
  }), [safeMovements, nextIncomeDate, safeSpendScenario, today, book, safeOpening]);
  const selectedSummary = monthSummaries.find((summary) => summary.month === selectedMonth)
    ?? (selectedMonth < currentMonth ? historicalMonthSummary(book, selectedMonth) : null);
  const visibleMovements = listMovementsForMonth(movements, selectedMonth);
  const filteredMovements = useMemo(() => {
    const normalizedSearch = searchText.trim().toLocaleLowerCase('pt-BR');
    const filtered = visibleMovements.filter((movement) => {
      const matchesNature = natureFilter === 'all' || movement.nature === natureFilter;
      const matchesDirection = directionFilter === 'all' || movement.direction === directionFilter;
      const matchesSearch = normalizedSearch.length === 0
        || movement.title.toLocaleLowerCase('pt-BR').includes(normalizedSearch);
      return matchesNature && matchesDirection && matchesSearch;
    });

    if (sortOrder === 'oldest') filtered.reverse();
    return filtered;
  }, [directionFilter, natureFilter, searchText, sortOrder, visibleMovements]);
  const filtersAreActive = natureFilter !== 'all'
    || directionFilter !== 'all'
    || searchText.trim().length > 0
    || sortOrder !== 'newest';

  const openNewMovement = () => {
    pendingSave.current = null;
    setEditingMovement(null);
    setFormOpen(true);
  };

  const openEditMovement = (movement: Movement) => {
    if (movement.operationId) { setSelectedOperationId(movement.operationId); setScreen('workspace'); return; }
    if (movement.recurrenceKey || movement.flowKind === 'transfer' || movement.flowKind === 'investment') { setScreen('workspace'); return; }
    pendingSave.current = null;
    setEditingMovement(movement);
    setFormOpen(true);
  };

  const saveMovement = (input: {
    title: string;
    direction: MovementDirection;
    moneyType: MovementMoneyType;
    amountMinor: number;
    nature: MovementNature;
    cardId: string | null;
    projectId: string | null;
    accountId: string | undefined;
    categoryId: string | null;
    occurredTime: string | null;
    settledTime: string | null;
    eventDate: Movement['occurredOn'];
    cashDate: NonNullable<Movement['settledOn']>;
  }) => {
    const newMovementId = () => {
      let candidate: string;
      do { candidate = `test-${nextTestId.current++}`; } while (book.movements.some((entry) => entry.id === candidate) || book.operations.some((entry) => entry.id === candidate));
      return candidate;
    };
    pendingSave.current ??= {
      requestId: `save-${Date.now()}-${nextRequestId.current++}`,
      recordedAt: new Date().toISOString(),
      movementId: editingMovement?.id ?? newMovementId(),
    };
    const isRealized = input.nature === 'realized';
    const nextMovement: Movement = {
      id: pendingSave.current.movementId,
      title: input.title,
      currency: 'BRL',
      direction: input.direction,
      moneyType: input.moneyType,
      amountMinor: input.amountMinor,
      nature: input.nature,
      cardId: input.cardId,
      projectId: input.projectId,
      accountId: input.accountId,
      categoryId: input.categoryId,
      occurredTime: isRealized || editingMovement?.occurredOn ? input.occurredTime : null,
      settledTime: isRealized ? input.settledTime : null,
      occurredOn: isRealized || editingMovement?.occurredOn ? input.eventDate : null,
      expectedOn: isRealized || editingMovement?.occurredOn
        ? editingMovement?.expectedOn ?? null
        : input.eventDate,
      plannedSettlementOn: isRealized ? null : input.cashDate,
      settledOn: isRealized ? input.cashDate : null,
    };

    ledger.store.save({
      requestId: pendingSave.current.requestId,
      recordedAt: pendingSave.current.recordedAt,
      today,
      movement: nextMovement,
    });
    setBook(ledger.store.snapshot());
    setEditingMovement(null);
    setFormOpen(false);
    setScreen('movements');
    setMonthOffset(0);
    setNatureFilter('all');
    setDirectionFilter('all');
    setSortOrder('newest');
    setSearchText('');
  };

  const saveProject = (name: string, description: string) => {
    let projectId: string;
    do { projectId = `test-project-${nextProjectId.current++}`; } while (book.projects.some((entry) => entry.id === projectId));
    const project: Project = {
      id: projectId,
      name,
      description,
    };
    ledger.store.execute({ kind: 'save-project', project }, { requestId: `project-${Date.now()}-${nextRequestId.current++}`, recordedAt: new Date().toISOString(), today });
    setBook(ledger.store.snapshot());
    setPortfolioView('projects');
    setScreen('views');
    setProjectFormOpen(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.appShell}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.brand}>myFinance</Text>
            <Text style={styles.brandSub}>FINANÇAS DO SEU JEITO</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Adicionar movimentação de teste"
            testID="add-movement-button"
            onPress={openNewMovement}
            style={styles.addButton}
          >
            <Text style={styles.addButtonText}>＋</Text>
          </Pressable>
        </View>

        {protectedSession ? <View style={styles.demoBanner}><Text style={styles.demoBannerText}>REGISTROS LOCAIS · banco cifrado</Text><Pressable accessibilityRole="button" onPress={onSettings}><Text>Segurança e backup</Text></Pressable></View> : <DemoBanner />}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {screen === 'home' && !book.accounts.some((account) => account.kind === 'cash') ? (
            <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Seu livro está vazio</Text><Text style={styles.emptyText}>Cadastre uma conta e informe o saldo de abertura para começar. Nenhum saldo bancário foi presumido.</Text><Pressable accessibilityRole="button" onPress={() => setScreen('workspace')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Organizar contas</Text></Pressable></View>
          ) : screen === 'home' ? (
            <>
              <Text style={styles.eyebrow}>VISÃO GERAL</Text>
              <Text style={styles.pageTitle}>Seu dinheiro, mês a mês.</Text>
              <Text style={styles.pageLead}>
                Veja o que já aconteceu e o que ainda está previsto.
              </Text>

              <SafeSpendCard estimate={safeSpendEstimate} demo={!protectedSession} onScenarioChange={setSafeSpendScenario} />
              <MonthCard summary={currentSummary} subtitle="Mês atual · inclui previsões" />
              <MonthCard summary={followingSummary} subtitle="Próximo mês · projeção" />

              <SectionHeader title="Movimentações deste mês" action="Ver todas" onPress={() => setScreen('movements')} />
              <View style={styles.listCard}>
                {listMovementsForMonth(movements, currentMonth).slice(0, 4).map((movement) => (
                  <MovementRow key={movement.id} movement={movement} projects={projects} cards={book.cards} onPress={() => openEditMovement(movement)} />
                ))}
              </View>

              <Pressable style={styles.primaryButton} onPress={openNewMovement} accessibilityRole="button" accessibilityLabel="Registrar movimentação de teste">
                <Text style={styles.primaryButtonText}>＋  Registrar movimentação de teste</Text>
              </Pressable>
            </>
          ) : screen === 'movements' ? (
            <>
              <Text style={styles.eyebrow}>SEU CAIXA</Text>
              <Text style={styles.pageTitle}>Movimentações</Text>
              <Text style={styles.pageLead}>Fatos, compromissos e previsões em ordem de data.</Text>

              <View style={styles.monthNavigation}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mostrar mês anterior"
                  testID="show-previous-month-button"
                  onPress={() => setMonthOffset((offset) => offset - 1)}
                  style={styles.monthNavigationButton}
                >
                  <Text style={styles.monthNavigationArrow}>‹</Text>
                </Pressable>
                <Text style={styles.monthNavigationLabel} testID="selected-month-label">{monthLabel(selectedMonth)}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mostrar próximo mês após o selecionado"
                  testID="show-following-month-button"
                  onPress={() => setMonthOffset((offset) => offset + 1)}
                  style={styles.monthNavigationButton}
                >
                  <Text style={styles.monthNavigationArrow}>›</Text>
                </Pressable>
              </View>

              <View style={styles.monthQuickPicker}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mostrar mês atual"
                  testID="show-current-month-button"
                  onPress={() => setMonthOffset(0)}
                  style={[styles.monthPickerItem, monthOffset === 0 && styles.monthPickerItemActive]}
                >
                  <Text style={[styles.monthPickerText, monthOffset === 0 && styles.monthPickerTextActive]}>Mês atual</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mostrar próximo mês"
                  testID="show-next-month-button"
                  onPress={() => setMonthOffset(1)}
                  style={[styles.monthPickerItem, monthOffset === 1 && styles.monthPickerItemActive]}
                >
                  <Text style={[styles.monthPickerText, monthOffset === 1 && styles.monthPickerTextActive]}>Próximo</Text>
                </Pressable>
              </View>

              {selectedSummary ? (
                <View style={styles.compactBalance}>
                  <Text style={styles.compactBalanceLabel}>{selectedMonth < currentMonth ? 'Fechamento registrado · somente liquidações' : 'Saldo previsto no fechamento'}</Text>
                  <Text
                    testID={`movement-closing-balance-${selectedMonth}`}
                    style={[styles.compactBalanceValue, selectedSummary.closingBalanceMinor < 0 && styles.negativeBalance]}
                  >
                    {formatBrl(selectedSummary.closingBalanceMinor)}
                  </Text>
                  <View style={styles.compactBreakdown}>
                    <Text style={styles.compactBalanceFoot}>Abertura {formatBrl(selectedSummary.openingBalanceMinor)}</Text>
                    <Text style={styles.compactBalanceFoot} testID={`movement-summary-inflow-${selectedMonth}`}>
                      Entradas: realizadas {formatBrl(selectedSummary.realizedInflowMinor)} · compromissos {formatBrl(selectedSummary.committedInflowMinor)} · previsões {formatBrl(selectedSummary.forecastInflowMinor)}
                    </Text>
                    <Text style={styles.compactBalanceFoot} testID={`movement-summary-outflow-${selectedMonth}`}>
                      Saídas: realizadas {formatBrl(selectedSummary.realizedOutflowMinor)} · compromissos {formatBrl(selectedSummary.committedOutflowMinor)} · previsões {formatBrl(selectedSummary.forecastOutflowMinor)}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.emptyCard} testID="historical-balance-unavailable">
                  <Text style={styles.emptyTitle}>Saldo histórico indisponível</Text>
                  <Text style={styles.emptyText}>
                    Esta amostra não tem saldo de abertura para {monthLabel(selectedMonth)}. Correções retroativas atualizam o caixa atual e as projeções, mas não permitem reconstruir um saldo histórico desconhecido.
                  </Text>
                </View>
              )}

              <View style={styles.movementFilters}>
                <Text style={styles.filterLabel}>Situação</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
                  <FilterChip label="Todas" selected={natureFilter === 'all'} testID="filter-nature-all" onPress={() => setNatureFilter('all')} />
                  <FilterChip label="Realizado" selected={natureFilter === 'realized'} testID="filter-nature-realized" onPress={() => setNatureFilter('realized')} />
                  <FilterChip label="Compromisso" selected={natureFilter === 'commitment'} testID="filter-nature-commitment" onPress={() => setNatureFilter('commitment')} />
                  <FilterChip label="Previsão" selected={natureFilter === 'forecast'} testID="filter-nature-forecast" onPress={() => setNatureFilter('forecast')} />
                </ScrollView>

                <Text style={styles.filterLabel}>Tipo de movimento</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
                  <FilterChip label="Entradas e saídas" selected={directionFilter === 'all'} testID="filter-direction-all" onPress={() => setDirectionFilter('all')} />
                  <FilterChip label="Entradas" selected={directionFilter === 'income'} testID="filter-direction-income" onPress={() => setDirectionFilter('income')} />
                  <FilterChip label="Saídas" selected={directionFilter === 'expense'} testID="filter-direction-expense" onPress={() => setDirectionFilter('expense')} />
                </ScrollView>

                <View style={styles.searchAndSort}>
                  <TextInput
                    accessibilityLabel="Buscar movimentações"
                    testID="movement-search-input"
                    value={searchText}
                    onChangeText={setSearchText}
                    placeholder="Buscar descrição"
                    placeholderTextColor="#8C9891"
                    autoCapitalize="none"
                    style={[styles.input, styles.searchInput]}
                    maxLength={80}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Alternar ordem cronológica"
                    testID="movement-sort-button"
                    onPress={() => setSortOrder((order) => order === 'newest' ? 'oldest' : 'newest')}
                    style={styles.sortButton}
                  >
                    <Text style={styles.sortButtonText}>{sortOrder === 'newest' ? 'Recentes ↓' : 'Antigas ↑'}</Text>
                  </Pressable>
                </View>
                {filtersAreActive ? (
                  <Pressable
                    accessibilityRole="button"
                    testID="reset-movement-filters-button"
                    onPress={() => {
                      setNatureFilter('all');
                      setDirectionFilter('all');
                      setSearchText('');
                      setSortOrder('newest');
                    }}
                    style={styles.resetFiltersButton}
                  >
                    <Text style={styles.resetFiltersText}>Restaurar padrão</Text>
                  </Pressable>
                ) : null}
              </View>

              <SectionHeader
                title={`${filteredMovements.length} movimentações`}
                action="＋ Nova"
                onPress={openNewMovement}
              />
              {filteredMovements.length > 0 ? (
                <View style={styles.listCard}>
                  {filteredMovements.map((movement) => (
                    <MovementRow key={movement.id} movement={movement} projects={projects} cards={book.cards} onPress={() => openEditMovement(movement)} />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>{visibleMovements.length === 0 ? 'Nada por aqui ainda' : 'Nenhum resultado'}</Text>
                  <Text style={styles.emptyText}>
                    {visibleMovements.length === 0
                      ? 'Adicione um lançamento fictício para experimentar o fluxo.'
                      : 'Ajuste a busca ou os filtros para ver outras movimentações.'}
                  </Text>
                </View>
              )}
              {filteredMovements.length > 0 ? (
                <Text style={styles.editHint}>Toque em uma linha para editar o lançamento de teste.</Text>
              ) : null}
              <Pressable style={styles.primaryButton} onPress={openNewMovement} accessibilityRole="button" accessibilityLabel="Registrar movimentação de teste">
                <Text style={styles.primaryButtonText}>＋  Registrar movimentação de teste</Text>
              </Pressable>
            </>
          ) : screen === 'workspace' ? (
            <FinanceWorkspace book={book} today={today} selectedOperationId={selectedOperationId} onSelectOperation={setSelectedOperationId}
              persistent={protectedSession}
              onCommand={(command: FinanceCommand, context: CommandContext) => { ledger.store.execute(command, context); setBook(ledger.store.snapshot()); }} />
          ) : (
            <>
              <Text style={styles.eyebrow}>SUAS VISÕES</Text>
              <Text style={styles.pageTitle}>Cartões, projetos e dinheiro.</Text>
              <Text style={styles.pageLead}>Organize os mesmos lançamentos por contexto.{protectedSession ? ' Os valores vêm dos seus registros.' : ' Tudo abaixo usa dados fictícios.'}</Text>

              <View style={styles.portfolioTabs}>
                <FilterChip label="Cartões" selected={portfolioView === 'cards'} testID="view-cards" onPress={() => setPortfolioView('cards')} />
                <FilterChip label="Projetos" selected={portfolioView === 'projects'} testID="view-projects" onPress={() => setPortfolioView('projects')} />
                <FilterChip label="Dinheiro" selected={portfolioView === 'money'} testID="view-money" onPress={() => setPortfolioView('money')} />
              </View>

              {portfolioView === 'cards' ? (
                <>
                  <View style={styles.portfolioCard}>
                    <Text style={styles.sectionTitle}>Cartões de crédito</Text>
                    <Text style={styles.portfolioDescription}>Compras previstas e a data em que o caixa seria afetado.</Text>
                    {book.cards.map((card) => {
                      const cardMovements = movements.filter((movement) => movement.cardId === card.id);
                      return (
                        <View key={card.id} style={styles.portfolioGroup}>
                          <Text style={styles.portfolioGroupTitle}>{card.name}</Text>
                          {cardMovements.length ? (
                            <View style={styles.listCard}>
                              {cardMovements.map((movement) => (
                                <MovementRow key={movement.id} movement={movement} projects={projects} cards={book.cards} onPress={() => openEditMovement(movement)} />
                              ))}
                            </View>
                          ) : (
                            <Text style={styles.portfolioDescription}>Nenhuma compra de teste marcada neste cartão.</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                  <Text style={styles.portfolioFootnote}>Registre faturas, parcelas, pagamentos e créditos na aba Organizar. Compra e pagamento não duplicam o efeito de caixa.</Text>
                </>
              ) : null}

              {portfolioView === 'projects' ? (
                <>
                  <Text style={styles.sectionTitle}>Seus projetos</Text>
                  <Text style={styles.portfolioDescription}>
                    Crie projetos com nome e descrição. Depois, selecione um ao registrar ou editar uma entrada ou saída. A classificação organiza os lançamentos sem criar outro fluxo de caixa.
                  </Text>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => setProjectFormOpen(true)}
                    accessibilityRole="button"
                    testID="create-project-button"
                  >
                    <Text style={styles.primaryButtonText}>＋  Criar projeto</Text>
                  </Pressable>
                  {projects.map((project) => {
                    const projectMovements = movements
                      .filter((movement) => movement.projectId === project.id)
                      .slice()
                      .sort((a, b) => (displayDateOf(b) ?? '').localeCompare(displayDateOf(a) ?? ''));
                    const projectFlow = summarizeProjectFlow(movements, project.id);
                    return (
                      <View key={project.id} style={styles.portfolioCard} testID={`project-card-${project.id}`}>
                        <Text style={styles.portfolioGroupTitle}>{project.name}</Text>
                        <Text style={styles.portfolioDescription} testID={`project-description-${project.id}`}>{project.description}</Text>
                        <ProjectFlowOverview projectId={project.id} summary={projectFlow} />
                        {projectMovements.length ? (
                          <View style={styles.listCard}>
                            {projectMovements.map((movement) => (
                              <MovementRow key={movement.id} movement={movement} projects={projects} cards={book.cards} onPress={() => openEditMovement(movement)} />
                            ))}
                          </View>
                        ) : (
                          <Text style={styles.portfolioDescription}>Nenhum lançamento vinculado.</Text>
                        )}
                      </View>
                    );
                  })}
                  <Text style={styles.portfolioFootnote}>Este resumo mostra fluxo de caixa. Custos de produção informados manualmente e resultados das vendas ficam em Organizar, separados dos pagamentos.</Text>
                </>
              ) : null}

              {portfolioView === 'money' ? (
                <>
                  <View style={styles.moneyCard} testID="money-type-digital">
                    <Text style={styles.moneyTypeTitle}>Dinheiro digital</Text>
                    <Text style={styles.moneyTypeValue}>{formatBrl(currentCash.digital)}</Text>
                    <Text style={styles.portfolioDescription}>Saldo de demonstração em conta digital/bancária.</Text>
                    <Text style={styles.portfolioFootnote}>A reserva de {formatBrl(protectedMinor(book))} já está dentro do caixa e não é somada de novo.</Text>
                  </View>
                  <View style={styles.moneyCard} testID="money-type-physical">
                    <Text style={styles.moneyTypeTitle}>Dinheiro físico</Text>
                    <Text style={styles.moneyTypeValue}>{formatBrl(currentCash.physical)}</Text>
                    <Text style={styles.portfolioDescription}>Saldo de demonstração em espécie.</Text>
                  </View>
                  <View style={styles.moneyCard} testID="money-type-investments">
                    <Text style={styles.moneyTypeTitle}>Investimentos</Text>
                    <Text style={styles.moneyTypeValue}>{formatBrl(investmentBalance)}</Text>
                    <Text style={styles.portfolioDescription}>Patrimônio ilustrativo, separado do caixa e do gasto seguro.</Text>
                  </View>
                  <Text style={styles.portfolioFootnote}>Registre aportes, resgates e avaliações em Organizar. Investimentos ficam separados do caixa disponível e valorização não é dinheiro recebido.</Text>
                </>
              ) : null}
            </>
          )}
        </ScrollView>

        <View style={styles.bottomBar}>
          <TabButton label="Início" glyph="⌂" active={screen === 'home'} onPress={() => setScreen('home')} />
          <TabButton label="Movimentações" glyph="≋" active={screen === 'movements'} onPress={() => setScreen('movements')} />
          <TabButton label="Visões" glyph="▦" active={screen === 'views'} onPress={() => setScreen('views')} />
          <TabButton label="Organizar" glyph="☷" active={screen === 'workspace'} onPress={() => setScreen('workspace')} />
        </View>
      </View>

      <MovementForm
        visible={formOpen}
        today={today}
        movement={editingMovement}
        projects={projects}
        accounts={book.accounts}
        categories={book.categories}
        cards={book.cards}
        isDemo={!protectedSession}
        onActions={editingMovement ? () => {
          const movementId = editingMovement.id;
          ledger.store.execute({ kind: 'promote-movement', movementId }, { requestId: `promote-${Date.now()}-${nextRequestId.current++}`, recordedAt: new Date().toISOString(), today });
          setBook(ledger.store.snapshot()); setFormOpen(false); setEditingMovement(null); setSelectedOperationId(movementId); setScreen('workspace');
        } : undefined}
        onClose={() => {
          setFormOpen(false);
          setEditingMovement(null);
        }}
        onSave={saveMovement}
      />
      <ProjectForm
        visible={projectFormOpen}
        projects={projects}
        onClose={() => setProjectFormOpen(false)}
        onSave={saveProject}
      />
    </SafeAreaView>
  );
}

function SectionHeader({
  title,
  action,
  onPress,
}: {
  title: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable onPress={onPress} accessibilityRole="button">
        <Text style={styles.sectionAction}>{action}</Text>
      </Pressable>
    </View>
  );
}

function FilterChip({
  label,
  selected,
  testID,
  onPress,
}: {
  label: string;
  selected: boolean;
  testID: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={testID}
      style={[styles.filterChip, selected && styles.filterChipActive]}
    >
      <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function TabButton({
  label,
  glyph,
  active,
  onPress,
}: {
  label: string;
  glyph: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      testID={`tab-${label === 'Início' ? 'home' : label === 'Movimentações' ? 'movements' : label === 'Organizar' ? 'workspace' : 'views'}`}
      accessibilityState={{ selected: active }}
      style={styles.tabButton}
    >
      <Text style={[styles.tabGlyph, active && styles.tabGlyphActive]}>{glyph}</Text>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function MovementForm({
  visible,
  today,
  movement,
  projects,
  accounts,
  categories,
  cards,
  onActions,
  isDemo,
  onClose,
  onSave,
}: {
  visible: boolean;
  today: NonNullable<Movement['occurredOn']>;
  movement: Movement | null;
  projects: readonly Project[];
  accounts: readonly Account[];
  categories: readonly Category[];
  cards: readonly CreditCard[];
  onActions?: () => void;
  isDemo: boolean;
  onClose: () => void;
  onSave: (input: {
    title: string;
    direction: MovementDirection;
    moneyType: MovementMoneyType;
    amountMinor: number;
    nature: MovementNature;
    cardId: string | null;
    projectId: string | null;
    accountId: string | undefined;
    categoryId: string | null;
    occurredTime: string | null;
    settledTime: string | null;
    eventDate: Movement['occurredOn'];
    cashDate: NonNullable<Movement['settledOn']>;
  }) => void;
}) {
  const [title, setTitle] = useState('');
  const [amountText, setAmountText] = useState('');
  const [eventDateText, setEventDateText] = useState('');
  const [cashDateText, setCashDateText] = useState('');
  const [direction, setDirection] = useState<MovementDirection>('expense');
  const [moneyType, setMoneyType] = useState<MovementMoneyType>('digital');
  const [nature, setNature] = useState<MovementNature>('realized');
  const [cardId, setCardId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | undefined>();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [occurredTime, setOccurredTime] = useState('');
  const [settledTime, setSettledTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadFormValues = () => {
    if (movement) {
      const eventDate = movement.occurredOn ?? movement.expectedOn;
      const cashDate = movement.settledOn ?? movement.plannedSettlementOn;
      setTitle(movement.title);
      setAmountText(brlInputFromMinor(movement.amountMinor));
      setEventDateText(eventDate ? formatBrazilianDate(eventDate) : '');
      setCashDateText(cashDate ? formatBrazilianDate(cashDate) : '');
      setDirection(movement.direction);
      setMoneyType(movement.moneyType);
      setNature(movement.nature);
      setCardId(movement.cardId);
      setProjectId(movement.projectId);
      setAccountId(movement.accountId ?? accounts.find((account) => account.kind === 'cash' && account.moneyType === movement.moneyType)?.id);
      setCategoryId(movement.categoryId ?? null);
      setOccurredTime(movement.occurredTime ?? ''); setSettledTime(movement.settledTime ?? '');
    } else {
      const todayText = formatBrazilianDate(today);
      setTitle('');
      setAmountText('');
      setEventDateText(todayText);
      setCashDateText(todayText);
      setDirection('expense');
      setMoneyType('digital');
      setNature('realized');
      setCardId(null);
      setProjectId(null);
      setAccountId(accounts.find((account) => account.kind === 'cash' && account.moneyType === 'digital')?.id);
      setCategoryId(null);
      setOccurredTime(''); setSettledTime('');
    }
    setError(null);
  };

  const save = () => {
    const amountMinor = parseBrlToMinor(amountText);
    const eventDate = parseBrazilianDate(eventDateText);
    const cashDate = parseBrazilianDate(cashDateText);

    if (!title.trim()) {
      setError('Informe uma descrição.');
      return;
    }
    if (amountMinor === null) {
      setError('Digite um valor válido, por exemplo 25,90.');
      return;
    }
    if (!cashDate || (eventDateText.trim() !== '' && !eventDate)) {
      setError('Confira as datas no formato DD/MM/AAAA.');
      return;
    }
    if (nature === 'realized' && cashDate > today) {
      setError('Pagamento futuro deve ficar como compromisso ou previsão.');
      return;
    }
    if (cardId !== null && (direction !== 'expense' || nature === 'realized')) {
      setError('Uma compra prevista no cartão deve ser uma saída pendente.');
      return;
    }

    try { onSave({
      title: title.trim(),
      direction,
      moneyType,
      amountMinor,
      nature,
      cardId,
      projectId,
      accountId: accountId && accounts.find((account) => account.id === accountId)?.moneyType === moneyType
        ? accountId : accounts.find((account) => account.kind === 'cash' && account.moneyType === moneyType)?.id,
      categoryId,
      occurredTime: occurredTime.trim() || null,
      settledTime: settledTime.trim() || null,
      eventDate,
      cashDate,
    }); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar o registro.'); }
  };

  const isRealized = nature === 'realized';
  const eventFieldLabel = movement?.occurredOn ? 'Data do fato' : cardId !== null
    ? 'Data prevista da compra'
    : isRealized ? 'Data do fato' : 'Data prevista do evento';
  const cashFieldLabel = cardId !== null
    ? 'Data prevista para pagar a fatura'
    : isRealized ? 'Data do pagamento/recebimento' : 'Data prevista para o caixa';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={loadFormValues}
      onRequestClose={onClose}
      statusBarTranslucent
      testID="movement-form-modal"
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.modalDismissArea} onPress={onClose} accessibilityLabel="Fechar formulário" />
        <View style={styles.formSheet}>
          <View style={styles.formHandle} />
          <View style={styles.formHeader}>
            <View>
              <Text style={styles.formEyebrow}>{movement ? 'EDITAR LANÇAMENTO DE TESTE' : 'NOVO LANÇAMENTO DE TESTE'}</Text>
              <Text style={styles.formTitle}>{movement ? 'Ajustar lançamento' : 'O que aconteceu?'}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar">
              <Text style={styles.closeButton}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.formScroll}
          >
            <View style={styles.segmentRow}>
              <SegmentButton label="Despesa" active={direction === 'expense'} onPress={() => setDirection('expense')} />
              <SegmentButton label="Entrada" active={direction === 'income'} onPress={() => { setDirection('income'); setCardId(null); }} />
            </View>

            <Field label="Descrição">
              <TextInput
                accessibilityLabel="Descrição"
                testID="movement-title-input"
                value={title}
                onChangeText={setTitle}
                placeholder="Ex.: Mercado de teste"
                placeholderTextColor="#8C9891"
                style={styles.input}
                maxLength={80}
                returnKeyType="next"
              />
            </Field>

            <Field label="Valor em reais">
              <TextInput
                accessibilityLabel="Valor em reais"
                testID="movement-amount-input"
                value={amountText}
                onChangeText={setAmountText}
                placeholder="0,00"
                placeholderTextColor="#8C9891"
                keyboardType="decimal-pad"
                style={styles.input}
                maxLength={18}
              />
            </Field>

            <Field label={eventFieldLabel} hint="DD/MM/AAAA">
              <TextInput
                accessibilityLabel={eventFieldLabel}
                testID="movement-event-date-input"
                value={eventDateText}
                onChangeText={setEventDateText}
                placeholder="DD/MM/AAAA"
                placeholderTextColor="#8C9891"
                keyboardType="default"
                style={styles.input}
                maxLength={10}
              />
            </Field>

            <Field label={cashFieldLabel} hint="Pode ser diferente da data da compra">
              <TextInput
                accessibilityLabel={cashFieldLabel}
                testID="movement-cash-date-input"
                value={cashDateText}
                onChangeText={setCashDateText}
                placeholder="DD/MM/AAAA"
                placeholderTextColor="#8C9891"
                keyboardType="default"
                style={styles.input}
                maxLength={10}
              />
            </Field>

            <Field label="Como classificar?">
              <View style={styles.segmentRow}>
                <SegmentButton label="Realizado" active={nature === 'realized'} onPress={() => setNature('realized')} />
                <SegmentButton label="Compromisso" active={nature === 'commitment'} onPress={() => setNature('commitment')} />
                <SegmentButton label="Previsão" active={nature === 'forecast'} onPress={() => setNature('forecast')} />
              </View>
            </Field>

            {isRealized || movement?.occurredOn ? <Field label="Hora do fato, opcional" hint="HH:MM. Deixe vazia quando não souber.">
              <TextInput accessibilityLabel="Hora do fato, opcional" value={occurredTime} onChangeText={setOccurredTime} maxLength={5} style={styles.input} />
            </Field> : null}
            {isRealized ? <Field label="Hora do pagamento, opcional" hint="Não é preenchida automaticamente.">
              <TextInput accessibilityLabel="Hora do pagamento, opcional" value={settledTime} onChangeText={setSettledTime} maxLength={5} style={styles.input} />
            </Field> : null}

            <Field label="Tipo de dinheiro">
              <View style={styles.formChipRow}>
                <FilterChip label="Digital" selected={moneyType === 'digital'} testID="movement-money-digital" onPress={() => setMoneyType('digital')} />
                <FilterChip label="Físico" selected={moneyType === 'physical'} testID="movement-money-physical" onPress={() => { setMoneyType('physical'); setCardId(null); }} />
              </View>
              <Text style={styles.formFootnote}>Investimentos são patrimônio e não entram como caixa neste formulário.</Text>
            </Field>

            <Field label="Projeto (opcional)">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.formChipRow}>
                <FilterChip label="Sem projeto" selected={projectId === null} testID="movement-project-none" onPress={() => setProjectId(null)} />
                {projects.map((project) => (
                  <FilterChip key={project.id} label={project.name} selected={projectId === project.id} testID={`movement-project-${project.id}`} onPress={() => setProjectId(project.id)} />
                ))}
              </ScrollView>
            </Field>

            <Field label="Conta">
              <View style={styles.formChipRow}>{accounts.filter((account) => account.kind === 'cash' && account.moneyType === moneyType).map((account) => (
                <FilterChip key={account.id} label={account.name} selected={accountId === account.id} testID={`movement-account-${account.id}`} onPress={() => setAccountId(account.id)} />
              ))}</View>
            </Field>
            <Field label="Categoria (opcional)">
              <View style={styles.formChipRow}>
                <FilterChip label="Sem categoria" selected={categoryId === null} testID="movement-category-none" onPress={() => setCategoryId(null)} />
                {categories.map((category) => <FilterChip key={category.id} label={category.name} selected={categoryId === category.id} testID={`movement-category-${category.id}`} onPress={() => setCategoryId(category.id)} />)}
              </View>
            </Field>

            <Field label={direction === 'expense' ? 'Forma de pagamento' : 'Meio de recebimento'}>
              <View style={styles.formChipRow}>
                <FilterChip
                  label={direction === 'expense'
                    ? moneyType === 'digital' ? 'Débito' : 'Dinheiro físico'
                    : moneyType === 'digital' ? 'Digital' : 'Dinheiro físico'}
                  selected={cardId === null}
                  testID="movement-card-none"
                  onPress={() => setCardId(null)}
                />
                {direction === 'expense' ? cards.map((card) => (
                  <FilterChip key={card.id} label={`Crédito · ${card.name}`} selected={cardId === card.id} testID={`movement-card-${card.id}`} onPress={() => { setCardId(card.id); setMoneyType('digital'); setNature('commitment'); }} />
                )) : null}
              </View>
              {direction === 'expense' ? (
                <Text style={styles.formFootnote}>
                  Sem cartão em despesa digital = débito; cartão selecionado = crédito. Dinheiro físico fica separado.
                  {cardId !== null ? ' A data da compra e a data prevista para o caixa ficam separadas.' : ''}
                </Text>
              ) : null}
            </Field>

            {error ? <Text style={styles.formError} accessibilityRole="alert">{error}</Text> : null}

            {onActions ? <Pressable accessibilityRole="button" testID="movement-actions" onPress={() => { try { onActions(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível abrir as ações.'); } }} style={styles.sortButton}><Text>Pagamentos, parcelas e reembolsos</Text></Pressable> : null}

            <Pressable style={styles.saveButton} onPress={save} accessibilityRole="button" testID="movement-save-button">
              <Text style={styles.saveButtonText}>{movement ? 'Salvar alteração de teste' : 'Adicionar aos dados de teste'}</Text>
            </Pressable>
            <Text style={styles.formFootnote}>
              {isDemo ? 'Este lançamento fica apenas na memória e desaparece ao fechar o app.' : 'Este registro é salvo neste aparelho, protegido pela chave local.'}
            </Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ProjectForm({
  visible,
  projects,
  onClose,
  onSave,
}: {
  visible: boolean;
  projects: readonly Project[];
  onClose: () => void;
  onSave: (name: string, description: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setDescription('');
    setError(null);
  };

  const save = () => {
    const normalizedName = name.trim();
    const normalizedDescription = description.trim();

    if (!normalizedName) {
      setError('Informe o nome do projeto.');
      return;
    }
    if (!normalizedDescription) {
      setError('Informe uma descrição para o projeto.');
      return;
    }
    if (projects.some((project) => project.name.toLocaleLowerCase('pt-BR') === normalizedName.toLocaleLowerCase('pt-BR'))) {
      setError('Já existe um projeto com esse nome.');
      return;
    }

    try { onSave(normalizedName, normalizedDescription); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar o projeto.'); }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={resetForm}
      onRequestClose={onClose}
      statusBarTranslucent
      testID="project-form-modal"
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.modalDismissArea} onPress={onClose} accessibilityLabel="Fechar formulário de projeto" />
        <View style={styles.formSheet}>
          <View style={styles.formHandle} />
          <View style={styles.formHeader}>
            <View>
              <Text style={styles.formEyebrow}>NOVO PROJETO DE TESTE</Text>
              <Text style={styles.formTitle}>Criar projeto</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" testID="close-project-form-button">
              <Text style={styles.closeButton}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.formScroll}
          >
            <Field label="Nome do projeto">
              <TextInput
                accessibilityLabel="Nome do projeto"
                testID="project-name-input"
                value={name}
                onChangeText={setName}
                placeholder="Ex.: Reforma da cozinha"
                placeholderTextColor="#8C9891"
                style={styles.input}
                maxLength={60}
                returnKeyType="next"
              />
            </Field>

            <Field label="Descrição">
              <TextInput
                accessibilityLabel="Descrição do projeto"
                testID="project-description-input"
                value={description}
                onChangeText={setDescription}
                placeholder="Para que você quer acompanhar este projeto?"
                placeholderTextColor="#8C9891"
                style={[styles.input, styles.projectDescriptionInput]}
                maxLength={180}
                multiline
                textAlignVertical="top"
              />
            </Field>

            {error ? <Text style={styles.formError} accessibilityRole="alert" testID="project-form-error">{error}</Text> : null}

            <Pressable style={styles.saveButton} onPress={save} accessibilityRole="button" testID="save-project-button">
              <Text style={styles.saveButtonText}>Salvar projeto</Text>
            </Pressable>
            <Text style={styles.formFootnote}>
              O projeto é uma classificação dos lançamentos; criar um projeto não altera o caixa.
            </Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      testID={`movement-option-${label.toLowerCase().replaceAll(' ', '-')}`}
      style={[styles.segmentButton, active && styles.segmentButtonActive]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  appShell: { flex: 1 },
  topBar: {
    minHeight: 68,
    paddingHorizontal: 22,
    paddingTop: 7,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { color: COLORS.ink, fontSize: 20, fontWeight: '900', letterSpacing: 2.2 },
  brandSub: { color: COLORS.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1.3, marginTop: 2 },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: COLORS.ink, fontSize: 28, fontWeight: '500', marginTop: -2 },
  demoBanner: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 13,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.greenSoft,
    flexDirection: 'row',
    alignItems: 'center',
  },
  demoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.green, marginRight: 8 },
  demoBannerText: { color: COLORS.green, fontSize: 10, fontWeight: '800', letterSpacing: 0.45 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 22 },
  eyebrow: { color: COLORS.green, fontSize: 10, fontWeight: '900', letterSpacing: 1.7, marginBottom: 7 },
  pageTitle: { color: COLORS.ink, fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.8 },
  pageLead: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 5, marginBottom: 19 },
  safeSpendCard: { backgroundColor: COLORS.greenSoft, padding: 17, borderRadius: 20, marginBottom: 13, borderWidth: 1, borderColor: '#D4E1D6' },
  safeSpendEyebrow: { color: COLORS.green, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  safeSpendHorizon: { color: COLORS.muted, fontSize: 11, fontWeight: '600', marginTop: 4 },
  safeSpendAmount: { color: COLORS.green, fontSize: 32, lineHeight: 39, fontWeight: '900', letterSpacing: -0.8, marginTop: 2 },
  safeSpendNegative: { color: COLORS.red },
  safeScenarioRow: { flexDirection: 'row', marginTop: 7 },
  safeSpendDetails: { color: COLORS.ink, fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 7 },
  safeSpendWarning: { color: COLORS.red, fontSize: 10, lineHeight: 15, fontWeight: '800', marginTop: 6 },
  safeSpendFootnote: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginTop: 5 },
  safeSpendUnavailableTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '800', marginTop: 8 },
  monthCard: {
    backgroundColor: COLORS.green,
    padding: 19,
    borderRadius: 23,
    marginBottom: 13,
    shadowColor: '#152D24',
    shadowOpacity: 0.09,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  monthCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 17 },
  monthTitle: { color: '#F5F8F2', fontSize: 17, fontWeight: '800' },
  monthSubtitle: { color: '#B9CEC2', fontSize: 11, marginTop: 3 },
  monthIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: '#366251', alignItems: 'center', justifyContent: 'center' },
  monthIconText: { color: COLORS.lime, fontSize: 20, fontWeight: '800' },
  balanceCaption: { color: '#C5D8CD', fontSize: 11, fontWeight: '600' },
  balanceValue: { color: '#FFFFFF', fontSize: 32, lineHeight: 41, fontWeight: '800', letterSpacing: -1.1, marginTop: 3 },
  negativeBalance: { color: '#FFB3A9' },
  summaryDivider: { height: 1, backgroundColor: '#406757', marginVertical: 15 },
  summaryGrid: { flexDirection: 'row' },
  summaryCell: { flex: 1 },
  summaryLabel: { color: '#BED1C6', fontSize: 11, marginBottom: 5 },
  summaryValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  summaryBreakdown: { color: '#D6E3DC', fontSize: 9, lineHeight: 14, marginTop: 3 },
  lowestBalance: { minHeight: 32, borderRadius: 10, backgroundColor: '#2B5747', marginTop: 15, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' },
  lowestIcon: { color: COLORS.lime, fontSize: 20, marginRight: 6 },
  lowestText: { color: '#DCE9E1', fontSize: 10, flexShrink: 1 },
  lowestStrong: { color: '#FFFFFF', fontWeight: '800' },
  negativeNote: { color: '#FFD1CB', fontSize: 11, marginTop: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 10 },
  sectionTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  sectionAction: { color: COLORS.green, fontSize: 12, fontWeight: '800', paddingVertical: 5, paddingLeft: 10 },
  editHint: { color: COLORS.muted, fontSize: 10, textAlign: 'center', marginTop: 8 },
  listCard: { backgroundColor: COLORS.card, borderRadius: 19, paddingHorizontal: 13, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.line },
  movementRow: { minHeight: 73, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', borderBottomColor: COLORS.line, borderBottomWidth: StyleSheet.hairlineWidth },
  movementIcon: { width: 39, height: 39, borderRadius: 14, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  movementIconText: { color: COLORS.green, fontSize: 20, fontWeight: '800' },
  movementCopy: { flex: 1, marginRight: 8 },
  movementTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  movementMeta: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  movementAmount: { color: COLORS.green, fontSize: 12, fontWeight: '800' },
  expenseAmount: { color: COLORS.ink },
  primaryButton: { minHeight: 52, borderRadius: 17, backgroundColor: COLORS.lime, marginTop: 14, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  monthNavigation: { minHeight: 48, flexDirection: 'row', alignItems: 'center', backgroundColor: '#E9EBE4', borderRadius: 15, padding: 4, marginBottom: 8 },
  monthNavigationButton: { width: 40, height: 39, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  monthNavigationArrow: { color: COLORS.green, fontSize: 26, lineHeight: 30, fontWeight: '600' },
  monthNavigationLabel: { flex: 1, color: COLORS.ink, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  monthQuickPicker: { flexDirection: 'row', backgroundColor: '#E9EBE4', borderRadius: 15, padding: 4, marginBottom: 13 },
  monthPickerItem: { minHeight: 39, flex: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  monthPickerItemActive: { backgroundColor: COLORS.card, shadowColor: '#13251D', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  monthPickerText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  monthPickerTextActive: { color: COLORS.ink },
  compactBalance: { backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 16 },
  compactBalanceLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  compactBalanceValue: { color: COLORS.green, fontSize: 26, fontWeight: '800', letterSpacing: -0.7, marginTop: 4 },
  compactBalanceFoot: { color: COLORS.muted, fontSize: 10, lineHeight: 16, marginTop: 7 },
  compactBreakdown: { marginTop: 3 },
  portfolioTabs: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, marginBottom: 10 },
  portfolioCard: { backgroundColor: COLORS.card, borderRadius: 19, borderWidth: 1, borderColor: COLORS.line, padding: 15, marginBottom: 11 },
  portfolioGroup: { marginTop: 14 },
  portfolioGroupTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '800', marginBottom: 6 },
  portfolioDescription: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  projectFlowSummary: { backgroundColor: '#F5F7F2', borderRadius: 14, padding: 12, marginTop: 12, marginBottom: 12 },
  projectFlowHeading: { color: COLORS.ink, fontSize: 11, fontWeight: '800', marginBottom: 4 },
  projectFlowLine: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line, paddingVertical: 6 },
  projectFlowCopy: { flex: 1, marginRight: 8 },
  projectFlowLabel: { color: COLORS.ink, fontSize: 10, fontWeight: '800' },
  projectFlowDetail: { color: COLORS.muted, fontSize: 9, lineHeight: 13, marginTop: 2 },
  projectFlowNet: { color: COLORS.green, fontSize: 11, fontWeight: '800' },
  projectFlowNegative: { color: COLORS.red },
  projectFlowTotal: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: COLORS.line, marginTop: 2, paddingTop: 8 },
  projectFlowTotalLabel: { color: COLORS.ink, fontSize: 10, fontWeight: '800', flex: 1, marginRight: 8 },
  projectFlowTotalValue: { color: COLORS.green, fontSize: 12, fontWeight: '900' },
  portfolioFootnote: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginHorizontal: 3, marginBottom: 10 },
  moneyCard: { backgroundColor: COLORS.card, borderRadius: 19, borderWidth: 1, borderColor: COLORS.line, padding: 16, marginBottom: 10 },
  moneyTypeTitle: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  moneyTypeValue: { color: COLORS.green, fontSize: 25, fontWeight: '800', marginTop: 5 },
  movementFilters: { marginTop: 14 },
  filterLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '800', marginBottom: 6 },
  filterChipRow: { paddingBottom: 8, paddingRight: 4 },
  filterChip: { minHeight: 33, borderRadius: 11, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.card, paddingHorizontal: 11, marginRight: 7, alignItems: 'center', justifyContent: 'center' },
  filterChipActive: { backgroundColor: COLORS.greenSoft, borderColor: '#C4D8CA' },
  filterChipText: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  filterChipTextActive: { color: COLORS.green, fontWeight: '800' },
  searchAndSort: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  searchInput: { flex: 1, minWidth: 0 },
  sortButton: { minHeight: 43, paddingHorizontal: 11, marginLeft: 8, borderRadius: 12, backgroundColor: COLORS.greenSoft, alignItems: 'center', justifyContent: 'center' },
  sortButtonText: { color: COLORS.green, fontSize: 10, fontWeight: '800' },
  resetFiltersButton: { alignSelf: 'flex-end', paddingVertical: 7, paddingLeft: 12 },
  resetFiltersText: { color: COLORS.green, fontSize: 10, fontWeight: '800' },
  emptyCard: { padding: 20, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center' },
  emptyTitle: { color: COLORS.ink, fontWeight: '800', fontSize: 15 },
  emptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 },
  bottomBar: { height: 70, backgroundColor: COLORS.card, borderTopColor: COLORS.line, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: Platform.OS === 'android' ? 2 : 0 },
  tabButton: { flex: 1, minWidth: 90, minHeight: 57, alignItems: 'center', justifyContent: 'center' },
  tabGlyph: { color: '#8B9890', fontSize: 20, lineHeight: 23, fontWeight: '700' },
  tabGlyphActive: { color: COLORS.green },
  tabLabel: { color: '#8B9890', fontSize: 10, fontWeight: '600', marginTop: 2 },
  tabLabelActive: { color: COLORS.green, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(11, 24, 19, 0.48)', justifyContent: 'flex-end' },
  modalDismissArea: { flex: 1 },
  formSheet: { maxHeight: '93%', backgroundColor: COLORS.background, borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingTop: 9, paddingHorizontal: 20 },
  formHandle: { alignSelf: 'center', width: 37, height: 4, borderRadius: 2, backgroundColor: '#C6CEC6', marginBottom: 14 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  formEyebrow: { color: COLORS.green, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  formTitle: { color: COLORS.ink, fontSize: 22, fontWeight: '800', marginTop: 3 },
  closeButton: { color: COLORS.muted, fontSize: 28, paddingHorizontal: 5 },
  formScroll: { paddingBottom: 22 },
  segmentRow: { flexDirection: 'row', gap: 7 },
  segmentButton: { flex: 1, minHeight: 39, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  segmentButtonActive: { borderColor: COLORS.green, backgroundColor: COLORS.green },
  segmentText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  segmentTextActive: { color: '#FFFFFF' },
  formChipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingVertical: 2 },
  field: { marginTop: 13 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  fieldLabel: { color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  fieldHint: { color: COLORS.muted, fontSize: 9 },
  input: { minHeight: 45, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.card, paddingHorizontal: 12, color: COLORS.ink, fontSize: 14 },
  projectDescriptionInput: { minHeight: 92, paddingTop: 11 },
  formError: { color: COLORS.red, fontSize: 12, marginTop: 12 },
  saveButton: { minHeight: 50, borderRadius: 15, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  saveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  formFootnote: { color: COLORS.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 9, marginBottom: 4 },
});
