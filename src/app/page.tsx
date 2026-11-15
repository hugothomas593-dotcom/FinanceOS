import Link from 'next/link';

const features = [
  { number: '01', title: 'Protect your runway', copy: 'See how a change in spending, revenue or hiring affects the cash you have left — before you commit.' },
  { number: '02', title: 'Make the next hire with confidence', copy: 'Translate salary, employer costs and start dates into a clear view of the financial impact.' },
  { number: '03', title: 'Understand the levers', copy: 'Explore break-even, pricing, customer economics and fundraising scenarios in one place.' },
];

function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link className={`marketing-brand ${inverse ? 'marketing-brand-inverse' : ''}`} href="/" aria-label="Avenor home">
    <span className="marketing-mark">a</span><span>avenor</span>
  </Link>;
}

function DashboardPreview() {
  return <div className="marketing-preview-wrap" aria-label="Illustrative Avenor workspace preview">
    <div className="marketing-preview-glow" />
    <div className="marketing-preview">
      <div className="preview-sidebar">
        <div className="preview-logo"><span>a</span> avenor</div>
        <div className="preview-company"><i>n</i><span><b>Northstar Studio</b><small>Financial workspace</small></span></div>
        <small className="preview-nav-label">WORKSPACE</small>
        <div className="preview-nav-item preview-active"><i>◫</i> Overview</div>
        <div className="preview-nav-item"><i>↗</i> Decision simulator</div>
        <div className="preview-nav-item"><i>▤</i> Decision ledger</div>
        <div className="preview-nav-item"><i>◷</i> Business metrics</div>
        <div className="preview-nav-item"><i>⇧</i> Data import</div>
      </div>
      <div className="preview-main">
        <div className="preview-topbar"><span>Northstar Studio&nbsp; / &nbsp;Overview</span><span className="preview-status"><i /> MODEL PREVIEW</span></div>
        <div className="preview-content">
          <div className="preview-eyebrow">YOUR FINANCIAL POSITION</div>
          <div className="preview-title-row"><h3>Overview</h3><span>Illustrative data</span></div>
          <div className="preview-metrics">
            <div><small>Cash available</small><b>€486,000</b><span>Starting cash</span></div>
            <div><small>Monthly revenue</small><b>€72,400</b><span>Current month</span></div>
            <div><small>Cash runway</small><b>14.2 mo</b><span>At current spend</span></div>
          </div>
          <div className="preview-decision">
            <div><small>THE NEXT DECISION</small><b>Can we afford to hire two people?</b><span>Compare the impact on cash and runway before you commit.</span></div>
            <span className="preview-arrow">↗</span>
          </div>
          <div className="preview-chart-card">
            <div className="preview-chart-head"><span><b>Cash forecast</b><small>18-month outlook · illustrative</small></span><span className="preview-legend"><i /> Base case</span></div>
            <svg viewBox="0 0 620 150" role="img" aria-label="Illustrative cash forecast line chart">
              <defs><linearGradient id="previewFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#91ad9a" stopOpacity=".26"/><stop offset="100%" stopColor="#91ad9a" stopOpacity="0"/></linearGradient></defs>
              {[30,66,102,138].map(y => <line key={y} x1="14" x2="606" y1={y} y2={y} stroke="#edf0ec" strokeDasharray="3 5" />)}
              <path d="M14 43 C65 45 82 49 116 55 S178 61 214 69 S282 77 316 82 S385 92 416 98 S480 108 514 115 S570 126 606 132 L606 145 L14 145 Z" fill="url(#previewFill)" />
              <path d="M14 43 C65 45 82 49 116 55 S178 61 214 69 S282 77 316 82 S385 92 416 98 S480 108 514 115 S570 126 606 132" fill="none" stroke="#47785d" strokeWidth="3" strokeLinecap="round" />
              <circle cx="606" cy="132" r="4" fill="#47785d" />
            </svg>
            <div className="preview-chart-axis"><span>NOW</span><span>MONTH 6</span><span>MONTH 12</span><span>MONTH 18</span></div>
          </div>
        </div>
      </div>
    </div>
    <div className="preview-note"><span>↗</span> A clearer view of what your next decision means.</div>
  </div>;
}

