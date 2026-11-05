import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryMovementStore, type SaveMovementCommand } from '../src/application/movementStore.ts';
import { createDemoMovements } from '../src/demo/demoData.ts';
import { summarizeMonth } from '../src/domain/movements.ts';

const initial = createDemoMovements('2026-10', '2026-10-25');
function command(overrides: Partial<SaveMovementCommand> = {}): SaveMovementCommand {
  return {
    requestId: 'request-1', recordedAt: '2026-10-25T15:00:00.000Z', today: '2026-10-25',
    movement: { ...initial[0], id: 'new', title: 'Novo recebimento', amountMinor: 12000 }, ...overrides,
  };
}

test('stores and reads movement data without leaking mutable references', () => {
  const records = initial.map((record) => ({ ...record }));
  const store = new MemoryMovementStore(records);
  records[0].amountMinor = 1;
  const input = command();
  store.save(input);
  input.movement.amountMinor = 2;
  const read = store.list();
  read[0].title = 'Changed externally';
  read.pop();
  assert.equal(store.list()[0].amountMinor, 420000);
  assert.equal(store.list()[0].title, initial[0].title);
  assert.equal(store.list().find((record) => record.id === 'new')!.amountMinor, 12000);
  assert.equal(store.list().length, initial.length + 1);
});

test('keeps the original forecast and every revision while reconciliation affects cash once', () => {
  const store = new MemoryMovementStore(initial);
  const forecast = initial.find((record) => record.id === 'demo-groceries')!;
  store.save(command({ movement: {
    ...forecast, nature: 'realized', amountMinor: 45000, occurredOn: '2026-10-25',
    expectedOn: null, settledOn: '2026-10-25', plannedSettlementOn: null,
  } }));
  const audit = store.history()[0];
  assert.equal(audit.before!.amountMinor, 42000);
  assert.equal(audit.before!.plannedSettlementOn, '2026-10-27');
  assert.equal(audit.after.amountMinor, 45000);
  assert.equal(audit.recordedAt, '2026-10-25T15:00:00.000Z');
  assert.equal(store.list().length, initial.length);
  assert.equal(summarizeMonth(store.list(), '2026-10', 350000).closingBalanceMinor, 471850);
  audit.before!.amountMinor = 1;
  audit.after.amountMinor = 1;
  assert.equal(store.history()[0].before!.amountMinor, 42000);
  assert.equal(store.history()[0].after.amountMinor, 45000);
});

test('repeated requests are idempotent and conflicting reuse leaves records and audit untouched', () => {
  const store = new MemoryMovementStore(initial);
  const input = command();
  store.save(input);
  store.save(structuredClone(input));
  assert.equal(store.history().length, 1);
  assert.equal(store.list().length, initial.length + 1);
  const before = store.list();
  assert.throws(() => store.save({ ...input, movement: { ...input.movement, amountMinor: 100 } }), TypeError);
  assert.deepEqual(store.list(), before);
  assert.equal(store.history().length, 1);
});

test('failed validation commits neither movement nor audit nor idempotency marker', () => {
  const store = new MemoryMovementStore(initial);
  for (const invalid of [
    command({ movement: { ...command().movement, amountMinor: 0 } }),
    command({ recordedAt: '2026-02-30T15:00:00.000Z' }),
    command({ movement: { ...command().movement, settledOn: '2026-10-26' } }),
    command({ today: '2026-02-30' }),
    command({ requestId: '' }),
  ]) {
    assert.throws(() => store.save(invalid));
    assert.deepEqual(store.list(), initial);
    assert.deepEqual(store.history(), []);
  }
  store.save(command());
  assert.equal(store.history().length, 1);
});

test('distinct same-day sales persist separately; duplicate identities are rejected on initialization', () => {
  const store = new MemoryMovementStore([]);
  store.save(command({ movement: { ...command().movement, id: 'letreiro', title: 'LETREIRO' } }));
  store.save(command({ requestId: 'request-2', movement: { ...command().movement, id: 'zoki', title: 'ZOKI' } }));
  assert.equal(store.list().length, 2);
  assert.throws(() => new MemoryMovementStore([initial[0], initial[0]]), TypeError);
});

test('retains separate fact, expected and effective dates through repeated edits', () => {
  const store = new MemoryMovementStore(initial);
  const expense = initial.find((record) => record.id === 'demo-rent')!;
  store.save(command({ movement: { ...expense, title: 'Moradia corrigida', settledOn: '2026-09-30' } }));
  store.save(command({ requestId: 'request-2', movement: { ...store.list().find((record) => record.id === expense.id)!, amountMinor: 170000 } }));
  assert.equal(store.list().find((record) => record.id === expense.id)!.occurredOn, '2026-10-05');
  assert.equal(store.history()[0].before!.settledOn, '2026-10-05');
  assert.equal(store.history()[1].before!.settledOn, '2026-09-30');
  assert.equal(store.history()[1].after.amountMinor, 170000);
});

test('replaying an earlier successful request never reverts a later revision', () => {
  const store = new MemoryMovementStore(initial);
  const first = command();
  store.save(first);
  store.save(command({ requestId: 'request-2', movement: { ...first.movement, amountMinor: 13000 } }));
  store.save(first);
  assert.equal(store.list().find((record) => record.id === first.movement.id)!.amountMinor, 13000);
  assert.equal(store.history().length, 2);
});
