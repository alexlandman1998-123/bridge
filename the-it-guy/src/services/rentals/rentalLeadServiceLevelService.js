import { listRentalLeadFollowUps } from './rentalLeadFollowUpService'
import { buildRentalLeadServiceLevelSummary } from './rentalLeadServiceLevelModel'

export async function getRentalLeadServiceLevelQueue(organisationId, options = {}, now = new Date()) {
  const tasks = await listRentalLeadFollowUps(organisationId, options)
  return buildRentalLeadServiceLevelSummary(tasks, now)
}
