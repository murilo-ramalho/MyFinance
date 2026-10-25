import type { CivilDate } from '../domain/movements';

/** Reads the device's local civil date at the UI/platform boundary. */
export function deviceToday(): CivilDate {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` as CivilDate;
}
