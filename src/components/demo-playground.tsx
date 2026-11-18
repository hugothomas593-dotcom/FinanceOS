'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ModelInputs } from '@/lib/finance';
import { simulateFinancialDecision, type DecisionChange } from '@/lib/finance-intelligence';

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

const scenarios: Array<{
  id: string;
  label: string;
  question: string;
  title: string;
  description: string;
  change: DecisionChange;
  insight: string;
  caveat: string;
}> = [
  {
    id: 'hire',
    label: 'Hire two engineers',
    question: 'Can we hire two engineers and protect our runway?',
    title: 'The hiring decision',
    description: 'Two engineers at €60k gross annual salary each, with a 35% employer-cost assumption.',
    change: { name: 'Hire two engineers', monthlyPayrollChange: 13_500, horizonMonths: 18 },
    insight: 'The additional payroll accelerates the point at which cash turns negative. Delaying the start date or securing new revenue first would reduce the pressure.',
    caveat: 'Employer costs are a user-supplied assumption, not verified payroll or tax advice. Recruiting, equipment, benefits and any productivity uplift are excluded.',
  },
  {
    id: 'revenue',
    label: 'Revenue falls 20%',
    question: 'What if revenue is 20% lower than planned?',
    title: 'A revenue downside',
    description: 'A sustained 20% reduction in monthly revenue across the full 18-month forecast.',
    change: { name: 'Revenue downside', revenueChangePct: -20, horizonMonths: 18 },
    insight: 'A lasting revenue shortfall has a compounding effect on cash. The first response should be to revisit discretionary spend and update the sales assumptions—not to assume an automatic cost reduction.',
    caveat: 'The 20% reduction is applied from month one and held constant. No management action, cost reduction or change in customer payment timing is assumed.',
  },
  {
    id: 'pricing',
    label: 'Change pricing',
    question: 'Can a 10% price increase offset a 5% drop in customers?',
    title: 'Price versus volume',
    description: 'A 10% price increase combined with a 5% reduction in customer volume. The resulting revenue assumption is +4.5%.',
    change: { name: 'Price and volume sensitivity', revenueChangePct: 4.5, horizonMonths: 18 },
    insight: 'The combined assumption improves revenue in this model, but the result depends on the volume response actually occurring. Test the change with customer cohorts before rolling it out.',
    caveat: 'The 5% volume reduction is an explicit scenario assumption. Avenor does not infer price elasticity or predict how customers will react.',
  },
  {
    id: 'fundraise',
    label: 'Raise €1 million',
    question: 'What changes if we raise €1m at a €6m pre-money valuation?',
    title: 'A funding scenario',
    description: 'A €1m cash inflow in month one, at a €6m pre-money valuation.',
    change: { name: 'Seed extension', oneTimeCashImpact: 1_000_000, oneTimeMonth: 1, horizonMonths: 18 },
    insight: 'The funding inflow moves the modeled cash position above zero at month 18. It buys time; it does not by itself prove that the underlying business model is sustainable.',
    caveat: 'The cash impact is shown before fees. Indicative new-investor ownership is 14.3% on a simple priced-equity basis; SAFEs, convertibles, option-pool changes and preferences are excluded.',
  },
  {
    id: 'collections',
    label: 'Customers pay 30 days later',
    question: 'What if customers start paying us 30 days later?',
    title: 'A cash-collection delay',
    description: 'A 30-day increase in days sales outstanding, using the current monthly revenue run-rate.',
    change: { name: '30-day collection delay', oneTimeCashImpact: -120_000, oneTimeMonth: 1, horizonMonths: 18 },
    insight: 'A slower collection cycle ties up cash even when reported revenue is unchanged. Tighten invoice follow-up and review payment terms before treating this as a permanent change.',
    caveat: 'This is a simplified one-off cash adjustment of one month of current revenue. It is not a full receivables ageing or working-capital schedule.',
  },
  {
    id: 'marketing',
    label: 'Invest in marketing',
    question: 'Can we invest €25k in a campaign and increase revenue?',
    title: 'A marketing investment',
    description: 'A €25k upfront campaign, €2k additional monthly spend and an assumed 5% revenue uplift.',
    change: { name: 'Marketing investment', revenueChangePct: 5, monthlyOpexChange: 2_000, oneTimeCashImpact: -25_000, oneTimeMonth: 1, horizonMonths: 18 },
    insight: 'The investment only helps if the assumed revenue uplift materialises and is retained. Compare the modeled result with actual campaign performance before extending the spend.',
    caveat: 'The 5% uplift is an illustrative assumption, not an observed campaign outcome. Attribution, sales commission, retention and timing effects are excluded.',
  },
];

