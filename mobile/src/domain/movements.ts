import type { CurrencyCode } from './money';
import { daysInMonth } from './dates.ts';

export type CivilDate = `${number}-${number}-${number}`;
export type YearMonth = `${number}-${number}`;
export type MovementDirection = 'income' | 'expense';
export type MovementNature = 'realized' | 'commitment' | 'forecast';
export type MovementMoneyType = 'digital' | 'physical';
export type SafeSpendScenario = 'conservative' | 'expected';

export interface Movement {
  id: string;
  title: string;
  currency: CurrencyCode;
  direction: MovementDirection;
  /** Medium that supplies the cash flow; investment assets use a separate model. */
  moneyType: MovementMoneyType;
  amountMinor: number;
  nature: MovementNature;
  /** Demo card/project labels; these do not create extra cash flows. */
  cardId: string | null;
  projectId: string | null;
  /** Date of the economic event; null while a future event has not happened. */
  occurredOn: CivilDate | null;
  /** Expected event date, kept separate from its expected cash date. */
  expectedOn: CivilDate | null;
  /** Expected cash date for an unsettled movement. */
  plannedSettlementOn: CivilDate | null;
  /** Effective cash date; only set after payment/receipt is confirmed. */
  settledOn: CivilDate | null;
}

export interface MonthSummary {
  month: YearMonth;
  currency: CurrencyCode;
  openingBalanceMinor: number;
  inflowMinor: number;
  outflowMinor: number;
  realizedInflowMinor: number;
  committedInflowMinor: number;
  forecastInflowMinor: number;
  realizedOutflowMinor: number;
  committedOutflowMinor: number;
  forecastOutflowMinor: number;
  closingBalanceMinor: number;
  lowestBalanceMinor: number;
  lowestBalanceOn: CivilDate;
}

export interface ProjectFlowBucket {
  inflowMinor: number;
  outflowMinor: number;
  netMinor: number;
}

export interface ProjectFlowSummary {
  currency: CurrencyCode;
  realized: ProjectFlowBucket;
  commitment: ProjectFlowBucket;
  forecast: ProjectFlowBucket;
  projectedNetMinor: number;
}

export interface SafeSpendOptions {
  /** Balance at the beginning of the calendar month containing `asOf`. */
  openingBalanceMinor: number;
  /** Cash date through which the forecast is considered. */
  asOf: CivilDate;
  horizonDate: CivilDate;
  protectedMinor: number;
  cushionMinor: number;
  scenario: SafeSpendScenario;
}

export interface SafeSpendEstimate {
  asOf: CivilDate;
  horizonDate: CivilDate;
  scenario: SafeSpendScenario;
  currentCashMinor: number;
  lowestProjectedBalanceMinor: number;
  lowestBalanceOn: CivilDate;
  protectedMinor: number;
  cushionMinor: number;
  spendableMinor: number;
}

export function monthAtOffset(month: YearMonth, offset: number): YearMonth {
  if (!Number.isSafeInteger(offset)) {
    throw new RangeError('Month offset must be a safe integer.');
  }

  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) {
    throw new RangeError('Expected a valid year and month.');
  }
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1 || year > 9999) throw new RangeError('Expected a valid year and month.');

  const absoluteMonth = year * 12 + monthNumber - 1 + offset;
  const nextYear = Math.floor(absoluteMonth / 12);
  if (!Number.isSafeInteger(absoluteMonth) || nextYear < 1 || nextYear > 9999) {
    throw new RangeError('Month offset is outside the supported date range.');
  }

  const nextMonth = ((absoluteMonth % 12) + 12) % 12 + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}` as YearMonth;
}

export function monthOf(date: CivilDate): YearMonth {
  return date.slice(0, 7) as YearMonth;
}

export function displayDateOf(movement: Movement): CivilDate | null {
  return movement.occurredOn ?? movement.expectedOn ?? movement.settledOn ?? movement.plannedSettlementOn;
}

export function cashDateOf(movement: Movement): CivilDate | null {
  return movement.settledOn ?? movement.plannedSettlementOn;
}

function validateCivilDate(date: CivilDate, label: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new TypeError(`${label} must be a valid civil date.`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`${label} must be a valid civil date.`);
  }
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be safe integer centavos.`);
}

