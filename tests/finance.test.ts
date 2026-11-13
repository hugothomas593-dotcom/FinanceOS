import { describe, expect, it } from 'vitest';
import { forecast, summarize, type ModelInputs, type HireInput } from '../src/lib/finance';

const model: ModelInputs = { openingCash: 1_000_000, monthlyRevenue: 100_000, monthlyRevenueGrowth: 0, monthlyOpexExPayroll: 30_000, monthlyOpexGrowth: 0, cogsRatio: .2, existingMonthlyPayroll: 40_000, existingOtherNetCashAdjustments: 0 };
const hire: HireInput = { headcount: 2, startMonth: 1, grossAnnualSalary: 60_000, employerCostRate: .4, benefitsMonthlyPerPerson: 100, recruitingCostPerPerson: 2_000, equipmentCostPerPerson: 1_000, productivityRampMonths: 6 };

describe('deterministic forecast engine', () => {
  it('calculates monthly cash flow and closing cash', () => { const rows = forecast(model, [], 2); expect(rows[0].netCashFlow).toBe(10_000); expect(rows[0].closingCash).toBe(1_010_000); expect(rows[1].closingCash).toBe(1_020_000); });
  it('applies hires only from their start month and includes one-off costs', () => { const rows = forecast(model, [hire], 3); expect(rows[0].payroll).toBe(40_000); expect(rows[0].hiringOneOffCosts).toBe(0); expect(rows[1].payroll).toBeCloseTo(54_200); expect(rows[1].hiringOneOffCosts).toBe(6_000); });
  it('does not assume automatic revenue uplift from hiring', () => { expect(forecast(model, [hire], 3).map(x => x.revenue)).toEqual(forecast(model, [], 3).map(x => x.revenue)); });
  it('rejects invalid COGS ratio, fractional headcount and fractional horizons', () => { expect(() => forecast({ ...model, cogsRatio: 1.2 })).toThrow(); expect(() => forecast(model, [{ ...hire, headcount: 1.5 }])).toThrow(); expect(() => forecast(model, [], 2.5)).toThrow(); });
  it('rejects non-finite or excessive growth assumptions', () => { expect(() => forecast({ ...model, monthlyRevenueGrowth: Number.NaN })).toThrow(); expect(() => forecast({ ...model, monthlyRevenueGrowth: 3 })).toThrow(); });
  it('summarizes the first month with negative cash', () => { const rows = forecast({ ...model, openingCash: 0, monthlyRevenue: 0 }, [], 2); expect(summarize(rows).firstMonthCashNegative).toBe(1); });
  it('returns null runway when net cash flow is positive', () => { expect(forecast(model, [], 1)[0].runwayMonths).toBeNull(); });
});
