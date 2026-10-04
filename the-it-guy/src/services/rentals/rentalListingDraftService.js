import {
  createPrivateListing,
  createPrivateListingActivity,
  getAgentPrivateListings,
  getPrivateListing,
  saveRentalListingSnapshot,
  signPrivateListingMediaAsset,
  uploadPrivateListingMediaAsset,
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
import { buildRentalMediaEdits } from './rentalListingMediaModel'

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

export async function uploadRentalGalleryImages(galleryImages = [], listingId, { onUploadProgress } = {}) {
  const normalizedImages = normalizeGalleryItems(galleryImages)
  const uploadedImages = [...normalizedImages]
  let nextIndex = 0
  let completed = 0
  let failure = null
  const reportProgress = () => onUploadProgress?.({ completed, total: normalizedImages.length })
  reportProgress()
  // Storage permission checks use database connections too. Keep large photo
  // galleries from flooding the pool, and stop queuing work after a failure.
  async function uploadNext() {
    while (!failure && nextIndex < normalizedImages.length) {
      const index = nextIndex++
      const item = normalizedImages[index]
      try {
        if (!item.file) {
          if (!isPersistableMediaUrl(item.url || item.signedUrl || item.publicUrl)) {
            throw new Error('Select the original photo again before saving.')
          }
          completed += 1
          reportProgress()
          continue
        }
        const asset = item.path && item.bucket
          ? await signPrivateListingMediaAsset({ path: item.path, bucket: item.bucket, fileName: item.name, contentType: item.contentType, size: item.size })
          : await uploadPrivateListingMediaAsset(item.file, { listingId, type: 'gallery', upsert: false, requireSignedUrl: true })
        const url = asset.url || asset.signedUrl || asset.publicUrl
        if (!isPersistableMediaUrl(url)) throw new Error('Storage did not return a saved photo URL.')
        uploadedImages[index] = {
          id: item.id,
          name: asset.fileName || item.name,
          url,
          signedUrl: asset.signedUrl || '',
          publicUrl: asset.publicUrl || '',
          path: asset.path || '',
          bucket: asset.bucket || '',
          contentType: asset.contentType || item.contentType || '',
          size: asset.size || item.size || 0,
        }
        completed += 1
        reportProgress()
      } catch (error) {
        if (error.savedAsset) {
          uploadedImages[index] = { ...item, path: error.savedAsset.path, bucket: error.savedAsset.bucket }
        }
        failure ||= error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, normalizedImages.length) }, uploadNext))
  if (failure) {
    const remaining = normalizedImages.length - completed
    const error = new Error(`Could not save ${remaining} rental image${remaining === 1 ? '' : 's'} to the listing. ${failure?.message || 'Storage upload failed.'} Retry saving to continue on the same listing; your selected photos and successful uploads are retained.`)
    error.galleryImages = uploadedImages
    error.cause = failure
    throw error
  }
  return uploadedImages.map(stripUploadOnlyFields)
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

function stableJson(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(stableJson(item))))
  if (value && typeof value === 'object') {
    return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map((key) => [key, JSON.parse(stableJson(value[key]))])))
  }
  return JSON.stringify(value ?? null)
}

