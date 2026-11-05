import { BOOK_TABLES, validateBook } from '../domain/bookCommands.ts';
import { emptyBook, type FinanceBook } from '../domain/book.ts';

export type SqlValue = string | number | null;
export interface BookDatabase {
  execSync(sql: string): void;
  runSync(sql: string, ...parameters: SqlValue[]): unknown;
  getAllSync<T>(sql: string, ...parameters: SqlValue[]): T[];
  getFirstSync<T>(sql: string, ...parameters: SqlValue[]): T | null;
  closeSync(): void;
}

const RELATIONS: Partial<Record<typeof BOOK_TABLES[number], Record<string, string>>> = {
  movements: { accountId: 'accounts', categoryId: 'categories', projectId: 'projects', cardId: 'cards' },
  operations: { accountId: 'accounts', categoryId: 'categories', projectId: 'projects', cardId: 'cards', planId: 'plans' },
  obligations: { operationId: 'operations' },
  settlements: { obligationId: 'obligations', accountId: 'accounts', creditRefundId: 'refunds' },
  refunds: { operationId: 'operations', accountId: 'accounts', cardId: 'cards' },
  transfers: { fromAccountId: 'accounts', toAccountId: 'accounts' },
  reserves: { accountId: 'accounts' }, plans: { projectId: 'projects', convertedOperationId: 'operations' },
  budgets: { categoryId: 'categories' }, recurrenceRules: { accountId: 'accounts', categoryId: 'categories', projectId: 'projects' },
  recurrenceExceptions: { ruleId: 'recurrenceRules' }, stockLots: { itemId: 'stockItems', operationId: 'operations' },
  stockUses: { itemId: 'stockItems', projectId: 'projects' },
  productionCosts: { projectId: 'projects', saleOperationId: 'operations' }, trades: { assetId: 'assets', accountId: 'accounts' },
  tools: { operationId: 'operations' },
};
const MONEY_FIELDS: Partial<Record<typeof BOOK_TABLES[number], string>> = {
  movements: 'amountMinor', operations: 'amountMinor', obligations: 'amountMinor', settlements: 'amountMinor',
  refunds: 'amountMinor', transfers: 'amountMinor', reserves: 'amountMinor', plans: 'estimatedMinor',
  budgets: 'amountMinor', stockLots: 'costMinor', productionCosts: 'amountMinor', trades: 'amountMinor',
};

/** Relational schema and transactions are testable in memory; the native opener enforces SQLCipher first. */
export class BookRepository {
  private readonly database: BookDatabase;
  constructor(database: BookDatabase) { this.database = database; }

  initialize(): void {
    this.database.execSync('PRAGMA foreign_keys = ON');
    if (this.database.getFirstSync<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys !== 1) throw new Error('Chaves estrangeiras indisponíveis.');
    const version = this.database.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
    if (version > 1) throw new Error('O banco foi criado por uma versão mais recente do aplicativo.');
    if (version === 1) return;
    this.database.execSync('BEGIN IMMEDIATE');
    try {
      this.database.execSync(`CREATE TABLE book_meta (
        id INTEGER PRIMARY KEY CHECK(id = 1), version INTEGER NOT NULL CHECK(version = 1),
        opening_month TEXT NOT NULL, cushion_minor INTEGER NOT NULL CHECK(cushion_minor >= 0),
        baseline_json TEXT NOT NULL CHECK(json_valid(baseline_json)), revision INTEGER NOT NULL CHECK(revision >= 0)
      )`);
      // Identifiers and JSON paths below come exclusively from this fixed schema, never user input.
      for (const table of BOOK_TABLES) {
        const relations = Object.entries(RELATIONS[table] ?? {}).map(([field, target]) =>
          `${field} TEXT GENERATED ALWAYS AS (json_extract(payload, '$.${field}')) STORED REFERENCES ${target}(id) DEFERRABLE INITIALLY DEFERRED`);
        const money = MONEY_FIELDS[table];
        const constraints = money ? [`CHECK(json_extract(payload, '$.${money}') IS NULL OR
          (typeof(json_extract(payload, '$.${money}')) = 'integer' AND json_extract(payload, '$.${money}') BETWEEN 0 AND 9007199254740991))`] : [];
        this.database.execSync(`CREATE TABLE ${table} (id TEXT PRIMARY KEY NOT NULL,
          payload TEXT NOT NULL CHECK(json_valid(payload)) CHECK(json_extract(payload, '$.id') = id)
          ${[...relations, ...constraints].map((entry) => `, ${entry}`).join('')})`);
      }
      this.database.execSync(`CREATE TABLE book_requests (id TEXT PRIMARY KEY NOT NULL, content TEXT NOT NULL);
        CREATE TABLE book_audit (request_id TEXT PRIMARY KEY NOT NULL REFERENCES book_requests(id) DEFERRABLE INITIALLY DEFERRED,
          payload TEXT NOT NULL CHECK(json_valid(payload)));
        PRAGMA user_version = 1;`);
      this.database.execSync('COMMIT');
    } catch (error) {
      this.database.execSync('ROLLBACK');
      throw error;
    }
  }

