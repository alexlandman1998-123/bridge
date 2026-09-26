import { createAgencyCrmLeadActivity, updateAgencyCrmLeadRecord } from '../../lib/agencyCrmRepository'
import { getRentalLeadMetadata } from './rentalLeadClassificationModel'
import { patchRentalCrmLeadMetadata } from './rentalCrmLeadModel'
import { getRentalListingForAgent } from './rentalListingDraftService'
import { advanceRentalLead, getRentalLeadWorkspace } from './rentalLeadService'

const text = (value) => String(value ?? '').trim()

export async function linkRentalLandlordLeadToListing(lead = {}, listingId = '', context = {}) {
  const currentLead = context.scope ? (await getRentalLeadWorkspace(context.organisationId, lead.id, context.scope)).lead : lead
  if (currentLead.role !== 'landlord' || !['listing_ready', 'listing_created'].includes(currentLead.stage)) throw new Error('Choose a landlord lead at Listing ready.')
  if (!text(listingId)) throw new Error('A created rental listing is required.')
  const listing = await getRentalListingForAgent(listingId, context.actor?.id || context.actor?.userId, { organisationId: context.organisationId })
  if (!listing || text(listing.organisationId || listing.organisation_id) !== text(context.organisationId)) throw new Error('The rental listing was not found in this organisation.')
  const current = getRentalLeadMetadata(currentLead.raw)
  if (text(current.relationships?.listingId)) {
    if (text(current.relationships.listingId) !== text(listingId)) throw new Error('This landlord lead is already linked to another listing.')
    if (currentLead.stage === 'listing_created') return currentLead
    return advanceRentalLead(currentLead, { organisationId: context.organisationId, actor: context.actor || {}, scope: context.scope, toStage: 'listing_created' })
  }
  if (currentLead.stage !== 'listing_ready') throw new Error('This lead is already past listing creation.')
  const metadata = patchRentalCrmLeadMetadata(currentLead.raw, { relationships: { ...current.relationships, listingId: text(listingId) } })
  await updateAgencyCrmLeadRecord(context.organisationId, currentLead.id, { rawEnquiryPayload: metadata })
  void createAgencyCrmLeadActivity(context.organisationId, currentLead.id, { agent: context.actor || {}, activityType: 'Rental Listing Linked', activityNote: `Rental listing ${text(listingId)} created and linked to landlord lead.`, outcome: 'listing_created' }, { actor: context.actor || {} }).catch(() => null)
  try {
    return await advanceRentalLead(currentLead, { organisationId: context.organisationId, actor: context.actor || {}, scope: context.scope, toStage: 'listing_created' })
  } catch (cause) {
    throw new Error(`Listing ${text(listingId)} was linked, but the landlord lead did not advance: ${cause?.message || 'unknown failure'}`)
  }
}
