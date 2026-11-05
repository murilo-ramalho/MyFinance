import assert from 'node:assert/strict';
import test from 'node:test';
import { exportMovementsCsv, parseCsv, previewMovementsCsv } from '../src/application/movementCsv.ts';
import { createDemoBook } from '../src/demo/demoData.ts';
import { applyFinanceCommand } from '../src/domain/bookCommands.ts';

test('CSV round-trip preserves date precision, unknown dates and two distinct equal-value sales', () => {
  const book = createDemoBook('2026-10', '2026-10-25');
  const records = ['LETREIRO', 'ZOKI'].map((title) => ({ ...book.movements[0], id: title.toLowerCase(), title, amountMinor: 12000 }));
  const preview = previewMovementsCsv(exportMovementsCsv(records), book);
  assert.equal(preview.records.length, 2);
  assert.equal(preview.records[0].amountMinor, 12000);
  assert.equal(preview.records[1].occurredOn, records[1].occurredOn);
  assert.deepEqual(preview.duplicateIds, []);
  assert.equal(preview.records[0].occurredTime, null);
});

test('quoted separators, quotes and line breaks remain text; spreadsheet formula prefixes are escaped', () => {
  const book = createDemoBook('2026-10', '2026-10-25');
  const record = { ...book.movements[0], title: '=SUM(1;2)\n"texto"' };
  const exported = exportMovementsCsv([record]);
  assert.ok(exported.includes("'=SUM"));
  assert.equal(previewMovementsCsv(exported, book).records[0].title, record.title);
  assert.deepEqual(parseCsv('a;"b;c";"d""e"\r\n'), [['a', 'b;c', 'd"e']]);
  for (const invalid of ['a;"unfinished', 'a;"closed"extra', 'a;b"invalid']) assert.throws(() => parseCsv(invalid));
});

test('duplicate IDs are reported without merging and contradictory installment labels require review', () => {
  const book = createDemoBook('2026-10', '2026-10-25');
  const records = [{ ...book.movements[0], title: 'INGLÊS 1/10' }, { ...book.movements[1], title: 'INGLÊS 2/11' }];
  const preview = previewMovementsCsv(exportMovementsCsv(records), book);
  assert.equal(preview.duplicateIds.length, 2);
  assert.equal(preview.warnings.length, 3);
  assert.throws(() => previewMovementsCsv(exportMovementsCsv([records[0], records[0]]), book));
});

test('invalid currency, references and future confirmations reject the entire import without partial writes', () => {
  const book = createDemoBook('2026-10', '2026-10-25');
  const snapshot = JSON.stringify(book);
  const valid = { ...book.movements[0], id: 'new-record' };
  assert.throws(() => previewMovementsCsv(exportMovementsCsv([{ ...valid, currency: 'USD' as 'BRL' }]), book));
  assert.throws(() => previewMovementsCsv(exportMovementsCsv([{ ...valid, accountId: 'missing' }]), book));
  assert.throws(() => applyFinanceCommand(book, { kind: 'import-movements', movements: [valid, { ...valid, id: 'future', settledOn: '2027-01-01' }] }, {
    requestId: 'import', recordedAt: '2026-10-25T15:00:00.000Z', today: '2026-10-25',
  }));
  assert.equal(JSON.stringify(book), snapshot);
});
