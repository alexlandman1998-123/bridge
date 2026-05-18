import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

const LEASING_DEALS_CONFIG = {
  ...commercialCrudConfigs.deals,
  title: 'Leasing Deals',
  description: 'Track commercial leasing deals from tenant demand and vacancy match through proposal, Heads of Terms, lease draft, signature, and occupation.',
  createLabel: 'New leasing deal',
  secondaryActions: [{ label: 'Pipeline view', to: '/commercial/deals/leasing/pipeline' }],
  emptyTitle: 'No leasing deals yet',
  emptyDescription: 'Create a leasing deal once a tenant requirement, vacancy, proposal, or lease negotiation is active.',
  fetchRecords: async (organisationId) => {
    const rows = await commercialCrudConfigs.deals.fetchRecords(organisationId)
    return rows.filter((row) => String(row.deal_type || 'lease').toLowerCase() !== 'sale')
  },
  createRecord: (payload) => commercialCrudConfigs.deals.createRecord({ ...payload, deal_type: 'lease' }),
  fields: commercialCrudConfigs.deals.fields.filter((field) => field.name !== 'deal_type'),
}

function CommercialLeasingDealsPage() {
  return <CommercialCrudPage config={LEASING_DEALS_CONFIG} />
}

export default CommercialLeasingDealsPage
