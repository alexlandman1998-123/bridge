import {
  OTP_CANONICAL_FIELD_INVENTORY,
  OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION,
} from './otpCanonicalTemplateContract.js'
import {
  OTP_CANONICAL_RUNTIME_BINDING_VERSION,
  OTP_CANONICAL_TEMPLATE_ASSET_VERSION,
} from './otpCanonicalTemplatePreparation.js'

export const OTP_CANONICAL_VERSION_STATUSES = Object.freeze([
  'draft',
  'awaiting_approval',
  'approved',
  'published',
  'archived',
  'superseded',
])

export const OTP_CANONICAL_CANDIDATE_STATUSES = Object.freeze([
  'draft',
  'awaiting_approval',
  'approved',
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getValue(record = {}, camelKey, snakeKey) {
  return record?.[camelKey] ?? record?.[snakeKey]
}

function normalizeVersion(version = {}) {
  return {
    ...version,
    id: normalizeText(version.id),
    templateId: normalizeText(getValue(version, 'templateId', 'template_id')),
    status: normalizeText(version.status).toLowerCase(),
    versionTag: normalizeText(getValue(version, 'versionTag', 'version_tag')),
    previousVersionId: normalizeText(getValue(version, 'previousVersionId', 'previous_version_id')) || null,
    basedOnLiveVersionId: normalizeText(getValue(version, 'basedOnLiveVersionId', 'based_on_live_version_id')) || null,
  }
}

export function buildCanonicalOtpFieldMappingRows({
  templateId,
  templateVersionId,
  organisationId,
  actorUserId = null,
} = {}) {
  const normalizedTemplateId = normalizeText(templateId)
  const normalizedVersionId = normalizeText(templateVersionId)
  if (!normalizedTemplateId) throw new Error('A template id is required to build the OTP field map.')
  if (!normalizedVersionId) throw new Error('A template version id is required to build the OTP field map.')

  return OTP_CANONICAL_FIELD_INVENTORY.map((entry) => ({
    template_id: normalizedTemplateId,
    template_version_id: normalizedVersionId,
    organisation_id: normalizeText(organisationId) || null,
    field_key: entry.key,
    section_key: entry.section,
    field_label: entry.label,
    coverage_type: entry.coverage,
    source_paths: [...entry.sourcePaths],
    document_locator_json: {},
    is_required: entry.required,
    applicable_when: entry.applicableWhen,
    is_variable_legal_text: entry.legalText,
    notes: entry.notes || null,
    created_by: normalizeText(actorUserId) || null,
    updated_by: normalizeText(actorUserId) || null,
  }))
}

export function createCanonicalOtpCandidateVersion({
  template,
  liveVersion = null,
  candidateId,
  versionTag,
  storage = {},
  actorUserId = null,
  now = new Date().toISOString(),
} = {}) {
  const templateId = normalizeText(template?.id)
  const organisationId = normalizeText(getValue(template, 'organisationId', 'organisation_id'))
  const live = liveVersion ? normalizeVersion(liveVersion) : null
  if (!templateId) throw new Error('A canonical OTP template is required.')
  if (!organisationId) throw new Error('The canonical OTP template must belong to an organisation.')
  if (live && live.templateId !== templateId) throw new Error('The live version belongs to a different template.')
  if (live && live.status !== 'published') throw new Error('The current live version must be published.')

  return {
    id: normalizeText(candidateId) || undefined,
    template_id: templateId,
    organisation_id: organisationId,
    module_type: normalizeText(getValue(template, 'moduleType', 'module_type')) || 'residential',
    packet_type: 'otp',
    template_key: normalizeText(getValue(template, 'templateKey', 'template_key')) || 'offer_to_purchase',
    template_label: normalizeText(getValue(template, 'templateLabel', 'template_label')) || 'Offer to Purchase',
    template_format: 'docx',
    version_tag: normalizeText(versionTag) || 'candidate',
    status: 'draft',
    storage_bucket: normalizeText(getValue(storage, 'bucket', 'storage_bucket')) || null,
    storage_path: normalizeText(getValue(storage, 'path', 'storage_path')) || null,
    file_name: normalizeText(getValue(storage, 'fileName', 'file_name')) || null,
    content_hash: normalizeText(getValue(storage, 'contentHash', 'content_hash')) || null,
    previous_version_id: live?.id || null,
    based_on_live_version_id: live?.id || null,
    canonical_contract_version: OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION,
    canonical_runtime_binding_version: OTP_CANONICAL_RUNTIME_BINDING_VERSION,
    canonical_template_asset_version: OTP_CANONICAL_TEMPLATE_ASSET_VERSION,
    field_mapping_version: OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION,
    metadata_json: {
      document_model: 'single_master_document',
      source_document: '2026 OTP - Cover Page.docx',
      canonical_runtime_binding_version: OTP_CANONICAL_RUNTIME_BINDING_VERSION,
      canonical_template_asset_version: OTP_CANONICAL_TEMPLATE_ASSET_VERSION,
      candidate_created_at: now,
    },
    created_by: normalizeText(actorUserId) || null,
    updated_by: normalizeText(actorUserId) || null,
  }
}

export function resolveCanonicalOtpTemplateState({ template = {}, versions = [] } = {}) {
  const templateId = normalizeText(template.id)
  const normalized = versions.map(normalizeVersion).filter((version) => version.templateId === templateId)
  const byId = new Map(normalized.map((version) => [version.id, version]))
  const requestedLiveId = normalizeText(getValue(template, 'liveVersionId', 'live_version_id'))
  const requestedCandidateId = normalizeText(getValue(template, 'candidateVersionId', 'candidate_version_id'))
  const requestedPreviousId = normalizeText(getValue(template, 'previousLiveVersionId', 'previous_live_version_id'))
  const live = byId.get(requestedLiveId) || normalized.find((version) => version.status === 'published') || null
  const candidate = byId.get(requestedCandidateId)
    || normalized.find((version) => OTP_CANONICAL_CANDIDATE_STATUSES.includes(version.status))
    || null
  const previousLive = byId.get(requestedPreviousId)
    || byId.get(live?.previousVersionId)
    || null

  const errors = []
  if (normalizeText(getValue(template, 'documentModel', 'document_model')) !== 'single_master_document') {
    errors.push('Template is not configured as a single master document.')
  }
  if (!live) errors.push('Canonical OTP has no live version.')
  if (live && live.status !== 'published') errors.push('Canonical OTP live version is not published.')
  if (candidate && !OTP_CANONICAL_CANDIDATE_STATUSES.includes(candidate.status)) {
    errors.push('Canonical OTP candidate has an invalid lifecycle status.')
  }
  if (candidate && live && candidate.id === live.id) errors.push('Live and candidate versions must be distinct.')
  if (candidate && live && candidate.basedOnLiveVersionId && candidate.basedOnLiveVersionId !== live.id) {
    errors.push('Candidate was not based on the current live version.')
  }

  return {
    valid: errors.length === 0,
    errors,
    templateId,
    live,
    candidate,
    previousLive,
    canRollback: Boolean(live && previousLive && live.id !== previousLive.id),
  }
}

export function buildCanonicalOtpTemplatePointers({ liveVersion, candidateVersion = null, previousLiveVersion = null } = {}) {
  const live = normalizeVersion(liveVersion)
  const candidate = candidateVersion ? normalizeVersion(candidateVersion) : null
  const previous = previousLiveVersion ? normalizeVersion(previousLiveVersion) : null
  if (!live.id || live.status !== 'published') throw new Error('A published live version is required.')
  if (candidate && !OTP_CANONICAL_CANDIDATE_STATUSES.includes(candidate.status)) {
    throw new Error('Candidate version must be draft, awaiting approval, or approved.')
  }
  if (candidate && candidate.id === live.id) throw new Error('Live and candidate versions must be distinct.')
  if (previous && previous.id === live.id) throw new Error('Previous live version must differ from the current live version.')

  return {
    document_model: 'single_master_document',
    canonical_contract_version: OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION,
    live_version_id: live.id,
    candidate_version_id: candidate?.id || null,
    previous_live_version_id: previous?.id || null,
  }
}
