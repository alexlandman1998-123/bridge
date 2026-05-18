import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

function CommercialPropertiesPage() {
  return <CommercialCrudPage config={commercialCrudConfigs.properties} />
}

export default CommercialPropertiesPage
