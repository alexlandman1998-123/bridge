import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Armchair, ArrowRight, BriefcaseBusiness, CalendarCheck, Check, ChevronUp, Clock3, HeartHandshake, Home, MapPin, PiggyBank, ShieldCheck, ShieldPlus, TrendingUp, WalletCards } from 'lucide-react'
import { demoInsuranceBrandStyle } from './demoInsuranceTheme'
import { DEMO_INSURANCE_NOTICE, DEMO_INSURANCE_PROMOTION, DEMO_BOND_LIFE_INTRODUCTION, DEMO_BOND_LIFE_PRODUCTS, DEMO_BOND_REPAYMENT, DEMO_INSURANCE_CATEGORIES } from './demoInsuranceData'
import './demo-insurance.css'

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

export function DemoInsurancePromotion({ theme, content = DEMO_INSURANCE_PROMOTION, onExplore, to, showAction = true, showCoverLabels = true, propertyAddress = '' }) {
  const actionContent = <>{content.actionLabel}<ArrowRight size={17} aria-hidden="true" /></>
  return <section className="demo-insurance demo-insurance-promotion" style={demoInsuranceBrandStyle(theme)} data-insurance-source="demo">
    <div className="demo-insurance-promotion-layout">
      <div className="demo-insurance-promotion-copy">
        <span className="demo-insurance-eyebrow"><Home size={16} aria-hidden="true" />{content.eyebrow}</span>
        <h2>{content.title}</h2>
        <p>{content.description}</p>
        {showAction ? (to ? <Link to={to} className="demo-insurance-button demo-insurance-button-inverse">{actionContent}</Link> : (
          <button type="button" className="demo-insurance-button demo-insurance-button-inverse" disabled={!onExplore} onClick={onExplore}>{actionContent}</button>
        )) : null}
        {propertyAddress ? <p className="demo-insurance-promotion-property"><MapPin size={16} aria-hidden="true" />{propertyAddress}</p> : null}
        {showCoverLabels ? <div className="demo-insurance-promotion-cover"><span><Home size={15} aria-hidden="true" />Building cover</span><span><Armchair size={15} aria-hidden="true" />Household contents</span></div> : null}
      </div>
      <div className="demo-insurance-promotion-art" aria-hidden="true">
        <div className="demo-insurance-promotion-orbit" />
        <svg viewBox="0 0 260 240" fill="none" focusable="false">
          <path d="M36 114 130 38l94 76" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M56 99v105h148V99" fill="currentColor" fillOpacity=".07" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M85 204v-63h38v63M157 134h25v31h-25zM169.5 134v31M157 149.5h25M172 72V46h20v43" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M27 205h205" stroke="currentColor" strokeOpacity=".4" strokeWidth="2" strokeLinecap="round" />
          <circle cx="203" cy="187" r="33" fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeOpacity=".35" />
          <path d="m203 168 15 6v12c0 9-6 16-15 20-9-4-15-11-15-20v-12l15-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="m196 185 5 5 9-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  </section>
}

const bondFeatureIcons = { life: HeartHandshake, retrenchment: BriefcaseBusiness, contribution: TrendingUp, premium: WalletCards, home: Home }

export function DemoBondFeatureIcon({ kind = 'life' }) {
  const Icon = bondFeatureIcons[kind] || ShieldCheck
  return <span className={`demo-insurance-feature-icon demo-insurance-feature-icon-${kind}`}><Icon size={25} strokeWidth={1.6} aria-hidden="true" /></span>
}

