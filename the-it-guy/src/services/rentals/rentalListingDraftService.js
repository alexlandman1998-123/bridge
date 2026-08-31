import {
  createPrivateListing,
  createPrivateListingActivity,
  getAgentPrivateListings,
  getPrivateListing,
  syncPrivateListingDistributionData,
  uploadPrivateListingMediaAsset,
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
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeGalleryItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && (item.url || item.signedUrl || item.publicUrl || item.file))
    .map((item, index) => ({
      id: String(item.id || item.path || `gallery-${index + 1}`),
      name: String(item.name || item.fileName || `Image ${index + 1}`),
      url: normalizeText(item.url || item.signedUrl || item.publicUrl),
      signedUrl: normalizeText(item.signedUrl),
      publicUrl: normalizeText(item.publicUrl),
      path: normalizeText(item.path),
      bucket: normalizeText(item.bucket),
      contentType: normalizeText(item.contentType || item.file?.type),
      size: Number(item.size || item.file?.size || 0) || 0,
      file: typeof File !== 'undefined' && item.file instanceof File ? item.file : null,
    }))
}

function isPersistableMediaUrl(value = '') {
  const url = normalizeText(value)
  return Boolean(url && !url.startsWith('blob:') && !url.startsWith('data:'))
}

function stripUploadOnlyFields(item = {}) {
  const nextImage = { ...item }
  delete nextImage.file
  delete nextImage.uploadWarning
  return nextImage
}

function getRentalCoverGalleryItem(galleryImages = [], coverImageId = '') {
  const normalizedImages = normalizeGalleryItems(galleryImages)
  const normalizedCoverImageId = normalizeText(coverImageId)
  return normalizedImages.find((item) => normalizeText(item.id) === normalizedCoverImageId) || normalizedImages[0] || null
}

async function uploadRentalGalleryImages(galleryImages = [], listingId) {
  const normalizedImages = normalizeGalleryItems(galleryImages)
  const uploadedImages = await Promise.all(
    normalizedImages.map(async (item, index) => {
      if (!item.file) return item
      try {
        const asset = await uploadPrivateListingMediaAsset(item.file, { listingId, type: 'gallery' })
        return {
          id: asset.path || item.id,
          name: asset.fileName || item.name,
          url: asset.url || asset.signedUrl || asset.publicUrl || item.url,
          signedUrl: asset.signedUrl || '',
          publicUrl: asset.publicUrl || '',
          path: asset.path || '',
          bucket: asset.bucket || '',
          contentType: asset.contentType || item.contentType || '',
          size: asset.size || item.size || 0,
        }
      } catch (error) {
        const fallbackUrl = isPersistableMediaUrl(item.url) ? item.url : ''
        return {
          ...item,
          id: item.id || `gallery-${index + 1}`,
          url: fallbackUrl,
          uploadWarning: error?.message || 'Storage upload failed.',
        }
      }
    }),
  )

  return uploadedImages.map(stripUploadOnlyFields).filter((item) => isPersistableMediaUrl(item.url || item.signedUrl || item.publicUrl))
}

function buildRentalListingMediaPayload(form = {}, uploadedGalleryImages = []) {
  const requestedCoverImageId = normalizeText(form.coverImageId)
  const uploadedCoverImageId = uploadedGalleryImages.some((item) => normalizeText(item.id) === requestedCoverImageId)
    ? requestedCoverImageId
    : normalizeText(uploadedGalleryImages[0]?.id)

  return {
    galleryImages: uploadedGalleryImages,
    coverImageId: uploadedCoverImageId,
  }
}

async function finalizeRentalListingGalleryUploads({ listingId, form, publicationData, uploadedCoverImages = [] } = {}) {
  const coverSource = getRentalCoverGalleryItem(form.galleryImages, form.coverImageId)
  const coverSourceId = normalizeText(coverSource?.id)
  const remainingImages = normalizeGalleryItems(form.galleryImages).filter((item) => normalizeText(item.id) !== coverSourceId)
  if (!remainingImages.length) return null

  const uploadedRemainingImages = await uploadRentalGalleryImages(remainingImages, listingId)
  const uploadedGalleryImages = [...uploadedCoverImages, ...uploadedRemainingImages]
  if (!uploadedGalleryImages.length) return null

  const coverImageId = normalizeText(uploadedCoverImages[0]?.id) || normalizeText(form.coverImageId)
  return syncPrivateListingDistributionData(listingId, {
    publicationData,
    media: buildRentalListingMediaPayload({ ...form, coverImageId }, uploadedGalleryImages),
    externalLinks: [],
  }).catch((error) => {
    console.warn('[Rentals] Background rental gallery upload failed.', error)
    return null
  })
}

