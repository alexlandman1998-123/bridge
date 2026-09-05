import { createAgencyCrmLeadActivity, updateAgencyCrmLeadRecord } from '../../lib/agencyCrmRepository'
import { getRentalLeadMetadata } from './rentalLeadClassificationModel'
import { patchRentalCrmLeadMetadata } from './rentalCrmLeadModel'

const text = (value) => String(value ?? '').trim()

export async function linkRentalLandlordLeadToListing(lead = {}, listingId = '', context = {}) {
  if (lead.role !== 'landlord' || lead.stage !== 'listing_ready') throw new Error('Choose a landlord lead at Listing ready.')
  if (!text(listingId)) throw new Error('A created rental listing is required.')
  const current = getRentalLeadMetadata(lead.raw)
  const metadata = patchRentalCrmLeadMetadata(lead.raw, { relationships: { ...current.relationships, listingId: text(listingId) } })
  const updated = await updateAgencyCrmLeadRecord(context.organisationId, lead.id, { rawEnquiryPayload: metadata })
  void createAgencyCrmLeadActivity(context.organisationId, lead.id, { agent: context.actor || {}, activityType: 'Rental Listing Linked', activityNote: `Rental listing ${text(listingId)} created and linked to landlord lead.`, outcome: 'listing_created' }, { actor: context.actor || {} }).catch(() => null)
  return updated
}
