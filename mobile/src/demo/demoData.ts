import type { CivilDate, Movement, YearMonth } from '../domain/movements';
import { daysInMonth } from '../domain/dates';
import { monthAtOffset } from '../domain/movements';

export const DEMO_OPENING_BALANCE_MINOR = 350_000;

function dateInMonth(month: YearMonth, day: number): CivilDate {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = daysInMonth(year, monthNumber);
  const safeDay = Math.min(day, lastDay);
  return `${month}-${String(safeDay).padStart(2, '0')}` as CivilDate;
}

function realized(
  id: string,
  title: string,
  direction: Movement['direction'],
  amountMinor: number,
  date: CivilDate,
): Movement {
  return {
    id,
    title,
    currency: 'BRL',
    direction,
    amountMinor,
    nature: 'realized',
    occurredOn: date,
    expectedOn: null,
    plannedSettlementOn: null,
    settledOn: date,
  };
}

function planned(
  id: string,
  title: string,
  direction: Movement['direction'],
  amountMinor: number,
  nature: 'commitment' | 'forecast',
  cashDate: CivilDate,
): Movement {
  return {
    id,
    title,
    currency: 'BRL',
    direction,
    amountMinor,
    nature,
    occurredOn: null,
    expectedOn: cashDate,
    plannedSettlementOn: cashDate,
    settledOn: null,
  };
}

export function createDemoMovements(currentMonth: YearMonth): Movement[] {
  const nextMonth = monthAtOffset(currentMonth, 1);

  return [
    realized('demo-salary', 'Salário de demonstração', 'income', 420_000, dateInMonth(currentMonth, 5)),
    realized('demo-rent', 'Moradia', 'expense', 160_000, dateInMonth(currentMonth, 5)),
    realized('demo-market', 'Mercado', 'expense', 48_500, dateInMonth(currentMonth, 9)),
    realized('demo-internet-paid', 'Internet', 'expense', 12_900, dateInMonth(currentMonth, 12)),
    realized('demo-pharmacy', 'Farmácia', 'expense', 8_750, dateInMonth(currentMonth, 18)),
    planned('demo-groceries', 'Mercado · previsão', 'expense', 42_000, 'forecast', dateInMonth(currentMonth, 27)),
    planned('demo-electricity', 'Conta de luz', 'expense', 23_000, 'commitment', dateInMonth(currentMonth, 28)),
    planned('demo-next-salary', 'Salário · previsão', 'income', 420_000, 'forecast', dateInMonth(nextMonth, 5)),
    planned('demo-next-rent', 'Moradia', 'expense', 160_000, 'commitment', dateInMonth(nextMonth, 5)),
    planned('demo-next-internet', 'Internet', 'expense', 12_900, 'forecast', dateInMonth(nextMonth, 12)),
    planned('demo-next-car', 'Transporte', 'expense', 65_000, 'forecast', dateInMonth(nextMonth, 18)),
  ];
}