function mediaSnapshot(rows = []) {
  return rows.map((row) => ({ id: row.id, type: row.media_type, url: row.file_url, caption: row.caption || '', order: row.sort_order, cover: Boolean(row.is_cover) }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
}

function linkSnapshot(rows = []) {
  return rows.map((row) => ({ id: row.id, platform: row.platform, url: row.url, status: row.status,
    published: row.publishedAt || row.published_at || '', checked: row.lastCheckedAt || row.last_checked_at || '',
    notes: row.notes || '', visible: Boolean(row.visibleToSeller ?? row.visible_to_seller) }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
}

async function saveRentalListingMedia(listingId, form, publicationData, context, existingListing) {
  let galleryImages = form.galleryImages
  let receipt = null
  try {
    galleryImages = await uploadRentalGalleryImages(galleryImages, listingId, context)
    context.onUploadProgress?.({ completed: galleryImages.length, total: galleryImages.length, phase: 'saving' })
    const media = buildRentalListingMediaPayload(form, galleryImages)
    const coverIndex = galleryImages.findIndex((image) => image.id === media.coverImageId)
    const listingPatch = buildRentalListingUpdatePayload(form, existingListing)
    const mediaEdits = context.galleryOnly ? [] : buildRentalMediaEdits(form, existingListing)
    receipt = await saveRentalListingSnapshot(listingId, {
      expectedUpdatedAt: form.expectedUpdatedAt || existingListing.updatedAt || existingListing.updated_at,
      listingPatch,
      publicationData,
      galleryImages,
      coverIndex,
      mediaEdits,
      galleryOnly: context.galleryOnly === true,
    })
    const savedPhotos = receipt.media.filter((row) => row.media_type === 'image').sort((left, right) => left.sort_order - right.sort_order)
    for (const edit of mediaEdits) {
      const saved = receipt.media.find((row) => edit.id ? row.id === edit.id : row.media_type === edit.type && row.file_url === edit.url)
      if ((edit.url && (!saved || saved.media_type !== edit.type || saved.file_url !== edit.url)) || (!edit.url && edit.id && saved)) {
        throw new Error('The saved video or virtual tour does not match your changes. Reload before retrying.')
      }
    }
    if (savedPhotos.length !== galleryImages.length || savedPhotos.some((row, index) => row.file_url !== galleryImages[index].url || row.is_cover !== (index === coverIndex))) {
      throw new Error('The saved gallery does not match the selected photos and cover. Reload before retrying.')
    }
    const listing = await getPrivateListing(listingId, { includeRequirementsAndDocuments: false, requireDistributionData: true })
    const publication = listing?.listingPublicationData
    const publicationFields = { title: 'title', address: 'address', suburb: 'suburb', province: 'province', propertyType: 'property_type',
      listingType: 'listing_type', askingPrice: 'asking_price', bedrooms: 'bedrooms', bathrooms: 'bathrooms', garages: 'garages',
      parkingBays: 'parking_bays', floorSize: 'floor_size', erfSize: 'erf_size', description: 'description', features: 'features', amenities: 'amenities', status: 'status' }
    const publicationMatches = context.galleryOnly || (publication && receipt.publication && Object.entries(publicationFields).every(([field, column]) =>
      stableJson(publication[field]) === stableJson(receipt.publication[column])))
    if (!listing || listing.id !== listingId || new Date(listing.updatedAt).getTime() !== new Date(receipt.updatedAt).getTime()
      || (!context.galleryOnly && stableJson(receipt.facts) !== stableJson(listingPatch.sellerCanonicalFacts))
      || stableJson(listing.sellerCanonicalFacts) !== stableJson(receipt.facts)
      || (!context.galleryOnly && !publicationMatches)
      || stableJson(mediaSnapshot(listing.listingMedia)) !== stableJson(mediaSnapshot(receipt.media))
      || stableJson(linkSnapshot(listing.listingExternalLinks)) !== stableJson(linkSnapshot(receipt.externalLinks))) {
      throw new Error('The refreshed rental does not match the saved details. Reload before retrying.')
    }
    return { skipped: false, listing, publication: receipt.publication, mediaCount: receipt.media.length, externalLinkCount: receipt.externalLinks.length }
  } catch (error) {
    const saveError = new Error(`Rental ${listingId} save is not confirmed. ${error?.message || 'Reload before retrying; the save may have completed.'}`)
    saveError.listingId = listingId
    saveError.galleryImages = error.galleryImages || galleryImages
    saveError.committed = Boolean(receipt)
    saveError.code = receipt ? 'RENTAL_SAVE_READBACK_FAILED' : error.code || 'RENTAL_SAVE_UNCONFIRMED'
    saveError.cause = error
    throw saveError
  }
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
  context.onListingCreated?.(listingId)
  const publicationData = buildRentalPublicationDraft(form)
  const publicationResult = await saveRentalListingMedia(listingId, form, publicationData, context, created.listing)

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
    listing: publicationResult.listing,
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

  const existingListing = await getPrivateListing(listingId, { includeRequirementsAndDocuments: false })
  if (!existingListing || !isRentalListingRecord(existingListing)) throw new Error('Rental listing not found. Reload before saving changes.')

  const publicationData = {
    ...buildRentalListingEditPublicationDraft(form),
    ...(normalizeText(context.publicationStatus) ? { status: normalizeText(context.publicationStatus) } : {}),
  }
  const publicationResult = await saveRentalListingMedia(listingId, form, publicationData, context, existingListing)

  void createPrivateListingActivity({
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
    listing: publicationResult.listing,
    publicationResult,
    activity: null,
  }
}

// Photo controls must also work on older rentals with incomplete capture fields.
// The gallery RPC changes no listing facts or publication details.
export async function updateRentalListingGallery(listingId, form, context = {}) {
  const existingListing = await getPrivateListing(listingId, { includeRequirementsAndDocuments: false })
  if (!existingListing || !isRentalListingRecord(existingListing)) throw new Error('Rental listing not found. Reload before saving photos.')
  const result = await saveRentalListingMedia(listingId, form, null, { ...context, galleryOnly: true }, existingListing)
  return { listing: result.listing, publicationResult: result }
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

export async function expireRentalProperty24Listing(listingId) {
  const normalizedListingId = normalizeText(listingId)
  if (!normalizedListingId) throw new Error('Rental listing id is required.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in before updating Property24.')
  const sessionResult = await supabase.auth.getSession()
  const accessToken = sessionResult.data?.session?.access_token
  if (!accessToken) throw new Error('Sign in again before updating Property24.')
  const response = await fetch(`/api/property24/rentals/${encodeURIComponent(normalizedListingId)}/status-update`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Expired', listingStatus: 'Expired' }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(formatRentalProperty24ApiError(payload, 'Property24 rental expiry failed.'))
  return payload
}

export async function withdrawRentalProperty24Listing(listingId) {
  const normalizedListingId = normalizeText(listingId)
  if (!normalizedListingId) throw new Error('Rental listing id is required.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in before updating Property24.')
  const sessionResult = await supabase.auth.getSession()
  const accessToken = sessionResult.data?.session?.access_token
  if (!accessToken) throw new Error('Sign in again before updating Property24.')
  const response = await fetch(`/api/property24/rentals/${encodeURIComponent(normalizedListingId)}/withdraw`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(formatRentalProperty24ApiError(payload, 'Property24 rental withdrawal failed.'))
  return payload
}

async function callPrivatePropertyRentalAction(listingId, action, body = {}, { method = 'POST' } = {}) {
  const normalizedListingId = normalizeText(listingId)
  if (!normalizedListingId) throw new Error('Rental listing id is required.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in before using Private Property publishing.')

  const sessionResult = await supabase.auth.getSession()
  const accessToken = sessionResult.data?.session?.access_token
  if (!accessToken) throw new Error('Sign in again before using Private Property publishing.')

  const response = await fetch(`/api/private-property/listings/${encodeURIComponent(normalizedListingId)}/${action}?environment=production`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(method === 'GET' ? {} : { body: JSON.stringify({ environment: 'production', photosChanged: true, ...body }) }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(String(payload?.message || 'Private Property rental request failed.'))
  return payload
}

export function previewPrivatePropertyRentalListing(listingId) {
  return callPrivatePropertyRentalAction(listingId, 'preview')
}

export function publishPrivatePropertyRentalListing(listingId) {
  const normalizedListingId = normalizeText(listingId)
  return callPrivatePropertyRentalAction(
    normalizedListingId,
    'publish',
    { confirm: `PRIVATE_PROPERTY_PUBLISH:${normalizedListingId}:production` },
  )
}

export function expirePrivatePropertyRentalListing(listingId) {
  const normalizedListingId = normalizeText(listingId)
  return callPrivatePropertyRentalAction(normalizedListingId, 'status-update', {
    propertyStatus: 'Inactive',
    status: 'Inactive',
  })
}
