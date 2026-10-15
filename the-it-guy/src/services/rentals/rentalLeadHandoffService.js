import { listPersistedRentalApplicationsForLead, listRentalApplicationScreeningChecks } from './rentalApplicationRepository'
import { listRentalPropertyMandates } from './rentalLandlordMandateRepository'
import { findSubmittedLeadApplication, requireRentalLeadHandoff } from './rentalLeadHandoffModel'
import { listRentalViewings } from './rentalViewingService'
import { getRentalListingForAgent } from './rentalListingDraftService'
import { buildRentalListingQueryOptions } from './rentalWorkspaceScope'

const text = (value) => String(value ?? '').trim()

export async function verifyRentalLeadHandoff(lead, toStage, context = {}) {
  if (['viewing_scheduled', 'viewing_completed'].includes(toStage)) {
    const agentId = text(context.actor?.id || context.actor?.userId)
    if (!agentId) throw new Error('A signed-in agent is required to verify a viewing.')
    const scope = { ...(context.scope || {}), organisationId: context.organisationId }
    const viewings = await listRentalViewings(agentId, { ...buildRentalListingQueryOptions(scope), requireActivity: true })
    return requireRentalLeadHandoff(lead, toStage, { viewings })
  }
  if (['application_submitted', 'screening_pending', 'fica_pending', 'fica_complete', 'placement_ready'].includes(toStage)) {
    const applications = await listPersistedRentalApplicationsForLead(context.organisationId, lead.id)
    const application = findSubmittedLeadApplication(lead, applications)
    const checks = application && ['fica_pending', 'fica_complete'].includes(toStage) ? await listRentalApplicationScreeningChecks(application.id) : []
    return requireRentalLeadHandoff(lead, toStage, { applications, checks, organisationId: context.organisationId })
  }
  if (['mandate_signed', 'listing_ready'].includes(toStage)) {
    const propertyId = text(context.relationships?.propertyId || lead.relationships?.propertyId)
    const mandates = propertyId ? await listRentalPropertyMandates(propertyId) : []
    return requireRentalLeadHandoff(lead, toStage, { propertyId, mandates, organisationId: context.organisationId })
  }
  if (toStage === 'listing_created') {
    const listingId = text(lead.relationships?.listingId)
    const listing = listingId ? await getRentalListingForAgent(listingId, context.actor?.id || context.actor?.userId, { ...buildRentalListingQueryOptions(context.scope || {}), organisationId: context.organisationId }) : null
    return requireRentalLeadHandoff(lead, toStage, { listing, organisationId: context.organisationId })
  }
  return requireRentalLeadHandoff(lead, toStage)
}
