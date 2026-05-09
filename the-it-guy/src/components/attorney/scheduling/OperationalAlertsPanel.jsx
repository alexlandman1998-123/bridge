function OperationalAlertsPanel({ rows = [] }) {
  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0 }}>Overdue / Problem Appointments</h3>
      {!rows.length ? (
        <p className="status-message" style={{ margin: 0 }}>No operational appointment alerts.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.45rem' }}>
          {rows.map((row) => (
            <article key={row.id} style={{ border: '1px solid #f2d0ce', background: '#fff5f4', borderRadius: '12px', padding: '0.55rem 0.65rem', display: 'grid', gap: '0.22rem' }}>
              <p style={{ margin: 0, fontSize: '0.79rem', fontWeight: 700, color: '#9f3028' }}>{row.title}</p>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#7c2d26' }}>{row.description}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default OperationalAlertsPanel
