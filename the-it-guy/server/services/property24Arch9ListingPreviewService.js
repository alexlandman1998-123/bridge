import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { createProperty24ListingPlan } from './property24ListingMapper.js'

const execFileAsync = promisify(execFile)

export function normalizeProperty24PreviewText(value = '') {
  return String(value || '').trim()
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
  const [publication, media, existingSync] = await Promise.all([
    fetchOptionalSingle(client, 'listing_publication_data', 'listing_id', normalizedListingId),
    fetchRows(client, 'listing_media', 'listing_id', normalizedListingId),
    fetchOptionalSingle(client, 'property24_listing_syncs', 'private_listing_id', normalizedListingId),
  ])

  return {
    listing,
    publication: publication || {},
    media,
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

function shouldConvertProperty24ImageToJpeg(contentType = '') {
  const type = normalizeProperty24PreviewText(contentType).toLowerCase()
  return Boolean(type && type !== 'image/jpeg' && type !== 'image/jpg')
}

async function convertImageBufferToJpeg(buffer) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'property24-image-'))
  const inputPath = path.join(tempDir, 'input')
  const outputPath = path.join(tempDir, 'output.jpg')
  try {
    await fs.writeFile(inputPath, buffer)
    await execFileAsync('/usr/bin/sips', ['-s', 'format', 'jpeg', inputPath, '--out', outputPath])
    return await fs.readFile(outputPath)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
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
    const response = await fetchImpl(url)
    if (!response.ok) throw new Error(`Image download failed with ${response.status}.`)
    return {
      arrayBuffer: await response.arrayBuffer(),
      contentType: normalizeProperty24PreviewText(response.headers?.get?.('content-type')),
      source: 'url',
    }
  } catch (urlError) {
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
    const body = await readDownloadBody(data)
    return {
      ...body,
      source: 'supabase_storage',
    }
  }
}

export async function loadProperty24ImageBytesForPreview({
  media = [],
  fetchImpl = globalThis.fetch,
  storageClient = null,
  storageBaseUrl = '',
  maxImages = 20,
  maxBytesPerImage = 10 * 1024 * 1024,
  convertImagesToJpeg = false,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required to load image bytes.')
  const safeMaxImages = Math.max(1, Math.min(Number(maxImages) || 20, 50))
  const rows = Array.isArray(media) ? media : []
  const imageIndexes = rows
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isProperty24ImageMedia(item) && getMediaUrl(item))
    .slice(0, safeMaxImages)

  const results = []
  const nextMedia = rows.map((item) => ({ ...item }))

  for (const { item, index } of imageIndexes) {
    const url = getMediaUrl(item)
    const storageLocation = parseSupabaseStorageLocation(url)
    const storageHostMismatch = (() => {
      try {
        const configuredOrigin = normalizeProperty24PreviewText(storageBaseUrl) ? new URL(storageBaseUrl).origin : ''
        return Boolean(configuredOrigin && storageLocation?.origin && configuredOrigin !== storageLocation.origin)
      } catch {
        return false
      }
    })()
    try {
      const download = await downloadImageBytes({ url, fetchImpl, storageClient })
      const downloadedBuffer = Buffer.from(download.arrayBuffer)
      const originalByteLength = downloadedBuffer.byteLength
      if (originalByteLength > maxBytesPerImage) {
        throw new Error(`Image is ${originalByteLength} bytes, above the ${maxBytesPerImage} byte safety limit.`)
      }
      const originalContentType = normalizeProperty24PreviewText(download.contentType) || guessMimeTypeFromUrl(url)
      const convertToJpeg = convertImagesToJpeg && shouldConvertProperty24ImageToJpeg(originalContentType)
      const finalBuffer = convertToJpeg ? await convertImageBufferToJpeg(downloadedBuffer) : downloadedBuffer
      if (finalBuffer.byteLength > maxBytesPerImage) {
        throw new Error(`Image is ${finalBuffer.byteLength} bytes after conversion, above the ${maxBytesPerImage} byte safety limit.`)
      }
      const contentType = convertToJpeg ? 'image/jpeg' : originalContentType
      nextMedia[index] = {
        ...nextMedia[index],
        bytes: finalBuffer.toString('base64'),
        mimeContentType: contentType,
        mime_content_type: contentType,
      }
      results.push({
        index,
        status: 'LOADED',
        sourceUrl: sanitizeUrl(url),
        mimeContentType: contentType,
        byteLength: finalBuffer.byteLength,
        ...(convertToJpeg
          ? { convertedToJpeg: true, originalMimeContentType: originalContentType, originalByteLength }
          : {}),
        source: download.source,
        ...(storageHostMismatch ? { storageHostMismatch: true } : {}),
      })
    } catch (error) {
      results.push({
        index,
        status: 'FAILED',
        sourceUrl: sanitizeUrl(url),
        message: error.message,
        ...(storageHostMismatch ? { storageHostMismatch: true } : {}),
      })
    }
  }

  return {
    media: nextMedia,
    summary: {
      requested: imageIndexes.length,
      loaded: results.filter((result) => result.status === 'LOADED').length,
      failed: results.filter((result) => result.status === 'FAILED').length,
      convertedToJpeg: results.filter((result) => result.convertedToJpeg).length,
      skipped: Math.max(0, rows.filter(isProperty24ImageMedia).length - imageIndexes.length),
    },
    results,
  }
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
    options,
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
    nextStep: plan.canPreview
      ? 'Load actual image bytes before a real ExDev publish.'
      : 'Resolve the listed dataBlockers, then run this preview again.',
  }
}
