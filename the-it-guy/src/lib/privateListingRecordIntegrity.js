function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function getPrivateListingRecordId(row = null) {
  if (!isRecord(row)) return ''
  return String(row.id || row.listingId || row.listing_id || '').trim()
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
  const targetId = String(listingId || '').trim()
  if (!targetId) return null
  return sanitizePrivateListingRows(rows).find((row) => getPrivateListingRecordId(row) === targetId) || null
}
