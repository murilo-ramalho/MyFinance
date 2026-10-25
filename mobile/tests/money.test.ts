import assert from 'node:assert/strict';
import test from 'node:test';

import { brlInputFromMinor, formatBrl, parseBrlToMinor } from '../src/domain/money.ts';

test('parses Brazilian currency into exact integer centavos', () => {
  assert.equal(parseBrlToMinor('1.234,56'), 123456);
  assert.equal(parseBrlToMinor('25'), 2500);
  assert.equal(parseBrlToMinor('0,05'), 5);
  assert.equal(parseBrlToMinor(' 1.234.567,8 '), 123456780);
});

test('rejects malformed, ambiguous, non-positive, and unsafe amounts', () => {
  for (const invalid of [
    '1,234.56', '12,345', '1.23', '-3,00', '+3,00', '0', '0,00',
    '1 000,00', '1.00,00', '90071992547410,00', '',
  ]) {
    assert.equal(parseBrlToMinor(invalid), null, `expected ${invalid} to be rejected`);
  }
});

test('formats positive and negative minor units for display', () => {
  assert.equal(formatBrl(123456), 'R$\u00a01.234,56');
  assert.equal(formatBrl(-50), '-R$\u00a00,50');
  assert.equal(brlInputFromMinor(5), '0,05');
  assert.equal(brlInputFromMinor(123456), '1234,56');
});

test('refuses unsafe display values and invalid editable amounts', () => {
  assert.throws(() => formatBrl(Number.MAX_SAFE_INTEGER + 1), RangeError);
  assert.throws(() => brlInputFromMinor(0), RangeError);
  assert.throws(() => brlInputFromMinor(-1), RangeError);
  assert.throws(() => brlInputFromMinor(Number.MAX_SAFE_INTEGER + 1), RangeError);
});
