import { useEffect, useRef, useState } from 'react'
import { CalendarClock, ChevronRight, X } from 'lucide-react'
import useCalendarRead from '../../hooks/useCalendarRead'
import { changeCalendarTime, readCalendarTimeChange } from '../../services/calendarTimeChangeService'
import { appointmentLocalParts, appointmentLocalToIso, resolveAppointmentSchedule } from '../../core/appointments/appointmentTime'
import './appointment-time-change.css'

const labels = { pending: 'New time requested', proposed: 'New time proposed', accepted: 'New time confirmed', rejected: 'Current time kept', cancelled: 'Request closed' }
const eventLabels = { requested: 'Requested a new time', proposed: 'Proposed a replacement', accepted: 'Accepted the new time', declined_proposal: 'Declined the new time', confirmed: 'New time confirmed', declined: 'Current time kept', withdrawn: 'Request withdrawn', expired: 'Request expired', cancelled: 'Request closed', counter_requested: 'Suggested another time' }
function format(value, timezone, allDay = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Time not provided'
  return new Date(value).toLocaleString('en-ZA', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    ...(allDay ? {} : { hour: '2-digit', minute: '2-digit' }) }) + (allDay ? ' · All day' : '')
}
function feedback(action, next) {
  if (action === 'request') return 'New time requested. Your current booking stays in place.'
  if (action === 'propose') return next.active ? 'New time proposed. Waiting for required attendees to approve.' : 'Appointment time updated.'
  if (action === 'accept') return next.active ? 'Your approval is recorded. Waiting for the remaining required attendees.' : 'The new appointment time is confirmed.'
  if (action === 'withdraw') return 'Request withdrawn. The current booking stays in place.'
  return next.active ? 'Your response is recorded.' : 'The current appointment time has been kept.'
}
// Changing viewers or appointments unmounts all transient form/command state.
export default function AppointmentTimeChange({ appointment, actor, onChanged }) {
  const scope = `${appointment.organisationId}:${actor.id}:${appointment.appointmentId}`
  return <TimeChangePanel key={scope} scope={scope} appointment={appointment} actor={actor} onChanged={onChanged} />
}
function TimeChangePanel({ scope, appointment, actor, onChanged }) {
  const id = appointment.appointmentId
  const schedule = resolveAppointmentSchedule(appointment, { strict: false })
  const read = useCalendarRead({ scopeKey: scope, revision: appointment.calendarRevision, enabled: Boolean(id && actor.id),
    read: signal => readCalendarTimeChange(id, { signal }) })
  const [saved, setSaved] = useState(null)
  const state = saved && (!read.data || saved.revision >= read.data.revision) ? saved : read.data
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [needsRefresh, setNeedsRefresh] = useState(null)
  const [clock, setClock] = useState(Date.now)
  const pending = useRef(false)
  const command = useRef(null)
  const formElement = useRef(null)
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const active = state?.active
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setClock(Date.now()), 15000)
    return () => clearInterval(timer)
  }, [active])
  const expiry = active?.status === 'proposed' ? active.hold_expires_at : active?.request_expires_at
  const expired = Boolean(active && expiry && Date.parse(expiry) <= clock)
  const own = Boolean(active && (active.requested_by === actor.id || (state.selfParticipantId && active.participant_id === state.selfParticipantId)))
  const visibleForm = form && (form.mode === 'request' ? state?.canRequest && !active : state?.canManage && active?.status === 'pending') ? form : null
  const formMode = visibleForm?.mode
  useEffect(() => { if (formMode) formElement.current?.querySelector('input')?.focus() }, [formMode])
  const stale = state && Number(appointment.calendarRevision) > state.revision
  const refreshRequired = needsRefresh !== null && state?.revision === needsRefresh
  const disabled = busy || Boolean(read.error) || stale || refreshRequired || expired
  function openForm(mode) {
    setError(''); setMessage('')
    const preferred = appointmentLocalParts(active?.preferred_start || schedule.dateTime, schedule.timezone)
    setForm({ mode, date: preferred.date, time: preferred.time.slice(0, 5), reason: '' })
  }
  async function run(action, preferredStart = null, reason = null) {
    if (pending.current || !state || disabled) return
    const fingerprint = JSON.stringify([state.revision, action, active?.id, preferredStart, reason?.trim() || null])
    if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint, id: crypto.randomUUID() }
    pending.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const next = await changeCalendarTime({ appointmentId: id, expectedRevision: state.revision, commandId: command.current.id,
        action, requestId: active?.id, preferredStart, reason })
      if (!live.current) return
      setSaved(next); setForm(null); command.current = null; setNeedsRefresh(null); setMessage(feedback(action, next))
      // The command already returns verified state; only the parent schedule needs refreshing.
      onChanged?.(next)
    } catch (failure) {
      if (live.current) {
        setError(failure.message || 'The time change could not be saved.')
        if (failure.code === '40001') setNeedsRefresh(state.revision)
      }
    } finally { pending.current = false; if (live.current) setBusy(false) }
  }
  function submit(event) {
    event.preventDefault()
    try {
      const start = appointmentLocalToIso(form.date, schedule.allDay ? '00:00' : form.time, schedule.timezone)
      if (!start || Date.parse(start) <= Date.now()) throw new Error('Choose a future date and time.')
      if (Date.parse(start) === Date.parse(schedule.dateTime)) throw new Error('Choose a time different from the current booking.')
      const end = Date.parse(start) + Date.parse(schedule.endDateTime) - Date.parse(schedule.dateTime)
      if (!schedule.allDay && appointmentLocalParts(new Date(end), schedule.timezone).date !== form.date) throw new Error('Choose an earlier time so the appointment ends on the same day.')
      void run(form.mode, start, form.reason)
    } catch (failure) { setError(failure.message) }
  }
  function person(event) {
    if (event.actor_id === actor.id || (state.selfParticipantId && event.participant_id === state.selfParticipantId)) return 'You'
    const attendee = appointment.participants?.find(row => (event.participant_id && (row.participantId || row.participant_id) === event.participant_id)
      || (event.actor_id && (row.userId || row.user_id) === event.actor_id))
    return attendee?.name || (event.actor_id ? 'Team member' : event.participant_id ? 'Attendee' : '')
  }
  if (!state) return <section className="atc" aria-label="Change appointment time">
    {read.error ? <><p className="atc-muted" role="alert">{read.error}</p><button type="button" className="atc-secondary" onClick={read.reload}>Retry time changes</button></>
      : <p className="atc-muted" role="status">Checking time-change requests…</p>}
  </section>
  if (!state.supported) return null
  return <section className="atc" aria-label="Change appointment time" aria-busy={busy}>
    {message ? <p className="atc-feedback" role="status">{message}</p> : null}
    {active ? <div className="atc-request"><CalendarClock aria-hidden="true" /><div className="atc-request-body">
      <h4>{expired ? 'Time-change request expired' : labels[active.status]}</h4>
      <p className="atc-preferred">{format(active.preferred_start, schedule.timezone, schedule.allDay)}{!schedule.allDay && active.preferred_end ? ` – ${new Date(active.preferred_end).toLocaleTimeString('en-ZA', { timeZone: schedule.timezone, hour: '2-digit', minute: '2-digit' })}` : ''}</p>
      <small>{expired ? 'The current booking stays in place. Refresh after the background expiry check.' : active.status === 'pending'
        ? 'Awaiting organiser review. The current booking stays in place.' : 'Awaiting required attendees. The current booking stays in place.'}</small>
      {active.reason ? <p className="atc-message">{active.reason}</p> : null}
      {!expired && expiry ? <small>Respond before {format(expiry, schedule.timezone)}</small> : null}
      {active.status === 'proposed' && state.selfProposalResponse === 'Accepted' ? <p className="atc-muted">You have accepted this time.</p> : null}
      {!expired && !visibleForm ? <div className="atc-actions">
        {state.canManage && active.status === 'pending' ? <>
          <button type="button" disabled={disabled || !active.preferred_start} onClick={() => run('propose', active.preferred_start)}>Propose this time</button>
          <button type="button" disabled={disabled} onClick={() => openForm('propose')}>Suggest another time</button>
          <button type="button" disabled={disabled} onClick={() => run('decline')}>Keep current time</button>
        </> : null}
        {active.status === 'proposed' && state.selfParticipantId && state.selfProposalResponse !== 'Accepted' ? <>
          <button type="button" disabled={disabled} onClick={() => run('accept')}>Accept new time</button>
          <button type="button" disabled={disabled} onClick={() => run('decline_proposal')}>Decline new time</button>
        </> : null}
        {own || state.canManage ? <button type="button" disabled={disabled} onClick={() => run('withdraw')}>Withdraw request</button> : null}
      </div> : null}
    </div></div> : state.canRequest && !visibleForm ? <button type="button" className="atc-start" disabled={disabled} onClick={() => openForm('request')}>
      <CalendarClock aria-hidden="true" />Request a new time<ChevronRight aria-hidden="true" /></button> : null}
    {visibleForm && !expired ? <form ref={formElement} className="atc-form" onSubmit={submit} aria-label={form.mode === 'propose' ? 'Suggest another time' : 'Request a new time'}>
      <div className="atc-form-head"><h4>{form.mode === 'propose' ? 'Suggest another time' : 'Request a new time'}</h4>
        <button type="button" aria-label="Close time-change form" disabled={busy} onClick={() => { setForm(null); setError('') }}><X size={16} /></button></div>
      <p className="atc-muted">Current booking: {format(schedule.dateTime, schedule.timezone, schedule.allDay)}. Duration stays the same.</p>
      <fieldset disabled={disabled}>
        <div className="atc-fields"><label>Preferred date<input type="date" disabled={disabled} required value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label>
          {!schedule.allDay ? <label>Preferred time<input type="time" disabled={disabled} required value={form.time} onChange={event => setForm({ ...form, time: event.target.value })} /></label> : null}</div>
        <label>Message (optional)<textarea disabled={disabled} rows={2} maxLength={1000} value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} /></label>
        <p className="atc-muted">{schedule.timezone} · The existing appointment stays booked until a replacement is agreed.</p>
        <button type="submit" disabled={disabled}>{busy ? 'Saving…' : form.mode === 'propose' ? 'Propose new time' : 'Send request'}</button>
      </fieldset>
    </form> : null}
    {error || read.error || stale ? <p className="atc-error" role="alert">{error || read.error || 'The appointment changed. Refresh before continuing.'} <button type="button" onClick={read.reload}>Refresh time changes</button></p> : null}
    {expired ? <button type="button" className="atc-secondary" onClick={read.reload}>Refresh time changes</button> : null}
    {state.history.length ? <details className="atc-history"><summary>Time-change history</summary><ol>
      {state.events?.length ? state.events.slice(0, 10).map(event => <li key={event.id}><span><strong>{eventLabels[event.action] || 'Request updated'}</strong><small>{person(event)}</small></span><time>{format(event.created_at, schedule.timezone)}</time></li>)
        : state.history.slice(0, 5).map(row => <li key={row.id}><strong>{row.closed_reason === 'expired' ? 'Request expired' : row.closed_reason === 'withdrawn' ? 'Request withdrawn' : labels[row.status]}</strong><span>{format(row.preferred_start, schedule.timezone, schedule.allDay)}</span></li>)}
    </ol></details> : null}
  </section>
}
