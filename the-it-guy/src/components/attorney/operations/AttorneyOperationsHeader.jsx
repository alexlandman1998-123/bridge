import { Link } from 'react-router-dom'
import AttorneyFirmIdentityCard from '../branding/AttorneyFirmIdentityCard'
import AttorneyRoleModeBadge from './AttorneyRoleModeBadge'

function AttorneyOperationsHeader({ firm, currentUser, canViewFirmDashboard = false }) {
  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '0.32rem' }}>
          <p className="status-message" style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Operational Workspace
          </p>
          <h2 style={{ margin: 0 }}>Attorney Operations</h2>
          <p className="status-message" style={{ margin: 0 }}>
            Your assigned matters, document tasks, and signing actions in one place.
          </p>
        </div>
        {canViewFirmDashboard ? (
          <Link to="/attorney/dashboard" className="header-secondary-cta" style={{ alignSelf: 'start' }}>
            View Management Dashboard
          </Link>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap' }}>
        <AttorneyFirmIdentityCard
          firm={firm}
          title="Firm"
          subtitle={currentUser?.name || 'Attorney User'}
          contactSummary={false}
          compactMode
        />
        <AttorneyRoleModeBadge roleLabel={currentUser?.roleLabel} department={currentUser?.department} />
      </div>

      <p className="status-message" style={{ margin: 0 }}>
        {currentUser?.roleCopy || 'Your assigned matters, document tasks, and signing actions in one place.'}
      </p>
    </section>
  )
}

export default AttorneyOperationsHeader
