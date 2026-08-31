import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import net from 'node:net'
import sharp from 'sharp'

export const PROPERTY24_MIGRATION_IMAGE_IMPORT_VERSION = 'property24_migration_image_import_v1'
export const PROPERTY24_MIGRATION_IMAGE_BUCKET = 'listing-media'
export const PROPERTY24_MIGRATION_IMAGE_MAX_BYTES = 15 * 1024 * 1024
export const PROPERTY24_MIGRATION_IMAGE_SOURCE_HOST_SUFFIXES = Object.freeze([
  'property24-test.com',
  'property24.com',
  'prop24.com',
])

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

function text(value) {
  return String(value ?? '').trim()
}

function integer(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))
}

function stableValue(input) {
  if (Array.isArray(input)) return input.map(stableValue)
  if (!input || typeof input !== 'object') return input
  return Object.fromEntries(Object.keys(input).sort().map((key) => [key, stableValue(input[key])]))
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function fingerprint(input) {
  return sha256(JSON.stringify(stableValue(input)))
}

function issue(code, message, context = {}) {
  return { code, message, ...context }
}

function createImportError(code, message, details = {}) {
  const error = new Error(message)
  error.code = code
  Object.assign(error, details)
  return error
}

function normalizeHostSuffix(value) {
  return text(value).toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '')
}

function isAllowedHost(hostname, allowedHostSuffixes) {
  const host = text(hostname).toLowerCase().replace(/\.+$/, '')
  return allowedHostSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

function parseHttpsSourceUrl(value, allowedHostSuffixes) {
  let parsed
  try {
    parsed = new URL(text(value))
  } catch {
    throw createImportError('invalid_source_url', 'Image source URL is invalid.')
  }
  if (parsed.protocol !== 'https:') throw createImportError('unsafe_source_protocol', 'Image source URL must use HTTPS.')
  if (parsed.username || parsed.password) throw createImportError('source_credentials_forbidden', 'Image source URL must not contain credentials.')
  if (parsed.port && parsed.port !== '443') throw createImportError('unsafe_source_port', 'Image source URL must use the default HTTPS port.')
  if (net.isIP(parsed.hostname) || parsed.hostname === 'localhost') {
    throw createImportError('unsafe_source_host', 'Image source URL must use an approved public hostname.')
  }
  if (!isAllowedHost(parsed.hostname, allowedHostSuffixes)) {
    throw createImportError('source_host_not_allowed', `Image source hostname ${parsed.hostname} is not allowed.`)
  }
  parsed.hash = ''
  return parsed
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && [18, 19].includes(b))
}

function isPrivateIp(address) {
  const normalized = text(address).toLowerCase().split('%')[0]
  const family = net.isIP(normalized)
  if (family === 4) return isPrivateIpv4(normalized)
  if (family !== 6) return true
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mapped ? isPrivateIpv4(mapped[1]) : false
}

async function assertPublicDns(hostname, dnsLookup = dns.lookup) {
  let addresses
  try {
    addresses = await dnsLookup(hostname, { all: true, verbatim: true })
  } catch (error) {
    throw createImportError('source_dns_failed', `Could not resolve image source hostname ${hostname}.`, { cause: error })
  }
  const records = Array.isArray(addresses) ? addresses : [addresses]
  if (!records.length || records.some((record) => isPrivateIp(record?.address))) {
    throw createImportError('unsafe_source_dns', `Image source hostname ${hostname} resolved to a non-public address.`)
  }
}

function sniffImage(buffer) {
  if (buffer.length >= 12 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { contentType: 'image/jpeg', extension: 'jpg', sharpFormat: 'jpeg' }
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { contentType: 'image/png', extension: 'png', sharpFormat: 'png' }
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { contentType: 'image/webp', extension: 'webp', sharpFormat: 'webp' }
  }
  const gifHeader = buffer.toString('ascii', 0, 6)
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    return { contentType: 'image/gif', extension: 'gif', sharpFormat: 'gif' }
  }
  if (buffer.length >= 16 && buffer.toString('ascii', 4, 8) === 'ftyp' && /^(?:avif|avis)$/.test(buffer.toString('ascii', 8, 12))) {
    return { contentType: 'image/avif', extension: 'avif', sharpFormat: 'heif' }
  }
  throw createImportError('unsupported_image_content', 'Downloaded content is not a supported JPEG, PNG, WebP, GIF or AVIF image.')
}