function signedAmount(movement: Movement): number {
  return movement.direction === 'income' ? movement.amountMinor : -movement.amountMinor;
}

export type OpeningCashByType = Readonly<Record<MovementMoneyType, number>>;

/** Current settled cash by medium, using the supplied month-opening balances. */
export function currentCashByType(
  movements: readonly Movement[],
  month: YearMonth,
  asOf: CivilDate,
  openingCash: OpeningCashByType,
): Record<MovementMoneyType, number> {
  validateCivilDate(asOf, 'asOf');
  if (monthOf(asOf) !== month) throw new RangeError('The cash date must belong to the selected month.');

  const balances: Record<MovementMoneyType, number> = {
    digital: openingCash.digital,
    physical: openingCash.physical,
  };
  for (const [moneyType, opening] of Object.entries(openingCash) as [MovementMoneyType, number][]) {
    assertSafeInteger(opening, `${moneyType} opening balance`);
  }

  for (const movement of movements) {
    validateMovement(movement);
    if (
      movement.nature !== 'realized'
      || movement.settledOn === null
      || monthOf(movement.settledOn) !== month
      || movement.settledOn > asOf
    ) continue;
    balances[movement.moneyType] += signedAmount(movement);
    assertSafeInteger(balances[movement.moneyType], `${movement.moneyType} cash balance`);
  }
  return balances;
}

/**
 * Estimates the amount left above protected money and the configured cushion
 * after applying the lowest daily projected cash balance over a supplied horizon.
 */
export function estimateSafeToSpend(
  movements: readonly Movement[],
  options: SafeSpendOptions,
): SafeSpendEstimate {
  validateCivilDate(options.asOf, 'asOf');
  validateCivilDate(options.horizonDate, 'horizonDate');
  if (options.horizonDate < options.asOf) {
    throw new RangeError('The forecast horizon cannot end before its start.');
  }
  assertSafeInteger(options.openingBalanceMinor, 'Opening balance');
  assertSafeInteger(options.protectedMinor, 'Protected amount');
  assertSafeInteger(options.cushionMinor, 'Cushion');
  if (options.protectedMinor < 0 || options.cushionMinor < 0) {
    throw new RangeError('Protected amount and cushion cannot be negative.');
  }
  if (options.scenario !== 'conservative' && options.scenario !== 'expected') {
    throw new TypeError('Unknown safe-spend scenario.');
  }

  const planningMonth = monthOf(options.asOf);
  let currentCashMinor = options.openingBalanceMinor;
  for (const movement of movements) {
    validateMovement(movement);
    const settledOn = movement.settledOn;
    if (
      movement.nature === 'realized'
      && settledOn !== null
      && monthOf(settledOn) === planningMonth
      && settledOn <= options.asOf
    ) {
      currentCashMinor += signedAmount(movement);
      assertSafeInteger(currentCashMinor, 'Current cash balance');
    }
  }

  const dailyFlows = new Map<CivilDate, number>();
  for (const movement of movements) {
    if (movement.nature === 'realized') continue;
    const cashDate = cashDateOf(movement);
    if (!cashDate || cashDate > options.horizonDate) continue;
    if (
      options.scenario === 'conservative'
      && movement.direction === 'income'
      && movement.nature === 'forecast'
    ) {
      continue;
    }

    // Overdue pending items remain obligations and are treated as due now.
    const projectedDate = cashDate < options.asOf ? options.asOf : cashDate;
    const nextTotal = (dailyFlows.get(projectedDate) ?? 0) + signedAmount(movement);
    assertSafeInteger(nextTotal, 'Daily projected flow');
    dailyFlows.set(projectedDate, nextTotal);
  }

  let balanceMinor = currentCashMinor;
  let lowestBalanceMinor = currentCashMinor;
  let lowestBalanceOn = options.asOf;
  const orderedFlows = [...dailyFlows.entries()].sort(([dateA], [dateB]) => dateA.localeCompare(dateB));
  for (const [date, dailyNetMinor] of orderedFlows) {
    balanceMinor += dailyNetMinor;
    assertSafeInteger(balanceMinor, 'Projected balance');
    if (balanceMinor < lowestBalanceMinor) {
      lowestBalanceMinor = balanceMinor;
      lowestBalanceOn = date;
    }
  }

  const spendableMinor = lowestBalanceMinor - options.protectedMinor - options.cushionMinor;
  assertSafeInteger(spendableMinor, 'Spendable amount');
  return {
    asOf: options.asOf,
    horizonDate: options.horizonDate,
    scenario: options.scenario,
    currentCashMinor,
    lowestProjectedBalanceMinor: lowestBalanceMinor,
    lowestBalanceOn,
    protectedMinor: options.protectedMinor,
    cushionMinor: options.cushionMinor,
    spendableMinor,
  };
}

