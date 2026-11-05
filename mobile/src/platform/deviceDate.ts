import type { CivilDate } from '../domain/movements';

/** Reads the device's local civil date at the UI/platform boundary. */
export function civilDateAt(now: Date, timeZone: string): CivilDate {
  if (timeZone === 'device') return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` as CivilDate;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)!.value;
    return `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}` as CivilDate;
  } catch { throw new RangeError('Informe um fuso IANA válido ou device.'); }
}

export function deviceToday(timeZone = 'device'): CivilDate {
  return civilDateAt(new Date(), timeZone);
}
