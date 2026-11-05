import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { openingCashForMonth, projectCashMonths } from '../src/domain/projections.ts';
import { createDemoMovements, DEMO_OPENING_CASH_MINOR } from '../src/demo/demoData.ts';
import { estimateSafeToSpend, summarizeMonth, type Movement } from '../src/domain/movements.ts';

const opening = { month: '2026-10' as const, cash: DEMO_OPENING_CASH_MINOR };
const baseline = createDemoMovements('2026-10', '2026-10-25');
function pastExpense(amountMinor = 25000): Movement {
  return {
    id: 'forgotten', title: 'Despesa esquecida', currency: 'BRL', direction: 'expense',
    moneyType: 'digital', amountMinor, nature: 'realized', cardId: null, projectId: null,
    occurredOn: '2026-09-12', expectedOn: null, settledOn: '2026-09-12', plannedSettlementOn: null,
  };
}

test('retroactive entries adjust current and all future balances without inventing an earlier opening', () => {
  const before = projectCashMonths(baseline, baseline, opening, '2026-10-25', '2027-01');
  const after = projectCashMonths([...baseline, pastExpense()], baseline, opening, '2026-10-25', '2027-01');
  for (let index = 0; index < before.length; index += 1) {
    assert.equal(after[index].openingBalanceMinor, before[index].openingBalanceMinor - 25000);
    assert.equal(after[index].closingBalanceMinor, before[index].closingBalanceMinor - 25000);
    if (index > 0) assert.equal(after[index].openingBalanceMinor, after[index - 1].closingBalanceMinor);
  }
  assert.throws(() => openingCashForMonth(baseline, baseline, opening, '2026-09'), RangeError);
});

test('a correction already represented in the baseline changes the opening only by its delta', () => {
  const original = pastExpense(10000);
  const initialRecords = [...baseline, original];
  const edited = { ...original, amountMinor: 13000 };
  assert.deepEqual(openingCashForMonth([...baseline, edited], initialRecords, opening, '2026-10'), {
    digital: 332000, physical: 15000,
  });
  assert.deepEqual(openingCashForMonth(initialRecords, initialRecords, opening, '2026-10'), opening.cash);
});

test('moving a payment across the opening boundary counts it exactly once and preserves money type', () => {
  const expense = pastExpense(1000);
  const initialRecords = [...baseline, expense];
  const moved = { ...expense, moneyType: 'physical' as const, settledOn: '2026-10-15' as const };
  const result = projectCashMonths([...baseline, moved], initialRecords, opening, '2026-10-25', '2026-11');
  assert.equal(result[0].openingBalanceMinor, 351000);
  assert.equal(result[0].closingBalanceMinor, 474850);
  assert.deepEqual(openingCashForMonth([...baseline, { ...expense, moneyType: 'physical' }], initialRecords, opening, '2026-10'), {
    digital: 336000, physical: 14000,
  });
});

test('month rollover carries settled cash and overdue obligations, without confirming forecasts', () => {
  const result = projectCashMonths(baseline, baseline, opening, '2026-11-01', '2026-12');
  assert.equal(result[0].openingBalanceMinor, 539850);
  assert.equal(result[0].committedOutflowMinor, 186250);
  assert.equal(result[0].forecastOutflowMinor, 119900);
  assert.equal(result[0].closingBalanceMinor, 653700);
  assert.equal(result[1].openingBalanceMinor, result[0].closingBalanceMinor);
  assert.equal(baseline.find((record) => record.id === 'demo-electricity')!.plannedSettlementOn, '2026-10-28');
  assert.equal(result[0].realizedOutflowMinor, 0);
});

test('overdue pending cash appears once in the current projection even if planned in a prior month', () => {
  const overdue = {
    ...pastExpense(1000), nature: 'commitment' as const, settledOn: null,
    plannedSettlementOn: '2026-09-30' as const,
  };
  const result = projectCashMonths([overdue], [], opening, '2026-10-25', '2026-11');
  assert.equal(result[0].openingBalanceMinor, 350000);
  assert.equal(result[0].committedOutflowMinor, 1000);
  assert.equal(result[0].closingBalanceMinor, 349000);
  assert.equal(result[1].closingBalanceMinor, 349000);
  assert.equal(overdue.plannedSettlementOn, '2026-09-30');
});

