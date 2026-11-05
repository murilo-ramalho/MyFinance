import { daysInMonth } from './dates.ts';
import { monthAtOffset, monthOf, validateCivilDate, type CivilDate } from './movements.ts';
import { integer } from './exact.ts';

export type ShortMonthPolicy = 'last-day' | 'skip' | 'next-month';
export type RecurrenceScope = 'this' | 'future' | 'pending' | 'rule';
export interface RecurrenceRule {
  id: string;
  title: string;
  version: number;
  kind: 'monthly' | 'interval' | 'after-completion' | 'condition';
  anchorOn: CivilDate;
  interval: number;
  endOn: CivilDate | null;
  count: number | null;
  shortMonthPolicy: ShortMonthPolicy;
  canceledFrom: CivilDate | null;
  contractual: boolean;
  amountMinor: number;
  direction: 'income' | 'expense';
  accountId: string;
  categoryId: string | null;
  projectId: string | null;
  lastCompletedOn: CivilDate | null;
  completedCount: number;
  conditionNote: string | null;
  revisions?: { fromPosition: number; amountMinor: number; title: string }[];
}
export interface RecurrenceException {
  id: string;
  ruleId: string;
  /** Stable cycle identity, independent from a revised date. */
  position: number;
  action: 'skip' | 'override';
  date: CivilDate | null;
  amountMinor: number | null;
  title?: string | null;
}
export interface RecurrenceOccurrence {
  key: string;
  ruleId: string;
  position: number;
  date: CivilDate;
  amountMinor: number;
  title: string;
}

export function addDays(date: CivilDate, days: number): CivilDate {
  validateCivilDate(date, 'Data');
  integer(days, 'Intervalo');
  const [year, month, day] = date.split('-').map(Number);
  const clock = new Date(0);
  clock.setUTCFullYear(year, month - 1, day);
  clock.setUTCHours(12, 0, 0, 0);
  clock.setUTCDate(clock.getUTCDate() + days);
  if (!Number.isFinite(clock.getTime()) || clock.getUTCFullYear() < 1 || clock.getUTCFullYear() > 9999) throw new RangeError('Data fora do intervalo suportado.');
  return clock.toISOString().slice(0, 10) as CivilDate;
}

export function addMonths(date: CivilDate, offset: number, policy: ShortMonthPolicy): CivilDate | null {
  validateCivilDate(date, 'Data');
  const month = monthAtOffset(monthOf(date), offset);
  const [year, monthNumber] = month.split('-').map(Number);
  const day = Number(date.slice(8));
  const last = daysInMonth(year, monthNumber);
  if (day <= last) return `${month}-${String(day).padStart(2, '0')}` as CivilDate;
  if (policy === 'skip') return null;
  if (policy === 'next-month') return `${monthAtOffset(month, 1)}-01` as CivilDate;
  if (policy !== 'last-day') throw new TypeError('Escolha a política para meses curtos.');
  return `${month}-${last}` as CivilDate;
}

export function validateRecurrence(rule: RecurrenceRule): void {
  if (!rule.id.trim() || !rule.title.trim() || !rule.accountId.trim()) throw new TypeError('Informe série, título e conta.');
  validateCivilDate(rule.anchorOn, 'Início');
  for (const date of [rule.endOn, rule.canceledFrom, rule.lastCompletedOn]) if (date !== null) validateCivilDate(date, 'Data da série');
  if (rule.endOn && rule.endOn < rule.anchorOn) throw new RangeError('O término não pode anteceder o início.');
  if (!['monthly', 'interval', 'after-completion', 'condition'].includes(rule.kind)) throw new TypeError('Tipo de recorrência inválido.');
  if (!['last-day', 'skip', 'next-month'].includes(rule.shortMonthPolicy)) throw new TypeError('Escolha a política para meses curtos.');
  integer(rule.version, 'Versão', true);
  integer(rule.completedCount, 'Execuções');
  if (rule.completedCount < 0) throw new RangeError('Número de execuções inválido.');
  integer(rule.interval, 'Intervalo', true);
  integer(rule.amountMinor, 'Valor', true);
  if (rule.count !== null) integer(rule.count, 'Quantidade de ocorrências', true);
  for (const revision of rule.revisions ?? []) {
    integer(revision.fromPosition, 'Posição da revisão'); integer(revision.amountMinor, 'Valor revisado', true);
    if (revision.fromPosition < 0 || !revision.title.trim()) throw new TypeError('Revisão de série inválida.');
  }
  if (rule.kind === 'condition' && !rule.conditionNote?.trim()) throw new TypeError('Descreva a condição da sugestão.');
}

/** Generates only a requested horizon. Conditions never generate payments or obligations. */
export function expandRecurrence(
  rule: RecurrenceRule, exceptions: readonly RecurrenceException[], from: CivilDate, through: CivilDate,
): RecurrenceOccurrence[] {
  validateRecurrence(rule);
  validateCivilDate(from, 'Início da janela');
  validateCivilDate(through, 'Fim da janela');
  if (through < from) throw new RangeError('Janela de recorrência inválida.');
  if (rule.kind === 'condition') return [];
  const overrides = new Map<number, RecurrenceException>();
  for (const exception of exceptions.filter((entry) => entry.ruleId === rule.id)) {
    integer(exception.position, 'Posição');
    if (exception.position < 0 || overrides.has(exception.position)) throw new TypeError('Exceção duplicada ou inválida.');
    if (exception.action === 'skip' && rule.contractual) throw new TypeError('Não é permitido ignorar uma obrigação contratada.');
    if (exception.date) validateCivilDate(exception.date, 'Data excepcional');
    if (exception.amountMinor !== null) integer(exception.amountMinor, 'Valor excepcional', true);
    overrides.set(exception.position, exception);
  }
  const occurrences: RecurrenceOccurrence[] = [];
  const completion = rule.kind === 'after-completion';
  if (completion && rule.count !== null && rule.completedCount >= rule.count) return [];
  const anchor = completion ? rule.lastCompletedOn ?? rule.anchorOn : rule.anchorOn;
  // Completion-dependent rules emit one pending cycle, never a chain of imaginary executions.
  const maximum = completion ? 1 : rule.count ?? 120000;
  for (let position = 0; position < maximum; position += 1) {
    let base: CivilDate | null;
    try {
      base = rule.kind === 'interval'
        ? addDays(anchor, position * rule.interval)
        : addMonths(anchor, (position + (completion && rule.lastCompletedOn ? 1 : 0)) * rule.interval, rule.shortMonthPolicy);
    } catch (error) {
      if (error instanceof RangeError && position > 0) break;
      throw error;
    }
    const identity = completion ? rule.completedCount + position : position;
    const exception = overrides.get(identity);
    if (base === null) continue;
    if ((rule.endOn && base > rule.endOn) || (rule.canceledFrom && base >= rule.canceledFrom)) break;
    // A far-future exception may be moved into this window; retain stable identities.
    const date = exception?.date ?? base;
    if (date >= from && date <= through && exception?.action !== 'skip') {
      const revision = rule.revisions?.filter((entry) => entry.fromPosition <= identity).sort((a, b) => b.fromPosition - a.fromPosition)[0];
      occurrences.push({ key: `${rule.id}:${identity}`, ruleId: rule.id, position: identity, date,
        title: exception?.title ?? revision?.title ?? rule.title,
        amountMinor: exception?.amountMinor ?? revision?.amountMinor ?? rule.amountMinor });
    }
    if (base > through && ![...overrides.entries()].some(([index, value]) => index > position && value.date && value.date <= through)) break;
  }
  return occurrences.sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position);
}
