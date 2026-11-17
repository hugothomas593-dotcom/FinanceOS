import { describe, expect, it } from 'vitest';
import { buildInvestorUpdateMarkdown } from '../src/lib/investor-update';

const sample = {
  companyName: 'Northstar Labs',
  currency: 'EUR',
  generatedAt: new Date('2026-11-17T12:00:00.000Z'),
  openingCash: 500_000,
  monthlyRevenue: 80_000,
  grossMarginPct: 75,
  monthlyNetCashFlow: -12_000,
  forecastEndingCash: 284_000,
  forecast: [
    { month: 1, revenue: 80_000, cogs: 20_000, payroll: 42_000, operatingExpenses: 30_000, netCashFlow: -12_000, closingCash: 488_000 },
    { month: 2, revenue: 84_000, cogs: 21_000, payroll: 42_000, operatingExpenses: 30_000, netCashFlow: -9_000, closingCash: 479_000 },
  ],
  alerts: [{ severity: 'warning' as const, title: 'Runway below target', description: 'The forecast breaches the saved runway target in month 12.' }],
  decisions: [{ title: 'Hire a finance lead', status: 'planned', owner: 'Founder', reviewDate: '2026-12-01', actualOutcomeNote: '' }],
};

describe('investor update export', () => {
  it('builds a clearly labelled report with source caveats, CFO signals and forecast rows', () => {
    const report = buildInvestorUpdateMarkdown(sample);
    expect(report).toContain('# Monthly investor update — Northstar Labs');
    expect(report).toContain('Forecast, not audited reporting');
    expect(report).toContain('€500,000');
    expect(report).toContain('WARNING — Runway below target');
    expect(report).toContain('Hire a finance lead');
    expect(report).toContain('| 2 | €84,000');
    expect(report).toContain('Imported historical transactions are not automatically reconciled');
  });

  it('states when no priority warnings or decisions were returned', () => {
    const report = buildInvestorUpdateMarkdown({ ...sample, alerts: [], decisions: [] });
    expect(report).toContain('No priority warning was returned');
    expect(report).toContain('No saved decisions recorded');
  });

  it('rejects missing or malformed reporting inputs instead of creating misleading output', () => {
    expect(() => buildInvestorUpdateMarkdown({ ...sample, companyName: ' ' })).toThrow('Company name is required');
    expect(() => buildInvestorUpdateMarkdown({ ...sample, currency: 'EURO' })).toThrow('three-letter currency');
    expect(() => buildInvestorUpdateMarkdown({ ...sample, forecast: [] })).toThrow('At least one forecast month');
    expect(() => buildInvestorUpdateMarkdown({ ...sample, monthlyRevenue: Number.NaN })).toThrow('monthlyRevenue must be a finite number');
  });
});
