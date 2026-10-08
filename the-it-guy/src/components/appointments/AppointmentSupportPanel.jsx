import { useEffect, useRef, useState } from 'react'
import { calendarSupportDeadline, readAppointmentSupport, recoverAppointmentDelivery } from '../../services/calendarSupportService'
import useAppointmentReconciliation from '../../hooks/useAppointmentReconciliation'

const stamp = value => value ? new Date(value).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }) : '—'
export default function AppointmentSupportPanel(props) {
  if (!props.organisationId || !props.appointmentId || !props.viewerKey) return null
  return <SupportDetails key={`${props.organisationId}:${props.viewerKey}:${props.appointmentId}`} {...props} />
}
function SupportDetails({ organisationId, appointmentId, appointmentRevision }) {
  const [snapshot, setSnapshot] = useState(null)
  const [readError, setReadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const active = useRef(true), pending = useRef(false), command = useRef(null)
  const { revision: refresh, reload } = useAppointmentReconciliation({ scopeKey: `${organisationId}:${appointmentId}` })
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    let current = true
    calendarSupportDeadline(readAppointmentSupport(organisationId, appointmentId)).then(data => {
      if (current) { setSnapshot(data); setReadError('') }
    }).catch(error => { if (current) setReadError(error.message) })
    return () => { current = false }
  }, [organisationId, appointmentId, appointmentRevision, refresh])
  async function recover(action, jobId = null) {
    if (pending.current || !snapshot) return
    const fingerprint = JSON.stringify({ action, jobId, revision: snapshot.revision, reason: reason.trim() })
    if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint, id: crypto.randomUUID() }
    pending.current = true; setBusy(true); setActionError(''); setFeedback('')
    try {
      const receipt = await calendarSupportDeadline(recoverAppointmentDelivery({ organisationId, appointmentId, revision: snapshot.revision,
        action, jobId, commandId: command.current.id, reason }))
      if (!active.current) return
      setFeedback(`${receipt.replayed ? 'Previous recovery verified: ' : ''}${receipt.queued} job(s) queued; ${receipt.retired} obsolete job(s) retired. Delivery will be checked by the server worker.`)
      reload()
    } catch (error) { if (active.current) setActionError(error.message) }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  return <section aria-label="Appointment support" className="grid gap-3 text-sm">
    {readError ? <p role="alert">{readError} {snapshot ? 'Showing the last verified details.' : ''} <button type="button" onClick={reload}>Retry support read</button></p> : null}
    {actionError ? <p role="alert">{actionError}</p> : null}
    {feedback ? <p role="status">{feedback}</p> : null}
    {!snapshot ? <p>Checking support details…</p> : <>
      <p>Revision {snapshot.revision} · {snapshot.status} · {stamp(snapshot.startAt)} SAST</p>
      <p>Hold expires: {stamp(snapshot.holdExpiresAt)} SAST</p>
      <p>Recovery preserves booking details and delivery history. Missing invitations need a review and an explicit new request. Calendar account recovery uses the connected calendar controls.</p>
      <label>Recovery reason<input maxLength={500} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} /></label>
      {snapshot.reconcileAllowed ? <button type="button" disabled={busy || Boolean(readError) || !reason.trim()} onClick={() => recover('reconcile')}>Reconcile future reminders</button> : null}
      <ul aria-label="Delivery receipts">{snapshot.jobs.map(job => <li key={job.id}>
        Revision {job.revision} · {job.event_kind} · {job.channel === 'email' ? job.recipient_email : 'In app'} · {job.status.replaceAll('_', ' ')} · attempt {job.attempt_count}/{job.max_attempts}
        <span className="block">Due {stamp(job.scheduled_for)} · expires {stamp(job.expires_at)}{job.support_retry_until ? ` · retry deadline ${stamp(job.support_retry_until)}` : ''} · accepted {stamp(job.accepted_at)} · delivered {stamp(job.delivered_at)} · receipt {job.provider_message_id || 'none'}</span>
        {job.last_error ? <span className="block">{job.last_error}</span> : null}
        {job.retry_allowed ? <button type="button" disabled={busy || Boolean(readError) || !reason.trim()} onClick={() => recover('retry', job.id)}>Retry eligible delivery</button> : null}
      </li>)}</ul>
      {snapshot.jobsTruncated ? <p>Only the latest 200 delivery receipts are shown. Use a scoped operator review for older receipts.</p> : null}
      <ul aria-label="Attendance responses">{snapshot.participants.map(person => <li key={person.id}>{person.name || person.email} · {person.role}{person.required ? ' · required' : ''} · {person.response} · responded {stamp(person.respondedAt)}{person.revokedAt ? ' · removed' : ''}</li>)}</ul>
      <p>Changes recorded from the monitoring release onward:</p>
      <ul aria-label="Appointment change history">{snapshot.history.map((entry, index) => <li key={`${entry.source}:${entry.created_at}:${index}`}>
        {stamp(entry.created_at)} · revision {entry.revision} · {entry.status} · {entry.changed_fields.join(', ')} · {entry.actor_id || 'server workflow'}{entry.reason ? ` · ${entry.reason}` : ''}
      </li>)}</ul>
      {snapshot.historyTruncated ? <p>Only the latest 100 changes are shown.</p> : null}
    </>}
  </section>
}
