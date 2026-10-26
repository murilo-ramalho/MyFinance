import assert from 'node:assert/strict';
import test from 'node:test';

import {
  currentCashByType,
  estimateSafeToSpend,
  listMovementsForMonth,
  monthAtOffset,
  summarizeProjectFlow,
  summarizeMonth,
  type CivilDate,
  type Movement,
  type MovementDirection,
  type MovementNature,
} from '../src/domain/movements.ts';

function movement(
  id: string,
  direction: MovementDirection,
  amountMinor: number,
  cashDate: CivilDate,
  eventDate: CivilDate,
  nature: MovementNature = 'realized',
): Movement {
  const realized = nature === 'realized';
  return {
    id,
    title: id,
    currency: 'BRL',
    direction,
    moneyType: 'digital',
    amountMinor,
    nature,
    cardId: null,
    projectId: null,
    occurredOn: realized ? eventDate : null,
    expectedOn: realized ? null : eventDate,
    settledOn: realized ? cashDate : null,
    plannedSettlementOn: realized ? null : cashDate,
  };
}

test('separates digital and physical settled cash and ignores investments and pending items', () => {
  const movements = [
    { ...movement('digital-expense', 'expense', 300, '2026-10-03', '2026-10-03'), moneyType: 'digital' as const },
    { ...movement('physical-income', 'income', 120, '2026-10-04', '2026-10-04'), moneyType: 'physical' as const },
    { ...movement('digital-future', 'income', 700, '2026-10-10', '2026-10-10', 'forecast'), moneyType: 'digital' as const },
    { ...movement('physical-later', 'expense', 90, '2026-10-26', '2026-10-26'), moneyType: 'physical' as const },
  ];

  const cashByType = currentCashByType(movements, '2026-10', '2026-10-25', { digital: 1000, physical: 500 });
  assert.deepEqual(cashByType, { digital: 700, physical: 620 });
  assert.equal(cashByType.digital + cashByType.physical, 1320);
  assert.throws(
    () => currentCashByType(movements, '2026-09', '2026-10-25', { digital: 1000, physical: 500 }),
    RangeError,
  );
});

test('card and project labels organize one movement without adding another cash flow', () => {
  const untagged = movement('single-purchase', 'expense', 3250, '2026-11-10', '2026-10-28', 'commitment');
  const tagged = { ...untagged, cardId: 'demo-card', projectId: 'printer-3d' };

  const untaggedSummary = summarizeMonth([untagged], '2026-11', 10000);
  const taggedSummary = summarizeMonth([tagged], '2026-11', 10000);

  assert.deepEqual(taggedSummary, untaggedSummary);
  assert.equal(taggedSummary.outflowMinor, 3250);
});

test('summarizes project cash flow by realized, committed, and forecast movements', () => {
  const movements = [
    { ...movement('printer-sale', 'income', 12000, '2026-10-03', '2026-10-03'), projectId: 'printer' },
    { ...movement('printer-material', 'expense', 8487, '2026-10-04', '2026-10-04'), projectId: 'printer' },
    { ...movement('printer-committed-income', 'income', 2500, '2026-10-10', '2026-10-10', 'commitment'), projectId: 'printer' },
    { ...movement('printer-committed-cost', 'expense', 1000, '2026-10-11', '2026-10-11', 'commitment'), projectId: 'printer' },
    { ...movement('printer-forecast-income', 'income', 5000, '2026-10-20', '2026-10-20', 'forecast'), projectId: 'printer' },
    { ...movement('printer-forecast-cost', 'expense', 2500, '2026-10-21', '2026-10-21', 'forecast'), projectId: 'printer' },
    { ...movement('diet-cost', 'expense', 9000, '2026-10-05', '2026-10-05'), projectId: 'diet' },
  ];

  assert.deepEqual(summarizeProjectFlow(movements, 'printer'), {
    currency: 'BRL',
    realized: { inflowMinor: 12000, outflowMinor: 8487, netMinor: 3513 },
    commitment: { inflowMinor: 2500, outflowMinor: 1000, netMinor: 1500 },
    forecast: { inflowMinor: 5000, outflowMinor: 2500, netMinor: 2500 },
    projectedNetMinor: 7513,
  });
  assert.equal(summarizeProjectFlow(movements, 'diet').realized.netMinor, -9000);
  assert.equal(summarizeProjectFlow(movements, 'diet').projectedNetMinor, -9000);
});

