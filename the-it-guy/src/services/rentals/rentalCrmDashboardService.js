import { listRentalLeadFollowUps } from './rentalLeadFollowUpService'
import { listRentalLeads } from './rentalLeadService'
import { buildRentalCrmDashboard } from './rentalCrmDashboardModel'

export async function getRentalCrmDashboard(organisationId, options = {}, now = new Date()) {
  const [leads, tasks] = await Promise.all([
    listRentalLeads(organisationId, options),
    listRentalLeadFollowUps(organisationId, options),
  ])
  return buildRentalCrmDashboard({ leads, tasks, now })
}
