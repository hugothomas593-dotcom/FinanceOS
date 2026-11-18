import { describe, expect, it } from 'vitest';
import {
  analyzeHistoricalActuals,
  compareFinancialScenarios,
  simulateCombinedFinancialDecision,
  calculateAffordableInvestment,
  calculateBreakEven,
  calculateFundraisingImpact,
  calculatePricingImpact,
  calculateWorkingCapitalImpact,
  filterActualsToCurrency,
  simulateFinancialDecision,
  simulateHiringDecision,
} from '../src/lib/finance-intelligence';
import type { ModelInputs } from '../src/lib/finance';
import { buildCfoBrief } from '../src/lib/cfo-brief';

const inputs: ModelInputs = {
  openingCash: 1_000_000,
  monthlyRevenue: 100_000,
  monthlyRevenueGrowth: 0,
  monthlyOpexExPayroll: 40_000,
  monthlyOpexGrowth: 0,
  cogsRatio: 0.2,
  existingMonthlyPayroll: 35_000,
  existingOtherNetCashAdjustments: 0,
};

describe('Avenor financial intelligence', () => {
  it('simulates a recurring cost and one-off investment deterministically', () => {
    const result = simulateFinancialDecision(inputs, {
      name: 'Marketing investment',
      monthlyOpexChange: 5_000,
      oneTimeCashImpact: -25_000,
      oneTimeMonth: 2,
    });
    expect(result.impact.endingCash).toBe(-115_000);
    expect(result.monthlyComparison[0].cashDifference).toBe(-5_000);
    expect(result.monthlyComparison[1].cashDifference).toBe(-35_000);
  });

  it('compares two to four scenarios against the same financial baseline', () => {
    const result = compareFinancialScenarios(inputs, [
      { name: 'Keep current plan' },
      { name: 'Hire two engineers', monthlyPayrollChange: 13_700 },
      { name: 'Delay hiring', oneTimeCashImpact: -7_000, oneTimeMonth: 4 },
    ]);

    expect(result.scenarios).toHaveLength(3);
    expect(result.scenarios[0].endingCashDelta).toBe(0);
    expect(result.scenarios[1].endingCashDelta).toBeLessThan(result.scenarios[0].endingCashDelta);
    expect(result.rankedByEndingCash[0].name).toBe('Keep current plan');
    expect(result.interpretationNote).toContain('ending cash only');
  });

  it('rejects scenario comparisons outside the two-to-four option range', () => {
    expect(() => compareFinancialScenarios(inputs, [{ name: 'Only one option' }])).toThrow('Compare between two and four');
    expect(() => compareFinancialScenarios(inputs, Array.from({ length: 5 }, (_, index) => ({ name: 'Option ' + index })))).toThrow('Compare between two and four');
  });

  it('models linked hiring and marketing actions together with their own start dates', () => {
    const result = simulateCombinedFinancialDecision(inputs, [
      { name: 'Increase marketing', startMonth: 1, monthlyOpexChange: 5_000 },
      { name: 'Hire two engineers', startMonth: 2, durationMonths: 3, monthlyPayrollChange: 10_000, oneTimeCashImpact: -20_000 },
    ], 18, 12);

    expect(result.actions).toHaveLength(2);
    expect(result.monthlyComparison[0].cashDifference).toBe(-5_000);
    expect(result.monthlyComparison[1].cashDifference).toBe(-40_000);
    expect(result.monthlyComparison[3].cashDifference).toBe(-70_000);
    expect(result.monthlyComparison[4].cashDifference).toBe(-75_000);
    expect(result.impact.endingCashDelta).toBe(-140_000);
  });

  it('derives fully loaded hiring and one-off recruitment costs in a combined plan', () => {
    const result = simulateCombinedFinancialDecision(inputs, [
      { name: 'Increase marketing', startMonth: 1, monthlyOpexChange: 5_000 },
      {
        name: 'Hire two engineers',
        startMonth: 2,
        hiring: {
          headcount: 2,
          grossAnnualSalary: 60_000,
          employerCostRate: 0.35,
          benefitsMonthlyPerPerson: 100,
          recruitingCostPerPerson: 2_000,
          equipmentCostPerPerson: 1_500,
        },
      },
    ], 18, 12);

    expect(result.monthlyComparison[0].cashDifference).toBe(-5_000);
    expect(result.monthlyComparison[1].cashDifference).toBe(-30_700);
    expect(result.impact.endingCashDelta).toBe(-329_900);
  });

  it('rejects combined plans with impossible cost or gross-margin assumptions', () => {
    expect(() => simulateCombinedFinancialDecision(inputs, [
      { name: 'Cut all costs', startMonth: 1, monthlyOpexChange: -50_000 },
      { name: 'Another action', startMonth: 1 },
    ])).toThrow('below zero');
    expect(() => simulateCombinedFinancialDecision(inputs, [
      { name: 'Margin uplift', startMonth: 1, grossMarginChangePp: 120 },
      { name: 'Marketing', startMonth: 1, monthlyOpexChange: 1_000 },
    ])).toThrow('invalid margin');
  });

  it('computes operating break-even revenue', () => {
    const result = calculateBreakEven(inputs);
    expect(result.possible).toBe(true);
    if (result.possible) expect(result.requiredMonthlyRevenue).toBe(93_750);
  });

  it('calculates price and volume changes together', () => {
    const result = calculatePricingImpact(inputs, 10, -5);
    expect(result.revenueChangePct).toBeCloseTo(4.5);
    expect(result.scenario.impact.endingCash).toBeGreaterThan(0);
  });

  it('estimates maximum upfront spend under a target runway constraint', () => {
    const result = calculateAffordableInvestment(inputs, 12);
    expect(result.maximumUpfrontSpend).toBeGreaterThan(0);
    expect(result.bindingMonth).toBeGreaterThan(0);
  });

  it('simulates hiring with recurring and one-off costs', () => {
    const result = simulateHiringDecision(inputs, {
      headcount: 2,
      startMonth: 1,
      grossAnnualSalary: 60_000,
      employerCostRate: 0.35,
      benefitsMonthlyPerPerson: 100,
      recruitingCostPerPerson: 2_000,
      equipmentCostPerPerson: 1_500,
      productivityRampMonths: 6,
    });
    expect(result.impact.monthlyLoadedPayrollFromStart).toBe(13_700);
    expect(result.impact.oneOffRecruitmentAndEquipment).toBe(7_000);
    expect(result.impact.endingCashDelta).toBe(-239_900);
  });

  it('calculates a fundraising dilution estimate and cash scenario', () => {
    const result = calculateFundraisingImpact(inputs, 1_000_000, 4_000_000);
    expect(result.newInvestorOwnershipPct).toBe(20);
    expect(result.scenario.impact.endingCash).toBe(1_000_000);
  });

  it('estimates working-capital cash effects from changes in payment terms', () => {
    const result = calculateWorkingCapitalImpact(inputs, 30, 15, 5);
    expect(result.receivablesCashImpact).toBe(-100_000);
    expect(result.payablesCashImpact).toBe(10_000);
    expect(result.inventoryCashImpact).toBeCloseTo(-3_333.3333, 3);
    expect(result.totalEstimatedCashImpact).toBeCloseTo(-93_333.3333, 3);
  });

  it('excludes foreign-currency transactions before calculating workspace-currency cash totals', () => {
    const actuals = [
      { period: '2026-01-05', metric_key: 'inflow:sales', amount: 100_000, currency: 'EUR' },
      { period: '2026-01-06', metric_key: 'outflow:payroll', amount: -40_000, currency: 'EUR' },
      { period: '2026-01-07', metric_key: 'inflow:sales', amount: 50_000, currency: 'GBP' },
      { period: '2026-01-08', metric_key: 'outflow:rent', amount: -10_000, currency: 'USD' },
    ];
    const filtered = filterActualsToCurrency(actuals, ' eur ');
    const historical = analyzeHistoricalActuals(filtered.compatible);

    expect(filtered.compatible).toHaveLength(2);
    expect(filtered.mismatchedRecords).toBe(2);
    expect(filtered.mismatchedCurrencies).toEqual(['GBP', 'USD']);
    expect(historical.totalInflows).toBe(100_000);
    expect(historical.totalOutflows).toBe(40_000);
    expect(historical.currencies).toEqual(['EUR']);
  });

  it('flags a material payroll increase using two consecutive completed months of imported actuals', () => {
    const latest = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1));
    const previous = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 2, 1));
    const latestMonth = latest.toISOString().slice(0, 7);
    const previousMonth = previous.toISOString().slice(0, 7);
    const brief = buildCfoBrief({
      inputs: null,
      modelStatus: 'none',
      currency: 'EUR',
      actuals: [
        { period: previousMonth + '-05', metric_key: 'outflow:payroll', amount: -10_000, currency: 'EUR' },
        { period: latestMonth + '-05', metric_key: 'outflow:payroll', amount: -13_000, currency: 'EUR' },
      ],
    });
    const alert = brief.alerts.find((item) => item.id === 'payroll-spend-increase');
    expect(brief.alerts[0].id).toBe('model-missing');
    expect(alert?.severity).toBe('warning');
    expect(alert?.title).toContain('30.0%');
    expect(alert?.description).toContain(previousMonth);
    expect(alert?.description).toContain(latestMonth);
  });

  it('does not treat an incomplete current month as a completed-month spend trend', () => {
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    const brief = buildCfoBrief({
      inputs: null,
      modelStatus: 'none',
      currency: 'EUR',
      actuals: [
        { period: previousMonth + '-05', metric_key: 'outflow:marketing', amount: -10_000, currency: 'EUR' },
        { period: currentMonth + '-05', metric_key: 'outflow:marketing', amount: -20_000, currency: 'EUR' },
      ],
    });
    expect(brief.alerts.some((item) => item.id === 'marketing-spend-increase')).toBe(false);
  });

  it('summarizes monthly actuals and expense categories', () => {
    const result = analyzeHistoricalActuals([
      { period: '2026-01-05', metric_key: 'inflow:sales', amount: 100_000, currency: 'EUR' },
      { period: '2026-01-05', metric_key: 'outflow:payroll', amount: -40_000, currency: 'EUR' },
      { period: '2026-02-05', metric_key: 'inflow:sales', amount: 110_000, currency: 'EUR' },
    ]);
    expect(result.monthsCovered).toBe(2);
    expect(result.totalInflows).toBe(210_000);
    expect(result.totalOutflows).toBe(40_000);
    expect(result.topSpendingCategories[0].category).toBe('payroll');
  });

  it('calculates unit economics only when the relevant monthly inputs are available', async () => {
    const { calculateUnitEconomics } = await import('../src/lib/finance-intelligence');
    const result = calculateUnitEconomics({
      mrr: 120_000,
      activeCustomers: 100,
      newCustomers: 10,
      churnedCustomers: 5,
      marketingSpend: 12_000,
      salesSpend: 8_000,
    }, 80);
    expect(result.arpa).toBe(1_200);
    expect(result.cac).toBe(2_000);
    expect(result.monthlyLogoChurnPct).toBeCloseTo(5.2631579);
    expect(result.cacPaybackMonths).toBeCloseTo(2.0833333);
    expect(result.ltv).toBeCloseTo(18_240);
    expect(result.ltvToCac).toBeCloseTo(9.12);
  });

  it('does not invent CAC or LTV when required metrics are missing', async () => {
    const { calculateUnitEconomics } = await import('../src/lib/finance-intelligence');
    const result = calculateUnitEconomics({ mrr: 20_000 }, 70);
    expect(result.cac).toBeNull();
    expect(result.ltv).toBeNull();
    expect(result.missingData.length).toBeGreaterThan(0);
  });


  it('models marketing spend, estimated customer acquisition and campaign contribution', async () => {
    const { simulateMarketingInvestment } = await import('../src/lib/finance-intelligence');
    const result = simulateMarketingInvestment(inputs, {
      campaignBudget: 10_000,
      monthlyMarketingSpendIncrease: 2_000,
      expectedRevenueUpliftPct: 10,
      expectedNewCustomers: 20,
      horizonMonths: 12,
    });
    expect(result.totalMarketingSpend).toBe(34_000);
    expect(result.totalIncrementalRevenue).toBe(120_000);
    expect(result.incrementalGrossProfit).toBe(96_000);
    expect(result.modeledContribution).toBe(62_000);
    expect(result.blendedCampaignCac).toBe(1_700);
    expect(result.scenario.impact.endingCash).toBe(62_000);
  });

});
