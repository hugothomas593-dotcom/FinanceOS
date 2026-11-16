import { describe, expect, it } from 'vitest';
import { forecast, summarize, type ModelInputs } from '../src/lib/finance';
import {
  analyzeHistoricalActuals,
  calculateAffordableInvestment,
  calculateBreakEven,
  calculateFundraisingImpact,
  calculatePricingImpact,
  calculateUnitEconomics,
  calculateWorkingCapitalImpact,
  simulateHiringDecision,
  simulateFinancialDecision,
  type ActualRecord,
} from '../src/lib/finance-intelligence';

const model: ModelInputs = {
  openingCash: 650_000,
  monthlyRevenue: 120_000,
  monthlyRevenueGrowth: 0.02,
  monthlyOpexExPayroll: 42_000,
  monthlyOpexGrowth: 0.015,
  cogsRatio: 0.22,
  existingMonthlyPayroll: 135_000,
  existingOtherNetCashAdjustments: 0,
};

describe('Avenor synthetic Copilot financial QA — 10 founder questions', () => {
  it('Q1 — What happens to cash over the next 18 months?', () => {
    const result = summarize(forecast(model, [], 18));
    expect(result.endingCash).toBeCloseTo(-636_361.34, 1);
    expect(result.firstMonthCashNegative).toBe(9);
  });

  it('Q2 — Can we hire two engineers at €60k each with 35% employer costs?', () => {
    const result = simulateHiringDecision(model, {
      headcount: 2,
      startMonth: 0,
      grossAnnualSalary: 60_000,
      employerCostRate: 0.35,
      benefitsMonthlyPerPerson: 0,
      recruitingCostPerPerson: 0,
      equipmentCostPerPerson: 0,
      productivityRampMonths: 6,
    }, 18);
    expect(result.impact.monthlyLoadedPayrollFromStart).toBeCloseTo(13_500, 2);
    expect(result.impact.endingCashDelta).toBeCloseTo(-243_000, 2);
    expect(result.scenario.firstMonthCashNegative).toBe(7);
  });

  it('Q3 — What if revenue is 20% below plan?', () => {
    const result = simulateFinancialDecision(model, {
      name: '20% revenue downside',
      revenueChangePct: -20,
      horizonMonths: 18,
    });
    expect(result.impact.endingCash).toBeCloseTo(-400_838.49, 1);
    expect(result.scenario.firstMonthCashNegative).toBe(7);
  });

  it('Q4 — How much monthly revenue is needed to break even?', () => {
    const result = calculateBreakEven(model);
    expect(result.possible).toBe(true);
    if (!result.possible) return;
    expect(result.requiredMonthlyRevenue).toBeCloseTo(226_923.08, 1);
    expect(result.monthlyRevenueGap).toBeCloseTo(106_923.08, 1);
  });

  it('Q5 — Can we spend €30k and still preserve 12 months of runway?', () => {
    const result = calculateAffordableInvestment(model, 12, 18);
    expect(result.maximumUpfrontSpend).toBe(0);
    expect(result.minimumHeadroom).toBeLessThan(0);
  });

  it('Q6 — Does a 10% price increase offset a 5% customer-volume decline?', () => {
    const result = calculatePricingImpact(model, 10, -5, 18);
    expect(result.revenueChangePct).toBeCloseTo(4.5, 8);
    expect(result.scenario.impact.endingCash).toBeCloseTo(90_188.66, 1);
  });

  it('Q7 — What does a €1m raise at €6m pre-money mean for cash and dilution?', () => {
    const result = calculateFundraisingImpact(model, 1_000_000, 6_000_000);
    expect(result.postMoneyValuation).toBe(7_000_000);
    expect(result.newInvestorOwnershipPct).toBeCloseTo(14.2857, 3);
    expect(result.scenario.scenario.endingCash).toBeCloseTo(363_638.66, 1);
    expect(result.scenario.scenario.firstMonthCashNegative).toBeNull();
  });

  it('Q8 — What if customers pay 30 days later?', () => {
    const result = calculateWorkingCapitalImpact(model, 30);
    expect(result.receivablesCashImpact).toBe(-120_000);
    expect(result.totalEstimatedCashImpact).toBe(-120_000);
  });

  it('Q9 — What do our SaaS unit economics look like?', () => {
    const result = calculateUnitEconomics({
      mrr: 130_000,
      activeCustomers: 1_050,
      newCustomers: 52,
      churnedCustomers: 34,
      marketingSpend: 14_000,
      salesSpend: 9_000,
      grossMarginPct: 78,
    });
    expect(result.arpa).toBeCloseTo(123.81, 1);
    expect(result.cac).toBeCloseTo(442.31, 1);
    expect(result.monthlyLogoChurnPct).toBeCloseTo(3.2946, 3);
    expect(result.cacPaybackMonths).toBeCloseTo(4.5801, 3);
    expect(result.ltvToCac).toBeCloseTo(6.6271, 3);
  });

  it('Q10 — What do the last six months of imported cash movements show?', () => {
    const inflows = [100_000, 105_000, 110_000, 115_000, 120_000, 130_000];
    const payroll = [105_000, 108_000, 110_000, 112_000, 115_000, 118_000];
    const hosting = [20_000, 21_000, 22_000, 23_000, 24_000, 26_000];
    const marketing = [8_000, 9_000, 10_000, 10_000, 12_000, 14_000];
    const actuals: ActualRecord[] = [];

    for (let month = 0; month < 6; month += 1) {
      const period = `2026-${String(month + 1).padStart(2, '0')}-15`;
      actuals.push(
        { period, metric_key: 'inflow:revenue', amount: inflows[month], currency: 'EUR' },
        { period, metric_key: 'outflow:payroll', amount: payroll[month], currency: 'EUR' },
        { period, metric_key: 'outflow:hosting', amount: hosting[month], currency: 'EUR' },
        { period, metric_key: 'outflow:marketing', amount: marketing[month], currency: 'EUR' },
        { period, metric_key: 'outflow:software', amount: 5_000, currency: 'EUR' },
      );
    }

    const result = analyzeHistoricalActuals(actuals);
    expect(result.records).toBe(30);
    expect(result.monthsCovered).toBe(6);
    expect(result.averageMonthlyInflows).toBeCloseTo(113_333.33, 1);
    expect(result.averageMonthlyOutflows).toBeCloseTo(149_500, 1);
    expect(result.netCashMovement).toBe(-217_000);
    expect(result.inflowTrendPct).toBeCloseTo(15.873, 2);
  });
});