export function DemoBondLifeProducts({ theme, products = DEMO_BOND_LIFE_PRODUCTS, selectedProductId = '', onSelectProduct, children }) {
  const detailId = useId()
  const selected = products.find(product => product.id === selectedProductId)
  return <section className="demo-insurance demo-insurance-bond-workspace" style={demoInsuranceBrandStyle(theme)} data-insurance-source="demo">
    <DemoInsurancePromotion theme={theme} content={DEMO_BOND_LIFE_INTRODUCTION} showAction={false} showCoverLabels={false} />
    <div className="demo-insurance-product-grid">
      {products.map(product => <article key={product.id} className={`demo-insurance-product ${product.id === 'bond-life-plus' ? 'demo-insurance-product-plus' : ''}`} data-selected={selectedProductId === product.id}>
        <div className="demo-insurance-product-brand"><span className="demo-insurance-eyebrow">{product.provider}</span><span className="demo-insurance-product-mark">{product.id === 'bond-life-plus' ? <ShieldPlus size={28} strokeWidth={1.5} aria-hidden="true" /> : <HeartHandshake size={28} strokeWidth={1.5} aria-hidden="true" />}</span></div>
        <h3>{product.name}</h3><p>{product.description}</p>
        <ul className="demo-insurance-benefits">{product.benefits.map((benefit, index) => <li key={benefit}><DemoBondFeatureIcon kind={(product.id === 'bond-life-plus' ? ['life', 'retrenchment', 'contribution'] : ['life', 'home'])[index]} /><span>{benefit}</span></li>)}</ul>
        <div className="demo-insurance-product-footer"><p className="demo-insurance-price">{money.format(product.monthlyPremium)}<span>/ month</span></p>
          <button type="button" className={`demo-insurance-button ${product.id === 'bond-life-plus' ? 'demo-insurance-button-inverse' : ''}`} disabled={!onSelectProduct} aria-expanded={selectedProductId === product.id} aria-controls={detailId} onClick={() => onSelectProduct?.(selectedProductId === product.id ? '' : product.id)}>{product.actionLabel}{selectedProductId === product.id ? <ChevronUp size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}</button>
        </div>
      </article>)}
    </div>
    <div id={detailId} hidden={!selected || !children} className="demo-insurance-expanded" role="region" aria-label={selected ? `${selected.name} details` : 'Bond life details'}>{selected && children}</div>
  </section>
}

// Presentation only: the demo section supplies the fixed-rate estimate.
export function DemoBondRepaymentIllustration({ theme, extraContribution = DEMO_BOND_REPAYMENT.initialContribution, monthlyPremium = DEMO_BOND_LIFE_PRODUCTS[1].monthlyPremium, onContributionChange, estimate = null }) {
  const sliderId = useId()
  const helperId = useId()
  const sliderFill = Math.max(0, Math.min(100, (extraContribution - DEMO_BOND_REPAYMENT.minimumContribution) / (DEMO_BOND_REPAYMENT.maximumContribution - DEMO_BOND_REPAYMENT.minimumContribution) * 100))
  return <section className="demo-insurance demo-insurance-calculator" style={demoInsuranceBrandStyle(theme)} data-insurance-source="demo">
    <div className="demo-insurance-calculator-heading"><p className="demo-insurance-eyebrow">Make a little extra go further</p><h3>What could a little extra each month change?</h3></div>
    {estimate ? <div className="demo-insurance-bond-assumptions"><dl><div><dt>Sample bond</dt><dd>{estimate.loanAmountLabel}</dd></div><div><dt>Interest per year</dt><dd>{estimate.annualInterestRateLabel}</dd></div><div><dt>Original term</dt><dd>{estimate.originalTermLabel}</dd></div><div><dt>Normal bond repayment</dt><dd>{estimate.monthlyRepaymentLabel}<span> / month</span></dd></div></dl></div> : null}
    <div className="demo-insurance-calculator-grid"><div className="demo-insurance-calculator-controls">
      <div className="demo-insurance-contribution-card">
        <div className="demo-insurance-slider-heading"><label htmlFor={sliderId}>Extra towards your bond each month</label><output htmlFor={sliderId}>{money.format(extraContribution)}<span>/ month</span></output></div>
        <input id={sliderId} className="demo-insurance-contribution-slider" style={{ '--slider-fill': `${sliderFill}%` }} type="range" min={DEMO_BOND_REPAYMENT.minimumContribution} max={DEMO_BOND_REPAYMENT.maximumContribution} step={DEMO_BOND_REPAYMENT.contributionStep} value={extraContribution} disabled={!onContributionChange} onChange={event => onContributionChange?.(Number(event.target.value))} aria-valuetext={`${money.format(extraContribution)} extra per month`} aria-describedby={helperId} />
        <div className="demo-insurance-slider-limits" aria-hidden="true"><span>{money.format(DEMO_BOND_REPAYMENT.minimumContribution)}</span><span>{money.format(DEMO_BOND_REPAYMENT.maximumContribution)}</span></div>
        <div className="demo-insurance-contribution-presets" role="group" aria-label="Quick extra contribution amounts">{[500, 1000, 2000].map(amount => <button key={amount} type="button" aria-pressed={extraContribution === amount} disabled={!onContributionChange} onClick={() => onContributionChange?.(amount)}>{money.format(amount)}</button>)}</div>
        <p className="demo-insurance-contribution-caption">Slide to find an amount that feels comfortable.</p>
      </div>
      <div className="demo-insurance-payment-card"><p className="demo-insurance-eyebrow">Your extra monthly budget</p><dl className="demo-insurance-payment-breakdown"><div><dt>Sample insurance premium</dt><dd>{money.format(monthlyPremium)}<span>/ month</span></dd></div><div><dt>Extra bond contribution</dt><dd>{money.format(extraContribution)}<span>/ month</span></dd></div><div><dt>Total additional monthly cost</dt><dd>{money.format(monthlyPremium + extraContribution)}<span>/ month</span></dd></div></dl><p className="demo-insurance-payment-caption">Your premium pays for cover. Your extra contribution goes into the bond.</p></div>
    </div>
    {estimate ? <dl className="demo-insurance-estimates" aria-live="polite" aria-atomic="true">
      {[['Estimated payoff time', estimate.repaymentPeriodLabel, CalendarCheck], ['Time saved', estimate.timeSavedLabel, Clock3], ['Interest saved', estimate.interestSavedLabel, PiggyBank]].map(([label, value, icon]) => {
        const Icon = icon
        return <div key={label}><dt><Icon size={20} strokeWidth={1.5} aria-hidden="true" />{label}</dt><dd>{value}</dd></div>
      })}
    </dl> : null}
    </div>
    <p id={helperId} className="demo-insurance-footnote">{DEMO_BOND_REPAYMENT.assumption}</p>
  </section>
}

