import { CalendarClock, FileCheck2, Users } from 'lucide-react'
import CommercialPlaceholderPage from './CommercialPlaceholderPage'

function CommercialExpiringOccupiersPage() {
  return (
    <CommercialPlaceholderPage
      title="Expiring Occupiers"
      description="Prepare tenant-retention and relocation workflows around occupiers with leases approaching expiry."
      cards={[
        { title: '0-3 Month Risk', description: 'Surface occupiers needing urgent renewal, relocation, or retention conversations.', icon: CalendarClock },
        { title: 'Tenant Retention Notes', description: 'Prepare broker notes, renewal appetite, relocation pressure, and landlord strategy.', icon: Users },
        { title: 'Linked Lease Records', description: 'Connect expiring occupiers to active lease records and portfolio risk views.', icon: FileCheck2 },
      ]}
    />
  )
}

export default CommercialExpiringOccupiersPage
