import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

function CommercialVacanciesPage() {
  return <CommercialCrudPage config={commercialCrudConfigs.vacancies} />
}

export default CommercialVacanciesPage
