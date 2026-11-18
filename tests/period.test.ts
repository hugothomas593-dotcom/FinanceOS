import { describe, expect, it } from 'vitest';
import { monthDateRange } from '../src/lib/period';

describe('monthDateRange', () => {
  it('includes every day in a standard month using a half-open range', () => {
    expect(monthDateRange('2026-11')).toEqual({
      start: '2026-11-01',
      endExclusive: '2026-12-01',
    });
  });

  it('handles February in a leap year without using a hard-coded day count', () => {
    expect(monthDateRange('2028-02')).toEqual({
      start: '2028-02-01',
      endExclusive: '2028-03-01',
    });
  });

  it('rolls December into the next year', () => {
    expect(monthDateRange('2026-12')).toEqual({
      start: '2026-12-01',
      endExclusive: '2027-01-01',
    });
  });

  it.each(['2026-00', '2026-13', '2026-1', '26-01', '2026-02-01'])(
    'rejects an invalid reporting period: %s',
    (period) => {
      expect(() => monthDateRange(period)).toThrow('Period must use YYYY-MM');
    },
  );
});
