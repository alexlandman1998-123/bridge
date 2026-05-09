function WorkloadStatusPill({ status = '' }) {
  const normalized = String(status || '').toLowerCase()
  let color = '#4f5f79'
  if (normalized.includes('overloaded')) color = '#b42318'
  else if (normalized.includes('busy')) color = '#b54708'
  else if (normalized.includes('attention')) color = '#b42318'
  else if (normalized.includes('normal')) color = '#067647'

  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '0.2rem 0.55rem',
        borderRadius: '999px',
        border: `1px solid ${color}44`,
        background: `${color}1A`,
        color,
        fontSize: '0.78rem',
        fontWeight: 600,
      }}
    >
      {status || 'Unknown'}
    </span>
  )
}

function AttorneyStaffWorkload({ rows = [] }) {
  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0 }}>Staff Workload</h3>
      {rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Staff Member</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Role</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Department</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Assigned Matters</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Delayed Matters</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.memberId}>
                  <td style={{ padding: '0.48rem 0.3rem', fontWeight: 600 }}>{row.fullName}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.role}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.departmentName}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.assignedMatters}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{row.delayedMatters}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}><WorkloadStatusPill status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="status-message" style={{ margin: 0 }}>Team members will appear here once they are added to the firm.</p>
      )}
    </section>
  )
}

export default AttorneyStaffWorkload
