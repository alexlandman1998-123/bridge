import { calendarDeliveryLabel } from '../../core/appointments/calendarDeliveryLabels'
import AppointmentSupportPanel from './AppointmentSupportPanel'
import { useState } from 'react'
import { readCalendarDeliveryJobs } from '../../services/appointmentNotificationService'
import useCalendarRead from '../../hooks/useCalendarRead'

export default function AppointmentDeliveryStatus({ appointment, viewerKey = '' }) {
  const [supportKey, setSupportKey] = useState(null)
  const id = appointment?.appointmentId
  const revision = appointment?.calendarRevision
  const managed = appointment?.calendarDeliveryManaged === true
  const key = `${viewerKey}:${appointment?.organisationId}:${id}:${revision}`
  const { data: rows, error, reload } = useCalendarRead({
    scopeKey: `${viewerKey}:${appointment?.organisationId}:${id}`, revision, enabled: managed && Boolean(id),
    read: async signal => (await readCalendarDeliveryJobs(id, { signal })).filter(row => row.revision === revision || (row.status !== 'superseded' && /^(reminder:|time_change:)/.test(row.event_kind))),
  })
  if (!managed) return null
  return <section aria-label="Appointment delivery" className="grid gap-2 text-sm">
    <p className="font-semibold">Delivery status</p>
    {appointment.listingViewingRoundNumber ? <p>Viewing invitations are tracked in the viewing workflow.</p> : null}
    {error ? <p role="alert">Delivery status could not be verified. <button type="button" onClick={reload}>Retry</button></p> : null}
    {rows === null ? <p>Checking delivery…</p> : rows.length === 0 ? <p>No delivery jobs for this appointment.</p> : <ul>
      {rows.map(row => <li key={row.id}>
        {calendarDeliveryLabel(row.event_kind)} · {row.channel === 'email' ? row.recipient_email : 'In app'} · {row.status.replaceAll('_', ' ')}
        {row.status === 'failed' ? ` · ${row.last_error || 'Delivery needs attention.'}` : ''}
      </li>)}
    </ul>}
    {appointment.organisationId && viewerKey ? <details key={key} onToggle={event => setSupportKey(event.currentTarget.open ? key : null)}>
      <summary>Support details</summary>
      {supportKey === key ? <AppointmentSupportPanel organisationId={appointment.organisationId} appointmentId={id} appointmentRevision={revision} viewerKey={viewerKey} /> : null}
    </details> : null}
  </section>
}