async function inspectImage(buffer, detected) {
  let metadata
  try {
    metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: 80_000_000 }).metadata()
  } catch (error) {
    throw createImportError('image_decode_failed', 'Downloaded image could not be decoded safely.', { cause: error })
  }
  if (!metadata.width || !metadata.height) throw createImportError('image_dimensions_missing', 'Downloaded image has no usable dimensions.')
  if (metadata.width * metadata.height > 80_000_000) throw createImportError('image_dimensions_exceeded', 'Downloaded image exceeds the 80 megapixel safety limit.')
  if (metadata.format && metadata.format !== detected.sharpFormat && !(detected.contentType === 'image/avif' && metadata.format === 'heif')) {
    throw createImportError('image_format_mismatch', 'Downloaded image signature and decoder format do not match.')
  }
  return {
    width: metadata.width,
    height: metadata.height,
    pages: metadata.pages || 1,
  }
}

async function readResponseBuffer(response, maxBytes) {
  const declaredLength = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw createImportError('image_too_large', `Image declares ${declaredLength} bytes; the limit is ${maxBytes}.`)
  }
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > maxBytes) throw createImportError('image_too_large', `Image exceeds the ${maxBytes} byte limit.`)
    return buffer
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      total += chunk.length
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw createImportError('image_too_large', `Image exceeds the ${maxBytes} byte limit.`)
      }
      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock?.()
  }
  return Buffer.concat(chunks, total)
}

function isTransientError(error) {
  const status = Number(error?.status || error?.statusCode)
  return TRANSIENT_HTTP_STATUSES.has(status) || ['fetch_failed', 'source_timeout', 'upload_transient'].includes(error?.code)
}

async function withRetries(action, attempts) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action(attempt)
    } catch (error) {
      lastError = error
      if (attempt >= attempts || !isTransientError(error)) throw error
    }
  }
  throw lastError
}

export async function downloadProperty24MigrationImage(sourceUrl, {
  fetchImpl = globalThis.fetch,
  dnsLookup = dns.lookup,
  allowedHostSuffixes = PROPERTY24_MIGRATION_IMAGE_SOURCE_HOST_SUFFIXES,
  maxBytes = PROPERTY24_MIGRATION_IMAGE_MAX_BYTES,
  timeoutMs = 30_000,
  maxRedirects = 3,
  attempts = 3,
  imageInspector = inspectImage,
} = {}) {
  if (typeof fetchImpl !== 'function') throw createImportError('fetch_unavailable', 'A Fetch implementation is required.')
  const allowed = [...new Set(allowedHostSuffixes.map(normalizeHostSuffix).filter(Boolean))]
  if (!allowed.length) throw createImportError('source_allowlist_empty', 'At least one Property24 image hostname suffix is required.')
  return withRetries(async () => {
    let current = parseHttpsSourceUrl(sourceUrl, allowed)
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      await assertPublicDns(current.hostname, dnsLookup)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      let response
      try {
        response = await fetchImpl(current, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            Accept: 'image/avif,image/webp,image/jpeg,image/png,image/gif',
            'User-Agent': 'Arch9-Property24-Migration/1.0',
          },
        })
        if (REDIRECT_STATUSES.has(response.status)) {
          const location = response.headers?.get?.('location')
          if (!location) throw createImportError('redirect_location_missing', 'Image source returned a redirect without a location.')
          if (redirectCount === maxRedirects) throw createImportError('redirect_limit_exceeded', 'Image source exceeded the redirect limit.')
          if (response.body?.cancel) await response.body.cancel().catch(() => {})
          current = parseHttpsSourceUrl(new URL(location, current).toString(), allowed)
          continue
        }
        if (!response.ok) {
          const error = createImportError('source_http_error', `Image source returned HTTP ${response.status}.`, { status: response.status })
          if (TRANSIENT_HTTP_STATUSES.has(response.status)) error.code = 'fetch_failed'
          throw error
        }
        const buffer = await readResponseBuffer(response, maxBytes)
        const detected = sniffImage(buffer)
        const declaredType = text(response.headers?.get?.('content-type')).toLowerCase().split(';')[0]
        if (declaredType && declaredType !== 'application/octet-stream' && !declaredType.startsWith('image/')) {
          throw createImportError('source_content_type_invalid', `Image source returned ${declaredType} instead of an image content type.`)
        }
        const dimensions = await imageInspector(buffer, detected)
        return {
          sourceUrl: current.toString(),
          buffer,
          byteLength: buffer.length,
          sha256: sha256(buffer),
          ...detected,
          ...dimensions,
        }
      } catch (error) {
        if (error?.name === 'AbortError') throw createImportError('source_timeout', `Image download exceeded ${timeoutMs} ms.`, { cause: error })
        if (error?.code) throw error
        throw createImportError('fetch_failed', `Image download failed: ${error.message}`, { cause: error })
      } finally {
        clearTimeout(timeout)
      }
    }
    throw createImportError('redirect_limit_exceeded', 'Image source exceeded the redirect limit.')
  }, attempts)
}

