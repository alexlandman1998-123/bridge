import { createHash } from 'node:crypto'

// Fingerprint the exact source gallery, not expiring signed URLs or database IDs
// recreated by a save. Uploads use immutable paths; remote URLs retain their query
// string (which may identify a replacement image).
export function listingPhotoFingerprint(media = [], scope = {}) {
  const rows = media.map((row, index) => ({
    type: row.media_type || row.mediaType || 'image',
    source: row.storage_bucket && row.storage_path
      ? `${row.storage_bucket}/${row.storage_path}`
      : row.file_url || row.fileUrl || row.url || row.publicUrl || row.public_url || row.signedUrl || row.signed_url || '',
    content: row.content_hash || row.contentHash || row.bytes || '',
    caption: row.caption || row.label || row.name || '',
    mime: row.mime_content_type || row.mimeContentType || row.content_type || row.contentType || '',
    cover: Boolean(row.is_cover ?? row.isCover),
    order: Number(row.sort_order ?? row.sortOrder ?? index) || 0,
  })).filter(row => ['image', 'floor_plan'].includes(row.type))
    .sort((a, b) => Number(b.cover) - Number(a.cover) || a.order - b.order)
  return `gallery-v1:${createHash('sha256').update(JSON.stringify({ scope, rows })).digest('hex')}`
}

export function resolveListingPhotoChange({ media, existingSync = {}, scope, identityMatches, force = false }) {
  existingSync ||= {}
  const fingerprint = listingPhotoFingerprint(media, scope)
  // Only a successful provider submit stores this value. Missing/legacy/failed
  // receipts and a different destination always resend. Browser flags are not proof.
  const known = existingSync.last_payload_summary?.photoFingerprint
  const healthy = !existingSync.last_error && !['failed', 'removed', 'unknown'].includes(existingSync.external_status)
  return { fingerprint, photosChanged: force || !identityMatches || !healthy || known !== fingerprint }
}
