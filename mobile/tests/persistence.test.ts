import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BookRepository, openCipherRepository, type BookDatabase, type SqlValue } from '../src/persistence/bookRepository.ts';
import { createDemoBook } from '../src/demo/demoData.ts';
import { applyFinanceCommand } from '../src/domain/bookCommands.ts';
import { accountBalance } from '../src/domain/bookSelectors.ts';
import { FinanceStore } from '../src/application/financeStore.ts';

function adapter(database: DatabaseSync): BookDatabase {
  return {
    execSync: (sql) => database.exec(sql),
    runSync: (sql, ...parameters: SqlValue[]) => database.prepare(sql).run(...parameters),
    getAllSync: <T>(sql: string, ...parameters: SqlValue[]) => database.prepare(sql).all(...parameters) as T[],
    getFirstSync: <T>(sql: string, ...parameters: SqlValue[]) => database.prepare(sql).get(...parameters) as T ?? null,
    closeSync: () => database.close(),
  };
}
const context = { requestId: 'save-reserve', today: '2026-10-25' as const, recordedAt: '2026-10-25T15:00:00.000Z' };

test('real SQLite schema initializes idempotently and round-trips all demo data and audit', () => {
  const database = new DatabaseSync(':memory:');
  const repository = new BookRepository(adapter(database));
  try {
    repository.initialize(); repository.initialize();
    assert.equal(repository.load(), null);
    const book = applyFinanceCommand(createDemoBook('2026-10', '2026-10-25'), { kind: 'save-reserve',
      reserve: { id: 'emergency', name: 'Emergência', accountId: 'digital', amountMinor: 20000 } }, context);
    repository.save(book, null);
    assert.deepEqual(repository.load(), book);
    assert.equal(database.prepare('PRAGMA foreign_keys').get()!.foreign_keys, 1);
    assert.equal(database.prepare('PRAGMA user_version').get()!.user_version, 1);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { repository.close(); }
});

test('synthetic data survive a SQLite close/reopen; this is a schema test, not SQLCipher certification', () => {
  const directory = mkdtempSync(join(tmpdir(), 'myfinance-synthetic-'));
  const file = join(directory, 'test.sqlite');
  const book = createDemoBook('2026-10', '2026-10-25');
  try {
    const first = new BookRepository(adapter(new DatabaseSync(file)));
    first.initialize(); first.save(book, null); first.close();
    const second = new BookRepository(adapter(new DatabaseSync(file)));
    try {
      second.initialize();
      assert.deepEqual(second.load(), book);
      assert.equal(accountBalance(second.load()!, 'digital', '2026-10-25'), 533600);
    } finally { second.close(); }
  } finally { unlinkSync(file); rmdirSync(directory); }
});

test('real foreign keys and integer constraints reject orphan references and fractional centavos', () => {
  const database = new DatabaseSync(':memory:');
  const repository = new BookRepository(adapter(database));
  try {
    repository.initialize();
    assert.throws(() => database.prepare('INSERT INTO obligations (id,payload) VALUES (?,?)').run('orphan', JSON.stringify({ id: 'orphan', operationId: 'missing', amountMinor: 100 })));
    assert.throws(() => database.prepare('INSERT INTO obligations (id,payload) VALUES (?,?)').run('fraction', JSON.stringify({ id: 'fraction', amountMinor: 1.5 })));
    assert.equal(database.prepare('SELECT count(*) AS total FROM obligations').get()!.total, 0);
  } finally { repository.close(); }
});

test('a real SQLite failure halfway through replacement rolls back records, metadata, requests and audit', () => {
  const database = new DatabaseSync(':memory:');
  const repository = new BookRepository(adapter(database));
  try {
    repository.initialize();
    const book = createDemoBook('2026-10', '2026-10-25');
    repository.save(book, null);
    database.exec("CREATE TRIGGER reject_reserve BEFORE INSERT ON reserves BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
    const changed = applyFinanceCommand(book, { kind: 'save-reserve', reserve: { ...book.reserves[0], amountMinor: 20000 } }, context);
    assert.throws(() => repository.save(changed, 0));
    assert.deepEqual(repository.load(), book);
  } finally { repository.close(); }
});

test('stale revisions cannot overwrite a newer persisted book and failed writes do not publish UI state', () => {
  const database = new DatabaseSync(':memory:');
  const repository = new BookRepository(adapter(database));
  try {
    repository.initialize(); const book = createDemoBook('2026-10', '2026-10-25'); repository.save(book, null);
    const changed = applyFinanceCommand(book, { kind: 'set-cushion', amountMinor: 10000 }, context);
    repository.save(changed, 0);
    assert.throws(() => repository.save(book, 0));
    assert.deepEqual(repository.load(), changed);
    const store = new FinanceStore(book, (next, expected) => repository.save(next, expected));
    assert.throws(() => store.execute({ kind: 'set-cushion', amountMinor: 15000 }, { ...context, requestId: 'stale' }));
    assert.deepEqual(store.snapshot(), book);
  } finally { repository.close(); }
});

test('SQLCipher gate rejects a real plaintext SQLite runtime before sending the key or creating tables', () => {
  const database = new DatabaseSync(':memory:');
  let keySent = false;
  let closed = false;
  const port = adapter(database);
  const observed: BookDatabase = { ...port, execSync: (sql) => { if (sql.includes('PRAGMA key')) keySent = true; port.execSync(sql); },
    closeSync: () => { closed = true; } };
  try {
    assert.throws(() => openCipherRepository(() => observed, randomBytes(32)), /SQLCipher/);
    assert.equal(keySent, false); assert.equal(closed, true);
    assert.equal(database.prepare('SELECT count(*) AS total FROM sqlite_master').get()!.total, 0);
  } finally { database.close(); }
});

test('parameter binding preserves SQL-shaped titles without executing them', () => {
  const database = new DatabaseSync(':memory:');
  const repository = new BookRepository(adapter(database));
  try {
    repository.initialize(); const book = createDemoBook('2026-10', '2026-10-25');
    book.movements[0].title = "'); DROP TABLE accounts; --";
    repository.save(book, null);
    assert.equal(repository.load()!.movements[0].title, book.movements[0].title);
    assert.equal(repository.load()!.accounts.length, 3);
  } finally { repository.close(); }
});

test('an unsupported schema version is refused without destructive migration', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA user_version = 99');
    assert.throws(() => new BookRepository(adapter(database)).initialize(), /mais recente/);
    assert.equal(database.prepare('PRAGMA user_version').get()!.user_version, 99);
  } finally { database.close(); }
});

test('an interrupted schema migration rolls back tables and version and can be retried cleanly', () => {
  const database = new DatabaseSync(':memory:');
  const port = adapter(database);
  try {
    const failing = new BookRepository({ ...port, execSync: (sql) => {
      if (sql.includes('CREATE TABLE obligations')) throw new Error('synthetic migration failure');
      port.execSync(sql);
    } });
    assert.throws(() => failing.initialize());
    assert.equal(database.prepare('PRAGMA user_version').get()!.user_version, 0);
    assert.equal(database.prepare('SELECT count(*) AS total FROM sqlite_master').get()!.total, 0);
    new BookRepository(port).initialize();
    assert.equal(database.prepare('PRAGMA user_version').get()!.user_version, 1);
  } finally { database.close(); }
});
