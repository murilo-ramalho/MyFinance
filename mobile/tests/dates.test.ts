import assert from 'node:assert/strict';
import test from 'node:test';

import { daysInMonth, formatBrazilianDate, parseBrazilianDate } from '../src/domain/dates.ts';
import { civilDateAt } from '../src/platform/deviceDate.ts';

test('parses and formats civil dates without inventing a time', () => {
  const date = parseBrazilianDate(' 23/10/2026 ');

  assert.equal(date, '2026-10-23');
  assert.equal(formatBrazilianDate(date!), '23/10/2026');
});

test('rejects impossible dates and unsupported input formats', () => {
  assert.equal(parseBrazilianDate('31/02/2026'), null);
  assert.equal(parseBrazilianDate('2026-10-23'), null);
  assert.equal(parseBrazilianDate('1/10/2026'), null);
  assert.equal(parseBrazilianDate('00/10/2026'), null);
});

test('applies Gregorian leap-year rules at century boundaries', () => {
  assert.equal(parseBrazilianDate('29/02/2024'), '2024-02-29');
  assert.equal(parseBrazilianDate('29/02/1900'), null);
  assert.equal(parseBrazilianDate('29/02/2000'), '2000-02-29');
  assert.equal(parseBrazilianDate('29/02/2025'), null);
});

test('validates month lengths and rejects invalid year/month arguments', () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(daysInMonth(2026, 12), 31);
  assert.throws(() => daysInMonth(0, 1), RangeError);
  assert.throws(() => daysInMonth(2026, 13), RangeError);
});

test('preserves four-digit years when parsing and editing historical civil dates', () => {
  assert.equal(parseBrazilianDate('01/01/0001'), '0001-01-01');
  assert.equal(formatBrazilianDate('0099-02-03'), '03/02/0099');
});

test('planning timezone controls today without changing saved civil dates', () => {
  const clock = new Date('2026-11-01T01:30:00.000Z');
  assert.equal(civilDateAt(clock, 'America/Sao_Paulo'), '2026-10-31');
  assert.equal(civilDateAt(clock, 'Asia/Tokyo'), '2026-11-01');
  assert.throws(() => civilDateAt(clock, 'invalid-zone'));
});
