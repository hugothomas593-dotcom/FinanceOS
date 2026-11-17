import type { CompanyContext } from './company-context';
import { forecast, summarize, validateModelInputs, type ModelInputs } from './finance';
import {
  analyzeHistoricalActuals,
  calculateUnitEconomics,
  type ActualRecord,
  type CompanyKpis,
} from './finance-intelligence';

export type CfoBriefSeverity = 'critical' | 'warning' | 'info';
export type CfoBriefAlert = { id: string; severity: CfoBriefSeverity; title: string; description: string };

export type CfoBriefInput = {
  inputs: ModelInputs | null;
  modelStatus: 'approved' | 'draft' | 'none';
  actuals: ActualRecord[];
  currency: string;
  kpis?: CompanyKpis;
  metricsPeriod?: string | null;
  context?: CompanyContext;
  generatedAt?: string;
};

export function buildCfoBrief(input: CfoBriefInput) {
  const currency = input.currency.trim().toUpperCase() || 'EUR';
  const actuals = input.actuals ?? [];
  const compatibleActuals = actuals.filter((row) => row.currency.trim().toUpperCase() === currency);
  const currencyMismatchedRecords = actuals.length - compatibleActuals.length;
  const history = analyzeHistoricalActuals(compatibleActuals);
  const unitEconomics = calculateUnitEconomics(
    input.kpis ?? {},
    input.inputs ? (1 - input.inputs.cogsRatio) * 100 : undefined,
  );

  let forecastSummary: ReturnType<typeof summarize> | null = null;
  let forecastRows: ReturnType<typeof forecast> = [];
  if (input.inputs) {
    validateModelInputs(input.inputs);
    forecastRows = forecast(input.inputs, [], 18);
    forecastSummary = summarize(forecastRows);
  }
  const targetRunwayMonths = input.context?.targetRunwayMonths ?? 12;
  const firstMonthBelowTargetRunway = forecastRows.find(
    (row) => row.runwayMonths !== null && row.runwayMonths < targetRunwayMonths,
  )?.month ?? null;


  const categorySpendByMonth = new Map<string, Map<string, number>>();
  for (const row of compatibleActuals) {
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(row.period) || !Number.isFinite(row.amount)) continue;
    if (row.metric_key.split(':')[0]?.toLowerCase() !== 'outflow') continue;
    const month = row.period.slice(0, 7);
    const category = row.metric_key.split(':').slice(1).join(':').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!category) continue;
    const monthCategories = categorySpendByMonth.get(month) ?? new Map<string, number>();
    monthCategories.set(category, (monthCategories.get(category) ?? 0) + Math.abs(row.amount));
    categorySpendByMonth.set(month, monthCategories);
  }
  const currentMonth = new Date().toISOString().slice(0, 7);
  const completedMonths = [...categorySpendByMonth.keys()].filter((month) => month < currentMonth).sort();
  const latestCompletedMonth = completedMonths[completedMonths.length - 1];
  const previousCompletedMonth = completedMonths[completedMonths.length - 2];
  const categoryWatchRules = [
    { id: 'payroll', label: 'Payroll', match: /payroll|salary|salaries|wage/ },
    { id: 'marketing', label: 'Marketing', match: /marketing|advertis|paidmedia|adspend/ },
  ];
  const expectedPreviousMonth = latestCompletedMonth
    ? new Date(Date.UTC(Number(latestCompletedMonth.slice(0, 4)), Number(latestCompletedMonth.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7)
    : null;
  if (latestCompletedMonth && previousCompletedMonth === expectedPreviousMonth) {
    for (const rule of categoryWatchRules) {
      const latestAmount = [...(categorySpendByMonth.get(latestCompletedMonth) ?? [])]
        .filter(([category]) => rule.match.test(category))
        .reduce((sum, [, amount]) => sum + amount, 0);
      const previousAmount = [...(categorySpendByMonth.get(previousCompletedMonth) ?? [])]
        .filter(([category]) => rule.match.test(category))
        .reduce((sum, [, amount]) => sum + amount, 0);
      if (previousAmount > 0 && latestAmount >= previousAmount * 1.2) {
        const changePct = ((latestAmount / previousAmount) - 1) * 100;
        alerts.push({
          id: rule.id + '-spend-increase',
          severity: 'warning',
          title: rule.label + ' outflows increased ' + changePct.toFixed(1) + '% month-on-month',
          description: 'Imported transactions classified as ' + rule.label.toLowerCase() + ' show ' + latestAmount.toLocaleString('en-GB', { maximumFractionDigits: 0 }) + ' ' + currency + ' in ' + latestCompletedMonth + ', versus ' + previousAmount.toLocaleString('en-GB', { maximumFractionDigits: 0 }) + ' ' + currency + ' in ' + previousCompletedMonth + '. This is a change in recorded cash outflows, not proof of a change in headcount or campaign performance. Check category mapping and whether both months are complete.',
        });
      }
    }
  }

  const alerts: CfoBriefAlert[] = [];
  if (!input.inputs || !forecastSummary) {
    alerts.push({
      id: 'model-missing',
      severity: 'critical',
      title: 'Company financial model is missing',
      description: 'Add and save your opening cash, revenue, team costs and operating expenses before relying on a runway or affordability analysis.',
    });
  } else {
    if (forecastSummary.firstMonthCashNegative !== null) {
      alerts.push({
        id: 'cash-negative',
        severity: 'critical',
        title: 'Cash is projected to fall below zero',
        description: 'The current 18-month plan first shows negative closing cash in month ' + forecastSummary.firstMonthCashNegative + '. Review the timing of spending, collections and financing before committing to new costs.',
      });
    }
    if (forecastSummary.firstMonthBelowSixMonthsRunway !== null) {
      alerts.push({
        id: 'runway-low',
        severity: 'warning',
        title: 'Projected runway falls below six months',
        description: 'The first month below six months of modeled runway is month ' + forecastSummary.firstMonthBelowSixMonthsRunway + '. This is a planning threshold, not a prediction of insolvency.',
      });
    }
  }

  if (history.inflowTrendPct !== null && history.inflowTrendPct <= -15) {
    alerts.push({
      id: 'inflows-declining',
      severity: 'warning',
      title: 'Historical cash inflows are slowing',
      description: 'Inflows across the latest three available months are ' + Math.abs(history.inflowTrendPct).toFixed(1) + '% below the previous three available months. Check whether this reflects revenue, collection timing or incomplete imports.',
    });
  }
  if (history.outflowTrendPct !== null && history.outflowTrendPct >= 15) {
    alerts.push({
      id: 'outflows-rising',
      severity: 'warning',
      title: 'Historical cash outflows are increasing',
      description: 'Outflows across the latest three available months are ' + history.outflowTrendPct.toFixed(1) + '% above the previous three available months. Review the largest spending categories and identify any one-off items.',
    });
  }
  if (input.inputs && targetRunwayMonths !== 6 && firstMonthBelowTargetRunway !== null) {
    alerts.push({
      id: 'runway-below-founder-target',
      severity: 'warning',
      title: 'Forecast falls below your runway target',
      description: 'The current forecast first drops below your chosen ' + targetRunwayMonths + '-month runway target in month ' + firstMonthBelowTargetRunway + '. This is your planning threshold, not a universal risk rating.',
    });
  }

  const churnThreshold = input.context?.churnWatchThresholdPct ?? null;
  if (churnThreshold !== null && unitEconomics.monthlyLogoChurnPct !== null && unitEconomics.monthlyLogoChurnPct > churnThreshold) {
    alerts.push({
      id: 'churn-above-founder-threshold',
      severity: 'warning',
      title: 'Monthly customer churn is above your watch threshold',
      description: 'The latest supplied metrics show ' + unitEconomics.monthlyLogoChurnPct.toFixed(1) + '% monthly logo churn, above your chosen ' + churnThreshold.toFixed(1) + '% threshold. Validate the customer counts and investigate the cohorts behind the movement.',
    });
  }

  const cacPaybackThreshold = input.context?.cacPaybackWatchMonths ?? null;
  if (cacPaybackThreshold !== null && unitEconomics.cacPaybackMonths !== null && unitEconomics.cacPaybackMonths > cacPaybackThreshold) {
    alerts.push({
      id: 'cac-payback-above-founder-threshold',
      severity: 'warning',
      title: 'CAC payback is above your watch threshold',
      description: 'The latest one-period estimate is ' + unitEconomics.cacPaybackMonths.toFixed(1) + ' months, above your chosen ' + cacPaybackThreshold.toFixed(1) + '-month threshold. This is a blended estimate, not cohort-attributed CAC.',
    });
  }

  if (input.modelStatus === 'draft') {
    alerts.push({
      id: 'draft-model',
      severity: 'info',
      title: 'The current financial plan is still a draft',
      description: 'Review the assumptions and approve the model version before treating its forecast as your operating baseline.',
    });
  }
  if (history.records === 0) {
    alerts.push({
      id: 'no-actuals',
      severity: 'info',
      title: 'No transaction history has been imported',
      description: 'Import a transaction CSV to give Avenor historical cash-in, cash-out and spending-category context. Imported actuals are not automatically reconciled into the forecast.',
    });
  } else if (history.monthsCovered < 6) {
    alerts.push({
      id: 'limited-history',
      severity: 'info',
      title: 'Historical coverage is still limited',
      description: 'Avenor can see ' + history.monthsCovered + ' month(s) of compatible transaction history. Trend comparisons become more useful with at least six months of complete data.',
    });
  }
  if (currencyMismatchedRecords > 0) {
    alerts.push({
      id: 'currency-mismatch',
      severity: 'warning',
      title: 'Some imported records use a different currency',
      description: currencyMismatchedRecords + ' record(s) were excluded from historical totals because their currency does not match the workspace currency (' + currency + '). Convert or re-import them consistently before comparing totals.',
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      id: 'no-priority-alerts',
      severity: 'info',
      title: 'No priority warning identified',
      description: 'The current saved model does not flag negative cash or sub-six-month runway within 18 months, and no material six-month cash trend is available to flag. Continue reviewing assumptions as the business changes.',
    });
  }

  const priorities = alerts.filter((alert) => alert.severity !== 'info').slice(0, 3).map((alert) => alert.title);
  if (input.modelStatus === 'none' && priorities.length < 3) priorities.push('Add and save company financial assumptions');
  else if (input.modelStatus === 'draft' && priorities.length < 3) priorities.push('Review and approve the company model');
  if (history.records === 0 && priorities.length < 3) priorities.push('Import transaction history');
  if (priorities.length === 0) priorities.push('Refresh company actuals and revisit the forecast');

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    currency,
    modelStatus: input.modelStatus,
    forecast: forecastSummary ? {
      horizonMonths: 18,
      openingCash: input.inputs!.openingCash,
      monthlyRevenue: input.inputs!.monthlyRevenue,
      monthlyOperatingCosts: input.inputs!.monthlyOpexExPayroll + input.inputs!.existingMonthlyPayroll,
      monthlyBurn: forecastRows[0]?.burn ?? 0,
      endingCash: forecastSummary.endingCash,
      minimumCash: forecastSummary.minimumForecastCash,
      lowestCashMonth: forecastSummary.lowestCashMonth,
      firstMonthCashNegative: forecastSummary.firstMonthCashNegative,
      firstMonthBelowSixMonthsRunway: forecastSummary.firstMonthBelowSixMonthsRunway,
      targetRunwayMonths,
      firstMonthBelowTargetRunway,
    } : null,
    historical: {
      records: history.records,
      monthsCovered: history.monthsCovered,
      averageMonthlyInflows: history.averageMonthlyInflows,
      averageMonthlyOutflows: history.averageMonthlyOutflows,
      netCashMovement: history.netCashMovement,
      inflowTrendPct: history.inflowTrendPct,
      outflowTrendPct: history.outflowTrendPct,
      topSpendingCategories: history.topSpendingCategories.slice(0, 5),
      currencies: history.currencies,
    },
    businessMetrics: { period: input.metricsPeriod ?? null, unitEconomics },
    dataQuality: {
      modelStatus: input.modelStatus,
      transactionRecords: history.records,
      monthsCovered: history.monthsCovered,
      currencyMismatchedRecords,
      notes: [
        ...(input.modelStatus === 'draft' ? ['Forecast uses a draft model.'] : []),
        ...(input.context ? ['Founder-provided company context and watch thresholds are user-supplied and have not been independently verified.'] : []),
        ...(history.records === 0 ? ['No compatible imported transaction records are available.'] : []),
        ...(currencyMismatchedRecords > 0 ? ['Foreign-currency records were excluded from historical totals; no FX conversion was applied.'] : []),
        'Imported transaction history is not reconciled into the operating forecast.',
        'Runway is a simplified operating-cash estimate based on supplied assumptions.',
      ],
    },
    alerts,
    priorities: priorities.slice(0, 3),
    basis: 'Deterministic analysis of the latest saved financial model, imported transaction records and monthly business metrics. No AI-generated assumption or automatic accounting reconciliation is used.',
  };
}
