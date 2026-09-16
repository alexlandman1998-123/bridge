import { useParams } from 'react-router-dom'
import RentalLandlordPortalPage from './RentalLandlordPortalPage'

export default function RentalAuthenticatedLandlordPortalPage() {
  const { membershipId = '' } = useParams()
  return <RentalLandlordPortalPage accountMembershipId={membershipId} />
}
