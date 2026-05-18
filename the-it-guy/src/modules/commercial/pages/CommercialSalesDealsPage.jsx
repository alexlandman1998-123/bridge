import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

const SALES_DEALS_CONFIG = {
  ...commercialCrudConfigs.deals,
  title: 'Sales Deals',
  description: 'Track commercial sales deals from buyer or investor demand through property match, offer, due diligence, legal, transfer, and close.',
  createLabel: 'New sales deal',
  secondaryActions: [],
  emptyTitle: 'No sales deals yet',
  emptyDescription: 'Create a sales deal when a buyer, investor, seller, or commercial property sale opportunity becomes active.',
  fetchRecords: async (organisationId) => {
    const rows = await commercialCrudConfigs.deals.fetchRecords(organisationId)
    return rows.filter((row) => String(row.deal_type || '').toLowerCase() === 'sale')
  },
  createRecord: (payload) => commercialCrudConfigs.deals.createRecord({ ...payload, deal_type: 'sale' }),
  fields: commercialCrudConfigs.deals.fields.filter((field) => field.name !== 'deal_type'),
}

function CommercialSalesDealsPage() {
  return <CommercialCrudPage config={SALES_DEALS_CONFIG} />
}

export default CommercialSalesDealsPage
