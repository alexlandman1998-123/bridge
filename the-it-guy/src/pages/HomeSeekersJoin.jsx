import { JoinJourney } from './homeSeekersJoinContext'
import { useCallback, useEffect, useRef, useState } from 'react'
import HomeSeekersSplitCalculator from './HomeSeekersSplitCalculator'
import HomeSeekersNextSteps from './HomeSeekersNextSteps'
import HomeSeekersFounders from './HomeSeekersFounders'
import { isNextStepsLocalReview } from './homeSeekersNextStepsModel'
import { homeSeekersPath } from './homeSeekersRoutes'
import HomeSeekersFooter from './HomeSeekersFooter'
import RecruitmentSignupModal from './recruitment/RecruitmentSignupModal'
import { recruitmentPaymentOptions } from './homeSeekersRecruitment'
import { comparisons, included, faqs, money, annualCommission, annualFee, traditionalCost, balloonCost } from './homeSeekersJoinCopy'
import { CheckList, AgentTestimonialVideo } from './homeSeekersJoinContent'
import { JoinActions, JoinHeader, OwnerPlaceholder } from './HomeSeekersJoinActions'
import { trackJoinEvent } from './homeSeekersJoinJourney'
import './HomeSeekersJoin.css'
import './HomeSeekersJoinRebuild.css'

