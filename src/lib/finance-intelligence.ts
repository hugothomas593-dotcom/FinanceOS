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

export function filterActualsToCurrency(actuals: ActualRecord[], baseCurrency: string) {
  const currency = baseCurrency.trim().toUpperCase();
  const compatible: ActualRecord[] = [];
  const mismatchedCurrencies = new Set<string>();
  let mismatchedRecords = 0;

  for (const row of actuals) {
    const rowCurrency = String(row.currency ?? '').trim().toUpperCase();
    if (rowCurrency === currency) {
      compatible.push(row);
    } else {
      mismatchedRecords += 1;
      mismatchedCurrencies.add(rowCurrency || 'UNKNOWN');
    }
  }

  return {
    compatible,
    mismatchedRecords,
    mismatchedCurrencies: [...mismatchedCurrencies].sort(),
  };
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

export function compareFinancialScenarios(inputs: ModelInputs, scenarios: DecisionChange[]) {
  if (scenarios.length < 2 || scenarios.length > 4) {
    throw new Error('Compare between two and four financial scenarios.');
  }

  const results = scenarios.map((scenario) => simulateFinancialDecision(inputs, scenario));
  const comparison = results.map((result) => ({
    name: result.name,
    assumptionsApplied: result.assumptionsApplied,
    endingCash: result.scenario.endingCash,
    endingCashDelta: result.impact.endingCash,
    minimumCash: result.scenario.minimumForecastCash,
    firstNegativeCashMonth: result.impact.firstNegativeCashMonth,
    firstBelowSixMonthsRunway: result.impact.firstBelowSixMonthsRunway,
  }));
  const rankedByEndingCash = [...comparison]
    .sort((left, right) => right.endingCash - left.endingCash)
    .map((item, index) => ({ name: item.name, rank: index + 1, endingCash: item.endingCash }));

  return {
    baseline: results[0].base,
    scenarios: comparison,
    rankedByEndingCash,
    interpretationNote: 'The ranking uses ending cash only. It is not a complete ranking of strategic merit, execution risk, customer impact or long-term value.',
    caveats: results[0].caveats,
  };
}


export type CombinedDecisionAction = {
  name: string;
  startMonth: number;
  durationMonths?: number;
  revenueChangePct?: number;
  monthlyOpexChange?: number;
  monthlyPayrollChange?: number;
  grossMarginChangePp?: number;
  monthlyOtherCashFlowChange?: number;
  oneTimeCashImpact?: number;
  oneTimeMonth?: number;
};

export function simulateCombinedFinancialDecision(
  inputs: ModelInputs,
  actions: CombinedDecisionAction[],
  horizonMonths = 18,
  targetRunwayMonths = 12,
) {
  if (actions.length < 2 || actions.length > 8) {
    throw new Error('A combined decision must contain between two and eight actions.');
  }
  if (!Number.isInteger(horizonMonths) || horizonMonths < 1 || horizonMonths > 36) {
    throw new Error('Forecast horizon must be an integer between 1 and 36 months.');
  }
  if (!Number.isFinite(targetRunwayMonths) || targetRunwayMonths < 1 || targetRunwayMonths > 36) {
    throw new Error('Target runway must be between 1 and 36 months.');
  }

  const normalized = actions.map((action, index) => {
    const startMonth = action.startMonth;
    const durationMonths = action.durationMonths ?? (horizonMonths - startMonth + 1);
    if (!action.name.trim() || !Number.isInteger(startMonth) || startMonth < 1 || startMonth > horizonMonths) {
      throw new Error(`Action ${index + 1} needs a name and a start month within the forecast horizon.`);
    }
    if (!Number.isInteger(durationMonths) || durationMonths < 1 || startMonth + durationMonths - 1 > horizonMonths) {
      throw new Error(`Action ${index + 1} has a duration outside the forecast horizon.`);
    }
    const oneTimeMonth = action.oneTimeMonth ?? startMonth;
    if (!Number.isInteger(oneTimeMonth) || oneTimeMonth < 1 || oneTimeMonth > horizonMonths) {
      throw new Error(`Action ${index + 1} has a one-off cash month outside the forecast horizon.`);
    }
    const revenueMultiplier = 1 + (action.revenueChangePct ?? 0) / 100;
    if (revenueMultiplier < 0 || revenueMultiplier > 10) {
      throw new Error(`Action ${index + 1} revenue multiplier must remain between 0x and 10x.`);
    }
    return { ...action, startMonth, durationMonths, oneTimeMonth, revenueMultiplier };
  });

  const baseRows = forecast(inputs, [], horizonMonths);
  let closingCash = inputs.openingCash;
  const scenarioRows: MonthResult[] = baseRows.map((baseRow) => {
    const active = normalized.filter((action) =>
      baseRow.month >= action.startMonth &&
      baseRow.month < action.startMonth + action.durationMonths,
    );
    const revenueMultiplier = active.reduce((multiplier, action) => multiplier * action.revenueMultiplier, 1);
    const grossMargin = (1 - inputs.cogsRatio) + active.reduce((sum, action) => sum + (action.grossMarginChangePp ?? 0) / 100, 0);
    if (grossMargin < 0 || grossMargin > 1) {
      throw new Error(`Combined gross-margin assumptions produce an invalid margin in month ${baseRow.month}.`);
    }
    const revenue = baseRow.revenue * revenueMultiplier;
    const cogs = revenue * (1 - grossMargin);
    const nonPayrollOpex = baseRow.nonPayrollOpex + active.reduce((sum, action) => sum + (action.monthlyOpexChange ?? 0), 0);
    const payroll = baseRow.payroll + active.reduce((sum, action) => sum + (action.monthlyPayrollChange ?? 0), 0);
    if (nonPayrollOpex < 0 || payroll < 0) {
      throw new Error(`Combined decisions reduce operating costs below zero in month ${baseRow.month}; check the supplied assumptions.`);
    }
    const oneOffCashImpact = normalized.reduce(
      (sum, action) => sum + (action.oneTimeMonth === baseRow.month ? action.oneTimeCashImpact ?? 0 : 0),
      0,
    );
    const monthlyOtherCashFlowChange = active.reduce((sum, action) => sum + (action.monthlyOtherCashFlowChange ?? 0), 0);
    const netCashFlow = revenue - cogs - nonPayrollOpex - payroll - baseRow.hiringOneOffCosts
      + inputs.existingOtherNetCashAdjustments + monthlyOtherCashFlowChange + oneOffCashImpact;
    closingCash += netCashFlow;
    const burn = Math.max(0, -netCashFlow);
    return {
      ...baseRow,
      revenue,
      cogs,
      grossProfit: revenue - cogs,
      grossMargin: revenue > 0 ? grossMargin : null,
      nonPayrollOpex,
      payroll,
      netCashFlow,
      closingCash,
      burn,
      runwayMonths: burn > 0 ? Math.max(0, closingCash) / burn : null,
    };
  });

  const base = summarize(baseRows);
  const scenario = summarize(scenarioRows);
  const firstBelowTargetRunway = scenarioRows.find(
    (row) => row.runwayMonths !== null && row.runwayMonths < targetRunwayMonths,
  )?.month ?? null;

  return {
    actions: normalized.map(({ revenueMultiplier, ...action }) => action),
    assumptions: { horizonMonths, targetRunwayMonths },
    base,
    scenario,
    impact: {
      endingCashDelta: scenario.endingCash - base.endingCash,
      minimumCashDelta: scenario.minimumForecastCash - base.minimumForecastCash,
      firstNegativeCashMonth: scenario.firstMonthCashNegative,
      firstBelowTargetRunwayMonth: firstBelowTargetRunway,
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
      'Combined actions are modeled together against the same saved baseline, with monthly changes applied from each action start month.',
      'Revenue uplift, gross-margin changes and all cost assumptions are user-supplied; no productivity or growth benefit is inferred from hiring.',
      'This simplified cash forecast excludes tax, VAT timing, debt schedules, working capital, deferred revenue, capex depreciation and FX unless explicitly included in supplied cash-flow adjustments.',
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


export function simulateMarketingInvestment(
  inputs: ModelInputs,
  assumptions: {
    campaignBudget: number;
    monthlyMarketingSpendIncrease: number;
    expectedRevenueUpliftPct: number;
    expectedNewCustomers: number;
    horizonMonths?: number;
  },
) {
  const horizon = assumptions.horizonMonths ?? 18;
  if (assumptions.campaignBudget < 0 || assumptions.monthlyMarketingSpendIncrease < 0) {
    throw new Error('Marketing spend cannot be negative.');
  }
  if (assumptions.expectedRevenueUpliftPct < -100 || assumptions.expectedRevenueUpliftPct > 500) {
    throw new Error('Expected revenue uplift must be between -100% and +500%.');
  }
  if (!Number.isInteger(assumptions.expectedNewCustomers) || assumptions.expectedNewCustomers < 0) {
    throw new Error('Expected new customers must be a non-negative whole number.');
  }
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 36) {
    throw new Error('Marketing horizon must be between 1 and 36 months.');
  }

  const scenario = simulateFinancialDecision(inputs, {
    name: 'Marketing investment',
    revenueChangePct: assumptions.expectedRevenueUpliftPct,
    monthlyOpexChange: assumptions.monthlyMarketingSpendIncrease,
    oneTimeCashImpact: -assumptions.campaignBudget,
    oneTimeMonth: 1,
    horizonMonths: horizon,
  });

  const uplift = assumptions.expectedRevenueUpliftPct / 100;
  const monthlyGrossMargin = 1 - inputs.cogsRatio;
  let baselineRevenue = inputs.monthlyRevenue;
  let totalIncrementalRevenue = 0;
  for (let month = 0; month < horizon; month += 1) {
    totalIncrementalRevenue += baselineRevenue * uplift;
    baselineRevenue *= 1 + inputs.monthlyRevenueGrowth;
  }

  const totalMarketingSpend =
    assumptions.campaignBudget + assumptions.monthlyMarketingSpendIncrease * horizon;
  const incrementalGrossProfit = totalIncrementalRevenue * monthlyGrossMargin;
  const modeledContribution = incrementalGrossProfit - totalMarketingSpend;
  const blendedCampaignCac = assumptions.expectedNewCustomers > 0
    ? totalMarketingSpend / assumptions.expectedNewCustomers
    : null;
  const monthlyIncrementalGrossProfit = inputs.monthlyRevenue * uplift * monthlyGrossMargin;
  const monthlyNetContributionAfterRunRateSpend =
    monthlyIncrementalGrossProfit - assumptions.monthlyMarketingSpendIncrease;
  const campaignPaybackMonths = monthlyNetContributionAfterRunRateSpend > 0
    ? assumptions.campaignBudget / monthlyNetContributionAfterRunRateSpend
    : null;

  return {
    assumptions,
    totalMarketingSpend,
    totalIncrementalRevenue,
    incrementalGrossProfit,
    modeledContribution,
    modeledRoiPct: totalMarketingSpend > 0
      ? (modeledContribution / totalMarketingSpend) * 100
      : null,
    blendedCampaignCac,
    campaignPaybackMonths,
    scenario,
    caveats: [
      'Expected revenue uplift and new customers are user-provided assumptions, not observed campaign outcomes.',
      'CAC is a blended campaign estimate using the supplied campaign budget plus recurring marketing spend and supplied new-customer count.',
      'Payback assumes the current monthly gross-profit uplift persists; it is not a cohort-based payback curve.',
      'Excludes sales commission, agency fees, attribution lag, discounting, retention, refunds and channel mix unless included in supplied spend.',
    ],
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
