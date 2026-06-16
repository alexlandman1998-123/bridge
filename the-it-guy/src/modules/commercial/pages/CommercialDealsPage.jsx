import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

function CommercialDealsPage({ dealType = '', pageTitle = '', pageDescription = '' }) {
  return (
    <CommercialCrudPage
      config={commercialCrudConfigs.deals}
      pageTitle={pageTitle}
      pageDescription={pageDescription}
      extraFilter={dealType ? (record) => String(record.deal_type || record.dealType || '').toLowerCase() === dealType : null}
    />
  )
}

export default CommercialDealsPage
