let agencyPipelinePromise = null
let settingsPromise = null
let commissionPromise = null
let privateListingsPromise = null
let agentCardPromise = null

export async function getAgencyPipelineSnapshot(...args) {
  agencyPipelinePromise ||= import('./agencyPipelineService')
  return (await agencyPipelinePromise).getAgencyPipelineSnapshot(...args)
}
export async function getAppointmentsDashboardSummaryAsync(...args) {
  agencyPipelinePromise ||= import('./agencyPipelineService')
  return (await agencyPipelinePromise).getAppointmentsDashboardSummaryAsync(...args)
}
export async function listOrganisationUserAssignmentAliases(...args) {
  settingsPromise ||= import('./settingsApi')
  return (await settingsPromise).listOrganisationUserAssignmentAliases(...args)
}
export async function getAgentCommissionTracker(...args) {
  commissionPromise ||= import('../services/commissionService')
  return (await commissionPromise).getAgentCommissionTracker(...args)
}
export async function getAgentPrivateListingSummaries(...args) {
  privateListingsPromise ||= import('../services/privateListingService')
  return (await privateListingsPromise).getAgentPrivateListingSummaries(...args)
}
export async function loadAgencyAgentCardInsights(...args) {
  agentCardPromise ||= import('../services/agencyPublicIntakeLinkService')
  return (await agentCardPromise).loadAgencyAgentCardInsights(...args)
}
export async function loadAgencyAgentCardLink(...args) {
  agentCardPromise ||= import('../services/agencyPublicIntakeLinkService')
  return (await agentCardPromise).loadAgencyAgentCardLink(...args)
}