// Keep server and browser output identical; locale/ICU compact-currency
// formatting can differ across the Node and browser runtimes during hydration.
const compactEur = (value: number) => {
  const absolute = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (absolute >= 1_000_000) return `${sign}€${(absolute / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${sign}€${(absolute / 1_000).toFixed(1)}K`;
  return `${sign}€${Math.round(absolute).toLocaleString('en-GB')}`;
};

function Brand() {
  return (
    <Link className="demo-brand" href="/" aria-label="Avenor home">
      <span>a</span> avenor
    </Link>
  );
}

export function DemoPlayground() {
  const [selectedId, setSelectedId] = useState('hire');
  const selected = scenarios.find((scenario) => scenario.id === selectedId) ?? scenarios[0];
  const result = useMemo(
    () => simulateFinancialDecision(demoModel, selected.change),
    [selected],
  );

  const impact = result.impact.endingCash;
  const endingCash = result.scenario.endingCash;
  const firstNegative = result.scenario.firstMonthCashNegative;
  const maxBar = Math.max(
    Math.abs(result.base.endingCash),
    Math.abs(endingCash),
    1,
  );
  const baseBar = Math.max(3, (Math.abs(result.base.endingCash) / maxBar) * 100);
  const scenarioBar = Math.max(3, (Math.abs(endingCash) / maxBar) * 100);

  return (
    <main className="demo-page">
      <header className="demo-header">
        <Brand />
        <div className="demo-header-actions">
          <span className="demo-synthetic-label">Fictional company · Synthetic data</span>
          <Link className="demo-back-link" href="/">Back to website</Link>
          <Link className="demo-signup-link" href="/login?mode=signup">Create workspace <span>↗</span></Link>
        </div>
      </header>

      <section className="demo-hero">
        <div className="demo-eyebrow"><span className="demo-live-dot" /> INTERACTIVE PRODUCT DEMO · NO SIGN-UP</div>
        <h1>Ask the question.<br /><em>See what it changes.</em></h1>
        <p>Explore six decisions inside a fictional French SaaS company. Each selection reruns the same 18-month cash model, so you can see the trade-off before committing to a real decision.</p>
        <div className="demo-hero-proof">
          <span>01</span> Change a decision <i />
          <span>02</span> Compare the forecast <i />
          <span>03</span> Inspect the assumptions
        </div>
      </section>

      <section className="demo-workspace" aria-label="Interactive financial scenario explorer">
        <div className="demo-company-card">
          <div className="demo-company-intro">
            <span className="demo-kicker">YOUR SAMPLE COMPANY</span>
            <h2>Northstar Software</h2>
            <p>French B2B SaaS · Seed stage · EUR</p>
          </div>
          <div className="demo-company-metrics">
            <div><span>Opening cash</span><strong>€650k</strong></div>
            <div><span>Monthly revenue</span><strong>€120k</strong></div>
            <div><span>Monthly payroll</span><strong>€135k</strong></div>
            <div><span>Gross margin</span><strong>78%</strong></div>
          </div>
        </div>

        <div className="demo-scenario-layout">
          <aside className="demo-scenario-picker">
            <div className="demo-picker-heading">
              <span className="demo-kicker">ASK A FOUNDER QUESTION</span>
              <span>6 examples</span>
            </div>
            {scenarios.map((scenario, index) => (
              <button
                type="button"
                key={scenario.id}
                className={selectedId === scenario.id ? 'demo-scenario-option active' : 'demo-scenario-option'}
                onClick={() => setSelectedId(scenario.id)}
                aria-pressed={selectedId === scenario.id}
              >
                <span className="demo-scenario-number">0{index + 1}</span>
                <span className="demo-scenario-label">{scenario.label}</span>
                <b>↗</b>
              </button>
            ))}
            <p className="demo-picker-footnote">Select a question to update the financial analysis on the right. No data is saved or sent.</p>
          </aside>

          <div className="demo-results">
            <div className="demo-result-heading">
              <span className="demo-kicker">FOUNDER QUESTION</span>
              <h2>“{selected.question}”</h2>
              <p>{selected.description}</p>
            </div>

            <div className="demo-result-banner">
              <div className="demo-answer-avatar">a</div>
              <div>
                <span>AVENOR · ILLUSTRATIVE SCENARIO OUTPUT</span>
                <p>{selected.insight}</p>
              </div>
            </div>

            <div className="demo-result-grid">
              <div>
                <span>Cash after 18 months</span>
                <strong className={endingCash >= 0 ? 'positive' : 'negative'}>{compactEur(endingCash)}</strong>
                <small>After this decision</small>
              </div>
              <div>
                <span>Change vs. base plan</span>
                <strong className={impact >= 0 ? 'positive' : 'negative'}>{impact >= 0 ? '+' : '−'}{compactEur(Math.abs(impact))}</strong>
                <small>18-month closing-cash impact</small>
              </div>
              <div>
                <span>First negative cash month</span>
                <strong className={firstNegative === null ? 'positive' : 'negative'}>{firstNegative === null ? 'Not in 18m' : `Month ${firstNegative}`}</strong>
                <small>Under the selected assumptions</small>
              </div>
            </div>

            <div className="demo-comparison">
              <div className="demo-comparison-title">
                <span>BASE PLAN VS. YOUR DECISION</span>
                <span>18-month closing cash</span>
              </div>
              <div className="demo-comparison-row">
                <span>Base plan</span>
                <div className="demo-comparison-track"><i style={{ width: `${baseBar}%` }} /></div>
                <b className={result.base.endingCash >= 0 ? 'positive' : 'negative'}>{compactEur(result.base.endingCash)}</b>
              </div>
              <div className="demo-comparison-row">
                <span>With decision</span>
                <div className="demo-comparison-track"><i className="selected" style={{ width: `${scenarioBar}%` }} /></div>
                <b className={endingCash >= 0 ? 'positive' : 'negative'}>{compactEur(endingCash)}</b>
              </div>
            </div>

            <div className="demo-assumptions">
              <div className="demo-assumptions-title"><span>WHAT IS INCLUDED</span><span>Model assumptions</span></div>
              <div className="demo-assumption-pills">
                <span>18-month horizon</span>
                <span>2% monthly revenue growth</span>
                <span>1.5% monthly OPEX growth</span>
                <span>22% cost of sales</span>
                <span>EUR cash model</span>
              </div>
            </div>

            <p className="demo-caveat">{selected.caveat}</p>
            <p className="demo-method-note">Deterministic operating cash model. Excludes tax, VAT timing, debt schedules, working capital (except the selected collection-delay illustration), capex, FX and other unentered cash movements. This page uses synthetic figures and is not a live AI conversation or financial advice.</p>
          </div>
        </div>

        <section className="demo-capabilities">
          <div>
            <span className="demo-kicker">A REAL AVENOR WORKSPACE GOES FURTHER</span>
            <h2>From an example to <em>your company.</em></h2>
            <p>Connect the decisions to your own saved assumptions, imported transactions and monthly business metrics. The live Copilot is designed to use this context rather than a generic sample company.</p>
          </div>
          <div className="demo-capability-list">
            <div><span>01</span><b>Your financial model</b><small>18-month cash forecast and runway</small></div>
            <div><span>02</span><b>Your actuals</b><small>CSV transactions and cash movements</small></div>
            <div><span>03</span><b>Your operating metrics</b><small>MRR, CAC, churn and gross margin</small></div>
            <div><span>04</span><b>Your decisions</b><small>Saved scenarios and conversation history</small></div>
          </div>
        </section>

        <div className="demo-bottom-cta">
          <div>
            <span className="demo-kicker">READY TO TRY IT WITH YOUR NUMBERS?</span>
            <h2>Move from a sample company to your own workspace.</h2>
            <p>Start with a 30-day free trial, then €59/month. Card required; cancel anytime.</p>
          </div>
          <Link href="/login?mode=signup">Create your Avenor workspace <span>↗</span></Link>
        </div>
      </section>

      <footer className="demo-footer">
        <span>Northstar Software is fictional. All figures are synthetic and for product demonstration only.</span>
        <Link href="/">Back to Avenor</Link>
      </footer>
    </main>
  );
}
