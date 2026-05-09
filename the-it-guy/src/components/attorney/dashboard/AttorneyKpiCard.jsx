function AttorneyKpiCard({ icon: Icon, label, value, helperText = '', trendText = '' }) {
  return (
    <div className="panel card-tier-standard" style={{ display: 'grid', gap: '0.45rem', minHeight: '112px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem' }}>
        <p className="status-message" style={{ margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</p>
        {Icon ? <Icon size={16} color="#4f5f79" /> : null}
      </div>
      <p style={{ margin: 0, fontSize: '1.7rem', fontWeight: 700, lineHeight: 1.05 }}>{value}</p>
      {helperText ? <p className="status-message" style={{ margin: 0 }}>{helperText}</p> : null}
      {trendText ? <p className="status-message" style={{ margin: 0 }}>{trendText}</p> : null}
    </div>
  )
}

export default AttorneyKpiCard
