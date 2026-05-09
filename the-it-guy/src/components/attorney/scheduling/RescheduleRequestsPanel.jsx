function formatDateTime(value) {
  const parsed = new Date(value || '')
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function RescheduleRequestsPanel({ rows = [], onPropose = null, onResolve = null }) {
  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0 }}>Reschedule Requests</h3>
      {!rows.length ? (
        <p className="status-message" style={{ margin: 0 }}>No pending reschedule requests.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.55rem' }}>
          {rows.map((row) => (
            <article key={row.requestId} style={{ border: '1px solid #dce6f2', borderRadius: '12px', padding: '0.65rem', display: 'grid', gap: '0.4rem' }}>
              <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700 }}>{row.appointmentType} · {row.matterReference}</p>
              <p className="status-message" style={{ margin: 0 }}>
                Requested by {row.requestedByRole || 'participant'} · Preferred {formatDateTime(row.preferredStart)}
              </p>
              {row.reason ? <p style={{ margin: 0, fontSize: '0.76rem', color: '#5f7690' }}>{row.reason}</p> : null}
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <button type="button" className="header-secondary-cta" onClick={() => onPropose?.(row)}>
                  Propose Slot
                </button>
                <button type="button" className="header-secondary-cta" onClick={() => onResolve?.(row, 'accepted')}>
                  Approve
                </button>
                <button type="button" className="header-secondary-cta" onClick={() => onResolve?.(row, 'rejected')}>
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default RescheduleRequestsPanel
