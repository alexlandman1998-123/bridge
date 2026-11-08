import { JoinJourney } from './homeSeekersJoinContext'
import { useContext, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { OwnerPlaceholder, founderFirstName } from './HomeSeekersJoinActions'
import { CheckList, FounderPortrait } from './homeSeekersJoinContent'
import { homeSeekersFounderCalendarUrl, homeSeekersInformationSessionUrl, upcomingHomeSeekersSessions } from './homeSeekersBookingLinks'
import { formatNextStepDate, isNextStepsLocalReview } from './homeSeekersNextStepsModel'
import { splitCalculatorModels } from './homeSeekersSplitCalculatorModel'
import { salesBand, submitJoinFollowUp, trackJoinEvent } from './homeSeekersJoinJourney'

export default function HomeSeekersNextSteps({ actionRef, calculator }) {
  const journey = useContext(JoinJourney)
  const [call, setCall] = useState({ name:'', mobile:'', email:'', sales:'', model:'', consent:false })
  const [source,setSource] = useState('next steps'), [calendar,setCalendar] = useState(false), [callOpen,setCallOpen] = useState(false), [sessionOpen,setSessionOpen] = useState(false)
  const [bookingStatus,setBookingStatus] = useState('')
  const bookedReceipts = useRef(new Set()), sessionReceipts = useRef(new Set()), sessionSnapshot = useRef(null)
  const [busy,setBusy] = useState(false), [problem,setProblem] = useState(''), [intake,setIntake] = useState(null)
  const calendarRef = useRef(null), sessionRef = useRef(null), attempt = useRef(null), working = useRef(false)
  const session = upcomingHomeSeekersSessions()[0]
  const local = isNextStepsLocalReview()
  useImperativeHandle(actionRef, () => ({ open(type, placement) {
    setSource(placement)
    if (type === 'session') { sessionSnapshot.current = {source:placement,calculator}; setSessionOpen(true) }
    else setCallOpen(true)
    document.getElementById(type === 'session' ? 'live-session' : 'book-call')?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block:'start' })
  } }))
  useEffect(() => {
    if (!calculator) return
    setCall(current=>({...current, sales: salesBand(calculator.inputs.sales), model: calculator.inputs.model}))
  }, [calculator])
  useEffect(() => {
    function confirmed(event) {
      // Calendly documents this exact completion event. A click is never a booking.
      if (event.origin === 'https://calendly.com' && event.source === calendarRef.current?.contentWindow && event.data?.event === 'calendly.event_scheduled' && intake) {
        const receipt = event.data.payload?.invitee?.uri
        if (typeof receipt !== 'string' || !receipt.startsWith('https://api.calendly.com/')) return
        if (bookedReceipts.current.has(receipt)) return
        bookedReceipts.current.add(receipt)
        trackJoinEvent('book_call', intake.source, receipt)
        setProblem('')
        setBookingStatus('Booking confirmed. Calendly sends your calendar invitation.')
        if (!local) submitJoinFollowUp('booking', { ...intake, bookingUrl: receipt }, `booked:${intake.id}`)
          .catch(() => setBookingStatus('Your booking is confirmed. Delivery of the extra calculator context is unconfirmed.'))
        // Intake is already in the enquiry queue. The provider sends the booking confirmation.
      }
      // This site-specific bridge must be installed on Demio’s thank-you page by the event owner.
      if (event.origin === 'https://my.demio.com' && event.source === sessionRef.current?.contentWindow && event.data?.event === 'homeseekers.session_registered' && typeof event.data.receipt === 'string') {
        const receipt = event.data.receipt
        if (!receipt || sessionReceipts.current.has(receipt)) return
        sessionReceipts.current.add(receipt)
        const snapshot = sessionSnapshot.current || {source:'next steps',calculator:null}
        trackJoinEvent('book_session', snapshot.source, receipt)
        if (!local) submitJoinFollowUp('session', {name:event.data.name,email:event.data.email,source:snapshot.source,calculator:snapshot.calculator,consent:true}, crypto.randomUUID())
          .catch(() => setProblem('Session registration received. Delivery of the extra calculator context is unconfirmed.'))
      }
    }
    window.addEventListener('message', confirmed)
    return () => window.removeEventListener('message', confirmed)
  }, [intake, source, local])
  function change(name,value) { setCall(current=>({...current,[name]:value})); attempt.current=null; setProblem('') }
  async function submit(event) {
    event.preventDefault()
    if (working.current) return
    const snapshot = { ...call, source, calculator }
    if (!snapshot.name.trim() || !/^\+?[\d ()-]{9,30}$/.test(snapshot.mobile) || !/^\d{9,15}$/.test(snapshot.mobile.replace(/\D/g,'')) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(snapshot.email) || !snapshot.sales || !snapshot.model || !snapshot.consent) { setProblem('Complete your contact details, both questions and contact consent.'); return }
    attempt.current ||= { id:crypto.randomUUID(), details:snapshot }
    working.current=true;setBusy(true);setProblem('')
    try {
      if (!local) await submitJoinFollowUp('call', attempt.current.details, attempt.current.id)
      setIntake({...attempt.current.details,id:attempt.current.id});setCalendar(true)
    } catch(error) { setProblem(error.message) }
    finally {working.current=false;setBusy(false)}
  }
  const calendarUrl = new URL(homeSeekersFounderCalendarUrl)
  if (intake) { calendarUrl.searchParams.set('name',intake.name);calendarUrl.searchParams.set('email',intake.email) }
  calendarUrl.searchParams.set('embed_type','Inline')
  calendarUrl.searchParams.set('embed_domain',window.location.hostname)
  return <section className="hs-join__section" aria-labelledby="next-steps-title" data-join-section="next steps" id="next-steps">
    <h2 id="next-steps-title">Your next step. A conversation first.</h2>
    <div className="hs-join__two-columns hs-join__fit"><article><h3>This is for you if</h3><CheckList items={['You’re tired of discounting to win listings','You’d rather know what your business costs than guess','You want to build something that’s actually yours']} /></article><article><h3>This isn’t for you yet if</h3><CheckList items={['You’re still in your first year','You need someone to hand you leads to survive','The fixed annual commitment would put pressure on your business']} /></article></div>
    <div className="hs-join-rebuild__next-cards">
      <article id="book-call"><p className="hs-join__eyebrow">01 · Book a call</p><FounderPortrait /><h3>30 minutes, no obligation.</h3><p>A few slots each week. We’ll check fit on the call.</p>
        {local && <p className="hs-join-rebuild__notice">Local review. No intake is sent. Opening the calendar contacts Calendly.</p>}
        <details open={callOpen} onToggle={event=>setCallOpen(event.currentTarget.open)}><summary className="hs-join-rebuild__call-summary" onClick={()=>setSource('next steps')}>Book a call with {founderFirstName}</summary>{!calendar ? <form onSubmit={submit} aria-label="Founder call booking details"><fieldset disabled={busy}><label>Name<input name="name" autoComplete="name" maxLength={120} value={call.name} onChange={e=>change('name',e.target.value)} required /></label><label>Mobile number<input name="mobile" type="tel" autoComplete="tel" maxLength={30} value={call.mobile} onChange={e=>change('mobile',e.target.value)} required /></label><label>Email<input name="email" type="email" autoComplete="email" maxLength={254} value={call.email} onChange={e=>change('email',e.target.value)} required /></label><label>Registered sales in the last 12 months<select name="sales" value={call.sales} onChange={e=>change('sales',e.target.value)} required><option value="">Select</option>{['under 5','5-9','10-19','20+'].map(band=><option key={band}>{band}</option>)}</select></label><label>Current model<select name="model" value={call.model} onChange={e=>change('model',e.target.value)} required><option value="">Select</option>{splitCalculatorModels.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><input type="hidden" name="calculator" value={JSON.stringify(calculator)} /><input type="hidden" name="source" value={source} /><label className="hs-join-rebuild__contact-consent"><input type="checkbox" checked={call.consent} onChange={e=>change('consent',e.target.checked)} required />I agree to be contacted about this enquiry.</label><button className="hs-join__button" disabled={busy} type="submit">Book a call with {founderFirstName}</button></fieldset></form> : <><p>{local ? 'Preview details complete.' : 'Your details are received.'} Choose a time to complete your booking.</p><iframe ref={calendarRef} src={calendarUrl.href} title="Book a 30-minute founder call" className="hs-join-rebuild__calendar" referrerPolicy="strict-origin-when-cross-origin" /><a href={calendarUrl.href} target="_blank" rel="noopener noreferrer">Book a call with {founderFirstName}</a></>}
        {problem && <p role="alert">{problem}</p>}{bookingStatus && <p role="status">{bookingStatus}</p>}</details>
      </article>
      <article id="live-session"><p className="hs-join__eyebrow">02 · Live session</p><h3>{session ? formatNextStepDate(session.start, {weekday:'long'}) : <OwnerPlaceholder>[NEXT SESSION DATE + TIME]</OwnerPlaceholder>}</h3><p>Camera off. Microphone off. Your name stays private.</p><p>A short introduction to the model, then your questions. Nothing to sign, nothing to pay.</p>{sessionOpen && <iframe ref={sessionRef} src={homeSeekersInformationSessionUrl} title="Home Seekers live session registration" className="hs-join-rebuild__session" referrerPolicy="strict-origin-when-cross-origin" />}<a className="hs-join__button hs-join-rebuild__secondary" href="#live-session" onClick={e=>{e.preventDefault();setSource('next steps');sessionSnapshot.current={source:'next steps',calculator};setSessionOpen(true)}}>Join the next live session</a></article>
      <article id="apply"><p className="hs-join__eyebrow">03 · Apply</p><h3>Already decided?</h3><ol><li>Contact details</li><li>Email code</li><li>Your experience</li></ol><p>Applying does not commit you to moving agencies or choosing a package.</p><a className="hs-join__button hs-join-rebuild__secondary" href="#apply" onClick={e=>{e.preventDefault();journey?.open('apply','next steps')}}>Apply to join</a></article>
    </div>
  </section>
}