test('rejects project cash-flow totals outside safe integer centavos', () => {
  const movements = [
    { ...movement('large-sale', 'income', Number.MAX_SAFE_INTEGER, '2026-10-03', '2026-10-03'), projectId: 'printer' },
    { ...movement('extra-cent', 'income', 1, '2026-10-04', '2026-10-04'), projectId: 'printer' },
  ];

  assert.throws(() => summarizeProjectFlow(movements, 'printer'), RangeError);
});

test('posts cash on its effective date while retaining the economic event date', () => {
  const earlyPayment = movement('early-payment', 'expense', 2500, '2026-10-30', '2026-11-02');
  const latePayment = movement('late-payment', 'expense', 3500, '2026-12-02', '2026-11-30');

  const october = summarizeMonth([earlyPayment], '2026-10', 10000);
  const november = summarizeMonth([earlyPayment, latePayment], '2026-11', october.closingBalanceMinor);
  const december = summarizeMonth([earlyPayment, latePayment], '2026-12', november.closingBalanceMinor);

  assert.equal(october.outflowMinor, 2500);
  assert.equal(october.closingBalanceMinor, 7500);
  assert.equal(november.outflowMinor, 0);
  assert.equal(november.closingBalanceMinor, 7500);
  assert.equal(december.outflowMinor, 3500);
  assert.equal(december.closingBalanceMinor, 4000);
});

test('keeps the lowest daily balance negative even when the month later recovers', () => {
  const movements = [
    movement('salary', 'income', 50000, '2026-10-02', '2026-10-02'),
    movement('rent', 'expense', 70000, '2026-10-12', '2026-10-12'),
    movement('refund', 'income', 10000, '2026-10-22', '2026-10-22'),
  ];

  const summary = summarizeMonth(movements, '2026-10', 10000);

  assert.equal(summary.openingBalanceMinor, 10000);
  assert.equal(summary.inflowMinor, 60000);
  assert.equal(summary.outflowMinor, 70000);
  assert.equal(summary.closingBalanceMinor, 0);
  assert.equal(summary.lowestBalanceMinor, -10000);
  assert.equal(summary.lowestBalanceOn, '2026-10-12');
});

test('does not invent an intraday ordering for movements without times', () => {
  const sameDay = [
    movement('a-expense', 'expense', 400, '2026-10-05', '2026-10-05'),
    movement('z-income', 'income', 500, '2026-10-05', '2026-10-05'),
  ];

  const summary = summarizeMonth(sameDay, '2026-10', 100);

  assert.equal(summary.inflowMinor, 500);
  assert.equal(summary.outflowMinor, 400);
  assert.equal(summary.closingBalanceMinor, 200);
  assert.equal(summary.lowestBalanceMinor, 100);
  assert.equal(summary.lowestBalanceOn, '2026-10-01');
});

test('includes forecast and commitment cash dates without treating them as settled', () => {
  const expected = movement('forecast', 'expense', 15000, '2026-10-10', '2026-10-05', 'forecast');
  const committed = movement('bill', 'expense', 5000, '2026-10-20', '2026-10-20', 'commitment');
  const summary = summarizeMonth([expected, committed], '2026-10', 10000);

  assert.equal(expected.settledOn, null);
  assert.equal(committed.settledOn, null);
  assert.equal(summary.outflowMinor, 20000);
  assert.equal(summary.realizedOutflowMinor, 0);
  assert.equal(summary.committedOutflowMinor, 5000);
  assert.equal(summary.forecastOutflowMinor, 15000);
  assert.equal(summary.closingBalanceMinor, -10000);
  assert.equal(summary.lowestBalanceOn, '2026-10-20');
});