export default function HomeSeekersJoin() {
  const [signupOpen, setSignupOpen] = useState(() => new URLSearchParams(window.location.search).get('documents') === '1')
  const [heroPassed, setHeroPassed] = useState(false)
  const [calculator, setCalculator] = useState(null)
  const [applicationSource, setApplicationSource] = useState('next steps')
  const applicationAttempt = useRef(null), heroRef = useRef(null), nextStepsRef = useRef(null)
  const onCalculator = useCallback(context => setCalculator(context), [])
  const open = useCallback((type, section) => {
    if (type === 'apply') {
      if (!applicationAttempt.current) setApplicationSource(section)
      applicationAttempt.current ||= crypto.randomUUID()
      trackJoinEvent('apply_start', section, applicationAttempt.current)
      setSignupOpen(true)
    } else nextStepsRef.current?.open(type, section)
  }, [])
  useEffect(() => {
    const previous = document.title
    document.title = 'Join Home Seekers | No split. One fixed fee.'
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => setHeroPassed(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0))
    if (heroRef.current) observer?.observe(heroRef.current)
    function jump() {
      const id = window.location.hash.slice(1)
      if (id === 'apply') open('apply', 'next steps')
      else if (id === 'book-call') open('call', 'next steps')
      else if (id === 'live-session') open('session', 'next steps')
      else if (id) document.getElementById(id)?.scrollIntoView()
    }
    jump(); window.addEventListener('hashchange', jump)
    return () => { observer?.disconnect(); document.title = previous; window.removeEventListener('hashchange', jump) }
  }, [open])
  return <JoinJourney.Provider value={{ open }}><main className="hs-join hs-join-rebuild">
    <a className="hs-join__skip" href="#join-content">Skip to content</a>
    <JoinHeader />
    <section ref={heroRef} className="hs-join__hero" id="join-content" tabIndex={-1} aria-labelledby="join-title" data-join-section="hero">
      <img className="hs-join__hero-photo" src="/brand/homeseekers/join-property-hero.avif" alt="" width="1440" height="900" fetchPriority="high" />
      <div className="hs-join__hero-copy"><p className="hs-join__eyebrow">Home Seekers · For established agents</p><h1 id="join-title">No split. One fixed fee.<br />Your commission stays yours.</h1><p>R9,000 a month and R1,500 per registered sale, excluding VAT. No cap, no royalty, no desk fee.</p><p className="hs-join-rebuild__qualifier">For agents with five registered sales in the last 12 months, or R6 million sold.</p><JoinActions section="hero" /></div>
    </section>
    <section className="hs-join-rebuild__trust" aria-label="Home Seekers credentials" data-join-section="trust"><span>Audited trust account</span><span>Fidelity Fund Certificate</span><span>Property24 and Private Property listings</span></section>
    <section className="hs-join__section hs-join__problem" aria-labelledby="problem-title" data-join-section="split">
      <h2 id="problem-title">You know the split.<br />You’ve never worked out the number.</h2><div><p>Thirty percent sounds like nothing when you sign up. It’s a very different thing after a good year.</p><p>You drop to 4.5% to win the listing. The agent before you offered 3%.</p><p>Then you hand thirty percent to someone who wasn’t there on Sunday. You did the work. Someone else is spending it.</p></div>
    </section>
    <section className="hs-join__section hs-join__band" id="maths" aria-labelledby="maths-title" data-join-section="maths">
      <h2 id="maths-title"><em>{money(traditionalCost - annualFee)}</em> more a year than a 70/30 split.</h2><p>Ten sales a year, compared across four common brokerage models.</p>
      <div className="hs-join-rebuild__comparison">{comparisons.map(row=><article key={row.title} className={row.featured ? 'is-featured' : ''}><h3>{row.title}</h3><dl><div><dt>Annual cost</dt><dd>{money(row.cost)}</dd></div><div><dt>You keep</dt><dd>{money(annualCommission-row.cost)}</dd></div></dl></article>)}</div>
      <details><summary>How we worked this out</summary><p>R15 million of property. {money(annualCommission)} of commission at 5%, excluding VAT.</p>{comparisons.map(row=><p key={row.title}><strong>{row.title}:</strong> {row.copy}</p>)}<p>Cap chase excludes post-cap transaction fees. Illustrative examples, not quotes.</p><p>{money(traditionalCost-annualFee)} more than a traditional split each year. {money((traditionalCost-annualFee)*5)} over five years.</p><p>{money(balloonCost-annualFee)} more than the balloon example.</p></details>
    </section>
    <HomeSeekersSplitCalculator onContextChange={onCalculator} actions={<JoinActions section="calculator" />} />
    <section className="hs-join__section" id="fees" aria-labelledby="fees-title" data-join-section="payments">
      <h2 id="fees-title">Three payment options. Same support.</h2><p>All amounts excluding VAT. You can change your option at renewal.</p>
      <div className="hs-join__fees">{recruitmentPaymentOptions.map((option,index)=><article key={option.id} aria-label={option.title}><span className="hs-join__card-label">Option {index+1}{option.id==='monthly' && ' · The standard'}</span><h3>{money(option.amount)}<span>{option.period}</span></h3><h4>{option.title}</h4><p>{money(option.annualFee)} annual subscription</p><p>{option.id==='deals' ? 'Settled from registered deals. A maximum of 50% of each deal pays the balance. Solo agents only.' : option.id==='monthly' ? 'Debit order on the 1st of every month, in advance. Your subscription is separate from your sales.' : 'One payment covers the year. Save R8,000 against twelve Prepaid payments.'}</p><p>R1,500 per registered sale still applies.</p></article>)}</div>
      <p>No joining fee, desk fee, royalty, marketing levy or exit fee.</p><a href={homeSeekersPath('/join/pricing')}>Full price list</a>
    </section>
    <section className="hs-join__section hs-join__band" aria-labelledby="included-title" data-join-section="included"><h2 id="included-title">A business behind you.<br />A brand in front of you.</h2><div className="hs-join__two-columns hs-join__included">{included.map(group=><article key={group.title}><h3>{group.title}</h3><CheckList items={group.items.slice(0,5)} /><details><summary>Show details</summary><CheckList items={group.items.slice(5)} /></details></article>)}</div><div className="hs-join-rebuild__resource-links"><a href={homeSeekersPath('/join/teams')}>Running a team? See team pricing.</a><a href={homeSeekersPath('/join/referrals')}>Earn R750 a month per agent you refer.</a><a href={homeSeekersPath('/renting#agent-offering')}>Build a rental book. See the rental offering.</a><a href={homeSeekersPath('/join/pricing')}>Full price list</a><a href={homeSeekersPath('/guarantee#guarantee')}>How the guarantee works</a></div></section>
    <section className="hs-join__section" aria-labelledby="founder-title" data-join-section="founder"><HomeSeekersFounders /><AgentTestimonialVideo /></section>
    <HomeSeekersNextSteps actionRef={nextStepsRef} calculator={calculator} />
    <section className="hs-join__section hs-join__band" aria-labelledby="faq-title" data-join-section="faq"><h2 id="faq-title">Fair questions. Straight answers.</h2>{faqs.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}<details><summary>What does the 45-day guarantee mean for me?</summary><p>A listing tool no other agent in the room has.</p><p>If a qualifying listing does not sell in 45 days, the seller pays half the agreed commission.</p><p>The reduction comes off your commission as the agent. Published conditions apply.</p><p><OwnerPlaceholder>OWNER TO CONFIRM: “You choose when to offer it.”</OwnerPlaceholder></p><a href={homeSeekersPath('/guarantee#guarantee')}>How the guarantee works</a></details><JoinActions section="FAQ" /></section>
    <RecruitmentSignupModal localReview={isNextStepsLocalReview() && import.meta.env.VITE_HOME_SEEKERS_STANDALONE === 'true'} open={signupOpen} onClose={()=>setSignupOpen(false)} organisationName="Home Seekers" returningApplicant={new URLSearchParams(window.location.search).get('documents')==='1'} endpoint="/api/home-seekers/recruitment" calculatorContext={calculator} leadSource={applicationSource} onApplicationComplete={receipt => trackJoinEvent('apply_complete', applicationSource, receipt)} />
    <HomeSeekersFooter />
    {heroPassed && !signupOpen && <JoinActions section="sticky bar" sticky />}
  </main></JoinJourney.Provider>
}
