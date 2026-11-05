/** Exact arithmetic shared by money allocation and physical quantities. */
export function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new RangeError('O resultado excede o limite de precisão.');
  return number;
}

export function integer(value: number, label: string, positive = false): void {
  if (!Number.isSafeInteger(value) || (positive && value <= 0)) {
    throw new RangeError(`${label} deve ser um inteiro${positive ? ' positivo' : ''} seguro.`);
  }
}

/** Integer ratio rounded halfway to the even cent, including negative values. */
export function roundRatio(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) throw new RangeError('O divisor deve ser positivo.');
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator * sign;
  let quotient = absolute / denominator;
  const remainder = absolute % denominator;
  if (remainder * 2n > denominator || (remainder * 2n === denominator && quotient % 2n !== 0n)) quotient += 1n;
  return safeNumber(quotient * sign);
}

/** Extra cents belong to the first installments, preserving the contracted total. */
export function allocateMinor(total: number, count: number): number[] {
  integer(total, 'Total', true);
  integer(count, 'Quantidade de parcelas', true);
  if (count > total || count > 1200) throw new RangeError('Parcelas devem ter pelo menos um centavo e no máximo 1200 posições.');
  const quotient = BigInt(total) / BigInt(count);
  const remainder = BigInt(total) % BigInt(count);
  return Array.from({ length: count }, (_, index) => safeNumber(quotient + (BigInt(index) < remainder ? 1n : 0n)));
}

export const QUANTITY_SCALE = 1_000_000;

export function parseQuantity(text: string): number | null {
  if (!/^\d+(?:[,.]\d{1,6})?$/.test(text.trim())) return null;
  const [whole, fraction = ''] = text.trim().replace(',', '.').split('.');
  const scaled = BigInt(whole) * BigInt(QUANTITY_SCALE) + BigInt(fraction.padEnd(6, '0'));
  return scaled > 0n && scaled <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(scaled) : null;
}

export function formatQuantity(scaled: number): string {
  integer(scaled, 'Quantidade');
  const value = BigInt(scaled);
  const absolute = value < 0n ? -value : value;
  const fraction = String(absolute % BigInt(QUANTITY_SCALE)).padStart(6, '0').replace(/0+$/, '');
  return `${value < 0n ? '-' : ''}${absolute / BigInt(QUANTITY_SCALE)}${fraction ? `,${fraction}` : ''}`;
}

export function amountForQuantity(quantity: number, unitPriceMinor: number): number {
  integer(quantity, 'Quantidade', true);
  integer(unitPriceMinor, 'Preço unitário', true);
  return roundRatio(BigInt(quantity) * BigInt(unitPriceMinor), BigInt(QUANTITY_SCALE));
}
