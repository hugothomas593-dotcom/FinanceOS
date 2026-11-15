import { forecast, summarize, type HireInput, type ModelInputs } from './finance';
import {
  analyzeHistoricalActuals,
  calculateAffordableInvestment,
  calculateBreakEven,
  calculateFundraisingImpact,
  calculatePricingImpact,
  calculateUnitEconomics,
  simulateFinancialDecision,
  simulateHiringDecision,
} from './finance-intelligence';

type Historical = ReturnType<typeof analyzeHistoricalActuals>;
type UnitEconomics = ReturnType<typeof calculateUnitEconomics>;
type Calculation = { title: string; summary: string; detail?: unknown };
type SaveableScenario = {
  name: string;
  scenarioType: string;
  assumptions: Record<string, unknown>;
  outputs: Record<string, unknown>;
};

export type CopilotFallbackResult = {
  answer: string;
  calculation: Calculation | null;
  saveableScenario: SaveableScenario | null;
};

type Input = {
  message: string;
  companyName: string;
  currency: string;
  modelStatus: string | null;
  inputs: ModelInputs | null;
  targetRunwayMonths: number;
  historical: Historical;
  unitEconomics: UnitEconomics;
};

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString('en-GB')} ${currency}`;
  }
}

function signedMoney(value: number, currency: string): string {
  return value > 0 ? `+${money(value, currency)}` : value < 0 ? `−${money(Math.abs(value), currency)}` : money(0, currency);
}

function normalizeQuestion(message: string): string {
  return message.toLocaleLowerCase('fr-FR').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function percentages(message: string): number[] {
  return [...message.matchAll(/(-?\d+(?:[.,]\d+)?)\s*%/g)]
    .map((match) => Number(match[1].replace(',', '.')))
    .filter((value) => Number.isFinite(value) && Math.abs(value) <= 500);
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.toLowerCase().replace(/[€£$\s]/g, '');
  const suffix = cleaned.match(/(million|thousand|m|k)$/)?.[1];
  const numeric = cleaned.replace(/(million|thousand|m|k)$/, '').replace(',', '.');
  const value = Number(numeric);
  if (!Number.isFinite(value) || value <= 0) return null;
  const multiplier = suffix === 'm' || suffix === 'million' ? 1_000_000
    : suffix === 'k' || suffix === 'thousand' ? 1_000 : 1;
  return value * multiplier;
}

function namedAmount(message: string, label: RegExp): number | null {
  const match = message.match(label);
  if (!match?.[1]) return null;
  return parseAmount(match[1]);
}

function askForModel(companyName: string): CopilotFallbackResult {
  return {
    answer: `I can analyze ${companyName}'s decisions, but there is no valid financial model saved yet. Add opening cash, monthly revenue, payroll, other operating costs and direct costs in Company setup. I will not estimate or invent those numbers. You can still add your company profile and import historical transactions while you prepare the model.`,
    calculation: null,
    saveableScenario: null,
  };
}

function unavailableInput(question: string, reason: string): CopilotFallbackResult {
  return {
    answer: `I can model this in local deterministic mode, but I need one more input before calculating it: **${question}**. ${reason}`,
    calculation: null,
    saveableScenario: null,
  };
}

