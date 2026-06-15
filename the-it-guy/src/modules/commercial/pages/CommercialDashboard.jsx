import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../../context/WorkspaceContext'
import CommercialExecutiveCommandCenter from '../components/CommercialExecutiveCommandCenter'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialPrincipalDashboardData } from '../services/commercialDashboardApi'

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
