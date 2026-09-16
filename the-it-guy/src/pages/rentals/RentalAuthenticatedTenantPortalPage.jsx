import { useParams } from 'react-router-dom'
import RentalTenantPortalPage from './RentalTenantPortalPage'

export default function RentalAuthenticatedTenantPortalPage() {
  const { membershipId = '' } = useParams()
  return <RentalTenantPortalPage accountMembershipId={membershipId} />
}
