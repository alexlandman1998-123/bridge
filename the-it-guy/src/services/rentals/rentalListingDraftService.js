import {
  createPrivateListing,
  createPrivateListingActivity,
  getAgentPrivateListings,
  syncPrivateListingDistributionData,
} from '../privateListingService'
import {
  buildRentalPrivateListingPayload,
  buildRentalPublicationDraft,
  validateRentalListingDraftForm,
} from './rentalListingDraftModel'

function normalizeText(value) {
  return String(value || '').trim()
}

export function isRentalListingRecord(listing = {}) {
  const category = normalizeText(listing.listingCategory || listing.listing_category || listing.listingType).toLowerCase()
  const publicationType = normalizeText(
    listing.listingPublicationData?.listingType ||
      listing.listingPublicationData?.listing_type ||
      listing.publicationData?.listingType,
  ).toLowerCase()
  const notes = normalizeText(listing.internalListingNotes || listing.internal_listing_notes || listing.notes).toLowerCase()
  return category.includes('rental') || publicationType === 'rental' || notes.includes('arch9_rental_capture_v1')
}

export async function listRentalListingsForAgent(agentId, options = {}) {
  const rows = await getAgentPrivateListings(agentId, {
    organisationId: options.organisationId,
    assignedAgentIds: options.assignedAgentIds,
    includeAllOrganisationListings: options.includeAllOrganisationListings,
  })
  return rows.filter(isRentalListingRecord)
}

export async function createRentalListingDraft(form = {}, context = {}) {
  const validationErrors = validateRentalListingDraftForm(form, context)
  if (validationErrors.length) {
    const error = new Error(validationErrors.join(' '))
    error.validationErrors = validationErrors
    throw error
  }

  const listingPayload = buildRentalPrivateListingPayload(form, context)
  const created = await createPrivateListing(listingPayload, {
    includeRequirementsAndDocuments: false,
    syncRequirements: false,
  })
  const listingId = created?.listing?.id
  if (!listingId) throw new Error('Unable to create the rental listing draft.')

  const publicationResult = await syncPrivateListingDistributionData(listingId, {
    publicationData: buildRentalPublicationDraft(form),
    media: {},
    externalLinks: [],
  })

  const activity = await createPrivateListingActivity({
    privateListingId: listingId,
    activityType: 'rental_listing_draft_created',
    activityTitle: 'Rental listing draft created',
    activityDescription: 'Rental listing captured in the staging Rentals workspace.',
    performedBy: context.performedBy || context.assignedAgentId || null,
    visibility: 'internal',
    metadata: {
      source: 'rentals_phase4_capture',
      publicationDraftSkipped: publicationResult?.skipped === true,
      publicationDraftReason: publicationResult?.reason || '',
    },
  }).catch(() => null)

  return {
    listing: created.listing,
    existing: created.existing === true,
    publicationResult,
    activity,
  }
}
