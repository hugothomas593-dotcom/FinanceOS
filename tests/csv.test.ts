import { describe, expect, it } from 'vitest';
import { normalizeActuals, parseCsv } from '../src/lib/csv';

describe('CSV import', () => {
  it('parses quoted commas and escaped quotes', () => { expect(parseCsv('Date,Description,Amount\n2026-01-01,"Cloud, hosting",-12\n2026-01-02,"A ""quoted"" item",20')[1][1]).toBe('Cloud, hosting'); });
  it('normalizes ISO date rows and direction', () => { const rows = normalizeActuals('Date,Amount,Category\n2026-01-01,120.50,Sales\n2026-01-02,-30.00,Payroll'); expect(rows[0].direction).toBe('inflow'); expect(rows[1].amount).toBe(30); expect(rows[1].direction).toBe('outflow'); });
  it('supports European decimal comma and thousands separator', () => { expect(normalizeActuals('Date,Amount\n2026-01-01,"1.234,56"')[0].amount).toBe(1234.56); });
  it('rejects invalid dates, malformed quotes and inconsistent columns', () => { expect(() => normalizeActuals('Date,Amount\n2026-02-30,10')).toThrow(); expect(() => parseCsv('Date,Amount\n2026-01-01,"10')).toThrow(); expect(() => parseCsv('Date,Amount\n2026-01-01,10,extra')).toThrow(); });
});
