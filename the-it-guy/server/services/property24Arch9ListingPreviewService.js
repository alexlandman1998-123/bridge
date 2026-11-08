import { readListingAdvertisingExpiry } from './listingAdvertisingExpiry.js'
import { refreshListingPhotoUrls } from '../../src/services/listings/listingPhotoStorage.js'
import { createProperty24ListingPlan } from './property24ListingMapper.js'
import { prepareProperty24PublishingPhoto, PROPERTY24_PHOTO_PREPARATION_VERSION, PROPERTY24_PHOTO_GALLERY_TARGET, PROPERTY24_PHOTO_SOURCE_LIMIT } from './property24PhotoPreparation.js'

export function normalizeProperty24PreviewText(value = '') {
  return String(value || '').trim()
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeProperty24PreviewText(value)
    if (text) return text
  }
  return ''
}

function hydrateListingFromOnboarding(listing = {}, onboarding = {}) {
  const formData = asObject(onboarding.form_data || onboarding.formData)
  const canonicalFacts = asObject(listing.sellerCanonicalFacts || listing.seller_canonical_facts)
  const canonicalProperty = asObject(canonicalFacts.property)

  const mandateEndDate = firstText(
    listing.mandate_end_date,
    listing.mandateEndDate,
    listing.expiry_date,
    listing.expiryDate,
    formData.mandateEndDate,
    formData.mandate_end_date,
    formData.mandateExpiryDate,
    formData.mandate_expiry_date,
    formData.expiryDate,
  )
  const mandateStartDate = firstText(
    listing.mandate_start_date,
    listing.mandateStartDate,
    formData.mandateStartDate,
    formData.mandate_start_date,
    formData.listingDate,
  )
  const property24ExpiryDate = firstText(
    listing.property24_expiry_date,
    listing.property24ExpiryDate,
    formData.property24ExpiryDate,
    formData.property24_expiry_date,
  )
  const listingDescription = firstText(
    listing.listing_preview_description,
    listing.listingPreviewDescription,
    listing.description,
    formData.listingPreviewDescription,
    formData.listingDescription,
    formData.propertyNotes,
    formData.description,
  )
  const selectedFeatures = Array.isArray(formData.features)
    ? formData.features
    : Array.isArray(formData.keySellingPoints)
      ? formData.keySellingPoints
      : []

  return {
    ...listing,
    propertyCategory: firstText(listing.propertyCategory, listing.property_category, formData.propertyCategory, formData.property_category, canonicalProperty.propertyCategory),
    exactAddressVisibility: firstText(listing.exactAddressVisibility, listing.exact_address_visibility, formData.exactAddressVisibility, formData.exact_address_visibility, canonicalProperty.exactAddressVisibility),
    features: Array.isArray(listing.features) && listing.features.length ? listing.features : selectedFeatures,
    selectedFeatures: Array.isArray(listing.selectedFeatures) && listing.selectedFeatures.length ? listing.selectedFeatures : selectedFeatures,
    featureFacts: { ...asObject(listing.featureFacts), ...asObject(formData.featureFacts) },
    addressLine1: firstText(listing.addressLine1, listing.address_line_1, formData.propertyAddress),
    streetAddress: firstText(listing.streetAddress, listing.street_address, formData.streetAddress, formData.propertyAddress),
    erfSizeUnit: firstText(listing.erfSizeUnit, listing.erf_size_unit, formData.erfSizeUnit, formData.erf_size_unit),
    erfSize: firstText(listing.erfSize, listing.erf_size, formData.erfSize, formData.erf_size),
    landSizeUnit: firstText(listing.landSizeUnit, listing.land_size_unit, formData.landSizeUnit, formData.land_size_unit),
    suburb: firstText(listing.suburb, formData.suburb),
    city: firstText(listing.city, formData.city),
    province: firstText(listing.province, formData.province),
    ...(listingDescription
      ? {
          description: firstText(listing.description, listingDescription),
          listing_preview_description: firstText(listing.listing_preview_description, listingDescription),
          listingPreviewDescription: firstText(listing.listingPreviewDescription, listingDescription),
        }
      : {}),
    ...(mandateStartDate
      ? {
          mandate_start_date: firstText(listing.mandate_start_date, mandateStartDate),
          mandateStartDate: firstText(listing.mandateStartDate, mandateStartDate),
        }
      : {}),
    ...(mandateEndDate
      ? {
          mandate_end_date: firstText(listing.mandate_end_date, mandateEndDate),
          mandateEndDate: firstText(listing.mandateEndDate, mandateEndDate),
          expiry_date: firstText(listing.expiry_date, mandateEndDate),
          expiryDate: firstText(listing.expiryDate, mandateEndDate),
        }
      : {}),
    ...(property24ExpiryDate
      ? {
          property24_expiry_date: firstText(listing.property24_expiry_date, property24ExpiryDate),
          property24ExpiryDate: firstText(listing.property24ExpiryDate, property24ExpiryDate),
        }
      : {}),
  }
}

