/**
 * Money in the browser.
 *
 * The API sends amounts as strings, not numbers, because they are integer minor
 * units (LKR cents) in BigInt on the server and a large value would lose
 * precision passing through a JSON float. So nothing here ever calls Number()
 * on an amount — parsing and formatting both stay in BigInt and string space.
 */

const CURRENCY = 'LKR';

/** "6500000" -> "LKR 65,000.00" */
export function formatMinor(minor: string | bigint | null | undefined): string {
  if (minor === null || minor === undefined) return '—';

  const value = typeof minor === 'bigint' ? minor : BigInt(minor);
  const negative = value < 0n;
  const absolute = negative ? -value : value;

  const rupees = absolute / 100n;
  const cents = absolute % 100n;

  const grouped = rupees.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${CURRENCY} ${grouped}.${cents.toString().padStart(2, '0')}`;
}

/**
 * "65000.00" or "65,000" -> 6500000 minor units, as a number for JSON.
 *
 * Returns null for anything that is not a clean amount. Deliberately strict:
 * silently coercing a typo into a price that a worker is then offered is worse
 * than making the admin retype it.
 */
export function parseToMinor(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, '').replace(new RegExp(`^${CURRENCY}`, 'i'), '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const [rupees, cents = ''] = cleaned.split('.');
  const minor = `${rupees}${cents.padEnd(2, '0')}`;

  const value = Number(minor);
  // The API caps a stage price at 100,000,000 minor units; beyond
  // Number.MAX_SAFE_INTEGER we could not represent it faithfully anyway.
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}
