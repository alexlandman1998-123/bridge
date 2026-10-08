import { useEffect, useRef, useState } from 'react'
import { addAppointmentOutcomeAsync, setAppointmentArchiveAsync, updateAppointmentAsync, updateAppointmentParticipantRsvpAsync } from '../../lib/agencyPipelineService'
import { getAppointmentRescheduleRequests } from '../../services/appointmentRescheduleService'
import { appointmentWorkflowActions } from '../../core/appointments/appointmentWorkflow'

export default function AppointmentWorkActions({ appointment, organisationId, actor, onSaved }) {
  const [clock, setClock] = useState(Date.now())
  const actions = appointmentWorkflowActions(appointment, actor, clock)
  const isProposal = actions.state.status === 'alternative_proposed'
  const proposalKey = `${organisationId}:${actor.id}:${appointment.appointmentId}:${appointment.calendarRevision}`
  const [proposalRead, setProposalRead] = useState(null)
  const [retryProposal, setRetryProposal] = useState(0)
  const proposal = proposalRead?.key === proposalKey ? proposalRead : null
  const canAnswer = !isProposal || (proposal?.row && Date.parse(proposal.row.holdExpiresAt) > clock)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const pending = useRef(false)
  const command = useRef(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    if (!isProposal) return
    let current = true, timer
    const expectedId = actions.selfParticipant?.proposalId
    Promise.race([getAppointmentRescheduleRequests({ appointmentId:appointment.appointmentId, statuses:['proposed'], requireVerified:true }),
      new Promise((_,reject) => { timer = setTimeout(() => reject(new Error('The proposed time is taking too long to load.')),15000) })])
      .then(rows => {
        const row = rows.find(item => item.id === expectedId)
        if (!row || !row.reservationManaged || !Number.isFinite(Date.parse(row.preferredStart)) || !Number.isFinite(Date.parse(row.preferredEnd)) || !row.proposedTimezone || !Number.isFinite(Date.parse(row.holdExpiresAt))) throw new Error('The current proposed time could not be verified. Refresh before responding.')
        if (current) setProposalRead({key:proposalKey,row})
      }).catch(failure => { if (current) setProposalRead({key:proposalKey,error:failure.message}) }).finally(() => clearTimeout(timer))
    return () => {current = false;clearTimeout(timer)}
  }, [isProposal, proposalKey, appointment.appointmentId, actions.selfParticipant?.proposalId, retryProposal])
  async function run(action) {
    if (pending.current || (['accept','decline'].includes(action) && !canAnswer)) return
    if (['archive','restore'].includes(action) && !note.trim()) { setError('Give a short reason for archiving or restoring this appointment.'); return }
    const fingerprint = JSON.stringify([appointment.appointmentId, appointment.calendarRevision, appointment.archivedAt, action, note])
    if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint, id: crypto.randomUUID() }
    const payload = { expectedRevision: appointment.calendarRevision, commandId: command.current.id }
    pending.current = true; setBusy(true); setError(''); setMessage('')
    try {
      let saved
      if (['archive','restore'].includes(action)) saved = await setAppointmentArchiveAsync(organisationId, appointment.appointmentId, {
        ...payload, archive: action === 'archive', expectedArchivedAt: appointment.archivedAt || null, reason: note,
      })
      else if (['accept','decline'].includes(action)) saved = await updateAppointmentParticipantRsvpAsync(organisationId, appointment.appointmentId,
        actions.selfParticipant.participantId, { ...payload, rsvpStatus: action === 'accept' ? 'Accepted' : 'Declined', rsvpComment: note }, { actor })
      else if (['completed','no_show'].includes(action)) saved = await addAppointmentOutcomeAsync(organisationId, appointment.appointmentId,
        { ...payload, status: action, outcomeSummary: note || (action === 'completed' ? 'Appointment completed.' : 'Non-attendance recorded.') }, { actor })
      else saved = await updateAppointmentAsync(organisationId, appointment.appointmentId, {
        ...payload, ...(action === 'reissue' ? { reissueRequest: true, status: 'requested' } : { status: action }),
        ...(action === 'cancelled' ? { cancellationReason: note || 'Cancelled by the scheduling agent.' } : {}),
      }, { actor })
      if (!saved?.appointmentId) throw new Error('The appointment action could not be verified. Refresh before retrying.')
      if (!active.current) return
      command.current = null
      setMessage(['archive','restore'].includes(action) ? saved.archivedAt ? 'Appointment archived. Its history is preserved.' : 'Appointment is visible in history. Holds and messages remain closed.' : 'Appointment action saved.')
      onSaved?.(saved)
    } catch (failure) { if (active.current) setError(failure?.message || 'Unable to save this action. Refresh and retry.') }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  if (!actions.canManage && !actions.canRespond) return <p className="text-sm">You can view this appointment. The responsible agent manages its details.</p>
  return <section aria-label="Appointment actions" className="grid gap-2 text-sm [&_button]:rounded-lg [&_button]:border [&_button]:border-slate-300 [&_button]:bg-white [&_button]:px-3 [&_button]:py-2 [&_button]:disabled:opacity-50 [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:p-2" aria-busy={busy}>
    {isProposal && actions.canRespond ? <div aria-label="Proposed appointment time">
      <p>Original booking: {appointment.date} · {appointment.startTime}–{appointment.endTime} · {appointment.timezone}. It remains reserved until approval.</p>
      {proposal?.error ? <p role="alert">{proposal.error} <button type="button" onClick={() => {setProposalRead(null);setRetryProposal(value => value+1)}}>Retry proposed time</button></p> : proposal?.row ? <>
        <p>Proposed booking: {new Date(proposal.row.preferredStart).toLocaleString('en-ZA',{timeZone:proposal.row.proposedTimezone})} to {new Date(proposal.row.preferredEnd).toLocaleString('en-ZA',{timeZone:proposal.row.proposedTimezone})} · {proposal.row.proposedTimezone}{proposal.row.proposedAllDay ? ' · All day' : ''}</p>
        <p>{canAnswer ? `Respond before ${new Date(proposal.row.holdExpiresAt).toLocaleString('en-ZA',{timeZone:proposal.row.proposedTimezone})}` : 'The proposal deadline has passed. Ask the responsible agent for a new proposal.'}</p>
      </> : <p role="status">Loading proposed time…</p>}
    </div> : null}
    <label className="grid gap-1">Action note <span>(required for archive or restore)</span><textarea rows={2} value={note} disabled={busy} maxLength={1000} onChange={event => setNote(event.target.value)} /></label>
    {error ? <p role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    <div className="flex flex-wrap gap-2">
      {actions.canRespond ? <><button type="button" disabled={busy || !canAnswer} onClick={() => run('accept')}>{isProposal ? 'Accept proposed time' : 'Accept my invitation'}</button><button type="button" disabled={busy || !canAnswer} onClick={() => run('decline')}>{isProposal ? 'Decline proposed time' : 'Decline my invitation'}</button></> : null}
      {actions.canConfirm ? <button type="button" disabled={busy} onClick={() => run('confirmed')}>Confirm appointment</button> : null}
      {actions.canReissue ? <button type="button" disabled={busy} onClick={() => run('reissue')}>Issue new 24-hour request</button> : null}
      {actions.canCancel ? <button type="button" disabled={busy} onClick={() => run('cancelled')}>Cancel appointment</button> : null}
      {actions.canComplete ? <><button type="button" disabled={busy} onClick={() => run('completed')}>Mark completed</button><button type="button" disabled={busy} onClick={() => run('no_show')}>Mark no-show</button></> : null}
      {actions.canArchive ? <button type="button" disabled={busy} onClick={() => run('archive')}>Archive appointment</button> : null}
      {actions.canRestore ? <button type="button" disabled={busy} onClick={() => run('restore')}>Restore to history</button> : null}
    </div>
  </section>
}
