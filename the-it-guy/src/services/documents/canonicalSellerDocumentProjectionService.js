import { getCrossModuleDocumentDefinition, resolveCrossModuleDocumentKey } from './crossModuleDocumentKeyMapService.js'
import { resolveCanonicalDocumentRequestPresentation } from './canonicalDocumentRequestPresentationService.js'

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function documentKey(row = {}) {
  return key(row.requirementKey || row.requirement_key || row.key || row.documentType || row.document_type || row.category || row.title || row.label)
}

function hasEvidence(row = {}) {
  return Boolean(
    text(row.url || row.fileUrl || row.file_url || row.documentUrl || row.downloadUrl || row.download_url || row.storagePath || row.storage_path) ||
    row.upload || row.original?.document || row.packetId || row.packet_id || row.packetVersionId || row.packet_version_id,
  )
}

function presentationCategory(definition = null, fallback = '') {
  const category = key(definition?.category || definition?.packKey || fallback)
  if (category.includes('marketing')) return 'marketing'
  if (category.includes('authority') || category.includes('attorney') || category.includes('legal')) return 'legal'
  if (category.includes('identity') || category.includes('fica')) return 'seller'
  if (category) return 'property'
  return key(fallback) || 'seller'
}

function projectionIdentity(row = {}, canonicalKey = '') {
  const context = key(row.contextId || row.context_id || row.private_listing_id || row.listingId || row.listing_id || 'listing')
  const party = key(row.partyId || row.party_id || row.sellerId || row.seller_id || row.partyRole || row.party_role || 'seller')
  return `${context}:${party}:${canonicalKey}`
}

function mergeProjectionRows(current = {}, incoming = {}) {
  const currentEvidence = hasEvidence(current)
  const incomingEvidence = hasEvidence(incoming)
  const preferred = incomingEvidence && !currentEvidence ? incoming : current
  const secondary = preferred === current ? incoming : current
  return {
    ...secondary,
    ...preferred,
    originalRows: [...(Array.isArray(current.originalRows) ? current.originalRows : [current]), ...(Array.isArray(incoming.originalRows) ? incoming.originalRows : [incoming])],
  }
}

// The only projection intended for seller document UI surfaces. It is tolerant
// of legacy shapes, but its identity is canonical requirement + context + party
// rather than a filename, label, or storage row.
export function projectCanonicalSellerDocumentRows(rows = []) {
  const byIdentity = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue
    const suppliedKey = documentKey(row)
    const canonicalKey = resolveCrossModuleDocumentKey(suppliedKey) || suppliedKey
    const definition = getCrossModuleDocumentDefinition(canonicalKey)
    if (definition?.kind === 'structured_fact') continue

    const identity = projectionIdentity(row, canonicalKey || suppliedKey)
    const projected = {
      ...row,
      key: canonicalKey || suppliedKey,
      requirementKey: canonicalKey || suppliedKey,
      requirement_key: canonicalKey || suppliedKey,
      canonicalRequirementIdentity: identity,
      canonical_requirement_identity: identity,
      requirementKind: definition?.kind || 'upload_document',
      requirement_kind: definition?.kind || 'upload_document',
      taxonomyCategory: presentationCategory(definition, row.category || row.group || row.requirement_group),
      taxonomy_category: presentationCategory(definition, row.category || row.group || row.requirement_group),
      requestPresentation: resolveCanonicalDocumentRequestPresentation({ ...row, key: canonicalKey || suppliedKey }),
    }
    byIdentity.set(identity, byIdentity.has(identity) ? mergeProjectionRows(byIdentity.get(identity), projected) : projected)
  }

  return [...byIdentity.values()]
}
