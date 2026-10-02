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
  const listingScope = {
    ...scope,
    organisationId,
    includeAllOrganisationListings: ['organisation', 'branch'].includes(scope.scopeLevel),
    listingBranchId: scope.scopeLevel === 'branch' ? scope.branchId : '',
  }
  const listings = await listRentalListingsForAgent(scope.assignedAgentId, buildRentalListingQueryOptions(listingScope))
  return { lead, matches: buildRentalLeadListingMatches(lead, listings) }
}

export async function recordRentalLeadListingShortlist(lead = {}, match = {}, context = {}) {
  if (!text(lead.id) || !text(match.listing?.id)) throw new Error('A tenant lead and rental listing are required.')
  const current = await listRentalLeadMatches(context.organisationId, lead.id, context.scope || {})
  const selected = current.matches.find((item) => item.listing.id === text(match.listing.id))
  if (!selected) throw new Error('This rental listing is no longer available in your current scope. Refresh matches.')
  return createAgencyCrmLeadActivity(context.organisationId, current.lead.id, {
    agent: context.actor || {}, activityType: 'Rental Listing Shortlisted',
    activityNote: `Shortlisted ${text(selected.listing.listingTitle || selected.listing.title || selected.listing.id)} (${text(selected.recommendation || 'review').replaceAll('_', ' ')}).`,
    outcome: selected.recommendation,
  }, { actor: context.actor || {} })
}