export default function MarketingHome() {
  return <main className="marketing">
    <header className="marketing-header">
      <div className="marketing-header-inner">
        <Brand />
        <nav className="marketing-nav" aria-label="Main navigation">
          <a href="#why-avenor">Why Avenor</a><a href="#product">Product</a><a href="#how-it-works">How it works</a>
        </nav>
        <div className="marketing-header-actions">
          <Link className="marketing-login" href="/login">Sign in</Link>
          <Link className="marketing-nav-cta" href="/login?mode=signup">Get started <span>↗</span></Link>
        </div>
      </div>
    </header>

    <section className="marketing-hero">
      <div className="marketing-hero-inner">
        <div className="marketing-copy">
          <div className="marketing-eyebrow"><span /> FINANCIAL CLARITY FOR FOUNDERS</div>
          <h1>Make your next move<br />with <em>confidence.</em></h1>
          <p className="marketing-lede">Avenor turns your company numbers into a clear view of what you can afford, what changes your runway, and what to do next.</p>
          <div className="marketing-hero-actions">
            <Link className="marketing-primary" href="/login?mode=signup">Build your financial picture <span>↗</span></Link>
            <a className="marketing-secondary" href="#product">Explore the platform <span>↓</span></a>
          </div>
          <div className="marketing-proof"><span className="proof-check">✓</span> Built around decisions, not just dashboards <i /> <span>Deterministic financial calculations</span></div>
        </div>
        <DashboardPreview />
      </div>
      <div className="marketing-hero-foot"><span>01 — A BETTER WAY TO RUN THE NUMBERS</span><span>FOR PRE-SEED & SEED TEAMS</span></div>
    </section>

    <section className="marketing-statement" id="why-avenor">
      <div className="marketing-section-label">THE FOUNDER'S FINANCE PROBLEM</div>
      <div className="marketing-statement-grid">
        <h2>Knowing your numbers<br />is only <em>the beginning.</em></h2>
        <div><p>Founders rarely need another chart. They need to make a call: hire now or later, invest in growth or preserve cash, raise capital or extend the runway.</p><p>Avenor connects the numbers to those decisions, so the consequences are easier to see before you act.</p></div>
      </div>
    </section>

    <section className="marketing-product" id="product">
      <div className="marketing-section-top">
        <div><div className="marketing-section-label">A FINANCIAL WORKSPACE THAT THINKS AHEAD</div><h2>From financial data<br />to your <em>next decision.</em></h2></div>
        <p>One place to understand your position, model the options in front of you and keep track of the choices you make.</p>
      </div>
      <div className="marketing-feature-grid">
        {features.map(feature => <article className="marketing-feature" key={feature.number}>
          <div className="marketing-feature-number">{feature.number}</div>
          <div className="marketing-feature-icon">{feature.number === '01' ? '◷' : feature.number === '02' ? '＋' : '↗'}</div>
          <h3>{feature.title}</h3><p>{feature.copy}</p><span className="marketing-feature-rule" />
        </article>)}
      </div>
    </section>

    <section className="marketing-how" id="how-it-works">
      <div className="marketing-how-inner">
        <div className="marketing-how-copy"><div className="marketing-section-label">A MORE USEFUL FINANCE ROUTINE</div><h2>Clarity first.<br /><em>Decisions second.</em></h2><p>Bring together the information you have, make your assumptions explicit, then test the choices that matter.</p></div>
        <div className="marketing-steps">
          <div><span>01</span><section><b>Connect your financial picture</b><p>Set your starting cash, revenue, team costs and operating assumptions. Import transaction history when you're ready.</p></section></div>
          <div><span>02</span><section><b>Explore the consequences</b><p>Model hiring, spending, pricing and fundraising scenarios with consistent financial calculations.</p></section></div>
          <div><span>03</span><section><b>Keep decisions accountable</b><p>Save scenarios in your Decision Ledger and revisit the assumptions as the business changes.</p></section></div>
        </div>
      </div>
    </section>

    <section className="marketing-principle">
      <div className="marketing-principle-mark">a</div>
      <div className="marketing-principle-content"><div className="marketing-section-label">BUILT ON A CLEAR PRINCIPLE</div><h2>Numbers should be<br /><em>earned, not invented.</em></h2><p>Financial calculations are handled by a deterministic engine. Avenor Intelligence helps explain the results and the information behind them — with missing inputs called out rather than quietly filled in.</p></div>
      <div className="marketing-principle-side"><span>01</span><b>Transparent assumptions</b><i /><span>02</span><b>Traceable calculations</b><i /><span>03</span><b>AI as an explanation layer</b></div>
    </section>

    <section className="marketing-cta">
      <div className="marketing-section-label">MAKE THE NEXT DECISION A BETTER ONE</div>
      <h2>Build a clearer picture<br />of <em>what comes next.</em></h2>
      <p>Start with the numbers you have. Make the next decision with more context.</p>
      <Link className="marketing-primary" href="/login?mode=signup">Get started with Avenor <span>↗</span></Link>
    </section>

    <footer className="marketing-footer"><Brand inverse /><span>Financial decision intelligence for founders.</span><div><Link href="/login">Sign in</Link><a href="#product">Product</a><a href="#how-it-works">How it works</a></div><small>© {new Date().getFullYear()} Avenor</small></footer>
  </main>;
}
