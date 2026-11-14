import {
  forecast,
  summarize,
  type HireInput,
  type ModelInputs,
  type MonthResult,
} from './finance';

export type ActualRecord = {
  period: string;
  metric_key: string;
  amount: number;
  currency: string;
  source?: string;
};

export type DecisionChange = {
  name: string;
  revenueChangePct?: number;
  monthlyOpexChange?: number;
  monthlyPayrollChange?: number;
  grossMarginChangePp?: number;
  monthlyOtherCashFlowChange?: number;
  oneTimeCashImpact?: number;
  oneTimeMonth?: number;
  horizonMonths?: number;
};

function signedActualAmount(row: ActualRecord): number {
  const prefix = row.metric_key.split(':')[0]?.toLowerCase();
  if (prefix === 'outflow') return -Math.abs(row.amount);
  if (prefix === 'inflow') return Math.abs(row.amount);
  return row.amount;
}

export function analyzeHistoricalActuals(actuals: ActualRecord[]) {
  const valid = actuals.filter(
    (row) => /^\d{4}-\d{2}-\d{2}$/.test(row.period) && Number.isFinite(row.amount),
  );
  const months = new Map<string, { inflows: number; outflows: number; net: number; rows: number }>();
  const spendByCategory = new Map<string, number>();
  const currencies = new Set<string>();

  for (const row of valid) {
    const month = row.period.slice(0, 7);
    const current = months.get(month) ?? { inflows: 0, outflows: 0, net: 0, rows: 0 };
    const signed = signedActualAmount(row);
    if (signed >= 0) current.inflows += signed;
    else current.outflows += Math.abs(signed);
    current.net += signed;
    current.rows += 1;
    months.set(month, current);
    currencies.add(row.currency);
    if (signed < 0) {
      const category = row.metric_key.split(':').slice(1).join(':') || 'uncategorised';
      spendByCategory.set(category, (spendByCategory.get(category) ?? 0) + Math.abs(signed));
    }
  }

  const monthly = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({ month, ...values }));
  const latest = monthly.slice(-3);
  const previous = monthly.slice(-6, -3);
  const totalInflows = monthly.reduce((sum, row) => sum + row.inflows, 0);
  const totalOutflows = monthly.reduce((sum, row) => sum + row.outflows, 0);
  const averageMonthlyInflows = monthly.length ? totalInflows / monthly.length : 0;
  const averageMonthlyOutflows = monthly.length ? totalOutflows / monthly.length : 0;
  const latestInflows = latest.reduce((sum, row) => sum + row.inflows, 0);
  const previousInflows = previous.reduce((sum, row) => sum + row.inflows, 0);
  const latestOutflows = latest.reduce((sum, row) => sum + row.outflows, 0);
  const previousOutflows = previous.reduce((sum, row) => sum + row.outflows, 0);
  const topSpendingCategories = [...spendByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([category, amount]) => ({ category, amount }));

  return {
    records: valid.length,
    monthsCovered: monthly.length,
    currencies: [...currencies],
    totalInflows,
    totalOutflows,
    netCashMovement: totalInflows - totalOutflows,
    averageMonthlyInflows,
    averageMonthlyOutflows,
    latestThreeMonthInflows: latestInflows,
    previousThreeMonthInflows: previousInflows,
    inflowTrendPct: previousInflows > 0 ? ((latestInflows - previousInflows) / previousInflows) * 100 : null,
    outflowTrendPct: previousOutflows > 0 ? ((latestOutflows - previousOutflows) / previousOutflows) * 100 : null,
    topSpendingCategories,
    monthly,
    limitations: monthly.length < 6
      ? ['Fewer than six complete months are available; trend conclusions are preliminary.']
      : [],
  };
}

function withOneOffImpact(rows: MonthResult[], impact: number, month: number): MonthResult[] {
  if (impact === 0) return rows;
  return rows.map((row) => {
    if (row.month < month) return row;
    const netCashFlow = row.netCashFlow + (row.month === month ? impact : 0);
    const closingCash = row.closingCash + impact;
    const burn = Math.max(0, -netCashFlow);
    return {
      ...row,
      netCashFlow,
      closingCash,
      burn,
      runwayMonths: burn > 0 ? Math.max(0, closingCash) / burn : null,
    };
  });
}