test('lists movements by event date rather than moving them to their cash date', () => {
  const early = movement('early', 'expense', 100, '2026-10-28', '2026-11-02');
  const late = movement('late', 'expense', 200, '2026-12-02', '2026-11-30');
  const expected = movement('expected', 'expense', 300, '2026-11-15', '2026-11-10', 'forecast');

  assert.deepEqual(listMovementsForMonth([early, late, expected], '2026-10').map(({ id }) => id), []);
  assert.deepEqual(
    listMovementsForMonth([early, late, expected], '2026-11').map(({ id }) => id),
    ['late', 'expected', 'early'],
  );
});

test('sorts equal-day movements deterministically and does not mutate their source array', () => {
  const source = [
    movement('a', 'income', 100, '2026-10-04', '2026-10-04'),
    movement('z', 'income', 100, '2026-10-04', '2026-10-04'),
  ];

  assert.deepEqual(listMovementsForMonth(source, '2026-10').map(({ id }) => id), ['z', 'a']);
  assert.deepEqual(source.map(({ id }) => id), ['a', 'z']);
});

test('keeps same-day sales with equal values as distinct movements', () => {
  const sales = [
    movement('letreiro', 'income', 12000, '2026-10-08', '2026-10-08'),
    movement('zoki', 'income', 12000, '2026-10-08', '2026-10-08'),
  ];
  const summary = summarizeMonth(sales, '2026-10', 0);

  assert.equal(listMovementsForMonth(sales, '2026-10').length, 2);
  assert.equal(summary.inflowMinor, 24000);
});

test('matches the documented November acceptance fixture in integer centavos', () => {
  const summary = summarizeMonth(
    [
      movement('november-income', 'income', 241000, '2026-11-03', '2026-11-03'),
      movement('november-expenses', 'expense', 194212, '2026-11-22', '2026-11-22'),
    ],
    '2026-11',
    30891,
  );

  assert.equal(summary.closingBalanceMinor, 77679);
});

test('advances and rewinds months across year boundaries', () => {
  assert.equal(monthAtOffset('2026-12', 1), '2027-01');
  assert.equal(monthAtOffset('2027-01', -1), '2026-12');
  assert.equal(monthAtOffset('2026-03', -12), '2025-03');
  assert.equal(monthAtOffset('2026-10', 0), '2026-10');
  assert.equal(monthAtOffset('0001-12', 1), '0002-01');
  assert.throws(() => monthAtOffset('0001-01', -1), RangeError);
  assert.throws(() => monthAtOffset('9999-12', 1), RangeError);
  assert.throws(() => monthAtOffset('2026-13', 0), RangeError);
});

test('rejects invalid month offsets and unsafe balances instead of returning misleading totals', () => {
  assert.throws(() => monthAtOffset('2026-10', 0.5), RangeError);
  assert.throws(() => monthAtOffset('2026-10', Number.MAX_SAFE_INTEGER + 1), RangeError);
  assert.throws(() => summarizeMonth([], '2026-10', Number.MAX_SAFE_INTEGER + 1), RangeError);
  assert.throws(
    () => summarizeMonth([movement('too-large', 'income', 1, '2026-10-01', '2026-10-01')], '2026-10', Number.MAX_SAFE_INTEGER),
    RangeError,
  );
});

test('rejects invalid movement amounts and inconsistent settlement states', () => {
  const zero = movement('zero', 'expense', 0, '2026-10-01', '2026-10-01');
  const unsafe = movement('unsafe', 'expense', Number.MAX_SAFE_INTEGER + 1, '2026-10-01', '2026-10-01');
  const pendingWithSettlement = {
    ...movement('pending', 'expense', 100, '2026-10-01', '2026-10-01', 'forecast'),
    settledOn: '2026-10-01' as CivilDate,
  };
  const creditAsRealized = {
    ...movement('credit-as-realized', 'expense', 100, '2026-10-01', '2026-10-01'),
    cardId: 'demo-card',
  };
  const creditFromPhysicalCash = {
    ...movement('credit-from-physical', 'expense', 100, '2026-10-01', '2026-10-01', 'commitment'),
    cardId: 'demo-card',
    moneyType: 'physical' as const,
  };

  assert.throws(() => summarizeMonth([zero], '2026-10', 10000), RangeError);
  assert.throws(() => summarizeMonth([unsafe], '2026-10', 10000), RangeError);
  assert.throws(() => summarizeMonth([pendingWithSettlement], '2026-10', 10000), TypeError);
  assert.throws(() => summarizeMonth([creditAsRealized], '2026-10', 10000), TypeError);
  assert.throws(() => summarizeMonth([creditFromPhysicalCash], '2026-10', 10000), TypeError);
});

