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
  if (input.inputs) {
    validateModelInputs(input.inputs);
    forecastSummary = summarize(forecast(input.inputs, [], 18));
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
      endingCash: forecastSummary.endingCash,
      minimumCash: forecastSummary.minimumForecastCash,
      lowestCashMonth: forecastSummary.lowestCashMonth,
      firstMonthCashNegative: forecastSummary.firstMonthCashNegative,
      firstMonthBelowSixMonthsRunway: forecastSummary.firstMonthBelowSixMonthsRunway,
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
