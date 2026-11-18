import { describe, expect, it } from 'vitest';
import { buildCfoBrief } from '../src/lib/cfo-brief';
import type { ModelInputs } from '../src/lib/finance';
import type { ActualRecord } from '../src/lib/finance-intelligence';

const stableInputs: ModelInputs = {
  openingCash: 1_000_000,
  monthlyRevenue: 100_000,
  monthlyRevenueGrowth: 0,
  monthlyOpexExPayroll: 40_000,
  monthlyOpexGrowth: 0,
  cogsRatio: 0.2,
  existingMonthlyPayroll: 35_000,
  existingOtherNetCashAdjustments: 0,
};

describe('Weekly CFO Brief', () => {
  it('flags negative cash and low runway from the deterministic forecast', () => {
    const inputs: ModelInputs = { ...stableInputs, openingCash: 10_000, monthlyRevenue: 5_000, monthlyOpexExPayroll: 4_000, existingMonthlyPayroll: 4_000, cogsRatio: 0.5 };
    const brief = buildCfoBrief({ inputs, modelStatus: 'approved', actuals: [], currency: 'EUR' });
    expect(brief.forecast?.firstMonthCashNegative).toBe(2);
    expect(brief.alerts.some((alert) => alert.id === 'cash-negative')).toBe(true);
    expect(brief.alerts.some((alert) => alert.id === 'runway-low')).toBe(true);
  });

  it('does not invent a forecast when there is no valid model', () => {
    const brief = buildCfoBrief({ inputs: null, modelStatus: 'none', actuals: [], currency: 'EUR' });
    expect(brief.forecast).toBeNull();
    expect(brief.alerts[0].id).toBe('model-missing');
    expect(brief.priorities).toContain('Add and save company financial assumptions');
  });

  it('uses founder runway and unit-economics watch thresholds for proactive alerts', () => {
    const context = {
      industry: 'Software',
      businessModel: 'saas' as const,
      stage: 'seed' as const,
      productDescription: 'Workflow software',
      targetCustomer: 'SMBs',
      geography: 'Europe',
      pricingModel: 'Monthly subscription',
      mainGoal: 'Reach sustainable growth',
      nextMilestone: 'Series A readiness',
      targetRunwayMonths: 12,
      churnWatchThresholdPct: 10,
      cacPaybackWatchMonths: 3,
      founderNotes: '',
    };
    const inputs: ModelInputs = {
      ...stableInputs,
      openingCash: 10_000,
      monthlyRevenue: 5_000,
      monthlyOpexExPayroll: 4_000,
      existingMonthlyPayroll: 4_000,
      cogsRatio: 0.2,
    };
    const brief = buildCfoBrief({
      inputs,
      modelStatus: 'approved',
      actuals: [],
      currency: 'EUR',
      context,
      kpis: {
        mrr: 9_500,
        activeCustomers: 95,
        newCustomers: 10,
        churnedCustomers: 15,
        marketingSpend: 2_000,
        salesSpend: 1_000,
        grossMarginPct: 80,
      },
    });
    expect(brief.forecast?.targetRunwayMonths).toBe(12);
    expect(brief.alerts.some((alert) => alert.id === 'runway-below-founder-target')).toBe(true);
    expect(brief.alerts.some((alert) => alert.id === 'churn-above-founder-threshold')).toBe(true);
    expect(brief.alerts.some((alert) => alert.id === 'cac-payback-above-founder-threshold')).toBe(true);
  });

  it('flags worsening cash trends and excludes foreign-currency records from totals', () => {
    const actuals: ActualRecord[] = [];
    for (let month = 1; month <= 6; month += 1) {
      const period = '2026-' + String(month).padStart(2, '0') + '-15';
      const inflow = month <= 3 ? 10_000 : 6_000;
      const outflow = month <= 3 ? -2_000 : -3_000;
      actuals.push(
        { period, metric_key: 'inflow:sales', amount: inflow, currency: 'EUR' },
        { period, metric_key: 'outflow:payroll', amount: outflow, currency: 'EUR' },
      );
    }
    actuals.push({ period: '2026-06-20', metric_key: 'inflow:other', amount: 500_000, currency: 'USD' });
    const brief = buildCfoBrief({ inputs: stableInputs, modelStatus: 'approved', actuals, currency: 'EUR' });
    expect(brief.historical.records).toBe(12);
    expect(brief.historical.inflowTrendPct).toBe(-40);
    expect(brief.historical.outflowTrendPct).toBe(50);
    expect(brief.dataQuality.currencyMismatchedRecords).toBe(1);
    expect(brief.alerts.some((alert) => alert.id === 'currency-mismatch')).toBe(true);
  });
});