export function simulateFinancialDecision(inputs: ModelInputs, change: DecisionChange) {
  const horizon = change.horizonMonths ?? 18;
  const revenueMultiplier = 1 + (change.revenueChangePct ?? 0) / 100;
  if (revenueMultiplier < 0 || revenueMultiplier > 10) {
    throw new Error('Revenue change must keep the revenue multiplier between 0x and 10x.');
  }

  const adjustedInputs: ModelInputs = {
    ...inputs,
    monthlyRevenue: inputs.monthlyRevenue * revenueMultiplier,
    monthlyOpexExPayroll: inputs.monthlyOpexExPayroll + (change.monthlyOpexChange ?? 0),
    existingMonthlyPayroll: inputs.existingMonthlyPayroll + (change.monthlyPayrollChange ?? 0),
    cogsRatio: inputs.cogsRatio - (change.grossMarginChangePp ?? 0) / 100,
    existingOtherNetCashAdjustments:
      inputs.existingOtherNetCashAdjustments + (change.monthlyOtherCashFlowChange ?? 0),
  };

  const baseRows = forecast(inputs, [], horizon);
  const rawScenarioRows = forecast(adjustedInputs, [], horizon);
  const oneOffMonth = change.oneTimeMonth ?? 1;
  if (!Number.isInteger(oneOffMonth) || oneOffMonth < 1 || oneOffMonth > horizon) {
    throw new Error(`One-off month must be between 1 and ${horizon}.`);
  }
  const scenarioRows = withOneOffImpact(
    rawScenarioRows,
    change.oneTimeCashImpact ?? 0,
    oneOffMonth,
  );
  const base = summarize(baseRows);
  const scenario = summarize(scenarioRows);

  return {
    name: change.name,
    assumptionsApplied: {
      revenueChangePct: change.revenueChangePct ?? 0,
      monthlyOpexChange: change.monthlyOpexChange ?? 0,
      monthlyPayrollChange: change.monthlyPayrollChange ?? 0,
      grossMarginChangePp: change.grossMarginChangePp ?? 0,
      monthlyOtherCashFlowChange: change.monthlyOtherCashFlowChange ?? 0,
      oneTimeCashImpact: change.oneTimeCashImpact ?? 0,
      oneTimeMonth: oneOffMonth,
      horizonMonths: horizon,
    },
    base,
    scenario,
    impact: {
      endingCash: scenario.endingCash - base.endingCash,
      minimumCash: scenario.minimumForecastCash - base.minimumForecastCash,
      firstNegativeCashMonth: scenario.firstMonthCashNegative,
      firstBelowSixMonthsRunway: scenario.firstMonthBelowSixMonthsRunway,
    },
    monthlyComparison: scenarioRows.map((row, index) => ({
      month: row.month,
      baseClosingCash: baseRows[index].closingCash,
      scenarioClosingCash: row.closingCash,
      cashDifference: row.closingCash - baseRows[index].closingCash,
      scenarioNetCashFlow: row.netCashFlow,
      scenarioRunwayMonths: row.runwayMonths,
    })),
    caveats: [
      'This is a deterministic scenario based only on the supplied model assumptions.',
      'It excludes tax, VAT timing, debt schedules, working capital, deferred revenue, capex depreciation and FX unless these are explicitly entered as cash-flow adjustments.',
    ],
  };
}

export function simulateHiringDecision(inputs: ModelInputs, hire: HireInput, horizonMonths = 18) {
  const baseRows = forecast(inputs, [], horizonMonths);
  const scenarioRows = forecast(inputs, [hire], horizonMonths);
  const base = summarize(baseRows);
  const scenario = summarize(scenarioRows);
  return {
    assumptions: hire,
    base,
    scenario,
    impact: {
      endingCashDelta: scenario.endingCash - base.endingCash,
      minimumCashDelta: scenario.minimumForecastCash - base.minimumForecastCash,
      monthlyLoadedPayrollFromStart:
        hire.headcount * (
          hire.grossAnnualSalary * (1 + hire.employerCostRate) / 12
          + hire.benefitsMonthlyPerPerson
        ),
      oneOffRecruitmentAndEquipment:
        hire.headcount * (hire.recruitingCostPerPerson + hire.equipmentCostPerPerson),
    },
    caveat: 'The employer-cost rate is a user-supplied assumption, not verified payroll or tax advice. No automatic revenue uplift is assumed from the hires.',
  };
}

