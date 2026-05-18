import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

function CommercialLeasesPage() {
  return <CommercialCrudPage config={commercialCrudConfigs.leases} />
}

export default CommercialLeasesPage
