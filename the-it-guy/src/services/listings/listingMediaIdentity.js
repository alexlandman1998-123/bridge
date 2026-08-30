export const LISTING_MEDIA_IDENTITY_VERSION = 'listing-media-object-identity-v1'

function text(value) {
  return String(value || '').trim()
}

export function parseSupabaseStorageObjectUrl(value = '') {
  const url = text(value)
  if (!url) return null
  try {
    const parsed = new URL(url)
    const match = parsed.pathname.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/)
    if (!match) return null
    return {
      bucket: decodeURIComponent(match[1]),
      path: match[2].split('/').map(decodeURIComponent).join('/'),
    }
  } catch {
    return null
  }
}

export function getListingMediaObjectIdentity(item = {}) {
  const bucket = text(item.storageBucket || item.storage_bucket || item.bucket)
  const path = text(item.storagePath || item.storage_path || item.objectPath || item.object_path || item.path)
  if (bucket && path) return { bucket, path }
  return parseSupabaseStorageObjectUrl(item.fileUrl || item.file_url || item.url || item.signedUrl || item.publicUrl)
}

export function buildListingMediaPersistence(item = {}, fallback = {}) {
  const identity = getListingMediaObjectIdentity(item)
  return {
    storage_bucket: identity?.bucket || null,
    storage_path: identity?.path || null,
    content_type: text(item.contentType || item.content_type) || null,
    byte_size: Number.isFinite(Number(item.size ?? item.byte_size)) ? Number(item.size ?? item.byte_size) : null,
    width: Number.isFinite(Number(item.width)) && Number(item.width) > 0 ? Number(item.width) : null,
    height: Number.isFinite(Number(item.height)) && Number(item.height) > 0 ? Number(item.height) : null,
    checksum: text(item.checksum) || null,
    processing_status: text(item.processingStatus || item.processing_status || fallback.processingStatus) || 'ready',
  }
}
