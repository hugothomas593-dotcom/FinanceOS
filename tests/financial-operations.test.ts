import { describe, expect, it } from 'vitest';
import { summarizeFinancialActivity } from '../src/lib/financial-operations';

describe('financial activity summary', () => {
  it('aggregates signed movements by month and keeps currencies separate', () => {
    const result = summarizeFinancialActivity([
      { period: '2026-05-02', metric_key: 'inflow:sales', amount: 1200, currency: 'EUR', imported_at: '2026-06-01T10:00:00Z' },
      { period: '2026-05-03', metric_key: 'outflow:payroll', amount: -400, currency: 'EUR', imported_at: '2026-06-01T10:00:00Z' },
      { period: '2026-05-04', metric_key: 'inflow:sales', amount: 100, currency: 'GBP', imported_at: '2026-06-02T10:00:00Z' },
      { period: '2026-05-01', metric_key: 'kpi:mrr', amount: 5000, currency: 'EUR' },
    ], 'eur');

    expect(result.transactionRecords).toBe(3);
    expect(result.compatibleRecords).toBe(2);
    expect(result.mismatchedRecords).toBe(1);
    expect(result.mismatchedCurrencies).toEqual(['GBP']);
    expect(result.monthsCovered).toBe(1);
    expect(result.months[0]).toMatchObject({ month: '2026-05', inflows: 1200, outflows: 400, netMovement: 800, records: 2 });
    expect(result.latestImportedAt).toBe('2026-06-02T10:00:00Z');
  });

  it('flags generic categories without pretending that they are classified', () => {
    const result = summarizeFinancialActivity([
      { period: '2026-01-10', metric_key: 'outflow:uncategorised', amount: -25, currency: 'EUR' },
      { period: '2026-02-10', metric_key: 'outflow:software', amount: -75, currency: 'EUR' },
    ], 'EUR');

    expect(result.uncategorisedRecords).toBe(1);
    expect(result.classificationCoveragePct).toBe(50);
    expect(result.firstMonth).toBe('2026-01');
    expect(result.latestMonth).toBe('2026-02');
  });

  it('returns a safe empty summary when no valid transactions exist', () => {
    const result = summarizeFinancialActivity([
      { period: '2026-01-01', metric_key: 'kpi:mrr', amount: 1000, currency: 'EUR' },
      { period: 'bad-date', metric_key: 'inflow:sales', amount: 10, currency: 'EUR' },
    ], 'EUR');

    expect(result.transactionRecords).toBe(0);
    expect(result.months).toEqual([]);
    expect(result.classificationCoveragePct).toBeNull();
    expect(result.latestImportedAt).toBeNull();
  });
});
