import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

function CommercialRequirementsPage() {
  return <CommercialCrudPage config={commercialCrudConfigs.requirements} />
}

export default CommercialRequirementsPage
