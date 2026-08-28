function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeRecordId(value) {
  return String(value || '').trim()
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeRecordId(value))
}

function pushIdentityCandidate(candidates, value) {
  const normalized = normalizeRecordId(value)
  if (normalized && !candidates.includes(normalized)) candidates.push(normalized)
}

export function getPrivateListingIdentityCandidates(row = null) {
  if (!isRecord(row)) return []
  const candidates = []
  const nestedListing = isRecord(row.sourceListing) ? row.sourceListing : {}
  ;[
    row.id,
    row.listingId,
    row.listing_id,
    row.privateListingId,
    row.private_listing_id,
    nestedListing.id,
    nestedListing.listingId,
    nestedListing.listing_id,
    nestedListing.privateListingId,
    nestedListing.private_listing_id,
  ].forEach((value) => pushIdentityCandidate(candidates, value))
  return candidates
}

export function getPrivateListingRecordId(row = null) {
  if (!isRecord(row)) return ''
  return getPrivateListingIdentityCandidates(row)[0] || ''
}

export function getPrivateListingRemoteRecordId(row = null) {
  if (!isRecord(row)) return ''
  const nestedListing = isRecord(row.sourceListing) ? row.sourceListing : {}
  return [
    row.privateListingId,
    row.private_listing_id,
    row.listingId,
    row.listing_id,
    nestedListing.privateListingId,
    nestedListing.private_listing_id,
    nestedListing.listingId,
    nestedListing.listing_id,
    nestedListing.id,
    row.id,
  ].map(normalizeRecordId).find(isUuidLike) || ''
}

export function normalizePrivateListingRecord(row = null) {
  const id = getPrivateListingRecordId(row)
  if (!id) return isRecord(row) ? { ...row } : null
  return row.id === id ? row : { ...row, id }
}

/**
 * Listing data is received from local snapshots as well as Supabase. Ignore
 * malformed array entries at that boundary so one bad record cannot prevent a
 * valid listing workspace from rendering.
 */
export function sanitizePrivateListingRows(rows = []) {
  if (!Array.isArray(rows)) return []
  return rows.filter(isRecord).map(normalizePrivateListingRecord)
}

export function findPrivateListingById(rows = [], listingId = '') {
  const targetId = normalizeRecordId(listingId)
  if (!targetId) return null
  return sanitizePrivateListingRows(rows).find((row) => getPrivateListingIdentityCandidates(row).includes(targetId)) || null
}
