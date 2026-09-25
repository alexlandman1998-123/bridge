import {
  projectSellerDocumentArtifact,
  SELLER_DOCUMENT_ARTIFACT_STAGES,
  SELLER_DOCUMENT_REPRESENTATION_KINDS,
} from '../../lib/sellerBasePackContract.js'
import { getCrossModuleDocumentDefinition, resolveCrossModuleDocumentReference } from './crossModuleDocumentKeyMapService.js'
import { resolveCanonicalDocumentRequestPresentation } from './canonicalDocumentRequestPresentationService.js'

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function documentKey(row = {}) {
  return key(
    row.targetRequirementKey ||
    row.target_requirement_key ||
    row.documentContract?.targetRequirementKey ||
    row.requirementKey ||
    row.requirement_key ||
    row.key ||
    row.documentType ||
    row.document_type ||
    row.category ||
    row.title ||
    row.label,
  )
}

function rowArtifact(row = {}) {
  return row.original?.document || row.originalDocument || row.upload || row
}

function hasArtifactRepresentation(row = {}) {
  return Boolean(
    text(
      row.url || row.fileUrl || row.file_url || row.documentUrl || row.document_url ||
      row.downloadUrl || row.download_url || row.storagePath || row.storage_path ||
      row.filePath || row.file_path || row.generatedHtml || row.generated_html,
    ) ||
    (text(row.packetId || row.packet_id) && text(row.packetVersionId || row.packet_version_id || row.versionId || row.version_id)),
  )
}

