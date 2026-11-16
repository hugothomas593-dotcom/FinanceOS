import Link from 'next/link';

const jobs = [
  {
    number: '01',
    title: 'Can we afford it?',
    copy: 'Test a hire, a new expense, a marketing push or an investment against cash and runway before you commit.',
    examples: ['Hiring plans', 'Spending decisions', 'Pricing changes'],
  },
  {
    number: '02',
    title: 'What is changing?',
    copy: 'Bring in transaction history and monthly operating metrics. Understand cash movements, cost patterns and unit economics.',
    examples: ['CSV actuals analysis', 'MRR, CAC and churn', 'Break-even'],
  },
  {
    number: '03',
    title: 'What should we do next?',
    copy: 'Compare options, understand the assumptions behind each outcome and keep a record of the decisions you make.',
    examples: ['Base vs. downside', 'Fundraising scenarios', 'Decision history'],
  },
];

const included = [
  'AI Copilot grounded in your company model and persistent business context',
  '18-month cash forecast with founder-configured runway alerts',
  'CFO Brief with proactive cash, churn and CAC watchpoints',
  'Hiring, spending, pricing and fundraising scenarios',
  'Persistent conversations and a traceable Decision Ledger',
  'CSV transaction analysis and monthly business metrics',
  'Break-even, working-capital and SaaS unit-economics analysis',
];

function Brand() {
  return (
    <Link className="a-brand" href="/" aria-label="Avenor home">
      <span className="a-brand-mark">a</span>
      <span>avenor</span>
    </Link>
  );
}

function CopilotPreview() {
  return (
    <div className="a-preview-shell">
      <div className="a-preview-window">
        <div className="a-preview-header">
          <div className="a-preview-brand">
            <span className="a-preview-mark">a</span>
            <span><b>Avenor Intelligence</b><small>Your AI finance partner</small></span>
          </div>
          <span className="a-preview-tag">ILLUSTRATIVE PREVIEW</span>
        </div>

        <div className="a-preview-context">
          <span className="a-context-dot" />
          <span>Northstar Studio</span>
          <i />
          <span>EUR workspace</span>
          <span className="a-context-lock">Private workspace</span>
        </div>

        <div className="a-preview-body">
          <div className="a-preview-question">
            <span>YOUR QUESTION</span>
            <p>Can we hire two engineers in January and still keep 12 months of runway?</p>
          </div>

          <div className="a-preview-answer">
            <div className="a-preview-answer-head">
              <div><span className="a-answer-mark">a</span><b>Decision brief</b></div>
              <span>EXAMPLE ANALYSIS</span>
            </div>
            <h3>Compare the decision before you make it.</h3>
            <p>Avenor models the proposed hires against your saved financial plan, shows what changes and makes the assumptions visible.</p>

            <div className="a-preview-metrics">
              <div><small>Monthly loaded cost</small><b>€14,800</b></div>
              <div><small>Cash at month 18</small><b>€312,000</b></div>
              <div><small>Runway vs. target</small><b>11.8 months</b></div>
            </div>
            <div className="a-preview-comparison">
              <div><span>Base plan</span><b>12.9 months</b><i className="a-bar a-bar-base" /></div>
              <div><span>Hire in January</span><b>11.8 months</b><i className="a-bar a-bar-hire" /></div>
              <div><span>Hire in April</span><b>12.5 months</b><i className="a-bar a-bar-later" /></div>
            </div>
            <div className="a-preview-foot">
              <span>✓ Deterministic calculations</span>
              <span>Assumptions shown</span>
            </div>
          </div>
        </div>
        <div className="a-preview-composer">
          <span>Ask about a decision, a number or a risk…</span>
          <i>↑</i>
        </div>
      </div>
      <div className="a-preview-note"><span>01</span> Example figures shown for illustration only.</div>
    </div>
  );
}

