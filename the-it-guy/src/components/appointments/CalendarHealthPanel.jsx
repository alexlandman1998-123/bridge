import { useEffect, useState } from 'react'
import { calendarSupportDeadline, readCalendarHealth } from '../../services/calendarSupportService'
import useAppointmentReconciliation from '../../hooks/useAppointmentReconciliation'
import AppointmentSupportPanel from './AppointmentSupportPanel'
import Modal from '../ui/Modal'

const labels = {
  delivery_overdue: 'Delivery is overdue', stalled_delivery: 'Delivery worker stopped before finishing', delivery_exhausted: 'Delivery retry limit reached',
  delivery_repeated_failure: 'Delivery keeps failing', delivery_expired: 'Delivery window was missed', obsolete_delivery: 'Obsolete delivery needs retirement',
  missing_reminder: 'A future reminder job is missing', missing_invitation: 'Invitation history needs review', schedule_inconsistent: 'Appointment times disagree',
  link_inconsistent: 'Appointment links need review', provider_disconnected: 'Calendar account needs reconnection', provider_poll_stale: 'Calendar connection has not been checked recently',
  provider_needs_review: 'An outside calendar change needs review', provider_repeated_failure: 'Calendar synchronisation keeps failing', provider_overdue: 'Calendar synchronisation is overdue',
  missing_provider_copy: 'A connected calendar copy is missing',
}
export default function CalendarHealthPanel(props) {
  if (!props.organisationId || !props.viewerKey) return null
  return <HealthBody key={`${props.organisationId}:${props.viewerKey}`} {...props} />
}
function HealthBody({ organisationId, viewerKey }) {
  const [snapshot, setSnapshot] = useState(null), [error, setError] = useState(''), [selected, setSelected] = useState(null)
  const { revision: refresh, reload } = useAppointmentReconciliation({ scopeKey: `${organisationId}:${viewerKey}`, intervalMs: 60000 })
  useEffect(() => {
    let current = true
    calendarSupportDeadline(readCalendarHealth(organisationId)).then(data => {
      if (current) { setSnapshot(data); setError('') }
    }).catch(failure => { if (current) setError(failure.message) })
    return () => { current = false }
  }, [organisationId, refresh])
  const monitor = snapshot?.monitor
  return <details className="rounded border p-3 text-sm" aria-label="Calendar health">
    <summary>Calendar health · {snapshot ? `${snapshot.issues.length}${snapshot.truncated ? '+' : ''} issue(s)` : 'checking'}</summary>
    <div className="grid gap-2 py-2">
      {error ? <p role="alert">{error} {snapshot ? 'Showing the last verified result.' : ''} <button type="button" onClick={reload}>Retry health check</button></p> : null}
      {snapshot ? <>
        <p>Managed appointments and permitted calendar connections. Last background check: {monitor.lastCheckedAt ? new Date(monitor.lastCheckedAt).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }) : 'not yet recorded'} · {monitor.status.replaceAll('_', ' ')}.</p>
        {monitor.status !== 'current' ? <p role="status">Background monitoring needs verification. The issues below were checked when this view loaded.</p> : null}
        {snapshot.issues.length === 0 ? <p>No issues found in the verified scope.</p> : <ul>{snapshot.issues.map(issue => <li key={issue.issue_key} className="py-2">
          <strong>{labels[issue.kind] || 'Calendar issue needs review'}</strong> · {issue.title || issue.evidence?.provider || 'Calendar connection'}
          {issue.inspectAllowed ? <button type="button" className="ml-2" onClick={() => setSelected(issue)}>Inspect appointment</button> : null}
          {issue.connection_id ? <p>Use the account owner's connected calendar controls to reconnect or review the copy.</p> : null}
        </li>)}</ul>}
        {snapshot.truncated ? <p>The first 100 issues are shown. Additional issues need a scoped operator review.</p> : null}
      </> : !error ? <p>Checking calendar health…</p> : null}
      {selected ? <Modal open title="Appointment support" onClose={() => setSelected(null)}><AppointmentSupportPanel organisationId={organisationId} viewerKey={viewerKey} appointmentId={selected.appointment_id} appointmentRevision={selected.revision} /></Modal> : null}
    </div>
  </details>
}
