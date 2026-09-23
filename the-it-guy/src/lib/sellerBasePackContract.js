export const SELLER_BASE_PACK_KEYS = Object.freeze({
  SIGNED_MANDATE: 'signed_mandate',
  SIGNED_DISCLOSURE_FORM: 'signed_disclosure_form',
  SIGNED_FICA_DECLARATION: 'signed_fica_declaration',
})

export const SELLER_DOCUMENT_CONTRACT_VERSION = 'seller_document_contract_v2'

export const SELLER_DOCUMENT_ARTIFACT_KEYS = Object.freeze({
  ...SELLER_BASE_PACK_KEYS,
  MANDATE_PREPARATION_SUMMARY: 'mandate_preparation_summary',
  FICA_REVIEW_DRAFT: 'fica_review_draft',
})

export const SELLER_DOCUMENT_ARTIFACT_STAGES = Object.freeze({
  REQUIREMENT: 'requirement',
  REVIEW_DRAFT: 'review_draft',
  SIGNING_COPY: 'signing_copy',
  FINAL_SIGNED: 'final_signed',
})

export const SELLER_DOCUMENT_REPRESENTATION_KINDS = Object.freeze({
  NONE: 'none',
  GENERATED_HTML: 'generated_html',
  STORED_FILE: 'stored_file',
  FINAL_PACKET: 'final_packet',
})

export const SELLER_BASE_PACK_REQUIRED_KEYS = Object.freeze([
  SELLER_BASE_PACK_KEYS.SIGNED_MANDATE,
  SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM,
  SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION,
])

export const SELLER_BASE_PACK_COMPLETION_ROUTES = Object.freeze({
  PHYSICAL_UPLOAD: 'physical_upload',
  DISCLOSURE_LINK: 'disclosure_link_completed',
  SELLER_ONBOARDING_LINK: 'seller_onboarding_link_completed',
  PHYSICAL_UPLOAD_WITH_CONTEXT: 'physical_upload_with_context',
})

export const SELLER_BASE_PACK_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: SELLER_BASE_PACK_KEYS.SIGNED_MANDATE,
    label: 'Signed Mandate',
    description: 'The signed seller mandate.',
    allowedCompletionRoutes: Object.freeze([
      SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD,
    ]),
  }),
  Object.freeze({
    key: SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM,
    label: 'Signed Mandatory Disclosure / Defects Form',
    description: 'The completed and signed mandatory property disclosure form.',
    allowedCompletionRoutes: Object.freeze([
      SELLER_BASE_PACK_COMPLETION_ROUTES.DISCLOSURE_LINK,
      SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD,
    ]),
  }),
  Object.freeze({
    key: SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION,
    label: 'Signed FICA Declaration',
    description: 'The signed FICA declaration pack, separate from supporting FICA evidence documents.',
    allowedCompletionRoutes: Object.freeze([
      SELLER_BASE_PACK_COMPLETION_ROUTES.SELLER_ONBOARDING_LINK,
      SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD_WITH_CONTEXT,
    ]),
  }),
])