export default function MarketingHome() {
  return (
    <main className="a-marketing">
      <header className="a-header">
        <div className="a-header-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <a href="#copilot">The Copilot</a>
            <a href="#what-it-does">What it does</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="a-header-actions">
            <Link className="a-login" href="/demo">Try demo</Link>
            <Link className="a-login" href="/login">Sign in</Link>
            <Link className="a-button a-button-dark a-header-cta" href="/login?mode=signup">Get started <span>↗</span></Link>
          </div>
        </div>
      </header>

      <section className="a-hero">
        <div className="a-hero-glow" />
        <div className="a-hero-inner">
          <div className="a-hero-copy">
            <div className="a-eyebrow"><span /> FINANCE OPERATING PARTNER FOR FOUNDERS</div>
            <h1>Your AI finance partner.<br /><em>Not another dashboard.</em></h1>
            <p className="a-hero-lede">Ask what you can afford, understand what is putting pressure on cash, and see what changes when you take a different route. Avenor turns your company numbers into decisions you can explain.</p>
            <div className="a-hero-actions">
              <Link className="a-button a-button-dark" href="/login?mode=signup">Meet your Copilot <span>↗</span></Link>
              <Link className="a-text-link" href="/demo">Try an interactive demo <span>↗</span></Link>
            </div>
            <div className="a-hero-proof">
              <span>01</span><b>Calculations, not guesses</b>
              <i />
              <span>02</span><b>Your data stays in context</b>
            </div>
          </div>
          <CopilotPreview />
        </div>
        <div className="a-hero-bottom">
          <span>BUILT FOR PRE-SEED AND SEED FOUNDERS</span>
          <span>ASK → ANALYSE → DECIDE</span>
        </div>
      </section>

      <section className="a-intro" id="copilot">
        <div className="a-section-label">THE PRODUCT IS THE COPILOT</div>
        <div className="a-intro-grid">
          <h2>Start with a question.<br /><em>Leave with a decision.</em></h2>
          <div>
            <p>Avenor is built around a finance Copilot that understands your saved model, imported actuals and operating metrics. It uses dedicated financial calculations to test the decision—not just generate a convincing-sounding answer.</p>
            <p>Ask in plain language. See the numbers, the assumptions and the trade-offs. Keep the result in your decision history.</p>
          </div>
        </div>
      </section>

      <section className="a-jobs" id="what-it-does">
        <div className="a-section-heading">
          <div><div className="a-section-label">THREE JOBS. ONE FINANCIAL WORKSPACE.</div><h2>Make the next move<br /><em>with the numbers behind it.</em></h2></div>
          <p>Not a collection of disconnected finance tools. One place to understand your position and work through the decisions that matter.</p>
        </div>
        <div className="a-job-grid">
          {jobs.map((job) => (
            <article className="a-job-card" key={job.number}>
              <div className="a-job-top"><span>{job.number}</span><i>↗</i></div>
              <h3>{job.title}</h3>
              <p>{job.copy}</p>
              <div className="a-job-examples">
                {job.examples.map((example) => <span key={example}>{example}</span>)}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="a-method">
        <div className="a-method-inner">
          <div className="a-method-copy">
            <div className="a-section-label">WHY AVENOR IS DIFFERENT</div>
            <h2>AI that reasons<br />with <em>your numbers.</em></h2>
            <p>A generic AI assistant does not know whether your company can afford a hire. Avenor works from your saved financial assumptions and imported data, then uses a deterministic engine for the calculations.</p>
          </div>
          <div className="a-method-points">
            <div><span>01</span><section><b>Your company is the context</b><p>One workspace for your model, actuals, business metrics and decision history.</p></section></div>
            <div><span>02</span><section><b>Financial maths is handled separately</b><p>The AI explains and challenges. The financial engine calculates the scenarios.</p></section></div>
            <div><span>03</span><section><b>Unknowns stay visible</b><p>Missing data and user-supplied assumptions are called out instead of silently invented.</p></section></div>
            <div><span>04</span><section><b>Decisions stay traceable</b><p>Save the analysis and return to the assumptions behind it when the business changes.</p></section></div>
          </div>
        </div>
      </section>

      <section className="a-pricing" id="pricing">
        <div className="a-pricing-inner">
          <div className="a-pricing-copy">
            <div className="a-section-label">ONE PLAN. EVERYTHING IN ONE PLACE.</div>
            <h2>Know your numbers.<br /><em>Move with confidence.</em></h2>
            <p>Avenor is for founders who want a finance partner beside them—not another tool they have to learn to operate.</p>
            <div className="a-pricing-assurance"><span>✓</span> One subscription. No feature tiers.</div>
          </div>
          <div className="a-price-card">
            <div className="a-price-top"><span>AVENOR FOUNDER</span><span className="a-price-dot">●</span></div>
            <div className="a-price"><strong>€59</strong><span>/ month</span></div>
            <p className="a-price-description">Everything you need to understand the business and work through your next decision.</p>
            <div className="a-price-rule" />
            <ul>
              {included.map((item) => <li key={item}><span>✓</span>{item}</li>)}
            </ul>
            <Link className="a-button a-button-dark a-price-cta" href="/login?mode=signup">Get started with Avenor <span>↗</span></Link>
            <small>One plan. €59 per month.</small>
          </div>
        </div>
      </section>

      <section className="a-final-cta">
        <div className="a-section-label">YOUR FINANCE PARTNER STARTS HERE</div>
        <h2>Make the next decision<br /><em>with more clarity.</em></h2>
        <p>Start with the numbers you have. Add more context as your company grows.</p>
        <Link className="a-button a-button-light" href="/login?mode=signup">Create your workspace <span>↗</span></Link>
      </section>

      <footer className="a-footer">
        <Brand />
        <span>Financial decision intelligence for founders.</span>
        <div><a href="#copilot">The Copilot</a><a href="#what-it-does">What it does</a><a href="#pricing">Pricing</a><Link href="/demo">Try demo</Link><Link href="/login">Sign in</Link></div>
        <small>© {new Date().getFullYear()} Avenor · Forecasts depend on supplied assumptions and are not professional financial advice.</small>
      </footer>
    </main>
  );
}