export type BreakEvenResult =
  | { possible: false; reason: string }
  | {
      possible: true;
      grossMarginPct: number;
      monthlyFixedCosts: number;
      requiredMonthlyRevenue: number;
      currentMonthlyRevenue: number;
      monthlyRevenueGap: number;
      requiredRevenueGrowthPct: number | null;
      caveat: string;
    };

export function calculateBreakEven(inputs: ModelInputs): BreakEvenResult {
  const grossMargin = 1 - inputs.cogsRatio;
  const monthlyFixedCosts = inputs.monthlyOpexExPayroll + inputs.existingMonthlyPayroll;
  if (grossMargin <= 0) {
    return { possible: false as const, reason: 'Gross margin is zero or negative; no finite break-even revenue can be calculated.' };
  }
  const requiredRevenue = monthlyFixedCosts / grossMargin;
  return {
    possible: true as const,
    grossMarginPct: grossMargin * 100,
    monthlyFixedCosts,
    requiredMonthlyRevenue: requiredRevenue,
    currentMonthlyRevenue: inputs.monthlyRevenue,
    monthlyRevenueGap: requiredRevenue - inputs.monthlyRevenue,
    requiredRevenueGrowthPct: inputs.monthlyRevenue > 0
      ? (requiredRevenue / inputs.monthlyRevenue - 1) * 100
      : null,
    caveat: 'Simplified operating break-even excludes tax, interest, working-capital movements, capital expenditure and other cash-flow timing effects.',
  };
}

export function calculateAffordableInvestment(inputs: ModelInputs, targetRunwayMonths: number, horizonMonths = 18) {
  if (!Number.isFinite(targetRunwayMonths) || targetRunwayMonths <= 0 || targetRunwayMonths > 36) {
    throw new Error('Target runway must be between 0 and 36 months.');
  }
  const rows = forecast(inputs, [], horizonMonths);
  const constraints = rows.map((row) => {
    const reserve = row.burn * targetRunwayMonths;
    return {
      month: row.month,
      closingCash: row.closingCash,
      monthlyBurn: row.burn,
      requiredReserve: reserve,
      headroom: row.closingCash - reserve,
    };
  });
  const binding = constraints.reduce(
    (min, row) => row.headroom < min.headroom ? row : min,
    constraints[0],
  );
  return {
    targetRunwayMonths,
    maximumUpfrontSpend: Math.max(0, binding.headroom),
    bindingMonth: binding.month,
    minimumHeadroom: binding.headroom,
    constraints,
    caveat: 'Conservative estimate: the reserve holds each forecast month’s projected net burn flat for the target runway period. It is not a full liquidity or working-capital forecast.',
  };
}

export function calculatePricingImpact(
  inputs: ModelInputs,
  priceChangePct: number,
  volumeChangePct = 0,
  horizonMonths = 18,
) {
  if (priceChangePct <= -100 || priceChangePct > 500) throw new Error('Price change must be between -100% and +500%.');
  if (volumeChangePct <= -100 || volumeChangePct > 500) throw new Error('Volume change must be between -100% and +500%.');
  const revenueChangePct = ((1 + priceChangePct / 100) * (1 + volumeChangePct / 100) - 1) * 100;
  return {
    priceChangePct,
    volumeChangePct,
    revenueChangePct,
    scenario: simulateFinancialDecision(inputs, {
      name: 'Pricing and volume scenario',
      revenueChangePct,
      horizonMonths,
    }),
    caveat: 'Volume change is a user-supplied assumption. If omitted, the model assumes volume is unchanged; it does not infer price elasticity.',
  };
}

