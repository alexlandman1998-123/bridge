import { useImperativeHandle, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, LockKeyhole } from 'lucide-react'
import Modal from '../components/ui/Modal'
import { formatNextStepDate, isNextStepsLocalReview, nextStepsCalendarFile, nextStepsErrors, nextStepsStorageKey, previewFounderSlots, previewSessions, readNextStepsReview, recordNextStepsPreviewEvent, saveNextStepsReview, sessionSalesOptions, splitOptions } from './homeSeekersNextStepsModel'
import './HomeSeekersNextSteps.css'

const contactEmpty = { firstName: '', surname: '', email: '', mobile: '', area: '', consent: false }
const qualifierEmpty = { ...contactEmpty, ffc: '', sales: '', value: '', split: '' }
const sessionEmpty = { ...contactEmpty, salesBand: '', session: '', question: '' }
const shortDate = value => formatNextStepDate(value, { weekday: 'long' })
function PreviewNote() {
  return <p className="hs-next__preview"><strong>Local review</strong> · Sample availability. Records stay in this browser; no CRM updates, real bookings, email or SMS.</p>
}
function Field({ name, label, value, onChange, error, type = 'text', options, optional = false, ...props }) {
  const id = `hs-next-${name}`
  return <label className={`hs-next__field${name === 'question' ? ' hs-next__field--wide' : ''}`} htmlFor={id}>
    <span>{label}{optional ? <small> Optional</small> : <span aria-hidden="true"> *</span>}</span>
    {options ? <select id={id} value={value} onChange={event => onChange(name, event.target.value)} required={!optional} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...props}><option value="">Choose an option</option>{options.map(option => <option key={typeof option === 'string' ? option : option.id} value={typeof option === 'string' ? option : option.id}>{typeof option === 'string' ? option : option.label}</option>)}</select>
      : name === 'question' ? <textarea id={id} value={value} maxLength={2000} rows={3} onChange={event => onChange(name, event.target.value)} {...props} />
        : <input id={id} type={type} value={value} onChange={event => onChange(name, event.target.value)} required={!optional} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...props} />}
    {error && <small id={`${id}-error`} className="hs-next__error">{error}</small>}
  </label>
}
function ContactFields({ values, change, errors }) {
  return <>
    <Field name="firstName" label="First name" autoComplete="given-name" maxLength={120} value={values.firstName} onChange={change} error={errors.firstName} />
    <Field name="surname" label="Surname" autoComplete="family-name" maxLength={120} value={values.surname} onChange={change} error={errors.surname} />
    <Field name="email" label="Email" type="email" autoComplete="email" maxLength={254} value={values.email} onChange={change} error={errors.email} />
    <Field name="mobile" label="Mobile" type="tel" autoComplete="tel" placeholder="e.g. +27 82 123 4567" maxLength={25} value={values.mobile} onChange={change} error={errors.mobile} />
  </>
}
function Consent({ checked, onChange, error }) {
  return <div className="hs-next__consent"><label><input type="checkbox" checked={checked} onChange={event => onChange('consent', event.target.checked)} aria-invalid={!!error} /><span>I agree that Home Seekers may save these details and contact me about my enquiry.</span></label>{error && <p className="hs-next__error">{error}</p>}</div>
}
function validateAndFocus(data, type, setErrors, event) {
  const errors = nextStepsErrors(data, type)
  setErrors(errors)
  if (Object.keys(errors).length) {
    const target = event.currentTarget.querySelector(`[id="hs-next-${Object.keys(errors)[0]}"]`) || event.currentTarget.querySelector('[type="checkbox"]')
    target?.focus()
    return false
  }
  return true
}
function ReviewRecords({ revision }) {
  const [open, setOpen] = useState(false), [refresh, setRefresh] = useState(0)
  let state, problem
  try { state = readNextStepsReview() } catch (error) { problem = error.message }
  return <details className="hs-next__records" open={open} onToggle={event => setOpen(event.currentTarget.open)} data-revision={`${revision}-${refresh}`}>
    <summary>Local preview records & events <span>{state?.records.length || 0} submissions · {state?.events.length || 0} events</span></summary>
    <p>Review source, outcome and tracking names below. These are local fixtures, not CRM records. Resetting removes only this next-steps preview’s records.</p>
    {problem && <p role="alert">{problem}</p>}
    {state?.records.map(record => <div className="hs-next__record" key={record.id}><strong>{record.type} · {record.outcome}</strong><span>{record.details.firstName || record.details.qualifierId || 'Applicant'} · {record.source}</span><code>{record.id}</code></div>)}
    <div className="hs-next__event-list">{state?.events.map((item, index) => <code key={index}>{item.event}{item.outcome ? ` · ${item.outcome}` : ''}</code>)}</div>
    <button type="button" className="hs-next__text-button" onClick={() => { window.localStorage.removeItem(nextStepsStorageKey); setRefresh(value => value + 1) }}>Reset preview records</button>
  </details>
}
export default function HomeSeekersNextSteps({ onApply, actionRef }) {
  const preview = isNextStepsLocalReview()
  const [active, setActive] = useState(null), [outcome, setOutcome] = useState(null), [qualifier, setQualifier] = useState(qualifierEmpty), [registration, setRegistration] = useState(sessionEmpty)
  const [errors, setErrors] = useState({}), [problem, setProblem] = useState(''), [receipt, setReceipt] = useState(null), [booking, setBooking] = useState(null)
  const [week, setWeek] = useState(0), [chosenSlot, setChosenSlot] = useState(''), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false)
  const attempt = useRef(null), working = useRef(false)
  const sessions = previewSessions()
  const changeQualifier = (name, value) => { setQualifier(current => ({ ...current, [name]: value })); setErrors(current => ({ ...current, [name]: undefined })); setProblem('') }
  const changeRegistration = (name, value) => { setRegistration(current => ({ ...current, [name]: value })); setErrors(current => ({ ...current, [name]: undefined })); setProblem('') }
  function open(type) {
    setActive(type); setErrors({}); setProblem('')
    if (type === 'qualifier' && !outcome) {
      try { recordNextStepsPreviewEvent('qualifier_started'); setRevision(value => value + 1) } catch (error) { setProblem(error.message) }
    }
  }
  function openSession() {
    setRegistration(current => ({ ...current, ...Object.fromEntries(Object.keys(contactEmpty).map(key => [key, qualifier[key] || current[key]])), consent: false, session: current.session || sessions[0].id }))
    open('session')
  }
  useImperativeHandle(actionRef, () => ({ openSession, openQualifier: () => open('qualifier') }))
  async function submitQualifier(event) {
    event.preventDefault()
    if (working.current || !validateAndFocus(qualifier, 'qualifier', setErrors, event)) return
    working.current = true; setBusy(true); setProblem('')
    try {
      attempt.current ||= crypto.randomUUID()
      const result = saveNextStepsReview('qualifier', { ...qualifier, email: qualifier.email.trim().toLowerCase() }, { id: attempt.current })
      setReceipt(result); setOutcome(result.outcome); setRevision(value => value + 1)
    } catch (error) { setProblem(error.message) }
    finally { working.current = false; setBusy(false) }
  }
  function bookSlot() {
    if (working.current) return
    working.current = true; setBusy(true); setProblem('')
    try {
      if (!chosenSlot) throw new Error('Choose a time before confirming your booking.')
      const result = saveNextStepsReview('oneonone', { qualifierId: receipt.id, start: chosenSlot })
      setBooking(result); setRevision(value => value + 1)
    } catch (error) { setProblem(error.message); setRevision(value => value + 1) }
    finally { working.current = false; setBusy(false) }
  }
  async function submitSession(event) {
    event.preventDefault()
    if (working.current || !validateAndFocus(registration, 'session', setErrors, event)) return
    working.current = true; setBusy(true); setProblem('')
    try {
      const result = saveNextStepsReview('session', { ...registration, email: registration.email.trim().toLowerCase() })
      setBooking(result); setRevision(value => value + 1)
    } catch (error) { setProblem(error.message) }
    finally { working.current = false; setBusy(false) }
  }
  let taken = []
  try { taken = readNextStepsReview().records.filter(record => record.type === 'oneonone').map(record => record.details.start) } catch { /* The form shows an actionable storage error on submit. */ }
  const slots = outcome === 'A' ? previewFounderSlots(week) : []
  const meetingStart = booking?.type === 'session' ? booking.details.session : booking?.details.start
  const close = () => { setActive(null); setProblem('') }
  const modalTitle = booking && (active === 'session' && booking.type === 'session' || active === 'qualifier' && booking.type === 'oneonone') ? 'Your preview booking' : active === 'session' ? 'Book a seat' : outcome === 'A' ? 'You’re through.' : outcome === 'B' ? 'Thanks for being straight with us.' : outcome === 'C' ? 'Your Fidelity Fund Certificate' : 'See if you qualify'
  const showConfirmation = booking && ((active === 'session' && booking.type === 'session') || (active === 'qualifier' && booking.type === 'oneonone'))
  return <>
    <section className="hs-join__section hs-next" aria-labelledby="next-steps-title">
      <h2 id="next-steps-title">What are your next steps?</h2>
      <div className="hs-next__options">
        <article className="hs-next__founder">
          <div><p className="hs-next__eyebrow">01 · A conversation, first</p><h3>Know you want to join,<br className="hs-next__desktop-break" /> but you’ve got a few questions?</h3><p className="hs-next__founder-line">Book a one on one with the founder.</p><p className="hs-next__qualifying">Qualifying agents only. A few slots each week.</p></div>
          <button type="button" className="hs-next__button hs-next__button--dark" onClick={() => open('qualifier')} aria-haspopup="dialog">See if you qualify<ArrowRight size={18} aria-hidden="true" /></button>
        </article>
        <article className="hs-next__session">
          <div><p className="hs-next__eyebrow">02 · Listen in, privately</p><h3>Want to find out more first?</h3><p className="hs-next__summary">Fifteen minutes on the model, then your questions.</p><p className="hs-next__privacy-summary"><LockKeyhole size={15} aria-hidden="true" /><span>Camera off. Microphone off. Your name stays private.</span></p><p className="hs-next__session-date"><CalendarDays size={17} aria-hidden="true" /><span>Next session: {preview ? shortDate(sessions[0].start) : 'Dates coming soon'}{preview && <small>Sample schedule for local review</small>}</span></p></div>
          <button type="button" className="hs-next__button" onClick={openSession} aria-haspopup="dialog">Book a seat<ArrowRight size={18} aria-hidden="true" /></button>
        </article>
        <article className="hs-next__apply">
          <div><p className="hs-next__eyebrow">03 · Make your move</p><h3>Ready to join now?</h3><p className="hs-next__summary">Fill in the application. If you’re accepted we’ll have you up and running within 48 hours.</p></div>
          <button type="button" className="hs-next__button" onClick={onApply} aria-haspopup="dialog">Apply to join<ArrowRight size={18} aria-hidden="true" /></button>
        </article>
      </div>
      {preview && <><PreviewNote /><ReviewRecords revision={revision} /></>}
    </section>
    <Modal open={Boolean(active)} onClose={close} title={modalTitle} className="hs-next-modal">
      {preview ? <>
        <PreviewNote />
        {showConfirmation ? <div className="hs-next__confirmation" role="status">
          <span className="hs-next__success-icon"><Check size={26} aria-hidden="true" /></span>
          <h4>{booking.type === 'session' ? 'Your preview seat is reserved.' : 'Your preview call is booked.'}</h4>
          <p><strong>{shortDate(meetingStart)}</strong></p>
          <p>This confirmation is for local review. No real meeting, email or SMS has been sent.</p>
          <a className="hs-next__button hs-next__button--dark" href={nextStepsCalendarFile(meetingStart, booking.type === 'session' ? 'Home Seekers information session (preview)' : 'Home Seekers founder call (preview)', booking.id)} download="home-seekers-preview.ics">Download preview calendar file<CalendarDays size={17} aria-hidden="true" /></a>
          <details className="hs-next__delivery"><summary>Preview confirmation & reminders</summary><h5>Confirmation email · preview only</h5><p>Hi {booking.type === 'session' ? booking.details.firstName : qualifier.firstName}, your {booking.type === 'session' ? 'seat' : 'call'} is reserved for {shortDate(meetingStart)}.</p><p>Join link: supplied by the meeting provider before launch.</p><h5>Reminder schedule · email and SMS</h5><ul>{[24, 1].map(hours => { const when = new Date(new Date(meetingStart).getTime() - hours * 3600000); return <li key={hours}>{hours} {hours === 1 ? 'hour' : 'hours'} before: {shortDate(when)}{when < new Date() ? ' · already passed, would not be sent' : ' · preview only, not queued'}</li> })}</ul><p>The production email will include the join link and calendar attachment.</p></details>
          <button type="button" className="hs-next__text-button" onClick={close}>Done</button>
        </div> : active === 'session' ? <>
          <div className="hs-next__session-copy"><h4>Want to find out more first?</h4><p>We run a short information session every Thursday at 18:00 SAST <strong>(sample schedule)</strong>. About fifteen minutes on how the model works and what it costs, then I answer whatever you want to ask.</p><p>It’s completely private. Your camera and microphone stay off. Nobody on the call can see you, hear you, or see your name. The only person anyone sees is me. Questions go in writing, and nobody knows they came from you.</p><p>Nothing to sign, nothing to pay, no presentation. If you want to take it further afterwards you can book a private call.</p><p className="hs-next__privacy"><LockKeyhole size={18} aria-hidden="true" />Webinar privacy settings must be verified before launch.</p></div>
          <form onSubmit={submitSession} noValidate aria-label="Information session registration">
            <div className="hs-next__fields"><ContactFields values={registration} change={changeRegistration} errors={errors} />
              <Field name="salesBand" label="Registered sales in the last 12 months" options={sessionSalesOptions} value={registration.salesBand} onChange={changeRegistration} error={errors.salesBand} />
              <Field name="area" label="Which area do you work in?" maxLength={120} value={registration.area} onChange={changeRegistration} error={errors.area} />
              <Field name="session" label="Which session?" options={sessions.map(session => ({ ...session, label: shortDate(session.start) }))} value={registration.session} onChange={changeRegistration} error={errors.session} />
              <Field name="question" label="What do you most want me to cover?" value={registration.question} onChange={changeRegistration} optional />
            </div>
            <Consent checked={registration.consent} onChange={changeRegistration} error={errors.consent} />
            {problem && <p className="hs-next__error" role="alert">{problem}</p>}
            <button type="submit" className="hs-next__button hs-next__button--dark" disabled={busy}>{busy ? 'Saving…' : 'Book a seat'}<ArrowRight size={18} aria-hidden="true" /></button>
          </form>
        </> : !outcome ? <>
          <p className="hs-next__intro">A few details to see whether our fixed-fee model makes sense for you. We’ll only show the calendar if you qualify.</p>
          <form onSubmit={submitQualifier} noValidate aria-label="Founder call qualifier">
            <div className="hs-next__fields"><ContactFields values={qualifier} change={changeQualifier} errors={errors} />
              <Field name="ffc" label="Do you hold a valid Fidelity Fund Certificate?" options={['Yes', 'No', 'Application in progress']} value={qualifier.ffc} onChange={changeQualifier} error={errors.ffc} />
              <Field name="sales" label="Registered sales in the last 12 months" type="number" min="0" max="9999" step="1" inputMode="numeric" value={qualifier.sales} onChange={changeQualifier} error={errors.sales} />
              <Field name="value" label="Total value of property sold in the last 12 months (R)" type="number" min="0" max="999999999999" step="0.01" inputMode="decimal" placeholder="e.g. 6000000" value={qualifier.value} onChange={changeQualifier} error={errors.value} />
              <Field name="area" label="Which area do you work in?" maxLength={120} value={qualifier.area} onChange={changeQualifier} error={errors.area} />
              <Field name="split" label="What are you on at the moment?" options={splitOptions} value={qualifier.split} onChange={changeQualifier} error={errors.split} />
            </div>
            <Consent checked={qualifier.consent} onChange={changeQualifier} error={errors.consent} />
            {problem && <p className="hs-next__error" role="alert">{problem}</p>}
            <button type="submit" className="hs-next__button hs-next__button--dark" disabled={busy}>{busy ? 'Saving…' : 'Continue'}<ArrowRight size={18} aria-hidden="true" /></button>
          </form>
        </> : outcome === 'A' ? <div className="hs-next__calendar">
          <p className="hs-next__lead">Pick a time below and we’ll talk properly.</p><p>It’s half an hour, it’s just me, and there’s nothing to sign. Come with the questions you actually want answered.</p>
          <div className="hs-next__week"><button type="button" disabled={week === 0} onClick={() => { setWeek(value => value - 1); setChosenSlot(''); setProblem('') }} aria-label="Previous week"><ChevronLeft size={18} /></button><span>{week === 0 ? 'This week' : week === 1 ? 'Next week' : `${week} weeks ahead`}<small>Up to 8 slots per week · South African time</small></span><button type="button" disabled={week === 4} onClick={() => { setWeek(value => value + 1); setChosenSlot(''); setProblem('') }} aria-label="Next week"><ChevronRight size={18} /></button></div>
          <fieldset className="hs-next__slots"><legend>Choose a 30-minute time slot</legend>{slots.length ? slots.map(slot => <label key={slot.id} className={taken.includes(slot.id) ? 'is-taken' : ''}><input type="radio" name="founder-slot" value={slot.id} checked={chosenSlot === slot.id} onChange={() => { setChosenSlot(slot.id); setProblem('') }} disabled={taken.includes(slot.id)} /><span>{formatNextStepDate(slot.start)}{taken.includes(slot.id) && <small>Unavailable</small>}</span></label>) : <p>No remaining slots this week. Try next week.</p>}</fieldset>
          {problem && <p className="hs-next__error" role="alert">{problem}</p>}
          <button type="button" className="hs-next__button hs-next__button--dark" onClick={bookSlot} disabled={!chosenSlot || busy}>Confirm preview booking<ArrowRight size={18} aria-hidden="true" /></button>
        </div> : <div className="hs-next__outcome" role="status">
          {outcome === 'B' ? <><p>Our bar is five registered sales or R6 million of property in the last twelve months, and you’re under it at the moment. I’m not going to put you in front of a calendar and sell you something that would cost you more than it saves you. At your current volume a good split is probably the better deal, and I’d rather tell you that now.</p><p>Come to one of our information sessions instead. Ask whatever you want, there’s no pitch, and when you’re over the line come straight back to this page.</p></> : <><p>You’ll need a valid Fidelity Fund Certificate before you can trade with any agency in South Africa, ours included. Nothing we can do until that’s in place.</p><p>Once it’s issued, come back. In the meantime you’re welcome at our information sessions.</p></>}
          <button type="button" className="hs-next__button hs-next__button--dark" onClick={openSession}>See the next session<ArrowRight size={18} aria-hidden="true" /></button>
        </div>}
        {outcome && active === 'qualifier' && !showConfirmation && <button type="button" className="hs-next__text-button" onClick={() => { setOutcome(null); setReceipt(null); setChosenSlot(''); attempt.current = null; setProblem('') }}>Check different answers</button>}
      </> : <p role="status">Meeting and session bookings are being configured. Please check back soon.</p>}
    </Modal>
  </>
}
