export type HireInput = {
  headcount: number;
  startMonth: number; // zero-based forecast month
  grossAnnualSalary: number;
  employerCostRate: number; // explicit assumption; jurisdiction-specific
  benefitsMonthlyPerPerson: number;
  recruitingCostPerPerson: number;
  equipmentCostPerPerson: number;
  productivityRampMonths: number; // informational; no revenue uplift is assumed
};

export type ModelInputs = {
  openingCash: number;
  monthlyRevenue: number;
  monthlyRevenueGrowth: number;
  monthlyOpexExPayroll: number;
  monthlyOpexGrowth: number;
  cogsRatio: number;
  existingMonthlyPayroll: number;
  existingOtherNetCashAdjustments: number;
};

export type MonthResult = {
  month: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number | null;
  nonPayrollOpex: number;
  payroll: number;
  hiringOneOffCosts: number;
  netCashFlow: number;
  closingCash: number;
  burn: number;
  runwayMonths: number | null;
};

const finite = (name: string, value: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
};
const nonNegative = (name: string, value: number) => {
  finite(name, value);
  if (value < 0) throw new Error(`${name} cannot be negative`);
};

export function validateModelInputs(inputs: ModelInputs): void {
  if (!inputs || typeof inputs !== 'object') throw new Error('Financial model assumptions are required');
  for (const key of Object.keys(inputs) as (keyof ModelInputs)[]) finite(key, inputs[key]);
  nonNegative('openingCash', inputs.openingCash);
  nonNegative('monthlyRevenue', inputs.monthlyRevenue);
  nonNegative('monthlyOpexExPayroll', inputs.monthlyOpexExPayroll);
  nonNegative('existingMonthlyPayroll', inputs.existingMonthlyPayroll);
  if (inputs.monthlyRevenueGrowth < -0.99 || inputs.monthlyRevenueGrowth > 2) throw new Error('monthlyRevenueGrowth must be between -99% and 200%');
  if (inputs.monthlyOpexGrowth < -0.99 || inputs.monthlyOpexGrowth > 2) throw new Error('monthlyOpexGrowth must be between -99% and 200%');
  if (inputs.cogsRatio < 0 || inputs.cogsRatio > 1) throw new Error('cogsRatio must be between 0 and 1');
}

export function forecast(inputs: ModelInputs, hires: HireInput[] = [], months = 18): MonthResult[] {
  validateModelInputs(inputs);
  if (!Number.isInteger(months) || months < 1 || months > 36) throw new Error('Forecast horizon must be an integer between 1 and 36 months');
  if (!Array.isArray(hires)) throw new Error('Hires must be an array');
  hires.forEach((h, i) => {
    if (!h || typeof h !== 'object') throw new Error(`hires[${i}] is invalid`);
    nonNegative(`hires[${i}].headcount`, h.headcount);
    if (!Number.isInteger(h.headcount) || h.headcount < 1 || h.headcount > 500) throw new Error(`hires[${i}].headcount must be an integer between 1 and 500`);
    nonNegative(`hires[${i}].grossAnnualSalary`, h.grossAnnualSalary);
    nonNegative(`hires[${i}].employerCostRate`, h.employerCostRate);
    if (h.employerCostRate > 3) throw new Error(`hires[${i}].employerCostRate cannot exceed 300%`);
    nonNegative(`hires[${i}].benefitsMonthlyPerPerson`, h.benefitsMonthlyPerPerson);
    nonNegative(`hires[${i}].recruitingCostPerPerson`, h.recruitingCostPerPerson);
    nonNegative(`hires[${i}].equipmentCostPerPerson`, h.equipmentCostPerPerson);
    if (!Number.isInteger(h.startMonth) || h.startMonth < 0 || h.startMonth >= months) throw new Error(`hires[${i}].startMonth must be within the forecast horizon`);
    if (!Number.isInteger(h.productivityRampMonths) || h.productivityRampMonths < 0 || h.productivityRampMonths > 36) throw new Error(`hires[${i}].productivityRampMonths must be between 0 and 36`);
  });

  let cash = inputs.openingCash;
  let revenue = inputs.monthlyRevenue;
  let opex = inputs.monthlyOpexExPayroll;
  const results: MonthResult[] = [];
  for (let m = 0; m < months; m++) {
    if (m > 0) {
      revenue *= 1 + inputs.monthlyRevenueGrowth;
      opex *= 1 + inputs.monthlyOpexGrowth;
    }
    const cogs = revenue * inputs.cogsRatio;
    const payroll = inputs.existingMonthlyPayroll + hires.reduce((sum, h) => m < h.startMonth ? sum : sum + h.headcount * (h.grossAnnualSalary * (1 + h.employerCostRate) / 12 + h.benefitsMonthlyPerPerson), 0);
    const oneOff = hires.reduce((sum, h) => m === h.startMonth ? sum + h.headcount * (h.recruitingCostPerPerson + h.equipmentCostPerPerson) : sum, 0);
    const netCashFlow = revenue - cogs - opex - payroll - oneOff + inputs.existingOtherNetCashAdjustments;
    cash += netCashFlow;
    const burn = Math.max(0, -netCashFlow);
    const row: MonthResult = {
      month: m + 1, revenue, cogs, grossProfit: revenue - cogs,
      grossMargin: revenue > 0 ? (revenue - cogs) / revenue : null,
      nonPayrollOpex: opex, payroll, hiringOneOffCosts: oneOff,
      netCashFlow, closingCash: cash, burn,
      runwayMonths: burn > 0 ? Math.max(0, cash) / burn : null,
    };
    for (const [key, value] of Object.entries(row)) if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Forecast produced a non-finite ${key} in month ${m + 1}; review growth assumptions and input sizes`);
    results.push(row);
  }
  return results;
}

export function summarize(results: MonthResult[]) {
  if (!Array.isArray(results) || !results.length) throw new Error('No forecast results');
  const last = results[results.length - 1];
  const lowestCash = results.reduce((best, row) => row.closingCash < best.closingCash ? row : best, results[0]);
  const firstBelowSix = results.find(row => row.runwayMonths !== null && row.runwayMonths < 6);
  const firstNegativeCash = results.find(row => row.closingCash < 0);
  return {
    endingCash: last.closingCash,
    minimumForecastCash: lowestCash.closingCash,
    lowestCashMonth: lowestCash.month,
    endingRunwayMonths: last.runwayMonths,
    firstMonthBelowSixMonthsRunway: firstBelowSix?.month ?? null,
    firstMonthCashNegative: firstNegativeCash?.month ?? null,
  };
}