export function DemoInsuranceQuoteCard({ theme, quote, onViewQuote }) {
  const categoryLabel = DEMO_INSURANCE_CATEGORIES.find(item => item.id === quote.category)?.label.toLowerCase() || quote.category
  return <article className="demo-insurance demo-insurance-quote" style={demoInsuranceBrandStyle(theme)} data-insurance-source="demo">
    <DemoInsurerLogo quote={quote} />
    <p className="demo-insurance-quote-category">{categoryLabel} cover</p>
    <h3 className="demo-insurance-price">{money.format(quote.monthlyPremium)}<span>/ month</span></h3>
    <QuoteCoverage quote={quote} />
    <button type="button" className="demo-insurance-button" disabled={!onViewQuote} onClick={() => onViewQuote?.(quote)} aria-label={`View ${quote.insurer} ${categoryLabel} demo quote`}>View quote<ArrowRight size={16} aria-hidden="true" /></button>
    <span className="demo-insurance-notice demo-insurance-quote-notice">{DEMO_INSURANCE_NOTICE}</span>
  </article>
}

function DemoInsurerLogo({ quote }) {
  const [failed, setFailed] = useState(false)
  return <div className="demo-insurance-insurer-logo">
    {quote.logo && !failed ? <><img src={quote.logo} alt={`${quote.insurer} logo`} onError={() => setFailed(true)} />{quote.insurerId === 'old-mutual' ? <small>Insure</small> : null}</> : <span>{quote.insurer}</span>}
  </div>
}

function QuoteCoverage({ quote }) {
  return <>
    <dl className="demo-insurance-coverage">{quote.coverage.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{money.format(item.amount)}</dd></div>)}<div><dt>Sample excess</dt><dd>{money.format(quote.excess)}</dd></div></dl>
    <ul className="demo-insurance-benefits">{quote.benefits.map(benefit => <li key={benefit}><Check size={15} aria-hidden="true" />{benefit}</li>)}</ul>
  </>
}

export function DemoInsuranceQuoteDetails({ theme, quote }) {
  return <div className="demo-insurance demo-insurance-quote-details" style={demoInsuranceBrandStyle(theme)} data-insurance-source="demo">
    <div className="demo-insurance-quote-detail-brand"><DemoInsurerLogo quote={quote} /><span><ShieldCheck size={14} aria-hidden="true" />Home cover</span></div>
    <div className="demo-insurance-quote-premium">
      <div><p className="demo-insurance-eyebrow">Your sample monthly premium</p><p className="demo-insurance-price">{money.format(quote.monthlyPremium)}<span>/ month</span></p></div>
      <ShieldCheck size={62} strokeWidth={1} aria-hidden="true" />
    </div>
    <section className="demo-insurance-quote-detail-section"><h4>Your cover at a glance</h4>
      <dl className="demo-insurance-detail-coverage">{quote.coverage.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{money.format(item.amount)}</dd></div>)}<div><dt>Sample excess</dt><dd>{money.format(quote.excess)}</dd></div></dl>
    </section>
    <section className="demo-insurance-quote-inclusions"><h4>What’s included</h4><ul className="demo-insurance-benefits">{quote.benefits.map(benefit => <li key={benefit}><Check size={16} aria-hidden="true" />{benefit}</li>)}</ul></section>
    <section className="demo-insurance-quote-detail-section"><h4>Worth knowing</h4><p>{quote.detail}</p></section>
    <p className="demo-insurance-footnote demo-insurance-quote-detail-notice">Illustrative demo quote. No cover is purchased through this demo.</p>
  </div>
}
