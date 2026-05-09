import { Link } from 'react-router-dom'

function PriorityBadge({ priority = 'Low' }) {
  const normalized = String(priority || 'Low').toLowerCase()
  const color = normalized === 'high' ? '#b42318' : normalized === 'medium' ? '#b54708' : '#067647'
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
      {priority}
    </span>
  )
}

function AttorneyPriorityQueue({ rows = [] }) {
  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0 }}>Priority Work Queue</h3>
      {rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Priority</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Matter</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Client / Buyer</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Issue</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Due Date</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Assigned Role</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: '0.48rem 0.3rem' }}><PriorityBadge priority={row.priority} /></td>
                  <td style={{ padding: '0.48rem 0.3rem', fontWeight: 600 }}>{row.matterReference || 'Matter'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.clientName || 'Unassigned client'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.issue || '—'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.assignedRole || '—'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>
                    {row.actionHref ? (
                      <Link to={row.actionHref} className="header-secondary-cta" style={{ padding: '0.28rem 0.5rem' }}>
                        {row.actionLabel || 'Open'}
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
        <p className="status-message" style={{ margin: 0 }}>No urgent actions right now.</p>
      )}
    </section>
  )
}

export default AttorneyPriorityQueue
