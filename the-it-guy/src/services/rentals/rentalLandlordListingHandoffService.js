import { buildRentalListingQueryOptions } from './rentalWorkspaceScope'
import { linkRentalLandlordOnboardingProperty } from './rentalLandlordOnboardingService.js'
import { updateAgencyCrmLeadRecord } from '../../lib/agencyCrmRepository'
import { patchRentalCrmLeadMetadata } from './rentalCrmLeadModel'
import { getRentalListingForAgent } from './rentalListingDraftService'
import { advanceRentalLead, getRentalLeadWorkspace } from './rentalLeadService'
import { landlordWorkspace } from './rentalLandlordWorkspaceModel'
import { listRentalPropertyMandates } from './rentalLandlordMandateRepository'
import { findLeadMandate } from './rentalLeadHandoffModel'
import { ensureRentalListingVacancy } from './rentalListingInventoryRepository.js'

const text = value => String(value ?? '').trim()

export async function linkRentalLandlordLeadToListing(lead = {}, listingId = '', context = {}) {
  const load = async () => (await getRentalLeadWorkspace(context.organisationId, lead.id, { ...context.scope, includeClosed: true })).lead
  let currentLead = await load()
  if (currentLead.role !== 'landlord' || !['listing_ready', 'listing_created'].includes(currentLead.stage)) throw new Error('Choose a landlord lead at Listing ready.')
  if (!text(listingId)) throw new Error('A created rental listing is required.')
  const listing = await getRentalListingForAgent(listingId, context.actor?.id || context.actor?.userId, { ...buildRentalListingQueryOptions(context.scope || {}), organisationId: context.organisationId })
  if (!listing || text(listing.organisationId || listing.organisation_id) !== text(context.organisationId)) throw new Error('The rental listing was not found in this organisation.')
  const { portfolio } = landlordWorkspace(currentLead)
  const property = context.portfolioPropertyId ? portfolio.find(item => item.id === text(context.portfolioPropertyId)) : null
  if (context.portfolioPropertyId && !property) throw new Error('This portfolio property is not available on the landlord lead.')
  if (property?.listingId && property.listingId !== text(listingId)) throw new Error('This portfolio property already has a rental listing.')
  if (!property && currentLead.relationships?.listingId && currentLead.relationships.listingId !== listingId) throw new Error('This landlord lead is already linked to another listing.')
  const propertyId = property?.canonicalPropertyId || currentLead.relationships?.propertyId
  if (!propertyId) throw new Error('Link the landlord to a managed property before creating its rental listing.')
  const mandates = await listRentalPropertyMandates(propertyId)
  const mandate = findLeadMandate(currentLead, mandates, propertyId, context.organisationId)
  if (!mandate) throw new Error('Record a signed mandate for this portfolio property before linking its rental listing.')
  // Check the selected property before the vacancy command can create records.
  const savedPropertyId = listing.rentalPropertyId || listing.rental_property_id || listing.sellerCanonicalFacts?.propertyId
  const savedUnitId = listing.rentalUnitId || listing.rental_unit_id || listing.sellerCanonicalFacts?.unitId
  if (savedPropertyId && savedPropertyId !== propertyId) throw new Error('The rental listing belongs to another managed property.')
  if (property?.canonicalUnitId && savedUnitId && property.canonicalUnitId !== savedUnitId) throw new Error('The rental listing belongs to another managed unit.')
  const inventory = await ensureRentalListingVacancy(listingId, context.organisationId)
  if (inventory.applicable === false || inventory.propertyId !== propertyId || (property?.canonicalUnitId && inventory.unitId !== property.canonicalUnitId)) throw new Error('Choose the monthly rental listing for this managed property and unit.')
  if (property) {
    await linkRentalLandlordOnboardingProperty(currentLead, property.id, { listingId })
    currentLead = await load()
  }
  const primaryId = currentLead.relationships?.listingId
  if (!primaryId || primaryId === listingId) {
    const relationships = { ...currentLead.relationships, listingId, propertyId: inventory.propertyId, unitId: inventory.unitId, vacancyId: inventory.vacancyId, mandateId: mandate.id }
    if (Object.entries(relationships).some(([key, value]) => currentLead.relationships?.[key] !== value)) {
      await updateAgencyCrmLeadRecord(context.organisationId, currentLead.id, {
        rawEnquiryPayload: patchRentalCrmLeadMetadata(currentLead.raw, { relationships }),
      }, { expectedUpdatedAt: currentLead.updatedAt })
      currentLead = await load()
    }
  }
  if (currentLead.stage === 'listing_created') return currentLead
  try {
    return await advanceRentalLead(currentLead, { ...context, toStage: 'listing_created' })
  } catch (cause) {
    throw new Error(`Listing ${listingId} was linked, but the landlord lead did not advance: ${cause?.message || 'unknown failure'}`)
  }
}
