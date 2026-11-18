import { describe, expect, it } from 'vitest';
import { buildActualVsForecast, inferForecastCategory } from '../src/lib/actual-vs-forecast';

describe('Actual vs Forecast reconciliation', () => {
  it('compares completed actuals with the latest approved baseline captured before the month began', () => {
    const result = buildActualVsForecast({
      baseCurrency: 'EUR',
      currentDate: '2026-02-10',
      baselines: [
        { period: '2026-01-01', category: 'revenue', forecast_amount: 12_000, currency: 'EUR', captured_at: '2025-12-15T12:00:00Z' },
        { period: '2026-01-01', category: 'cogs', forecast_amount: -2_000, currency: 'EUR', captured_at: '2025-12-15T12:00:00Z' },
        { period: '2026-01-01', category: 'payroll', forecast_amount: -3_000, currency: 'EUR', captured_at: '2025-12-15T12:00:00Z' },
        { period: '2026-01-01', category: 'opex', forecast_amount: -1_000, currency: 'EUR', captured_at: '2025-12-15T12:00:00Z' },
        { period: '2026-02-01', category: 'revenue', forecast_amount: 13_000, currency: 'EUR', captured_at: '2026-02-03T12:00:00Z' },
      ],
      actuals: [
        { period: '2026-01-05', metric_key: 'inflow:sales', amount: 11_000, currency: 'EUR' },
        { period: '2026-01-08', metric_key: 'outflow:cogs', amount: -2_500, currency: 'EUR' },
        { period: '2026-01-20', metric_key: 'outflow:payroll', amount: -3_000, currency: 'EUR' },
        { period: '2026-01-25', metric_key: 'outflow:rent', amount: -900, currency: 'EUR' },
        { period: '2026-01-28', metric_key: 'outflow:transfer', amount: -500, currency: 'EUR' },
        { period: '2026-01-29', metric_key: 'inflow:sales', amount: 100, currency: 'GBP' },
      ],
    });

    expect(result.months).toHaveLength(1);
    expect(result.months[0].forecastNetCashFlow).toBe(6_000);
    expect(result.months[0].actualNetCashFlow).toBe(4_600);
    expect(result.months[0].variance).toBe(-1_400);
    expect(result.eligibleRecords).toBe(4);
    expect(result.unmappedCategories[0]).toMatchObject({ metric_key: 'outflow:transfer', amount: -500, records: 1 });
    expect(result.mismatchedCurrencies).toEqual(['GBP']);
  });

  it('does not use a forecast that was approved after the beginning of the month', () => {
    const result = buildActualVsForecast({
      baseCurrency: 'EUR',
      currentDate: '2026-03-01',
      baselines: [
        { period: '2026-02-01', category: 'revenue', forecast_amount: 20_000, currency: 'EUR', captured_at: '2026-02-03T12:00:00Z' },
      ],
      actuals: [{ period: '2026-02-12', metric_key: 'inflow:sales', amount: 10_000, currency: 'EUR' }],
    });
    expect(result.months).toHaveLength(0);
  });

  it('classifies operating categories and excludes financing movements by default', () => {
    expect(inferForecastCategory('inflow:subscription_revenue')).toBe('revenue');
    expect(inferForecastCategory('inflow:cash_adjustment')).toBeNull();
    expect(inferForecastCategory('outflow:monthly_payroll')).toBe('payroll');
    expect(inferForecastCategory('outflow:software_subscription')).toBe('opex');
    expect(inferForecastCategory('outflow:bank_transfer')).toBe('exclude');
    expect(inferForecastCategory('outflow:mystery')).toBeNull();
  });
});