function normalizeListingIds(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
  return source.listings && typeof source.listings === 'object' ? source.listings : source
}

export function createProperty24MigrationImageImportPlan(mappingPlan = {}, {
  bucket = PROPERTY24_MIGRATION_IMAGE_BUCKET,
  allowedHostSuffixes = PROPERTY24_MIGRATION_IMAGE_SOURCE_HOST_SUFFIXES,
  listingIds = {},
} = {}) {
  const blockers = []
  const items = []
  const context = mappingPlan.context || {}
  const organisationId = text(context.organisationId)
  const environment = text(context.environment).toLowerCase()
  const agencyId = integer(context.agencyId)
  const normalizedListingIds = normalizeListingIds(listingIds)
  const allowed = [...new Set(allowedHostSuffixes.map(normalizeHostSuffix).filter(Boolean))]

  if (mappingPlan.status === 'BLOCKED') blockers.push(issue('mapping_plan_blocked', 'The Phase 2 mapping plan is blocked.'))
  if (!isUuid(organisationId)) blockers.push(issue('organisation_id_invalid', 'The mapping plan needs a valid Arch9 organisation UUID.'))
  if (!['exdev', 'production'].includes(environment)) blockers.push(issue('environment_invalid', 'The mapping plan environment must be exdev or production.'))
  if (!agencyId || agencyId <= 0) blockers.push(issue('agency_id_invalid', 'The mapping plan needs a positive Property24 agency ID.'))
  if (!text(bucket)) blockers.push(issue('storage_bucket_missing', 'A storage bucket is required.'))
  if (!allowed.length) blockers.push(issue('source_allowlist_empty', 'At least one source hostname suffix is required.'))

  for (const listing of Array.isArray(mappingPlan.listingPlans) ? mappingPlan.listingPlans : []) {
    const listingNumber = integer(listing.listingNumber)
    const listingIdentityKey = text(listing.identityKey)
    const arch9ListingId = text(normalizedListingIds[listingIdentityKey] || normalizedListingIds[String(listingNumber)] || '')
    if (arch9ListingId && !isUuid(arch9ListingId)) {
      blockers.push(issue('listing_id_invalid', `Arch9 listing ID for ${listingNumber} is not a UUID.`, { listingNumber }))
    }
    const images = Array.isArray(listing.mediaPlan?.images) ? [...listing.mediaPlan.images] : []
    images.sort((left, right) => {
      const ordinal = Number(left.sourceOrdinal ?? left.sortOrder) - Number(right.sourceOrdinal ?? right.sortOrder)
      return ordinal || text(left.sourceUrl).localeCompare(text(right.sourceUrl))
    })
    const seenOrdinals = new Set()
    images.forEach((image, index) => {
      const sourceOrdinal = integer(image.sourceOrdinal) ?? index + 1
      let normalizedSourceUrl = ''
      try {
        normalizedSourceUrl = parseHttpsSourceUrl(image.sourceUrl, allowed).toString()
      } catch (error) {
        blockers.push(issue(error.code || 'source_url_invalid', error.message, { listingNumber, sourceOrdinal }))
      }
      if (seenOrdinals.has(sourceOrdinal)) blockers.push(issue('duplicate_image_ordinal', `Listing ${listingNumber} has duplicate image ordinal ${sourceOrdinal}.`, { listingNumber, sourceOrdinal }))
      seenOrdinals.add(sourceOrdinal)
      const sourceKey = fingerprint({ listingIdentityKey, listingNumber, sourceOrdinal, sourceUrl: normalizedSourceUrl })
      items.push({
        sourceKey,
        listingIdentityKey,
        listingNumber,
        arch9ListingId: arch9ListingId || null,
        sourceUrl: normalizedSourceUrl,
        caption: text(image.caption) || null,
        sourceOrdinal,
        sortOrder: index,
        isCover: index === 0,
      })
    })
  }
  if (!items.length) blockers.push(issue('images_missing', 'The mapping plan contains no images to import.'))

  return {
    version: PROPERTY24_MIGRATION_IMAGE_IMPORT_VERSION,
    phase: 'property24-migration-import-phase3-image-import',
    mode: 'image-import-plan',
    status: blockers.length ? 'BLOCKED' : 'READY',
    context: { organisationId: organisationId || null, environment: environment || null, agencyId, bucket: text(bucket) },
    sourceMapping: {
      version: mappingPlan.version || null,
      generatedAt: mappingPlan.generatedAt || null,
      inputHashes: mappingPlan.validation?.inputHashes || {},
    },
    allowedHostSuffixes: allowed,
    blockers,
    items,
  }
}

