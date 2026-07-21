import {
  MAX_STAGE_PRICE_MINOR,
  formatMinorUnits,
  parseMinorUnits,
  sumMinorUnits,
} from './money';

describe('parseMinorUnits', () => {
  it('accepts a positive bigint', () => {
    expect(parseMinorUnits(750_000n)).toEqual({ ok: true, value: 750_000n });
  });

  it('accepts a positive safe integer number', () => {
    expect(parseMinorUnits(750_000)).toEqual({ ok: true, value: 750_000n });
  });

  it('accepts the ceiling exactly', () => {
    expect(parseMinorUnits(MAX_STAGE_PRICE_MINOR).ok).toBe(true);
  });

  it.each([0n, -1n, -750_000n])('rejects non-positive %s', (input) => {
    const result = parseMinorUnits(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('NOT_POSITIVE');
  });

  it.each([1234.56, 0.1, -2.5])('rejects fractional %s rather than rounding', (input) => {
    const result = parseMinorUnits(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('NOT_AN_INTEGER');
  });

  it('rejects an unsafe integer', () => {
    const result = parseMinorUnits(Number.MAX_SAFE_INTEGER + 2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('NOT_AN_INTEGER');
  });

  it('rejects an amount above the ceiling with a hint about units', () => {
    const result = parseMinorUnits(MAX_STAGE_PRICE_MINOR + 1n);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('ABOVE_CEILING');
      expect(result.message).toMatch(/entered in LKR rather than cents/);
    }
  });
});

describe('formatMinorUnits', () => {
  it.each([
    [0n, '0.00'],
    [5n, '0.05'],
    [50n, '0.50'],
    [100n, '1.00'],
    [750_000n, '7,500.00'],
    [123_456_789n, '1,234,567.89'],
    [-750_000n, '-7,500.00'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatMinorUnits(input)).toBe(expected);
  });
});

describe('sumMinorUnits', () => {
  it('sums an empty set to zero', () => {
    expect(sumMinorUnits([])).toBe(0n);
  });

  it('sums a monthly report total exactly', () => {
    expect(sumMinorUnits([750_000n, 125_050n, 99n])).toBe(875_149n);
  });
});