function formatProperty24Blocker(value = '') {
  return String(value || '')
    .replace(/^missing_/, 'missing ')
    .replace(/^listing_/, 'listing ')
    .replace(/_/g, ' ')
    .replace(/\bproperty24\b/g, 'Property24')
}

export function formatRentalProperty24ApiError(payload = {}, fallback = 'Property24 rental readiness check failed.') {
  const missing = Array.isArray(payload?.missingConfiguration) ? payload.missingConfiguration : []
  if (missing.includes('PROPERTY24_RENTAL_LIVE_PUBLISH_ENABLED=true')) {
    return 'Live Property24 rental publishing is not enabled for this environment yet.'
  }
  if (missing.length) return `Property24 setup is incomplete: ${missing.join(', ')}.`

  const preview = payload?.preview || payload?.report?.preview || {}
  const dataBlockers = Array.isArray(preview.dataBlockers) ? preview.dataBlockers : []
  const technicalBlockers = Array.isArray(preview.technicalBlockers) ? preview.technicalBlockers : []
  if (technicalBlockers.includes('sandbox_property24_agent_id_required_before_submit')) {
    return 'Property24 sandbox preview is ready, but real publishing still needs a usable Property24 agent ID.'
  }

  const blockers = [...dataBlockers, ...technicalBlockers].map(formatProperty24Blocker)
  if (blockers.length) return `Property24 cannot publish this rental yet: ${blockers.join(', ')}.`

  return String(payload?.message || payload?.error || fallback)
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
    includeMedia: true,
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

  const coverImage = getRentalCoverGalleryItem(form.galleryImages, form.coverImageId)
  const uploadedCoverImages = await uploadRentalGalleryImages(coverImage ? [coverImage] : [], listingId)
  const publicationData = buildRentalPublicationDraft(form)
  const publicationResult = await syncPrivateListingDistributionData(listingId, {
    publicationData,
    media: buildRentalListingMediaPayload(form, uploadedCoverImages),
    externalLinks: [],
  })

  void finalizeRentalListingGalleryUploads({
    listingId,
    form,
    publicationData,
    uploadedCoverImages,
  })

  void createPrivateListingActivity({
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
    activity: null,
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

  const uploadedGalleryImages = await uploadRentalGalleryImages(form.galleryImages, listingId)
  const publicationResult = await syncPrivateListingDistributionData(listingId, {
    publicationData: buildRentalListingEditPublicationDraft(form),
    media: buildRentalListingMediaPayload(form, uploadedGalleryImages),
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

export async function previewRentalProperty24Listing(listingId, options = {}) {
  const normalizedListingId = normalizeText(listingId)
  if (!normalizedListingId) throw new Error('Rental listing id is required.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in before checking Property24 rental readiness.')

  const sessionResult = await supabase.auth.getSession()
  const accessToken = sessionResult.data?.session?.access_token
  if (!accessToken) throw new Error('Sign in again before checking Property24 rental readiness.')

  const response = await fetch(`/api/property24/rentals/${encodeURIComponent(normalizedListingId)}/preview`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      maxImages: 20,
      photosChanged: true,
      ...options,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(formatRentalProperty24ApiError(payload))
  }
  return payload
}

export async function publishRentalProperty24Listing(listingId, options = {}) {
  const normalizedListingId = normalizeText(listingId)
  if (!normalizedListingId) throw new Error('Rental listing id is required.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in before publishing this rental to Property24.')

  const sessionResult = await supabase.auth.getSession()
  const accessToken = sessionResult.data?.session?.access_token
  if (!accessToken) throw new Error('Sign in again before publishing this rental to Property24.')

  const response = await fetch(`/api/property24/rentals/${encodeURIComponent(normalizedListingId)}/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      maxImages: 20,
      photosChanged: true,
      ...options,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(formatRentalProperty24ApiError(payload, 'Property24 rental publish failed.'))
  }
  return payload
}
