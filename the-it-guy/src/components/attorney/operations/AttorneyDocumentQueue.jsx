import { Link } from 'react-router-dom'

function DocumentStatusBadge({ status = '' }) {
  const normalized = String(status || '').toLowerCase()
  let color = '#4f5f79'
  if (normalized === 'rejected') color = '#b42318'
  else if (normalized === 'uploaded' || normalized === 'requested') color = '#b54708'
  else if (normalized === 'completed' || normalized === 'reviewed') color = '#067647'

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

function AttorneyDocumentQueue({ rows = [], allowed = true }) {
  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0 }}>Document Queue</h3>
      {!allowed ? (
        <p className="status-message" style={{ margin: 0 }}>
          Your role does not currently include document queue access.
        </p>
      ) : rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Matter</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Client / Buyer</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Document Type</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Requested From</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Last Updated</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: '0.48rem 0.3rem', fontWeight: 600 }}>{row.matterReference || 'Matter'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.clientName || 'Unassigned client'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.documentType || 'Document'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}><DocumentStatusBadge status={row.status} /></td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.requestedFrom || 'client'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.lastUpdated ? new Date(row.lastUpdated).toLocaleDateString() : '—'}</td>
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
        <p className="status-message" style={{ margin: 0 }}>No document actions yet.</p>
      )}
    </section>
  )
}

export default AttorneyDocumentQueue