export function calculateFundraisingImpact(
  inputs: ModelInputs,
  raiseAmount: number,
  preMoneyValuation: number,
) {
  if (raiseAmount <= 0 || preMoneyValuation <= 0) throw new Error('Raise amount and pre-money valuation must both be positive.');
  const dilutionPct = (raiseAmount / (preMoneyValuation + raiseAmount)) * 100;
  return {
    raiseAmount,
    preMoneyValuation,
    postMoneyValuation: preMoneyValuation + raiseAmount,
    newInvestorOwnershipPct: dilutionPct,
    scenario: simulateFinancialDecision(inputs, {
      name: 'Fundraising scenario',
      oneTimeCashImpact: raiseAmount,
      oneTimeMonth: 1,
    }),
    caveat: 'Simple post-money ownership estimate. Excludes option-pool refreshes, SAFEs, convertible notes, liquidation preferences, fees and other securities.',
  };
}

export function calculateWorkingCapitalImpact(
  inputs: ModelInputs,
  changeInDsoDays: number,
  changeInDpoDays = 0,
  changeInInventoryDays = 0,
) {
  const dailyRevenue = inputs.monthlyRevenue / 30;
  const dailyCogs = (inputs.monthlyRevenue * inputs.cogsRatio) / 30;
  const receivablesCashImpact = -dailyRevenue * changeInDsoDays;
  const payablesCashImpact = dailyCogs * changeInDpoDays;
  const inventoryCashImpact = -dailyCogs * changeInInventoryDays;
  const totalCashImpact = receivablesCashImpact + payablesCashImpact + inventoryCashImpact;
  return {
    changeInDsoDays,
    changeInDpoDays,
    changeInInventoryDays,
    receivablesCashImpact,
    payablesCashImpact,
    inventoryCashImpact,
    totalEstimatedCashImpact: totalCashImpact,
    caveat: 'Uses a 30-day month and current revenue/COGS run-rate. Real operational forecasting requires actual receivables, payables, inventory and VAT schedules.',
  };
}


export type CompanyKpis = {
  mrr?: number;
  activeCustomers?: number;
  newCustomers?: number;
  churnedCustomers?: number;
  marketingSpend?: number;
  salesSpend?: number;
  grossMarginPct?: number;
};

export function calculateUnitEconomics(
  kpis: CompanyKpis,
  fallbackGrossMarginPct?: number,
) {
  const grossMarginPct = kpis.grossMarginPct ?? fallbackGrossMarginPct ?? null;
  const activeCustomers = kpis.activeCustomers ?? null;
  const newCustomers = kpis.newCustomers ?? null;
  const churnedCustomers = kpis.churnedCustomers ?? null;
  const mrr = kpis.mrr ?? null;
  const marketingSpend = kpis.marketingSpend ?? null;
  const salesSpend = kpis.salesSpend ?? null;

  const arpa = mrr !== null && activeCustomers !== null && activeCustomers > 0
    ? mrr / activeCustomers
    : null;
  const openingCustomers =
    activeCustomers !== null && newCustomers !== null && churnedCustomers !== null
      ? activeCustomers + churnedCustomers - newCustomers
      : null;
  const monthlyLogoChurnPct =
    openingCustomers !== null && openingCustomers > 0 && churnedCustomers !== null
      ? (churnedCustomers / openingCustomers) * 100
      : null;
  const totalAcquisitionSpend =
    marketingSpend !== null && salesSpend !== null
      ? marketingSpend + salesSpend
      : null;
  const cac =
    totalAcquisitionSpend !== null && newCustomers !== null && newCustomers > 0
      ? totalAcquisitionSpend / newCustomers
      : null;
  const monthlyGrossProfitPerCustomer =
    arpa !== null && grossMarginPct !== null
      ? arpa * (grossMarginPct / 100)
      : null;
  const cacPaybackMonths =
    cac !== null && monthlyGrossProfitPerCustomer !== null && monthlyGrossProfitPerCustomer > 0
      ? cac / monthlyGrossProfitPerCustomer
      : null;
  const ltv =
    monthlyGrossProfitPerCustomer !== null && monthlyLogoChurnPct !== null && monthlyLogoChurnPct > 0
      ? monthlyGrossProfitPerCustomer / (monthlyLogoChurnPct / 100)
      : null;
  const ltvToCac = ltv !== null && cac !== null && cac > 0 ? ltv / cac : null;

  const missingData: string[] = [];
  if (mrr === null || activeCustomers === null) missingData.push('MRR and active customer count are required to calculate ARPA.');
  if (marketingSpend === null || salesSpend === null || newCustomers === null) missingData.push('Marketing spend, sales spend and new customers are required to calculate blended CAC.');
  if (churnedCustomers === null || activeCustomers === null || newCustomers === null) missingData.push('Opening customers, new customers and churned customers are required to calculate monthly logo churn.');
  if (grossMarginPct === null) missingData.push('Gross margin is required to calculate gross-profit-based LTV and CAC payback.');
  if (monthlyLogoChurnPct === 0) missingData.push('Observed churn is zero; LTV is not estimated from an arbitrary floor.');
  if (monthlyLogoChurnPct !== null && monthlyLogoChurnPct < 0) missingData.push('The supplied customer movements imply negative opening customers; reconcile customer counts.');

  return {
    mrr,
    arr: mrr !== null ? mrr * 12 : null,
    activeCustomers,
    newCustomers,
    churnedCustomers,
    openingCustomers,
    arpa,
    grossMarginPct,
    totalAcquisitionSpend,
    cac,
    monthlyLogoChurnPct,
    monthlyGrossProfitPerCustomer,
    cacPaybackMonths,
    ltv,
    ltvToCac,
    methodology: {
      arpa: 'MRR divided by active customers for the same reporting period.',
      cac: 'Marketing plus sales spend divided by new customers for the same reporting period.',
      monthlyLogoChurn: 'Churned customers divided by estimated opening customers (ending active + churned − new).',
      ltv: 'Monthly gross profit per customer divided by monthly logo churn rate.',
      ltvToCac: 'Estimated gross-profit LTV divided by blended CAC.',
    },
    caveats: [
      'All inputs are manually supplied monthly business metrics unless otherwise labeled.',
      'CAC is a blended one-period estimate; it is not cohort-attributed and may not match fully loaded acquisition cost.',
      'LTV assumes constant ARPA, gross margin and churn; it is a simple steady-state estimate, not a cohort-based lifetime model.',
      'Monthly active customers, new customers and churned customers must use a consistent customer definition and period.',
    ],
    missingData,
  };
}

