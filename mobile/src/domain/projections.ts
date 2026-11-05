import {
  monthAtOffset, monthOf, summarizeMonth, validateCivilDate, validateMovement,
  type CivilDate, type Movement, type MonthSummary, type OpeningCashByType, type YearMonth,
} from './movements.ts';

export interface CashOpening {
  month: YearMonth;
  cash: OpeningCashByType;
}

/**
 * Replays settled cash from a dated opening. Changes before the opening apply
 * only their delta against its original records, avoiding counting them twice.
 * The demo opening is a ledger baseline, not a reconciled bank statement.
 */
export function openingCashForMonth(
  movements: readonly Movement[],
  baseline: readonly Movement[],
  opening: CashOpening,
  month: YearMonth,
): OpeningCashByType {
  monthAtOffset(opening.month, 0);
  monthAtOffset(month, 0);
  if (month < opening.month) throw new RangeError('No opening balance is known before the ledger baseline.');
  for (const amount of Object.values(opening.cash)) {
    if (!Number.isSafeInteger(amount)) throw new RangeError('Opening cash must be safe integer centavos.');
  }
  const totals = { digital: BigInt(opening.cash.digital), physical: BigInt(opening.cash.physical) };
  const apply = (records: readonly Movement[], limit: YearMonth, multiplier: bigint) => {
    for (const record of records) {
      validateMovement(record);
      if (record.nature !== 'realized' || !record.settledOn || monthOf(record.settledOn) >= limit) continue;
      const signed = BigInt(record.amountMinor) * (record.direction === 'income' ? 1n : -1n);
      totals[record.moneyType] += signed * multiplier;
    }
  };
  apply(movements, month, 1n);
  apply(baseline, opening.month, -1n);
  const result = { digital: Number(totals.digital), physical: Number(totals.physical) };
  if (!Object.values(result).every(Number.isSafeInteger)) throw new RangeError('Recalculated cash exceeds safe integer centavos.');
  return result;
}

/** Pending overdue cash stays pending and is projected today without rewriting its original date. */
export function projectCashMonths(
  movements: readonly Movement[],
  baseline: readonly Movement[],
  opening: CashOpening,
  asOf: CivilDate,
  through: YearMonth,
): MonthSummary[] {
  validateCivilDate(asOf, 'asOf');
  monthAtOffset(through, 0);
  const start = monthOf(asOf);
  if (through < start) throw new RangeError('Projection must end on or after the current month.');
  const cash = openingCashForMonth(movements, baseline, opening, start);
  let balance = cash.digital + cash.physical;
  if (!Number.isSafeInteger(balance)) throw new RangeError('Combined opening cash exceeds safe integer centavos.');
  const projected = movements.map((movement) => {
    validateMovement(movement);
    return movement.nature !== 'realized' && movement.plannedSettlementOn! < asOf
      ? { ...movement, plannedSettlementOn: asOf }
      : movement;
  });
  const summaries: MonthSummary[] = [];
  for (let month = start; ; month = monthAtOffset(month, 1)) {
    const summary = summarizeMonth(projected, month, balance);
    summaries.push(summary);
    balance = summary.closingBalanceMinor;
    if (month === through) break;
  }
  return summaries;
}
