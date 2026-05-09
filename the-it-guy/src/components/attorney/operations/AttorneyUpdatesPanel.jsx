function AttorneyUpdatesPanel({ rows = [] }) {
  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0 }}>Internal Notes & Updates</h3>
      {rows.length ? (
        <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.38rem' }}>
          {rows.map((row) => (
            <li key={row.id}>
              <span>{row.message}</span>
              <span className="status-message" style={{ marginLeft: '0.45rem' }}>
                {row.occurredAt ? `· ${new Date(row.occurredAt).toLocaleString()}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="status-message" style={{ margin: 0 }}>
          Updates will appear here as your team works on matters.
        </p>
      )}
    </section>
  )
}

export default AttorneyUpdatesPanel
