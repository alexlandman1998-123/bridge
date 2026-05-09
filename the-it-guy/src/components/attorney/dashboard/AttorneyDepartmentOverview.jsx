function DepartmentStatusPill({ status = '' }) {
  const normalized = String(status || '').toLowerCase()
  const color = normalized.includes('attention') ? '#b42318' : normalized === 'active' ? '#067647' : '#4f5f79'
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

function AttorneyDepartmentOverview({ departments = [] }) {
  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0 }}>Department Overview</h3>
      {departments.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Department</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Type</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Active Matters</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Assigned Staff</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Delayed</th>
                <th style={{ textAlign: 'left', padding: '0.48rem 0.3rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((department) => (
                <tr key={department.departmentId}>
                  <td style={{ padding: '0.48rem 0.3rem', fontWeight: 600 }}>{department.departmentName}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{department.departmentType}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{department.activeMatters}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{department.assignedStaff}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}>{department.delayedMatters}</td>
                  <td style={{ padding: '0.48rem 0.3rem' }}><DepartmentStatusPill status={department.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="status-message" style={{ margin: 0 }}>Departments will appear here once your firm setup is complete.</p>
      )}
    </section>
  )
}

export default AttorneyDepartmentOverview
