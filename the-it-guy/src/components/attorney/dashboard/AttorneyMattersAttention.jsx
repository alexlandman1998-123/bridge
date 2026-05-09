import { Link } from 'react-router-dom'

function AttorneyMattersAttention({ rows = [] }) {
  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0 }}>Matters Requiring Attention</h3>
      {rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Matter / Transaction</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Client / Buyer</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Department</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Current Stage</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Assigned User</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Issue</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Last Updated</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.matterId}>
                  <td style={{ padding: '0.48rem 0.3rem', fontWeight: 600 }}>{row.matterReference || 'Matter'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.clientName || 'Unassigned client'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.department || '—'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.currentStage || 'Unknown'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.assignedUser || 'Unassigned'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.issue || '—'}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>
                    {row.lastUpdated ? new Date(row.lastUpdated).toLocaleDateString() : '—'}
                  </td>
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
        <p className="status-message" style={{ margin: 0 }}>No matters need attention yet.</p>
      )}
    </section>
  )
}

export default AttorneyMattersAttention
