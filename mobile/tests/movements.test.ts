import assert from 'node:assert/strict';
import test from 'node:test';

import {
  listMovementsForMonth,
  monthAtOffset,
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
    amountMinor,
    nature,
    occurredOn: realized ? eventDate : null,
    expectedOn: realized ? null : eventDate,
    settledOn: realized ? cashDate : null,
    plannedSettlementOn: realized ? null : cashDate,
  };
}

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

  assert.throws(() => summarizeMonth([zero], '2026-10', 10000), RangeError);
  assert.throws(() => summarizeMonth([unsafe], '2026-10', 10000), RangeError);
  assert.throws(() => summarizeMonth([pendingWithSettlement], '2026-10', 10000), TypeError);
});
