import { ArrowRight, Check, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { trackHomeSeekersEvent } from './homeSeekersWebsiteData'
import { recruitmentPricing, recruitmentPaymentOptions, recruitmentExample, trackRecruitmentConversion, campaignMeasurementConfigured, enableRecruitmentMeasurement, disableRecruitmentMeasurement } from './homeSeekersRecruitment'
import HomeSeekersMobileNav from './HomeSeekersMobileNav'
import HomeSeekersFooter from './HomeSeekersFooter'
import RecruitmentSignupModal from './recruitment/RecruitmentSignupModal'
import './HomeSeekersJoin.css'

const base = '/demo/homeseekers'
const nav = [['Selling', 'selling'], ['Buying', 'buying'], ['Renting', 'renting'], ['About', 'about'], ['Join us', 'join']]
const { monthlyFee, transactionFee, referralMonthlyCredit, referralLimit } = recruitmentPricing
const example = recruitmentExample()
const annualCommission = example.commission
const annualFee = example.cost
const traditionalCost = example.traditionalCost
const balloonCost = example.balloonCost
const money = (amount) => `R${Math.round(amount).toLocaleString('en-ZA')}`
const comparisons = [
  { title: 'The traditional split', copy: '70% to you. 30% to the brokerage. The better you do, the more it takes.', cost: traditionalCost },
  { title: 'The balloon model', copy: 'R8,500 a month, plus 10% of gross commission worked on a 6% rate.', cost: balloonCost },
  { title: 'The cap chase', copy: 'R950 a month, 29% to a R150,000 annual cap, plus a continuing 4% royalty.', cost: example.capCost },
  { title: 'Home Seekers', copy: 'Option 2: R9,000 a month and R1,500 per registered sale. All fees exclude VAT.', cost: annualFee, featured: true },
]
const included = [
  { title: 'The business behind you', items: ['Property24 and Private Property on our national account', 'Our website plus twelve other listing platforms', 'Your choice of LOOM or CMA Info, with unlimited property reports', 'Virtual Agent: up to 100 contact numbers a day', 'CRM with buyer and seller portals, lead routing and your agent profile', 'Online signatures for mandates, offers and FICA', 'Our audited trust account and Fidelity Fund Certificate', 'FICA and PPRA compliance', 'Deal administration from offer to transfer', 'Commission paid out when funds reflect'] },
  { title: 'The brand in front of you', items: ['Print-ready For Sale board artwork with your face and number', 'Listing presentations and seller proposal material', 'Our in-house design studio', 'Social templates and campaign artwork', 'Live and recorded sales training from practising agents', 'Bond origination: earn on the bonds you refer', 'The 45-Day Guarantee'] },
]
const faqs = [
  ['How do the three options differ?', 'The support is the same. Choose R10,000 a month paid from registered deals, R9,000 a month by debit order, or R100,000 upfront for the year. Every option adds R1,500 per registered sale. All fees exclude VAT. You can change your payment option at renewal.'],
  ['Do you take a share of my commission?', 'There is no brokerage split, cap or royalty, and no R10 million threshold. You keep 100% of your commission, less the agreed subscription and R1,500 fee per registered sale.'],
  ['What happens if I choose to pay from my deals?', 'The R10,000 monthly fee accrues as a balance. When a deal registers, a maximum of 50% of that deal goes towards the balance, so you retain at least half of each cheque. The balance continues to accrue during quiet months. This option is for solo agents only.'],
  ['Do I need an office?', 'No. There is no desk requirement, office hours, floor duty or compulsory Monday meeting.'],
  ['What happens to my current listings?', 'Mandates stay with your current agency until they expire. We’ll help you plan the move so nothing falls over.'],
  ['Am I an employee?', 'No. You’re an independent practitioner running your own business and keeping your own book.'],
  ['Can I bring my team?', 'Yes. The leader pays the full rate, seats 2 to 5 cost R7,000 each a month, and seat 6 onwards costs R6,000 each a month. Annual upfront rates are R100,000 for the leader, R84,000 per seat for seats 2 to 5, and R72,000 per seat from seat 6. Teams use option 2 or 3, with one account and one invoice. All fees exclude VAT; registered-sale fees still apply.'],
  ['What production level is this for?', 'Five registered sales in the last twelve months, or R6 million of property sold. Compare the fees against your own production: a fixed fee can cost more than a split at lower sales levels.'],
  ['Are there any other joining costs?', 'There is no joining fee, desk fee, franchise royalty, marketing levy or exit fee. The overview lists R950 to transfer your Fidelity Fund Certificate, payable to the PPRA rather than Home Seekers.'],
]

function Eyebrow({ children }) {
  return <p className="hs-join__eyebrow"><span aria-hidden="true">❯</span>{children}</p>
}

function ApplyLink({ children = 'Join Home Seekers', className = '', onOpen }) {
  return <button type="button" className={`hs-join__button ${className}`} onClick={onOpen}>{children}<ArrowRight size={17} aria-hidden="true" /></button>
}

function CheckList({ items }) {
  return <ul className="hs-join__checklist">{items.map((item) => <li key={item}><Check size={18} aria-hidden="true" /><span>{item}</span></li>)}</ul>
}

export default function HomeSeekersJoin() {
  const [signupOpen, setSignupOpen] = useState(false)
  const openSignup = () => setSignupOpen(true)
  const [measurementAllowed, setMeasurementAllowed] = useState(false)
  const [applicationVisible, setApplicationVisible] = useState(false)
  const applicationRef = useRef(null)
  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector('meta[name="description"]')
    const previousDescription = description?.content
    document.title = 'Join Home Seekers | Three ways in. Your commission.'
    if (description) description.content = 'Choose R10,000 a month from your deals, R9,000 by monthly debit order or R100,000 upfront annually. All exclude VAT, plus R1,500 per registered sale.'
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
      <ApplyLink onOpen={openSignup} />
      <HomeSeekersMobileNav links={[...nav.map(([label, slug]) => [label, `${base}/${slug}`]), ['Apply to join', '#apply']]} active="join us" />
    </header>

    <section className="hs-join__hero" id="join-content" tabIndex={-1} aria-labelledby="join-title">
      <img className="hs-join__hero-photo" src="/brand/homeseekers/join-property-hero.avif" alt="" width="1440" height="900" fetchPriority="high" />
      <div className="hs-join__hero-copy">
        <Eyebrow>Join <strong>Home Seekers</strong></Eyebrow>
        <h1 id="join-title">Your commission is not<br /><em>our business model.</em></h1>
        <p>Keep 100% of your commission. Choose how to pay your fixed fee: from your deals, by monthly debit order, or upfront for the year. <a href="#fees">Compare the three options.</a></p>
        <div className="hs-join__actions"><ApplyLink onOpen={openSignup} /><a className="hs-join__text-link" href="#fees">See the three options<ArrowRight size={18} aria-hidden="true" /></a></div>
        <small>All fees exclude VAT. R1,500 per registered sale on every option.<br />For agents with five registered sales in the last twelve months, or R6 million of property sold.</small>
      </div>
      <div className="hs-join__hero-bottom"><span>Your business. Your book.</span><span>A fixed fee. A clearer future.</span></div>
    </section>

    <section className="hs-join__section hs-join__light hs-join__fees-section" id="fees" aria-labelledby="fees-title">
      <Eyebrow>Three <strong>ways in</strong></Eyebrow><h2 id="fees-title">Same support.<br /><em>Choose what suits your cash flow.</em></h2>
      <p className="hs-join__intro">Three payment options. No commission split, no cap and no royalty. You can change your option at renewal.</p>
      <div className="hs-join__fees">
        {recruitmentPaymentOptions.map((option, index) => <article aria-labelledby={`option-${option.id}`} key={option.id} className={option.id === 'monthly' ? 'is-standard' : undefined}>
          <span className="hs-join__card-label">Option {index + 1}{option.id === 'monthly' && ' · The standard'}</span>
          <h3>{money(option.amount)}<span>{option.period} · excluding VAT</span></h3>
          <h4 id={`option-${option.id}`}>{option.title}</h4>
          <p className="hs-join__option-annual">{option.id === 'upfront' ? 'One payment for the year' : `${money(option.annualFee)} a year`}</p>
          <p>{option.copy}</p><p className="hs-join__fine">{option.note}</p>
        </article>)}
      </div>
      <div className="hs-join__fee-summary" aria-labelledby="fee-summary-title">
        <div className="hs-join__fee-summary-main">
          <div className="hs-join__fee-summary-price">
            <p className="hs-join__fee-summary-label">On all three options</p>
            <h3 id="fee-summary-title">{money(transactionFee)}<span>per registered sale</span></h3>
            <p>Keep 100% of your commission, less your subscription and registered-sale fees.</p>
            <p className="hs-join__fee-summary-vat">All fees exclude VAT.</p>
          </div>
          <ul className="hs-join__fee-summary-included" aria-label="No additional agency fees">
            {['No joining fee', 'No desk fee', 'No royalty', 'No marketing levy', 'No exit fee'].map((item) => <li key={item}><Check size={17} aria-hidden="true" />{item}</li>)}
          </ul>
        </div>
        <div className="hs-join__fee-summary-footer">
          <p><strong>FFC transfer: R950.</strong> Payable directly to the PPRA.</p>
          <ApplyLink onOpen={openSignup} />
        </div>
      </div>
    </section>

    <section className="hs-join__section hs-join__light hs-join__problem" aria-labelledby="problem-title">
      <div><Eyebrow>What it’s <strong>costing you</strong></Eyebrow><h2 id="problem-title">You know the split.<br /><em>You’ve never worked out the number.</em></h2></div>
      <div className="hs-join__prose"><p>Thirty percent sounds like nothing when you sign up. It’s a very different thing after a good year.</p><p>And it isn’t only the split. You drop to 4.5% to win the listing, because the agent before you offered 3% and you had nothing else to say. Then you hand thirty percent of what’s left to someone who didn’t make the call, didn’t do the valuation and wasn’t there on the Sunday.</p><p className="hs-join__statement">You did the work.<br />Someone else is spending it.</p></div>
    </section>

    <section className="hs-join__section hs-join__light hs-join__white" id="maths" aria-labelledby="maths-title">
      <Eyebrow>The <strong>maths</strong></Eyebrow><h2 id="maths-title">Ten sales a year.<br /><em>Here’s where it goes.</em></h2>
      <p className="hs-join__intro">R15 million of property. {money(annualCommission)} of commission at 5%, excluding VAT.</p><p>The same ten registered sales, compared using the models in the agent overview. Home Seekers uses option 2, the monthly debit order.</p>
      <div className="hs-join__comparison" role="table" aria-label="Annual brokerage cost comparison">
        <div className="hs-join__comparison-head" role="row"><span role="columnheader">The model</span><span role="columnheader">They take</span><span role="columnheader">You keep</span></div>
        {comparisons.map((row) => <div role="row" className={`hs-join__comparison-row${row.featured ? ' is-featured' : ''}`} key={row.title}>
          <div role="cell"><h3>{row.title}{row.featured && <span className="hs-join__tag">Our model</span>}</h3><p>{row.copy}</p></div>
          <div role="cell"><span className="hs-join__mobile-label">They take</span><strong>{money(row.cost)}</strong></div>
          <div role="cell"><span className="hs-join__mobile-label">You keep</span><strong>{money(annualCommission - row.cost)}</strong></div>
        </div>)}
      </div>
      <div className="hs-join__savings"><div><strong>{money(traditionalCost - annualFee)}</strong><span>more than a traditional split, every year.</span></div><div><strong>{money((traditionalCost - annualFee) * 5)}</strong><span>over five years at the same sales level.</span></div></div>
      <p className="hs-join__fine">{money(balloonCost - annualFee)} more than the balloon example. Illustrations from the supplied agent overview, not quotations. All amounts exclude VAT. Traditional: 70/30. Balloon: R8,500/month plus 10% of commission worked on a 6% rate. Cap chase: R950/month, 29% to a R150,000 annual cap, plus a continuing 4% royalty; post-cap transaction fees are excluded. Home Seekers: R9,000/month plus R1,500 per registered sale.</p>
    </section>

    <section className="hs-join__section" aria-labelledby="growth-title">
      <Eyebrow>The part <strong>nobody else can say</strong></Eyebrow><h2 id="growth-title">The better you get,<br /><em>the cheaper we get.</em></h2>
      <p className="hs-join__intro">Your subscription stays fixed. As your sales grow, the total fees take a smaller share of your commission.</p>
      <div className="hs-join__growth">{[5, 8, 10, 15, 20].map((sales) => <div key={sales}><span>{sales} sales a year</span><strong>{Math.round(recruitmentExample(sales).effectivePercent)}<small>%</small></strong><span>of your commission</span></div>)}</div>
      <div className="hs-join__two-columns hs-join__prose"><p>The traditional split takes thirty percent whether you do four sales or forty. The balloon model takes a monthly fee and then ten percent on top of it.</p><p>On option 2, we charge R9,000 a month and R1,500 per registered sale. At ten sales, that’s {money(annualFee)} for the year. You can plan around it.</p></div>
      <p className="hs-join__fine">Rounded percentages using option 2, an average R1.5 million sale price and 5% commission, excluding VAT. There is no commission-sharing threshold as your production grows.</p>
    </section>

    <section className="hs-join__section hs-join__light" aria-labelledby="team-title">
      <Eyebrow>Bring <strong>your team</strong></Eyebrow><h2 id="team-title">Your own seat at full price.<br /><em>Every seat after costs less.</em></h2>
      <p className="hs-join__intro">Teams use option 2 or 3. One account, one invoice, with the team leader carrying the seats.</p>
      <table className="hs-join__pricing-table"><caption>Team subscriptions, excluding VAT</caption><thead><tr><th scope="col">Seat</th><th scope="col">Per month</th><th scope="col">Annual upfront</th></tr></thead><tbody>
        <tr><th scope="row">Team leader</th><td>R9,000</td><td>R100,000</td></tr>
        <tr><th scope="row">Seats 2 to 5</th><td>R7,000 each</td><td>R84,000 each</td></tr>
        <tr><th scope="row">Seat 6 onwards</th><td>R6,000 each</td><td>R72,000 each</td></tr>
      </tbody></table>
      <p className="hs-join__fine">R1,500 per registered sale still applies. Team seats cannot be paid from deals. The leader may pay their own seat upfront while the team pays monthly. Your team structure and agreements stay yours.</p>
    </section>

    <section className="hs-join__section hs-join__light hs-join__white hs-join__referral" aria-labelledby="referral-title">
      <div><Eyebrow>Twelve referrals. <strong>Your seat covered.</strong></Eyebrow><h2 id="referral-title">Bring people with you.<br /><em>Cover your monthly fee.</em></h2><p>R750 a month for each agent you personally refer who joins and stays, capped at twelve agents. Payments continue for as long as those agents remain with Home Seekers.</p><p>One tier. You earn on the people you personally brought, and nobody else.</p><p className="hs-join__fine">Twelve active referrals cover the R9,000 monthly subscription on option 2. Registered-sale fees and VAT still apply.</p></div>
      <div><table className="hs-join__referral-table"><caption>Referral income against option 2, excluding VAT</caption><thead><tr><th scope="col">Agents</th><th scope="col">You earn</th><th scope="col">Net monthly fee</th></tr></thead><tbody>{[3, 6, 9, 12].map((agents) => <tr className={agents === referralLimit ? 'is-featured' : ''} key={agents}><th scope="row">{agents}</th><td>{money(agents * referralMonthlyCredit)}</td><td>{money(Math.max(0, monthlyFee - Math.min(agents, referralLimit) * referralMonthlyCredit))}</td></tr>)}</tbody></table><p className="hs-join__statement">You’re here to sell houses.<br /><em>Not recruit your cousin.</em></p><p>No levels. No downline. No organisation to build. No Monday night calls about your “why”.</p></div>
    </section>

    <section className="hs-join__section hs-join__band" aria-labelledby="included-title">
      <Eyebrow>What you <strong>get</strong></Eyebrow><h2 id="included-title">A business behind you.<br /><em>A brand in front of you.</em></h2>
      <div className="hs-join__two-columns hs-join__included">{included.map((group) => <article key={group.title}><h3>{group.title}</h3><CheckList items={group.items} /></article>)}</div>
    </section>

    <section className="hs-join__section hs-join__light hs-join__white" aria-labelledby="rentals-title">
      <Eyebrow>Rentals and <strong>property management</strong></Eyebrow><h2 id="rentals-title">Build a rental book.<br /><em>Keep it yours.</em></h2>
      <p className="hs-join__intro">Home Seekers carries the trust account, PayProp, reconciliations, monthly statements and annual audit. You carry the relationships.</p>
      <table className="hs-join__pricing-table"><caption>Rental charges in the agent overview, excluding VAT</caption><thead><tr><th scope="col">Charge</th><th scope="col">Amount</th></tr></thead><tbody>
        <tr><th scope="row">Home Seekers’ share of the management fee</th><td>3.5% of rent collected</td></tr>
        <tr><th scope="row">Once-off file fee, per new file</th><td>R1,000</td></tr>
        <tr><th scope="row">Administration and contract fee, per lease</th><td>R1,800</td></tr>
        <tr><th scope="row">In and out inspection, per tenancy</th><td>R700</td></tr>
      </tbody></table>
      <p className="hs-join__fine">Administration, contract and inspection fees are recovered from the landlord or tenant in the normal way, rather than paid by the agent.</p>
    </section>

    <section className="hs-join__section hs-join__light hs-join__guarantee" aria-labelledby="guarantee-title">
      <div className="hs-join__badge" aria-label="45-day guarantee"><strong>45</strong><span>Day</span><b>Guarantee</b></div>
      <div><Eyebrow>One more <strong>thing</strong></Eyebrow><h2 id="guarantee-title">Something to say<br /><em>when you walk in the door.</em></h2><p className="hs-join__statement">Sold in 45 days,<br />or we cut our commission.</p><p>Sole mandate, listed at the price we recommend, subject to the published terms. Give a seller a reason to pick you over the agent who sat in that chair yesterday.</p><a className="hs-join__text-link" href={`${base}/guarantee#guarantee`} onClick={openGuarantee}>How the guarantee works<ArrowRight size={18} aria-hidden="true" /></a></div>
    </section>

    <section className="hs-join__section hs-join__light hs-join__white" aria-labelledby="fit-title">
      <Eyebrow>Let’s be <strong>straight</strong></Eyebrow><h2 id="fit-title">A better fit.<br /><em>For the right agent.</em></h2>
      <div className="hs-join__two-columns hs-join__fit"><article><h3>This is for you if</h3><CheckList items={['You did five registered sales in the last twelve months, or sold R6 million of property', 'You’re tired of discounting to win listings', 'You’d rather know what your business costs than guess', 'You want to build something that’s actually yours']} /></article><article><h3>This isn’t for you yet if</h3><ul>{['You’re still in your first year', 'You need someone to hand you leads to survive', 'The fixed annual commitment would put pressure on your business'].map((item) => <li key={item}>{item}</li>)}</ul></article></div>
      <p>Break-even against a 70/30 split is about {example.breakEvenSales.toFixed(1)} sales a year under the comparison assumptions. Below that, you may be better off where you are. We’d rather tell you now than take your money for six months.</p>
      <p className="hs-join__fine">Not sure which payment option fits your cash flow? <a href="#fees">Compare the three ways in</a> and discuss your last twelve months with us.</p>
    </section>

    <section className="hs-join__section hs-join__light hs-join__faq" aria-labelledby="faq-title">
      <div><Eyebrow>The <strong>questions</strong></Eyebrow><h2 id="faq-title">Fair questions.<br /><em>Straight answers.</em></h2><ApplyLink onOpen={openSignup} /></div>
      <div>{faqs.map(([question, answer]) => <details key={question}><summary>{question}<Plus size={20} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
    </section>

    <section className="hs-join__section hs-join__apply hs-join__band" id="apply" ref={applicationRef} aria-labelledby="apply-title">
      <div><Eyebrow>Your next <strong>move</strong></Eyebrow><h2 id="apply-title">Join Home Seekers.<br /><em>Build your next chapter with us.</em></h2><p>Your business. Your book. A team behind you. Start with your contact details and create your applicant account.</p><p className="hs-join__fine">Joining starts with a conversation. Applying does not commit you to moving agencies.</p></div>
      <div className="hs-join__invitation"><h3>A clearer next step.</h3><ol><li><span>01</span>Create your applicant account</li><li><span>02</span>Verify your email</li><li><span>03</span>Tell us about your experience</li></ol><ApplyLink onOpen={openSignup} /><p className="hs-join__fine">Start with your name, email and mobile number.</p>{campaignMeasurementConfigured && <label className="hs-join__consent"><input type="checkbox" checked={measurementAllowed} onChange={(event) => updateMeasurement(event.target.checked)} /><span>Allow Google and Meta campaign measurement. Optional.</span></label>}</div>
    </section>
    <RecruitmentSignupModal open={signupOpen} onClose={() => setSignupOpen(false)} organisationName="Home Seekers" endpoint="/api/home-seekers/recruitment" onCaptured={(result) => trackRecruitmentConversion('recruitment_contact_captured', { measurementAllowed, duplicate: result.duplicate })} />
    <HomeSeekersFooter />
    {!applicationVisible && <ApplyLink onOpen={openSignup} className="hs-join__sticky-apply">Join now</ApplyLink>}
  </main>
}