function validateMovement(movement: Movement): void {
  if (!movement.id.trim() || !movement.title.trim()) {
    throw new TypeError('Movement id and title are required.');
  }
  for (const date of [movement.occurredOn, movement.expectedOn, movement.plannedSettlementOn, movement.settledOn]) {
    if (date !== null) validateCivilDate(date, 'Movement date');
  }
  if (!Number.isSafeInteger(movement.amountMinor) || movement.amountMinor <= 0) {
    throw new RangeError('Movement amount must be positive integer centavos.');
  }
  if (movement.moneyType !== 'digital' && movement.moneyType !== 'physical') {
    throw new TypeError('Movement money type must be digital or physical cash.');
  }
  if (movement.cardId !== null && (
    !movement.cardId.trim()
    || movement.direction !== 'expense'
    || movement.moneyType !== 'digital'
    || movement.nature === 'realized'
  )) {
    throw new TypeError('A credit card movement must be an unsettled digital expense.');
  }
  for (const labelId of [movement.cardId, movement.projectId]) {
    if (labelId !== null && !labelId.trim()) throw new TypeError('Movement labels cannot be empty.');
  }
  if (movement.nature === 'realized') {
    if (!movement.occurredOn || !movement.settledOn || movement.plannedSettlementOn) {
      throw new TypeError('A realized movement needs a fact date and effective cash date only.');
    }
  } else if (movement.settledOn) {
    throw new TypeError('A pending movement cannot have an effective cash date.');
  }
}

export function listMovementsForMonth(
  movements: readonly Movement[],
  month: YearMonth,
): Movement[] {
  return movements
    .filter((movement) => {
      const date = displayDateOf(movement);
      return date !== null && monthOf(date) === month;
    })
    .slice()
    .sort((a, b) => {
      const dateA = displayDateOf(a) ?? '';
      const dateB = displayDateOf(b) ?? '';
      return dateB.localeCompare(dateA) || b.id.localeCompare(a.id);
    });
}

