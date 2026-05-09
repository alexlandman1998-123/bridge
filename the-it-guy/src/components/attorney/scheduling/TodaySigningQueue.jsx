import { Link } from 'react-router-dom'
import AppointmentReadinessCard from './AppointmentReadinessCard'
import AppointmentCalendarActions from '../../appointments/AppointmentCalendarActions'

function toDateLabel(value) {
  const parsed = new Date(value || '')
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function TodaySigningQueue({
  rows = [],
  resources = [],
  staffOptions = [],
  onResourceAssign = null,
  onStaffAssign = null,
  onMarkCompleted = null,
  onOpenReschedule = null,
  onResendCommunication = null,
}) {
  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Today&apos;s Signings</h3>
        <span className="status-message" style={{ margin: 0 }}>{rows.length} scheduled</span>
      </div>

      {!rows.length ? (
        <p className="status-message" style={{ margin: 0 }}>No signing appointments for today.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          {rows.map((row) => (
            <article key={row.id} style={{ border: '1px solid #dce6f2', borderRadius: '14px', padding: '0.75rem', display: 'grid', gap: '0.55rem', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: '0.22rem' }}>
                  <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 700 }}>{row.appointmentType || 'Signing appointment'}</p>
                  <p style={{ margin: 0, fontSize: '0.76rem', color: '#50667f' }}>{row.matterReference || 'Matter'} · {row.clientName || 'Client'}</p>
                  <p style={{ margin: 0, fontSize: '0.76rem', color: '#50667f' }}>{toDateLabel(row.dateTime)} · {row.resourceName || 'No boardroom allocated'}</p>
                </div>
                <div style={{ display: 'grid', gap: '0.35rem', minWidth: '210px' }}>
                  <AppointmentReadinessCard readiness={row.readiness} />
                  <span className="status-message" style={{ margin: 0 }}>
                    Status: <strong>{row.operationalStatusLabel || row.status || 'Pending'}</strong>
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                <label style={{ display: 'grid', gap: '0.3rem' }}>
                  <span className="status-message">Boardroom / Resource</span>
                  <select
                    className="input"
                    value={row.resourceId || ''}
                    onChange={(event) => onResourceAssign?.(row, event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {(resources || []).map((resource) => (
                      <option key={resource.resourceId} value={resource.resourceId}>{resource.resourceName}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: '0.3rem' }}>
                  <span className="status-message">Signing Secretary</span>
                  <select
                    className="input"
                    value={row.assignedSecretaryId || ''}
                    onChange={(event) => onStaffAssign?.(row, { role: 'conveyancing_secretary', userId: event.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {(staffOptions || []).map((member) => (
                      <option key={member.value} value={member.value}>{member.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
                {row.actionHref ? (
                  <Link to={row.actionHref} className="header-secondary-cta" style={{ padding: '0.3rem 0.55rem' }}>
                    Open Transaction
                  </Link>
                ) : null}
                {row.transactionId ? (
                  <Link to={`/transactions/${row.transactionId}`} className="header-secondary-cta" style={{ padding: '0.3rem 0.55rem' }}>
                    Open Documents
                  </Link>
                ) : null}
                <button type="button" className="header-secondary-cta" onClick={() => onMarkCompleted?.(row)}>
                  Mark Complete
                </button>
                <button type="button" className="header-secondary-cta" onClick={() => onOpenReschedule?.(row)}>
                  Reschedule
                </button>
                <button type="button" className="header-secondary-cta" onClick={() => onResendCommunication?.(row, 'confirmation')}>
                  Resend Confirmation
                </button>
                <button type="button" className="header-secondary-cta" onClick={() => onResendCommunication?.(row, 'calendar')}>
                  Resend Calendar Invite
                </button>
                <button type="button" className="header-secondary-cta" onClick={() => onResendCommunication?.(row, 'portal')}>
                  Resend Portal Link
                </button>
                <button type="button" className="header-secondary-cta" onClick={() => onResendCommunication?.(row, 'documents')}>
                  Resend Doc Reminder
                </button>
                {row.attendeesDetailed?.find?.((participant) => String(participant?.email || '').trim())?.email ? (
                  <a
                    href={`mailto:${row.attendeesDetailed.find((participant) => String(participant?.email || '').trim())?.email}`}
                    className="header-secondary-cta"
                  >
                    Contact Client
                  </a>
                ) : null}
              </div>

              <AppointmentCalendarActions
                appointment={{
                  appointmentId: row.id,
                  appointmentType: row.appointmentTypeKey,
                  title: row.appointmentType,
                  dateTime: row.dateTime,
                  location: row.location,
                  status: row.status,
                  visibility: row.visibility || 'shared_role_players',
                  instructions: row.instructions || '',
                  transactionReference: row.matterReference,
                  participants: Array.isArray(row.attendeesDetailed) ? row.attendeesDetailed : [],
                  requiredDocuments: Array.isArray(row.requiredDocuments) ? row.requiredDocuments : [],
                }}
                compact
                preferServerGeneration
              />
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default TodaySigningQueue
