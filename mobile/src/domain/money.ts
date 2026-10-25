export type CurrencyCode = 'BRL';

const BRAZILIAN_AMOUNT = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;

/** Parses a positive BRL amount into integer centavos. */
export function parseBrlToMinor(input: string): number | null {
  const value = input.trim();
  if (!BRAZILIAN_AMOUNT.test(value)) return null;

  const [wholePart, fractionPart = ''] = value.split(',');
  const whole = Number(wholePart.replaceAll('.', ''));
  const fraction = Number(fractionPart.padEnd(2, '0') || '0');
  const minor = whole * 100 + fraction;

  if (!Number.isSafeInteger(minor) || minor <= 0) return null;
  return minor;
}

/** Formats an integer amount for display; this is presentation, not calculation. */
export function formatBrl(minor: number): string {
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError('Money must be represented as safe integer centavos.');
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(minor / 100);
}

/** Returns an editable Brazilian amount string without a currency marker. */
export function brlInputFromMinor(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor <= 0) {
    throw new RangeError('Money must be a positive safe integer number of centavos.');
  }

  const whole = Math.trunc(minor / 100);
  const cents = String(minor % 100).padStart(2, '0');
  return `${whole},${cents}`;
}
