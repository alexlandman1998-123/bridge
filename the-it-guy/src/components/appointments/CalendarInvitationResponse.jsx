import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CalendarDays, Clock3 } from 'lucide-react'
import { appointmentLocalParts, appointmentLocalToIso } from '../../core/appointments/appointmentTime'
import { readCalendarInvitation, requestCalendarTimeChangeByToken, respondCalendarTimeChangeByToken } from '../../services/calendarTimeChangeService'
import { supabase } from '../../lib/supabaseClient'
import './calendar-invitation-response.css'

function describe(start, end, timezone, allDay) {
  if (!Number.isFinite(Date.parse(start))) return 'Time to be confirmed'
  const date = new Date(start).toLocaleDateString('en-ZA', {timeZone:timezone,weekday:'long',day:'numeric',month:'long',year:'numeric'})
  const clock = value => new Date(value).toLocaleTimeString('en-ZA',{timeZone:timezone,hour:'2-digit',minute:'2-digit'})
  return `${date} · ${allDay ? 'All day' : `${clock(start)} – ${clock(end)}`}`
}
// No focus polling or automatic mutations on this public capability page.
export default function CalendarInvitationResponse({ token, context, initialAction = '' }) {
  const [invitation, setInvitation] = useState(context)
  const [action, setAction] = useState(initialAction === 'reschedule' && context.can_request_time_change ? 'reschedule' : ['accept','decline'].includes(initialAction) ? initialAction : '')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [response, setResponse] = useState(null)
  const [clock, setClock] = useState(Date.now)
  const pending = useRef(false), command = useRef(null), live = useRef(true)
  useEffect(() => { live.current = true; return () => {live.current = false} }, [])
  useEffect(() => { const timer=setInterval(()=>setClock(Date.now()),15000);return ()=>clearInterval(timer) }, [])
  const change = invitation.time_change
  const expired = Boolean(change?.expires_at && Date.parse(change.expires_at) <= clock)
  const answered = ['Accepted','Declined','Proposed New Time'].includes(invitation.rsvp_status)
  const canAnswer = !response && !expired && (invitation.proposal ? !answered : !answered && !change)
  const canRequest = !response && invitation.can_request_time_change && !change
  const resolved = response && ['confirmed','declined','closed'].includes(response.outcome)
  const title = invitation.proposal ? 'Replacement Time Request' : 'Appointment Request'
  async function run(operation) {
    if (pending.current) return
    pending.current=true;setBusy(true);setError('')
    try { await operation() }
    catch(failure) {if(live.current)setError(failure.message || 'Your response could not be saved. Please retry.')}
    finally {pending.current=false;if(live.current)setBusy(false)}
  }
  async function refresh() {
    await run(async()=>{
      const next=await readCalendarInvitation(token)
      if(next.managed!==true) throw new Error('Open the latest invitation to respond to this appointment.')
      if(live.current){setInvitation(next);setResponse(null);setMessage('');setAction('');setClock(Date.now())}
    })
  }
  async function withdraw() {
    await run(async()=>{
      const next=await requestCalendarTimeChangeByToken(token,{appointmentId:invitation.appointment_id,withdrawRequestId:change.id})
      if(live.current){setInvitation(next);setAction('');setMessage('Your request was withdrawn. The current appointment stays booked.')}
    })
  }
  async function submit(event) {
    event.preventDefault()
    if(pending.current || expired) return
    await run(async()=>{
      if(action==='reschedule') {
        if(!canRequest) throw new Error('A time-change request is already awaiting a decision. Refresh before continuing.')
        const start=appointmentLocalToIso(date,invitation.all_day ? '00:00' : time,invitation.timezone)
        if(Date.parse(start)<=Date.now()) throw new Error('Choose a future date and time.')
        if(Date.parse(start)===Date.parse(invitation.original_start || invitation.date_time)) throw new Error('Choose a different time from the current booking.')
        const end=Date.parse(start)+Date.parse(invitation.original_end || invitation.end_date_time)-Date.parse(invitation.original_start || invitation.date_time)
        if(!invitation.all_day && appointmentLocalParts(new Date(end),invitation.timezone).date!==date) throw new Error('Choose an earlier time so the appointment ends on the same day.')
        const next=await requestCalendarTimeChangeByToken(token,{appointmentId:invitation.appointment_id,preferredStart:start,reason})
        if(live.current){setInvitation(next);setAction('');setMessage('Your new time request was sent to the organiser. The current booking stays in place.')}
        return
      }
      if(!canAnswer || !['accept','decline'].includes(action)) throw new Error('Choose a response before submitting.')
      const status=action==='accept'?'Accepted':'Declined'
      if(invitation.proposal) {
        const fingerprint=JSON.stringify([invitation.proposal_id,invitation.proposal_revision,status])
        if(command.current?.fingerprint!==fingerprint)command.current={fingerprint,id:crypto.randomUUID()}
        const saved=await respondCalendarTimeChangeByToken(token,{appointmentId:invitation.appointment_id,requestId:invitation.proposal_id,
          proposalRevision:invitation.proposal_revision,commandId:command.current.id,status})
        if(live.current){setResponse(saved);setAction('');command.current=null;setMessage(saved.outcome==='confirmed'?'The new appointment time is confirmed.':saved.outcome==='closed'?'Your earlier response was recorded. This time-change request is now closed.':saved.outcome==='declined'?'The proposed time was declined. The original appointment stays booked.':status==='Accepted'?'Your acceptance is recorded. The original time stays booked while the remaining required attendees respond.':'Your response is recorded. Required attendees still need to agree on the new time.')}
      } else {
        const result=await supabase.rpc('submit_appointment_rsvp',{p_token:token,p_rsvp_status:status,p_proposed_new_time:null,p_preferred_end:null,p_rsvp_comment:null})
        if(result.error)throw result.error
        const saved=Array.isArray(result.data)?result.data[0]:null
        if(saved?.participant_id!==invitation.participant_id || saved.appointment_id!==invitation.appointment_id || saved.rsvp_status!==status) throw new Error('This appointment response could not be verified. Refresh before trying again.')
        if(live.current){setInvitation(previous=>({...previous,rsvp_status:status}));setAction('');setMessage(status==='Accepted'?'Your attendance is confirmed.':'Your response has been recorded.')}
      }
    })
  }
  return <main className="cir-page"><section className="cir-card" aria-busy={busy}>
    <p className="cir-eyebrow">Arch9 · Appointment</p><h1>{title}</h1><h2>{invitation.title || 'Appointment'}</h2>
    <div className="cir-booking"><CalendarDays aria-hidden="true"/><div><span>{response?.outcome==='confirmed'?'Confirmed new time':resolved?'Current booking':invitation.proposal ? 'Proposed replacement' : 'Current booking'}</span><p>{describe(resolved?response.dateTime:invitation.date_time,resolved?response.endDateTime:invitation.end_date_time,invitation.timezone,invitation.all_day)}</p></div></div>
    {invitation.proposal ? <div className="cir-original"><Clock3 aria-hidden="true"/><p>Original booking: {describe(invitation.original_start,invitation.original_end,invitation.timezone,invitation.all_day)}. {response?.outcome==='confirmed'?'The booking moved after every required attendee approved.':'The original appointment stays reserved until every required attendee approves this replacement.'}</p></div> : null}
    {invitation.location || invitation.meeting_url ? <p className="cir-location">{invitation.meeting_url || invitation.location}</p> : null}
    {change?.status==='pending' ? <div className="cir-notice"><CalendarClock aria-hidden="true"/><div><h3>{expired?'Time-change request expired':'New time requested'}</h3><p>{describe(change.preferred_start,change.preferred_end,invitation.timezone,invitation.all_day)}</p><p>{expired?'The original booking stays in place. Refresh after the background expiry check.':'Awaiting organiser review. The current booking stays in place.'}</p>{change.mine && !expired ? <button type="button" disabled={busy} onClick={withdraw}>Withdraw request</button>:null}</div></div>:null}
    {expired && change?.status==='proposed' ? <p role="status">This proposed time has expired. The original booking stays in place.</p>:null}
    {message ? <p className="cir-success" role="status">{message}</p>:!canAnswer && !change && !response ? <p className="cir-success" role="status">{invitation.rsvp_status==='Accepted'?'Your attendance is confirmed.':'Your response has been recorded.'}</p>:invitation.proposal && answered && !response ? <p className="cir-success" role="status">Your response to this proposal is recorded. The original booking stays in place until all required attendees agree.</p>:null}
    {!response && !expired && (canAnswer || canRequest) ? <form onSubmit={submit} aria-label="Appointment response">
      {canAnswer ? <div className="cir-choices"><button type="button" disabled={busy} aria-pressed={action==='accept'} onClick={()=>setAction('accept')}>{invitation.proposal?'Accept proposed time':'Accept appointment'}</button><button type="button" disabled={busy} aria-pressed={action==='decline'} onClick={()=>setAction('decline')}>{invitation.proposal?'Decline proposed time':'Decline'}</button></div>:null}
      {canRequest && action!=='reschedule' ? <button className="cir-link" type="button" disabled={busy} onClick={()=>{setAction('reschedule');setError('')}}>Request another time</button>:null}
      {action==='reschedule' && canRequest ? <fieldset disabled={busy}><legend>Request a new time</legend><p>Duration stays the same. The current booking remains reserved.</p><div className="cir-fields"><label>Preferred date<input type="date" required value={date} onChange={event=>setDate(event.target.value)}/></label>{!invitation.all_day?<label>Preferred start time<input type="time" required value={time} onChange={event=>setTime(event.target.value)}/></label>:null}</div><label>Message (optional)<textarea maxLength={1000} rows={3} value={reason} onChange={event=>setReason(event.target.value)}/></label><button className="cir-link" type="button" disabled={busy} onClick={()=>setAction('')}>Cancel request</button></fieldset>:null}
      {(action==='reschedule' ? canRequest : canAnswer && ['accept','decline'].includes(action)) ? <button className="cir-primary" type="submit" disabled={busy}>{busy?'Saving…':action==='reschedule'?'Send time request':'Submit RSVP'}</button>:null}
    </form>:null}
    {error ? <p className="cir-error" role="alert">{error}</p>:null}
    <div className="cir-footer"><small>{invitation.timezone} · Your response applies only to your invitation.</small><button className="cir-link" type="button" disabled={busy} onClick={refresh}>Refresh invitation</button><Link to="/bridge">Back to Arch9</Link></div>
  </section></main>
}
