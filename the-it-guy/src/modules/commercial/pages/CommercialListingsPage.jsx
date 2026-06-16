import CommercialCrudPage from '../components/CommercialCrudPage'
import { commercialCrudConfigs } from '../commercialCrudConfig'

function CommercialListingsPage() {
  return <CommercialCrudPage config={commercialCrudConfigs.listings} presentation="cards" />
}

export default CommercialListingsPage