function buildStoragePath(plan, item, downloaded) {
  const ordinal = String(item.sourceOrdinal).padStart(4, '0')
  return [
    'organisations',
    plan.context.organisationId,
    'property24',
    plan.context.environment,
    String(plan.context.agencyId),
    String(item.listingNumber),
    `${ordinal}-${downloaded.sha256.slice(0, 20)}.${downloaded.extension}`,
  ].join('/')
}

function getBucket(storageClient, bucketName) {
  if (!storageClient?.storage?.from) throw createImportError('storage_client_invalid', 'A Supabase Storage client is required for apply mode.')
  return storageClient.storage.from(bucketName)
}

async function storageDataToBuffer(data) {
  if (Buffer.isBuffer(data)) return data
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  if (data?.arrayBuffer) return Buffer.from(await data.arrayBuffer())
  throw createImportError('storage_download_invalid', 'Stored object could not be read for resume verification.')
}

function isDuplicateStorageError(error) {
  const status = Number(error?.status || error?.statusCode)
  const message = text(error?.message).toLowerCase()
  return status === 409 || error?.error === 'Duplicate' || message.includes('already exists') || message.includes('duplicate')
}

async function verifyStoredObject(bucket, storagePath, expectedSha256) {
  const result = await bucket.download(storagePath)
  if (result.error || !result.data) return false
  return sha256(await storageDataToBuffer(result.data)) === expectedSha256
}

async function uploadImage(bucket, storagePath, downloaded, attempts) {
  return withRetries(async () => {
    const result = await bucket.upload(storagePath, downloaded.buffer, {
      cacheControl: '31536000',
      contentType: downloaded.contentType,
      upsert: false,
    })
    if (!result.error) return { uploaded: true, path: result.data?.path || storagePath }
    if (isDuplicateStorageError(result.error)) {
      const matches = await verifyStoredObject(bucket, storagePath, downloaded.sha256)
      if (matches) return { uploaded: false, reused: true, path: storagePath }
      throw createImportError('storage_hash_collision', `Stored object ${storagePath} exists with different content.`)
    }
    const error = createImportError('storage_upload_failed', `Storage upload failed: ${result.error.message || 'unknown error'}`, {
      status: result.error.status || result.error.statusCode,
      cause: result.error,
    })
    if (TRANSIENT_HTTP_STATUSES.has(Number(error.status))) error.code = 'upload_transient'
    throw error
  }, attempts)
}

