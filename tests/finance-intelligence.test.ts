import { describe, expect, it } from 'vitest';
import {
  analyzeHistoricalActuals,
  calculateAffordableInvestment,
  calculateBreakEven,
  calculateFundraisingImpact,
  calculatePricingImpact,
  calculateWorkingCapitalImpact,
  simulateFinancialDecision,
  simulateHiringDecision,
} from '../src/lib/finance-intelligence';
import type { ModelInputs } from '../src/lib/finance';

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
});
