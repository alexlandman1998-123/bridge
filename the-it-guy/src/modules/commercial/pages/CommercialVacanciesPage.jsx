import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

function CommercialVacanciesPage() {
  return (
    <CommercialCrudPage
      config={commercialCrudConfigs.vacancies}
      pageTitle="Vacancies"
      pageDescription="Manage lease opportunities, available space and landlord mandates."
    />
  )
}

export default CommercialVacanciesPage