function publicUrlFor(bucket, storagePath) {
  const result = bucket.getPublicUrl(storagePath)
  const publicUrl = text(result?.data?.publicUrl || result?.data?.publicURL)
  if (!publicUrl) throw createImportError('storage_public_url_missing', `Could not derive a public URL for ${storagePath}.`)
  return publicUrl
}

function previousItemsBySourceKey(existingManifest = {}) {
  const map = new Map()
  for (const item of Array.isArray(existingManifest.items) ? existingManifest.items : []) {
    if (item?.sourceKey && ['uploaded', 'reused'].includes(item.status) && item.storagePath && item.sha256) map.set(item.sourceKey, item)
  }
  return map
}

async function mapConcurrent(items, concurrency, worker, onItemComplete) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function consume() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
      await onItemComplete?.(results.filter(Boolean), results[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume))
  return results
}

function createListingManifests(plan, items) {
  const byListing = new Map()
  for (const item of items) {
    if (!byListing.has(item.listingIdentityKey)) byListing.set(item.listingIdentityKey, [])
    byListing.get(item.listingIdentityKey).push(item)
  }
  return [...byListing.entries()].map(([listingIdentityKey, media]) => {
    const ordered = media.sort((left, right) => left.sortOrder - right.sortOrder)
    const successful = ordered.filter((item) => ['uploaded', 'reused'].includes(item.status))
    return {
      listingIdentityKey,
      listingNumber: ordered[0]?.listingNumber || null,
      arch9ListingId: ordered[0]?.arch9ListingId || null,
      status: successful.length === ordered.length ? 'READY' : 'INCOMPLETE',
      media: ordered,
      listingMediaRows: successful.map((item) => ({
        listing_id: item.arch9ListingId,
        media_type: 'image',
        file_url: item.publicUrl,
        caption: item.caption,
        sort_order: item.sortOrder,
        is_cover: item.isCover,
      })),
    }
  })
}

function finalizeManifest(plan, items, { apply, generatedAt = new Date().toISOString() } = {}) {
  const uploaded = items.filter((item) => item.status === 'uploaded').length
  const reused = items.filter((item) => item.status === 'reused').length
  const failed = items.filter((item) => item.status === 'failed').length
  const pending = items.filter((item) => item.status === 'pending').length
  const status = plan.status === 'BLOCKED' ? 'BLOCKED' : !apply ? 'DRY_RUN' : failed || pending ? 'PARTIAL' : 'COMPLETE'
  const listingManifests = createListingManifests(plan, items)
  return {
    version: PROPERTY24_MIGRATION_IMAGE_IMPORT_VERSION,
    phase: plan.phase,
    mode: apply ? 'apply' : 'dry-run',
    status,
    generatedAt,
    context: plan.context,
    sourceMapping: plan.sourceMapping,
    safety: {
      sourceImagesDownloaded: items.some((item) => ['uploaded', 'reused'].includes(item.status) && !item.resumed),
      storageWritesPerformed: uploaded > 0,
      databaseWritesPerformed: false,
      property24WritesPerformed: false,
    },
    summary: {
      requestedImageCount: plan.items.length,
      uploadedImageCount: uploaded,
      reusedImageCount: reused,
      failedImageCount: failed,
      pendingImageCount: pending,
      completedImageCount: uploaded + reused,
      listingCount: listingManifests.length,
      readyListingCount: listingManifests.filter((listing) => listing.status === 'READY').length,
      listingMediaRowCount: listingManifests.reduce((count, listing) => count + listing.listingMediaRows.length, 0),
    },
    blockers: plan.blockers,
    items,
    listings: listingManifests,
    nextPhase: status === 'COMPLETE'
      ? 'Resolve Arch9 listing UUIDs, then persist the ordered listing_media row templates during the database import phase.'
      : status === 'DRY_RUN'
        ? 'Run with apply enabled after the listing-media storage migration is deployed.'
        : 'Resolve failed image items and resume from this manifest.',
  }
}

