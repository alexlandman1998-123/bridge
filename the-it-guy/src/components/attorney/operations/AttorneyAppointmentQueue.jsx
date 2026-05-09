import { Link } from 'react-router-dom'
import AppointmentCalendarActions from '../../appointments/AppointmentCalendarActions'

function AppointmentStatusBadge({ status = '' }) {
  const normalized = String(status || '').toLowerCase()
  let color = '#4f5f79'
  if (normalized.includes('cancel') || normalized.includes('reschedule')) color = '#b42318'
  else if (normalized.includes('pending') || normalized.includes('requested') || normalized.includes('proposed')) color = '#b54708'
  else if (normalized.includes('confirmed') || normalized.includes('completed')) color = '#067647'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '999px',
        border: `1px solid ${color}44`,
        background: `${color}1A`,
        color,
        padding: '0.2rem 0.52rem',
        fontSize: '0.78rem',
        fontWeight: 600,
      }}
    >
      {status || 'Unknown'}
    </span>
  )
}

function isToday(value) {
  const parsed = new Date(value || '')
  if (Number.isNaN(parsed.getTime())) return false
  const now = new Date()
  return parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth() && parsed.getDate() === now.getDate()
}

function sortByDate(rows = []) {
  return [...rows].sort((a, b) => new Date(a.dateTime || 0).getTime() - new Date(b.dateTime || 0).getTime())
}

function AttorneyAppointmentQueue({ rows = [], allowed = true }) {
  const normalizedRows = sortByDate(rows)
  const todayRows = normalizedRows.filter((row) => isToday(row.dateTime))
  const upcomingRows = normalizedRows.filter((row) => !isToday(row.dateTime))
  const pendingRows = normalizedRows.filter((row) => {
    const status = String(row.status || '').toLowerCase()
    return status.includes('pending') || status.includes('proposed') || status.includes('requested')
  })
  const rescheduleRows = normalizedRows.filter((row) => {
    const status = String(row.status || '').toLowerCase()
    return status.includes('reschedule')
  })

  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Signing / Appointment Queue</h3>
        <Link to="/attorney/scheduling" className="header-secondary-cta" style={{ padding: '0.3rem 0.55rem' }}>
          Open Scheduling Workspace
        </Link>
      </div>
      {!allowed ? (
        <p className="status-message" style={{ margin: 0 }}>
          Your role does not currently include appointment queue access.
        </p>
      ) : rows.length ? (
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          <div style={{ display: 'grid', gap: '0.55rem', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <div className="panel card-tier-soft" style={{ padding: '0.55rem' }}>
              <p className="status-message" style={{ margin: 0 }}>Today&apos;s Signings</p>
              <p style={{ margin: '0.1rem 0 0 0', fontWeight: 700 }}>{todayRows.length}</p>
            </div>
            <div className="panel card-tier-soft" style={{ padding: '0.55rem' }}>
              <p className="status-message" style={{ margin: 0 }}>Upcoming</p>
              <p style={{ margin: '0.1rem 0 0 0', fontWeight: 700 }}>{upcomingRows.length}</p>
            </div>
            <div className="panel card-tier-soft" style={{ padding: '0.55rem' }}>
              <p className="status-message" style={{ margin: 0 }}>Pending Confirmations</p>
              <p style={{ margin: '0.1rem 0 0 0', fontWeight: 700 }}>{pendingRows.length}</p>
            </div>
            <div className="panel card-tier-soft" style={{ padding: '0.55rem' }}>
              <p className="status-message" style={{ margin: 0 }}>Reschedule Requests</p>
              <p style={{ margin: '0.1rem 0 0 0', fontWeight: 700 }}>{rescheduleRows.length}</p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Appointment Type</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Matter</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Workflow Stage</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Client / Buyer</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Date & Time</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Attendees</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {normalizedRows.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: '0.48rem 0.3rem', fontWeight: 600 }}>{row.appointmentType || 'General consultation'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.matterReference || 'Matter'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.linkedWorkflowStage || row.linkedWorkflow || 'General coordination'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.clientName || 'Unassigned client'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.dateTime ? new Date(row.dateTime).toLocaleString() : '—'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{Array.isArray(row.attendees) && row.attendees.length ? row.attendees.join(', ') : '—'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>
                    <AppointmentStatusBadge status={row.status} />
                    {row.latestRescheduleRequest?.preferredStart ? (
                      <p className="status-message" style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem' }}>
                        Preferred: {new Date(row.latestRescheduleRequest.preferredStart).toLocaleString()}
                      </p>
                    ) : null}
                    {row.latestRescheduleRequest?.reason ? (
                      <p className="status-message" style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem' }}>
                        {row.latestRescheduleRequest.reason}
                      </p>
                    ) : null}
                  </td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>
                    {row.actionHref ? (
                      <div style={{ display: 'grid', gap: '0.35rem' }}>
                        <Link to={row.actionHref} className="header-secondary-cta" style={{ padding: '0.28rem 0.5rem' }}>
                          Open Matter
                        </Link>
                        <AppointmentCalendarActions
                          appointment={{
                            appointmentId: row.id,
                            title: row.appointmentType,
                            appointmentTypeLabel: row.appointmentType,
                            dateTime: row.dateTime,
                            linkedWorkflowStage: row.linkedWorkflowStage || row.linkedWorkflow,
                            location: row.location || '',
                            instructions: row.instructions || '',
                            visibility: row.visibility || 'shared_role_players',
                            status: row.status,
                            matterReference: row.matterReference,
                            participants: Array.isArray(row.attendeesDetailed) ? row.attendeesDetailed : [],
                          }}
                          compact
                          preferServerGeneration
                          hideGoogleLink={false}
                          hideOutlookLink={false}
                        />
                      </div>
                    ) : (
                      <span className="status-message">Unavailable</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : (
        <p className="status-message" style={{ margin: 0 }}>No appointments scheduled yet.</p>
      )}
    </section>
  )
}

export default AttorneyAppointmentQueue