  load(): FinanceBook | null {
    const meta = this.database.getFirstSync<{ version: number; opening_month: FinanceBook['openingMonth']; cushion_minor: number; baseline_json: string; revision: number }>('SELECT * FROM book_meta WHERE id = 1');
    if (!meta) return null;
    try {
      const book = emptyBook(meta.opening_month);
      book.version = meta.version as 1;
      book.cushionMinor = meta.cushion_minor;
      book.baselineMovements = JSON.parse(meta.baseline_json) as FinanceBook['baselineMovements'];
      for (const table of BOOK_TABLES) {
        const rows = this.database.getAllSync<{ payload: string }>(`SELECT payload FROM ${table} ORDER BY rowid`);
        (book[table] as unknown[]) = rows.map((row) => JSON.parse(row.payload) as unknown);
      }
      book.requests = this.database.getAllSync<{ id: string; content: string }>('SELECT id, content FROM book_requests ORDER BY rowid').map((row) => ({ ...row }));
      book.audit = this.database.getAllSync<{ payload: string }>('SELECT payload FROM book_audit ORDER BY rowid').map((row) => JSON.parse(row.payload) as FinanceBook['audit'][number]);
      validateBook(book);
      if (book.audit.length !== meta.revision || book.requests.length !== book.audit.length) throw new Error('Histórico inconsistente.');
      if (this.database.getAllSync('PRAGMA foreign_key_check').length > 0) throw new Error('Vínculos inválidos.');
      return book;
    } catch {
      throw new Error('Os dados locais falharam na validação de integridade.');
    }
  }

  /** Whole-book replacement is atomic, including audit, request identities and cross-module links. */
  save(book: FinanceBook, expectedRevision: number | null): void {
    validateBook(book);
    this.database.execSync('BEGIN IMMEDIATE');
    try {
      const current = this.database.getFirstSync<{ revision: number }>('SELECT revision FROM book_meta WHERE id = 1');
      if ((current?.revision ?? null) !== expectedRevision) throw new Error('Os dados foram alterados. Reabra a sessão antes de gravar.');
      for (const table of BOOK_TABLES) this.database.runSync(`DELETE FROM ${table}`);
      this.database.runSync('DELETE FROM book_audit');
      this.database.runSync('DELETE FROM book_requests');
      for (const table of BOOK_TABLES) for (const entry of book[table]) {
        this.database.runSync(`INSERT INTO ${table} (id, payload) VALUES (?, ?)`, entry.id, JSON.stringify(entry));
      }
      for (const request of book.requests) this.database.runSync('INSERT INTO book_requests (id, content) VALUES (?, ?)', request.id, request.content);
      for (const audit of book.audit) this.database.runSync('INSERT INTO book_audit (request_id, payload) VALUES (?, ?)', audit.requestId, JSON.stringify(audit));
      this.database.runSync(`INSERT INTO book_meta (id, version, opening_month, cushion_minor, baseline_json, revision)
        VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET version=excluded.version, opening_month=excluded.opening_month,
        cushion_minor=excluded.cushion_minor, baseline_json=excluded.baseline_json, revision=excluded.revision`,
      book.version, book.openingMonth, book.cushionMinor, JSON.stringify(book.baselineMovements), book.audit.length);
      this.database.execSync('COMMIT');
    } catch (error) {
      this.database.execSync('ROLLBACK');
      throw error;
    }
  }

  close(): void { this.database.closeSync(); }
}

/** No schema or financial record is written until the runtime reports real SQLCipher. */
export function openCipherRepository(open: () => BookDatabase, key: Uint8Array): BookRepository {
  if (key.length !== 32) throw new Error('Material de chave inválido.');
  const database = open();
  let failureMessage = 'Não foi possível abrir o banco com essa chave ou validar sua integridade.';
  try {
    const cipher = database.getFirstSync<{ cipher_version?: string }>('PRAGMA cipher_version');
    if (!cipher || typeof cipher.cipher_version !== 'string' || !cipher.cipher_version.trim()) {
      failureMessage = 'SQLCipher não está disponível neste build. O banco permanece bloqueado.';
      throw new Error(failureMessage);
    }
    // SQLCipher cannot bind PRAGMA key. Only the exact 32-byte OS-generated key is encoded here.
    const hex = Array.from(key, (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('Material de chave inválido.');
    database.execSync(`PRAGMA key = "x'${hex}'"`);
    database.getFirstSync('SELECT count(*) FROM sqlite_master');
    if (database.getFirstSync<{ integrity_check: string }>('PRAGMA integrity_check')?.integrity_check !== 'ok') throw new Error('Falha de integridade do banco.');
    const repository = new BookRepository(database);
    repository.initialize();
    return repository;
  } catch {
    // Native exception text may contain SQL arguments; expose only this redacted message.
    database.closeSync();
    throw new Error(failureMessage);
  }
}
