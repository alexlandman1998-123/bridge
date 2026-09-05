import { createRentalLeadFollowUp, listRentalLeadFollowUps } from './rentalLeadFollowUpService'
import { listRentalLeads } from './rentalLeadService'
import { buildRentalLeadAutomationFollowUp, buildRentalLeadAutomationQueue } from './rentalLeadAutomationModel'

export async function getRentalLeadAutomationQueue(organisationId, options = {}, now = new Date()) {
  const [leads, tasks] = await Promise.all([listRentalLeads(organisationId, options), listRentalLeadFollowUps(organisationId, options)])
  return buildRentalLeadAutomationQueue({ leads, tasks, now })
}

export async function createRentalLeadAutomationFollowUp(suggestion = {}, context = {}) {
  const draft = buildRentalLeadAutomationFollowUp(suggestion, context.now || new Date())
  return createRentalLeadFollowUp(suggestion.lead, draft, context)
}