export function buildCopilotFallback(input: Input): CopilotFallbackResult {
  const q = normalizeQuestion(input.message);
  const french = /\b(combien|pouvons|peut on|notre|votre|tresorerie|chiffre|affaires|baisse|hausse|levee|lever|valorisation|depenses|charges|embaucher|recruter|prix|tarif|seuil|rentabilite|mois|salaire|couts|cout|financement|point mort)\b/.test(q);
  const model = input.inputs;
  const company = input.companyName || 'the company';
  const currency = input.currency;
  const historical = input.historical;
  const unit = input.unitEconomics;

  if (/\b(cac|ltv|arpa|unit economics|churn|retention|customer acquisition|cout d'acquisition|fidelisation|economie unitaire)\b/.test(q)) {
    const fields = [
      ['MRR', unit.mrr, 'money'],
      ['ARR', unit.arr, 'money'],
      ['ARPA', unit.arpa, 'money'],
      ['Blended CAC', unit.cac, 'money'],
      ['Monthly logo churn', unit.monthlyLogoChurnPct, 'percent'],
      ['CAC payback', unit.cacPaybackMonths, 'months'],
      ['Gross-profit LTV', unit.ltv, 'money'],
      ['LTV / CAC', unit.ltvToCac, 'ratio'],
    ] as const;
    const available = fields.filter(([, value]) => typeof value === 'number');
    const display = available.length
      ? available.map(([label, value, kind]) => {
          const formatted = kind === 'money' ? money(value as number, currency)
            : kind === 'percent' ? `${(value as number).toFixed(1)}%`
            : kind === 'months' ? `${(value as number).toFixed(1)} months`
            : `${(value as number).toFixed(2)}x`;
          return `- **${label}:** ${formatted}`;
        }).join('\n')
      : '- No unit-economics metric can be calculated from the supplied data yet.';
    const missing = unit.missingData.length ? `\n\n**Missing inputs**\n${unit.missingData.map((item) => `- ${item}`).join('\n')}` : '';
    return {
      answer: `**Unit economics for ${company}**\n\nThese are estimates calculated from the latest monthly metrics supplied to this workspace.\n\n${display}${missing}\n\nCAC and LTV are only reported where their required inputs are available; they are not cohort-attributed figures.`,
      calculation: {
        title: 'Deterministic unit-economics review',
        summary: `${available.length} of ${fields.length} unit-economics metrics are available.`,
        detail: unit,
      },
      saveableScenario: null,
    };
  }

  if (/\b(spend|spending|expenses?|outflows?|transactions?|cash in|cash out|depenses|charges|couts|historique|tendance|sorties)\b/.test(q) && historical.records > 0 && (!model || /historical|last month|last quarter|category|categories|trend|actual|historique|mois dernier|tendance|categorie/.test(q))) {
    const categories = historical.topSpendingCategories.slice(0, 5);
    const categoryText = categories.length
      ? categories.map((item) => `- ${item.category}: ${money(item.amount, currency)}`).join('\n')
      : '- No categorized outflows were found.';
    const trend = historical.inflowTrendPct === null
      ? 'An inflow trend cannot be compared yet.'
      : `Recent inflows are ${historical.inflowTrendPct >= 0 ? 'up' : 'down'} ${Math.abs(historical.inflowTrendPct).toFixed(1)}% versus the previous three available months.`;
    return {
      answer: `**Historical cash activity**\n\n- Imported records: ${historical.records.toLocaleString('en-GB')}\n- Months covered: ${historical.monthsCovered}\n- Average monthly inflows: ${money(historical.averageMonthlyInflows, currency)}\n- Average monthly outflows: ${money(historical.averageMonthlyOutflows, currency)}\n- Net cash movement: ${signedMoney(historical.netCashMovement, currency)}\n- ${trend}\n\n**Largest spending categories**\n${categoryText}\n\nThis analysis uses imported transactions only. It does not reconcile them into the saved forecast, and foreign-currency amounts are not converted.`,
      calculation: {
        title: 'Historical transaction analysis',
        summary: `${historical.records} records across ${historical.monthsCovered} months.`,
        detail: historical,
      },
      saveableScenario: null,
    };
  }

  if (!model) return askForModel(company);

  const rows = forecast(model, [], 18);
  const base = summarize(rows);
  const burn = rows[0].burn;
  const runway = rows[0].runwayMonths;
  const pct = percentages(input.message);

  if (/\b(break[ -]?even|cover our costs|cover costs|seuil de rentabilite|point mort|couvrir les couts)\b/.test(q)) {
    const result = calculateBreakEven(model);
    if (!result.possible) {
      return {
        answer: `**Break-even cannot be calculated**\n\n${result.reason} Review the direct-cost assumption in Company setup before relying on this result.`,
        calculation: { title: 'Break-even analysis', summary: result.reason, detail: result },
        saveableScenario: null,
      };
    }
    return {
      answer: `**Operating break-even**\n\n- Required monthly revenue: **${money(result.requiredMonthlyRevenue, currency)}**\n- Current monthly revenue: ${money(result.currentMonthlyRevenue, currency)}\n- Monthly revenue gap: **${money(result.monthlyRevenueGap, currency)}**\n- Gross margin used: ${result.grossMarginPct.toFixed(1)}%\n- Fixed monthly costs used: ${money(result.monthlyFixedCosts, currency)}\n\n${result.caveat} This is operating break-even, not a full cash or statutory break-even measure.`,
      calculation: { title: 'Operating break-even', summary: `Required monthly revenue: ${money(result.requiredMonthlyRevenue, currency)}.`, detail: result },
      saveableScenario: null,
    };
  }

  if (/\b(raise|fundrais|funding round|dilution|pre[ -]?money|post[ -]?money|levee|lever|financement|valorisation)\b/.test(q)) {
    const suppliedAmounts = [...q.matchAll(/\d[\d.,]*(?:\s*(?:k|m|million|thousand))?\s*(?:€|£|\$)/gi)]
      .map((match) => parseAmount(match[0]))
      .filter((value): value is number => value !== null);
    const raise = namedAmount(input.message, /(?:raise|raising|funding|round of)\D{0,28}((?:€|£|\$)?\s*\d[\d.,]*(?:\s*(?:k|m|million|thousand))?)/i)
      ?? suppliedAmounts[0]
      ?? null;
    const valuation = namedAmount(input.message, /(?:pre[ -]?money|valuation)\D{0,28}((?:€|£|\$)?\s*\d[\d.,]*(?:\s*(?:k|m|million|thousand))?)/i)
      ?? suppliedAmounts[1]
      ?? null;
    if (raise === null || valuation === null) {
      return unavailableInput(
        'the amount you want to raise and the pre-money valuation',
        'For example: “Model a €1.5m raise at a €6m pre-money valuation.” I will then calculate simple dilution and the cash impact.',
      );
    }
    const result = calculateFundraisingImpact(model, raise, valuation);
    const scenario = result.scenario;
    return {
      answer: `**Fundraising scenario**\n\n- Raise amount: **${money(result.raiseAmount, currency)}**\n- Pre-money valuation: ${money(result.preMoneyValuation, currency)}\n- Post-money valuation: **${money(result.postMoneyValuation, currency)}**\n- New investor ownership: **${result.newInvestorOwnershipPct.toFixed(1)}%**\n- 18-month closing-cash impact versus base: ${signedMoney(scenario.impact.endingCash, currency)}\n\nThis is a simple priced-equity estimate. It excludes option-pool refreshes, SAFEs, convertible notes, liquidation preferences, fees and other securities. Validate the cap table with your legal and finance advisers.`,
      calculation: { title: 'Fundraising and dilution scenario', summary: `Estimated new investor ownership: ${result.newInvestorOwnershipPct.toFixed(1)}%.`, detail: result },
      saveableScenario: {
        name: 'Fundraising scenario',
        scenarioType: 'fundraising',
        assumptions: { modelVersionId: null, raiseAmount: raise, preMoneyValuation: valuation },
        outputs: { ...result, currency },
      },
    };
  }

  if (/\b(pric(e|ing)|discount|prix|tarif|tarification|remise)\b/.test(q)) {
    if (pct.length === 0) {
      return unavailableInput('the proposed price change in percent', 'Also tell me any expected volume or customer change. I will not infer price elasticity.');
    }
    const priceChange = pct[0];
    const volumeChange = pct.length > 1 ? pct[1] : 0;
    const result = calculatePricingImpact(model, priceChange, volumeChange);
    return {
      answer: `**Pricing scenario**\n\n- Price change: ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(1)}%\n- Volume change: ${volumeChange >= 0 ? '+' : ''}${volumeChange.toFixed(1)}% ${pct.length > 1 ? '(supplied assumption)' : '(assumed unchanged because no volume change was supplied)'}\n- Modeled revenue change: **${result.revenueChangePct >= 0 ? '+' : ''}${result.revenueChangePct.toFixed(1)}%**\n- 18-month closing-cash impact versus base: **${signedMoney(result.scenario.impact.endingCash, currency)}**\n\nThe model does not infer price elasticity or churn. The result depends on the volume assumption above.`,
      calculation: { title: 'Pricing and volume sensitivity', summary: `Revenue changes by ${result.revenueChangePct.toFixed(1)}% under the supplied assumptions.`, detail: result },
      saveableScenario: {
        name: 'Pricing and volume scenario',
        scenarioType: 'pricing',
        assumptions: { modelVersionId: null, priceChangePct: priceChange, volumeChangePct: volumeChange },
        outputs: { ...result, currency },
      },
    };
  }

  if (/\b(revenue|sales|pipeline|chiffre d'affaires|ventes)\b/.test(q) && /\b(lower|drop|fall|declin|down|slower|slowdown|decrease|increase|grow|growth|higher|up|baisse|baisser|chute|chuter|diminu\w*|recul|hausse|augment\w*)\b/.test(q)) {
    if (pct.length === 0) {
      return unavailableInput('the expected percentage change in revenue', 'For example: “What happens if revenue is 20% lower for six months?” The current fallback models a sustained 18-month change, not a temporary six-month shock.');
    }
    const directionDown = /\b(lower|drop|fall|declin|down|slower|slowdown|decrease|baisse|baisser|chute|chuter|diminu\w*|recul)\b/.test(q);
    const magnitude = Math.abs(pct[0]);
    const revenueChangePct = directionDown ? -magnitude : magnitude;
    const result = simulateFinancialDecision(model, {
      name: 'Revenue sensitivity scenario',
      revenueChangePct,
      horizonMonths: 18,
    });
    return {
      answer: `**Revenue sensitivity**\n\n- Revenue assumption: ${revenueChangePct >= 0 ? '+' : ''}${revenueChangePct.toFixed(1)}% versus the saved model\n- Base 18-month closing cash: ${money(result.base.endingCash, currency)}\n- Scenario 18-month closing cash: **${money(result.scenario.endingCash, currency)}**\n- Closing-cash difference: **${signedMoney(result.impact.endingCash, currency)}**\n- Base-case first-month runway: ${runway === null ? 'cash-flow positive' : `${runway.toFixed(1)} months`}\n\nI have treated the change as sustained across the full 18-month horizon because no duration was specified. This is a sensitivity, not a sales forecast.`,
      calculation: { title: 'Revenue sensitivity', summary: `18-month closing-cash impact: ${signedMoney(result.impact.endingCash, currency)}.`, detail: result },
      saveableScenario: {
        name: 'Revenue sensitivity scenario',
        scenarioType: 'revenue',
        assumptions: { modelVersionId: null, revenueChangePct, horizonMonths: 18 },
        outputs: { ...result, currency },
      },
    };
  }

  if (/\b(afford|spend|invest|budget|headroom|se permettre|depense|depenser|investir|capacite)\b/.test(q) && !/\b(hire|hiring|salary|headcount|embaucher|recruter|salaire|effectif)\b/.test(q)) {
    const result = calculateAffordableInvestment(model, input.targetRunwayMonths);
    const scenario = simulateFinancialDecision(model, {
      name: 'Maximum upfront spend at target runway',
      oneTimeCashImpact: -result.maximumUpfrontSpend,
      oneTimeMonth: 1,
      horizonMonths: 18,
    });
    return {
      answer: `**Affordable investment under your runway target**\n\n- Founder runway target: **${input.targetRunwayMonths} months**\n- Maximum upfront spend indicated by the model: **${money(result.maximumUpfrontSpend, currency)}**\n- Binding forecast month: ${result.bindingMonth}\n- Minimum headroom before the modeled reserve: ${money(result.minimumHeadroom, currency)}\n\nThis is a conservative estimate based on the saved operating forecast. It does not include tax, VAT, working capital, debt, deferred revenue or unentered capex. It is not a recommendation to spend the full amount.`,
      calculation: { title: 'Affordable spend under runway constraint', summary: `Maximum upfront spend: ${money(result.maximumUpfrontSpend, currency)} at a ${input.targetRunwayMonths}-month target.`, detail: result },
      saveableScenario: {
        name: 'Maximum spend sensitivity',
        scenarioType: 'investment',
        assumptions: { modelVersionId: null, targetRunwayMonths: input.targetRunwayMonths, oneTimeCashImpact: -result.maximumUpfrontSpend },
        outputs: { ...scenario, currency },
      },
    };
  }

  if (/\b(working capital|dso|dpo|receivables|payables|inventory days|payment terms|bfr|besoin en fonds de roulement|creances|fournisseurs|stocks)\b/.test(q)) {
    return unavailableInput('the change in customer collection days (DSO), supplier payment days (DPO) and inventory days, where relevant', 'For example: “Model DSO +15 days, DPO unchanged, inventory days unchanged.” I will not assume payment-term changes.');
  }

  if (/\b(hire|hiring|recruit|employee|engineer|headcount|team size|embaucher|recruter|recrutement|personnes|salaries|ingenieur|effectif|equipe)\b/.test(q)) {
    const countMatch = q.match(/\b(\d+)\s*(?:new\s*)?(?:hires?|people|employees|engineers|staff|heads?|personnes?|salaries?|ingenieurs?)\b/i);
    const count = countMatch ? Number(countMatch[1]) : null;
    const salary = namedAmount(q, /((?:€|£|\$)?\s*\d[\d.,]*(?:\s*(?:k|m|million|thousand))?\s*(?:€|£|\$)?)\s*(?:gross(?: annual)? salary|annual salary|per hire|per person|brut(?: annuel)?|par personne|par embauche)/i)
      ?? namedAmount(q, /(?:gross(?: annual)? salary|annual salary|salary per hire|salary per person|salary of|salary:|brut annuel|salaire annuel|salaire de)\s*((?:€|£|\$)?\s*\d[\d.,]*(?:\s*(?:k|m|million|thousand))?\s*(?:€|£|\$)?)/i);
      ?? namedAmount(input.message, /(?:gross(?: annual)? salary|annual salary|salary per hire|salary per person|salary of|salary:)\s*((?:€|£|\$)?\s*\d[\d.,]*(?:\s*(?:k|m|million|thousand))?)/i);
    const rateMatch = q.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:employer|payroll|charges|on-cost|loaded|patronales?)/i)
      ?? q.match(/(?:employer|payroll|charges|on-cost|loaded|patronales?)[^\d%]{0,20}(\d+(?:[.,]\d+)?)\s*%/i);
      ?? input.message.match(/(?:employer|payroll|charges|on-cost|loaded)[^\d%]{0,20}(\d+(?:[.,]\d+)?)\s*%/i);
    const rate = rateMatch ? Number(rateMatch[1].replace(',', '.')) / 100 : null;
    if (!count || salary === null || rate === null) {
      const missing = [!count ? 'number of hires' : '', salary === null ? 'gross annual salary per person' : '', rate === null ? 'employer-cost rate' : ''].filter(Boolean).join(', ');
      return unavailableInput(missing, 'Please supply these assumptions. Recruitment, benefits and equipment will be excluded unless you provide them; no productivity or revenue uplift is assumed.');
    }
    const hire: HireInput = {
      headcount: count,
      startMonth: 0,
      grossAnnualSalary: salary,
      employerCostRate: rate,
      benefitsMonthlyPerPerson: 0,
      recruitingCostPerPerson: 0,
      equipmentCostPerPerson: 0,
      productivityRampMonths: 6,
    };
    const result = simulateHiringDecision(model, hire);
    return {
      answer: `**Hiring scenario**\n\n- Hires: ${count}\n- Gross annual salary per hire: ${money(salary, currency)}\n- Employer-cost rate: ${(rate * 100).toFixed(1)}% (founder-supplied)\n- Added loaded monthly payroll: **${money(result.impact.monthlyLoadedPayrollFromStart, currency)}**\n- One-off recruitment/equipment: ${money(0, currency)} (not supplied; excluded)\n- 18-month closing-cash impact: **${signedMoney(result.impact.endingCashDelta, currency)}**\n\nNo revenue or productivity uplift is assumed. ${result.caveat}`,
      calculation: { title: 'Hiring plan simulation', summary: `Loaded monthly payroll increases by ${money(result.impact.monthlyLoadedPayrollFromStart, currency)}.`, detail: result },
      saveableScenario: {
        name: `${count} hire scenario`,
        scenarioType: 'hiring',
        assumptions: { modelVersionId: null, hire },
        outputs: { ...result, currency },
      },
    };
  }

  if (/\b(runway|cash burn|cash position|how long will cash|cash left|cash last|tresorerie|liquidites|combien de temps|consommation de cash)\b/.test(q)) {
    const futureText = base.firstMonthCashNegative === null
      ? 'The current 18-month forecast does not show a negative closing-cash month.'
      : `The first negative closing-cash month is month ${base.firstMonthCashNegative}.`;
    return {
      answer: `**Cash and runway review for ${company}**\n\n- Opening cash: ${money(model.openingCash, currency)}\n- Monthly cash burn at the start of the forecast: ${burn > 0 ? money(burn, currency) : 'No net burn under the current assumptions'}\n- Current modeled runway: **${runway === null ? 'Cash-flow positive' : `${runway.toFixed(1)} months`}**\n- 18-month projected closing cash: **${money(base.endingCash, currency)}**\n- Lowest forecast cash: ${money(base.minimumForecastCash, currency)}\n- ${futureText}\n\nThis is an operating forecast from your saved assumptions, not a live bank balance. Imported actuals are separate unless explicitly reconciled.`,
      calculation: { title: '18-month cash and runway review', summary: `Modeled runway: ${runway === null ? 'cash-flow positive' : `${runway.toFixed(1)} months`}.`, detail: { base, monthlyBurn: burn, openingCash: model.openingCash } },
      saveableScenario: null,
    };
  }

  if (/\b(spend|expenses?|costs?|outflows?|depenses|charges|couts)\b/.test(q) && historical.records > 0) {
    return {
      answer: `**Historical spending review**\n\n- Average monthly outflows: ${money(historical.averageMonthlyOutflows, currency)}\n- Average monthly inflows: ${money(historical.averageMonthlyInflows, currency)}\n- Net cash movement: ${signedMoney(historical.netCashMovement, currency)}\n- Top categories: ${historical.topSpendingCategories.slice(0, 4).map((item) => `${item.category} (${money(item.amount, currency)})`).join(', ') || 'No categorized spend found'}.\n\nThese are imported actuals, not forecast inputs.`,
      calculation: { title: 'Historical cash movement', summary: `${historical.records} records across ${historical.monthsCovered} months.`, detail: historical },
      saveableScenario: null,
    };
  }

  return {
    answer: `**Current company position**\n\n- Monthly revenue: ${money(model.monthlyRevenue, currency)}\n- Monthly payroll: ${money(model.existingMonthlyPayroll, currency)}\n- Other monthly operating costs: ${money(model.monthlyOpexExPayroll, currency)}\n- Gross margin: ${((1 - model.cogsRatio) * 100).toFixed(1)}%\n- Monthly net cash burn: ${burn > 0 ? money(burn, currency) : 'No net burn under current assumptions'}\n- 18-month projected closing cash: ${money(base.endingCash, currency)}\n\nI am in deterministic local mode because the external AI service did not respond. I can still calculate runway, affordability, break-even, revenue sensitivity, pricing and fundraising scenarios from the saved model. Tell me the decision, the amount or percentage, and the time horizon you want to test.`,
    calculation: { title: 'Saved company financial snapshot', summary: `18-month projected closing cash: ${money(base.endingCash, currency)}.`, detail: { base, monthlyBurn: burn, modelStatus: input.modelStatus } },
    saveableScenario: null,
  };
}
