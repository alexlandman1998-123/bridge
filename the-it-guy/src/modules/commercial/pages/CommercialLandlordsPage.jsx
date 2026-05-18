import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

function CommercialLandlordsPage() {
  return <CommercialCrudPage config={commercialCrudConfigs.landlords} />
}

export default CommercialLandlordsPage
