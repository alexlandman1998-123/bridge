import AttorneyFirmIdentityCard from '../branding/AttorneyFirmIdentityCard'

function AttorneyDashboardHeader({ firm, currentUserRole, activeDepartmentsCount = 0, activeMembersCount = 0 }) {
  return (
    <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 320px)' }}>
      <div className="panel card-tier-standard" style={{ display: 'grid', gap: '0.35rem' }}>
        <p className="status-message" style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Firm Overview</p>
        <h2 style={{ margin: 0 }}>Attorney Management Dashboard</h2>
        <p className="status-message" style={{ margin: 0 }}>
          Track active matters, department workload, and key conveyancing milestones across your firm.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <AttorneyFirmIdentityCard
          firm={firm}
          title="Firm Identity"
          subtitle={firm?.email || firm?.phone || ''}
          roleLabel={`Role: ${currentUserRole || '—'}`}
          contactSummary={false}
          compactMode
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' }}>
          <div className="panel card-tier-soft" style={{ padding: '0.55rem 0.65rem' }}>
            <p className="status-message" style={{ margin: 0 }}>Active departments</p>
            <p style={{ margin: 0, fontWeight: 700 }}>{activeDepartmentsCount}</p>
          </div>
          <div className="panel card-tier-soft" style={{ padding: '0.55rem 0.65rem' }}>
            <p className="status-message" style={{ margin: 0 }}>Active members</p>
            <p style={{ margin: 0, fontWeight: 700 }}>{activeMembersCount}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AttorneyDashboardHeader
