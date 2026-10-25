import type { CivilDate } from './movements';

const BRAZILIAN_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Expected a valid year and month.');
  }

  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseBrazilianDate(input: string): CivilDate | null {
  const match = BRAZILIAN_DATE.exec(input.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;

  if (day > daysInMonth(year, month)) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as CivilDate;
}

export function formatBrazilianDate(date: CivilDate): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}
