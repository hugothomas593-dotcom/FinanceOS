'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ModelInputs } from '@/lib/finance';
import { simulateFinancialDecision } from '@/lib/finance-intelligence';

const demoModel: ModelInputs = {
  openingCash: 650_000,
  monthlyRevenue: 120_000,
  monthlyRevenueGrowth: 0.02,
  monthlyOpexExPayroll: 42_000,
  monthlyOpexGrowth: 0.015,
  cogsRatio: 0.22,
  existingMonthlyPayroll: 135_000,
  existingOtherNetCashAdjustments: 0,
};

const scenarios = [
  {
    id: 'hire',
    label: 'Hire two engineers',
    title: 'Can we afford two engineers?',
    description: 'Two hires at €60k gross annual salary each, with a 35% employer-cost assumption.',
    change: { name: 'Hire two engineers', monthlyPayrollChange: 13_500, horizonMonths: 18 },
    caveat: '€13,500 of additional loaded monthly payroll from month one. Recruiting, equipment and benefits are excluded; no productivity uplift is assumed.',
  },
  {
    id: 'revenue',
    label: 'Revenue falls 20%',
    title: 'What if revenue drops by 20%?',
    description: 'A sustained 20% reduction in monthly revenue across the full 18-month forecast.',
    change: { name: 'Revenue downside', revenueChangePct: -20, horizonMonths: 18 },
    caveat: 'The 20% revenue reduction is held constant for all 18 months. No cost reductions or management actions are assumed.',
  },
  {
    id: 'pricing',
    label: 'Increase prices 10%',
    title: 'What if we increase prices by 10%?',
    description: 'A 10% increase in revenue, assuming customer volume and churn remain unchanged.',
    change: { name: 'Price increase', revenueChangePct: 10, horizonMonths: 18 },
    caveat: 'This assumes unchanged customer volume and churn. Avenor does not infer price elasticity from the supplied figures.',
  },
  {
    id: 'fundraise',
    label: 'Raise €1m',
    title: 'What if we raise €1 million?',
    description: 'A €1m cash inflow in month one at a €6m pre-money valuation.',
    change: { name: 'Seed extension', oneTimeCashImpact: 1_000_000, oneTimeMonth: 1, horizonMonths: 18 },
    caveat: 'Simple priced-equity estimate: €7m post-money and 14.3% indicative new-investor ownership. Excludes fees, convertibles and option-pool changes.',
  },
] as const;

type ScenarioId = typeof scenarios[number]['id'];

const eur = (value: number) => new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
}).format(value);

export function DemoPlayground() {
  const [selectedId, setSelectedId] = useState<ScenarioId>('hire');
  const selected = scenarios.find((scenario) => scenario.id === selectedId) ?? scenarios[0];
  const result = useMemo(
    () => simulateFinancialDecision(demoModel, selected.change),
    [selected],
  );

  const impact = result.impact.endingCash;
  const endingCash = result.scenario.endingCash;
  const firstNegative = result.scenario.firstMonthCashNegative;

  return (
    <main className="demo-page">
      <header className="demo-header">
        <Link href="/" className="demo-brand"><span>A</span> avenor</Link>
        <div className="demo-header-actions">
          <span className="demo-synthetic-label">Illustrative company · Synthetic data</span>
          <Link href="/login?mode=signup" className="demo-signup-link">Create workspace ↗</Link>
        </div>
      </header>

      <section className="demo-hero">
        <div className="demo-eyebrow">NO ACCOUNT NEEDED · INTERACTIVE FINANCIAL DEMO</div>
        <h1>See the numbers behind<br /><em>the next decision.</em></h1>
        <p>Explore a fictional B2B SaaS company with €650k in opening cash, €120k monthly revenue and a saved 18-month model. Change the decision and see how the forecast moves.</p>
      </section>

      <section className="demo-workspace" aria-label="Interactive financial scenario explorer">
        <div className="demo-company-card">
          <div>
            <span className="demo-kicker">DEMO WORKSPACE</span>
            <h2>Northstar Software</h2>
            <p>French B2B SaaS · Seed stage · EUR</p>
          </div>
          <div className="demo-company-metrics">
            <div><span>Opening cash</span><strong>€650k</strong></div>
            <div><span>Monthly revenue</span><strong>€120k</strong></div>
            <div><span>Payroll</span><strong>€135k</strong></div>
            <div><span>Gross margin</span><strong>78%</strong></div>
          </div>
        </div>

        <div className="demo-scenario-layout">
          <div className="demo-scenario-picker">
            <span className="demo-kicker">CHOOSE A DECISION</span>
            {scenarios.map((scenario) => (
              <button
                type="button"
                key={scenario.id}
                className={selectedId === scenario.id ? 'demo-scenario-option active' : 'demo-scenario-option'}
                onClick={() => setSelectedId(scenario.id)}
                aria-pressed={selectedId === scenario.id}
              >
                <span>{scenario.label}</span><b>→</b>
              </button>
            ))}
            <p className="demo-picker-footnote">Each scenario uses the same saved baseline. Only the selected assumption changes.</p>
          </div>

          <div className="demo-results">
            <div className="demo-result-heading">
              <span className="demo-kicker">AVENOR SCENARIO ANALYSIS</span>
              <h2>{selected.title}</h2>
              <p>{selected.description}</p>
            </div>
            <div className="demo-result-grid">
              <div>
                <span>Impact on month-18 cash</span>
                <strong className={impact >= 0 ? 'positive' : 'negative'}>{impact >= 0 ? '+' : '−'}{eur(Math.abs(impact))}</strong>
                <small>Versus the saved baseline</small>
              </div>
              <div>
                <span>Projected month-18 cash</span>
                <strong className={endingCash >= 0 ? 'positive' : 'negative'}>{eur(endingCash)}</strong>
                <small>After the selected decision</small>
              </div>
              <div>
                <span>First negative cash month</span>
                <strong className={firstNegative === null ? 'positive' : 'negative'}>{firstNegative === null ? 'Not within 18m' : `Month ${firstNegative}`}</strong>
                <small>Based on monthly operating cash flow</small>
              </div>
            </div>
            <div className="demo-recommendation">
              <span>WHAT THE NUMBERS SAY</span>
              <p>{endingCash < 0
                ? 'Under these assumptions, the company ends the forecast below zero. The decision needs to be paired with a credible funding, revenue or cost plan.'
                : impact > 0
                  ? 'This improves the modeled cash position, but the founder should still test execution risk, timing and any costs excluded from the scenario.'
                  : 'This decision reduces the cash buffer. Check the hiring or investment timing against the company’s minimum runway target before committing.'}</p>
            </div>
            <p className="demo-caveat">{selected.caveat}</p>
            <p className="demo-method-note">Deterministic 18-month operating cash model. Excludes tax, VAT timing, debt, working capital, capex, FX and other unentered cash movements.</p>
          </div>
        </div>

        <div className="demo-bottom-cta">
          <div><span className="demo-kicker">READY TO TEST YOUR OWN COMPANY?</span><h2>Bring your numbers. Keep your decisions in context.</h2></div>
          <Link href="/login?mode=signup">Create your Avenor workspace ↗</Link>
        </div>
      </section>
      <footer className="demo-footer">
        Northstar Software is fictional. All figures are synthetic and for product demonstration only; they are not financial advice.
        <Link href="/">Back to Avenor</Link>
      </footer>
    </main>
  );
}
