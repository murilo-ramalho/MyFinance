import type { CurrencyCode } from './money';

export type CivilDate = `${number}-${number}-${number}`;
export type YearMonth = `${number}-${number}`;
export type MovementDirection = 'income' | 'expense';
export type MovementNature = 'realized' | 'commitment' | 'forecast';

export interface Movement {
  id: string;
  title: string;
  currency: CurrencyCode;
  direction: MovementDirection;
  amountMinor: number;
  nature: MovementNature;
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
  closingBalanceMinor: number;
  lowestBalanceMinor: number;
  lowestBalanceOn: CivilDate;
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

function validateMovement(movement: Movement): void {
  if (!movement.id.trim() || !movement.title.trim()) {
    throw new TypeError('Movement id and title are required.');
  }
  if (!Number.isSafeInteger(movement.amountMinor) || movement.amountMinor <= 0) {
    throw new RangeError('Movement amount must be positive integer centavos.');
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
      index += 1;

      if (
        !Number.isSafeInteger(dailyInflowMinor)
        || !Number.isSafeInteger(dailyOutflowMinor)
        || !Number.isSafeInteger(dailyNetMinor)
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
    closingBalanceMinor: balanceMinor,
    lowestBalanceMinor,
    lowestBalanceOn,
  };
}