function isMissingRelationError(error) {
  const message = normalizeProperty24PreviewText(error?.message).toLowerCase()
  return error?.code === '42P01' || message.includes('does not exist') || message.includes('schema cache')
}

async function fetchRequiredSingle(client, table, column, value) {
  const normalizedValue = normalizeProperty24PreviewText(value)
  if (!normalizedValue) throw new Error(`${column} is required for ${table}.`)
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq(column, normalizedValue)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(`No ${table} row found for ${column}=${normalizedValue}.`)
  return data
}

async function fetchOptionalSingle(client, table, column, value, { orderBy = 'updated_at' } = {}) {
  const normalizedValue = normalizeProperty24PreviewText(value)
  if (!normalizedValue) return null
  const query = client
    .from(table)
    .select('*')
    .eq(column, normalizedValue)
    .order(orderBy, { ascending: false })
    .limit(1)

  const { data, error } = await query.maybeSingle()
  if (error && isMissingRelationError(error)) return null
  if (error) throw error
  return data || null
}

async function fetchRows(client, table, column, value, { orderBy = 'sort_order', ascending = true } = {}) {
  const normalizedValue = normalizeProperty24PreviewText(value)
  if (!normalizedValue) return []
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq(column, normalizedValue)
    .order(orderBy, { ascending })

  if (error && isMissingRelationError(error)) return []
  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function fetchArch9ListingForProperty24Preview({ client, listingId } = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const normalizedListingId = normalizeProperty24PreviewText(listingId)
  if (!normalizedListingId) throw new Error('--listing-id is required.')

  const listing = await fetchRequiredSingle(client, 'private_listings', 'id', normalizedListingId)
  const [publication, media, existingSync, onboarding] = await Promise.all([
    fetchOptionalSingle(client, 'listing_publication_data', 'listing_id', normalizedListingId),
    fetchRows(client, 'listing_media', 'listing_id', normalizedListingId),
    fetchOptionalSingle(client, 'property24_listing_syncs', 'private_listing_id', normalizedListingId),
    fetchOptionalSingle(client, 'private_listing_seller_onboarding', 'private_listing_id', normalizedListingId),
  ])

  const advertisingExpiry = await readListingAdvertisingExpiry(client, normalizedListingId, 'property24', onboarding?.form_data?.listingExpiryDate || '')

  return {
    listing: hydrateListingFromOnboarding(listing, onboarding || {}),
    publication: { ...(publication || {}), ...(advertisingExpiry ? { property24ExpiryDate: advertisingExpiry, advertisingExpiryDate: advertisingExpiry } : {}) },
    media: listing.listing_category === 'rental' ? await refreshListingPhotoUrls(client, media, { strict: true }) : media,
    existingSync: existingSync || {},
  }
}

export async function fetchRecentArch9ListingsForProperty24Preview({ client, limit = 10 } = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 25))
  const { data, error } = await client
    .from('private_listings')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(safeLimit)

  if (error) throw error
  return (Array.isArray(data) ? data : []).map((listing) => ({
    id: normalizeProperty24PreviewText(listing.id),
    listingReference: normalizeProperty24PreviewText(listing.listing_reference || listing.listingReference),
    title: normalizeProperty24PreviewText(listing.title),
    suburb: normalizeProperty24PreviewText(listing.suburb),
    city: normalizeProperty24PreviewText(listing.city),
    province: normalizeProperty24PreviewText(listing.province),
    propertyType: normalizeProperty24PreviewText(listing.property_type || listing.propertyType),
    askingPrice: listing.asking_price ?? listing.askingPrice ?? null,
    listingStatus: normalizeProperty24PreviewText(listing.listing_status || listing.listingStatus),
    updatedAt: normalizeProperty24PreviewText(listing.updated_at || listing.updatedAt),
  }))
}

