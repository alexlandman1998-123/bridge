import { ArrowRight, Check, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { trackHomeSeekersEvent } from './homeSeekersWebsiteData'
import { recruitmentPricing, recruitmentExample, submitRecruitmentApplication, trackRecruitmentConversion, campaignMeasurementConfigured, enableRecruitmentMeasurement, disableRecruitmentMeasurement } from './homeSeekersRecruitment'
import HomeSeekersMobileNav from './HomeSeekersMobileNav'
import HomeSeekersFooter from './HomeSeekersFooter'
import './HomeSeekersJoin.css'

const base = '/demo/homeseekers'
const nav = [['Selling', 'selling'], ['Buying', 'buying'], ['Renting', 'renting'], ['About', 'about'], ['Join us', 'join']]
const { monthlyFee } = recruitmentPricing
const example = recruitmentExample()
const annualCommission = example.commission
const annualFee = example.cost
const traditionalCost = example.traditionalCost
const balloonCost = example.balloonCost
const money = (amount) => `R${Math.round(amount).toLocaleString('en-ZA')}`
const comparisons = [
  { title: 'The traditional split', copy: '70% to you. 30% to the brokerage. The better you do, the more it takes.', cost: traditionalCost },
  { title: 'The balloon model', copy: 'Around R8,500 a month, plus 10% of everything you write.', cost: balloonCost },
  { title: 'The cap chase', copy: '71/29 until R150,000, then a 4% royalty. Royalty calculation awaiting confirmation.', cost: null },
  { title: 'Home Seekers', copy: 'R7,500 a month and R1,000 a registered sale.', cost: annualFee, featured: true },
]
const included = [
  { title: 'The business behind you', items: ['Property24 and Private Property on our national account', 'Lightstone', 'CRM and deal management', 'Our trust account and FFC', 'Full compliance and FICA', 'Deal administration from offer to transfer', 'Digital signatures', 'Professional indemnity', 'Bond origination'] },
  { title: 'The brand in front of you', items: ['A marketing pack on day one — For Sale, To Let and On Show boards, all designed', 'Our in-house design studio for anything else', 'Canva templates for your social', 'Your listings on our site and every portal under the Home Seekers name', 'Sales training', 'The 45-Day Guarantee'] },
]
const faqs = [
  ['What’s the catch?', 'We make our money on the monthly fee, with a R1,000 transaction fee per registered sale. The brief also specifies a commission share on the portion over R10 million; that threshold will be clarified in the final terms.'],
  ['Do I need an office?', 'No. Work from wherever you work now.'],
  ['What happens to my current listings?', 'Mandates stay with your current agency until they expire. We’ll help you plan the move so nothing falls over.'],
  ['Am I an employee?', 'No. You’re an independent practitioner with your own book, same as now.'],
  ['What if I have a quiet quarter?', 'You still pay R7,500 a month. That’s the trade for a fixed cost instead of a percentage. At four sales a year, the comparison is close; your sale prices and commission rate matter.'],
  ['Can I bring my team?', 'Yes. Team rates start at the third head. Talk to us.'],
  ['How long does it take to move?', 'Two to four weeks, most of which is the FFC transfer.'],
  ['What’s the notice period?', 'One calendar month. No exit penalty, no clawback, and your pipeline is yours.'],
]

function Eyebrow({ children }) {
  return <p className="hs-join__eyebrow"><span aria-hidden="true">❯</span>{children}</p>
}

function ApplyLink({ children = 'Apply to join', className = '' }) {
  return <a className={`hs-join__button ${className}`} href="#apply">{children}<ArrowRight size={17} aria-hidden="true" /></a>
}

function CheckList({ items }) {
  return <ul className="hs-join__checklist">{items.map((item) => <li key={item}><Check size={18} aria-hidden="true" /><span>{item}</span></li>)}</ul>
}

function ApplicationForm({ measurementAllowed, onMeasurementChange }) {
  const [sending, setSending] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [message, setMessage] = useState('')
  const inFlight = useRef(false)
  const attempt = useRef(null)
  async function submit(event) {
    event.preventDefault()
    if (inFlight.current || submitted) return
    const form = event.currentTarget
    const fields = new FormData(form)
    const details = { name: fields.get('name'), phone: fields.get('phone'), email: fields.get('email'), area: fields.get('area'), sales: Number(fields.get('sales')), message: fields.get('message'), privacyAccepted: fields.get('privacy') === 'on', companyWebsite: fields.get('website') }
    const signature = JSON.stringify(details)
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() }
    inFlight.current = true
    setSending(true)
    setMessage('')
    try {
      const result = await submitRecruitmentApplication({ ...details, idempotencyKey: attempt.current.key })
      setSubmitted(true)
      setMessage('Your application has been received. Thank you — the Home Seekers team will review your details.')
      trackRecruitmentConversion('application_submitted', { measurementAllowed, duplicate: result.duplicate })
      form.reset()
    } catch (error) {
      setMessage(error.message || 'Your application could not be sent. Please try again.')
    } finally { inFlight.current = false; setSending(false) }
  }
  return <form className="hs-join__form" onSubmit={submit} aria-busy={sending} aria-label="Join Home Seekers application">
    <fieldset disabled={sending || submitted}>
    <legend className="hs-join__sr-only">Your application details</legend>
    <div className="hs-join__form-grid">
      <label>Name<input name="name" required autoComplete="name" maxLength={120} /></label>
      <label>Mobile<input name="phone" type="tel" required autoComplete="tel" maxLength={30} /></label>
      <label>Email<input name="email" type="email" required autoComplete="email" maxLength={254} /></label>
      <label>Area you work<input name="area" required autoComplete="address-level2" maxLength={120} /></label>
    </div>
    <label>Registered sales in the last 12 months<input name="sales" type="number" min="0" max="10000" step="1" required inputMode="numeric" /></label>
    <label>What’s the one thing about your current agency that actually annoys you?<textarea name="message" rows={4} maxLength={3000} required /></label>
    <label className="hs-join__consent"><input name="privacy" type="checkbox" required /><span>I agree to be contacted about my application.</span></label>
    <input className="hs-join__honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
    <button className="hs-join__button" type="submit">{sending ? 'Sending…' : submitted ? 'Application received' : 'Send my application'}<ArrowRight size={17} aria-hidden="true" /></button>
    </fieldset>
    {campaignMeasurementConfigured && <label className="hs-join__consent"><input type="checkbox" checked={measurementAllowed} onChange={(event) => onMeasurementChange(event.target.checked)} /><span>Allow Google and Meta campaign measurement. Optional; you can switch this off here.</span></label>}
    <p role="status" className="hs-join__form-status">{message}</p>
  </form>
}

