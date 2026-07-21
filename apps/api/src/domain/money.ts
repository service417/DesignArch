/**
 * Money handling.
 *
 * Every amount in DesignArc is an integer number of minor units (LKR cents).
 * Money is never represented as a floating-point number: 0.1 + 0.2 !== 0.3 in
 * binary floating point, and this system decides what people are paid.
 *
 * The currency is fixed to LKR (TBD-02, resolved in the architecture blueprint:
 * single-currency, because multi-currency is a costly generalisation with no
 * present business need). Amounts are stored as BigInt.
 */

export const CURRENCY = 'LKR' as const;

/**
 * Upper bound on a single stage price. This is a sanity ceiling, not a business
 * limit — it exists to turn a fat-fingered entry (a price typed in units rather
 * than cents, say) into a validation error rather than a payment.
 * 100,000,000 cents = LKR 1,000,000.
 */
export const MAX_STAGE_PRICE_MINOR = 100_000_000n;

export type MoneyValidationError =
  | 'NOT_AN_INTEGER'
  | 'NOT_POSITIVE'
  | 'ABOVE_CEILING';

export type MoneyValidation =
  | { ok: true; value: bigint }
  | { ok: false; error: MoneyValidationError; message: string };

/**
 * Validate and normalise a proposed price into minor units.
 *
 * Accepts bigint or a safe integer number; rejects floats outright rather than
 * rounding, because silently rounding someone's pay is worse than refusing it.
 */
export function parseMinorUnits(input: bigint | number): MoneyValidation {
  let value: bigint;

  if (typeof input === 'number') {
    if (!Number.isInteger(input)) {
      return {
        ok: false,
        error: 'NOT_AN_INTEGER',
        message: `Amount must be a whole number of ${CURRENCY} cents; received ${input}.`,
      };
    }
    if (!Number.isSafeInteger(input)) {
      return {
        ok: false,
        error: 'NOT_AN_INTEGER',
        message: `Amount ${input} exceeds the safe integer range; send it as a string or bigint.`,
      };
    }
    value = BigInt(input);
  } else {
    value = input;
  }

  if (value <= 0n) {
    return {
      ok: false,
      error: 'NOT_POSITIVE',
      message: `Amount must be greater than zero; received ${value}.`,
    };
  }

  if (value > MAX_STAGE_PRICE_MINOR) {
    return {
      ok: false,
      error: 'ABOVE_CEILING',
      message:
        `Amount ${value} exceeds the maximum stage price of ${MAX_STAGE_PRICE_MINOR} ` +
        `${CURRENCY} cents. Check whether the value was entered in ${CURRENCY} rather than cents.`,
    };
  }

  return { ok: true, value };
}

/** Render minor units for display, e.g. 750000n -> "7,500.00". */
export function formatMinorUnits(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const major = abs / 100n;
  const minor = abs % 100n;
  const majorFormatted = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${majorFormatted}.${minor.toString().padStart(2, '0')}`;
}

/** Sum a set of amounts. Empty sum is zero, not an error. */
export function sumMinorUnits(values: readonly bigint[]): bigint {
  return values.reduce((total, v) => total + v, 0n);
}
