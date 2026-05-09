import { Link } from 'react-router-dom'

function MatterStatusBadge({ status = '' }) {
  const normalized = String(status || '').toLowerCase()
  let color = '#4f5f79'
  if (normalized.includes('attention') || normalized.includes('delayed')) color = '#b42318'
  else if (normalized.includes('awaiting')) color = '#b54708'
  else if (normalized.includes('track')) color = '#067647'

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

function AttorneyMatterQueue({ rows = [] }) {
  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0 }}>Matter Queue</h3>
      {rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Matter / Transaction</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Client / Buyer</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Matter Type</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Current Stage</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Assigned Role</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Last Updated</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.matterId}>
                  <td style={{ padding: '0.48rem 0.3rem', fontWeight: 600 }}>{row.matterReference || 'Matter'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.clientName || 'Unassigned client'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.matterType || '—'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.currentStage || 'Unknown'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.assignedRole || '—'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.lastUpdated ? new Date(row.lastUpdated).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}><MatterStatusBadge status={row.status} /></td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>
                    {row.actionHref ? (
                      <Link to={row.actionHref} className="header-secondary-cta" style={{ padding: '0.28rem 0.5rem' }}>
                        {row.actionLabel || 'Open Matter'}
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
        <p className="status-message" style={{ margin: 0 }}>No active matters assigned yet.</p>
      )}
    </section>
  )
}

export default AttorneyMatterQueue
