import AppointmentSupportPanel from './AppointmentSupportPanel'
import { useEffect, useState } from 'react'
import { readCalendarDeliveryJobs } from '../../services/appointmentNotificationService'
import useAppointmentReconciliation from '../../hooks/useAppointmentReconciliation'

export default function AppointmentDeliveryStatus({ appointment, viewerKey = '' }) {
  const [supportKey, setSupportKey] = useState(null)
  const id = appointment?.appointmentId
  const revision = appointment?.calendarRevision
  const managed = appointment?.calendarDeliveryManaged === true
  const [state, setState] = useState({ key: null, rows: null, error: false })
  const key = `${viewerKey}:${id}:${revision}`
  const { revision: refresh, reload } = useAppointmentReconciliation({ enabled: managed, scopeKey: key })
  useEffect(() => {
    if (!managed || !id) return
    let active = true
    let timeout
    const deadline = new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Delivery read timed out.')), 15000) })
    Promise.race([readCalendarDeliveryJobs(id), deadline]).then(rows => {
      if (active) setState({ key, rows: rows.filter(row => row.revision === revision), error: false })
    }).catch(() => {
      if (active) setState(previous => ({ key, rows: previous.key === key ? previous.rows : null, error: true }))
    }).finally(() => clearTimeout(timeout))
    return () => { active = false; clearTimeout(timeout) }
  }, [id, revision, key, managed, refresh])
  if (!managed) return null
  const rows = state.key === key ? state.rows : null
  return <section aria-label="Appointment delivery" className="grid gap-2 text-sm">
    <p className="font-semibold">Delivery status</p>
    {appointment.listingViewingRoundNumber ? <p>Viewing invitations are tracked in the viewing workflow.</p> : null}
    {state.key === key && state.error ? <p role="alert">Delivery status could not be verified. <button type="button" onClick={reload}>Retry</button></p> : null}
    {rows === null ? <p>Checking delivery…</p> : rows.length === 0 ? <p>No delivery jobs for this appointment revision.</p> : <ul>
      {rows.map(row => <li key={row.id}>
        {row.event_kind.startsWith('reminder:') ? 'Reminder' : 'Appointment update'} · {row.channel === 'email' ? row.recipient_email : 'In app'} · {row.status.replaceAll('_', ' ')}
        {row.status === 'failed' ? ` · ${row.last_error || 'Delivery needs attention.'}` : ''}
      </li>)}
    </ul>}
    {appointment.organisationId && viewerKey ? <details key={key} onToggle={event => setSupportKey(event.currentTarget.open ? key : null)}>
      <summary>Support details</summary>
      {supportKey === key ? <AppointmentSupportPanel organisationId={appointment.organisationId} appointmentId={id} appointmentRevision={revision} viewerKey={viewerKey} /> : null}
    </details> : null}
  </section>
}
