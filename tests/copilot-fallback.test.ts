import { describe, expect, it } from 'vitest';
import { buildCopilotFallback } from '../src/lib/copilot-fallback';
import { analyzeHistoricalActuals, calculateUnitEconomics } from '../src/lib/finance-intelligence';
import type { ModelInputs } from '../src/lib/finance';

const model: ModelInputs = {
  openingCash: 1_000_000,
  monthlyRevenue: 100_000,
  monthlyRevenueGrowth: 0,
  monthlyOpexExPayroll: 40_000,
  monthlyOpexGrowth: 0,
  cogsRatio: 0.2,
  existingMonthlyPayroll: 35_000,
  existingOtherNetCashAdjustments: 0,
};

const historical = analyzeHistoricalActuals([]);
const unitEconomics = calculateUnitEconomics({}, 80);

function fallback(message: string, overrides: Partial<Parameters<typeof buildCopilotFallback>[0]> = {}) {
  return buildCopilotFallback({
    message,
    companyName: 'Northstar',
    currency: 'EUR',
    modelStatus: 'approved',
    inputs: model,
    targetRunwayMonths: 12,
    historical,
    unitEconomics,
    ...overrides,
  });
}

describe('deterministic Copilot fallback', () => {
  it('models an explicitly stated revenue downside without inventing a duration', () => {
    const result = fallback('What happens if revenue is 20% lower?');
    expect(result.calculation?.title).toBe('Revenue sensitivity');
    expect((result.calculation?.detail as { assumptionsApplied: { revenueChangePct: number } }).assumptionsApplied.revenueChangePct).toBe(-20);
    expect(result.saveableScenario?.scenarioType).toBe('revenue');
    expect(result.answer).toContain('full 18-month horizon');
  });

  it('calculates affordable spend against the founder runway target', () => {
    const result = fallback('How much can we afford to invest?');
    expect(result.calculation?.title).toBe('Affordable spend under runway constraint');
    expect(result.saveableScenario?.scenarioType).toBe('investment');
    expect(result.answer).toContain('12 months');
  });

  it('returns an operating break-even result', () => {
    const result = fallback('What is our break-even revenue?');
    expect(result.calculation?.title).toBe('Operating break-even');
    expect(result.answer).toContain('€93,750');
  });

  it('does not infer price elasticity when only the price change is supplied', () => {
    const result = fallback('What if we increase pricing by 10%?');
    expect(result.calculation?.title).toBe('Pricing and volume sensitivity');
    expect(result.answer).toContain('assumed unchanged');
    expect(result.saveableScenario?.scenarioType).toBe('pricing');
  });

  it('requires the employer-cost assumption before simulating a hire', () => {
    const result = fallback('Can we hire two engineers at a gross annual salary of €60k?');
    expect(result.calculation).toBeNull();
    expect(result.saveableScenario).toBeNull();
    expect(result.answer).toContain('employer-cost rate');
  });

  it('simulates a hire when all material payroll assumptions are supplied', () => {
    const result = fallback('Can we hire 2 people at €60k gross annual salary with a 35% employer-cost rate?');
    expect(result.calculation?.title).toBe('Hiring plan simulation');
    expect(result.saveableScenario?.scenarioType).toBe('hiring');
    expect(result.answer).toContain('€13,500');
  });

  it('calculates post-money dilution from supplied fundraising inputs', () => {
    const result = fallback('Can we raise €1.5m at a €6m pre-money valuation?');
    expect(result.calculation?.title).toBe('Fundraising and dilution scenario');
    expect(result.answer).toContain('20.0%');
    expect(result.saveableScenario?.scenarioType).toBe('fundraising');
  });

  it('asks for a financial model rather than inventing company numbers', () => {
    const result = fallback('Can we afford to hire someone?', { inputs: null });
    expect(result.answer).toContain('no valid financial model');
    expect(result.calculation).toBeNull();
  });

  it('models a French revenue downside with accented apostrophes', () => {
    const result = fallback('Que se passe-t-il si notre chiffre d’affaires baisse de 20 % ?');
    expect(result.calculation?.title).toBe('Revenue sensitivity');
    expect((result.calculation?.detail as { assumptionsApplied: { revenueChangePct: number } }).assumptionsApplied.revenueChangePct).toBe(-20);
    expect(result.saveableScenario?.scenarioType).toBe('revenue');
  });

  it('parses a French fundraising amount and pre-money valuation in euros', () => {
    const result = fallback('Peut-on lever 1,5 M€ sur une valorisation pre-money de 6 M€ ?');
    expect(result.calculation?.title).toBe('Fundraising and dilution scenario');
    expect((result.calculation?.detail as { raiseAmount: number }).raiseAmount).toBe(1_500_000);
    expect((result.calculation?.detail as { preMoneyValuation: number }).preMoneyValuation).toBe(6_000_000);
    expect(result.saveableScenario?.scenarioType).toBe('fundraising');
  });

  it('parses a French hiring plan with gross salary and employer charges', () => {
    const result = fallback('Peut-on embaucher 2 personnes avec un salaire brut annuel de 60 k€ et 35 % de charges patronales ?');
    expect(result.calculation?.title).toBe('Hiring plan simulation');
    expect((result.calculation?.detail as { impact: { monthlyLoadedPayrollFromStart: number } }).impact.monthlyLoadedPayrollFromStart).toBe(13_500);
    expect(result.saveableScenario?.scenarioType).toBe('hiring');
  });

});
