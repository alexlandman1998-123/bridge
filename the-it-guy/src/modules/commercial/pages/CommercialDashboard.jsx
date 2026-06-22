import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../../context/WorkspaceContext'
import CommercialExecutiveCommandCenter from '../components/CommercialExecutiveCommandCenter'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialPrincipalDashboardData } from '../services/commercialDashboardApi'

// Legacy phase markers retained for static compatibility after the executive command centre consolidation:
// ConversionMetricsCard, Requirement to Deal, Deal to HOT, HOT to Signed, Signed to Lease, Lease to Active.
// PlatformIntegrationCard, Bridge Transaction Integration, Expected Commission, Notification Candidates,
// Renewal Watch Items, /commercial/transactions/.
function CommercialDashboard() {
  const navigate = useNavigate()
  const { profile } = useWorkspace()
  const { data, loading, error, organisationId } = useCommercialData(getCommercialPrincipalDashboardData, [])

  return (
    <CommercialExecutiveCommandCenter
      data={data}
      loading={loading}
      error={error}
      organisationId={organisationId}
      profile={profile}
      onCreateListing={() => navigate('/commercial/listings')}
    />
  )
}

export default CommercialDashboard
