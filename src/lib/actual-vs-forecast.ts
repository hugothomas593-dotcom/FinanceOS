export type BaselineRow = {
  period: string;
  category: 'revenue' | 'cogs' | 'payroll' | 'opex' | 'other';
  forecast_amount: number | string;
  currency: string;
  captured_at?: string;
};
export type ReconciliationActual = {
  period: string;
  metric_key: string;
  amount: number | string;
  currency: string;
};
export type CategoryMapping = { metric_key: string; forecast_category: 'revenue' | 'cogs' | 'payroll' | 'opex' | 'other' | 'exclude' };

export function inferForecastCategory(metricKey: string): CategoryMapping['forecast_category'] | null {
  const [direction, ...parts] = metricKey.toLowerCase().split(':');
  const label = parts.join(':').replace(/[_-]+/g, ' ');
  if (/transfer|loan|financ|fundrais|capital|vat|tax|taxation|dividend|equity|investment/.test(label)) return 'exclude';
  if (direction === 'inflow') return 'revenue';
  if (direction !== 'outflow') return null;
  if (/payroll|salary|salaries|wage|personnel|staff|employee|employer|social charge/.test(label)) return 'payroll';
  if (/cogs|cost of goods|direct cost|materials|production|fulfil|fulfill|hosting usage/.test(label)) return 'cogs';
  if (/marketing|advert|software|subscription|rent|office|insurance|legal|travel|consult|accounting|bank fee|utilities|cloud|hosting|telecom|professional|operating/.test(label)) return 'opex';
  return null;
}

/**
 * Uses the latest approved forecast snapshot captured before the first day of
 * each month. This prevents a mid-month reforecast from rewriting the baseline
 * against which the month is measured.
 */
export function buildActualVsForecast(args: {
  baselines: BaselineRow[];
  actuals: ReconciliationActual[];
  mappings?: CategoryMapping[];
  baseCurrency: string;
  currentDate?: string;
}) {
  const currency = args.baseCurrency.trim().toUpperCase();
  const currentMonth = (args.currentDate ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
  const overrides = new Map((args.mappings ?? []).map((mapping) => [mapping.metric_key, mapping.forecast_category]));
  const baseline = new Map<string, Map<string, { amount: number; capturedAt: string }>>();
  for (const row of args.baselines) {
    if (row.currency.trim().toUpperCase() !== currency) continue;
    const month = row.period.slice(0, 7);
    if (month >= currentMonth) continue;
    const capturedAt = row.captured_at ?? '';
    if (capturedAt && capturedAt.slice(0, 10) >= month + '-01') continue;
    const value = typeof row.forecast_amount === 'number' ? row.forecast_amount : Number(row.forecast_amount);
    if (!Number.isFinite(value)) continue;
    const categories = baseline.get(month) ?? new Map<string, { amount: number; capturedAt: string }>();
    const previous = categories.get(row.category);
    if (!previous || capturedAt > previous.capturedAt) categories.set(row.category, { amount: value, capturedAt });
    baseline.set(month, categories);
  }

  const actualsByMonth = new Map<string, Map<string, { amount: number; records: number }>>();
  const unmapped = new Map<string, { amount: number; records: number }>();
  const currencyMismatches = new Set<string>();
  let eligibleRecords = 0;
  for (const row of args.actuals) {
    const rowCurrency = row.currency.trim().toUpperCase();
    if (rowCurrency !== currency) {
      currencyMismatches.add(rowCurrency || 'UNKNOWN');
      continue;
    }
    if (row.period.slice(0, 7) >= currentMonth) continue;
    const raw = typeof row.amount === 'number' ? row.amount : Number(row.amount);
    if (!Number.isFinite(raw)) continue;
    const [direction] = row.metric_key.toLowerCase().split(':');
    const amount = direction === 'outflow' ? -Math.abs(raw) : direction === 'inflow' ? Math.abs(raw) : raw;
    const category = overrides.get(row.metric_key) ?? inferForecastCategory(row.metric_key);
    if (!category || category === 'exclude') {
      const current = unmapped.get(row.metric_key) ?? { amount: 0, records: 0 };
      current.amount += amount;
      current.records += 1;
      unmapped.set(row.metric_key, current);
      continue;
    }
    const month = row.period.slice(0, 7);
    const categories = actualsByMonth.get(month) ?? new Map<string, { amount: number; records: number }>();
    const current = categories.get(category) ?? { amount: 0, records: 0 };
    current.amount += amount;
    current.records += 1;
    categories.set(category, current);
    actualsByMonth.set(month, categories);
    eligibleRecords += 1;
  }

  const months = [...baseline.keys()].sort((a, b) => b.localeCompare(a)).map((month) => {
    const planned = baseline.get(month) ?? new Map<string, { amount: number; capturedAt: string }>();
    const actual = actualsByMonth.get(month) ?? new Map<string, { amount: number; records: number }>();
    const categories = (['revenue', 'cogs', 'payroll', 'opex', 'other'] as const).map((category) => {
      const forecast = planned.get(category)?.amount ?? 0;
      const actualValue = actual.get(category)?.amount ?? 0;
      return {
        category, forecast, actual: actualValue,
        variance: actualValue - forecast,
        variancePct: Math.abs(forecast) > 0.005 ? ((actualValue - forecast) / Math.abs(forecast)) * 100 : null,
        records: actual.get(category)?.records ?? 0,
      };
    });
    return {
      month,
      forecastNetCashFlow: categories.reduce((sum, category) => sum + category.forecast, 0),
      actualNetCashFlow: categories.reduce((sum, category) => sum + category.actual, 0),
      variance: categories.reduce((sum, category) => sum + category.variance, 0),
      records: categories.reduce((sum, category) => sum + category.records, 0),
      categories,
    };
  });

  return {
    currency, currentMonth, months, eligibleRecords,
    unmappedCategories: [...unmapped.entries()].map(([metric_key, value]) => ({ metric_key, ...value }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    mismatchedCurrencies: [...currencyMismatches].sort(),
    note: 'Only completed months with an approved forecast snapshot captured before the start of the month are compared. Financing, tax, transfers and unclassified items are kept out unless explicitly mapped.',
  };
}
