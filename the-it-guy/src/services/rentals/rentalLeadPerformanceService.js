import { listRentalLeads } from './rentalLeadService'
import { buildRentalLeadPerformanceAnalytics } from './rentalLeadPerformanceModel'

export async function getRentalLeadPerformanceAnalytics(organisationId, options = {}) {
  const leads = await listRentalLeads(organisationId, options)
  return buildRentalLeadPerformanceAnalytics(leads)
}
