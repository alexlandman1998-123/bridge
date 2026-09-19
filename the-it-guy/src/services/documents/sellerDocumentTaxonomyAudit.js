import {
  getCrossModuleDocumentDefinition,
  listCrossModuleDocumentDefinitions,
  resolveCrossModuleDocumentKey,
} from './crossModuleDocumentKeyMapService.js'

export const SELLER_DOCUMENT_TAXONOMY_AUDIT_VERSION = 'seller-document-taxonomy-audit-v1'

// Exported for callers that need the current seller-facing baseline, but
// derived from the shared taxonomy rather than maintained as a second list.
export const SELLER_STRUCTURED_FACT_KEYS = Object.freeze(
  listCrossModuleDocumentDefinitions()
    .filter((definition) => definition.kind === 'structured_fact')
    .map((definition) => definition.canonicalKey),
)

// These are producer-side keys that are not yet represented by the shared
// cross-module map. The audit normalises them only for comparison; Phase 2
// will make these aliases part of the canonical registry/compatibility layer.
const LEGACY_KEY_ALIASES = Object.freeze({
  sectional_levy_statement: 'levy_statement',
  hoa_contact_details: 'hoa_details',
})

const text = (value) => String(value ?? '').trim()
const key = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

export function classifySellerRequirementForTaxonomyAudit(row = {}) {
  const suppliedKey = key(row.key || row.requirementKey || row.requirement_key || row.documentType || row.document_type || row.label || row.title)
  const resolvedKey = resolveCrossModuleDocumentKey(suppliedKey) || suppliedKey
  const canonicalKey = LEGACY_KEY_ALIASES[resolvedKey] || resolvedKey
  const legacyAlias = suppliedKey !== canonicalKey
  const definition = getCrossModuleDocumentDefinition(canonicalKey)
  const kind = definition?.kind || 'upload_document'
  const category = definition?.category || ''
  if (kind === 'structured_fact') {
    return {
      canonicalKey,
      kind,
      category,
      issue: legacyAlias ? 'legacy_alias_and_fact_emitted_as_document' : 'fact_emitted_as_document',
    }
  }
  return { canonicalKey, kind, category, issue: legacyAlias ? 'legacy_alias_missing' : '' }
}

export function buildSellerDocumentTaxonomyAudit(rows = []) {
  const occurrences = new Map()
  const findings = (Array.isArray(rows) ? rows : []).map((row, index) => {
    const classification = classifySellerRequirementForTaxonomyAudit(row)
    const identity = `${classification.canonicalKey}:${key(row.partyId || row.party_id || row.sellerId || row.seller_id || 'listing')}`
    occurrences.set(identity, (occurrences.get(identity) || 0) + 1)
    return {
      index,
      suppliedKey: key(row.key || row.requirementKey || row.requirement_key || row.label || row.title),
      suppliedCategory: key(row.category || row.group || row.requirement_group),
      ...classification,
      identity,
    }
  })
  return {
    version: SELLER_DOCUMENT_TAXONOMY_AUDIT_VERSION,
    findings: findings.map((finding) => ({
      ...finding,
      duplicateProjection: (occurrences.get(finding.identity) || 0) > 1,
      categoryMismatch: Boolean(finding.category && finding.suppliedCategory && finding.category !== finding.suppliedCategory),
    })),
    summary: {
      total: findings.length,
      duplicateProjectionCount: [...occurrences.values()].filter((count) => count > 1).length,
      structuredFactCount: findings.filter((finding) => finding.kind === 'structured_fact').length,
      legacyAliasGapCount: findings.filter((finding) => finding.issue.includes('legacy_alias')).length,
    },
  }
}
