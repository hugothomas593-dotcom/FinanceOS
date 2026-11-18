export type InvestorUpdateInput = {
  companyName: string;
  currency: string;
  generatedAt: Date;
  openingCash: number;
  monthlyRevenue: number;
  grossMarginPct: number;
  monthlyNetCashFlow: number;
  forecastEndingCash: number;
  forecast: Array<{
    month: number;
    revenue: number;
    cogs: number;
    payroll: number;
    operatingExpenses: number;
    netCashFlow: number;
    closingCash: number;
  }>;
  alerts: Array<{ severity: 'critical' | 'warning' | 'info'; title: string; description: string }>;
  decisions: Array<{ title: string; status: string; owner: string; reviewDate: string; actualOutcomeNote: string }>;
};

function cleanText(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').trim();
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function finite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
}

export function buildInvestorUpdateMarkdown(input: InvestorUpdateInput): string {
  if (!input.companyName.trim()) throw new Error('Company name is required');
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error('A three-letter currency code is required');
  if (!(input.generatedAt instanceof Date) || Number.isNaN(input.generatedAt.getTime())) {
    throw new Error('A valid report date is required');
  }
  if (!Array.isArray(input.forecast) || input.forecast.length === 0) {
    throw new Error('At least one forecast month is required');
  }
  for (const [name, value] of Object.entries({
    openingCash: input.openingCash,
    monthlyRevenue: input.monthlyRevenue,
    grossMarginPct: input.grossMarginPct,
    monthlyNetCashFlow: input.monthlyNetCashFlow,
    forecastEndingCash: input.forecastEndingCash,
  })) finite(name, value);
  for (const [index, row] of input.forecast.entries()) {
    for (const [name, value] of Object.entries(row)) {
      if (typeof value === 'number') finite(`forecast[${index}].${name}`, value);
    }
  }

  const forecastRows = [
    '| Month | Revenue | COGS | Payroll | Operating expenses | Net cash flow | Closing cash |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...input.forecast.map((row) =>
      `| ${row.month} | ${money(row.revenue, input.currency)} | ${money(row.cogs, input.currency)} | ${money(row.payroll, input.currency)} | ${money(row.operatingExpenses, input.currency)} | ${money(row.netCashFlow, input.currency)} | ${money(row.closingCash, input.currency)} |`,
    ),
  ];

  const alerts = input.alerts.length
    ? input.alerts.map((alert) => `- **${alert.severity.toUpperCase()} — ${cleanText(alert.title)}:** ${cleanText(alert.description)}`).join('\n')
    : '- No priority warning was returned by the current CFO Brief. This is not a guarantee of financial health.';

  const decisions = input.decisions.length
    ? input.decisions.map((decision) => {
        const metadata = [decision.owner ? `Owner: ${cleanText(decision.owner)}` : '', decision.reviewDate ? `Review: ${cleanText(decision.reviewDate)}` : ''].filter(Boolean).join(' · ');
        return `- **${cleanText(decision.title)}** — ${cleanText(decision.status)}${metadata ? ` (${metadata})` : ''}${decision.actualOutcomeNote ? `\n  - Outcome note: ${cleanText(decision.actualOutcomeNote)}` : ''}`;
      }).join('\n')
    : '- No saved decisions recorded.';

  return [
    `# Monthly investor update — ${cleanText(input.companyName)}`,
    '',
    `Generated: ${input.generatedAt.toISOString()}`,
    '',
    '> **Forecast, not audited reporting.** This snapshot is generated from the workspace assumptions and saved decisions. Verify every figure against source records before sharing externally. It excludes tax/VAT timing, debt schedules, working capital, FX and other items not modeled in Avenor.',
    '',
    '## Financial snapshot',
    '',
    `- Starting cash: **${money(input.openingCash, input.currency)}**`,
    `- Monthly revenue assumption: **${money(input.monthlyRevenue, input.currency)}**`,
    `- Gross margin assumption: **${input.grossMarginPct.toFixed(1)}%**`,
    `- First-month net cash flow: **${money(input.monthlyNetCashFlow, input.currency)}**`,
    `- Forecast closing cash (month ${input.forecast[input.forecast.length - 1].month}): **${money(input.forecastEndingCash, input.currency)}**`,
    '',
    '## CFO signals',
    '',
    alerts,
    '',
    '## Saved decisions',
    '',
    decisions,
    '',
    '## 18-month operating forecast',
    '',
    ...forecastRows,
    '',
    '## Important limitations',
    '',
    'This is a simplified operating cash forecast based on user-entered assumptions. Imported historical transactions are not automatically reconciled into forecast assumptions. Payroll rates, tax treatment and accounting classifications must be validated for the company jurisdiction.',
    '',
  ].join('\n');
}
