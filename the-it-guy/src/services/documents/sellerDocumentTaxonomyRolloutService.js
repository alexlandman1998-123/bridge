import { projectCanonicalSellerDocumentRows } from './canonicalSellerDocumentProjectionService.js'
import { buildSellerDocumentTaxonomyAudit } from './sellerDocumentTaxonomyAudit.js'

function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function listingId(value = {}) {
  return text(value?.id || value?.listingId || value?.listing_id || value?.privateListingId || value?.private_listing_id)
}

// The pre-existing seller-document rollout control is the feature flag. A
// canary is strictly one listing; an enabled organisation is the only broad
// activation. Missing/invalid controls deliberately fail closed.
export function resolveSellerDocumentTaxonomyProjectionRollout({ rolloutControl = null, listing = null } = {}) {
  const control = rolloutControl && typeof rolloutControl === 'object' ? rolloutControl : {}
  const mode = key(control.mode) || 'paused'
  const currentListingId = listingId(listing)
  const canaryListingId = text(control.canary_listing_id || control.canaryListingId)
  const enabled = mode === 'enabled' || (mode === 'canary' && Boolean(currentListingId) && currentListingId === canaryListingId)
  return {
    version: 'seller-document-taxonomy-rollout-v1',
    mode,
    enabled,
    reason: enabled
      ? mode === 'canary' ? 'canary_listing' : 'organisation_enabled'
      : mode === 'canary' ? 'outside_canary_listing' : 'rollout_paused',
    canaryListingId,
  }
}

export function buildSellerDocumentTaxonomyComparison({ legacyRows = [], canonicalRows = null } = {}) {
  const legacy = Array.isArray(legacyRows) ? legacyRows.filter((row) => row && typeof row === 'object') : []
  const canonical = Array.isArray(canonicalRows) ? canonicalRows : projectCanonicalSellerDocumentRows(legacy)
  const legacyAudit = buildSellerDocumentTaxonomyAudit(legacy)
  const canonicalAudit = buildSellerDocumentTaxonomyAudit(canonical)
  const legacyKeys = new Set(legacyAudit.findings.map((finding) => finding.canonicalKey).filter(Boolean))
  const canonicalKeys = new Set(canonicalAudit.findings.map((finding) => finding.canonicalKey).filter(Boolean))
  return {
    version: 'seller-document-taxonomy-comparison-v1',
    legacy: { rowCount: legacy.length, audit: legacyAudit },
    canonical: { rowCount: canonical.length, audit: canonicalAudit },
    delta: {
      rowCount: canonical.length - legacy.length,
      removedDuplicateCount: Math.max(0, legacy.length - canonical.length),
      hiddenStructuredFactCount: legacyAudit.summary.structuredFactCount,
      keysOnlyInLegacy: [...legacyKeys].filter((item) => !canonicalKeys.has(item)).sort(),
      keysOnlyInCanonical: [...canonicalKeys].filter((item) => !legacyKeys.has(item)).sort(),
    },
    classificationExceptions: canonicalAudit.findings.filter((finding) => finding.issue || finding.categoryMismatch),
  }
}

export function projectSellerDocumentRowsForTaxonomyRollout({ rows = [], rolloutControl = null, listing = null } = {}) {
  const rollout = resolveSellerDocumentTaxonomyProjectionRollout({ rolloutControl, listing })
  const comparison = buildSellerDocumentTaxonomyComparison({ legacyRows: rows })
  return {
    rollout,
    comparison,
    rows: rollout.enabled ? projectCanonicalSellerDocumentRows(rows) : Array.isArray(rows) ? rows : [],
  }
}