export function summarizeMonth(
  movements: readonly Movement[],
  month: YearMonth,
  openingBalanceMinor: number,
): MonthSummary {
  if (!Number.isSafeInteger(openingBalanceMinor)) {
    throw new RangeError('Opening balance must be integer centavos.');
  }

  const flows = movements
    .map((movement) => {
      validateMovement(movement);
      return { movement, date: cashDateOf(movement) };
    })
    .filter(
      (entry): entry is { movement: Movement; date: CivilDate } =>
        entry.date !== null && monthOf(entry.date) === month,
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.movement.id.localeCompare(b.movement.id),
    );

  let inflowMinor = 0;
  let outflowMinor = 0;
  let realizedInflowMinor = 0;
  let committedInflowMinor = 0;
  let forecastInflowMinor = 0;
  let realizedOutflowMinor = 0;
  let committedOutflowMinor = 0;
  let forecastOutflowMinor = 0;
  let balanceMinor = openingBalanceMinor;
  let lowestBalanceMinor = openingBalanceMinor;
  let lowestBalanceOn = `${month}-01` as CivilDate;

  for (let index = 0; index < flows.length;) {
    const date = flows[index].date;
    let dailyInflowMinor = 0;
    let dailyOutflowMinor = 0;
    let dailyNetMinor = 0;

    // No movement time is stored, so ID ordering must not invent an intraday low.
    while (index < flows.length && flows[index].date === date) {
      const { movement } = flows[index];
      if (!Number.isSafeInteger(movement.amountMinor) || movement.amountMinor <= 0) {
        throw new RangeError('Movement amount must be positive integer centavos.');
      }

      const signedAmount = movement.direction === 'income'
        ? movement.amountMinor
        : -movement.amountMinor;

      if (signedAmount > 0) dailyInflowMinor += signedAmount;
      else dailyOutflowMinor += -signedAmount;
      dailyNetMinor += signedAmount;

      if (movement.direction === 'income') {
        if (movement.nature === 'realized') realizedInflowMinor += movement.amountMinor;
        else if (movement.nature === 'commitment') committedInflowMinor += movement.amountMinor;
        else forecastInflowMinor += movement.amountMinor;
      } else if (movement.nature === 'realized') {
        realizedOutflowMinor += movement.amountMinor;
      } else if (movement.nature === 'commitment') {
        committedOutflowMinor += movement.amountMinor;
      } else {
        forecastOutflowMinor += movement.amountMinor;
      }
      index += 1;

      if (
        !Number.isSafeInteger(dailyInflowMinor)
        || !Number.isSafeInteger(dailyOutflowMinor)
        || !Number.isSafeInteger(dailyNetMinor)
        || !Number.isSafeInteger(realizedInflowMinor)
        || !Number.isSafeInteger(committedInflowMinor)
        || !Number.isSafeInteger(forecastInflowMinor)
        || !Number.isSafeInteger(realizedOutflowMinor)
        || !Number.isSafeInteger(committedOutflowMinor)
        || !Number.isSafeInteger(forecastOutflowMinor)
      ) {
        throw new RangeError('Daily totals exceed safe integer centavos.');
      }
    }

    inflowMinor += dailyInflowMinor;
    outflowMinor += dailyOutflowMinor;
    balanceMinor += dailyNetMinor;
    if (!Number.isSafeInteger(inflowMinor) || !Number.isSafeInteger(outflowMinor) || !Number.isSafeInteger(balanceMinor)) {
      throw new RangeError('Monthly totals exceed safe integer centavos.');
    }
    if (balanceMinor < lowestBalanceMinor) {
      lowestBalanceMinor = balanceMinor;
      lowestBalanceOn = date;
    }
  }

  return {
    month,
    currency: 'BRL',
    openingBalanceMinor,
    inflowMinor,
    outflowMinor,
    realizedInflowMinor,
    committedInflowMinor,
    forecastInflowMinor,
    realizedOutflowMinor,
    committedOutflowMinor,
    forecastOutflowMinor,
    closingBalanceMinor: balanceMinor,
    lowestBalanceMinor,
    lowestBalanceOn,
  };
}

/** Sums a project's cash flows across the supplied history, keeping each state separate. */
export function summarizeProjectFlow(
  movements: readonly Movement[],
  projectId: string,
): ProjectFlowSummary {
  if (!projectId.trim()) throw new TypeError('A project id is required.');

  const buckets: Record<MovementNature, ProjectFlowBucket> = {
    realized: { inflowMinor: 0, outflowMinor: 0, netMinor: 0 },
    commitment: { inflowMinor: 0, outflowMinor: 0, netMinor: 0 },
    forecast: { inflowMinor: 0, outflowMinor: 0, netMinor: 0 },
  };

  for (const movement of movements) {
    if (movement.projectId !== projectId) continue;
    validateMovement(movement);

    const bucket = buckets[movement.nature];
    if (movement.direction === 'income') bucket.inflowMinor += movement.amountMinor;
    else bucket.outflowMinor += movement.amountMinor;
    assertSafeInteger(bucket.inflowMinor, 'Project inflow total');
    assertSafeInteger(bucket.outflowMinor, 'Project outflow total');
  }

  for (const bucket of Object.values(buckets)) {
    bucket.netMinor = bucket.inflowMinor - bucket.outflowMinor;
    assertSafeInteger(bucket.netMinor, 'Project net flow');
  }

  const projectedNetMinor = buckets.realized.netMinor
    + buckets.commitment.netMinor
    + buckets.forecast.netMinor;
  assertSafeInteger(projectedNetMinor, 'Project projected net flow');

  return {
    currency: 'BRL',
    realized: buckets.realized,
    commitment: buckets.commitment,
    forecast: buckets.forecast,
    projectedNetMinor,
  };
}
