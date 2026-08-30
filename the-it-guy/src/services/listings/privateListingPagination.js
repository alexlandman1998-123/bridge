export const PRIVATE_LISTING_SUMMARY_PAGE_DEFAULT_SIZE = 25
export const PRIVATE_LISTING_SUMMARY_PAGE_MAX_SIZE = 50

export function encodePrivateListingPageCursor(row = {}) {
  const payload = JSON.stringify({ updatedAt: row?.updated_at || '', id: row?.id || '' })
  if (!row?.updated_at || !row?.id) return ''
  if (typeof btoa === 'function') return btoa(payload)
  return Buffer.from(payload, 'utf8').toString('base64')
}

export function decodePrivateListingPageCursor(cursor = '') {
  if (!String(cursor || '').trim()) return null
  try {
    const decoded = typeof atob === 'function'
      ? atob(cursor)
      : Buffer.from(cursor, 'base64').toString('utf8')
    const payload = JSON.parse(decoded)
    const updatedAt = String(payload?.updatedAt || '').trim()
    const id = String(payload?.id || '').trim()
    return updatedAt && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      ? { updatedAt, id }
      : null
  } catch {
    return null
  }
}

export function normalizePrivateListingPageSize(value) {
  return Math.min(
    Math.max(Number(value) || PRIVATE_LISTING_SUMMARY_PAGE_DEFAULT_SIZE, 1),
    PRIVATE_LISTING_SUMMARY_PAGE_MAX_SIZE,
  )
}
