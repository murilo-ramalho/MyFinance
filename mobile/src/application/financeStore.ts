import type { FinanceBook, FinanceCommand, CommandContext } from '../domain/book.ts';
import { applyFinanceCommand, validateBook } from '../domain/bookCommands.ts';
import { assertBookAmounts, bookMovements } from '../domain/bookSelectors.ts';
import type { CivilDate } from '../domain/movements.ts';
import type { SaveMovementCommand } from './movementStore.ts';

/** Local demo session. Durable sessions commit through the SQLCipher repository before publishing state. */
export class FinanceStore {
  private book: FinanceBook;
  private readonly persist?: (book: FinanceBook, expectedRevision: number) => void;

  constructor(book: FinanceBook, persist?: (book: FinanceBook, expectedRevision: number) => void) {
    validateBook(book);
    this.book = JSON.parse(JSON.stringify(book)) as FinanceBook;
    this.persist = persist;
  }

  snapshot(): FinanceBook {
    return JSON.parse(JSON.stringify(this.book)) as FinanceBook;
  }

  execute(command: FinanceCommand, context: CommandContext): void {
    const next = applyFinanceCommand(this.book, command, context);
    assertBookAmounts(next, context.today);
    if (next !== this.book) this.persist?.(next, this.book.audit.length);
    this.book = next;
  }

  save(input: SaveMovementCommand): void {
    this.execute({ kind: 'save-movement', movement: input.movement }, input);
  }

  list(through: CivilDate): ReturnType<typeof bookMovements> {
    return bookMovements(this.book, through);
  }
}