test('the demo never presents a future fixture as an already confirmed payment', () => {
  for (const today of ['2026-10-01', '2026-10-06', '2026-10-25'] as const) {
    const records = createDemoMovements('2026-10', today);
    assert.ok(records.every((record) => record.nature !== 'realized' || record.settledOn! <= today));
    assert.equal(summarizeMonth(records, '2026-10', 350000).closingBalanceMinor, 474850);
  }
});

test('reports the first insufficient day independently from the date of the lowest balance', () => {
  const records: Movement[] = [
    { ...pastExpense(400), id: 'first', nature: 'commitment', settledOn: null, plannedSettlementOn: '2026-10-26' },
    { ...pastExpense(500), id: 'lowest', nature: 'commitment', settledOn: null, plannedSettlementOn: '2026-10-28' },
  ];
  const estimate = estimateSafeToSpend(records, {
    asOf: '2026-10-25', horizonDate: '2026-10-30', openingBalanceMinor: 1000,
    protectedMinor: 500, cushionMinor: 200, scenario: 'conservative',
  });
  assert.equal(estimate.firstInsufficientOn, '2026-10-26');
  assert.equal(estimate.lowestBalanceOn, '2026-10-28');
  assert.equal(estimate.spendableMinor, -600);
});

test('replays the documented October and November fixtures from the source JSON', () => {
  const source = JSON.parse(readFileSync(new URL('../../docs/18-cenarios-de-aceite.json', import.meta.url), 'utf8'));
  for (const id of ['OCT-01', 'NOV-01']) {
    const fixture = source.examples.find((entry: { id: string }) => entry.id === id);
    const income = { ...pastExpense(fixture.inflow), id: 'income', direction: 'income' as const, settledOn: '2026-10-02' as const };
    const expense = { ...pastExpense(fixture.outflow), settledOn: '2026-10-03' as const };
    assert.equal(summarizeMonth([income, expense], '2026-10', fixture.opening).closingBalanceMinor, fixture.expectedClosing);
  }
});

test('retroactive changes preserve their exact delta across many amounts and future months', () => {
  const before = projectCashMonths(baseline, baseline, opening, '2026-10-25', '2027-03');
  for (let amount = 1; amount < 100000; amount += 997) {
    const records = [...baseline, pastExpense(amount)];
    const after = projectCashMonths(records, baseline, opening, '2026-10-25', '2027-03');
    after.forEach((summary, index) => assert.equal(summary.closingBalanceMinor, before[index].closingBalanceMinor - amount));
    assert.deepEqual(projectCashMonths(records.slice().reverse(), baseline, opening, '2026-10-25', '2027-03'), after);
  }
});

test('rejects unsupported projection ranges and unsafe corrected cash', () => {
  assert.throws(() => projectCashMonths(baseline, baseline, opening, '2026-10-25', '2026-09'), RangeError);
  assert.throws(() => projectCashMonths(baseline, baseline, opening, '2026-02-30', '2026-11'), RangeError);
  assert.throws(() => openingCashForMonth([{ ...pastExpense(), direction: 'income' }], [], {
    month: '2026-10', cash: { digital: Number.MAX_SAFE_INTEGER, physical: 0 },
  }, '2026-10'), RangeError);
});

test('safe-spend insufficiency handles the threshold, current shortage and unsafe reserve sums', () => {
  const options = {
    asOf: '2026-10-25' as const, horizonDate: '2026-10-25' as const, openingBalanceMinor: 700,
    protectedMinor: 500, cushionMinor: 200, scenario: 'conservative' as const,
  };
  assert.equal(estimateSafeToSpend([], options).firstInsufficientOn, null);
  assert.equal(estimateSafeToSpend([], { ...options, openingBalanceMinor: 699 }).firstInsufficientOn, '2026-10-25');
  assert.throws(() => estimateSafeToSpend([], { ...options, protectedMinor: Number.MAX_SAFE_INTEGER }), RangeError);
});
