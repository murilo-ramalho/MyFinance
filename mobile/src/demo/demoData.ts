import type { CivilDate, Movement, YearMonth } from '../domain/movements';
import { daysInMonth } from '../domain/dates';
import { monthAtOffset } from '../domain/movements';

export const DEMO_OPENING_CASH_MINOR = { digital: 335_000, physical: 15_000 } as const;
export const DEMO_OPENING_BALANCE_MINOR = DEMO_OPENING_CASH_MINOR.digital + DEMO_OPENING_CASH_MINOR.physical;
export const DEMO_PROTECTED_RESERVE_MINOR = 50_000;
export const DEMO_SPENDING_CUSHION_MINOR = 20_000;
export const DEMO_INVESTMENT_BALANCE_MINOR = 125_000;

export const DEMO_CARDS = [{ id: 'demo-card', name: 'Cartão de demonstração' }] as const;
export type Project = {
  id: string;
  name: string;
  description: string;
};

export const DEMO_PROJECTS: readonly Project[] = [
  { id: 'food', name: 'Alimentação', description: 'Compras e despesas do dia a dia.' },
  { id: 'printer-3d', name: 'Impressora 3D', description: 'Materiais e vendas da impressão 3D.' },
];

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
  labels: Partial<Pick<Movement, 'moneyType' | 'cardId' | 'projectId'>> = {},
): Movement {
  return {
    id,
    title,
    currency: 'BRL',
    direction,
    moneyType: labels.moneyType ?? 'digital',
    amountMinor,
    nature: 'realized',
    cardId: labels.cardId ?? null,
    projectId: labels.projectId ?? null,
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
  labels: Partial<Pick<Movement, 'moneyType' | 'cardId' | 'projectId'>> = {},
  eventDate: CivilDate = cashDate,
): Movement {
  return {
    id,
    title,
    currency: 'BRL',
    direction,
    moneyType: labels.moneyType ?? 'digital',
    amountMinor,
    nature,
    cardId: labels.cardId ?? null,
    projectId: labels.projectId ?? null,
    occurredOn: null,
    expectedOn: eventDate,
    plannedSettlementOn: cashDate,
    settledOn: null,
  };
}

export function createDemoMovements(currentMonth: YearMonth): Movement[] {
  const nextMonth = monthAtOffset(currentMonth, 1);

  return [
    realized('demo-salary', 'Salário de demonstração', 'income', 420_000, dateInMonth(currentMonth, 5)),
    realized('demo-rent', 'Moradia', 'expense', 160_000, dateInMonth(currentMonth, 5)),
    realized('demo-market', 'Mercado', 'expense', 48_500, dateInMonth(currentMonth, 9), { projectId: 'food' }),
    realized('demo-internet-paid', 'Internet', 'expense', 12_900, dateInMonth(currentMonth, 12)),
    realized('demo-pharmacy', 'Farmácia', 'expense', 8_750, dateInMonth(currentMonth, 18), { moneyType: 'physical' }),
    planned('demo-groceries', 'Mercado · previsão', 'expense', 42_000, 'forecast', dateInMonth(currentMonth, 27), { projectId: 'food' }),
    planned('demo-electricity', 'Conta de luz', 'expense', 23_000, 'commitment', dateInMonth(currentMonth, 28)),
    planned('demo-next-salary', 'Salário · previsão', 'income', 420_000, 'forecast', dateInMonth(nextMonth, 5)),
    planned('demo-next-rent', 'Moradia', 'expense', 160_000, 'commitment', dateInMonth(nextMonth, 5)),
    planned('demo-next-internet', 'Internet', 'expense', 12_900, 'forecast', dateInMonth(nextMonth, 12)),
    planned('demo-next-car', 'Transporte', 'expense', 65_000, 'forecast', dateInMonth(nextMonth, 18)),
    planned(
      'demo-card-purchase',
      'Material de teste · compra prevista no cartão',
      'expense',
      3_250,
      'commitment',
      dateInMonth(nextMonth, 10),
      { cardId: 'demo-card', projectId: 'printer-3d' },
      dateInMonth(currentMonth, 28),
    ),
  ];
}