function isProperty24ImageMedia(item = {}) {
  const mediaType = normalizeProperty24PreviewText(item.media_type || item.mediaType || 'image').toLowerCase()
  return mediaType === 'image' || mediaType === 'floor_plan'
}

function getMediaUrl(item = {}) {
  return normalizeProperty24PreviewText(
    item.file_url ||
      item.fileUrl ||
      item.url ||
      item.publicUrl ||
      item.public_url ||
      item.signedUrl ||
      item.signed_url,
  )
}

function guessMimeTypeFromUrl(url = '') {
  const lower = normalizeProperty24PreviewText(url).toLowerCase()
  if (lower.includes('.png')) return 'image/png'
  if (lower.includes('.webp')) return 'image/webp'
  if (lower.includes('.gif')) return 'image/gif'
  return 'image/jpeg'
}

function parseSupabaseStorageLocation(url = '') {
  const text = normalizeProperty24PreviewText(url)
  if (!text) return null
  try {
    const parsed = new URL(text)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const objectIndex = parts.findIndex((part, index) => part === 'object' && parts[index - 1] === 'v1')
    if (objectIndex === -1) return null
    const visibility = parts[objectIndex + 1]
    if (!['sign', 'public'].includes(visibility)) return null
    const bucket = parts[objectIndex + 2]
    const objectPath = parts.slice(objectIndex + 3).map(decodeURIComponent).join('/')
    if (!bucket || !objectPath) return null
    return { bucket, objectPath, origin: parsed.origin }
  } catch {
    return null
  }
}

function formatErrorMessage(error) {
  const message = normalizeProperty24PreviewText(error?.message)
  if (message) return message
  try {
    const json = JSON.stringify(error)
    if (json && json !== '{}') return json
  } catch {
    // Ignore JSON formatting failures and fall through to the generic message.
  }
  return 'Unknown error'
}

async function readDownloadBody(download) {
  if (!download) return { arrayBuffer: new ArrayBuffer(0), contentType: '' }
  if (typeof download.arrayBuffer === 'function') {
    return {
      arrayBuffer: await download.arrayBuffer(),
      contentType: normalizeProperty24PreviewText(download.type),
    }
  }
  if (download instanceof ArrayBuffer) return { arrayBuffer: download, contentType: '' }
  if (ArrayBuffer.isView(download)) {
    return {
      arrayBuffer: download.buffer.slice(download.byteOffset, download.byteOffset + download.byteLength),
      contentType: '',
    }
  }
  throw new Error('Downloaded image body cannot be converted to bytes.')
}

