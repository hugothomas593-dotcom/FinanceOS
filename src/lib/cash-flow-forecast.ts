import { validateModelInputs, type ModelInputs } from './finance';

export type CashForecastInvoice = {
  id: string;
  direction: 'receivable' | 'payable';
  category: 'revenue' | 'cogs' | 'payroll' | 'opex' | 'other';
  due_date: string;
  expected_cash_date?: string | null;
  amount: number;
  currency: string;
  included_in_model: boolean;
  status: 'open' | 'paid' | 'void';
};
export type CashForecastWeek = {
  week: number; startDate: string; endDate: string; openingCash: number;
  inflows: number; outflows: number; netMovement: number; closingCash: number;
  invoiceCount: number; overdueInvoiceCount: number;
};
function utcDate(value: string): Date {
  const date = new Date(value.length === 10 ? value + 'T00:00:00.000Z' : value);
  if (Number.isNaN(date.getTime())) throw new Error('A valid ISO date is required');
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function iso(date: Date) { return date.toISOString().slice(0, 10); }
function monthKey(date: Date) { return date.toISOString().slice(0, 7); }
function daysInMonth(date: Date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); }
function addDays(date: Date, days: number) { return new Date(date.getTime() + days * 86_400_000); }
function monthModelTotals(inputs: ModelInputs, date: Date, start: Date) {
  const months = Math.max(0, (date.getUTCFullYear() - start.getUTCFullYear()) * 12 + date.getUTCMonth() - start.getUTCMonth());
  const revenue = inputs.monthlyRevenue * Math.pow(1 + inputs.monthlyRevenueGrowth, months);
  const opex = inputs.monthlyOpexExPayroll * Math.pow(1 + inputs.monthlyOpexGrowth, months);
  return { revenue, cogs: -(revenue * inputs.cogsRatio), payroll: -inputs.existingMonthlyPayroll, opex: -opex, other: inputs.existingOtherNetCashAdjustments };
}
export function build13WeekCashForecast(args: {
  openingCash: number; asOfDate: string; currency: string; inputs: ModelInputs;
  invoices: CashForecastInvoice[]; horizonWeeks?: number;
}) {
  validateModelInputs(args.inputs);
  if (!Number.isFinite(args.openingCash)) throw new Error('Opening cash must be a finite number');
  const horizonWeeks = args.horizonWeeks ?? 13;
  if (horizonWeeks !== 13) throw new Error('Cash forecast horizon must be 13 weeks');
  const start = utcDate(args.asOfDate);
  const horizonEnd = addDays(start, horizonWeeks * 7);
  const currency = args.currency.trim().toUpperCase();
  const compatible = args.invoices.filter(i => i.status === 'open' && i.currency.trim().toUpperCase() === currency && Number.isFinite(i.amount) && i.amount > 0);
  const mismatches = args.invoices.filter(i => i.status === 'open' && i.currency.trim().toUpperCase() !== currency);
  const shifts = new Map<string, Partial<Record<CashForecastInvoice['category'], number>>>();
  const scheduled = new Map<number, { inflows: number; outflows: number; count: number; overdue: number }>();
  for (const invoice of compatible) {
    const signed = invoice.direction === 'receivable' ? invoice.amount : -invoice.amount;
    const due = utcDate(invoice.expected_cash_date || invoice.due_date);
    const target = due < start ? start : due;
    if (target >= horizonEnd) continue;
    const day = Math.floor((target.getTime() - start.getTime()) / 86_400_000);
    const week = Math.min(12, Math.floor(day / 7));
    const bucket = scheduled.get(week) ?? { inflows: 0, outflows: 0, count: 0, overdue: 0 };
    if (signed > 0) bucket.inflows += signed; else bucket.outflows += Math.abs(signed);
    bucket.count += 1; if (due < start) bucket.overdue += 1; scheduled.set(week, bucket);
    if (invoice.included_in_model && invoice.category !== 'other') {
      const key = monthKey(target), monthShift = shifts.get(key) ?? {};
      monthShift[invoice.category] = (monthShift[invoice.category] ?? 0) + signed;
      shifts.set(key, monthShift);
    }
  }
  const daily: number[] = [];
  for (let day = 0; day < 91; day++) {
    const date = addDays(start, day), totals = monthModelTotals(args.inputs, date, start);
    const monthShift = shifts.get(monthKey(date)) ?? {};
    const net = totals.revenue - (monthShift.revenue ?? 0)
      + totals.cogs - (monthShift.cogs ?? 0)
      + totals.payroll - (monthShift.payroll ?? 0)
      + totals.opex - (monthShift.opex ?? 0) + totals.other;
    daily.push(net / daysInMonth(date));
  }
  const weeks: CashForecastWeek[] = [];
  let cash = args.openingCash;
  for (let week = 0; week < 13; week++) {
    const startDay = week * 7, first = addDays(start, startDay), last = addDays(first, 6);
    const baseline = daily.slice(startDay, startDay + 7).reduce((sum, value) => sum + value, 0);
    const invoice = scheduled.get(week) ?? { inflows: 0, outflows: 0, count: 0, overdue: 0 };
    const net = baseline + invoice.inflows - invoice.outflows, opening = cash;
    const inflows = Math.max(0, baseline) + invoice.inflows, outflows = Math.max(0, -baseline) + invoice.outflows;
    cash += net;
    weeks.push({ week: week + 1, startDate: iso(first), endDate: iso(last), openingCash: opening, inflows, outflows, netMovement: net, closingCash: cash, invoiceCount: invoice.count, overdueInvoiceCount: invoice.overdue });
  }
  return {
    currency, asOfDate: iso(start), horizonWeeks: 13, openingCash: args.openingCash,
    endingCash: cash, minimumClosingCash: Math.min(args.openingCash, ...weeks.map(w => w.closingCash)),
    firstNegativeWeek: weeks.find(w => w.closingCash < 0)?.week ?? null,
    overdueInvoiceCount: compatible.filter(i => utcDate(i.expected_cash_date || i.due_date) < start).length,
    excludedCurrencyInvoices: mismatches.length,
    excludedCurrencies: [...new Set(mismatches.map(i => i.currency.trim().toUpperCase()))].sort(),
    invoicesBeyondHorizon: compatible.filter(i => utcDate(i.expected_cash_date || i.due_date) >= horizonEnd).length,
    weeks,
  };
}
