import { Link } from 'react-router-dom'

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

function AttorneyAppointmentQueue({ rows = [], allowed = true }) {
  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0 }}>Signing / Appointment Queue</h3>
      {!allowed ? (
        <p className="status-message" style={{ margin: 0 }}>
          Your role does not currently include appointment queue access.
        </p>
      ) : rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Appointment Type</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Matter</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Client / Buyer</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Date & Time</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Attendees</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: '0.48rem 0.3rem', fontWeight: 600 }}>{row.appointmentType || 'General consultation'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.matterReference || 'Matter'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.clientName || 'Unassigned client'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.dateTime ? new Date(row.dateTime).toLocaleString() : '—'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{Array.isArray(row.attendees) && row.attendees.length ? row.attendees.join(', ') : '—'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}><AppointmentStatusBadge status={row.status} /></td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>
                    {row.actionHref ? (
                      <Link to={row.actionHref} className="header-secondary-cta" style={{ padding: '0.28rem 0.5rem' }}>
                        Open Matter
                      </Link>
                    ) : (
                      <span className="status-message">Unavailable</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="status-message" style={{ margin: 0 }}>No appointments scheduled yet.</p>
      )}
    </section>
  )
}

export default AttorneyAppointmentQueue