export function buildCompanySnapshot(
  inputs: ModelInputs | null,
  actuals: ActualRecord[],
  currency: string,
  modelStatus: string | null,
  companyKpis: CompanyKpis = {},
) {
  const historical = analyzeHistoricalActuals(actuals);
  const unitEconomics = calculateUnitEconomics(
    companyKpis,
    inputs ? (1 - inputs.cogsRatio) * 100 : undefined,
  );
  if (!inputs) {
    return {
      modelAvailable: false,
      modelStatus,
      currency,
      historical,
      unitEconomics,
      missingData: [
        'No saved financial model is available. Enter opening cash, revenue, payroll, operating expenses and COGS before company-specific forecasting.',
        ...unitEconomics.missingData,
      ],
    };
  }

  const rows = forecast(inputs, [], 18);
  const summary = summarize(rows);
  const monthlyBurn = rows[0].burn;
  const breakEven = calculateBreakEven(inputs);
  const missingData = [
    ...(historical.monthsCovered < 6 ? ['At least six months of categorized actuals are needed for reliable historical trend analysis.'] : []),
    'No verified tax/VAT payment calendar is loaded.',
    'No receivables, payables, debt, deferred revenue or capex schedule is loaded.',
    ...unitEconomics.missingData,
  ];
  return {
    modelAvailable: true,
    modelStatus,
    currency,
    assumptions: inputs,
    operatingMetrics: {
      monthlyRevenue: inputs.monthlyRevenue,
      monthlyGrossProfit: inputs.monthlyRevenue * (1 - inputs.cogsRatio),
      grossMarginPct: (1 - inputs.cogsRatio) * 100,
      monthlyPayroll: inputs.existingMonthlyPayroll,
      monthlyNonPayrollOpex: inputs.monthlyOpexExPayroll,
      monthlyBurn,
      breakEvenRevenue: breakEven.possible ? breakEven.requiredMonthlyRevenue : null,
    },
    forecast: summary,
    historical,
    unitEconomics,
    businessKpis: companyKpis,
    missingData,
  };
}
