import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

function CommercialTenantsPage() {
  return <CommercialCrudPage config={commercialCrudConfigs.tenants} />
}

export default CommercialTenantsPage
