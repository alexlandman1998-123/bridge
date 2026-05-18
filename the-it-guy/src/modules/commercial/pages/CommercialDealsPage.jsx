import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

function CommercialDealsPage() {
  return <CommercialCrudPage config={commercialCrudConfigs.deals} />
}

export default CommercialDealsPage
