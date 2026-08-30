export const LISTING_BASELINE_CONTRACT = 'listing-architecture-baseline-v1'

export const LISTING_BASELINE_TARGETS = Object.freeze({
  p95DurationMs: 800,
  maximumResultCount: 50,
  maximumResponseBytes: 500_000,
  maximumExpiredMediaUrls: 0,
  maximumIncompleteMediaRows: 0,
})

function finite(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function estimateJsonBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length
  } catch {
    return 0
  }
}

export function getSignedUrlExpiry(value = '') {
  try {
    const url = new URL(String(value || ''))
    const expiresAt = url.searchParams.get('Expires') || url.searchParams.get('expires')
    if (expiresAt && /^\d+$/.test(expiresAt)) {
      const seconds = Number(expiresAt)
      return new Date(seconds > 10_000_000_000 ? seconds : seconds * 1000)
    }
    const token = url.searchParams.get('token')
    if (!token) return null
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = typeof atob === 'function'
      ? atob(normalized)
      : Buffer.from(normalized, 'base64').toString('utf8')
    const exp = Number(JSON.parse(decoded)?.exp)
    return Number.isFinite(exp) ? new Date(exp * 1000) : null
  } catch {
    return null
  }
}

export function inspectListingMediaRows(rows = [], { now = new Date() } = {}) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime()
  const summary = {
    rowCount: 0,
    listingCount: 0,
    expiredUrlCount: 0,
    expiringWithinSevenDaysCount: 0,
    incompleteRowCount: 0,
    signedUrlCount: 0,
    averageAssetsPerListing: 0,
  }
  const listingIds = new Set()
  for (const row of Array.isArray(rows) ? rows : []) {
    summary.rowCount += 1
    const listingId = String(row?.listing_id || '').trim()
    if (listingId) listingIds.add(listingId)
    const url = String(row?.file_url || '').trim()
    if (!listingId || !url) summary.incompleteRowCount += 1
    const expiry = getSignedUrlExpiry(url)
    if (!expiry) continue
    summary.signedUrlCount += 1
    if (expiry.getTime() <= timestamp) summary.expiredUrlCount += 1
    else if (expiry.getTime() <= timestamp + 7 * 24 * 60 * 60 * 1000) summary.expiringWithinSevenDaysCount += 1
  }
  summary.listingCount = listingIds.size
  summary.averageAssetsPerListing = listingIds.size
    ? Math.round((summary.rowCount / listingIds.size) * 100) / 100
    : 0
  return summary
}

export function evaluateListingBaseline({ telemetry = {}, media = {} } = {}) {
  const checks = {
    p95Duration: finite(telemetry.p95DurationMs, Number.POSITIVE_INFINITY) <= LISTING_BASELINE_TARGETS.p95DurationMs,
    resultCount: finite(telemetry.maximumResultCount, Number.POSITIVE_INFINITY) <= LISTING_BASELINE_TARGETS.maximumResultCount,
    responseBytes: finite(telemetry.maximumResponseBytes, Number.POSITIVE_INFINITY) <= LISTING_BASELINE_TARGETS.maximumResponseBytes,
    expiredMediaUrls: finite(media.expiredUrlCount) <= LISTING_BASELINE_TARGETS.maximumExpiredMediaUrls,
    incompleteMediaRows: finite(media.incompleteRowCount) <= LISTING_BASELINE_TARGETS.maximumIncompleteMediaRows,
  }
  return {
    contract: LISTING_BASELINE_CONTRACT,
    targets: LISTING_BASELINE_TARGETS,
    checks,
    status: Object.values(checks).every(Boolean) ? 'pass' : 'attention_required',
  }
}
