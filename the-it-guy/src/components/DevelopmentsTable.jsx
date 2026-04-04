function formatDate(value) {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleDateString()
}

function getInitials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() || '')
    .join('')
}

function DevelopmentsTable({ rows, onRowClick }) {
  return (
    <section className="panel developments-overview-panel">
      <div className="table-header-row">
        <h3>Portfolio Overview</h3>
        <span>{rows.length} developments</span>
      </div>

      {!rows.length ? <p className="empty-text">No developments found.</p> : null}

      {rows.length ? (
        <div className="developments-card-grid">
          {rows.map((row) => {
            const sellThrough = row.totalUnits ? Math.round((row.unitsSold / row.totalUnits) * 100) : 0
            return (
              <article
                key={row.id}
                className="development-overview-card"
                onClick={() => onRowClick(row.id, row.name)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onRowClick(row.id, row.name)
                  }
                }}
                tabIndex={0}
                role="button"
              >
                <div className="development-cover-media" aria-hidden>
                  {row.coverImageUrl ? (
                    <img src={row.coverImageUrl} alt={row.name} loading="lazy" />
                  ) : (
                    <div className="development-cover-fallback">
                      <span>{getInitials(row.name) || 'DV'}</span>
                    </div>
                  )}
                  <div className="development-cover-overlay" />
                  <div className="development-cover-content">
                    <h4>{row.name}</h4>
                    <p>{row.location || row.phase || 'Development profile'}</p>
                  </div>
                </div>

                <div className="development-overview-meta">
                  <div>
                    <span>Total Units</span>
                    <strong>{row.totalUnits}</strong>
                  </div>
                  <div>
                    <span>Units Sold</span>
                    <strong>{row.unitsSold}</strong>
                  </div>
                  <div>
                    <span>In Transfer</span>
                    <strong>{row.unitsInTransfer}</strong>
                  </div>
                  <div>
                    <span>Registered</span>
                    <strong>{row.unitsRegistered}</strong>
                  </div>
                </div>

                <div className="development-overview-footer">
                  <span>Sell-through {sellThrough}%</span>
                  <span>Last Activity: {formatDate(row.lastActivity)}</span>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

export default DevelopmentsTable
