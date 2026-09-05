import { createAgencyCrmLeadActivity } from '../../lib/agencyCrmRepository'
import { buildRentalLeadListingMatches } from './rentalLeadMatchingModel'
import { listRentalListingsForAgent } from './rentalListingDraftService'
import { listRentalLeads } from './rentalLeadService'
import { buildRentalListingQueryOptions } from './rentalWorkspaceScope'

const text = (value) => String(value ?? '').trim()

export async function listRentalLeadMatches(organisationId, leadId, scope = {}) {
  const leads = await listRentalLeads(organisationId, scope)
  const lead = leads.find((item) => item.id === text(leadId))
  if (!lead || lead.role !== 'tenant') throw new Error('Choose a tenant lead available in your current scope.')
  const listings = await listRentalListingsForAgent(scope.assignedAgentId, buildRentalListingQueryOptions(scope))
  return { lead, matches: buildRentalLeadListingMatches(lead, listings) }
}

export async function recordRentalLeadListingShortlist(lead = {}, match = {}, context = {}) {
  if (!text(lead.id) || !text(match.listing?.id)) throw new Error('A tenant lead and rental listing are required.')
  return createAgencyCrmLeadActivity(context.organisationId, lead.id, {
    agent: context.actor || {}, activityType: 'Rental Listing Shortlisted',
    activityNote: `Shortlisted ${text(match.listing.listingTitle || match.listing.title || match.listing.id)} (${match.recommendation.replace('_', ' ')}).`,
    outcome: match.recommendation,
  }, { actor: context.actor || {} })
}
