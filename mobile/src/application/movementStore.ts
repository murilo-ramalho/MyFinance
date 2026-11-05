import { validateCivilDate, validateMovement, type CivilDate, type Movement } from '../domain/movements.ts';

export interface MovementRevision {
  requestId: string;
  recordedAt: string;
  before: Movement | null;
  after: Movement;
}

export interface SaveMovementCommand {
  requestId: string;
  recordedAt: string;
  today: CivilDate;
  movement: Movement;
}

/** Actual storage for the demo: process memory only, never a durable database or backup. */
export class MemoryMovementStore {
  private records: Map<string, Movement>;
  private revisions: MovementRevision[] = [];
  private commands = new Map<string, SaveMovementCommand>();

  constructor(initial: readonly Movement[]) {
    initial.forEach(validateMovement);
    this.records = new Map(initial.map((record) => [record.id, { ...record }]));
    if (this.records.size !== initial.length) throw new TypeError('Duplicate movement identities.');
  }

  list(): Movement[] {
    return [...this.records.values()].map((record) => ({ ...record }));
  }

  history(): MovementRevision[] {
    return this.revisions.map((revision) => ({
      ...revision, before: revision.before ? { ...revision.before } : null, after: { ...revision.after },
    }));
  }

  save(command: SaveMovementCommand): void {
    const { movement, requestId, recordedAt, today } = command;
    validateMovement(movement);
    validateCivilDate(today, 'today');
    if (!requestId.trim()) throw new TypeError('A request identity is required.');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(recordedAt)
      || !Number.isFinite(Date.parse(recordedAt)) || new Date(recordedAt).toISOString() !== recordedAt) {
      throw new TypeError('A valid UTC audit timestamp is required.');
    }
    if (movement.nature === 'realized' && movement.settledOn! > today) {
      throw new RangeError('A future payment must remain pending.');
    }
    const previousCommand = this.commands.get(requestId);
    if (previousCommand) {
      // Compare fields by name: object property insertion order is irrelevant.
      if (previousCommand.today !== today || previousCommand.recordedAt !== recordedAt
        || Object.keys(previousCommand.movement).some((key) =>
          previousCommand.movement[key as keyof Movement] !== movement[key as keyof Movement])) {
        throw new TypeError('A request identity cannot be reused for different data.');
      }
      return;
    }
    const before = this.records.get(movement.id);
    const after = { ...movement };
    const revision = { requestId, recordedAt, before: before ? { ...before } : null, after: { ...after } };
    // All validation precedes this synchronous commit of record + baseline/audit + request.
    this.records.set(after.id, after);
    this.revisions.push(revision);
    this.commands.set(requestId, { ...command, movement: { ...after } });
  }
}