function normalizeKey(value = '') {
  return String(value ?? '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizedKeyContainsAlias(value = '', alias = '') {
  const normalizedValue = normalizeKey(value)
  const normalizedAlias = normalizeKey(alias)
  if (!normalizedValue || !normalizedAlias) return false
  if (normalizedValue === normalizedAlias) return true
  return normalizedValue.startsWith(`${normalizedAlias}_`) ||
    normalizedValue.endsWith(`_${normalizedAlias}`) ||
    normalizedValue.includes(`_${normalizedAlias}_`)
}

export const SELLER_BASE_PACK_ALIASES = Object.freeze({
  [SELLER_BASE_PACK_KEYS.SIGNED_MANDATE]: Object.freeze([
    'signed_mandate',
    'mandate_signature',
    'seller_mandate',
    'manual_mandate_evidence',
    'physical_signed_mandate',
    'mandate',
  ]),
  [SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM]: Object.freeze([
    'signed_disclosure_form',
    'signed_mandatory_disclosure',
    'signed_mandatory_disclosure_form',
    'mandatory_disclosure',
    'mandatory_disclosure_form',
    'property_condition_disclosure',
    'property_disclosure',
    'condition_disclosure',
    'signed_defect_form',
    'signed_defects_form',
    'defects_disclosure',
    'defects_disclosure_form',
    'defect_form',
    'defects_form',
    'property_defects_disclosure',
    'disclosure',
    'defects',
  ]),
  [SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION]: Object.freeze([
    'signed_fica_declaration',
    'signed_fica_declaration_pack',
    'fica_declaration',
    'fica_declaration_pack',
    'signed_fica_form',
    'seller_fica_form',
    'seller_fica_declaration',
    'seller_fica_declaration_pack',
    'seller_fica_pack',
    'fica_form',
    'fica_pack',
    'fica',
  ]),
})

const SELLER_BASE_PACK_CANONICAL_BY_ALIAS = Object.freeze(
  Object.entries(SELLER_BASE_PACK_ALIASES).reduce((accumulator, [canonicalKey, aliases]) => {
    accumulator[normalizeKey(canonicalKey)] = canonicalKey
    aliases.forEach((alias) => {
      accumulator[normalizeKey(alias)] = canonicalKey
    })
    return accumulator
  }, {}),
)

export function normalizeSellerBasePackKey(value = '') {
  const normalized = normalizeKey(value)
  return SELLER_BASE_PACK_CANONICAL_BY_ALIAS[normalized] || ''
}

export function isSellerBasePackKey(value = '') {
  return Boolean(normalizeSellerBasePackKey(value))
}

export function getSellerBasePackAliases(value = '') {
  const canonicalKey = normalizeSellerBasePackKey(value) || normalizeKey(value)
  const aliases = SELLER_BASE_PACK_ALIASES[canonicalKey]
  return aliases ? Object.freeze([canonicalKey, ...aliases].map(normalizeKey)) : Object.freeze([])
}

export function sellerBasePackKeysOverlap(left = '', right = '') {
  const leftCanonical = normalizeSellerBasePackKey(left)
  const rightCanonical = normalizeSellerBasePackKey(right)
  if (leftCanonical && rightCanonical) return leftCanonical === rightCanonical
  if (!leftCanonical && !rightCanonical) return false
  const canonicalAliases = getSellerBasePackAliases(leftCanonical || rightCanonical)
  const other = normalizeKey(leftCanonical ? right : left)
  return Boolean(other && canonicalAliases.some((alias) =>
    normalizedKeyContainsAlias(other, alias) || normalizedKeyContainsAlias(alias, other),
  ))
}

export function getSellerBasePackDefinition(value = '') {
  const canonicalKey = normalizeSellerBasePackKey(value)
  return SELLER_BASE_PACK_DEFINITIONS.find((definition) => definition.key === canonicalKey) || null
}

const FINAL_STATUS_KEYS = new Set([
  'approved',
  'complete',
  'completed',
  'executed',
  'signed',
  'uploaded',
])

const REVIEW_STATUS_KEYS = new Set([
  'awaiting_agent_review',
  'correction_requested',
  'draft',
  'pending_review',
])

function firstText(...values) {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
}

function artifactMetadata(artifact = {}) {
  return artifact?.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
    ? artifact.metadata
    : {}
}

function rawArtifactKey(artifact = {}) {
  return firstText(
    artifact?.artifactKey,
    artifact?.artifact_key,
    artifact?.key,
    artifact?.requirementKey,
    artifact?.requirement_key,
    artifact?.documentType,
    artifact?.document_type,
    artifact?.documentCategory,
    artifact?.document_category,
    artifact?.name,
    artifact?.documentName,
    artifact?.document_name,
  )
}

function hasStoredFile(artifact = {}) {
  return Boolean(firstText(
    artifact?.storagePath,
    artifact?.storage_path,
    artifact?.filePath,
    artifact?.file_path,
    artifact?.fileUrl,
    artifact?.file_url,
    artifact?.documentUrl,
    artifact?.document_url,
    artifact?.url,
    artifact?.downloadUrl,
    artifact?.download_url,
  ))
}

function representationKind(artifact = {}) {
  if (hasStoredFile(artifact)) return SELLER_DOCUMENT_REPRESENTATION_KINDS.STORED_FILE
  if (firstText(artifact?.generatedHtml, artifact?.generated_html)) return SELLER_DOCUMENT_REPRESENTATION_KINDS.GENERATED_HTML
  if (firstText(artifact?.packetId, artifact?.packet_id) && firstText(artifact?.packetVersionId, artifact?.packet_version_id, artifact?.versionId, artifact?.version_id)) {
    return SELLER_DOCUMENT_REPRESENTATION_KINDS.FINAL_PACKET
  }
  return SELLER_DOCUMENT_REPRESENTATION_KINDS.NONE
}

function isLegacyMandatePreparationSummary(artifact = {}) {
  const metadata = artifactMetadata(artifact)
  const source = normalizeKey(artifact?.source)
  const status = normalizeKey(artifact?.status || artifact?.documentStatus || artifact?.document_status)
  const template = normalizeKey(firstText(artifact?.templateVersion, artifact?.template_version, metadata?.templateVersion, metadata?.template_version))
  const name = normalizeKey(firstText(artifact?.name, artifact?.documentName, artifact?.document_name))
  return metadata?.notForSignature === true ||
    metadata?.not_for_signature === true ||
    template.includes('mandate_preparation_summary') ||
    name.includes('mandate_preparation_summary') ||
    (source === 'seller_onboarding_post_submission_draft' && REVIEW_STATUS_KEYS.has(status))
}

function isLegacyFicaReviewDraft(artifact = {}) {
  const source = normalizeKey(artifact?.source)
  const status = normalizeKey(artifact?.status || artifact?.documentStatus || artifact?.document_status)
  const template = normalizeKey(firstText(artifact?.templateVersion, artifact?.template_version, artifactMetadata(artifact)?.templateVersion))
  return template.includes('fica_review_draft') ||
    (source === 'seller_onboarding_post_submission_draft' && REVIEW_STATUS_KEYS.has(status))
}

function explicitDraftKey(value = '') {
  const normalized = normalizeKey(value)
  if (normalized === SELLER_DOCUMENT_ARTIFACT_KEYS.MANDATE_PREPARATION_SUMMARY) return normalized
  if (normalized === SELLER_DOCUMENT_ARTIFACT_KEYS.FICA_REVIEW_DRAFT) return normalized
  return ''
}

function targetRequirementForArtifact(artifactKey = '', artifact = {}) {
  const explicitTarget = normalizeSellerBasePackKey(firstText(
    artifact?.targetRequirementKey,
    artifact?.target_requirement_key,
  ))
  if (explicitTarget) return explicitTarget
  if (artifactKey === SELLER_DOCUMENT_ARTIFACT_KEYS.MANDATE_PREPARATION_SUMMARY) return SELLER_BASE_PACK_KEYS.SIGNED_MANDATE
  if (artifactKey === SELLER_DOCUMENT_ARTIFACT_KEYS.FICA_REVIEW_DRAFT) return SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION
  return normalizeSellerBasePackKey(artifactKey)
}

/**
 * Projects every seller base-pack record onto one legal document contract.
 * Legacy post-onboarding drafts are deliberately reclassified so they cannot
 * masquerade as, complete, or duplicate a signed document requirement.
 */
export function projectSellerDocumentArtifact(artifact = {}, { requirementOnly = false } = {}) {
  const rawKey = rawArtifactKey(artifact)
  const explicitDraft = explicitDraftKey(rawKey)
  const canonicalFinalKey = normalizeSellerBasePackKey(rawKey)
  let artifactKey = explicitDraft || canonicalFinalKey || normalizeKey(rawKey)

  if (!explicitDraft && canonicalFinalKey === SELLER_BASE_PACK_KEYS.SIGNED_MANDATE && isLegacyMandatePreparationSummary(artifact)) {
    artifactKey = SELLER_DOCUMENT_ARTIFACT_KEYS.MANDATE_PREPARATION_SUMMARY
  } else if (!explicitDraft && canonicalFinalKey === SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION && isLegacyFicaReviewDraft(artifact)) {
    artifactKey = SELLER_DOCUMENT_ARTIFACT_KEYS.FICA_REVIEW_DRAFT
  }

  const targetRequirementKey = targetRequirementForArtifact(artifactKey, artifact)
  const status = normalizeKey(artifact?.status || artifact?.documentStatus || artifact?.document_status)
  const source = normalizeKey(artifact?.source)
  const representation = representationKind(artifact)
  const isReviewDraft = [
    SELLER_DOCUMENT_ARTIFACT_KEYS.MANDATE_PREPARATION_SUMMARY,
    SELLER_DOCUMENT_ARTIFACT_KEYS.FICA_REVIEW_DRAFT,
  ].includes(artifactKey)
  const isSigningCopy = !isReviewDraft && (
    status === 'awaiting_signed_hard_copy' ||
    source === 'seller_onboarding_manual_signing_pack'
  )
  const stage = requirementOnly
    ? SELLER_DOCUMENT_ARTIFACT_STAGES.REQUIREMENT
    : isReviewDraft
      ? SELLER_DOCUMENT_ARTIFACT_STAGES.REVIEW_DRAFT
      : isSigningCopy
        ? SELLER_DOCUMENT_ARTIFACT_STAGES.SIGNING_COPY
        : SELLER_DOCUMENT_ARTIFACT_STAGES.FINAL_SIGNED
  const hasRepresentation = representation !== SELLER_DOCUMENT_REPRESENTATION_KINDS.NONE
  const satisfiesRequirement = stage === SELLER_DOCUMENT_ARTIFACT_STAGES.FINAL_SIGNED && hasRepresentation && (
    FINAL_STATUS_KEYS.has(status) || hasStoredFile(artifact) || representation === SELLER_DOCUMENT_REPRESENTATION_KINDS.FINAL_PACKET
  )
  const metadata = artifactMetadata(artifact)

  return Object.freeze({
    contractVersion: SELLER_DOCUMENT_CONTRACT_VERSION,
    artifactKey,
    targetRequirementKey,
    stage,
    requirementStatus: status || (requirementOnly ? 'required' : ''),
    representation: Object.freeze({
      kind: representation,
      exists: hasRepresentation,
      downloadable: hasRepresentation && artifact?.canDownload !== false && artifact?.can_download !== false,
    }),
    satisfiesRequirement,
    visibleInSellerDocuments: !isReviewDraft,
    templateVersion: firstText(artifact?.templateVersion, artifact?.template_version, metadata?.templateVersion, metadata?.template_version),
    brandingVersion: firstText(artifact?.brandingVersion, artifact?.branding_version, metadata?.brandingVersion, metadata?.branding_version),
  })
}

function artifactSelectionScore(artifact = {}, contract = projectSellerDocumentArtifact(artifact)) {
  const stageScore = {
    [SELLER_DOCUMENT_ARTIFACT_STAGES.FINAL_SIGNED]: 400,
    [SELLER_DOCUMENT_ARTIFACT_STAGES.SIGNING_COPY]: 250,
    [SELLER_DOCUMENT_ARTIFACT_STAGES.REQUIREMENT]: 100,
  }[contract.stage] || 0
  const representationScore = {
    [SELLER_DOCUMENT_REPRESENTATION_KINDS.STORED_FILE]: 60,
    [SELLER_DOCUMENT_REPRESENTATION_KINDS.FINAL_PACKET]: 50,
    [SELLER_DOCUMENT_REPRESENTATION_KINDS.GENERATED_HTML]: 40,
    [SELLER_DOCUMENT_REPRESENTATION_KINDS.NONE]: 0,
  }[contract.representation.kind] || 0
  const statusScore = contract.satisfiesRequirement ? 100 : FINAL_STATUS_KEYS.has(normalizeKey(artifact?.status)) ? 25 : 0
  return stageScore + representationScore + statusScore
}

/**
 * Returns at most one visible artefact for each authoritative base-pack key.
 * Review drafts remain available in onboarding data but never occupy a signed
 * document row. Non-base-pack documents pass through unchanged.
 */
export function selectAuthoritativeSellerDocumentArtifacts(artifacts = []) {
  const selectedBasePack = new Map()
  const rows = (Array.isArray(artifacts) ? artifacts : []).filter((artifact) => artifact && typeof artifact === 'object')

  for (const artifact of rows) {
    const contract = projectSellerDocumentArtifact(artifact)
    if (!contract.targetRequirementKey) continue
    if (!contract.visibleInSellerDocuments) continue

    const current = selectedBasePack.get(contract.targetRequirementKey)
    const candidate = { artifact, contract }
    if (!current || artifactSelectionScore(artifact, contract) > artifactSelectionScore(current.artifact, current.contract)) {
      selectedBasePack.set(contract.targetRequirementKey, candidate)
    }
  }

  return rows.flatMap((artifact) => {
    const contract = projectSellerDocumentArtifact(artifact)
    if (!contract.targetRequirementKey) return [artifact]
    if (!contract.visibleInSellerDocuments) return []
    return selectedBasePack.get(contract.targetRequirementKey)?.artifact === artifact
      ? [{ ...artifact, documentContract: contract }]
      : []
  })
}