test('matches the documented safe-spend example using the lowest daily balance', () => {
  const estimate = estimateSafeToSpend([
    movement('expense-a', 'expense', 120000, '2026-10-10', '2026-10-10', 'forecast'),
    movement('expense-b', 'expense', 86000, '2026-10-12', '2026-10-12', 'commitment'),
  ], {
    asOf: '2026-10-01',
    horizonDate: '2026-10-31',
    openingBalanceMinor: 350000,
    protectedMinor: 0,
    cushionMinor: 20000,
    scenario: 'conservative',
  });

  assert.equal(estimate.lowestProjectedBalanceMinor, 144000);
  assert.equal(estimate.spendableMinor, 124000);
  assert.equal(estimate.lowestBalanceOn, '2026-10-12');
});

test('conservative safe-spend excludes uncertain income while expected includes it', () => {
  const movements = [
    movement('expense-before-income', 'expense', 15000, '2026-11-02', '2026-11-02', 'forecast'),
    movement('uncertain-income', 'income', 50000, '2026-11-03', '2026-11-03', 'forecast'),
    movement('expense-on-income-day', 'expense', 10000, '2026-11-03', '2026-11-03', 'commitment'),
  ];
  const common = {
    asOf: '2026-11-01' as CivilDate,
    horizonDate: '2026-11-03' as CivilDate,
    openingBalanceMinor: 20000,
    protectedMinor: 0,
    cushionMinor: 0,
  };

  const conservative = estimateSafeToSpend(movements, { ...common, scenario: 'conservative' });
  const expected = estimateSafeToSpend(movements, { ...common, scenario: 'expected' });

  assert.equal(conservative.spendableMinor, -5000);
  assert.equal(expected.spendableMinor, 5000);
  assert.equal(conservative.lowestBalanceOn, '2026-11-03');
  assert.equal(expected.lowestBalanceOn, '2026-11-02');
});

test('starts from settled cash and treats overdue pending items as due now', () => {
  const estimate = estimateSafeToSpend([
    movement('paid-this-month', 'income', 3000, '2026-11-02', '2026-11-02'),
    movement('overdue-bill', 'expense', 4000, '2026-10-30', '2026-10-30', 'commitment'),
  ], {
    asOf: '2026-11-03',
    horizonDate: '2026-11-03',
    openingBalanceMinor: 10000,
    protectedMinor: 0,
    cushionMinor: 0,
    scenario: 'conservative',
  });

  assert.equal(estimate.currentCashMinor, 13000);
  assert.equal(estimate.lowestProjectedBalanceMinor, 9000);
  assert.equal(estimate.lowestBalanceOn, '2026-11-03');
});

test('preserves negative safe-spend estimates and rejects invalid horizons and reserves', () => {
  const negative = estimateSafeToSpend([], {
    asOf: '2026-10-01',
    horizonDate: '2026-10-01',
    openingBalanceMinor: -1000,
    protectedMinor: 500,
    cushionMinor: 200,
    scenario: 'conservative',
  });
  assert.equal(negative.spendableMinor, -1700);

  assert.throws(() => estimateSafeToSpend([], {
    asOf: '2026-10-02',
    horizonDate: '2026-10-01',
    openingBalanceMinor: 1000,
    protectedMinor: 0,
    cushionMinor: 0,
    scenario: 'conservative',
  }), RangeError);
  assert.throws(() => estimateSafeToSpend([], {
    asOf: '2026-02-30' as CivilDate,
    horizonDate: '2026-03-01',
    openingBalanceMinor: 1000,
    protectedMinor: 0,
    cushionMinor: 0,
    scenario: 'conservative',
  }), RangeError);
  assert.throws(() => estimateSafeToSpend([], {
    asOf: '2026-10-01',
    horizonDate: '2026-10-01',
    openingBalanceMinor: 1000,
    protectedMinor: -1,
    cushionMinor: 0,
    scenario: 'conservative',
  }), RangeError);
});