async function downloadImageBytes({ url, fetchImpl, storageClient }) {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Image download failed with ${response.status}.`)
    if (Number(response.headers?.get?.('content-length')) > PROPERTY24_PHOTO_SOURCE_LIMIT) throw new Error('Original photo exceeds the processing size limit.')
    let arrayBuffer
    if (response.body?.getReader) {
      const reader = response.body.getReader()
      const chunks = []
      let length = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          length += value.byteLength
          if (length > PROPERTY24_PHOTO_SOURCE_LIMIT) throw new Error('Original photo exceeds the processing size limit.')
          chunks.push(value)
        }
        arrayBuffer = Buffer.concat(chunks, length)
      } finally { await reader.cancel().catch(() => {}) }
    } else arrayBuffer = await response.arrayBuffer()
    return {
      arrayBuffer,
      contentType: normalizeProperty24PreviewText(response.headers?.get?.('content-type')),
      source: 'url',
    }
  } catch (urlError) {
    if (urlError.message === 'Original photo exceeds the processing size limit.') {
      throw Object.assign(new Error('This original is too large to process safely. Contact support for help preparing it; the original has not been changed.'), { code: 'PHOTO_SOURCE_TOO_LARGE' })
    }
    const storageLocation = parseSupabaseStorageLocation(url)
    if (!storageClient || !storageLocation) throw urlError
    const { data, error } = await storageClient.storage
      .from(storageLocation.bucket)
      .download(storageLocation.objectPath)
    if (error) {
      throw new Error(
        `Supabase storage download failed for ${storageLocation.bucket}/${storageLocation.objectPath}: ${formatErrorMessage(error)}`,
      )
    }
    if (Number(data?.size) > PROPERTY24_PHOTO_SOURCE_LIMIT) throw Object.assign(new Error('This original is too large to process safely. Contact support for help preparing it; the original has not been changed.'), { code: 'PHOTO_SOURCE_TOO_LARGE' })
    const body = await readDownloadBody(data)
    return {
      ...body,
      source: 'supabase_storage',
    }
  }
}

export async function loadProperty24ImageBytesForPreview({
  media = [], fetchImpl = globalThis.fetch, storageClient = null, storageBaseUrl = '',
  maxImages = null, maxBytesPerImage = 10 * 1024 * 1024, maxTotalImageBytes = 60_000_000,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required to prepare listing photos.')
  if (!(maxBytesPerImage > 0) || !(maxTotalImageBytes > 0)) throw new Error('Photo size allowances must be positive.')
  const rows = Array.isArray(media) ? media : []
  const indexedMedia = rows.map((item, index) => ({ item, index }))
    .filter(({ item }) => isProperty24ImageMedia(item))
    .sort((left, right) => {
      const cover = Number(Boolean(right.item.is_cover ?? right.item.isCover)) - Number(Boolean(left.item.is_cover ?? left.item.isCover))
      return cover || (Number(left.item.sort_order ?? left.item.sortOrder ?? left.index) || 0) - (Number(right.item.sort_order ?? right.item.sortOrder ?? right.index) || 0)
    })
  const imageCount = indexedMedia.filter(({ item }) => String(item.media_type || item.mediaType || 'image').toLowerCase() === 'image').length
  const photoNumbers = new Map([...indexedMedia]
    .sort((left, right) => (Number(left.item.sort_order ?? left.item.sortOrder ?? left.index) || 0) - (Number(right.item.sort_order ?? right.item.sortOrder ?? right.index) || 0))
    .map(({ index }, position) => [index, position + 1]))
  const planCount = indexedMedia.length - imageCount
  const selectionError = Number(maxImages) > 0 && imageCount > Math.floor(Number(maxImages))
    ? `The selected photo limit excludes part of this ${imageCount}-photo gallery. Include the whole gallery before publishing.`
    : planCount > 5 ? 'This publishing process permits at most five floor plan images per submission. Remove the extra floor plans from this submission before publishing.' : ''
  const galleryBudget = Math.min(maxTotalImageBytes, PROPERTY24_PHOTO_GALLERY_TARGET)
  const targetBytes = Math.floor(Math.min(maxBytesPerImage, 512_000, galleryBudget / Math.max(1, indexedMedia.length)))
  const nextMedia = rows.map(item => {
    const copy = { ...item }
    if (isProperty24ImageMedia(item)) for (const key of ['bytes', 'base64', 'base64Bytes', 'base64_bytes']) delete copy[key]
    return copy
  })
  const results = new Array(indexedMedia.length)
  let totalImageBytes = 0
  async function prepareImage({ item, index }) {
    const url = getMediaUrl(item)
    const photoNumber = photoNumbers.get(index)
    const photoLabel = `Photo ${photoNumber}${item.caption || item.name ? ` (${String(item.caption || item.name).slice(0, 100)})` : ''}`
    let downloaded = false
    try {
      if (selectionError) throw new Error(selectionError)
      if (!url) throw new Error('This photo has no saved file. Upload it again, save the listing, then check again.')
      const download = await downloadImageBytes({ url, fetchImpl, storageClient })
      downloaded = true
      const original = Buffer.isBuffer(download.arrayBuffer) ? download.arrayBuffer : Buffer.from(download.arrayBuffer)
      const prepared = await prepareProperty24PublishingPhoto(original, targetBytes)
      return { buffer: prepared.buffer, result: {
        index, photoNumber, photoLabel, mediaId: item.id || null, status: 'LOADED',
        sourceUrl: sanitizeUrl(url), source: download.source, mimeContentType: 'image/jpeg',
        byteLength: prepared.buffer.byteLength, originalByteLength: original.byteLength,
        originalMimeContentType: normalizeProperty24PreviewText(download.contentType) || guessMimeTypeFromUrl(url),
        convertedToJpeg: prepared.originalFormat !== 'jpeg', publishingCopy: true,
        width: prepared.width, height: prepared.height, quality: prepared.quality,
        ...(storageBaseUrl && parseSupabaseStorageLocation(url)?.origin && new URL(storageBaseUrl).origin !== parseSupabaseStorageLocation(url).origin ? { storageHostMismatch: true } : {}),
      } }
    } catch (error) {
      return { result: { index, photoNumber, photoLabel, mediaId: item.id || null, status: 'FAILED',
        sourceUrl: sanitizeUrl(url), message: `${photoLabel}: ${downloaded || selectionError || !url || error.code === 'PHOTO_SOURCE_TOO_LARGE' ? error.message : 'The saved file could not be downloaded. Check the photo, retry the check, or upload it again.'}` } }
    }
  }
  // Keep at most two originals/decoders in flight, replacing each completed job
  // immediately so one slow file cannot leave the other slot idle. Store by
  // gallery position rather than completion order; originals stay untouched.
  let nextIndex = 0
  async function prepareNext() {
    while (nextIndex < indexedMedia.length) {
      const position = nextIndex++
      const { buffer, result } = await prepareImage(indexedMedia[position])
      if (result.status === 'LOADED') {
        totalImageBytes += buffer.byteLength
        nextMedia[result.index] = { ...nextMedia[result.index], bytes: buffer.toString('base64'), mimeContentType: 'image/jpeg', mime_content_type: 'image/jpeg' }
      }
      results[position] = result
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, indexedMedia.length) }, prepareNext))
  return { media: nextMedia, results, summary: {
    preparationVersion: PROPERTY24_PHOTO_PREPARATION_VERSION,
    requested: indexedMedia.length, loaded: results.filter(row => row.status === 'LOADED').length,
    failed: results.filter(row => row.status === 'FAILED').length, skipped: 0,
    convertedToJpeg: results.filter(row => row.convertedToJpeg).length,
    publishingCopies: results.filter(row => row.publishingCopy).length,
    totalImageBytes, galleryBudget, targetBytesPerPhoto: targetBytes,
  } }
}

function sanitizeUrl(value = '') {
  const text = normalizeProperty24PreviewText(value)
  if (!text) return null
  try {
    const url = new URL(text)
    url.search = ''
    return String(url)
  } catch {
    return text.split('?')[0] || text
  }
}

function sanitizePreviewPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload
  return {
    ...payload,
    photos: Array.isArray(payload.photos)
      ? payload.photos.map((photo) => ({
          ...photo,
          sourceUrl: sanitizeUrl(photo.sourceUrl),
        }))
      : payload.photos,
  }
}

function getProperty24PreviewNextStep(plan = {}) {
  if (!plan.canPreview) return 'Resolve the listed dataBlockers, then run this preview again.'
  if ((plan.technicalBlockers || []).includes('sandbox_property24_agent_id_required_before_submit')) {
    return 'Sandbox payload is ready for review. Property24 must return a real agent ID before submit.'
  }
  if (!plan.canSubmit) return 'Resolve the listed technicalBlockers before publishing to Property24.'
  return 'Preview passed. This is ready for a controlled publish through the configured Property24 connection.'
}

export function createProperty24Arch9ListingPreview({
  listing = {},
  publication = {},
  media = [],
  existingSync = {},
  agentMapping = {},
  catalogMapping = {},
  imageByteLoad = null,
  options = {},
} = {}) {
  const plan = createProperty24ListingPlan({
    listing,
    publication,
    media,
    existingSync,
    agentMapping,
    catalogMapping,
    options: { ...options, ...(publication.advertisingExpiryDate ? { expiryDate: publication.advertisingExpiryDate } : {}) },
  })

  return {
    phase: 'property24-real-listing-preview',
    generatedAt: new Date().toISOString(),
    safety: {
      property24ApiCalled: false,
      databaseWritten: false,
      listingPublished: false,
    },
    status: plan.canPreview ? 'PREVIEW_READY' : 'BLOCKED',
    canPreview: plan.canPreview,
    canSubmit: plan.canSubmit,
    dataBlockers: plan.dataBlockers,
    technicalBlockers: plan.technicalBlockers,
    qualityWarnings: plan.qualityWarnings,
    summary: plan.summary,
    source: {
      privateListingId: normalizeProperty24PreviewText(listing.id),
      listingReference: normalizeProperty24PreviewText(listing.listing_reference || listing.listingReference),
      publicationFound: Boolean(publication && Object.keys(publication).length),
      mediaRows: Array.isArray(media) ? media.length : 0,
      existingProperty24ListingNumber: plan.summary.listingNumber,
    },
    ...(imageByteLoad ? { imageByteLoad } : {}),
    ...(options.includeSubmitPayload ? { payload: plan.payload } : {}),
    previewPayload: sanitizePreviewPayload(plan.previewPayload),
    nextStep: getProperty24PreviewNextStep(plan),
  }
}
