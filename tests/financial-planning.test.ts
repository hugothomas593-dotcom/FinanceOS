import { describe, expect, it } from 'vitest';
import { buildForecastTrajectories, DEFAULT_FORECAST_SCENARIOS, deriveForecastAlerts } from '../src/lib/financial-planning';
import type { ModelInputs } from '../src/lib/finance';

const model: ModelInputs = { openingCash: 500_000, monthlyRevenue: 100_000, monthlyRevenueGrowth: 0.05, monthlyOpexExPayroll: 40_000, monthlyOpexGrowth: 0.02, cogsRatio: 0.2, existingMonthlyPayroll: 50_000, existingOtherNetCashAdjustments: 0 };

describe('three-way financial planning', () => {
  it('builds prudent, central and optimistic trajectories over the same horizon', () => {
    const rows = buildForecastTrajectories(model);
    expect(rows.map((item) => item.id)).toEqual(['prudent', 'central', 'optimistic']);
    expect(rows.every((item) => item.rows.length === 18)).toBe(true);
    expect(rows[0].rows[0].closingCash).toBe(rows[1].rows[0].closingCash);
    expect(rows[1].rows[0].closingCash).toBe(rows[2].rows[0].closingCash);
  });
  it('orders outcomes when growth assumptions differ', () => {
    const rows = buildForecastTrajectories(model);
    expect(rows[0].summary.endingCash).toBeLessThan(rows[1].summary.endingCash);
    expect(rows[1].summary.endingCash).toBeLessThan(rows[2].summary.endingCash);
  });
  it('rejects invalid or incomplete scenario sets', () => {
    expect(() => buildForecastTrajectories(model, DEFAULT_FORECAST_SCENARIOS.slice(0, 2))).toThrow();
    expect(() => buildForecastTrajectories({ ...model, monthlyRevenueGrowth: -0.99 })).toThrow();
  });
  it('raises forecast-based alerts only when the projected thresholds are crossed', () => {
    const rows = buildForecastTrajectories({ ...model, openingCash: 0, monthlyRevenue: 0, monthlyOpexExPayroll: 100_000, existingMonthlyPayroll: 100_000, monthlyRevenueGrowth: 0, monthlyOpexGrowth: 0 });
    const alerts = deriveForecastAlerts(rows);
    expect(alerts.some((item) => item.id === 'prudent-negative-cash')).toBe(true);
    expect(alerts.some((item) => item.id === 'central-low-runway')).toBe(true);
  });
});
