function AttorneyRoleModeBadge({ roleLabel = '', department = '' }) {
  return (
    <div style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: '999px',
          border: '1px solid rgba(15,76,129,0.24)',
          background: 'rgba(15,76,129,0.10)',
          color: '#0f4c81',
          fontSize: '0.78rem',
          fontWeight: 600,
          padding: '0.22rem 0.58rem',
        }}
      >
        {roleLabel || 'Attorney User'}
      </span>
      {department ? (
        <span className="status-message" style={{ margin: 0 }}>{department}</span>
      ) : null}
    </div>
  )
}

export default AttorneyRoleModeBadge