export default function HomeSeekersJoin() {
  const [measurementAllowed, setMeasurementAllowed] = useState(false)
  const [applicationVisible, setApplicationVisible] = useState(false)
  const applicationRef = useRef(null)
  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector('meta[name="description"]')
    const previousDescription = description?.content
    document.title = 'Join Home Seekers | Your business. Your commission.'
    if (description) description.content = 'Explore the Home Seekers agent model: R7,500 a month plus R1,000 per sale, business support and a clear application process.'
    return () => {
      document.title = previousTitle
      if (description) description.content = previousDescription
    }
  }, [])
  useEffect(() => {
    if (!applicationRef.current || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(([entry]) => setApplicationVisible(entry.isIntersecting))
    observer.observe(applicationRef.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => () => { if (measurementAllowed) disableRecruitmentMeasurement() }, [measurementAllowed])
  function updateMeasurement(allowed) {
    setMeasurementAllowed(allowed)
    if (allowed) enableRecruitmentMeasurement()
    else disableRecruitmentMeasurement()
  }
  function openGuarantee() {
    try { trackHomeSeekersEvent('guarantee_opened') } catch { /* Navigation remains available. */ }
    trackRecruitmentConversion('guarantee_opened', { measurementAllowed })
  }
  return <main className="hs-join">
    <a className="hs-join__skip" href="#join-content">Skip to content</a>
    <header className="hs-join__header">
      <a href={base} aria-label="Home Seekers home"><img src="/brand/homeseekers/home-seekers-horizontal-black.svg" width="158" height="45" alt="Home Seekers" /></a>
      <nav aria-label="Main navigation">{nav.map(([label, slug]) => <a aria-current={slug === 'join' ? 'page' : undefined} href={`${base}/${slug}`} key={slug}>{label}</a>)}</nav>
      <ApplyLink />
      <HomeSeekersMobileNav links={[...nav.map(([label, slug]) => [label, `${base}/${slug}`]), ['Apply to join', '#apply']]} active="join us" />
    </header>

    <section className="hs-join__hero" id="join-content" tabIndex={-1} aria-labelledby="join-title">
      <img className="hs-join__hero-photo" src="/brand/homeseekers/join-property-hero.avif" alt="" width="1440" height="900" fetchPriority="high" />
      <div className="hs-join__hero-copy">
        <Eyebrow>Join <strong>Home Seekers</strong></Eyebrow>
        <h1 id="join-title">Somewhere your split is buying a boat.<br /><em>You’re not on it.</em></h1>
        <p>R7,500 a month. You keep your commission, with a R1,000 fee per sale. No cap chase. No downline. <a href="#fees">See fees and commission terms.</a></p>
        <div className="hs-join__actions"><ApplyLink /><a className="hs-join__text-link" href="#maths">See the maths<ArrowRight size={18} aria-hidden="true" /></a></div>
        <small>Four or more registered sales in the last twelve months.</small>
      </div>
      <div className="hs-join__hero-bottom"><span>Your business. Your book.</span><span>A fixed fee. A clearer future.</span></div>
    </section>

    <section className="hs-join__section hs-join__problem" aria-labelledby="problem-title">
      <div><Eyebrow>What it’s <strong>costing you</strong></Eyebrow><h2 id="problem-title">You know the split.<br /><em>You’ve never worked out the number.</em></h2></div>
      <div className="hs-join__prose"><p>Thirty percent sounds like nothing when you sign up. It’s a very different thing after a good year.</p><p>And it isn’t only the split. You drop to 4.5% to win the listing, because the agent before you offered 3% and you had nothing else to say. Then you hand thirty percent of what’s left to someone who didn’t make the call, didn’t do the valuation and wasn’t there on the Sunday.</p><p className="hs-join__statement">You did the work.<br />Someone else is spending it.</p></div>
    </section>

    <section className="hs-join__section hs-join__band" id="maths" aria-labelledby="maths-title">
      <Eyebrow>The <strong>maths</strong></Eyebrow><h2 id="maths-title">Twelve sales a year.<br /><em>Here’s where it goes.</em></h2>
      <p className="hs-join__intro">R16.2 million of property. {money(annualCommission)} of commission at 6%.</p><p>There are three ways to pay for a brokerage in South Africa. Then there’s ours.</p>
      <div className="hs-join__comparison" role="table" aria-label="Annual brokerage cost comparison">
        <div className="hs-join__comparison-head" role="row"><span role="columnheader">The model</span><span role="columnheader">They take</span><span role="columnheader">You keep</span></div>
        {comparisons.map((row) => <div role="row" className={`hs-join__comparison-row${row.featured ? ' is-featured' : ''}`} key={row.title}>
          <div role="cell"><h3>{row.title}{row.featured && <span className="hs-join__tag">Our model</span>}</h3><p>{row.copy}</p></div>
          <div role="cell"><span className="hs-join__mobile-label">They take</span><strong>{row.cost === null ? 'To confirm' : money(row.cost)}</strong></div>
          <div role="cell"><span className="hs-join__mobile-label">You keep</span><strong>{row.cost === null ? 'To confirm' : money(annualCommission - row.cost)}</strong></div>
        </div>)}
      </div>
      <div className="hs-join__savings"><div><strong>{money(traditionalCost - annualFee)}</strong><span>more than a traditional split, every year.</span></div><div><strong>{money((traditionalCost - annualFee) * 5)}</strong><span>over five years at the same sales level.</span></div></div>
      <p className="hs-join__fine">{money(balloonCost - annualFee)} more than the balloon example. Illustrative figures from the September 2026 brief, at R1,350,000 per sale and 6% commission. Competitor terms, VAT treatment and the cap royalty remain subject to verification before publication.</p>
    </section>

    <section className="hs-join__section" aria-labelledby="growth-title">
      <Eyebrow>The part <strong>nobody else can say</strong></Eyebrow><h2 id="growth-title">The better you get,<br /><em>the cheaper we get.</em></h2>
      <p className="hs-join__intro">Your monthly fee stays fixed. As your sales grow, it takes a smaller share of your commission.</p>
      <div className="hs-join__growth">{[4, 8, 12, 16, 20].map((sales) => <div key={sales}><span>{sales} sales a year</span><strong>{Math.round(recruitmentExample(sales).effectivePercent)}<small>%</small></strong><span>of your commission</span></div>)}</div>
      <div className="hs-join__two-columns hs-join__prose"><p>The traditional split takes thirty percent whether you do four sales or forty. The balloon model takes a monthly fee and then ten percent on top of it.</p><p>We charge R7,500 a month and R1,000 a sale. At twelve sales, that’s {money(annualFee)} for the year. You can plan around it.</p></div>
      <p className="hs-join__fine">Rounded percentages using the same sale price and commission assumptions as the comparison above. Excludes any share above the R10 million threshold, whose basis still needs confirmation.</p>
    </section>

    <section className="hs-join__section hs-join__band" id="fees" aria-labelledby="fees-title">
      <Eyebrow>What it <strong>costs</strong></Eyebrow><h2 id="fees-title">R7,500 a month.<br /><em>R1,000 a sale. That’s the model.</em></h2>
      <div className="hs-join__fees">
        <article><span className="hs-join__card-label">The fixed fee</span><h3>R7,500<span>/ month</span></h3><p>Property24, Private Property, Lightstone, CRM, our trust account, compliance, deal administration, your marketing pack and our in-house design studio.</p></article>
        <article><span className="hs-join__card-label">The deal fee</span><h3>R1,000<span>/ sale</span></h3><p>Transaction and compliance. FICA on both parties, deal file, trust receipt and reconciliation, OTP and condition tracking, document retention.</p><details><summary>What the fee covers<Plus size={16} aria-hidden="true" /></summary><p>These are the services specified in the brief. The itemised R1,000 cost breakdown will be added before launch.</p></details></article>
        <article><span className="hs-join__card-label">Your commission</span><h3>100%<span>up to R10 million*</span></h3><p>Above that, the brief specifies a 20% share of the commission on the portion over R10 million, with nothing shared below it.</p><p className="hs-join__fine">*The basis and period of the R10 million threshold must be confirmed in the final terms.</p></article>
      </div>
      <p className="hs-join__statement">No joining fee. No franchise fee.<br />No desk fee. No exit penalty.</p><p>The only other cost in the brief is R950 to transfer your FFC, and you’re welcome to do that yourself.</p>
      <p className="hs-join__fine">Pricing and inclusions are the proposed offer from the September 2026 brief. Final terms and VAT treatment remain to be confirmed.</p>
    </section>

    <section className="hs-join__section hs-join__referral" aria-labelledby="referral-title">
      <div><Eyebrow>Fifteen and <strong>you’re free</strong></Eyebrow><h2 id="referral-title">Bring people with you.<br /><em>Cover your monthly fee.</em></h2><p>R500 a month for every agent you bring, for as long as they’re with us. You invoice us.</p><p>One tier. You earn on the people you personally brought, and nobody else.</p><p className="hs-join__fine">Referral income offsets the monthly subscription. Transaction fees still apply.</p></div>
      <div><table className="hs-join__referral-table"><caption>What your referrals earn each month</caption><thead><tr><th scope="col">Agents</th><th scope="col">You earn</th><th scope="col">Net monthly fee</th></tr></thead><tbody>{[5, 10, 15, 20].map((agents) => <tr className={agents === 15 ? 'is-featured' : ''} key={agents}><th scope="row">{agents}</th><td>{money(agents * 500)}</td><td>{agents > 15 ? `Up ${money(agents * 500 - monthlyFee)}` : money(monthlyFee - agents * 500)}</td></tr>)}</tbody></table><p className="hs-join__statement">You’re here to sell houses.<br /><em>Not recruit your cousin.</em></p><p>No levels. No downline. No organisation to build. No Monday night calls about your “why”.</p></div>
    </section>

    <section className="hs-join__section hs-join__band" aria-labelledby="included-title">
      <Eyebrow>What you <strong>get</strong></Eyebrow><h2 id="included-title">A business behind you.<br /><em>A brand in front of you.</em></h2>
      <div className="hs-join__two-columns hs-join__included">{included.map((group) => <article key={group.title}><h3>{group.title}</h3><CheckList items={group.items} /></article>)}</div>
    </section>

    <section className="hs-join__section hs-join__guarantee" aria-labelledby="guarantee-title">
      <div className="hs-join__badge" aria-label="45-day guarantee"><strong>45</strong><span>Day</span><b>Guarantee</b></div>
      <div><Eyebrow>One more <strong>thing</strong></Eyebrow><h2 id="guarantee-title">Something to say<br /><em>when you walk in the door.</em></h2><p className="hs-join__statement">Sold in 45 days,<br />or we cut our commission.</p><p>Sole mandate, listed at the price we recommend, subject to the published terms. Give a seller a reason to pick you over the agent who sat in that chair yesterday.</p><a className="hs-join__text-link" href={`${base}/guarantee#guarantee`} onClick={openGuarantee}>How the guarantee works<ArrowRight size={18} aria-hidden="true" /></a></div>
    </section>

    <section className="hs-join__section hs-join__band" aria-labelledby="fit-title">
      <Eyebrow>Let’s be <strong>straight</strong></Eyebrow><h2 id="fit-title">A better fit.<br /><em>For the right agent.</em></h2>
      <div className="hs-join__two-columns hs-join__fit"><article><h3>This is for you if</h3><CheckList items={['You did four or more registered sales last year', 'You’re tired of discounting to win listings', 'You’d rather know what your business costs than guess', 'You want to build something that’s actually yours']} /></article><article><h3>This isn’t for you yet if</h3><ul>{['You’re still in your first year', 'You need someone to hand you leads to survive', 'R7,500 a month is a stretch before you’ve sold anything'].map((item) => <li key={item}>{item}</li>)}</ul></article></div>
      <p>Break-even against a 70/30 split is about {example.breakEvenSales.toFixed(1)} sales a year under the comparison assumptions. Below that, you may be better off where you are. We’d rather tell you now than take your money for six months.</p>
      <p className="hs-join__fine">New to the industry? The brief allows joining with a full-status agent to sign off your transactions, or as part of a team. <a href="#apply">Talk to us about your situation.</a></p>
    </section>

    <section className="hs-join__section hs-join__faq" aria-labelledby="faq-title">
      <div><Eyebrow>The <strong>questions</strong></Eyebrow><h2 id="faq-title">Fair questions.<br /><em>Straight answers.</em></h2><ApplyLink /></div>
      <div>{faqs.map(([question, answer]) => <details key={question}><summary>{question}<Plus size={20} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
    </section>

    <section className="hs-join__section hs-join__apply hs-join__band" id="apply" ref={applicationRef} aria-labelledby="apply-title">
      <div><Eyebrow>Your next <strong>move</strong></Eyebrow><h2 id="apply-title">Four sales last year.<br /><em>Let’s talk about the next twelve months.</em></h2><p>Tell us what you did in the last twelve months. Let’s see whether the model works for you.</p><p className="hs-join__fine">We aim to answer within two working days. Every application gets an answer. Yes or no.</p></div>
      <ApplicationForm measurementAllowed={measurementAllowed} onMeasurementChange={updateMeasurement} />
    </section>
    <HomeSeekersFooter />
    {!applicationVisible && <ApplyLink className="hs-join__sticky-apply">Apply</ApplyLink>}
  </main>
}