export async function importProperty24MigrationImages({
  mappingPlan = {},
  storageClient = null,
  fetchImpl = globalThis.fetch,
  dnsLookup = dns.lookup,
  existingManifest = {},
  apply = false,
  bucket = PROPERTY24_MIGRATION_IMAGE_BUCKET,
  allowedHostSuffixes = PROPERTY24_MIGRATION_IMAGE_SOURCE_HOST_SUFFIXES,
  listingIds = {},
  maxBytes = PROPERTY24_MIGRATION_IMAGE_MAX_BYTES,
  timeoutMs = 30_000,
  concurrency = 4,
  attempts = 3,
  imageInspector = inspectImage,
  onProgress = null,
  generatedAt = null,
} = {}) {
  const plan = createProperty24MigrationImageImportPlan(mappingPlan, { bucket, allowedHostSuffixes, listingIds })
  if (plan.status === 'BLOCKED') return finalizeManifest(plan, [], { apply, generatedAt: generatedAt || new Date().toISOString() })
  if (!apply) {
    return finalizeManifest(plan, plan.items.map((item) => ({ ...item, status: 'pending' })), {
      apply: false,
      generatedAt: generatedAt || new Date().toISOString(),
    })
  }
  const normalizedConcurrency = Math.max(1, Math.min(12, integer(concurrency) || 4))
  const normalizedAttempts = Math.max(1, Math.min(5, integer(attempts) || 3))
  const previous = previousItemsBySourceKey(existingManifest)
  const storageBucket = getBucket(storageClient, plan.context.bucket)
  const results = await mapConcurrent(plan.items, normalizedConcurrency, async (item) => {
    try {
      const prior = previous.get(item.sourceKey)
      if (prior && prior.storageBucket === plan.context.bucket) {
        const verified = await verifyStoredObject(storageBucket, prior.storagePath, prior.sha256)
        if (verified) return { ...prior, ...item, status: 'reused', resumed: true }
      }
      const downloaded = await downloadProperty24MigrationImage(item.sourceUrl, {
        fetchImpl,
        dnsLookup,
        allowedHostSuffixes: plan.allowedHostSuffixes,
        maxBytes,
        timeoutMs,
        attempts: normalizedAttempts,
        imageInspector,
      })
      const storagePath = buildStoragePath(plan, item, downloaded)
      const upload = await uploadImage(storageBucket, storagePath, downloaded, normalizedAttempts)
      const publicUrl = publicUrlFor(storageBucket, upload.path)
      return {
        ...item,
        status: upload.reused ? 'reused' : 'uploaded',
        resumed: false,
        finalSourceUrl: downloaded.sourceUrl,
        sha256: downloaded.sha256,
        byteLength: downloaded.byteLength,
        contentType: downloaded.contentType,
        extension: downloaded.extension,
        width: downloaded.width,
        height: downloaded.height,
        pages: downloaded.pages,
        storageBucket: plan.context.bucket,
        storagePath: upload.path,
        publicUrl,
      }
    } catch (error) {
      return {
        ...item,
        status: 'failed',
        error: { code: error.code || 'image_import_failed', message: error.message },
      }
    }
  }, async (completed) => {
    if (!onProgress) return
    const pending = plan.items
      .filter((item) => !completed.some((result) => result.sourceKey === item.sourceKey))
      .map((item) => ({ ...item, status: 'pending' }))
    await onProgress(finalizeManifest(plan, [...completed, ...pending].sort((left, right) => {
      const listing = left.listingNumber - right.listingNumber
      return listing || left.sortOrder - right.sortOrder
    }), { apply: true }))
  })
  return finalizeManifest(plan, results, { apply: true, generatedAt: generatedAt || new Date().toISOString() })
}
