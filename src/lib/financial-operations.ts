export type FinancialActualRow = {
  period: string;
  metric_key: string;
  amount: number | string;
  currency?: string | null;
  imported_at?: string | null;
};

export type MonthlyCashMovement = {
  month: string;
  inflows: number;
  outflows: number;
  netMovement: number;
  records: number;
};

export type FinancialActivitySummary = {
  transactionRecords: number;
  compatibleRecords: number;
  mismatchedRecords: number;
  mismatchedCurrencies: string[];
  monthsCovered: number;
  firstMonth: string | null;
  latestMonth: string | null;
  latestImportedAt: string | null;
  uncategorisedRecords: number;
  classificationCoveragePct: number | null;
  months: MonthlyCashMovement[];
};

/**
 * Summarises imported bank/accounting movements without mixing currencies or
 * KPI rows into cash activity. Imported records remain distinct from forecast
 * values until a reviewed mapping and reconciliation process exists.
 */
export function summarizeFinancialActivity(
  rows: FinancialActualRow[],
  baseCurrency: string,
): FinancialActivitySummary {
  const currency = baseCurrency.trim().toUpperCase() || 'EUR';
  const monthly = new Map<string, MonthlyCashMovement>();
  const mismatched = new Set<string>();
  let transactionRecords = 0;
  let compatibleRecords = 0;
  let uncategorisedRecords = 0;
  let latestImportedAt: string | null = null;

  for (const row of rows) {
    if (!row || typeof row.metric_key !== 'string' || row.metric_key.startsWith('kpi:')) continue;
    const amount = typeof row.amount === 'number' ? row.amount : Number(row.amount);
    if (!Number.isFinite(amount) || typeof row.period !== 'string' || !/^\d{4}-\d{2}/.test(row.period)) continue;

    transactionRecords += 1;
    const importedAt = row.imported_at ?? null;
    if (importedAt && (!latestImportedAt || importedAt > latestImportedAt)) latestImportedAt = importedAt;

    const rowCurrency = (row.currency ?? currency).trim().toUpperCase() || currency;
    if (rowCurrency !== currency) {
      mismatched.add(rowCurrency);
      continue;
    }
    compatibleRecords += 1;

    const month = row.period.slice(0, 7);
    const current = monthly.get(month) ?? { month, inflows: 0, outflows: 0, netMovement: 0, records: 0 };
    current.records += 1;
    if (amount > 0) current.inflows += amount;
    if (amount < 0) current.outflows += Math.abs(amount);
    current.netMovement += amount;
    monthly.set(month, current);

    const category = row.metric_key.includes(':') ? row.metric_key.slice(row.metric_key.indexOf(':') + 1) : row.metric_key;
    const normalizedCategory = category.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!normalizedCategory || ['uncategorised', 'uncategorized', 'unknown', 'other', 'unclassified'].includes(normalizedCategory)) {
      uncategorisedRecords += 1;
    }
  }

  const months = [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month));
  return {
    transactionRecords,
    compatibleRecords,
    mismatchedRecords: transactionRecords - compatibleRecords,
    mismatchedCurrencies: [...mismatched].sort(),
    monthsCovered: months.length,
    firstMonth: months[0]?.month ?? null,
    latestMonth: months[months.length - 1]?.month ?? null,
    latestImportedAt,
    uncategorisedRecords,
    classificationCoveragePct: compatibleRecords > 0
      ? ((compatibleRecords - uncategorisedRecords) / compatibleRecords) * 100
      : null,
    months,
  };
}
