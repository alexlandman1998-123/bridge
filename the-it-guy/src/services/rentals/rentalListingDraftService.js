import {
  createPrivateListing,
  createPrivateListingActivity,
  getAgentPrivateListings,
  getPrivateListing,
  syncPrivateListingDistributionData,
  updatePrivateListing,
} from '../privateListingService'
import {
  buildRentalPrivateListingPayload,
  buildRentalPublicationDraft,
  validateRentalListingDraftForm,
} from './rentalListingDraftModel'
import {
  buildRentalListingEditPublicationDraft,
  buildRentalListingUpdatePayload,
  validateRentalListingEditForm,
} from './rentalListingEditModel'
import {
  buildRentalProperty24PublishRequest,
} from './rentalListingProperty24PublishModel'

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
    branchId: options.branchId,
    assignedAgentIds: options.assignedAgentIds,
    includeAllOrganisationListings: options.includeAllOrganisationListings,
  })
  return rows.filter(isRentalListingRecord)
}

export async function getRentalListingForAgent(listingId, agentId, options = {}) {
  const normalizedListingId = normalizeText(listingId)
  if (!normalizedListingId) throw new Error('Rental listing id is required.')

  const directListing = await getPrivateListing(normalizedListingId, {
    includeRequirementsAndDocuments: false,
  }).catch(() => null)
  if (directListing && isRentalListingRecord(directListing)) return directListing

  const rows = await listRentalListingsForAgent(agentId, options)
  return rows.find((listing) => {
    const identityValues = [
      listing.id,
      listing.listingId,
      listing.listing_id,
      listing.listingReference,
      listing.listing_reference,
    ].map(normalizeText)
    return identityValues.includes(normalizedListingId)
  }) || null
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

export async function updateRentalListingDraft(listingId, form = {}, context = {}) {
  const validationErrors = validateRentalListingEditForm(form, context)
  if (validationErrors.length) {
    const error = new Error(validationErrors.join(' '))
    error.validationErrors = validationErrors
    throw error
  }

  const listingPayload = buildRentalListingUpdatePayload(form)
  const listing = await updatePrivateListing(listingId, listingPayload, {
    includeRequirementsAndDocuments: false,
  })

  const publicationResult = await syncPrivateListingDistributionData(listingId, {
    publicationData: buildRentalListingEditPublicationDraft(form),
    media: {},
    externalLinks: [],
  })

  const activity = await createPrivateListingActivity({
    privateListingId: listingId,
    activityType: 'rental_listing_updated',
    activityTitle: 'Rental listing updated',
    activityDescription: 'Rental listing facts were updated in the Rentals workspace.',
    performedBy: context.performedBy || context.assignedAgentId || null,
    visibility: 'internal',
    metadata: {
      source: 'rentals_phase5_detail_edit',
      publicationDraftSkipped: publicationResult?.skipped === true,
      publicationDraftReason: publicationResult?.reason || '',
    },
  }).catch(() => null)

  return {
    listing,
    publicationResult,
    activity,
  }
}

export async function prepareRentalProperty24PublishRequest(listingId, context = {}) {
  const normalizedListingId = normalizeText(listingId)
  if (!normalizedListingId) throw new Error('Rental listing id is required.')

  const listing = await getPrivateListing(normalizedListingId, {
    includeRequirementsAndDocuments: false,
  })
  if (!listing || !isRentalListingRecord(listing)) throw new Error('Rental listing not found.')

  const request = buildRentalProperty24PublishRequest(listing, context)
  if (!request.canPrepare) {
    const blockerLabels = request.blockers.map((blocker) => blocker.label).join(', ')
    const error = new Error(blockerLabels ? `Property24 rental publish is blocked: ${blockerLabels}.` : 'Property24 rental publish is blocked.')
    error.blockers = request.blockers
    error.publishRequest = request
    throw error
  }

  const activity = await createPrivateListingActivity({
    privateListingId: normalizedListingId,
    activityType: request.activity.activityType,
    activityTitle: request.activity.activityTitle,
    activityDescription: request.activity.activityDescription,
    performedBy: context.performedBy || context.requestedBy || context.assignedAgentId || null,
    visibility: 'internal',
    metadata: {
      source: 'rentals_phase7_property24_publish_request',
      version: request.version,
      idempotencyKey: request.idempotencyKey,
      liveWriteEnabled: request.liveWriteEnabled,
      requiresBackendPublisher: request.requiresBackendPublisher,
      requestedAt: request.requestedAt,
      readinessVersion: request.readiness.version,
      readinessPercent: request.readiness.readinessPercent,
      payloadPreview: request.requestPayload,
    },
  }).catch(() => null)

  return {
    listing,
    request,
    activity,
  }
}
