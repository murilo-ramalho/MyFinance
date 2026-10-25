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

import { createDemoMovements, DEMO_OPENING_BALANCE_MINOR } from './src/demo/demoData';
import { formatBrazilianDate, parseBrazilianDate } from './src/domain/dates';
import { brlInputFromMinor, formatBrl, parseBrlToMinor } from './src/domain/money';
import {
  listMovementsForMonth,
  monthAtOffset,
  monthOf,
  summarizeMonth,
  type Movement,
  type MovementDirection,
  type MovementNature,
  type YearMonth,
} from './src/domain/movements';
import { deviceToday } from './src/platform/deviceDate';

type Screen = 'home' | 'movements';

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

function MovementRow({ movement, onPress }: { movement: Movement; onPress?: () => void }) {
  const displayDate = movement.occurredOn ?? movement.expectedOn ?? movement.settledOn ?? movement.plannedSettlementOn;
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
        </Text>
        {cashDate && displayDate && cashDate !== displayDate ? (
          <Text style={styles.movementMeta}>
            Caixa {isForecast ? 'previsto' : 'efetivo'}: {formatBrazilianDate(cashDate)}
          </Text>
        ) : null}
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
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Saídas</Text>
          <Text style={styles.summaryValue}>−{formatBrl(summary.outflowMinor)}</Text>
        </View>
      </View>

      <View style={styles.lowestBalance}>
        <Text style={styles.lowestIcon}>⌁</Text>
        <Text style={styles.lowestText}>
          Menor saldo: <Text style={styles.lowestStrong}>{formatBrl(summary.lowestBalanceMinor)}</Text>
          {' · '}{formatBrazilianDate(summary.lowestBalanceOn)}
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

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [monthOffset, setMonthOffset] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const nextTestId = useRef(1);
  const [movements, setMovements] = useState<Movement[]>(() => {
    const currentMonth = monthOf(deviceToday());
    return createDemoMovements(currentMonth);
  });

  const today = deviceToday();
  const currentMonth = monthOf(today);
  const followingMonth = monthAtOffset(currentMonth, 1);
  const currentSummary = useMemo(
    () => summarizeMonth(movements, currentMonth, DEMO_OPENING_BALANCE_MINOR),
    [movements, currentMonth],
  );
  const followingSummary = useMemo(
    () => summarizeMonth(movements, followingMonth, currentSummary.closingBalanceMinor),
    [movements, followingMonth, currentSummary.closingBalanceMinor],
  );
  const selectedMonth = monthAtOffset(currentMonth, monthOffset);
  const selectedSummary = monthOffset === 0 ? currentSummary : followingSummary;
  const visibleMovements = listMovementsForMonth(movements, selectedMonth);

  const openNewMovement = () => {
    setEditingMovement(null);
    setFormOpen(true);
  };

  const openEditMovement = (movement: Movement) => {
    setEditingMovement(movement);
    setFormOpen(true);
  };

  const saveMovement = (input: {
    title: string;
    direction: MovementDirection;
    amountMinor: number;
    nature: MovementNature;
    eventDate: NonNullable<Movement['occurredOn']>;
    cashDate: NonNullable<Movement['settledOn']>;
  }) => {
    const isRealized = input.nature === 'realized';
    const nextMovement: Movement = {
      id: editingMovement?.id ?? `test-${nextTestId.current++}`,
      title: input.title,
      currency: 'BRL',
      direction: input.direction,
      amountMinor: input.amountMinor,
      nature: input.nature,
      occurredOn: isRealized ? input.eventDate : null,
      expectedOn: isRealized ? null : input.eventDate,
      plannedSettlementOn: isRealized ? null : input.cashDate,
      settledOn: isRealized ? input.cashDate : null,
    };

    setMovements((current) => editingMovement
      ? current.map((movement) => movement.id === editingMovement.id ? nextMovement : movement)
      : [...current, nextMovement]);
    setEditingMovement(null);
    setFormOpen(false);
    setScreen('movements');
    setMonthOffset(0);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.appShell}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.brand}>COFRE</Text>
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

        <DemoBanner />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {screen === 'home' ? (
            <>
              <Text style={styles.eyebrow}>VISÃO GERAL</Text>
              <Text style={styles.pageTitle}>Seu dinheiro, mês a mês.</Text>
              <Text style={styles.pageLead}>
                Veja o que já aconteceu e o que ainda está previsto.
              </Text>

              <MonthCard summary={currentSummary} subtitle="Mês atual · inclui previsões" />
              <MonthCard summary={followingSummary} subtitle="Próximo mês · projeção" />

              <SectionHeader title="Movimentações deste mês" action="Ver todas" onPress={() => setScreen('movements')} />
              <View style={styles.listCard}>
                {listMovementsForMonth(movements, currentMonth).slice(0, 4).map((movement) => (
                  <MovementRow key={movement.id} movement={movement} onPress={() => openEditMovement(movement)} />
                ))}
              </View>

              <Pressable style={styles.primaryButton} onPress={openNewMovement} accessibilityRole="button" accessibilityLabel="Registrar movimentação de teste">
                <Text style={styles.primaryButtonText}>＋  Registrar movimentação de teste</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.eyebrow}>SEU CAIXA</Text>
              <Text style={styles.pageTitle}>Movimentações</Text>
              <Text style={styles.pageLead}>Fatos, compromissos e previsões em ordem de data.</Text>

              <View style={styles.monthPicker}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mostrar mês atual"
                  testID="show-current-month-button"
                  onPress={() => setMonthOffset(0)}
                  style={[styles.monthPickerItem, monthOffset === 0 && styles.monthPickerItemActive]}
                >
                  <Text style={[styles.monthPickerText, monthOffset === 0 && styles.monthPickerTextActive]}>
                    {monthLabel(currentMonth)}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mostrar próximo mês"
                  testID="show-next-month-button"
                  onPress={() => setMonthOffset(1)}
                  style={[styles.monthPickerItem, monthOffset === 1 && styles.monthPickerItemActive]}
                >
                  <Text style={[styles.monthPickerText, monthOffset === 1 && styles.monthPickerTextActive]}>
                    {monthLabel(followingMonth)}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.compactBalance}>
                <Text style={styles.compactBalanceLabel}>Saldo previsto no fechamento</Text>
                <Text
                  testID={`movement-closing-balance-${selectedMonth}`}
                  style={[styles.compactBalanceValue, selectedSummary.closingBalanceMinor < 0 && styles.negativeBalance]}
                >
                  {formatBrl(selectedSummary.closingBalanceMinor)}
                </Text>
                <Text style={styles.compactBalanceFoot}>
                  Abertura {formatBrl(selectedSummary.openingBalanceMinor)} · entradas {formatBrl(selectedSummary.inflowMinor)} · saídas {formatBrl(selectedSummary.outflowMinor)}
                </Text>
              </View>

              <SectionHeader
                title={`${visibleMovements.length} movimentações`}
                action="＋ Nova"
                onPress={openNewMovement}
              />
              {visibleMovements.length > 0 ? (
                <View style={styles.listCard}>
                  {visibleMovements.map((movement) => (
                    <MovementRow key={movement.id} movement={movement} onPress={() => openEditMovement(movement)} />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Nada por aqui ainda</Text>
                  <Text style={styles.emptyText}>Adicione um lançamento fictício para experimentar o fluxo.</Text>
                </View>
              )}
              {visibleMovements.length > 0 ? (
                <Text style={styles.editHint}>Toque em uma linha para editar o lançamento de teste.</Text>
              ) : null}
              <Pressable style={styles.primaryButton} onPress={openNewMovement} accessibilityRole="button" accessibilityLabel="Registrar movimentação de teste">
                <Text style={styles.primaryButtonText}>＋  Registrar movimentação de teste</Text>
              </Pressable>
            </>
          )}
        </ScrollView>

        <View style={styles.bottomBar}>
          <TabButton label="Início" glyph="⌂" active={screen === 'home'} onPress={() => setScreen('home')} />
          <TabButton label="Movimentações" glyph="≋" active={screen === 'movements'} onPress={() => setScreen('movements')} />
        </View>
      </View>

      <MovementForm
        visible={formOpen}
        today={today}
        movement={editingMovement}
        onClose={() => {
          setFormOpen(false);
          setEditingMovement(null);
        }}
        onSave={saveMovement}
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
      testID={`tab-${label === 'Início' ? 'home' : 'movements'}`}
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
  onClose,
  onSave,
}: {
  visible: boolean;
  today: NonNullable<Movement['occurredOn']>;
  movement: Movement | null;
  onClose: () => void;
  onSave: (input: {
    title: string;
    direction: MovementDirection;
    amountMinor: number;
    nature: MovementNature;
    eventDate: NonNullable<Movement['occurredOn']>;
    cashDate: NonNullable<Movement['settledOn']>;
  }) => void;
}) {
  const [title, setTitle] = useState('');
  const [amountText, setAmountText] = useState('');
  const [eventDateText, setEventDateText] = useState('');
  const [cashDateText, setCashDateText] = useState('');
  const [direction, setDirection] = useState<MovementDirection>('expense');
  const [nature, setNature] = useState<MovementNature>('realized');
  const [error, setError] = useState<string | null>(null);

  const loadFormValues = () => {
    if (movement) {
      const eventDate = movement.occurredOn ?? movement.expectedOn ?? movement.settledOn ?? movement.plannedSettlementOn ?? today;
      const cashDate = movement.settledOn ?? movement.plannedSettlementOn ?? eventDate;
      setTitle(movement.title);
      setAmountText(brlInputFromMinor(movement.amountMinor));
      setEventDateText(formatBrazilianDate(eventDate));
      setCashDateText(formatBrazilianDate(cashDate));
      setDirection(movement.direction);
      setNature(movement.nature);
    } else {
      const todayText = formatBrazilianDate(today);
      setTitle('');
      setAmountText('');
      setEventDateText(todayText);
      setCashDateText(todayText);
      setDirection('expense');
      setNature('realized');
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
    if (!eventDate || !cashDate) {
      setError('Confira as datas no formato DD/MM/AAAA.');
      return;
    }

    onSave({
      title: title.trim(),
      direction,
      amountMinor,
      nature,
      eventDate,
      cashDate,
    });
  };

  const isRealized = nature === 'realized';

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
              <SegmentButton label="Entrada" active={direction === 'income'} onPress={() => setDirection('income')} />
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

            <Field label={isRealized ? 'Data do fato' : 'Data prevista do evento'} hint="DD/MM/AAAA">
              <TextInput
                accessibilityLabel={isRealized ? 'Data do fato' : 'Data prevista do evento'}
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

            <Field label={isRealized ? 'Data do pagamento/recebimento' : 'Data prevista para o caixa'} hint="Pode ser diferente da data do fato">
              <TextInput
                accessibilityLabel={isRealized ? 'Data do pagamento/recebimento' : 'Data prevista para o caixa'}
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

            {error ? <Text style={styles.formError} accessibilityRole="alert">{error}</Text> : null}

            <Pressable style={styles.saveButton} onPress={save} accessibilityRole="button" testID="movement-save-button">
              <Text style={styles.saveButtonText}>{movement ? 'Salvar alteração de teste' : 'Adicionar aos dados de teste'}</Text>
            </Pressable>
            <Text style={styles.formFootnote}>
              Este lançamento fica apenas na memória e desaparece ao fechar o app.
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
  monthPicker: { flexDirection: 'row', backgroundColor: '#E9EBE4', borderRadius: 15, padding: 4, marginBottom: 13 },
  monthPickerItem: { minHeight: 39, flex: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  monthPickerItemActive: { backgroundColor: COLORS.card, shadowColor: '#13251D', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  monthPickerText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  monthPickerTextActive: { color: COLORS.ink },
  compactBalance: { backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 16 },
  compactBalanceLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  compactBalanceValue: { color: COLORS.green, fontSize: 26, fontWeight: '800', letterSpacing: -0.7, marginTop: 4 },
  compactBalanceFoot: { color: COLORS.muted, fontSize: 10, lineHeight: 16, marginTop: 7 },
  emptyCard: { padding: 20, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center' },
  emptyTitle: { color: COLORS.ink, fontWeight: '800', fontSize: 15 },
  emptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 },
  bottomBar: { height: 70, backgroundColor: COLORS.card, borderTopColor: COLORS.line, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: Platform.OS === 'android' ? 2 : 0 },
  tabButton: { minWidth: 120, minHeight: 57, alignItems: 'center', justifyContent: 'center' },
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
  field: { marginTop: 13 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  fieldLabel: { color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  fieldHint: { color: COLORS.muted, fontSize: 9 },
  input: { minHeight: 45, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.card, paddingHorizontal: 12, color: COLORS.ink, fontSize: 14 },
  formError: { color: COLORS.red, fontSize: 12, marginTop: 12 },
  saveButton: { minHeight: 50, borderRadius: 15, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  saveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  formFootnote: { color: COLORS.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 9, marginBottom: 4 },
});
