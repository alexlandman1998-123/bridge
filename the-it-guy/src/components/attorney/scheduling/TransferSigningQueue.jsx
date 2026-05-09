import { Link } from 'react-router-dom'
import AppointmentReadinessCard from './AppointmentReadinessCard'

function TransferSigningQueue({ rows = [] }) {
  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Transfer Signings</h3>
        <span className="status-message">{rows.length} appointments</span>
      </div>

      {!rows.length ? (
        <p className="status-message" style={{ margin: 0 }}>No transfer signing appointments queued.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.55rem' }}>
          {rows.map((row) => (
            <article key={row.id} style={{ border: '1px solid #dce6f2', borderRadius: '12px', padding: '0.65rem', display: 'grid', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: '0.15rem' }}>
                  <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>{row.matterReference}</p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#5f7690' }}>{row.clientName}</p>
                </div>
                <AppointmentReadinessCard readiness={row.readiness} />
              </div>
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                {(row.transferWarnings || []).map((warning) => (
                  <p key={warning} style={{ margin: 0, fontSize: '0.75rem', color: '#9f3028' }}>• {warning}</p>
                ))}
              </div>
              {row.actionHref ? (
                <Link to={row.actionHref} className="header-secondary-cta" style={{ width: 'fit-content', padding: '0.28rem 0.52rem' }}>
                  Open Matter
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default TransferSigningQueue
