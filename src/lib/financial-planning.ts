import { forecast, summarize, type ModelInputs, type MonthResult } from './finance';

export type ForecastScenarioAdjustment = {
  id: 'prudent' | 'central' | 'optimistic';
  label: string;
  revenueGrowthDeltaPp: number;
  opexGrowthDeltaPp: number;
};

export type ForecastTrajectory = {
  id: ForecastScenarioAdjustment['id'];
  label: string;
  assumptions: ForecastScenarioAdjustment;
  rows: MonthResult[];
  summary: ReturnType<typeof summarize>;
};

export const DEFAULT_FORECAST_SCENARIOS: ForecastScenarioAdjustment[] = [
  { id: 'prudent', label: 'Prudent', revenueGrowthDeltaPp: -2, opexGrowthDeltaPp: 2 },
  { id: 'central', label: 'Central', revenueGrowthDeltaPp: 0, opexGrowthDeltaPp: 0 },
  { id: 'optimistic', label: 'Optimistic', revenueGrowthDeltaPp: 2, opexGrowthDeltaPp: -1 },
];

export function buildForecastTrajectories(
  inputs: ModelInputs,
  adjustments: ForecastScenarioAdjustment[] = DEFAULT_FORECAST_SCENARIOS,
  horizonMonths = 18,
): ForecastTrajectory[] {
  if (adjustments.length !== 3 || new Set(adjustments.map((item) => item.id)).size !== 3) {
    throw new Error('Exactly three distinct forecast scenarios are required.');
  }
  const expected = new Set(['prudent', 'central', 'optimistic']);
  if (adjustments.some((item) => !expected.has(item.id))) {
    throw new Error('Scenario IDs must be prudent, central and optimistic.');
  }
  return adjustments.map((assumption) => {
    const adjustedInputs: ModelInputs = {
      ...inputs,
      monthlyRevenueGrowth: inputs.monthlyRevenueGrowth + assumption.revenueGrowthDeltaPp / 100,
      monthlyOpexGrowth: inputs.monthlyOpexGrowth + assumption.opexGrowthDeltaPp / 100,
    };
    const rows = forecast(adjustedInputs, [], horizonMonths);
    return { id: assumption.id, label: assumption.label, assumptions: assumption, rows, summary: summarize(rows) };
  });
}

export function deriveForecastAlerts(trajectories: ForecastTrajectory[]) {
  const alerts: Array<{ id: string; severity: 'critical' | 'warning'; title: string; description: string }> = [];
  const prudent = trajectories.find((item) => item.id === 'prudent');
  const central = trajectories.find((item) => item.id === 'central');
  if (!prudent || !central) return alerts;
  const negative = prudent.rows.find((row) => row.closingCash < 0);
  if (negative) alerts.push({
    id: 'prudent-negative-cash',
    severity: 'critical',
    title: 'Prudent scenario reaches negative cash',
    description: 'At the current prudent assumptions, projected closing cash falls below zero in month ' + negative.month + '. Review spending, collections or financing options.',
  });
  const belowSix = central.rows.find((row) => row.runwayMonths !== null && row.runwayMonths < 6);
  if (belowSix) alerts.push({
    id: 'central-low-runway',
    severity: 'warning',
    title: 'Central scenario runway falls below six months',
    description: 'The central forecast first projects less than six months of runway in month ' + belowSix.month + '. This is a model-based warning, not a statement of actual cash available today.',
  });
  return alerts;
}
