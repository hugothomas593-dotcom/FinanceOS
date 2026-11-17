import { describe, expect, it } from 'vitest';
import { build13WeekCashForecast } from '../src/lib/cash-flow-forecast';
import type { ModelInputs } from '../src/lib/finance';

const inputs: ModelInputs = {
  openingCash: 10_000,
  monthlyRevenue: 10_000,
  monthlyRevenueGrowth: 0,
  monthlyOpexExPayroll: 1_000,
  monthlyOpexGrowth: 0,
  cogsRatio: 0.2,
  existingMonthlyPayroll: 1_000,
  existingOtherNetCashAdjustments: 0,
};

describe('13-week direct cash forecast', () => {
  it('creates thirteen weekly buckets and shifts an included invoice without counting it twice', () => {
    const result = build13WeekCashForecast({
      openingCash: 10_000,
      asOfDate: '2026-01-01',
      currency: 'EUR',
      inputs,
      invoices: [
        {
          id: 'receivable', direction: 'receivable', category: 'revenue',
          due_date: '2026-01-08', expected_cash_date: '2026-01-08',
          amount: 2_000, currency: 'EUR', included_in_model: true, status: 'open',
        },
        {
          id: 'incremental-payable', direction: 'payable', category: 'other',
          due_date: '2026-01-15', expected_cash_date: '2026-01-15',
          amount: 500, currency: 'EUR', included_in_model: false, status: 'open',
        },
      ],
    });

    expect(result.weeks).toHaveLength(13);
    expect(result.weeks[0].startDate).toBe('2026-01-01');
    expect(result.weeks[0].invoiceCount).toBe(1);
    expect(result.weeks[1].outflows).toBeGreaterThan(0);
    expect(result.endingCash).toBeCloseTo(27_700, 6);
  });

  it('moves overdue invoices to the first week and excludes foreign currencies', () => {
    const result = build13WeekCashForecast({
      openingCash: 1_000,
      asOfDate: '2026-03-01',
      currency: 'EUR',
      inputs,
      invoices: [
        {
          id: 'late', direction: 'receivable', category: 'revenue',
          due_date: '2026-02-15', amount: 300, currency: 'EUR',
          included_in_model: false, status: 'open',
        },
        {
          id: 'foreign', direction: 'payable', category: 'opex',
          due_date: '2026-03-10', amount: 50, currency: 'GBP',
          included_in_model: false, status: 'open',
        },
      ],
    });

    expect(result.overdueInvoiceCount).toBe(1);
    expect(result.weeks[0].inflows).toBeGreaterThan(300);
    expect(result.excludedCurrencyInvoices).toBe(1);
    expect(result.excludedCurrencies).toEqual(['GBP']);
  });

  it('fails safely when opening cash is not finite', () => {
    expect(() => build13WeekCashForecast({
      openingCash: Number.NaN,
      asOfDate: '2026-01-01',
      currency: 'EUR',
      inputs,
      invoices: [],
    })).toThrow(/finite number/);
  });
});