function rowContract(row = {}) {
  if (row.documentContract?.contractVersion) return row.documentContract
  const artifact = rowArtifact(row)
  const hasEmbeddedArtifact = Boolean(row.original?.document || row.originalDocument || row.upload)
  const status = normalizedStatus(row)
  const requirementOnly = !hasEmbeddedArtifact &&
    row.hasUpload !== true &&
    !hasArtifactRepresentation(artifact) &&
    ['', 'required', 'requested', 'outstanding', 'missing', 'pending'].includes(status)
  return projectSellerDocumentArtifact(artifact, { requirementOnly })
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

function normalizedStatus(row = {}) {
  return key(row.status || row.statusLabel || row.documentStatus || row.document_status)
}

function isCompletedSigningArtifactWithoutFile(row = {}, contract = rowContract(row)) {
  const artifact = rowArtifact(row)
  const signingSessionId = text(
    row.signingSessionId || row.signing_session_id ||
    artifact.signingSessionId || artifact.signing_session_id,
  )
  const status = normalizedStatus({
    ...artifact,
    status: artifact.status || artifact.document_status || artifact.documentStatus ||
      row.status || row.statusLabel || row.documentStatus || row.document_status,
  })
  return Boolean(
    signingSessionId &&
    contract.stage === SELLER_DOCUMENT_ARTIFACT_STAGES.FINAL_SIGNED &&
    contract.representation?.exists !== true &&
    ['complete', 'completed', 'approved', 'signed', 'fully_signed'].includes(status),
  )
}

function projectionScore(row = {}) {
  const contract = row.documentContract || rowContract(row)
  const missingSignedArtifact = isCompletedSigningArtifactWithoutFile(row, contract)
  const representationScore = {
    [SELLER_DOCUMENT_REPRESENTATION_KINDS.STORED_FILE]: 400,
    [SELLER_DOCUMENT_REPRESENTATION_KINDS.FINAL_PACKET]: 350,
    [SELLER_DOCUMENT_REPRESENTATION_KINDS.GENERATED_HTML]: 300,
    [SELLER_DOCUMENT_REPRESENTATION_KINDS.NONE]: 0,
  }[contract.representation?.kind] || 0
  const stageScore = {
    [SELLER_DOCUMENT_ARTIFACT_STAGES.FINAL_SIGNED]: contract.representation?.exists ? 4_000 : missingSignedArtifact ? 1_500 : 250,
    [SELLER_DOCUMENT_ARTIFACT_STAGES.SIGNING_COPY]: 2_000,
    [SELLER_DOCUMENT_ARTIFACT_STAGES.REQUIREMENT]: 1_000,
    [SELLER_DOCUMENT_ARTIFACT_STAGES.REVIEW_DRAFT]: 0,
  }[contract.stage] || 0
  const status = normalizedStatus(row)
  const statusScore = ['completed', 'complete', 'approved', 'signed', 'fully_signed', 'uploaded'].includes(status) ? 100 : 0
  return (contract.satisfiesRequirement ? 10_000 : 0) + stageScore + representationScore + statusScore
}

function originalRows(row = {}) {
  return Array.isArray(row.originalRows) ? row.originalRows : [row]
}

function mergeProjectionRows(current = {}, incoming = {}) {
  const preferred = projectionScore(incoming) > projectionScore(current) ? incoming : current
  const secondary = preferred === current ? incoming : current
  const required = current.required === true || incoming.required === true
    ? true
    : current.required === false && incoming.required === false
      ? false
      : preferred.required
  return {
    ...secondary,
    ...preferred,
    required,
    applicable: current.applicable === false && incoming.applicable === false ? false : preferred.applicable,
    originalRows: [...originalRows(current), ...originalRows(incoming)],
  }
}

// The single projection used by every seller-document UI surface. Candidate
// requirements and artefacts may arrive in legacy shapes, but selection is
// governed only by the authoritative document contract. No label-, filename-,
// or component-specific deduplication is applied after this boundary.
export function projectCanonicalSellerDocumentRows(rows = []) {
  const byIdentity = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue
    const documentContract = rowContract(row)
    if (documentContract.visibleInSellerDocuments === false) continue

    const suppliedKey = documentKey(row)
    const contractKey = key(documentContract.targetRequirementKey)
    // Generic legacy keys such as `id_document` and `proof_of_address` exist in
    // both buyer and seller journeys. Resolve them with an explicit seller
    // context so a seller requirement can never be projected into a buyer key.
    const documentReference = resolveCrossModuleDocumentReference(contractKey || suppliedKey, {
      ownerRole: 'seller',
      role: 'seller',
      appliesTo: row.appliesTo || row.applies_to || row.original?.requirement?.applies_to || 'seller',
      groupKey: row.group || row.requirement_group || row.original?.requirement?.requirement_group || 'seller',
    })
    const canonicalKey = documentReference.canonicalDocumentKey || contractKey || suppliedKey
    if (!canonicalKey) continue
    const definition = getCrossModuleDocumentDefinition(canonicalKey)
    if (definition?.kind === 'structured_fact') continue

    const identity = projectionIdentity(row, canonicalKey)
    const projected = {
      ...row,
      key: canonicalKey,
      requirementKey: canonicalKey,
      requirement_key: canonicalKey,
      documentContract,
      canonicalRequirementIdentity: identity,
      canonical_requirement_identity: identity,
      requirementKind: definition?.kind || 'upload_document',
      requirement_kind: definition?.kind || 'upload_document',
      taxonomyCategory: presentationCategory(definition, row.category || row.group || row.requirement_group),
      taxonomy_category: presentationCategory(definition, row.category || row.group || row.requirement_group),
      requestPresentation: resolveCanonicalDocumentRequestPresentation({ ...row, key: canonicalKey }),
      ...(isCompletedSigningArtifactWithoutFile(row, documentContract)
        ? {
            artifactRecoveryState: 'missing_final_pdf',
            artifact_recovery_state: 'missing_final_pdf',
            canDownload: false,
            can_download: false,
            canUpload: false,
            can_upload: false,
          }
        : {}),
    }
    byIdentity.set(identity, byIdentity.has(identity) ? mergeProjectionRows(byIdentity.get(identity), projected) : projected)
  }

  return [...byIdentity.values()]
}
