import { isOrganisationAdminMembershipRole, normalizeOrganisationMembershipRole } from './organisationAccess'
import {
  filterMandateSigningRows,
  getMandateSignerRoleLabel,
  resolveMandateSecondarySignerConfig,
  resolveMandateSpouseRequirementFromFields,
} from './mandateSignatureRules'
import { DOCUMENTS_BUCKET_CANDIDATES, LEGAL_TEMPLATES_BUCKET_CANDIDATES, invokeEdgeFunction, supabase } from './supabaseClient'
import { uploadToStorageCandidateBuckets } from './storageFallbacks'
import { linkPacketToRequirement } from '../services/documents/canonicalDocumentLifecycleService'
import { assertSigningEnvelopeReady } from '../core/documents/signingEnvelopeAssurance'
import { assertSigningDispatchReady } from '../core/documents/signingDispatchAssurance'
import { buildLegalDocumentSupportTriageSnapshot, LEGAL_DOCUMENT_SUPPORT_RESOLUTION_CODES } from '../core/documents/legalDocumentSupportTriage'
import {
  assertDocumentLifecycleTransition,
  resolveDocumentLifecycleStateFromPacket,
  toDocumentPacketStorageStatus,
} from '../core/documents/documentLifecycle'
import {
  buildCanonicalTemplateDefinition,
  TEMPLATE_DEFINITION_SCHEMA_VERSION,
  validateCanonicalTemplateDefinition,
} from '../core/documents/canonicalTemplateDefinition'
import { buildOrganisationTemplateCloneInput } from '../core/documents/organisationTemplateClone'
import { buildTemplateRevisionInput, isImmutableTemplateRevision } from '../core/documents/templateVersioning'
import { assertSigningFieldLayout } from '../core/documents/signingFieldLayout'
import { evaluateConditionalMasterCoverage } from '../core/documents/conditionalMasterCoverageReadiness'
import {
  buildEditableDraftSectionManifest,
  buildEditableTransactionDocumentDraft,
} from '../core/documents/transactionDocumentDraft'
import {
  buildEditableDocumentRevision,
  buildEditableRevisionManifest,
} from '../core/documents/editableDocumentRevision'
export {
  DOCUMENT_LIFECYCLE_STATES,
  DOCUMENT_LIFECYCLE_TRANSITIONS,
  normalizeDocumentLifecycleState,
  resolveDocumentLifecycleStateFromPacket,
  toDocumentPacketStorageStatus,
} from '../core/documents/documentLifecycle'

export const DOCUMENT_PACKET_TYPES = ['otp', 'mandate', 'addendum', 'supporting_legal', 'custom', 'commercial_sale', 'commercial_lease']
export const DOCUMENT_PACKET_STATUSES = [
  'draft',
  'ready_for_generation',
  'generated',
  'signing_prep',
  'sent',
  'partially_signed',
  'completed',
  'voided',
  'archived',
]
export const DOCUMENT_TEMPLATE_SECTION_TYPES = [
  'legal_text',
  'dynamic_fields',
  'conditional_clause',
  'annexure',
  'signature_zone',
  'metadata',
]
export const DOCUMENT_PACKET_RENDER_STATUSES = ['draft', 'generated', 'failed', 'superseded']
export const DOCUMENT_SIGNER_ROLES = [
  'purchaser_1',
  'purchaser_2',
  'buyer_spouse',
  'seller',
  'seller_spouse',
  'agent',
  'contractor',
  'witness_1',
  'witness_2',
  'other',
]
export const DOCUMENT_SIGNING_FIELD_TYPES = ['initial', 'signature', 'date', 'text']
export const DOCUMENT_SIGNING_FIELD_STATUSES = ['pending', 'completed', 'skipped']
export const DOCUMENT_PACKET_SIGNER_STATUSES = ['pending', 'ready_to_send', 'sent', 'viewed', 'signed', 'declined', 'expired']

const PACKET_VERSION_SELECT =
  'id, packet_id, organisation_id, version_number, render_status, rendered_document_id, rendered_file_path, rendered_file_name, rendered_file_url, rendered_file_bucket, rendered_media_type, rendered_byte_length, rendered_sha256, transaction_pdf_persisted, transaction_pdf_persisted_at, final_signed_file_path, final_signed_file_url, final_signed_file_bucket, final_signed_file_name, final_signed_document_id, finalised_at, finalised_by, placeholders_resolved_json, placeholders_missing_json, section_manifest_json, validation_summary_json, source_template_revision_id, editable_content_schema_version, editable_content_json, edit_status, edit_sequence, render_freeze_id, render_freeze_status, render_frozen_at, render_content_fingerprint, render_source_version_id, render_source_fingerprint, render_input_verified, render_input_verified_at, native_pdf_verified, native_pdf_verified_at, native_pdf_renderer_contract, generated_by, generated_at, created_at, updated_at'

// Keep packet reads usable while the document-generator migration stream is being
// promoted. These are the original packet-version columns required for mandate
// generation and preview; newer artifact/editing fields are optional read metadata.
const PACKET_VERSION_COMPAT_SELECT =
  'id, packet_id, organisation_id, version_number, render_status, rendered_document_id, rendered_file_path, rendered_file_name, rendered_file_url, placeholders_resolved_json, placeholders_missing_json, section_manifest_json, validation_summary_json, generated_by, generated_at, created_at, updated_at'

let organisationBrandingTableAvailable = true
let cachedPacketAuthUser = null
let cachedPacketAuthUserAt = 0
let pendingPacketAuthUserPromise = null
const PACKET_AUTH_USER_CACHE_TTL_MS = 10 * 1000
const PACKET_CONTEXT_CACHE_TTL_MS = 10 * 1000
const TEMPLATE_SELECT_PLAN_CACHE_TTL_MS = 10 * 60 * 1000
const TEMPLATE_SELECT_PLAN_CACHE_KEY = 'arch9:document-packet-template-select-plan:v2'
const cachedPacketContexts = new Map()
const pendingPacketContextPromises = new Map()
let documentPacketTemplateSelectPlanIndex = 0
let documentPacketTemplateSelectPlanCachedAt = 0
let packetVersionCompatibilityWarningLogged = false
let packetVersionReadUsesCompatibility = false

const ALLOWED_PACKET_STATUS_TRANSITIONS = {
  draft: ['ready_for_generation', 'generated', 'voided', 'archived'],
  ready_for_generation: ['draft', 'generated', 'voided', 'archived'],
  generated: ['draft', 'signing_prep', 'sent', 'partially_signed', 'completed', 'voided', 'archived'],
  signing_prep: ['generated', 'sent', 'voided', 'archived'],
  sent: ['partially_signed', 'completed', 'voided', 'archived'],
  partially_signed: ['completed', 'voided', 'archived'],
  completed: ['archived'],
  voided: ['archived'],
  archived: [],
}

const PACKET_CONTEXT_ORG_WARNED = new Set()

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeTemplateKey(value = '', fallback = 'template') {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || fallback
}

function normalizeNullableText(value) {
  const text = normalizeText(value)
  return text || null
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function normalizeNullableUuid(value) {
  const text = normalizeText(value)
  return isUuidLike(text) ? text : null
}

function humanizePacketEventMessage(eventType = '', payload = {}) {
  const type = normalizeText(eventType).toLowerCase()
  const sellerName = normalizeText(payload?.sellerName || payload?.seller_name || payload?.signerName || payload?.signer_name)
  const reason = normalizeText(payload?.failureMessage || payload?.reason || payload?.message)
  const messages = {
    seller_onboarding_sent: sellerName ? `Seller onboarding was sent to ${sellerName}.` : 'Seller onboarding was sent.',
    seller_onboarding_completed: 'Seller onboarding was completed.',
    mandate_validation_failed: reason || 'Mandate validation failed because required information is missing.',
    generation_started: 'Mandate generation started.',
    version_generated: 'Mandate was generated successfully.',
    packet_regenerated: 'Mandate was regenerated successfully.',
    mandate_pdf_created: 'Mandate PDF was created.',
    generation_failed: reason ? `Mandate generation failed because ${reason}.` : 'Mandate generation failed.',
    mandate_failed: reason ? `Mandate failed because ${reason}.` : 'Mandate action failed.',
    physical_mandate_downloaded: 'Mandate was downloaded for physical signature.',
    signed_physical_mandate_uploaded: 'Signed mandate was uploaded.',
    manual_signed_document_uploaded: 'Signed mandate was uploaded.',
    digital_signing_prepared: 'Digital signing was prepared.',
    mandate_sent_for_digital_signing: 'Mandate was sent to the seller for digital signing.',
    mandate_signing_link_resent: 'Mandate signing link was resent.',
    mandate_signing_email_resent: 'Mandate signing email was resent.',
    signer_link_viewed: sellerName ? `${sellerName} viewed the mandate.` : 'Seller viewed the mandate.',
    signer_completed_signing: sellerName ? `${sellerName} signed the mandate.` : 'Seller signed the mandate.',
    mandate_signed_by_seller: sellerName ? `${sellerName} signed the mandate.` : 'Seller signed the mandate.',
    all_signers_completed: 'All required signers completed the mandate.',
    signer_declined: sellerName ? `${sellerName} declined the mandate.` : 'Seller declined the mandate.',
    mandate_cancelled: 'Mandate was cancelled.',
  }
  return messages[type] || normalizeText(payload?.message) || normalizeText(eventType).replace(/_/g, ' ')
}

function buildActivityEventPayload({ eventType = '', eventPayload = {}, packetId = '', versionId = '', context = null } = {}) {
  const base = eventPayload && typeof eventPayload === 'object' ? eventPayload : {}
  return {
    activity_type: normalizeText(base.activity_type || base.activityType || eventType),
    lead_id: normalizeNullableUuid(base.lead_id || base.leadId) || null,
    transaction_id: normalizeNullableUuid(base.transaction_id || base.transactionId) || null,
    private_listing_id: normalizeNullableUuid(base.private_listing_id || base.privateListingId) || null,
    document_packet_id: normalizeNullableUuid(base.document_packet_id || base.documentPacketId || packetId) || null,
    document_packet_version_id: normalizeNullableUuid(base.document_packet_version_id || base.documentPacketVersionId || versionId) || null,
    signer_id: normalizeNullableUuid(base.signer_id || base.signerId) || null,
    created_by: normalizeNullableUuid(base.created_by || base.createdBy || context?.user?.id) || null,
    actor_name: normalizeText(base.actor_name || base.actorName || context?.user?.email || ''),
    actor_role: normalizeText(base.actor_role || base.actorRole || context?.membershipRole || ''),
    message: humanizePacketEventMessage(eventType, base),
    visibility: normalizeText(base.visibility) || 'internal',
    created_at: normalizeText(base.created_at || base.createdAt) || new Date().toISOString(),
    metadata: base.metadata && typeof base.metadata === 'object' ? base.metadata : {},
    ...base,
  }
}

export function safeUuid(value) {
  return normalizeNullableUuid(value)
}

function collectInvalidUuidReferences(input = {}, fields = []) {
  const invalidReferences = {}
  fields.forEach(({ inputKey, contextKey = inputKey }) => {
    const rawValue = input?.[inputKey]
    const normalized = normalizeText(rawValue)
    if (normalized && !normalizeNullableUuid(normalized)) {
      invalidReferences[contextKey] = normalized
    }
  })
  return invalidReferences
}

function mergeSourceContextWithInvalidReferences(sourceContext = {}, invalidReferences = {}) {
  const base = sourceContext && typeof sourceContext === 'object' ? sourceContext : {}
  if (!invalidReferences || !Object.keys(invalidReferences).length) return base
  return {
    ...base,
    invalidUuidReferences: {
      ...(base.invalidUuidReferences && typeof base.invalidUuidReferences === 'object'
        ? base.invalidUuidReferences
        : {}),
      ...invalidReferences,
    },
  }
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeStorageSafeName(value = '', fallback = 'asset') {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function normalizeTemplateRegistryStatus(value = '', { isActive = false, isDefault = false } = {}) {
  const normalized = normalizeText(value).toLowerCase()
  if (['published', 'active', 'approved', 'live'].includes(normalized)) return 'published'
  if (['archived', 'deprecated', 'superseded'].includes(normalized)) return 'archived'
  if (['draft', 'in_review', 'review'].includes(normalized)) return 'draft'
  return isActive || isDefault ? 'published' : 'draft'
}

function isTemplatePublished(template = {}) {
  const status = normalizeText(template?.status).toLowerCase()
  if (status) return status === 'published'
  return template?.is_active !== false
}

function resolveTemplateModuleCandidates(packetType = '', moduleType = '') {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  const normalizedModuleType = normalizeText(moduleType).toLowerCase()
  const candidates = []

  if (normalizedModuleType) candidates.push(normalizedModuleType)

  if (normalizedPacketType.startsWith('commercial_')) {
    candidates.push('commercial')
  } else if (['mandate', 'otp', 'addendum', 'supporting_legal', 'custom'].includes(normalizedPacketType)) {
    candidates.push('residential', 'agency')
  }

  candidates.push('shared')
  return Array.from(new Set(candidates.filter(Boolean)))
}

function resolveTemplateUpdatedAt(template = {}) {
  const date = Date.parse(template?.published_at || template?.updated_at || template?.created_at || '')
  return Number.isFinite(date) ? date : 0
}

function scoreTemplateCandidate(template = {}, { organisationId = '', moduleCandidates = [] } = {}) {
  const templateOrgId = normalizeText(template?.organisation_id)
  const templateModuleType = normalizeText(template?.module_type).toLowerCase()
  const moduleIndex = moduleCandidates.includes(templateModuleType)
    ? moduleCandidates.indexOf(templateModuleType)
    : moduleCandidates.length + 1
  const ownerRank = templateOrgId && templateOrgId === normalizeText(organisationId)
    ? 0
    : templateOrgId
      ? 1
      : 2
  const defaultRank = template?.is_default ? 0 : 1
  const updatedRank = -resolveTemplateUpdatedAt(template)

  return [
    ownerRank,
    moduleIndex,
    defaultRank,
    updatedRank,
  ]
}

function compareTemplateCandidates(left = {}, right = {}, context = {}) {
  const leftScore = scoreTemplateCandidate(left, context)
  const rightScore = scoreTemplateCandidate(right, context)
  for (let index = 0; index < leftScore.length; index += 1) {
    if (leftScore[index] !== rightScore[index]) return leftScore[index] - rightScore[index]
  }
  return normalizeText(left?.id).localeCompare(normalizeText(right?.id))
}

function resolveTemplateResolutionSource(template = {}, organisationId = '') {
  const isOrgTemplate = normalizeText(template?.organisation_id) === normalizeText(organisationId)
  if (isOrgTemplate && template?.is_default) return 'organisation_default'
  if (isOrgTemplate) return 'organisation_active'
  if (!template?.organisation_id && template?.is_default) return 'global_default'
  if (!template?.organisation_id) return 'global_active'
  return 'fallback'
}

function normalizeFileExtension(fileName = '', fallback = 'docx') {
  const normalized = normalizeText(fileName)
  if (!normalized.includes('.')) return fallback
  const extension = normalized.split('.').pop()?.toLowerCase() || fallback
  return extension.replace(/[^a-z0-9]/g, '') || fallback
}

function isMissingTableOrSchemaError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message).toLowerCase()
  return code === '42P01' || code === 'PGRST204' || code === 'PGRST205' || message.includes('schema cache')
}

function isMissingColumnError(error, columnName = '') {
  if (!error) return false
  const status = Number(error?.status || error?.statusCode || 0)
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message).toLowerCase()
  const details = normalizeText(error?.details).toLowerCase()
  const hint = normalizeText(error?.hint).toLowerCase()
  const normalizedColumn = normalizeText(columnName).toLowerCase()
  if (message.includes('permission denied')) return false

  const missingColumnByCode = code === '42703' || code === 'PGRST204' || code === 'PGRST116'
  const hasNamedColumnMatch = normalizedColumn
    ? message.includes(normalizedColumn) || details.includes(normalizedColumn) || hint.includes(normalizedColumn)
    : true

  if (missingColumnByCode) {
    return hasNamedColumnMatch
  }
  if (status === 400 && message.includes('column') && message.includes('does not exist')) {
    return hasNamedColumnMatch
  }
  return normalizedColumn
    ? message.includes('column') && message.includes(normalizedColumn)
    : message.includes('column')
}

async function readPacketVersionsWithSchemaCompatibility(buildQuery) {
  if (packetVersionReadUsesCompatibility) return buildQuery(PACKET_VERSION_COMPAT_SELECT)

  const currentResult = await buildQuery(PACKET_VERSION_SELECT)
  if (!currentResult?.error || !isMissingColumnError(currentResult.error)) return currentResult

  packetVersionReadUsesCompatibility = true
  if (!packetVersionCompatibilityWarningLogged) {
    packetVersionCompatibilityWarningLogged = true
    console.warn('[PACKETS] optional packet-version columns are unavailable; using the compatible read shape.', {
      code: currentResult.error?.code || null,
      message: currentResult.error?.message || null,
    })
  }

  return buildQuery(PACKET_VERSION_COMPAT_SELECT)
}

function isMissingSpecificTableError(error, tableName) {
  if (!isMissingTableOrSchemaError(error)) return false
  const message = normalizeText(error?.message).toLowerCase()
  return message.includes(String(tableName || '').toLowerCase())
}

function isPermissionDeniedError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message).toLowerCase()
  const details = normalizeText(error?.details).toLowerCase()
  return code === '42501' || message.includes('row-level security') || details.includes('row-level security')
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  return fallback
}

function parseBucketCandidates(value) {
  return String(value || '')
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

const FINAL_SIGNED_BUCKET_CANDIDATES = Array.from(
  new Set([
    ...parseBucketCandidates(import.meta.env.VITE_SIGNED_DOCUMENTS_BUCKET),
    ...parseBucketCandidates(import.meta.env.VITE_SUPABASE_SIGNED_DOCUMENTS_BUCKET),
    ...DOCUMENTS_BUCKET_CANDIDATES,
    'documents',
  ]),
)

async function createSignedUrlAcrossBuckets(client, filePath, bucketCandidates = [], expiresInSeconds = 60 * 60) {
  const path = normalizeText(filePath)
  if (!path) return null

  for (const bucket of [...new Set((bucketCandidates || []).map((item) => normalizeText(item)).filter(Boolean))]) {
    const result = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds)
    if (!result.error && result.data?.signedUrl) {
      return {
        bucket,
        signedUrl: result.data.signedUrl,
      }
    }
  }
  return null
}

async function hydratePacketVersionAccessUrls(client, version = {}) {
  const hydrated = { ...version }
  const renderedPath = normalizeText(version?.rendered_file_path)
  const finalPath = normalizeText(version?.final_signed_file_path)

  if (renderedPath) {
    const renderedBucketHint = normalizeText(version?.rendered_file_bucket)
    const renderedCandidates = renderedBucketHint
      ? [renderedBucketHint, ...DOCUMENTS_BUCKET_CANDIDATES]
      : DOCUMENTS_BUCKET_CANDIDATES
    const renderedSignedUrl = await createSignedUrlAcrossBuckets(client, renderedPath, renderedCandidates)
    hydrated.rendered_file_access_url = renderedSignedUrl?.signedUrl || normalizeNullableText(version?.rendered_file_url)
    hydrated.rendered_file_bucket = renderedSignedUrl?.bucket || renderedBucketHint || null
  } else {
    hydrated.rendered_file_access_url = normalizeNullableText(version?.rendered_file_url)
  }

  if (finalPath) {
    const finalBucketHint = normalizeText(version?.final_signed_file_bucket)
    const finalCandidates = finalBucketHint
      ? [finalBucketHint, ...FINAL_SIGNED_BUCKET_CANDIDATES]
      : FINAL_SIGNED_BUCKET_CANDIDATES
    const finalSignedUrl = await createSignedUrlAcrossBuckets(client, finalPath, finalCandidates)
    hydrated.final_signed_file_access_url = finalSignedUrl?.signedUrl || normalizeNullableText(version?.final_signed_file_url)
    hydrated.final_signed_file_bucket = finalSignedUrl?.bucket || finalBucketHint || null
  } else {
    hydrated.final_signed_file_access_url = normalizeNullableText(version?.final_signed_file_url)
  }

  return hydrated
}

function generateSecureSigningToken() {
  const bytes = new Uint8Array(32)
  if (typeof crypto?.getRandomValues !== 'function') throw new Error('Secure random token generation is unavailable in this browser.')
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function assertSignerRole(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (!DOCUMENT_SIGNER_ROLES.includes(normalized)) {
    throw new Error(`signerRole must be one of: ${DOCUMENT_SIGNER_ROLES.join(', ')}`)
  }
  return normalized
}

function assertSigningFieldType(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (!DOCUMENT_SIGNING_FIELD_TYPES.includes(normalized)) {
    throw new Error(`fieldType must be one of: ${DOCUMENT_SIGNING_FIELD_TYPES.join(', ')}`)
  }
  return normalized
}

function assertSigningFieldStatus(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (!DOCUMENT_SIGNING_FIELD_STATUSES.includes(normalized)) {
    throw new Error(`status must be one of: ${DOCUMENT_SIGNING_FIELD_STATUSES.join(', ')}`)
  }
  return normalized
}

function assertPacketSignerStatus(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (!DOCUMENT_PACKET_SIGNER_STATUSES.includes(normalized)) {
    throw new Error(`status must be one of: ${DOCUMENT_PACKET_SIGNER_STATUSES.join(', ')}`)
  }
  return normalized
}

async function updatePendingSigningFieldsForSigner(client, signer = {}) {
  const signerRole = assertSignerRole(signer?.signer_role)
  const packetVersionId = normalizeText(signer?.packet_version_id)
  if (!packetVersionId) return

  const { error } = await client
    .from('document_signing_fields')
    .update({
      signer_name: normalizeNullableText(signer?.signer_name),
      signer_email: normalizeNullableText(signer?.signer_email ? String(signer.signer_email).toLowerCase() : null),
    })
    .eq('packet_version_id', packetVersionId)
    .eq('signer_role', signerRole)
    .neq('status', 'completed')

  if (error && !isMissingTableOrSchemaError(error)) throw error
}

function resolveTemplateMetadataValue(template = {}, keys = []) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  for (const key of keys) {
    const direct = normalizeText(template?.[key])
    if (direct) return direct
    const metadataValue = normalizeText(metadata?.[key])
    if (metadataValue) return metadataValue
  }
  return ''
}

function hydrateTemplateRecord(template = {}) {
  const hydrated = {
    ...template,
    template_storage_path: resolveTemplateMetadataValue(template, ['template_storage_path', 'templatePath']),
    template_storage_bucket: resolveTemplateMetadataValue(template, [
      'template_storage_bucket',
      'template_bucket',
      'templateBucket',
    ]),
    template_file_name: resolveTemplateMetadataValue(template, [
      'template_file_name',
      'template_filename',
      'templateFilename',
    ]),
    template_output_bucket: resolveTemplateMetadataValue(template, ['template_output_bucket', 'output_bucket', 'outputBucket']),
  }
  return {
    ...hydrated,
    canonical_definition: buildCanonicalTemplateDefinition(hydrated),
  }
}

const DOCUMENT_PACKET_TEMPLATE_SELECT_PHASE_B4 =
  'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, template_storage_bucket, template_storage_path, template_file_name, version_tag, description, status, is_default, is_active, metadata_json, definition_schema_version, definition_json, revision_root_template_id, revision_parent_template_id, revision_number, superseded_by_template_id, created_by, updated_by, published_by, published_at, archived_by, archived_at, created_at, updated_at'
const DOCUMENT_PACKET_TEMPLATE_SELECT_PHASE_B1 =
  'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, template_storage_bucket, template_storage_path, template_file_name, version_tag, description, status, is_default, is_active, metadata_json, definition_schema_version, definition_json, created_by, updated_by, published_by, published_at, archived_by, archived_at, created_at, updated_at'
const DOCUMENT_PACKET_TEMPLATE_SELECT_PHASE2 =
  'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, template_storage_bucket, template_storage_path, template_file_name, version_tag, description, status, is_default, is_active, metadata_json, created_by, updated_by, published_by, published_at, archived_by, archived_at, created_at, updated_at'
const DOCUMENT_PACKET_TEMPLATE_SELECT =
  'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, template_storage_path, version_tag, description, is_default, is_active, metadata_json, created_by, created_at, updated_at'
const DOCUMENT_PACKET_TEMPLATE_SELECT_NO_IS_ACTIVE =
  'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, template_storage_path, version_tag, description, is_default, metadata_json, created_by, created_at, updated_at'
const DOCUMENT_PACKET_TEMPLATE_SELECT_LEGACY =
  'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, is_default, metadata_json, created_by, created_at, updated_at'

const DOCUMENT_PACKET_TEMPLATE_QUERY_PLANS = [
  {
    select: DOCUMENT_PACKET_TEMPLATE_SELECT_PHASE_B4,
    activeFilter: ({ includeInactive }) => !includeInactive,
  },
  {
    select: DOCUMENT_PACKET_TEMPLATE_SELECT_PHASE_B1,
    activeFilter: ({ includeInactive }) => !includeInactive,
  },
  {
    select: DOCUMENT_PACKET_TEMPLATE_SELECT_PHASE2,
    activeFilter: ({ includeInactive }) => !includeInactive,
  },
  {
    select: DOCUMENT_PACKET_TEMPLATE_SELECT,
    activeFilter: ({ includeInactive }) => !includeInactive,
  },
  {
    select: DOCUMENT_PACKET_TEMPLATE_SELECT_NO_IS_ACTIVE,
    activeFilter: () => false,
  },
  {
    select: DOCUMENT_PACKET_TEMPLATE_SELECT_LEGACY,
    activeFilter: () => false,
  },
]

const DOCUMENT_PACKET_TEMPLATE_SCHEMA_COMPAT_COLUMNS = [
  'is_active',
  'status',
  'template_storage_bucket',
  'template_storage_path',
  'template_file_name',
  'version_tag',
  'description',
  'change_summary',
  'content_hash',
  'updated_by',
  'published_by',
  'published_at',
  'archived_by',
  'archived_at',
  'definition_schema_version',
  'definition_json',
  'revision_root_template_id',
  'revision_parent_template_id',
  'revision_number',
  'superseded_by_template_id',
]

const DOCUMENT_PACKET_TEMPLATE_WRITE_COMPAT_COLUMNS = new Set([
  'status',
  'template_storage_bucket',
  'template_storage_path',
  'template_file_name',
  'change_summary',
  'content_hash',
  'updated_by',
  'published_by',
  'published_at',
  'archived_by',
  'archived_at',
  'definition_schema_version',
  'definition_json',
  'revision_root_template_id',
  'revision_parent_template_id',
  'revision_number',
  'superseded_by_template_id',
])

function getDocumentPacketTemplateCompatibleMissingColumn(error) {
  return DOCUMENT_PACKET_TEMPLATE_SCHEMA_COMPAT_COLUMNS.find((columnName) => isMissingColumnError(error, columnName)) || ''
}

function readDocumentPacketTemplateSelectPlanIndex() {
  if (typeof window === 'undefined') return documentPacketTemplateSelectPlanIndex
  const now = Date.now()
  if (
    documentPacketTemplateSelectPlanCachedAt &&
    now - documentPacketTemplateSelectPlanCachedAt < TEMPLATE_SELECT_PLAN_CACHE_TTL_MS
  ) {
    return documentPacketTemplateSelectPlanIndex
  }

  try {
    const cached = JSON.parse(window.sessionStorage.getItem(TEMPLATE_SELECT_PLAN_CACHE_KEY) || 'null')
    const cachedIndex = Number(cached?.index)
    const cachedAt = Number(cached?.cachedAt || 0)
    if (
      Number.isInteger(cachedIndex) &&
      cachedIndex >= 0 &&
      cachedIndex < DOCUMENT_PACKET_TEMPLATE_QUERY_PLANS.length &&
      cachedAt &&
      now - cachedAt < TEMPLATE_SELECT_PLAN_CACHE_TTL_MS
    ) {
      documentPacketTemplateSelectPlanIndex = cachedIndex
      documentPacketTemplateSelectPlanCachedAt = cachedAt
      return documentPacketTemplateSelectPlanIndex
    }
  } catch {
    // Ignore invalid session cache entries and probe from the newest select shape.
  }

  documentPacketTemplateSelectPlanIndex = 0
  documentPacketTemplateSelectPlanCachedAt = now
  return documentPacketTemplateSelectPlanIndex
}

function rememberDocumentPacketTemplateSelectPlanIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= DOCUMENT_PACKET_TEMPLATE_QUERY_PLANS.length) return
  const now = Date.now()
  documentPacketTemplateSelectPlanIndex = index
  documentPacketTemplateSelectPlanCachedAt = now
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.setItem(TEMPLATE_SELECT_PLAN_CACHE_KEY, JSON.stringify({ index, cachedAt: now }))
  } catch {
    // Session storage can be unavailable in restricted browser modes.
  }
}

function assignTemplateMetadataCompatibilityValue(metadata, keys = [], value) {
  if (value === undefined) return
  const normalizedValue = normalizeNullableText(value)
  for (const key of keys) {
    metadata[key] = normalizedValue
  }
}

function buildDocumentPacketTemplateMetadata(metadataJson = {}, {
  templateStorageBucket,
  templateStoragePath,
  templateFileName,
  status,
} = {}) {
  const metadata = metadataJson && typeof metadataJson === 'object' ? { ...metadataJson } : {}
  assignTemplateMetadataCompatibilityValue(metadata, [
    'template_storage_bucket',
    'template_bucket',
    'templateBucket',
  ], templateStorageBucket)
  assignTemplateMetadataCompatibilityValue(metadata, [
    'template_storage_path',
    'templatePath',
  ], templateStoragePath)
  assignTemplateMetadataCompatibilityValue(metadata, [
    'template_file_name',
    'template_filename',
    'templateFilename',
  ], templateFileName)

  if (status !== undefined) {
    const normalizedStatus = normalizeNullableText(status)
    metadata.template_status = normalizedStatus
    metadata.lifecycle_status = normalizedStatus === 'published' ? 'active' : normalizedStatus
  }

  return metadata
}

function omitDocumentPacketTemplateMissingPayloadColumn(payload = {}, error = null) {
  const missingColumn = getDocumentPacketTemplateCompatibleMissingColumn(error)
  if (!missingColumn || !DOCUMENT_PACKET_TEMPLATE_WRITE_COMPAT_COLUMNS.has(missingColumn)) {
    return { payload, omitted: false, missingColumn }
  }
  if (!Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
    return { payload, omitted: false, missingColumn }
  }

  const nextPayload = { ...payload }
  delete nextPayload[missingColumn]
  return { payload: nextPayload, omitted: true, missingColumn }
}

async function insertDocumentPacketTemplateWithFallback(client, payload = {}) {
  let nextPayload = { ...payload }
  let planIndex = readDocumentPacketTemplateSelectPlanIndex()
  let lastError = null

  for (let attempt = 0; attempt < DOCUMENT_PACKET_TEMPLATE_QUERY_PLANS.length + DOCUMENT_PACKET_TEMPLATE_WRITE_COMPAT_COLUMNS.size; attempt += 1) {
    const plan = DOCUMENT_PACKET_TEMPLATE_QUERY_PLANS[planIndex] || DOCUMENT_PACKET_TEMPLATE_QUERY_PLANS[DOCUMENT_PACKET_TEMPLATE_QUERY_PLANS.length - 1]
    const { data, error } = await client
      .from('document_packet_templates')
      .insert(nextPayload)
      .select(plan.select)
      .single()

    if (!error) {
      rememberDocumentPacketTemplateSelectPlanIndex(planIndex)
      return hydrateTemplateRecord(data)
    }

    lastError = error
    const fallback = omitDocumentPacketTemplateMissingPayloadColumn(nextPayload, error)
    if (!fallback.missingColumn) throw error
    if (fallback.omitted) nextPayload = fallback.payload

    const nextPlanIndex = Math.min(planIndex + 1, DOCUMENT_PACKET_TEMPLATE_QUERY_PLANS.length - 1)
    if (!fallback.omitted && nextPlanIndex === planIndex) throw error
    planIndex = nextPlanIndex
    rememberDocumentPacketTemplateSelectPlanIndex(planIndex)
  }

  throw lastError || new Error('Unable to create document packet template.')
}

async function updateDocumentPacketTemplateRowWithFallback(client, templateId, payload = {}) {
  let nextPayload = { ...payload }
  let lastError = null

  for (let attempt = 0; attempt < DOCUMENT_PACKET_TEMPLATE_WRITE_COMPAT_COLUMNS.size + 1; attempt += 1) {
    if (!Object.keys(nextPayload).length) return true
    const { error } = await client
      .from('document_packet_templates')
      .update(nextPayload)
      .eq('id', templateId)

    if (!error) return true

    lastError = error
    const fallback = omitDocumentPacketTemplateMissingPayloadColumn(nextPayload, error)
    if (!fallback.omitted) throw error
    nextPayload = fallback.payload
  }

  throw lastError || new Error('Unable to update document packet template.')
}

async function queryDocumentPacketTemplatesWithFallback(client, {
  packetType = null,
  moduleType = null,
  includeInactive = false,
  organisationId = null,
  limit = null,
  templateId = null,
} = {}) {
  const context = await resolvePacketContext(client, { organisationId })
  const preferredPlanIndex = readDocumentPacketTemplateSelectPlanIndex()
  const queryPlans = DOCUMENT_PACKET_TEMPLATE_QUERY_PLANS.slice(preferredPlanIndex)

  let lastError = null
  for (let index = 0; index < queryPlans.length; index += 1) {
    const plan = queryPlans[index]
    const planIndex = preferredPlanIndex + index
    let query = client
      .from('document_packet_templates')
      .select(plan.select)
      .or(`organisation_id.eq.${context.organisationId},organisation_id.is.null`)

    if (templateId) {
      query = query.eq('id', templateId)
    } else {
      query = query
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false })
      if (packetType) query = query.eq('packet_type', assertPacketType(packetType))
      if (moduleType) query = query.eq('module_type', normalizeText(moduleType).toLowerCase())
      if (plan.activeFilter({ includeInactive })) query = query.eq('is_active', true)
      if (Number.isFinite(Number(limit)) && Number(limit) > 0) query = query.limit(Number(limit))
    }

    const result = templateId ? await query.maybeSingle() : await query
    if (!result.error) {
      rememberDocumentPacketTemplateSelectPlanIndex(planIndex)
      if (templateId) return result.data ? hydrateTemplateRecord(result.data) : null
      return (result.data || []).map((template) => hydrateTemplateRecord(template))
    }

    lastError = result.error
    const compatibleMissingColumn = getDocumentPacketTemplateCompatibleMissingColumn(result.error)
    if (!compatibleMissingColumn) {
      throw result.error
    }
    rememberDocumentPacketTemplateSelectPlanIndex(Math.min(planIndex + 1, DOCUMENT_PACKET_TEMPLATE_QUERY_PLANS.length - 1))
  }

  throw lastError || new Error('Unable to load document packet templates.')
}

async function syncCanonicalDocumentPacketTemplateDefinition(client, templateId, { template = null, sections = null } = {}) {
  const resolvedTemplate = template || await queryDocumentPacketTemplatesWithFallback(client, { templateId })
  if (!resolvedTemplate) throw new Error('Template not found while synchronizing its canonical definition.')
  if (!['mandate', 'otp', 'addendum'].includes(normalizeText(resolvedTemplate.packet_type).toLowerCase())) return null

  let resolvedSections = sections
  if (!Array.isArray(resolvedSections)) {
    const { data, error } = await client
      .from('document_template_sections')
      .select('id, template_id, section_key, section_label, section_type, sort_order, is_required, is_repeatable, condition_json, placeholder_keys, legal_text, metadata_json, created_at, updated_at')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    resolvedSections = data || []
  }

  const definition = buildCanonicalTemplateDefinition(resolvedTemplate, resolvedSections)
  const validation = validateCanonicalTemplateDefinition(definition)
  if (!validation.valid) {
    const error = new Error(`Invalid canonical template definition: ${validation.blockers[0]}`)
    error.code = 'INVALID_CANONICAL_TEMPLATE_DEFINITION'
    error.blockers = validation.blockers
    throw error
  }

  await updateDocumentPacketTemplateRowWithFallback(client, templateId, {
    definition_schema_version: TEMPLATE_DEFINITION_SCHEMA_VERSION,
    definition_json: definition,
  })
  return definition
}

async function getAuthenticatedUser(client) {
  const now = Date.now()
  if (cachedPacketAuthUser?.id && now - cachedPacketAuthUserAt < PACKET_AUTH_USER_CACHE_TTL_MS) {
    return cachedPacketAuthUser
  }
  if (pendingPacketAuthUserPromise) {
    return pendingPacketAuthUserPromise
  }

  pendingPacketAuthUserPromise = (async () => {
    // Packet reads run throughout the mandate workspace. The session is already
    // established by the application gate, and RLS still validates its access
    // token server-side. Avoid making every cold packet read wait on auth.getUser.
    const sessionResult = await client.auth.getSession().catch(() => null)
    const sessionUser = sessionResult?.data?.session?.user || null
    if (sessionUser?.id) {
      cachedPacketAuthUser = sessionUser
      cachedPacketAuthUserAt = Date.now()
      return cachedPacketAuthUser
    }

    const authResult = await client.auth.getUser()
    if (authResult.error) throw authResult.error
    if (!authResult.data?.user?.id) throw new Error('You must be signed in to access document packets.')
    cachedPacketAuthUser = authResult.data.user
    cachedPacketAuthUserAt = Date.now()
    return cachedPacketAuthUser
  })()
    .finally(() => {
      pendingPacketAuthUserPromise = null
    })

  return pendingPacketAuthUserPromise
}

async function resolvePacketContext(client, { organisationId = null } = {}) {
  const user = await getAuthenticatedUser(client)
  const rawOrganisationId = normalizeText(organisationId)
  const scopedOrganisationId = normalizeNullableUuid(rawOrganisationId)
  const warnedNonUuidOrganisationKey = `non_uuid_org:${rawOrganisationId || '__empty__'}`
  const cacheKey = `${user.id}:${scopedOrganisationId || '*'}`
  const cachedContext = cachedPacketContexts.get(cacheKey)
  const now = Date.now()
  if (cachedContext && now - cachedContext.cachedAt < PACKET_CONTEXT_CACHE_TTL_MS) {
    return cachedContext.value
  }
  if (pendingPacketContextPromises.has(cacheKey)) {
    return pendingPacketContextPromises.get(cacheKey)
  }
  const contextPromise = (async () => {
    let query = client
      .from('organisation_users')
      .select('id, organisation_id, role, status, user_id, email')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })

    if (scopedOrganisationId) {
      query = query.eq('organisation_id', scopedOrganisationId)
    } else if (rawOrganisationId) {
      if (!PACKET_CONTEXT_ORG_WARNED.has(warnedNonUuidOrganisationKey)) {
        PACKET_CONTEXT_ORG_WARNED.add(warnedNonUuidOrganisationKey)
        console.debug('[PACKETS] Ignoring non-UUID organisation reference while resolving packet context.', {
          value: rawOrganisationId,
        })
      }
    }

    const { data, error } = await query.limit(1).maybeSingle()
    if (error) throw error
    if (!data?.organisation_id) {
      throw new Error('No active organisation membership found for this user.')
    }

    const membershipRole = normalizeOrganisationMembershipRole(data.role)
    const context = {
      user,
      organisationId: data.organisation_id,
      membershipRole,
      isOrgAdmin: isOrganisationAdminMembershipRole(membershipRole),
    }
    cachedPacketContexts.set(cacheKey, {
      value: context,
      cachedAt: Date.now(),
    })
    return context
  })().finally(() => {
    pendingPacketContextPromises.delete(cacheKey)
  })

  pendingPacketContextPromises.set(cacheKey, contextPromise)
  return contextPromise
}

function assertPacketType(packetType) {
  const normalized = normalizeText(packetType).toLowerCase()
  if (!DOCUMENT_PACKET_TYPES.includes(normalized)) {
    throw new Error(`packetType must be one of: ${DOCUMENT_PACKET_TYPES.join(', ')}`)
  }
  return normalized
}

async function hasSigningRecordsForPacket(client, packetId) {
  if (!packetId) return false
  const [fieldsResult, signersResult] = await Promise.all([
    client.from('document_signing_fields').select('id', { count: 'exact', head: true }).eq('packet_id', packetId),
    client.from('document_packet_signers').select('id', { count: 'exact', head: true }).eq('packet_id', packetId),
  ])

  const fieldsMissing = fieldsResult.error && isMissingTableOrSchemaError(fieldsResult.error)
  const signersMissing = signersResult.error && isMissingTableOrSchemaError(signersResult.error)
  if ((fieldsResult.error && !fieldsMissing) || (signersResult.error && !signersMissing)) {
    throw fieldsResult.error || signersResult.error
  }

  const fieldCount = fieldsMissing ? 0 : Number(fieldsResult.count || 0)
  const signerCount = signersMissing ? 0 : Number(signersResult.count || 0)
  return fieldCount > 0 || signerCount > 0
}

async function assertPacketNotLockedForSigning(client, packet, { actionLabel = 'modify this packet' } = {}) {
  if (!packet?.id) return
  const status = normalizeText(packet?.status).toLowerCase()
  if (['sent', 'partially_signed', 'completed'].includes(status)) {
    throw new Error(`Packet is in signing state (${status}) and cannot ${actionLabel}.`)
  }
  const hasSigningRecords = await hasSigningRecordsForPacket(client, packet.id)
  if (hasSigningRecords) {
    throw new Error(`Signing fields already exist for this packet. Packet content cannot ${actionLabel}.`)
  }
}

function assertPacketCanPrepareSigning(packet = {}) {
  const status = normalizeText(packet?.status).toLowerCase()
  if (['sent', 'partially_signed', 'completed', 'voided', 'archived'].includes(status)) {
    throw new Error(`Packet is in ${status} state and cannot be changed for signing setup.`)
  }
}

function assertPacketStatusTransition(currentStatus = '', nextStatus = '') {
  const current = normalizeText(currentStatus).toLowerCase()
  const next = normalizeText(nextStatus).toLowerCase()
  if (!next || !DOCUMENT_PACKET_STATUSES.includes(next)) {
    throw new Error(`Invalid packet status "${nextStatus}".`)
  }
  if (!current || current === next) return
  const allowed = ALLOWED_PACKET_STATUS_TRANSITIONS[current]
  if (!Array.isArray(allowed)) return
  if (!allowed.includes(next)) {
    throw new Error(`Invalid packet status transition from ${current} to ${next}.`)
  }
}

function canManagePacketSigning(context = {}, packet = {}) {
  const userId = normalizeText(context?.user?.id)
  if (!userId) return false
  return Boolean(
    context?.isOrgAdmin ||
      normalizeText(packet?.assigned_agent_id) === userId ||
      normalizeText(packet?.created_by) === userId,
  )
}

async function linkPacketVersionToCanonicalRequirementSafely(client, {
  packet = {},
  version = {},
  actorUserId = null,
  metadata = {},
} = {}) {
  const packetSourceContext = packet.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : {}
  const listingId = normalizeNullableText(
    packetSourceContext.private_listing_id ||
    packetSourceContext.privateListingId ||
    packetSourceContext.listing_id ||
    packetSourceContext.listingId,
  )
  return linkPacketToRequirement({
    packetId: packet.id || null,
    packetVersionId: version.id || null,
    packet,
    version,
    contextType: listingId ? 'private_listing' : packet.transaction_id ? 'transaction' : '',
    contextId: listingId || packet.transaction_id || '',
    transactionId: packet.transaction_id || null,
    listingId: listingId || null,
    actorRole: 'system',
    actorUserId,
    metadata: {
      source_system: 'document_packets_api',
      ...metadata,
    },
    client,
  }).catch((error) => {
    console.warn('[Document Packets] canonical packet satisfaction skipped', error)
    return null
  })
}

async function promotePacketToSigningPrep(packet = {}) {
  const packetId = normalizeText(packet?.id)
  if (!packetId) return null
  const currentStatus = normalizeText(packet?.status).toLowerCase()
  if (currentStatus === 'signing_prep') return packet
  let basePacket = packet
  if (currentStatus === 'draft' || currentStatus === 'ready_for_generation') {
    basePacket = await updateDocumentPacket(packetId, {
      status: 'generated',
      expectedUpdatedAt: packet?.updated_at || null,
    })
  }
  return updateDocumentPacket(packetId, {
    status: 'signing_prep',
    expectedUpdatedAt: basePacket?.updated_at || null,
  })
}

export async function listDocumentPacketTemplates({
  packetType = null,
  moduleType = null,
  includeInactive = false,
  organisationId = null,
  limit = null,
} = {}) {
  const client = requireClient()
  return queryDocumentPacketTemplatesWithFallback(client, {
    packetType,
    moduleType,
    includeInactive,
    organisationId,
    limit,
  })
}

export async function fetchConditionalMasterMigration({ packetType, organisationId = null } = {}) {
  const client = requireClient()
  const normalizedPacketType = assertPacketType(packetType)
  const context = await resolvePacketContext(client, { organisationId })
  const { data, error } = await client
    .from('legal_document_master_migrations')
    .select('*')
    .eq('organisation_id', context.organisationId)
    .eq('packet_type', normalizedPacketType)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function fetchConditionalMasterVerification({ packetType, organisationId = null } = {}) {
  const client = requireClient()
  const normalizedPacketType = assertPacketType(packetType)
  const context = await resolvePacketContext(client, { organisationId })
  const { data, error } = await client
    .from('legal_document_master_verifications')
    .select('*')
    .eq('organisation_id', context.organisationId)
    .eq('packet_type', normalizedPacketType)
    .order('verified_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function prepareConditionalMasterMigration({ packetType, organisationId = null } = {}) {
  const client = requireClient()
  const normalizedPacketType = assertPacketType(packetType)
  const context = await resolvePacketContext(client, { organisationId })
  if (!context.isOrgAdmin) throw new Error('Only Principal/Super Admin/Admin can prepare a legal-template migration.')
  const { data, error } = await client.rpc('bridge_prepare_conditional_master_migration_phase10', {
    p_organisation_id: context.organisationId,
    p_packet_type: normalizedPacketType,
  })
  if (error) throw error
  return data
}

export async function activateConditionalMasterMigration({
  migrationId,
  candidateTemplateId,
  wordingReviewed = false,
} = {}) {
  if (!migrationId || !candidateTemplateId) throw new Error('Migration and candidate template are required.')
  if (!wordingReviewed) throw new Error('Review and confirm the reconciled legacy wording before activation.')
  const candidate = await fetchDocumentPacketTemplate(candidateTemplateId, { includeSections: true })
  const coverage = evaluateConditionalMasterCoverage({ packetType: candidate?.packet_type, template: candidate })
  if (!coverage.ready) {
    const blocked = new Error(coverage.issues?.[0]?.message || 'The conditional master does not cover every supported legal scenario.')
    blocked.code = 'CONDITIONAL_MASTER_MIGRATION_COVERAGE_BLOCKED'
    blocked.coverage = coverage
    throw blocked
  }
  const client = requireClient()
  const { data, error } = await client.rpc('bridge_activate_conditional_master_migration_phase10', {
    p_migration_id: migrationId,
    p_coverage_version: coverage.coverageVersion,
    p_coverage_decision_hash: coverage.decisionHash,
    p_wording_reviewed: true,
  })
  if (error) throw error
  return { ...data, coverage }
}

export async function rollbackConditionalMasterMigration(migrationId) {
  if (!migrationId) throw new Error('migrationId is required.')
  const client = requireClient()
  const { data, error } = await client.rpc('bridge_rollback_conditional_master_migration_phase10', {
    p_migration_id: migrationId,
  })
  if (error) throw error
  return data
}

export async function finalizeConditionalMasterMigration(migrationId) {
  if (!migrationId) throw new Error('migrationId is required.')
  const client = requireClient()
  const { data, error } = await client.rpc('bridge_finalize_conditional_master_migration_phase10', {
    p_migration_id: migrationId,
  })
  if (error) throw error
  return data
}

export async function verifyConditionalMasterMigration({ migrationId, candidateTemplateId } = {}) {
  if (!migrationId || !candidateTemplateId) throw new Error('Migration and candidate template are required.')
  const candidate = await fetchDocumentPacketTemplate(candidateTemplateId, { includeSections: true })
  const coverage = evaluateConditionalMasterCoverage({ packetType: candidate?.packet_type, template: candidate })
  if (!coverage.ready) {
    const blocked = new Error(coverage.issues?.[0]?.message || 'The live conditional master does not pass complete scenario coverage.')
    blocked.code = 'CONDITIONAL_MASTER_VERIFICATION_COVERAGE_BLOCKED'
    blocked.coverage = coverage
    throw blocked
  }
  const client = requireClient()
  const { data, error } = await client.rpc('bridge_verify_conditional_master_migration_phase11', {
    p_migration_id: migrationId,
    p_coverage_version: coverage.coverageVersion,
    p_coverage_decision_hash: coverage.decisionHash,
  })
  if (error) throw error
  if (data?.passed !== true) {
    const blocked = new Error(`Verification found integrity blockers: ${(data?.issue_codes || []).join(', ') || 'review the verification receipt'}.`)
    blocked.code = 'CONDITIONAL_MASTER_VERIFICATION_BLOCKED'
    blocked.receipt = data
    throw blocked
  }
  return { ...data, coverage }
}

export async function resolveActiveDocumentPacketTemplate({
  packetType,
  moduleType = '',
  organisationId = null,
  includeSections = true,
} = {}) {
  const client = requireClient()
  const normalizedPacketType = assertPacketType(packetType)
  const context = await resolvePacketContext(client, { organisationId })
  const moduleCandidates = resolveTemplateModuleCandidates(normalizedPacketType, moduleType)
  const templateGroups = await Promise.all(
    moduleCandidates.map((candidateModuleType) => queryDocumentPacketTemplatesWithFallback(client, {
      packetType: normalizedPacketType,
      moduleType: candidateModuleType,
      includeInactive: false,
      organisationId: context.organisationId,
    }).catch((error) => {
      if (isMissingTableOrSchemaError(error)) return []
      throw error
    })),
  )

  const templateById = new Map()
  for (const template of templateGroups.flat()) {
    if (!template?.id || !isTemplatePublished(template)) continue
    templateById.set(template.id, template)
  }

  const candidates = Array.from(templateById.values())
    .sort((left, right) => compareTemplateCandidates(left, right, {
      organisationId: context.organisationId,
      moduleCandidates,
    }))

  const selected = candidates[0] || null
  const hydratedTemplate = selected?.id && includeSections
    ? await fetchDocumentPacketTemplate(selected.id, { includeSections: true })
    : selected

  return {
    template: hydratedTemplate || null,
    source: hydratedTemplate ? resolveTemplateResolutionSource(hydratedTemplate, context.organisationId) : 'none',
    organisationId: context.organisationId,
    moduleType: normalizeText(hydratedTemplate?.module_type || moduleCandidates[0] || moduleType),
    packetType: normalizedPacketType,
    candidateModuleTypes: moduleCandidates,
    candidateCount: candidates.length,
  }
}

export async function listDocumentPlaceholderDefinitions({
  packetType = null,
  includeInactive = false,
} = {}) {
  const client = requireClient()
  let query = client
    .from('document_placeholder_registry')
    .select(
      'id, packet_type, placeholder_key, entity_scope, data_type, description, normalization_rule, example_value, is_required_default, is_active, created_at, updated_at',
    )
    .order('packet_type', { ascending: true })
    .order('placeholder_key', { ascending: true })

  if (packetType) query = query.eq('packet_type', assertPacketType(packetType))
  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) {
    if (isMissingTableOrSchemaError(error)) {
      return []
    }
    throw error
  }
  return data || []
}

export async function uploadDocumentPacketTemplateAsset({
  file,
  packetType = 'mandate',
  moduleType = 'agency',
  templateKey = '',
  versionTag = 'v1',
  organisationId = null,
} = {}) {
  const selectedFile = typeof File !== 'undefined' && file instanceof File ? file : null
  if (!selectedFile) {
    throw new Error('Select a valid DOCX file before uploading.')
  }

  const extension = normalizeFileExtension(selectedFile.name, 'docx')
  if (extension !== 'docx') {
    throw new Error('Only DOCX templates are supported right now.')
  }

  const client = requireClient()
  const context = await resolvePacketContext(client, { organisationId })
  if (!context.isOrgAdmin) {
    throw new Error('Only Principal/Super Admin/Admin can upload legal templates.')
  }

  const normalizedPacketType = assertPacketType(packetType)
  const normalizedModuleType = normalizeText(moduleType || 'agency').toLowerCase() || 'agency'
  const safeTemplateKey = normalizeTemplateKey(templateKey || `${normalizedPacketType}_template`, normalizedPacketType)
  const safeVersionTag = normalizeStorageSafeName(versionTag, 'v1')
  const objectPath = `organisations/${context.organisationId}/${normalizedModuleType}/${normalizedPacketType}/${safeTemplateKey}/${safeVersionTag}/${Date.now()}-${normalizeStorageSafeName(selectedFile.name, `${normalizedPacketType}.docx`)}`

  const { bucket: uploadedBucket } = await uploadToStorageCandidateBuckets({
    bucketCandidates: LEGAL_TEMPLATES_BUCKET_CANDIDATES,
    upload: (bucketName) =>
      client.storage.from(bucketName).upload(objectPath, selectedFile, {
        upsert: true,
        cacheControl: '3600',
        contentType: selectedFile.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    missingBucketMessage: `Unable to upload legal template. Checked buckets: ${LEGAL_TEMPLATES_BUCKET_CANDIDATES.join(', ')}.`,
    accessDeniedMessage: 'Legal template storage is not ready yet. Please retry after storage access is refreshed.',
    accessDeniedCode: 'legal_template_storage_access_not_ready',
    genericMessage: 'Unable to upload legal template.',
  })

  const signedResult = await client.storage.from(uploadedBucket).createSignedUrl(objectPath, 60 * 60 * 24 * 30)
  const signedUrl = normalizeText(signedResult?.data?.signedUrl)
  const { data: publicUrlData } = client.storage.from(uploadedBucket).getPublicUrl(objectPath)
  const publicUrl = normalizeText(publicUrlData?.publicUrl)

  return {
    bucket: uploadedBucket,
    path: objectPath,
    publicUrl: publicUrl || null,
    signedUrl: signedUrl || null,
    resolvedUrl: signedUrl || publicUrl || null,
    fileName: selectedFile.name,
    packetType: normalizedPacketType,
    moduleType: normalizedModuleType,
  }
}

export async function fetchDocumentPacketTemplate(templateId, { includeSections = true } = {}) {
  const client = requireClient()
  if (!templateId) throw new Error('templateId is required.')
  const template = await queryDocumentPacketTemplatesWithFallback(client, { templateId })
  if (!template) return null

  let sections = []
  if (includeSections) {
    const { data, error } = await client
      .from('document_template_sections')
      .select(
        'id, template_id, section_key, section_label, section_type, sort_order, is_required, is_repeatable, condition_json, placeholder_keys, legal_text, metadata_json, created_at, updated_at',
      )
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    sections = data || []
  }

  const hydrated = { ...hydrateTemplateRecord(template), sections }
  return {
    ...hydrated,
    canonical_definition: buildCanonicalTemplateDefinition(hydrated, includeSections ? sections : null),
  }
}

export async function createDocumentPacketTemplate(input = {}) {
  const client = requireClient()
  const context = await resolvePacketContext(client, { organisationId: input.organisationId || null })
  if (!context.isOrgAdmin) {
    throw new Error('Only Principal/Super Admin/Admin can create signing templates.')
  }

  const packetType = assertPacketType(input.packetType)
  const moduleType = normalizeText(input.moduleType || 'agency').toLowerCase() || 'agency'
  const templateLabel = normalizeText(input.templateLabel || input.templateKey || `${packetType.toUpperCase()} Template`)
  const templateKey = normalizeTemplateKey(
    input.templateKey,
    `${packetType}_${Date.now()}`,
  )
  const templateFormat = normalizeText(input.templateFormat || 'docx').toLowerCase() || 'docx'
  const versionTag = normalizeText(input.versionTag || 'v1') || 'v1'
  const isActive = input.isActive === undefined ? true : Boolean(input.isActive)
  const isDefault = Boolean(input.isDefault)
  const templateStatus = normalizeTemplateRegistryStatus(input.status || input.templateStatus, {
    isActive,
    isDefault,
  })
  const metadataJson = buildDocumentPacketTemplateMetadata(
    input.metadataJson && typeof input.metadataJson === 'object' ? input.metadataJson : {},
    {
      templateStorageBucket: input.templateStorageBucket,
      templateStoragePath: input.templateStoragePath,
      templateFileName: input.templateFileName,
      status: templateStatus,
    },
  )

  const payload = {
    organisation_id: context.organisationId,
    module_type: moduleType,
    packet_type: packetType,
    template_key: templateKey,
    template_label: templateLabel,
    template_format: templateFormat,
    template_storage_bucket: normalizeNullableText(input.templateStorageBucket),
    template_storage_path: normalizeNullableText(input.templateStoragePath),
    template_file_name: normalizeNullableText(input.templateFileName),
    version_tag: versionTag,
    description: normalizeNullableText(input.description),
    status: templateStatus,
    is_default: isDefault,
    is_active: isActive,
    metadata_json: metadataJson,
    created_by: context.user.id,
  }

  if (input.revisionRootTemplateId !== undefined) payload.revision_root_template_id = normalizeNullableUuid(input.revisionRootTemplateId)
  if (input.revisionParentTemplateId !== undefined) payload.revision_parent_template_id = normalizeNullableUuid(input.revisionParentTemplateId)
  if (input.revisionNumber !== undefined) payload.revision_number = Math.max(1, Math.trunc(Number(input.revisionNumber) || 1))

  const template = await insertDocumentPacketTemplateWithFallback(client, payload)
  const sections = Array.isArray(input.sections) ? input.sections : []
  if (sections.length) {
    await replaceDocumentTemplateSections(template.id, sections, { organisationId: context.organisationId })
  }

  await syncCanonicalDocumentPacketTemplateDefinition(client, template.id)

  return fetchDocumentPacketTemplate(template.id, { includeSections: true })
}

export async function cloneDocumentPacketTemplate({
  sourceTemplateId,
  templateLabel = '',
  description = '',
  variantLabel = '',
  templateKey = '',
} = {}) {
  const resolvedSourceTemplateId = normalizeText(sourceTemplateId)
  if (!resolvedSourceTemplateId) throw new Error('sourceTemplateId is required.')

  const sourceTemplate = await fetchDocumentPacketTemplate(resolvedSourceTemplateId, { includeSections: true })
  if (!sourceTemplate?.id) throw new Error('Source template not found.')
  const cloneInput = buildOrganisationTemplateCloneInput(sourceTemplate, {
    templateLabel,
    description,
    variantLabel,
    templateKey,
  })
  return createDocumentPacketTemplate(cloneInput)
}

export async function createDocumentPacketTemplateRevision({ sourceTemplateId, ...overrides } = {}) {
  const resolvedSourceTemplateId = normalizeText(sourceTemplateId)
  if (!resolvedSourceTemplateId) throw new Error('sourceTemplateId is required.')

  const sourceTemplate = await fetchDocumentPacketTemplate(resolvedSourceTemplateId, { includeSections: true })
  if (!sourceTemplate?.id) throw new Error('Source template not found.')
  if (!sourceTemplate.organisation_id) {
    throw new Error('Create a company template copy before creating a new version.')
  }

  const revisionInput = buildTemplateRevisionInput(sourceTemplate, overrides)
  return createDocumentPacketTemplate(revisionInput)
}

export async function publishDocumentPacketTemplateRevision(templateId, updates = {}) {
  const template = await fetchDocumentPacketTemplate(templateId, { includeSections: true })
  if (!template?.id) throw new Error('Template not found.')
  if (!template.organisation_id) throw new Error('Only company-owned templates can be published.')

  let publishTarget = template
  if (isImmutableTemplateRevision(template) && (
    updates.templateLabel !== undefined || updates.description !== undefined ||
    updates.metadataJson !== undefined || Array.isArray(updates.sections)
  )) {
    publishTarget = await createDocumentPacketTemplateRevision({ sourceTemplateId: template.id, ...updates })
  } else if (!isImmutableTemplateRevision(template) && Object.keys(updates).length) {
    publishTarget = await updateDocumentPacketTemplate(template.id, {
      ...updates,
      templateStatus: 'draft',
      isActive: false,
      isDefault: false,
    })
  }

  const client = requireClient()
  const context = await resolvePacketContext(client, { organisationId: publishTarget.organisation_id })
  if (!context.isOrgAdmin) throw new Error('Only Principal/Super Admin/Admin can publish signing templates.')

  const { data, error } = await client.rpc('bridge_publish_template_revision_b4', {
    p_template_id: publishTarget.id,
    p_make_default: updates.makeDefault === undefined ? true : Boolean(updates.makeDefault),
  })
  if (error) throw error
  return fetchDocumentPacketTemplate(data?.id || publishTarget.id, { includeSections: true })
}

export async function archiveDocumentPacketTemplate(templateId, { organisationId = null } = {}) {
  const client = requireClient()
  const context = await resolvePacketContext(client, { organisationId })
  if (!context.isOrgAdmin) throw new Error('Only Principal/Super Admin/Admin can archive signing templates.')
  const existing = await queryDocumentPacketTemplatesWithFallback(client, {
    templateId,
    organisationId: context.organisationId,
    includeInactive: true,
  })
  if (!existing || normalizeText(existing.organisation_id) !== normalizeText(context.organisationId)) {
    throw new Error('Template not found.')
  }
  if (existing.is_default) throw new Error('Publish another default template before archiving this one.')

  await updateDocumentPacketTemplateRowWithFallback(client, templateId, {
    status: 'archived',
    is_active: false,
    is_default: false,
    archived_by: context.user.id,
    archived_at: new Date().toISOString(),
  })
  return fetchDocumentPacketTemplate(templateId, { includeSections: true })
}

export async function updateDocumentPacketTemplate(templateId, updates = {}) {
  const client = requireClient()
  if (!templateId) throw new Error('templateId is required.')
  const context = await resolvePacketContext(client, { organisationId: updates.organisationId || null })
  if (!context.isOrgAdmin) {
    throw new Error('Only Principal/Super Admin/Admin can update signing templates.')
  }

  const existing = await queryDocumentPacketTemplatesWithFallback(client, {
    templateId,
    organisationId: context.organisationId,
  })
  if (!existing) throw new Error('Template not found.')
  if (normalizeText(existing.organisation_id) !== normalizeText(context.organisationId)) {
    throw new Error('You can only edit templates owned by your organisation.')
  }

  const immutableContentKeys = [
    'templateLabel', 'description', 'templateStorageBucket', 'templateStoragePath',
    'templateFileName', 'templateFormat', 'versionTag', 'metadataJson', 'sections',
  ]
  if (isImmutableTemplateRevision(existing) && immutableContentKeys.some((key) => updates[key] !== undefined)) {
    const immutableError = new Error('This template is already published. Save the changes as a new draft revision.')
    immutableError.code = 'PUBLISHED_TEMPLATE_IMMUTABLE'
    throw immutableError
  }

  const payload = {}
  let nextStatus = null
  if (updates.templateLabel !== undefined) payload.template_label = normalizeText(updates.templateLabel)
  if (updates.description !== undefined) payload.description = normalizeNullableText(updates.description)
  if (updates.isActive !== undefined) payload.is_active = Boolean(updates.isActive)
  if (updates.isDefault !== undefined) payload.is_default = Boolean(updates.isDefault)
  if (updates.templateStorageBucket !== undefined) payload.template_storage_bucket = normalizeNullableText(updates.templateStorageBucket)
  if (updates.templateStoragePath !== undefined) payload.template_storage_path = normalizeNullableText(updates.templateStoragePath)
  if (updates.templateFileName !== undefined) payload.template_file_name = normalizeNullableText(updates.templateFileName)
  if (updates.templateFormat !== undefined) payload.template_format = normalizeText(updates.templateFormat).toLowerCase() || 'docx'
  if (updates.versionTag !== undefined) payload.version_tag = normalizeText(updates.versionTag) || existing.version_tag
  if (updates.status !== undefined || updates.templateStatus !== undefined || updates.isActive !== undefined || updates.isDefault !== undefined) {
    nextStatus = normalizeTemplateRegistryStatus(updates.status || updates.templateStatus || existing.status, {
      isActive: updates.isActive === undefined ? existing.is_active : updates.isActive,
      isDefault: updates.isDefault === undefined ? existing.is_default : updates.isDefault,
    })
    payload.status = nextStatus
  }

  const shouldUpdateMetadata =
    updates.metadataJson !== undefined ||
    updates.templateStorageBucket !== undefined ||
    updates.templateStoragePath !== undefined ||
    updates.templateFileName !== undefined ||
    nextStatus !== null

  if (shouldUpdateMetadata) {
    const baseMetadata = updates.metadataJson !== undefined
      ? updates.metadataJson && typeof updates.metadataJson === 'object'
        ? updates.metadataJson
        : existing.metadata_json || {}
      : existing.metadata_json || {}
    payload.metadata_json = buildDocumentPacketTemplateMetadata(baseMetadata, {
      templateStorageBucket: updates.templateStorageBucket !== undefined
        ? updates.templateStorageBucket
        : existing.template_storage_bucket,
      templateStoragePath: updates.templateStoragePath !== undefined
        ? updates.templateStoragePath
        : existing.template_storage_path,
      templateFileName: updates.templateFileName !== undefined
        ? updates.templateFileName
        : existing.template_file_name,
      status: nextStatus !== null ? nextStatus : existing.status,
    })
  }

  if (Object.keys(payload).length) {
    await updateDocumentPacketTemplateRowWithFallback(client, templateId, payload)
  }

  if (Array.isArray(updates.sections)) {
    await replaceDocumentTemplateSections(templateId, updates.sections, { organisationId: context.organisationId })
  }

  await syncCanonicalDocumentPacketTemplateDefinition(client, templateId)

  return fetchDocumentPacketTemplate(templateId, { includeSections: true })
}

export async function deleteDocumentPacketTemplate(templateId, { organisationId = null, replacementTemplateId = null } = {}) {
  const client = requireClient()
  if (!templateId) throw new Error('templateId is required.')
  const context = await resolvePacketContext(client, { organisationId })
  if (!context.isOrgAdmin) {
    throw new Error('Only Principal/Super Admin/Admin can delete signing templates.')
  }

  const { data: existing, error: existingError } = await client
    .from('document_packet_templates')
    .select('id, organisation_id, is_default, metadata_json')
    .eq('id', templateId)
    .maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw new Error('Template not found.')
  if (normalizeText(existing.organisation_id) !== normalizeText(context.organisationId)) {
    throw new Error('You can only delete templates owned by your organisation.')
  }
  if (existing.is_default) {
    const replacementId = normalizeText(replacementTemplateId)
    if (!replacementId || replacementId === normalizeText(templateId)) {
      throw new Error('You cannot delete the current default template until another organisation template is promoted as default.')
    }

    const { data: replacement, error: replacementError } = await client
      .from('document_packet_templates')
      .select('id, organisation_id, packet_type, is_active')
      .eq('id', replacementId)
      .maybeSingle()
    if (replacementError) throw replacementError
    if (!replacement) {
      throw new Error('Replacement template not found.')
    }
    if (normalizeText(replacement.organisation_id) !== normalizeText(context.organisationId)) {
      throw new Error('Replacement template must belong to your organisation.')
    }

    const { data: currentTemplate, error: currentTemplateError } = await client
      .from('document_packet_templates')
      .select('packet_type')
      .eq('id', templateId)
      .maybeSingle()
    if (currentTemplateError) throw currentTemplateError
    if (normalizeText(replacement.packet_type) !== normalizeText(currentTemplate?.packet_type)) {
      throw new Error('Replacement template must be the same document type.')
    }

    const { error: promoteError } = await client
      .from('document_packet_templates')
      .update({
        is_default: true,
        is_active: true,
      })
      .eq('id', replacementId)
    if (promoteError) throw promoteError

    const { error: demoteError } = await client
      .from('document_packet_templates')
      .update({
        is_default: false,
      })
      .eq('id', templateId)
    if (demoteError) throw demoteError
  }

  const { error: sectionsError } = await client
    .from('document_template_sections')
    .delete()
    .eq('template_id', templateId)
  if (sectionsError) throw sectionsError

  const { error: templateError } = await client
    .from('document_packet_templates')
    .delete()
    .eq('id', templateId)
  if (templateError) throw templateError

  return true
}

export async function replaceDocumentTemplateSections(templateId, sections = [], { organisationId = null } = {}) {
  const client = requireClient()
  if (!templateId) throw new Error('templateId is required.')
  const context = await resolvePacketContext(client, { organisationId })
  if (!context.isOrgAdmin) {
    throw new Error('Only Principal/Super Admin/Admin can update template sections.')
  }

  const { data: template, error: templateError } = await client
    .from('document_packet_templates')
    .select('id, organisation_id')
    .eq('id', templateId)
    .maybeSingle()
  if (templateError) throw templateError
  if (!template) throw new Error('Template not found.')
  if (normalizeText(template.organisation_id) !== normalizeText(context.organisationId)) {
    throw new Error('You can only edit templates owned by your organisation.')
  }

  const rows = (Array.isArray(sections) ? sections : [])
    .map((section, index) => ({
      template_id: templateId,
      section_key: normalizeTemplateKey(section?.sectionKey || section?.section_key, `section_${index + 1}`),
      section_label: normalizeText(section?.sectionLabel || section?.section_label || `Section ${index + 1}`),
      section_type: normalizeText(section?.sectionType || section?.section_type || 'legal_text').toLowerCase() || 'legal_text',
      sort_order: Number.isFinite(Number(section?.sortOrder ?? section?.sort_order))
        ? Math.trunc(Number(section?.sortOrder ?? section?.sort_order))
        : index,
      is_required: section?.isRequired === undefined ? true : Boolean(section?.isRequired ?? section?.is_required),
      is_repeatable: Boolean(section?.isRepeatable ?? section?.is_repeatable),
      condition_json: section?.conditionJson && typeof section.conditionJson === 'object'
        ? section.conditionJson
        : section?.condition_json && typeof section.condition_json === 'object'
          ? section.condition_json
          : {},
      placeholder_keys: Array.isArray(section?.placeholderKeys)
        ? section.placeholderKeys.map((item) => normalizeText(item)).filter(Boolean)
        : Array.isArray(section?.placeholder_keys)
          ? section.placeholder_keys.map((item) => normalizeText(item)).filter(Boolean)
          : [],
      legal_text: normalizeNullableText(section?.legalText ?? section?.legal_text),
      metadata_json: section?.metadataJson && typeof section.metadataJson === 'object'
        ? section.metadataJson
        : section?.metadata_json && typeof section.metadata_json === 'object'
          ? section.metadata_json
          : {},
    }))
    .filter((row) => row.section_key && row.section_label)

  if (rows.length) {
    const { error: upsertError } = await client
      .from('document_template_sections')
      .upsert(rows, { onConflict: 'template_id,section_key' })
    if (upsertError) throw upsertError
  }

  const keepKeys = rows.map((row) => row.section_key)
  let deleteQuery = client
    .from('document_template_sections')
    .delete()
    .eq('template_id', templateId)

  if (keepKeys.length) {
    deleteQuery = deleteQuery.not('section_key', 'in', `(${keepKeys.map((key) => `"${key}"`).join(',')})`)
  }

  const { error: deleteError } = await deleteQuery
  if (deleteError) throw deleteError

  await syncCanonicalDocumentPacketTemplateDefinition(client, templateId, { sections: rows })

  return fetchDocumentPacketTemplate(templateId, { includeSections: true })
}

export async function createDocumentPacket(input = {}) {
  const client = requireClient()
  const context = await resolvePacketContext(client, { organisationId: input.organisationId || null })
  const packetType = assertPacketType(input.packetType)
  const invalidUuidReferences = collectInvalidUuidReferences(input, [
    { inputKey: 'organisationId' },
    { inputKey: 'templateId' },
    { inputKey: 'transactionId' },
    { inputKey: 'leadId' },
    { inputKey: 'contactId' },
    { inputKey: 'dealId' },
    { inputKey: 'unitId' },
    { inputKey: 'assignedAgentId' },
  ])

  const payload = {
    organisation_id: context.organisationId,
    packet_type: packetType,
    title: normalizeNullableText(input.title),
    status: normalizeText(input.status || 'draft'),
    template_id: normalizeNullableUuid(input.templateId),
    template_key_snapshot: normalizeNullableText(input.templateKeySnapshot),
    template_label_snapshot: normalizeNullableText(input.templateLabelSnapshot),
    transaction_id: normalizeNullableUuid(input.transactionId),
    lead_id: normalizeNullableUuid(input.leadId),
    contact_id: normalizeNullableUuid(input.contactId),
    deal_id: normalizeNullableUuid(input.dealId),
    unit_id: normalizeNullableUuid(input.unitId),
    assigned_agent_id: normalizeNullableUuid(input.assignedAgentId) || context.user.id,
    created_by: context.user.id,
    source_context_json: mergeSourceContextWithInvalidReferences(input.sourceContextJson, invalidUuidReferences),
    branding_snapshot_json:
      input.brandingSnapshotJson && typeof input.brandingSnapshotJson === 'object' ? input.brandingSnapshotJson : {},
  }

  const { data, error } = await client
    .from('document_packets')
    .insert(payload)
    .select(
      'id, organisation_id, packet_type, title, status, template_id, template_key_snapshot, template_label_snapshot, transaction_id, lead_id, contact_id, deal_id, unit_id, assigned_agent_id, created_by, current_version_number, source_context_json, branding_snapshot_json, sent_at, completed_at, archived_at, created_at, updated_at',
    )
    .single()
  if (error) {
    if (isMissingSpecificTableError(error, 'document_packets')) {
      const missingPacketsError = new Error('Document packet tables are not configured yet for this project.')
      missingPacketsError.code = 'PACKETS_SCHEMA_MISSING'
      missingPacketsError.cause = error
      throw missingPacketsError
    }
    if (isPermissionDeniedError(error)) {
      const rlsDeniedError = new Error(
        'Packet creation is blocked by organisation permissions. Confirm your active organisation membership and role, then retry.',
      )
      rlsDeniedError.code = 'PACKETS_RLS_DENIED'
      rlsDeniedError.cause = error
      throw rlsDeniedError
    }
    throw error
  }

  try {
    await appendDocumentPacketEvent({
      packetId: data.id,
      organisationId: context.organisationId,
      eventType: 'packet_created',
      eventPayload: {
        packetType: data.packet_type,
        templateId: data.template_id,
      },
    })
  } catch (eventError) {
    console.warn('[PACKETS] packet_created event could not be recorded; continuing with created packet.', eventError)
  }

  return data
}

export async function createEditableDocumentDraftFromTemplate(input = {}) {
  const client = requireClient()
  const templateId = normalizeNullableUuid(input.templateId)
  if (!templateId) throw new Error('A published template revision is required.')

  const context = await resolvePacketContext(client, { organisationId: input.organisationId || null })
  const template = await fetchDocumentPacketTemplate(templateId, { includeSections: true })
  if (!template?.id) throw new Error('Template revision not found.')
  const templateOrganisationId = normalizeText(template.organisation_id)
  if (templateOrganisationId && templateOrganisationId !== normalizeText(context.organisationId)) {
    throw new Error('Template revision does not belong to the active organisation.')
  }
  if (!isTemplatePublished(template) || template.is_active === false) {
    throw new Error('Publish the template before creating a transaction document from it.')
  }

  const packetType = assertPacketType(input.packetType || template.packet_type)
  if (packetType !== normalizeText(template.packet_type).toLowerCase()) {
    throw new Error('The selected template does not match this document type.')
  }
  const editableDraft = buildEditableTransactionDocumentDraft(template, {
    title: input.title,
    packetType,
  })
  const invalidUuidReferences = collectInvalidUuidReferences(input, [
    { inputKey: 'transactionId' },
    { inputKey: 'leadId' },
    { inputKey: 'contactId' },
    { inputKey: 'dealId' },
    { inputKey: 'unitId' },
    { inputKey: 'assignedAgentId' },
  ])
  const sourceContextJson = mergeSourceContextWithInvalidReferences(input.sourceContextJson, invalidUuidReferences)

  const { data: result, error } = await client.rpc('bridge_create_editable_document_draft_c1', {
    p_organisation_id: context.organisationId,
    p_packet_type: packetType,
    p_title: normalizeNullableText(input.title || editableDraft.title),
    p_template_id: template.id,
    p_transaction_id: normalizeNullableUuid(input.transactionId),
    p_lead_id: normalizeNullableUuid(input.leadId),
    p_contact_id: normalizeNullableUuid(input.contactId),
    p_deal_id: normalizeNullableUuid(input.dealId),
    p_unit_id: normalizeNullableUuid(input.unitId),
    p_assigned_agent_id: normalizeNullableUuid(input.assignedAgentId),
    p_source_context_json: {
      ...sourceContextJson,
      editableDocumentDraft: {
        schemaVersion: editableDraft.schemaVersion,
        templateRevision: editableDraft.templateRevision,
      },
    },
    p_branding_snapshot_json: input.brandingSnapshotJson && typeof input.brandingSnapshotJson === 'object'
      ? input.brandingSnapshotJson
      : {},
    p_editable_content_json: editableDraft,
    p_section_manifest_json: buildEditableDraftSectionManifest(editableDraft),
    p_placeholders_json: input.placeholders && typeof input.placeholders === 'object' ? input.placeholders : {},
  })
  if (error) throw error
  if (result?.contract !== 'c1-v1' || !result?.packet?.id || !result?.version?.id) {
    throw new Error('The editable document draft contract returned an invalid result.')
  }

  return {
    ...result.packet,
    editableDraft: result.editableContent || editableDraft,
    versions: [result.version],
    currentVersion: result.version,
  }
}

export async function updateDocumentPacket(packetId, updates = {}) {
  const client = requireClient()
  if (!packetId) throw new Error('packetId is required.')

  const { data: existingPacket, error: existingPacketError } = await client
    .from('document_packets')
    .select(
      'id, organisation_id, packet_type, status, template_id, title, source_context_json, branding_snapshot_json, assigned_agent_id, created_by',
    )
    .eq('id', packetId)
    .maybeSingle()
  if (existingPacketError) throw existingPacketError
  if (!existingPacket) throw new Error('Document packet not found.')

  const metadataOnlyWhileSigning =
    updates.allowSigningMetadataUpdate === true &&
    updates.title === undefined &&
    updates.templateId === undefined &&
    updates.templateKeySnapshot === undefined &&
    updates.templateLabelSnapshot === undefined &&
    updates.brandingSnapshotJson === undefined &&
    updates.sourceContextJson !== undefined
  const templateReferenceOnlyBackfill =
    updates.allowTemplateReferenceBackfill === true &&
    !existingPacket?.template_id &&
    updates.title === undefined &&
    updates.templateId !== undefined &&
    updates.assignedAgentId === undefined &&
    updates.sourceContextJson === undefined &&
    updates.brandingSnapshotJson === undefined &&
    updates.sentAt === undefined &&
    updates.completedAt === undefined &&
    updates.archivedAt === undefined
  const mutatesPacketContent =
    !templateReferenceOnlyBackfill &&
    (
      updates.title !== undefined ||
      updates.templateId !== undefined ||
      updates.templateKeySnapshot !== undefined ||
      updates.templateLabelSnapshot !== undefined ||
      updates.brandingSnapshotJson !== undefined ||
      (updates.sourceContextJson !== undefined && !metadataOnlyWhileSigning)
    )
  if (mutatesPacketContent) {
    await assertPacketNotLockedForSigning(client, existingPacket, { actionLabel: 'be edited' })
  }

  const payload = {}
  if (updates.title !== undefined) payload.title = normalizeNullableText(updates.title)
  if (updates.status !== undefined) {
    const nextStatus = normalizeText(updates.status).toLowerCase()
    assertPacketStatusTransition(existingPacket?.status, nextStatus)
    payload.status = nextStatus
  }
  if (updates.templateId !== undefined) payload.template_id = normalizeNullableUuid(updates.templateId)
  if (updates.templateKeySnapshot !== undefined) payload.template_key_snapshot = normalizeNullableText(updates.templateKeySnapshot)
  if (updates.templateLabelSnapshot !== undefined) payload.template_label_snapshot = normalizeNullableText(updates.templateLabelSnapshot)
  if (updates.assignedAgentId !== undefined) payload.assigned_agent_id = normalizeNullableUuid(updates.assignedAgentId)
  if (updates.sourceContextJson !== undefined) payload.source_context_json = updates.sourceContextJson || {}
  if (updates.brandingSnapshotJson !== undefined) payload.branding_snapshot_json = updates.brandingSnapshotJson || {}
  if (updates.sentAt !== undefined) payload.sent_at = updates.sentAt
  if (updates.completedAt !== undefined) payload.completed_at = updates.completedAt
  if (updates.archivedAt !== undefined) payload.archived_at = updates.archivedAt

  let query = client
    .from('document_packets')
    .update(payload)
    .eq('id', packetId)
  const expectedUpdatedAt = normalizeText(updates.expectedUpdatedAt)
  if (expectedUpdatedAt) {
    query = query.eq('updated_at', expectedUpdatedAt)
  }
  const { data, error } = await query
    .select(
      'id, organisation_id, packet_type, title, status, template_id, template_key_snapshot, template_label_snapshot, transaction_id, lead_id, contact_id, deal_id, unit_id, assigned_agent_id, created_by, current_version_number, source_context_json, branding_snapshot_json, sent_at, completed_at, archived_at, created_at, updated_at',
    )
    .maybeSingle()
  if (error) throw error
  if (!data) {
    const staleError = new Error('Document was updated by another user. Refresh the workspace before saving.')
    staleError.code = 'STALE_PACKET_STATE'
    throw staleError
  }

  if (payload.status && payload.status !== normalizeText(existingPacket?.status).toLowerCase()) {
    const eventType = payload.status === 'archived' ? 'packet_archived' : 'packet_status_changed'
    await appendDocumentPacketEvent({
      packetId: data.id,
      organisationId: data.organisation_id || null,
      eventType,
      eventPayload: {
        fromStatus: normalizeText(existingPacket?.status || '').toLowerCase() || null,
        toStatus: payload.status,
      },
    })
  }

  return data
}

export async function transitionDocumentPacketLifecycle({
  packetId,
  nextState,
  versionId = null,
  sourceContextPatch = {},
  eventPayload = {},
  expectedUpdatedAt = null,
} = {}) {
  const resolvedPacketId = normalizeText(packetId)
  if (!resolvedPacketId) throw new Error('packetId is required for a lifecycle transition.')

  const packet = await fetchDocumentPacket(resolvedPacketId, {
    includeVersions: false,
    includeEvents: false,
  })
  if (!packet?.id) throw new Error('Document packet not found for lifecycle transition.')

  const currentState = resolveDocumentLifecycleStateFromPacket(packet)
  const targetState = assertDocumentLifecycleTransition(currentState, nextState)
  const nowIso = new Date().toISOString()
  const sourcePatch = sourceContextPatch && typeof sourceContextPatch === 'object' ? sourceContextPatch : {}
  const updates = {
    status: toDocumentPacketStorageStatus(targetState),
    expectedUpdatedAt: normalizeText(expectedUpdatedAt || packet.updated_at) || null,
    allowSigningMetadataUpdate: true,
    sourceContextJson: {
      ...(packet.source_context_json && typeof packet.source_context_json === 'object' ? packet.source_context_json : {}),
      ...sourcePatch,
      lifecycle_state: targetState,
      lifecycle_previous_state: currentState,
      lifecycle_updated_at: nowIso,
    },
  }
  if (targetState === 'sent') updates.sentAt = normalizeText(sourcePatch.sentAt) || nowIso
  if (targetState === 'completed') updates.completedAt = normalizeText(sourcePatch.completedAt) || nowIso
  if (targetState === 'archived') updates.archivedAt = normalizeText(sourcePatch.archivedAt) || nowIso

  const updatedPacket = await updateDocumentPacket(resolvedPacketId, updates)
  await appendDocumentPacketEvent({
    packetId: updatedPacket.id,
    organisationId: updatedPacket.organisation_id || null,
    versionId: normalizeNullableUuid(versionId),
    eventType: 'document_lifecycle_transitioned',
    eventPayload: {
      ...(eventPayload && typeof eventPayload === 'object' ? eventPayload : {}),
      fromState: currentState,
      toState: targetState,
      storageStatus: updatedPacket.status,
      transitionedAt: nowIso,
    },
  })

  return {
    packet: updatedPacket,
    fromState: currentState,
    toState: targetState,
    transitionedAt: nowIso,
  }
}

export async function listDocumentPackets({
  organisationId = null,
  packetType = null,
  status = null,
  assignedAgentId = null,
  transactionId = null,
  leadId = null,
  limit = 100,
} = {}) {
  const client = requireClient()
  const context = await resolvePacketContext(client, { organisationId })
  const resolvedLimit = normalizeOptionalNumber(limit)
  const scopedAssignedAgentId = normalizeNullableUuid(assignedAgentId)
  const scopedTransactionId = normalizeNullableUuid(transactionId)
  const scopedLeadId = normalizeNullableUuid(leadId)
  if (
    (normalizeText(assignedAgentId) && !scopedAssignedAgentId) ||
    (normalizeText(transactionId) && !scopedTransactionId) ||
    (normalizeText(leadId) && !scopedLeadId)
  ) {
    return []
  }
  let query = client
    .from('document_packets')
    .select(
      'id, organisation_id, packet_type, title, status, template_id, template_key_snapshot, template_label_snapshot, transaction_id, lead_id, contact_id, deal_id, unit_id, assigned_agent_id, created_by, current_version_number, source_context_json, branding_snapshot_json, sent_at, completed_at, archived_at, created_at, updated_at',
    )
    .eq('organisation_id', context.organisationId)
    .order('updated_at', { ascending: false })

  if (packetType) query = query.eq('packet_type', assertPacketType(packetType))
  if (status) query = query.eq('status', normalizeText(status))
  if (scopedAssignedAgentId) query = query.eq('assigned_agent_id', scopedAssignedAgentId)
  if (scopedTransactionId) query = query.eq('transaction_id', scopedTransactionId)
  if (scopedLeadId) query = query.eq('lead_id', scopedLeadId)
  if (resolvedLimit && resolvedLimit > 0) query = query.limit(resolvedLimit)

  const { data, error } = await query
  if (error) {
    if (isMissingSpecificTableError(error, 'document_packets')) {
      console.warn('[PACKETS] document_packets table unavailable; returning empty packet list.', {
        code: error?.code || null,
        message: error?.message || null,
      })
      return []
    }
    throw error
  }
  return data || []
}

export async function fetchDocumentPacket(packetId, { includeVersions = true, includeEvents = true } = {}) {
  const client = requireClient()
  if (!packetId) throw new Error('packetId is required.')

  const { data: packet, error: packetError } = await client
    .from('document_packets')
    .select(
      'id, organisation_id, packet_type, title, status, template_id, template_key_snapshot, template_label_snapshot, transaction_id, lead_id, contact_id, deal_id, unit_id, assigned_agent_id, created_by, current_version_number, source_context_json, branding_snapshot_json, sent_at, completed_at, archived_at, created_at, updated_at',
    )
    .eq('id', packetId)
    .maybeSingle()

  if (packetError) {
    if (isMissingSpecificTableError(packetError, 'document_packets')) {
      console.warn('[PACKETS] document_packets table unavailable; fetchDocumentPacket returning null.', {
        code: packetError?.code || null,
        message: packetError?.message || null,
      })
      return null
    }
    throw packetError
  }
  if (!packet) return null

  const result = { ...packet }

  if (includeVersions) {
    const { data, error } = await readPacketVersionsWithSchemaCompatibility((selectColumns) =>
      client
        .from('document_packet_versions')
        .select(selectColumns)
        .eq('packet_id', packetId)
        .order('version_number', { ascending: false }),
    )
    if (error) throw error
    result.versions = await Promise.all((data || []).map((item) => hydratePacketVersionAccessUrls(client, item)))
  }

  if (includeEvents) {
    const { data, error } = await client
      .from('document_packet_events')
      .select('id, packet_id, organisation_id, version_id, event_type, event_payload_json, created_by, created_at')
      .eq('packet_id', packetId)
      .order('created_at', { ascending: false })
    if (error) throw error
    result.events = data || []
  }

  return result
}

export async function listDocumentPacketVersions(packetId) {
  const client = requireClient()
  if (!packetId) throw new Error('packetId is required.')

  const { data, error } = await readPacketVersionsWithSchemaCompatibility((selectColumns) =>
    client
      .from('document_packet_versions')
      .select(selectColumns)
      .eq('packet_id', packetId)
      .order('version_number', { ascending: false }),
  )

  if (error) throw error
  return Promise.all((data || []).map((item) => hydratePacketVersionAccessUrls(client, item)))
}

export async function updateDocumentPacketVersionFinalArtifact({
  packetId,
  packetVersionId,
  finalSignedFilePath = '',
  finalSignedFileName = '',
  finalSignedFileUrl = '',
  finalSignedFileBucket = '',
  finalSignedDocumentId = null,
  finalisedAt = '',
} = {}) {
  const client = requireClient()
  if (!packetId) throw new Error('packetId is required.')
  if (!packetVersionId) throw new Error('packetVersionId is required.')

  const context = await resolvePacketContext(client, {})
  const payload = {
    final_signed_file_path: normalizeNullableText(finalSignedFilePath),
    final_signed_file_name: normalizeNullableText(finalSignedFileName),
    final_signed_file_url: normalizeNullableText(finalSignedFileUrl),
    final_signed_file_bucket: normalizeNullableText(finalSignedFileBucket),
    final_signed_document_id: normalizeNullableUuid(finalSignedDocumentId),
    finalised_at: normalizeNullableText(finalisedAt) || new Date().toISOString(),
    finalised_by: context.user.id,
  }

  const { data, error } = await client
    .from('document_packet_versions')
    .update(payload)
    .eq('id', packetVersionId)
    .eq('packet_id', packetId)
    .select(PACKET_VERSION_SELECT)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Packet version not found for this packet.')

  return hydratePacketVersionAccessUrls(client, data)
}

export async function updateDocumentPacketVersion(packetVersionId, updates = {}) {
  const client = requireClient()
  if (!packetVersionId) throw new Error('packetVersionId is required.')

  const { data: existingVersion, error: existingVersionError } = await client
    .from('document_packet_versions')
    .select('id, packet_id, organisation_id, render_status, validation_summary_json, section_manifest_json, placeholders_resolved_json, placeholders_missing_json')
    .eq('id', packetVersionId)
    .maybeSingle()
  if (existingVersionError) throw existingVersionError
  if (!existingVersion) throw new Error('Packet version not found.')

  const packet = await fetchDocumentPacket(existingVersion.packet_id, { includeVersions: false, includeEvents: false })
  if (!packet) throw new Error('Document packet not found.')
  await assertPacketNotLockedForSigning(client, packet, { actionLabel: 'have its version metadata updated' })

  const payload = {}
  if (updates.renderStatus !== undefined) payload.render_status = normalizeText(updates.renderStatus || existingVersion.render_status)
  if (updates.validationSummaryJson !== undefined) {
    payload.validation_summary_json =
      updates.validationSummaryJson && typeof updates.validationSummaryJson === 'object'
        ? updates.validationSummaryJson
        : existingVersion.validation_summary_json || {}
  }
  if (updates.sectionManifestJson !== undefined) {
    payload.section_manifest_json = Array.isArray(updates.sectionManifestJson)
      ? updates.sectionManifestJson
      : existingVersion.section_manifest_json || []
  }
  if (updates.placeholdersResolvedJson !== undefined) {
    payload.placeholders_resolved_json =
      updates.placeholdersResolvedJson && typeof updates.placeholdersResolvedJson === 'object'
        ? updates.placeholdersResolvedJson
        : existingVersion.placeholders_resolved_json || {}
  }
  if (updates.placeholdersMissingJson !== undefined) {
    payload.placeholders_missing_json = Array.isArray(updates.placeholdersMissingJson)
      ? updates.placeholdersMissingJson
      : existingVersion.placeholders_missing_json || []
  }

  if (!Object.keys(payload).length) {
    return hydratePacketVersionAccessUrls(client, existingVersion)
  }

  const { data, error } = await client
    .from('document_packet_versions')
    .update(payload)
    .eq('id', packetVersionId)
    .eq('packet_id', existingVersion.packet_id)
    .select(PACKET_VERSION_SELECT)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Packet version not found for this packet.')
  return hydratePacketVersionAccessUrls(client, data)
}

export async function saveEditableDocumentDraftRevision({
  packetId,
  baseVersionId,
  expectedEditSequence = 0,
  baseDocument = {},
  sections = [],
  placeholders = {},
  validationSummary = {},
  reviewState = 'draft',
} = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(baseVersionId)) throw new Error('baseVersionId is required.')

  const editableContent = buildEditableDocumentRevision({
    baseDocument,
    sections,
    reviewState,
  })
  const sectionManifest = buildEditableRevisionManifest(editableContent)
  const compatibilitySnapshot = {
    ...editableContent,
    review_state: editableContent.reviewState,
    last_saved_at: editableContent.updatedAt,
    sections: editableContent.sections.map((section) => ({
      ...section,
      tokens: (section.mergeFields || []).map((token) => ({ token, label: token })),
    })),
  }

  const { data: result, error } = await client.rpc('bridge_save_editable_document_revision_c2', {
    p_packet_id: packetId,
    p_base_version_id: baseVersionId,
    p_expected_edit_sequence: Math.max(0, Math.trunc(Number(expectedEditSequence) || 0)),
    p_editable_content_json: editableContent,
    p_section_manifest_json: sectionManifest,
    p_placeholders_json: placeholders && typeof placeholders === 'object' ? placeholders : {},
    p_validation_summary_json: {
      ...(validationSummary && typeof validationSummary === 'object' ? validationSummary : {}),
      editable_draft: compatibilitySnapshot,
      editable_draft_saved_at: editableContent.updatedAt,
    },
    p_review_state: editableContent.reviewState,
  })
  if (error) {
    if (normalizeText(error?.details).includes('STALE_EDITABLE_DOCUMENT_REVISION') || error?.code === '40001') {
      const conflict = new Error('A newer document revision exists. Reload the document before saving your changes.')
      conflict.code = 'STALE_EDITABLE_DOCUMENT_REVISION'
      conflict.cause = error
      throw conflict
    }
    throw error
  }
  if (result?.contract !== 'c2-v1' || !result?.packet?.id || !result?.version?.id) {
    throw new Error('The editable document revision contract returned an invalid result.')
  }
  return result
}

export async function restoreEditableDocumentDraftRevision({
  packetId,
  sourceVersionId,
  baseVersionId,
  expectedEditSequence = 0,
} = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(sourceVersionId)) throw new Error('sourceVersionId is required.')
  if (!normalizeNullableUuid(baseVersionId)) throw new Error('baseVersionId is required.')

  const { data: result, error } = await client.rpc('bridge_restore_editable_document_revision_c3', {
    p_packet_id: packetId,
    p_source_version_id: sourceVersionId,
    p_base_version_id: baseVersionId,
    p_expected_edit_sequence: Math.max(0, Math.trunc(Number(expectedEditSequence) || 0)),
  })
  if (error) {
    if (normalizeText(error?.details).includes('STALE_EDITABLE_DOCUMENT_REVISION') || error?.code === '40001') {
      const conflict = new Error('A newer document revision exists. Reload before restoring an earlier version.')
      conflict.code = 'STALE_EDITABLE_DOCUMENT_REVISION'
      conflict.cause = error
      throw conflict
    }
    throw error
  }
  if (result?.contract !== 'c3-v1' || !result?.packet?.id || !result?.version?.id) {
    throw new Error('The editable document restore contract returned an invalid result.')
  }
  return result
}

export async function freezeEditableDocumentRevisionForRender({ packetId, versionId, expectedEditSequence = 0 } = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(versionId)) throw new Error('versionId is required.')
  const { data: result, error } = await client.rpc('bridge_freeze_editable_revision_for_render_c4', {
    p_packet_id: packetId,
    p_version_id: versionId,
    p_expected_edit_sequence: Math.max(0, Math.trunc(Number(expectedEditSequence) || 0)),
  })
  if (error) {
    if (normalizeText(error?.details).includes('STALE_EDITABLE_DOCUMENT_REVISION') || error?.code === '40001') {
      const conflict = new Error('A newer document revision exists. Reload before generating the PDF.')
      conflict.code = 'STALE_EDITABLE_DOCUMENT_REVISION'
      conflict.cause = error
      throw conflict
    }
    throw error
  }
  if (result?.contract !== 'c4-v1' || !result?.freezeId || !result?.sourceVersionId || !result?.contentFingerprint) {
    throw new Error('The editable render-freeze contract returned an invalid result.')
  }
  return result
}

export async function completeEditableDocumentRenderFreeze({
  packetId,
  freezeId,
  generatedVersionId = null,
  success = true,
  failureMessage = '',
} = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(freezeId)) throw new Error('freezeId is required.')
  const { data: result, error } = await client.rpc('bridge_complete_editable_render_freeze_c4', {
    p_packet_id: packetId,
    p_freeze_id: freezeId,
    p_generated_version_id: normalizeNullableUuid(generatedVersionId),
    p_success: Boolean(success),
    p_failure_message: normalizeNullableText(failureMessage),
  })
  if (error) throw error
  if (result?.contract !== 'c4-v1' || !result?.freezeId) {
    throw new Error('The editable render-freeze completion contract returned an invalid result.')
  }
  return result
}

export async function verifyFrozenEditableRenderOutput({ packetId, freezeId, generatedVersionId } = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(freezeId)) throw new Error('freezeId is required.')
  if (!normalizeNullableUuid(generatedVersionId)) throw new Error('generatedVersionId is required.')
  const { data: result, error } = await client.rpc('bridge_verify_frozen_render_output_d1', {
    p_packet_id: packetId,
    p_freeze_id: freezeId,
    p_generated_version_id: generatedVersionId,
  })
  if (error) {
    if (normalizeText(error?.details).includes('FROZEN_RENDER_PROVENANCE_MISMATCH')) {
      const mismatch = new Error('The generated PDF does not match the frozen editable revision. Regenerate the document before sending it.')
      mismatch.code = 'FROZEN_RENDER_PROVENANCE_MISMATCH'
      mismatch.cause = error
      throw mismatch
    }
    throw error
  }
  if (result?.contract !== 'd1-v1' || result?.verified !== true) {
    throw new Error('Frozen PDF verification returned an invalid result.')
  }
  return result
}

export async function verifyServerAttestedNativePdfRender({ packetId, freezeId, generatedVersionId } = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(freezeId)) throw new Error('freezeId is required.')
  if (!normalizeNullableUuid(generatedVersionId)) throw new Error('generatedVersionId is required.')
  const { data: result, error } = await client.rpc('bridge_verify_native_pdf_render_d2', {
    p_packet_id: packetId,
    p_freeze_id: freezeId,
    p_generated_version_id: generatedVersionId,
  })
  if (error) {
    const detail = normalizeText(error?.details)
    if (detail.includes('D2_RENDER_INPUT_NOT_VERIFIED') || detail.includes('D2_NATIVE_PDF_ATTESTATION_MISMATCH')) {
      const mismatch = new Error('The generated file is not a verified native PDF from the frozen document. Regenerate it before sending for signature.')
      mismatch.code = detail.includes('D2_RENDER_INPUT_NOT_VERIFIED')
        ? 'D2_RENDER_INPUT_NOT_VERIFIED'
        : 'D2_NATIVE_PDF_ATTESTATION_MISMATCH'
      mismatch.cause = error
      throw mismatch
    }
    throw error
  }
  if (result?.contract !== 'd2-v1' || result?.verified !== true) {
    throw new Error('Native PDF verification returned an invalid result.')
  }
  return result
}

export async function persistGeneratedPdfToTransaction({ packetId, generatedVersionId } = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(generatedVersionId)) throw new Error('generatedVersionId is required.')
  const { data: result, error } = await client.rpc('bridge_persist_transaction_pdf_d3', {
    p_packet_id: packetId,
    p_generated_version_id: generatedVersionId,
  })
  if (error) {
    const detail = normalizeText(error?.details)
    if (detail.includes('D3_')) {
      const persistenceError = new Error('The generated PDF could not be safely linked to the transaction. Regenerate it before continuing.')
      persistenceError.code = detail
      persistenceError.cause = error
      throw persistenceError
    }
    throw error
  }
  if (result?.contract !== 'd3-v1' || result?.persisted !== true || !result?.documentId || !result?.path) {
    throw new Error('Transaction PDF persistence returned an invalid result.')
  }
  return result
}

export async function certifyNativeStructuredLegalPdf({ packetId, generatedVersionId } = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(generatedVersionId)) throw new Error('generatedVersionId is required.')
  const { data: result, error } = await client.rpc('bridge_certify_native_structured_legal_pdf', {
    p_packet_id: packetId,
    p_generated_version_id: generatedVersionId,
  })
  if (error) {
    const detail = normalizeText(error?.details)
    if (detail.includes('NATIVE_STRUCTURED_CERTIFICATION_')) {
      const certificationError = new Error('The generated PDF could not be certified for signing. Regenerate it before continuing.')
      certificationError.code = detail
      certificationError.cause = error
      throw certificationError
    }
    throw error
  }
  if (result?.contract !== 'native-structured-d3-v1' || result?.certified !== true || !result?.documentId || !result?.path) {
    throw new Error('Native structured legal PDF certification returned an invalid result.')
  }
  return result
}

export async function requestPersistedPdfAccess({ packetId, versionId, purpose = 'preview' } = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(versionId)) throw new Error('versionId is required.')
  const normalizedPurpose = normalizeText(purpose).toLowerCase() === 'download' ? 'download' : 'preview'
  const { data: authorization, error } = await client.rpc('bridge_authorize_persisted_pdf_access_d4', {
    p_packet_id: packetId,
    p_version_id: versionId,
    p_purpose: normalizedPurpose,
  })
  if (error) {
    const detail = normalizeText(error?.details)
    if (detail.includes('D4_')) {
      const accessError = new Error('The certified PDF is unavailable or no longer matches its transaction record. Regenerate the document before continuing.')
      accessError.code = detail
      accessError.cause = error
      throw accessError
    }
    throw error
  }
  if (authorization?.contract !== 'd4-v1' || authorization?.authorized !== true || !authorization?.bucket || !authorization?.path) {
    throw new Error('Certified PDF access returned an invalid result.')
  }
  const options = normalizedPurpose === 'download' && authorization.fileName
    ? { download: authorization.fileName }
    : undefined
  const signedResult = await client.storage
    .from(authorization.bucket)
    .createSignedUrl(authorization.path, 15 * 60, options)
  if (signedResult.error || !signedResult.data?.signedUrl) {
    const accessError = new Error('The PDF is stored correctly, but a fresh access link could not be created. Please retry.')
    accessError.code = 'D4_SIGNED_URL_CREATE_FAILED'
    accessError.cause = signedResult.error || null
    throw accessError
  }
  return {
    ...authorization,
    signedUrl: signedResult.data.signedUrl,
    expiresInSeconds: 15 * 60,
  }
}

export async function getFinalDocumentCompletionStatus({ packetId, versionId } = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(versionId)) throw new Error('versionId is required.')
  const { data, error } = await client.rpc('bridge_get_final_completion_status_f5', {
    p_packet_id: packetId,
    p_packet_version_id: versionId,
  })
  if (error) throw error
  if (data?.contract !== 'f5-v1') throw new Error('Final completion status returned an invalid result.')
  return data
}

export async function retryFinalDocumentCompletion({ packetId, versionId } = {}) {
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(versionId)) throw new Error('versionId is required.')
  const { data, error } = await invokeEdgeFunction('retry-final-document-completion', {
    body: { packetId, packetVersionId: versionId },
  })
  if (error || !data || data.success === false) {
    const retryError = new Error(data?.error || error?.message || 'The final document completion retry failed.')
    retryError.code = data?.errorCode || error?.code || 'F5_RETRY_FAILED'
    retryError.retryable = data?.retryable !== false
    throw retryError
  }
  return data
}

export async function getDocumentGeneratorLaunchChain({ packetId, versionId } = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(versionId)) throw new Error('versionId is required.')
  const { data, error } = await client.rpc('bridge_get_document_generator_launch_chain_g1', {
    p_packet_id: packetId,
    p_packet_version_id: versionId,
  })
  if (error) throw error
  if (data?.contract !== 'g1-v1') throw new Error('Generator launch assurance returned an invalid result.')
  return data
}

export async function fetchSigningFieldLayout({ packetId, versionId } = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(versionId)) throw new Error('versionId is required.')
  const { data, error } = await client
    .from('document_signing_field_layouts')
    .select('id, organisation_id, packet_id, packet_version_id, revision, status, fields_json, content_fingerprint, pdf_page_count, placement_schema_version, placement_verified, placement_verified_at, applied_at, applied_by, applied_field_count, created_at, updated_at')
    .eq('packet_id', packetId)
    .eq('packet_version_id', versionId)
    .maybeSingle()
  if (error) throw error
  return data
    ? {
        contract: 'e1-v1',
        layoutId: data.id,
        packetId: data.packet_id,
        versionId: data.packet_version_id,
        revision: Number(data.revision || 0),
        status: data.status,
        fields: Array.isArray(data.fields_json) ? data.fields_json : [],
        contentFingerprint: data.content_fingerprint,
        pdfPageCount: Number(data.pdf_page_count || 0) || null,
        placementSchemaVersion: data.placement_schema_version,
        placementVerified: data.placement_verified === true,
        placementVerifiedAt: data.placement_verified_at,
        appliedAt: data.applied_at,
        appliedFieldCount: Number(data.applied_field_count || 0),
        updatedAt: data.updated_at,
      }
    : null
}

export async function saveSigningFieldLayout({ packetId, versionId, fields = [], expectedRevision = 0 } = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(versionId)) throw new Error('versionId is required.')
  const normalizedFields = assertSigningFieldLayout(fields)
  const { data: result, error } = await client.rpc('bridge_save_signing_field_layout_e1', {
    p_packet_id: packetId,
    p_version_id: versionId,
    p_fields: normalizedFields,
    p_expected_revision: Number(expectedRevision || 0),
  })
  if (error) {
    const detail = normalizeText(error?.details)
    if (detail.includes('E1_SIGNING_LAYOUT_STALE')) {
      const stale = new Error('The signature layout changed in another session. Reload it before saving again.')
      stale.code = 'E1_SIGNING_LAYOUT_STALE'
      stale.cause = error
      throw stale
    }
    throw error
  }
  if (result?.contract !== 'e1-v1' || !result?.layoutId || !Array.isArray(result?.fields)) {
    throw new Error('Signing field layout save returned an invalid result.')
  }
  return result
}

export async function saveSigningFieldPlacement({ packetId, versionId, fields = [], expectedRevision = 0, pdfPageCount = 1 } = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(versionId)) throw new Error('versionId is required.')
  const normalizedFields = assertSigningFieldLayout(fields)
  const { data: result, error } = await client.rpc('bridge_save_signing_field_placement_e2', {
    p_packet_id: packetId,
    p_version_id: versionId,
    p_fields: normalizedFields,
    p_expected_revision: Number(expectedRevision || 0),
    p_pdf_page_count: Math.max(1, Math.trunc(Number(pdfPageCount || 1))),
  })
  if (error) {
    const detail = normalizeText(error?.details)
    const placementError = new Error(
      detail.includes('E2_SIGNING_FIELD_COLLISION')
        ? 'Two signing blocks overlap. Move them apart before saving.'
        : detail.includes('E2_FIELD_PAGE_OUT_OF_RANGE')
          ? 'A signing block is assigned to a page that does not exist in this PDF.'
          : error.message || 'The visual signing layout could not be saved.',
    )
    placementError.code = detail || error.code || 'E2_SIGNING_FIELD_PLACEMENT_FAILED'
    placementError.cause = error
    throw placementError
  }
  if (result?.contract !== 'e2-v1' || result?.placementVerified !== true || !Array.isArray(result?.fields)) {
    throw new Error('Visual signing-field placement returned an invalid result.')
  }
  return result
}

export async function applySigningFieldLayout({ packetId, versionId, layoutRevision } = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  if (!normalizeNullableUuid(versionId)) throw new Error('versionId is required.')
  if (!Number.isInteger(Number(layoutRevision)) || Number(layoutRevision) < 1) throw new Error('A saved layout revision is required.')
  const { data: result, error } = await client.rpc('bridge_apply_signing_field_layout_e3', {
    p_packet_id: packetId,
    p_version_id: versionId,
    p_layout_revision: Number(layoutRevision),
  })
  if (error) {
    const detail = normalizeText(error?.details)
    const mappingError = new Error(
      detail.includes('E3_SIGNER_FIELD_MAPPING_INCOMPLETE')
        ? 'Every signer in the layout needs a real name, email address and required signature block. Save signer details and check the agent, seller or buyer blocks.'
        : detail.includes('E3_LAYOUT_REVISION_STALE')
          ? 'The visual layout changed before it was applied. Reload and try again.'
          : error.message || 'The signing layout could not be applied.',
    )
    mappingError.code = detail || error.code || 'E3_SIGNER_FIELD_MAPPING_FAILED'
    mappingError.cause = error
    throw mappingError
  }
  if (result?.contract !== 'e3-v1' || result?.applied !== true || Number(result?.fieldCount || 0) < 1) {
    throw new Error('Signing layout application returned an invalid result.')
  }
  return result
}

export async function authorizeAppliedEnvelopeDispatch({ packetId, versionId, regenerate = false, targetSignerRole = '' } = {}) {
  const client = requireClient()
  const { data: result, error } = await client.rpc('bridge_authorize_applied_envelope_dispatch_e4', {
    p_packet_id: packetId,
    p_version_id: versionId,
    p_regenerate: Boolean(regenerate),
    p_target_signer_role: normalizeNullableText(targetSignerRole),
  })
  if (error) {
    const detail = normalizeText(error?.details)
    const dispatchError = new Error(
      detail.includes('E4_APPLIED_LAYOUT_REQUIRED')
        ? 'Apply the visual signature layout to the signers before sending.'
        : detail.includes('E4_APPLIED_LAYOUT_FIELD_MISMATCH')
          ? 'The active signing fields no longer match the applied visual layout. Apply the layout again before sending.'
          : error.message || 'The signing envelope could not be authorized for dispatch.',
    )
    dispatchError.code = detail || error.code || 'E4_DISPATCH_AUTHORIZATION_FAILED'
    dispatchError.cause = error
    throw dispatchError
  }
  if (result?.contract !== 'e4-v1' || result?.authorized !== true || !result?.dispatchId) {
    throw new Error('Signing dispatch authorization returned an invalid result.')
  }
  return result
}

export async function completeAppliedEnvelopeDispatch({ dispatchId, success, deliveryEvidence = {} } = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(dispatchId)) throw new Error('dispatchId is required.')
  const { data: result, error } = await client.rpc('bridge_complete_applied_envelope_dispatch_e4', {
    p_dispatch_id: dispatchId,
    p_success: Boolean(success),
    p_delivery_evidence: deliveryEvidence && typeof deliveryEvidence === 'object' ? deliveryEvidence : {},
  })
  if (error) throw error
  if (result?.contract !== 'e4-v1' || !['delivered', 'failed'].includes(result?.status)) {
    throw new Error('Signing dispatch completion returned an invalid result.')
  }
  return result
}

export async function uploadFinalSignedPacketArtifact({
  packetId,
  packetVersionId = '',
  file,
  fileName = '',
} = {}) {
  const client = requireClient()
  if (!packetId) throw new Error('packetId is required.')
  if (!file) throw new Error('Select a signed document to upload.')

  const safeName = normalizeStorageSafeName(fileName || file.name || 'signed-mandate.pdf', 'signed-mandate.pdf')
  const { data: packetRecord, error: packetError } = await client
    .from('document_packets')
    .select('id, organisation_id, lead_id, transaction_id')
    .eq('id', packetId)
    .maybeSingle()
  if (packetError) throw packetError

  const organisationSegment = normalizeStorageSafeName(packetRecord?.organisation_id || 'organisation', 'organisation')
  const relatedSegment = normalizeStorageSafeName(packetRecord?.lead_id || packetRecord?.transaction_id || packetId, 'packet')
  const versionSegment = packetVersionId ? `${normalizeStorageSafeName(packetVersionId, 'version')}-` : ''
  const objectPath = `mandates/${organisationSegment}/${relatedSegment}/signed/${Date.now()}-${versionSegment}${safeName}`
  const { bucket: uploadedBucket } = await uploadToStorageCandidateBuckets({
    bucketCandidates: FINAL_SIGNED_BUCKET_CANDIDATES,
    upload: (bucketName) =>
      client.storage.from(bucketName).upload(objectPath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/pdf',
      }),
    missingBucketMessage: `Unable to upload final signed document. Checked buckets: ${FINAL_SIGNED_BUCKET_CANDIDATES.join(', ')}.`,
    accessDeniedMessage: 'Final signed document storage is not ready yet. Please retry after storage access is refreshed.',
    accessDeniedCode: 'final_signed_document_storage_access_not_ready',
    genericMessage: 'Unable to upload final signed document.',
  })

  const signedResult = await client.storage.from(uploadedBucket).createSignedUrl(objectPath, 60 * 60 * 24 * 30)

  return {
    bucket: uploadedBucket,
    path: objectPath,
    fileName: file.name || safeName,
    signedUrl: normalizeText(signedResult?.data?.signedUrl) || null,
  }
}

export async function createDocumentPacketVersion(input = {}) {
  const client = requireClient()
  if (!input.packetId) throw new Error('packetId is required.')

  const packet = await fetchDocumentPacket(input.packetId, { includeVersions: false, includeEvents: false })
  if (!packet) throw new Error('Document packet not found.')
  await assertPacketNotLockedForSigning(client, packet, { actionLabel: 'be regenerated' })

  const resolvedRenderStatus = normalizeText(input.renderStatus || 'draft')
  const { data: result, error } = await client.rpc('bridge_create_document_packet_version_i1', {
    p_packet_id: packet.id,
    p_render_status: resolvedRenderStatus,
    p_rendered_document_id: normalizeNullableUuid(input.renderedDocumentId),
    p_rendered_file_path: normalizeNullableText(input.renderedFilePath),
    p_rendered_file_name: normalizeNullableText(input.renderedFileName),
    p_rendered_file_url: normalizeNullableText(input.renderedFileUrl),
    p_placeholders_resolved_json: input.placeholdersResolvedJson && typeof input.placeholdersResolvedJson === 'object' ? input.placeholdersResolvedJson : {},
    p_placeholders_missing_json: Array.isArray(input.placeholdersMissingJson) ? input.placeholdersMissingJson : [],
    p_section_manifest_json: Array.isArray(input.sectionManifestJson) ? input.sectionManifestJson : [],
    p_validation_summary_json: input.validationSummaryJson && typeof input.validationSummaryJson === 'object' ? input.validationSummaryJson : {},
    p_generated_by: normalizeNullableUuid(input.generatedBy),
    p_generated_at: input.generatedAt || new Date().toISOString(),
    p_dry_run: false,
  })
  if (error) throw error
  if (result?.contract !== 'i1-v1' || result?.dryRun !== false || !result?.version?.id) throw new Error('The atomic packet-version contract returned an invalid result.')
  const data = result.version

  if (normalizeText(resolvedRenderStatus).toLowerCase() === 'generated') {
    await linkPacketVersionToCanonicalRequirementSafely(client, {
      packet,
      version: data,
      actorUserId: input.generatedBy || null,
      metadata: {
        render_status: resolvedRenderStatus,
        rendered_file_path: data.rendered_file_path || null,
      },
    })
  }

  return hydratePacketVersionAccessUrls(client, data)
}

export async function claimDocumentPacketGenerationLease({ packetId, generationAttemptId, ttlSeconds = 300 } = {}) {
  const client = requireClient()
  if (!packetId || !generationAttemptId) throw new Error('packetId and generationAttemptId are required.')
  const { data, error } = await client.rpc('bridge_claim_generation_lease_i3', {
    p_packet_id: packetId,
    p_generation_attempt_id: generationAttemptId,
    p_ttl_seconds: ttlSeconds,
  })
  if (error) throw error
  return data === true
}

export async function releaseDocumentPacketGenerationLease({ packetId, generationAttemptId } = {}) {
  const client = requireClient()
  if (!packetId || !generationAttemptId) return false
  const { data, error } = await client.rpc('bridge_release_generation_lease_i3', {
    p_packet_id: packetId,
    p_generation_attempt_id: generationAttemptId,
  })
  if (error) throw error
  return data === true
}

export async function getDocumentPacketGenerationLeaseStatus({ packetId } = {}) {
  const client = requireClient()
  if (!normalizeNullableUuid(packetId)) throw new Error('packetId is required.')
  const { data, error } = await client.rpc('bridge_get_generation_attempt_status_i4', { p_packet_id: packetId })
  if (error) throw error
  if (data?.contract !== 'i4-generator-v1' || data?.internalIdentifiersExcluded !== true) {
    throw new Error('Generation attempt status returned an invalid result.')
  }
  return data
}

export async function appendDocumentPacketEvent({
  packetId,
  organisationId = null,
  versionId = null,
  eventType,
  eventPayload = {},
} = {}) {
  const client = requireClient()
  const resolvedPacketId = normalizeNullableUuid(packetId)
  if (!resolvedPacketId) {
    console.warn('[PACKETS] skipping packet event because packet id is not persisted yet.', {
      packetId: normalizeText(packetId) || null,
      organisationId: normalizeText(organisationId) || null,
      versionId: normalizeText(versionId) || null,
      eventType: normalizeText(eventType) || null,
    })
    return null
  }
  if (!normalizeText(eventType)) throw new Error('eventType is required.')

  const context = await resolvePacketContext(client, { organisationId })
  const activityPayload = buildActivityEventPayload({
    eventType: normalizeText(eventType),
    eventPayload,
    packetId: resolvedPacketId,
    versionId,
    context,
  })

  const { data, error } = await client
    .from('document_packet_events')
    .insert({
      packet_id: resolvedPacketId,
      organisation_id: context.organisationId,
      version_id: normalizeNullableUuid(versionId),
      event_type: normalizeText(eventType),
      event_payload_json: activityPayload,
      created_by: context.user.id,
    })
    .select('id, packet_id, organisation_id, version_id, event_type, event_payload_json, created_by, created_at')
    .single()
  if (error) {
    if (isPermissionDeniedError(error)) {
      console.warn('[PACKETS] document_packet_events insert denied by RLS; continuing without event log.', {
        packetId,
        eventType: normalizeText(eventType),
        code: error?.code || null,
        message: error?.message || null,
      })
      return null
    }
    throw error
  }
  return data
}

export async function listLegalDocumentGenerationSupportHandoffs({ organisationId = null, limit = 50 } = {}) {
  const client = requireClient()
  const context = await resolvePacketContext(client, { organisationId })
  if (!context.isOrgAdmin) {
    const error = new Error('Organisation administrator access is required to view legal-document support handoffs.')
    error.code = 'SUPPORT_HANDOFF_ADMIN_REQUIRED'
    throw error
  }
  const resolvedLimit = Math.max(1, Math.min(100, Number(limit || 50)))
  const { data: handoffEvents, error: eventsError } = await client
    .from('document_packet_events')
    .select('id, packet_id, organisation_id, event_type, event_payload_json, created_by, created_at')
    .eq('organisation_id', context.organisationId)
    .eq('event_type', 'legal_generation_support_handoff')
    .eq('event_payload_json->>contract', 'j4-v1')
    .order('created_at', { ascending: false })
    .limit(resolvedLimit)
  if (eventsError) throw eventsError
  const { data: lifecycleEvents, error: lifecycleError } = await client
    .from('document_packet_events')
    .select('id, packet_id, organisation_id, event_type, event_payload_json, created_by, created_at')
    .eq('organisation_id', context.organisationId)
    .in('event_type', ['legal_generation_support_acknowledged', 'legal_generation_support_resolved'])
    .eq('event_payload_json->>contract', 'k2-v1')
    .order('created_at', { ascending: false })
    .limit(resolvedLimit * 2)
  if (lifecycleError) throw lifecycleError
  const events = [...(handoffEvents || []), ...(lifecycleEvents || [])]
  const packetIds = [...new Set((events || []).map((event) => normalizeNullableUuid(event?.packet_id)).filter(Boolean))]
  let packets = []
  if (packetIds.length) {
    const { data, error } = await client
      .from('document_packets')
      .select('id, organisation_id, packet_type, title, status')
      .eq('organisation_id', context.organisationId)
      .in('id', packetIds)
    if (error) throw error
    packets = data || []
  }
  return {
    ...buildLegalDocumentSupportTriageSnapshot({ events: events || [], packets }),
    organisationId: context.organisationId,
    checkedAt: new Date().toISOString(),
  }
}

export async function transitionLegalDocumentGenerationSupportHandoff({ organisationId = null, packetId, supportReference, action, resolutionCode = '' } = {}) {
  const client = requireClient()
  const context = await resolvePacketContext(client, { organisationId })
  if (!context.isOrgAdmin) {
    const error = new Error('Organisation administrator access is required to update legal-document support handoffs.')
    error.code = 'SUPPORT_HANDOFF_ADMIN_REQUIRED'
    throw error
  }
  const resolvedPacketId = normalizeNullableUuid(packetId)
  const resolvedReference = normalizeText(supportReference).toUpperCase()
  const resolvedAction = normalizeText(action).toLowerCase()
  if (!resolvedPacketId || !/^LD-(OTP|MAN)-[A-Z0-9]+-[A-Z0-9]+$/.test(resolvedReference)) throw new Error('A valid packet and support reference are required.')
  if (!['acknowledge', 'resolve'].includes(resolvedAction)) throw new Error('Support handoff action must be acknowledge or resolve.')
  if (resolvedAction === 'resolve' && !LEGAL_DOCUMENT_SUPPORT_RESOLUTION_CODES.includes(resolutionCode)) throw new Error('Choose a valid support resolution category.')
  const { data: packet, error: packetError } = await client.from('document_packets').select('id, organisation_id, packet_type, title, status').eq('id', resolvedPacketId).eq('organisation_id', context.organisationId).maybeSingle()
  if (packetError) throw packetError
  if (!packet?.id) throw new Error('Support handoff packet was not found in this organisation.')
  const current = await listLegalDocumentGenerationSupportHandoffs({ organisationId: context.organisationId, limit: 100 })
  const handoff = current.handoffs.find((row) => row.packetId === resolvedPacketId && row.supportReference === resolvedReference)
  if (!handoff) throw new Error('Support handoff was not found in this organisation.')
  if (resolvedAction === 'acknowledge' && handoff.caseStatus !== 'open') return { handoff, changed: false }
  if (resolvedAction === 'resolve' && handoff.caseStatus !== 'acknowledged') {
    const error = new Error('A support handoff must be acknowledged before it can be resolved.')
    error.code = 'SUPPORT_HANDOFF_ACKNOWLEDGEMENT_REQUIRED'
    throw error
  }
  const eventType = resolvedAction === 'acknowledge' ? 'legal_generation_support_acknowledged' : 'legal_generation_support_resolved'
  let event = null
  try {
    event = await appendDocumentPacketEvent({
      packetId: resolvedPacketId,
      organisationId: context.organisationId,
      eventType,
      eventPayload: {
        contract: 'k2-v1',
        supportReference: resolvedReference,
        action: resolvedAction,
        resolutionCode: resolvedAction === 'resolve' ? resolutionCode : null,
        rawDetailsIncluded: false,
      },
    })
  } catch (error) {
    if (error?.code === '23505') return { handoff, changed: false, action: resolvedAction, supportReference: resolvedReference }
    throw error
  }
  return { event, changed: Boolean(event), action: resolvedAction, supportReference: resolvedReference }
}

export async function archiveDocumentPacket(packetId, { reason = '' } = {}) {
  if (!packetId) throw new Error('packetId is required.')

  const archivedAt = new Date().toISOString()
  const transition = await transitionDocumentPacketLifecycle({
    packetId,
    nextState: 'archived',
    sourceContextPatch: { archiveReason: normalizeText(reason) || null, archivedAt },
    eventPayload: { reason: normalizeText(reason) || null },
  })
  const packet = transition.packet

  await appendDocumentPacketEvent({
    packetId,
    organisationId: packet?.organisation_id || null,
    eventType: 'packet_archive_metadata',
    eventPayload: {
      reason: normalizeText(reason) || null,
      archivedAt,
    },
  })

  return packet
}

export async function resolveDocumentPacketBranding({ organisationId = null } = {}) {
  const client = requireClient()
  const context = await resolvePacketContext(client, { organisationId })

  let orgResult = await client
    .from('organisations')
    .select('id, name, display_name, logo_url, website, email, phone, phone_number, telephone, physical_address, address_line_1, address_line_2, city, province, postal_code')
    .eq('id', context.organisationId)
    .maybeSingle()
  if (orgResult.error && isMissingColumnError(orgResult.error)) {
    orgResult = await client
      .from('organisations')
      .select('id, name, display_name, logo_url')
      .eq('id', context.organisationId)
      .maybeSingle()
  }
  if (orgResult.error) throw orgResult.error

  let brandingData = null
  if (organisationBrandingTableAvailable) {
    const brandingResult = await client
      .from('organisation_branding')
      .select('organisation_id, logo_light_url, logo_dark_url')
      .eq('organisation_id', context.organisationId)
      .maybeSingle()

    if (brandingResult.error) {
      if (isMissingSpecificTableError(brandingResult.error, 'organisation_branding')) {
        organisationBrandingTableAvailable = false
        console.warn('[PACKETS] organisation_branding table unavailable; continuing with default branding.', {
          code: brandingResult.error?.code || null,
          message: brandingResult.error?.message || null,
        })
      } else {
        throw brandingResult.error
      }
    } else {
      brandingData = brandingResult.data || null
    }
  }

  const settingsResult = await client
    .from('organisation_settings')
    .select('settings_json')
    .eq('organisation_id', context.organisationId)
    .maybeSingle()
  if (settingsResult.error && !isMissingSpecificTableError(settingsResult.error, 'organisation_settings')) {
    throw settingsResult.error
  }

  const settings = settingsResult.data?.settings_json && typeof settingsResult.data.settings_json === 'object'
    ? settingsResult.data.settings_json
    : {}
  const onboarding = settings.agencyOnboarding && typeof settings.agencyOnboarding === 'object'
    ? settings.agencyOnboarding
    : settings.agency_onboarding && typeof settings.agency_onboarding === 'object'
      ? settings.agency_onboarding
      : {}
  const settingsBranding = onboarding.branding && typeof onboarding.branding === 'object'
    ? onboarding.branding
    : settings.branding && typeof settings.branding === 'object'
      ? settings.branding
      : {}
  const agencyInfo = onboarding.agencyInformation && typeof onboarding.agencyInformation === 'object'
    ? onboarding.agencyInformation
    : onboarding.agency_information && typeof onboarding.agency_information === 'object'
      ? onboarding.agency_information
      : {}
  const resolveBrandingUrl = async ({ bucket = '', path = '', fallbackUrl = '' } = {}) => {
    const safeBucket = normalizeText(bucket)
    const safePath = normalizeText(path)
    const safeFallback = normalizeText(fallbackUrl)
    if (!safeBucket || !safePath) return safeFallback
    const signedResult = await client.storage.from(safeBucket).createSignedUrl(safePath, 60 * 60 * 24 * 30)
    const signedUrl = normalizeText(signedResult?.data?.signedUrl)
    if (!signedResult?.error && signedUrl) return signedUrl
    const { data: publicUrlData } = client.storage.from(safeBucket).getPublicUrl(safePath)
    return normalizeText(publicUrlData?.publicUrl) || safeFallback
  }
  const settingsLogoLight = await resolveBrandingUrl({
    bucket: settingsBranding.logoLightBucket,
    path: settingsBranding.logoLightPath,
    fallbackUrl: settingsBranding.logoLight || settingsBranding.logoLightUrl,
  })
  const settingsLogoDark = await resolveBrandingUrl({
    bucket: settingsBranding.logoDarkBucket,
    path: settingsBranding.logoDarkPath,
    fallbackUrl: settingsBranding.logoDark || settingsBranding.logoDarkUrl,
  })
  const orgLogoUrl = normalizeNullableText(orgResult.data?.logo_url)
  const logoLightUrl =
    normalizeNullableText(settingsLogoLight) ||
    normalizeNullableText(brandingData?.logo_light_url) ||
    orgLogoUrl
  const logoDarkUrl =
    normalizeNullableText(settingsLogoDark) ||
    normalizeNullableText(brandingData?.logo_dark_url) ||
    logoLightUrl
  const physicalAddress =
    normalizeNullableText(orgResult.data?.physical_address) ||
    normalizeNullableText(agencyInfo.physicalAddress) ||
    normalizeNullableText(agencyInfo.physical_address) ||
    [orgResult.data?.address_line_1, orgResult.data?.address_line_2, orgResult.data?.city, orgResult.data?.province, orgResult.data?.postal_code]
      .map((value) => normalizeText(value))
      .filter(Boolean)
      .join(', ')
  const phoneNumber =
    normalizeNullableText(orgResult.data?.telephone) ||
    normalizeNullableText(orgResult.data?.phone_number) ||
    normalizeNullableText(orgResult.data?.phone) ||
    normalizeNullableText(agencyInfo.mainOfficeNumber) ||
    normalizeNullableText(agencyInfo.main_office_number) ||
    normalizeNullableText(agencyInfo.telephone) ||
    normalizeNullableText(agencyInfo.phoneNumber) ||
    normalizeNullableText(agencyInfo.phone_number)
  const email =
    normalizeNullableText(orgResult.data?.email) ||
    normalizeNullableText(agencyInfo.mainEmailAddress) ||
    normalizeNullableText(agencyInfo.main_email_address) ||
    normalizeNullableText(agencyInfo.email) ||
    normalizeNullableText(agencyInfo.emailAddress) ||
    normalizeNullableText(agencyInfo.email_address)
  const website =
    normalizeNullableText(orgResult.data?.website) ||
    normalizeNullableText(agencyInfo.website)

  return {
    organisationId: context.organisationId,
    organisationName: normalizeText(orgResult.data?.display_name || orgResult.data?.name || 'Organisation'),
    logoLightUrl,
    logoDarkUrl,
    logoHighContrastUrl: normalizeNullableText(brandingData?.logo_high_contrast_url) || logoDarkUrl,
    organisationLogoUrl: logoLightUrl,
    organisationLogoDarkUrl: logoDarkUrl,
    website,
    organisationWebsite: website,
    email,
    organisationEmail: email,
    physicalAddress,
    organisationPhysicalAddress: physicalAddress,
    telephone: phoneNumber,
    phoneNumber,
    organisationPhone: phoneNumber,
  }
}

export async function validateDocumentPacketPlaceholders({ packetType, placeholderPayload = {} } = {}) {
  const client = requireClient()
  const normalizedPacketType = assertPacketType(packetType)

  const { data, error } = await client
    .from('document_placeholder_registry')
    .select('placeholder_key, is_required_default, is_active')
    .eq('packet_type', normalizedPacketType)
    .eq('is_active', true)
  if (error) throw error

  const registry = data || []
  const providedKeys = new Set(Object.keys(placeholderPayload || {}))
  const requiredKeys = registry.filter((item) => item.is_required_default).map((item) => item.placeholder_key)
  const allowedKeys = registry.map((item) => item.placeholder_key)

  const missingRequired = requiredKeys.filter((key) => {
    if (!providedKeys.has(key)) return true
    const value = placeholderPayload[key]
    return value === null || value === undefined || value === ''
  })

  const unknownKeys = Array.from(providedKeys).filter((key) => !allowedKeys.includes(key))

  return {
    packetType: normalizedPacketType,
    requiredKeys,
    allowedKeys,
    missingRequired,
    unknownKeys,
    isValid: missingRequired.length === 0,
  }
}

async function fetchPacketForSigningContext(client, packetId, organisationId = null) {
  if (!packetId) throw new Error('packetId is required.')
  const context = await resolvePacketContext(client, { organisationId })
  const { data: packet, error } = await client
    .from('document_packets')
    .select(
      'id, organisation_id, packet_type, status, current_version_number, assigned_agent_id, created_by, source_context_json',
    )
    .eq('id', packetId)
    .eq('organisation_id', context.organisationId)
    .maybeSingle()
  if (error) throw error
  if (!packet) throw new Error('Document packet not found.')
  return { context, packet }
}

async function assertPacketVersionBelongsToPacket(client, packetId, packetVersionId) {
  if (!packetVersionId) throw new Error('packetVersionId is required.')
  const { data, error } = await client
    .from('document_packet_versions')
    .select('id, packet_id, organisation_id, version_number, render_status, rendered_document_id, rendered_file_path, placeholders_resolved_json, validation_summary_json')
    .eq('id', packetVersionId)
    .eq('packet_id', packetId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Packet version not found for this packet.')
  return data
}

export async function listDocumentPacketSigners({ packetId, packetVersionId = null, organisationId = null } = {}) {
  const client = requireClient()
  const { packet } = await fetchPacketForSigningContext(client, packetId, organisationId)

  let query = client
    .from('document_packet_signers')
    .select(
      'id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, signing_token, token_expires_at, token_used_at, viewed_at, signed_at, created_at, updated_at',
    )
    .eq('packet_id', packet.id)
    .order('signing_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (packetVersionId) query = query.eq('packet_version_id', packetVersionId)
  const { data, error } = await query
  if (error) {
    if (isMissingTableOrSchemaError(error)) return []
    throw error
  }
  return data || []
}

export async function listDocumentSigningFields({
  packetId,
  packetVersionId = null,
  signerRole = null,
  organisationId = null,
} = {}) {
  const client = requireClient()
  const { packet } = await fetchPacketForSigningContext(client, packetId, organisationId)

  let query = client
    .from('document_signing_fields')
    .select(
      'id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, field_type, page_number, x_position, y_position, width, height, required, status, completed_at, completed_by_email, signature_asset_path, signature_asset_url, signature_type, field_value_text, created_at, updated_at',
    )
    .eq('packet_id', packet.id)
    .order('page_number', { ascending: true })
    .order('created_at', { ascending: true })
  if (packetVersionId) query = query.eq('packet_version_id', packetVersionId)
  if (signerRole) query = query.eq('signer_role', assertSignerRole(signerRole))

  const { data, error } = await query
  if (error) {
    if (isMissingTableOrSchemaError(error)) return []
    throw error
  }
  return data || []
}

export async function createDocumentPacketSigners({
  packetId,
  packetVersionId,
  packetDocumentId = null,
  signers = [],
  organisationId = null,
  markSigningPrep = true,
} = {}) {
  const client = requireClient()
  const { packet, context } = await fetchPacketForSigningContext(client, packetId, organisationId)
  if (!canManagePacketSigning(context, packet)) {
    throw new Error('Only the assigned agent, packet creator, or an organisation admin can manage packet signers.')
  }
  assertPacketCanPrepareSigning(packet)

  const version = await assertPacketVersionBelongsToPacket(client, packet.id, packetVersionId)
  const items = Array.isArray(signers) ? signers : []
  if (!items.length) return []

  const payload = items.map((item, index) => ({
    organisation_id: packet.organisation_id,
    packet_id: packet.id,
    packet_document_id: normalizeNullableUuid(item?.packetDocumentId || packetDocumentId || version?.rendered_document_id),
    packet_version_id: version.id,
    signer_role: assertSignerRole(item?.signerRole),
    signer_name: normalizeText(item?.signerName),
    signer_email: normalizeText(item?.signerEmail).toLowerCase(),
    signing_order: normalizeOptionalNumber(item?.signingOrder ?? index + 1),
    status: item?.status ? assertPacketSignerStatus(item.status) : 'pending',
  }))

  if (payload.some((item) => !item.signer_name || !item.signer_email)) {
    throw new Error('Each signer must include signerName and signerEmail.')
  }

  const signerSelect =
    'id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, signing_token, token_expires_at, token_used_at, viewed_at, signed_at, created_at, updated_at'
  const roles = [...new Set(payload.map((item) => item.signer_role))]
  const existingResult = await client
    .from('document_packet_signers')
    .select(signerSelect)
    .eq('packet_id', packet.id)
    .eq('packet_version_id', version.id)
    .in('signer_role', roles)
    .order('signing_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (existingResult.error && !isMissingTableOrSchemaError(existingResult.error)) throw existingResult.error

  const existingRows = Array.isArray(existingResult.data) ? existingResult.data : []
  const savedRows = []
  for (const signerPayload of payload) {
    const normalizedEmail = normalizeText(signerPayload.signer_email).toLowerCase()
    const sameRoleRows = existingRows.filter((row) => row.signer_role === signerPayload.signer_role)
    const reusableRoleRows = sameRoleRows.filter((row) =>
      !['signed', 'declined'].includes(normalizeText(row.status).toLowerCase()),
    )
    const reusableRow =
      reusableRoleRows.find((row) => normalizeText(row.signer_email).toLowerCase() === normalizedEmail) ||
      reusableRoleRows[0] ||
      null

    if (reusableRow?.id) {
      const { data, error } = await client
        .from('document_packet_signers')
        .update(signerPayload)
        .eq('id', reusableRow.id)
        .select(signerSelect)
        .single()
      if (error) throw error
      savedRows.push(data)
    } else {
      const { data, error } = await client
        .from('document_packet_signers')
        .insert(signerPayload)
        .select(signerSelect)
        .single()
      if (error) throw error
      savedRows.push(data)
    }
  }

  const savedIds = new Set(savedRows.map((row) => normalizeText(row?.id)).filter(Boolean))
  const staleSignerIds = existingRows
    .filter((row) =>
      roles.includes(row?.signer_role) &&
      !savedIds.has(normalizeText(row?.id)) &&
      !['signed', 'declined'].includes(normalizeText(row?.status).toLowerCase()),
    )
    .map((row) => normalizeText(row?.id))
    .filter(Boolean)
  if (staleSignerIds.length) {
    const { error } = await client
      .from('document_packet_signers')
      .delete()
      .in('id', staleSignerIds)
    if (error && !isMissingTableOrSchemaError(error)) throw error
  }

  await Promise.all(savedRows.map((row) => updatePendingSigningFieldsForSigner(client, row)))

  if (normalizeBoolean(markSigningPrep, true)) {
    await promotePacketToSigningPrep(packet)
  }

  await appendDocumentPacketEvent({
    packetId: packet.id,
    organisationId: packet.organisation_id,
    versionId: version.id,
    eventType: 'signers_defined',
    eventPayload: {
      signerCount: savedRows.length,
      packetVersionId: version.id,
    },
  })

  return savedRows
}

export async function createDocumentSigningFields({
  packetId,
  packetVersionId,
  packetDocumentId = null,
  fields = [],
  organisationId = null,
  markSigningPrep = true,
} = {}) {
  const client = requireClient()
  const { packet, context } = await fetchPacketForSigningContext(client, packetId, organisationId)
  if (!canManagePacketSigning(context, packet)) {
    throw new Error('Only the assigned agent, packet creator, or an organisation admin can manage signing fields.')
  }
  assertPacketCanPrepareSigning(packet)

  const version = await assertPacketVersionBelongsToPacket(client, packet.id, packetVersionId)
  const items = Array.isArray(fields) ? fields : []
  if (!items.length) return []

  const payload = items.map((item) => ({
    organisation_id: packet.organisation_id,
    packet_id: packet.id,
    packet_document_id: normalizeNullableUuid(item?.packetDocumentId || packetDocumentId || version?.rendered_document_id),
    packet_version_id: version.id,
    signer_role: assertSignerRole(item?.signerRole),
    signer_name: normalizeNullableText(item?.signerName),
    signer_email: normalizeNullableText(item?.signerEmail ? String(item.signerEmail).toLowerCase() : null),
    field_type: assertSigningFieldType(item?.fieldType),
    page_number: normalizeOptionalNumber(item?.pageNumber),
    x_position: normalizeOptionalNumber(item?.xPosition),
    y_position: normalizeOptionalNumber(item?.yPosition),
    width: normalizeOptionalNumber(item?.width),
    height: normalizeOptionalNumber(item?.height),
    required: item?.required === undefined ? true : Boolean(item.required),
    status: item?.status ? assertSigningFieldStatus(item.status) : 'pending',
    completed_at: normalizeNullableText(item?.completedAt),
    completed_by_email: normalizeNullableText(item?.completedByEmail ? String(item.completedByEmail).toLowerCase() : null),
  }))

  if (
    payload.some(
      (item) =>
        !Number.isFinite(Number(item.page_number)) ||
        !Number.isFinite(Number(item.x_position)) ||
        !Number.isFinite(Number(item.y_position)) ||
        !Number.isFinite(Number(item.width)) ||
        !Number.isFinite(Number(item.height)),
    )
  ) {
    throw new Error('Each signing field must include pageNumber, xPosition, yPosition, width, and height.')
  }

  const { data, error } = await client
    .from('document_signing_fields')
    .insert(payload)
    .select(
      'id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, field_type, page_number, x_position, y_position, width, height, required, status, completed_at, completed_by_email, signature_asset_path, signature_asset_url, signature_type, field_value_text, created_at, updated_at',
    )
  if (error) throw error

  if (normalizeBoolean(markSigningPrep, true)) {
    await promotePacketToSigningPrep(packet)
  }

  await appendDocumentPacketEvent({
    packetId: packet.id,
    organisationId: packet.organisation_id,
    versionId: version.id,
    eventType: 'signing_fields_defined',
    eventPayload: {
      fieldCount: data?.length || 0,
      packetVersionId: version.id,
    },
  })

  return data || []
}

export async function updateDocumentSigningFieldStatus({
  fieldId,
  status,
  completedAt = null,
  completedByEmail = null,
} = {}) {
  const client = requireClient()
  if (!fieldId) throw new Error('fieldId is required.')
  const resolvedStatus = assertSigningFieldStatus(status || 'pending')

  const payload = {
    status: resolvedStatus,
    completed_at: resolvedStatus === 'completed' ? completedAt || new Date().toISOString() : null,
    completed_by_email:
      resolvedStatus === 'completed'
        ? normalizeNullableText(completedByEmail ? String(completedByEmail).toLowerCase() : null)
        : null,
  }

  const { data, error } = await client
    .from('document_signing_fields')
    .update(payload)
    .eq('id', fieldId)
    .select(
      'id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, field_type, page_number, x_position, y_position, width, height, required, status, completed_at, completed_by_email, signature_asset_path, signature_asset_url, signature_type, field_value_text, created_at, updated_at',
    )
    .single()
  if (error) throw error

  await appendDocumentPacketEvent({
    packetId: data.packet_id,
    organisationId: data.organisation_id || null,
    versionId: data.packet_version_id || null,
    eventType: 'signing_field_status_updated',
    eventPayload: {
      fieldId: data.id,
      signerRole: data.signer_role || null,
      fieldType: data.field_type || null,
      status: data.status || null,
      completedAt: data.completed_at || null,
    },
  })

  return data
}

export async function getDocumentPacketSigningSummary({ packetId, packetVersionId = null, organisationId = null } = {}) {
  const client = requireClient()
  const { packet } = await fetchPacketForSigningContext(client, packetId, organisationId)

  let fieldsQuery = client
    .from('document_signing_fields')
    .select(
      'id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, field_type, page_number, x_position, y_position, width, height, required, status, completed_at, completed_by_email, signature_asset_path, signature_asset_url, signature_type, field_value_text, created_at, updated_at',
    )
    .eq('packet_id', packet.id)
    .order('page_number', { ascending: true })
    .order('created_at', { ascending: true })
  if (packetVersionId) fieldsQuery = fieldsQuery.eq('packet_version_id', packetVersionId)

  let signersQuery = client
    .from('document_packet_signers')
    .select(
      'id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, signing_token, token_expires_at, token_used_at, viewed_at, signed_at, created_at, updated_at',
    )
    .eq('packet_id', packet.id)
    .order('signing_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (packetVersionId) signersQuery = signersQuery.eq('packet_version_id', packetVersionId)

  const [fieldsResult, signersResult] = await Promise.all([fieldsQuery, signersQuery])

  if (fieldsResult.error) {
    if (isMissingTableOrSchemaError(fieldsResult.error)) {
      fieldsResult.data = []
    } else {
      throw fieldsResult.error
    }
  }
  if (signersResult.error) {
    if (isMissingTableOrSchemaError(signersResult.error)) {
      signersResult.data = []
    } else {
      throw signersResult.error
    }
  }

  const rawFields = fieldsResult.data || []
  const rawSigners = signersResult.data || []
  const spouseFields = normalizeText(packet?.packet_type).toLowerCase() === 'mandate'
    ? rawFields.filter((field) => normalizeText(field?.signer_role || field?.signerRole).toLowerCase() === 'purchaser_2')
    : []
  const requiresSpouse = spouseFields.length
    ? resolveMandateSpouseRequirementFromFields(spouseFields)
    : resolveMandateSecondarySignerConfig({ packet }).required
  const fields = normalizeText(packet?.packet_type).toLowerCase() === 'mandate'
    ? filterMandateSigningRows(rawFields, { requiresSpouse })
    : rawFields
  const signers = normalizeText(packet?.packet_type).toLowerCase() === 'mandate'
    ? filterMandateSigningRows(rawSigners, { requiresSpouse })
    : rawSigners

  const groupedBySigner = fields.reduce((accumulator, field) => {
    const role = normalizeText(field?.signer_role || 'other') || 'other'
    if (!accumulator[role]) {
      accumulator[role] = {
        signerRole: role,
        total: 0,
        required: 0,
        initials: 0,
        signatures: 0,
        dates: 0,
        texts: 0,
      }
    }
    const target = accumulator[role]
    target.total += 1
    if (field?.required) target.required += 1
    if (field?.field_type === 'initial') target.initials += 1
    if (field?.field_type === 'signature') target.signatures += 1
    if (field?.field_type === 'date') target.dates += 1
    if (field?.field_type === 'text') target.texts += 1
    return accumulator
  }, {})

  const requiredInitials = fields.filter((field) => field.field_type === 'initial' && field.required).length
  const requiredSignatures = fields.filter((field) => field.field_type === 'signature' && field.required).length
  const requiredFieldCount = fields.filter((field) => field.required).length
  const completedRequiredFieldCount = fields.filter(
    (field) => field.required && normalizeText(field?.status).toLowerCase() === 'completed',
  ).length
  const allSignersSigned =
    signers.length > 0 &&
    signers.every((signer) => normalizeText(signer?.status).toLowerCase() === 'signed')
  const allRequiredFieldsCompleted = requiredFieldCount > 0 && completedRequiredFieldCount === requiredFieldCount

  return {
    signers,
    fields,
    signerCount: signers.length,
    fieldCount: fields.length,
    requiredInitials,
    requiredSignatures,
    requiredFieldCount,
    completedRequiredFieldCount,
    allSignersSigned,
    allRequiredFieldsCompleted,
    groupedBySigner: Object.values(groupedBySigner),
  }
}

export async function generateDocumentPacketSigningLinks({
  packetId,
  packetVersionId = null,
  expiresInHours = 72,
  baseUrl = '',
  organisationId = null,
  regenerate = false,
  targetSignerRole = '',
} = {}) {
  const client = requireClient()
  const signingContext = await fetchPacketForSigningContext(client, packetId, organisationId)
  let packet = signingContext.packet
  const context = signingContext.context
  if (!canManagePacketSigning(context, packet)) {
    throw new Error('Only the assigned agent, packet creator, or an organisation admin can generate signing links.')
  }
  if (!regenerate) {
    assertPacketCanPrepareSigning(packet)
  }

  const targetVersion = packetVersionId
    ? await assertPacketVersionBelongsToPacket(client, packet.id, packetVersionId)
    : await (async () => {
        const { data, error } = await client
          .from('document_packet_versions')
          .select('id, packet_id, organisation_id, version_number, render_status, rendered_document_id, rendered_file_path, placeholders_resolved_json, validation_summary_json')
          .eq('packet_id', packet.id)
          .eq('render_status', 'generated')
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) throw error
        if (!data) throw new Error('No generated packet version found for signer links.')
        return data
      })()

  if (normalizeText(targetVersion?.render_status).toLowerCase() !== 'generated') {
    const versionError = new Error('The selected packet version is not a generated signing version.')
    versionError.code = 'NO_GENERATED_VERSION'
    throw versionError
  }
  if (!regenerate && ['draft', 'ready_for_generation', 'generated'].includes(normalizeText(packet?.status).toLowerCase())) {
    packet = await promotePacketToSigningPrep(packet)
  }
  const signers = await listDocumentPacketSigners({
    packetId: packet.id,
    packetVersionId: targetVersion.id,
    organisationId: packet.organisation_id,
  })
  if (!signers.length) {
    throw new Error('No signers found. Prepare signing fields first.')
  }
  const isMandatePacket = normalizeText(packet.packet_type).toLowerCase() === 'mandate'
  const signingFields = await listDocumentSigningFields({
    packetId: packet.id,
    packetVersionId: targetVersion.id,
    organisationId: packet.organisation_id,
  })
  assertSigningEnvelopeReady({ packet, version: targetVersion, signers, fields: signingFields })
  const dispatchAuthorization = await authorizeAppliedEnvelopeDispatch({
    packetId: packet.id,
    versionId: targetVersion.id,
    regenerate,
    targetSignerRole,
  })
  const spouseFields = signingFields.filter((field) => normalizeText(field?.signer_role || field?.signerRole).toLowerCase() === 'purchaser_2')
  const mandateSecondarySigner = isMandatePacket
    ? resolveMandateSecondarySignerConfig({ packet })
    : null
  const mandateSpouseRequired = isMandatePacket && (
    spouseFields.length
      ? resolveMandateSpouseRequirementFromFields(spouseFields)
      : Boolean(mandateSecondarySigner?.required)
  )
  const relevantSigners = isMandatePacket
    ? signers.filter((signer) => {
        const role = normalizeText(signer?.signer_role).toLowerCase()
        if (role === 'agent' || role === 'seller') return true
        if (role === 'purchaser_2') return mandateSpouseRequired
        return false
      })
    : signers
  const activeSigners = relevantSigners.filter((signer) => normalizeText(signer?.status).toLowerCase() !== 'signed')
  if (!activeSigners.length) {
    throw new Error('All configured signers have already completed signing for this packet version.')
  }
  const normalizedTargetSignerRole = normalizeText(targetSignerRole).toLowerCase()
  const signedMandateAgent = isMandatePacket
    ? signers.find((signer) =>
        normalizeText(signer?.signer_role).toLowerCase() === 'agent' &&
        normalizeText(signer?.status).toLowerCase() === 'signed',
      )
    : null
  const currentMandateSigner = isMandatePacket
    ? activeSigners
        .slice()
        .sort((a, b) => (normalizeOptionalNumber(a?.signing_order) || 999) - (normalizeOptionalNumber(b?.signing_order) || 999))[0]
    : null
  const targetedMandateSigner = isMandatePacket && normalizedTargetSignerRole
    ? activeSigners.find((signer) => normalizeText(signer?.signer_role).toLowerCase() === normalizedTargetSignerRole) || null
    : null

  if (isMandatePacket && normalizedTargetSignerRole) {
    const packetSourceContext = packet?.source_context_json && typeof packet.source_context_json === 'object' ? packet.source_context_json : {}
    const roleLabels = packetSourceContext?.mandateType === 'developer_agent_mandate' || packetSourceContext?.contextType === 'developer_agent_mandate'
      ? { agent: 'Selling Agent', seller: 'Developer' }
      : {}
    const targetRoleLabel = getMandateSignerRoleLabel(normalizedTargetSignerRole, {
      secondarySignerLabel: mandateSecondarySigner?.label || 'Co-signer',
      roleLabels,
    })
    if (!targetedMandateSigner) {
      throw new Error(`${targetRoleLabel} has already completed signing or is not configured.`)
    }
    if (normalizedTargetSignerRole !== 'agent' && !signedMandateAgent) {
      throw new Error('The agent must sign the mandate before seller-side signing links can be sent.')
    }
  }

  const expiryHours = Math.min(168, Math.max(1, Number(expiresInHours) || 72))
  const issuedAt = new Date().toISOString()
  const expiresAt = new Date(Date.parse(issuedAt) + expiryHours * 60 * 60 * 1000).toISOString()
  const normalizedBaseUrl = normalizeText(baseUrl).replace(/\/$/, '') || (typeof window !== 'undefined' ? window.location.origin : '')

  const signersToUpdate = normalizedTargetSignerRole
    ? signers.filter((signer) => normalizeText(signer?.signer_role).toLowerCase() === normalizedTargetSignerRole)
    : signers
  const updates = normalizedTargetSignerRole
    ? signers
        .filter((signer) => normalizeText(signer?.signer_role).toLowerCase() !== normalizedTargetSignerRole)
        .map((signer) => ({
          ...signer,
          signing_link: null,
        }))
    : []

  for (const signer of signersToUpdate) {
    const signerStatus = normalizeText(signer?.status).toLowerCase()
    const isCompletedSigner = signerStatus === 'signed'
    if (isCompletedSigner) {
      updates.push({
        ...signer,
        signing_link: null,
      })
      continue
    }
    const signerRole = normalizeText(signer?.signer_role).toLowerCase()
    const isTargetedSigner = normalizedTargetSignerRole && signerRole === normalizedTargetSignerRole
    const isCurrentMandateSigner = !isMandatePacket || normalizeText(signer?.id) === normalizeText((targetedMandateSigner || currentMandateSigner)?.id)
    if (normalizedTargetSignerRole && !isTargetedSigner) {
      updates.push({
        ...signer,
        signing_link: null,
      })
      continue
    }
    if (!normalizedTargetSignerRole && !isCurrentMandateSigner) {
      const { data, error } = await client
        .from('document_packet_signers')
        .update({
          signing_token: null,
          token_expires_at: null,
          status: 'ready_to_send',
        })
        .eq('id', signer.id)
        .select(
          'id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, signing_token, token_expires_at, token_used_at, viewed_at, signed_at, created_at, updated_at',
        )
        .single()
      if (error) throw error
      updates.push({
        ...data,
        signing_link: null,
      })
      continue
    }
    const existingToken = normalizeText(signer?.signing_token)
    const existingExpired = !Number.isFinite(Date.parse(signer?.token_expires_at || '')) || Date.parse(signer.token_expires_at) <= Date.now()
    const shouldRefresh = regenerate || !existingToken || existingExpired || Boolean(signer?.token_used_at)
    const nextToken = shouldRefresh ? generateSecureSigningToken() : existingToken

    const { data, error } = await client
      .from('document_packet_signers')
      .update({
        signing_token: nextToken,
        token_expires_at: expiresAt,
        token_used_at: shouldRefresh ? null : signer?.token_used_at || null,
        viewed_at: shouldRefresh ? null : signer?.viewed_at || null,
        status: ['signed', 'declined'].includes(normalizeText(signer?.status).toLowerCase()) ? signer.status : 'sent',
      })
      .eq('id', signer.id)
      .select(
        'id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, signing_token, token_expires_at, token_used_at, viewed_at, signed_at, created_at, updated_at',
      )
      .single()
    if (error) throw error

    updates.push({
      ...data,
      signing_link: data?.signing_token && normalizedBaseUrl ? `${normalizedBaseUrl}/sign/${data.signing_token}` : null,
    })
  }

  const dispatchAssessment = assertSigningDispatchReady({ packet, version: targetVersion, signers: updates, fields: signingFields, issuedAt })
  const dispatchReference = `signing-dispatch:${packet.id}:${targetVersion.id}:${issuedAt}`

  await appendDocumentPacketEvent({
    packetId: packet.id,
    organisationId: packet.organisation_id,
    versionId: targetVersion.id,
    eventType: 'signer_links_generated',
    eventPayload: {
      signerCount: updates.filter((item) => normalizeText(item?.signing_link)).length,
      packetVersionId: targetVersion.id,
      expiresAt,
      regenerate: Boolean(regenerate),
      targetSignerRole: normalizedTargetSignerRole || null,
      dispatchReference,
      issuedAt,
      activeSignerRoles: dispatchAssessment.activeSignerRoles,
    },
  })

  const nowIso = new Date().toISOString()
  const sourceContext = packet.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : {}
  const linkSigner = updates.find((item) => normalizeText(item?.signing_link)) || null
  const linkSignerRole = normalizeText(linkSigner?.signer_role).toLowerCase()
  const signingStatus = isMandatePacket
    ? (linkSignerRole === 'agent' ? 'sent_to_agent' : linkSignerRole === 'seller' ? 'sent_to_seller' : 'sent_for_signature')
    : 'sent_for_signature'
  await transitionDocumentPacketLifecycle({
    packetId: packet.id,
    nextState: 'sent',
    versionId: targetVersion.id,
    sourceContextPatch: {
      signing_method: sourceContext.signing_method || 'digital',
      signingMethod: sourceContext.signingMethod || 'digital',
      signing_status: signingStatus,
      signingStatus: signingStatus,
      mandateStatus: signingStatus,
      signingLinkLastSentAt: nowIso,
      signingLinkResentAt: regenerate ? nowIso : sourceContext.signingLinkResentAt || null,
      signerCount: updates.filter((item) => normalizeText(item?.signing_link)).length,
      lastSigningRecipientRole: linkSignerRole || sourceContext.lastSigningRecipientRole || null,
    },
    eventPayload: {
      signingStatus,
      dispatchReference,
      regenerate: Boolean(regenerate),
    },
  })

  return {
    packetId: packet.id,
    packetVersionId: targetVersion.id,
    expiresAt,
    targetSignerRole: normalizedTargetSignerRole || linkSignerRole || null,
    signingStatus,
    dispatchReference,
    dispatchId: dispatchAuthorization.dispatchId,
    dispatchAlreadyDelivered: dispatchAuthorization.alreadyDelivered === true,
    appliedLayoutId: dispatchAuthorization.layoutId,
    appliedLayoutRevision: dispatchAuthorization.layoutRevision,
    issuedAt,
    signers: updates,
  }
}

export async function generateFinalSignedDocument({
  packetId,
  packetVersionId = null,
  outputBucket = '',
  organisationId = null,
} = {}) {
  const client = requireClient()
  const { packet, context } = await fetchPacketForSigningContext(client, packetId, organisationId)
  if (!canManagePacketSigning(context, packet)) {
    throw new Error('Only the assigned agent, packet creator, or an organisation admin can generate final signed documents.')
  }

  const payload = {
    packetId: packet.id,
    packetVersionId: normalizeNullableText(packetVersionId),
    finalisedBy: context.user.id,
    outputBucket: normalizeNullableText(outputBucket),
  }

  const finaliserFunction = normalizeText(packet.packet_type).toLowerCase() === 'otp'
    ? 'generate-final-signed-otp'
    : 'generate-final-signed-document'
  const invocation = await client.functions.invoke(finaliserFunction, { body: payload })
  if (invocation.error) {
    const edgeError = new Error(
      normalizeText(invocation.error?.message) || 'Unable to generate final signed document right now.',
    )
    edgeError.code = 'FINAL_SIGNED_GENERATION_FAILED'
    throw edgeError
  }

  const response = invocation.data
  if (!response || response.success === false) {
    const edgeError = new Error(
      normalizeText(response?.error || response?.message) || 'Unable to generate final signed document right now.',
    )
    edgeError.code = normalizeText(response?.errorCode) || 'FINAL_SIGNED_GENERATION_FAILED'
    edgeError.details = response || null
    throw edgeError
  }

  const versionId = normalizeText(response?.packetVersionId || packetVersionId)
  const packetVersion = versionId ? await listDocumentPacketVersions(packet.id).then((items) => items.find((item) => item.id === versionId) || null) : null
  const finalArtifactPath = normalizeText(response?.finalArtifact?.path || packetVersion?.final_signed_file_path)
  if (!finalArtifactPath) {
    const artifactError = new Error('Final signed artifact path is missing after finalization.')
    artifactError.code = 'FINAL_SIGNED_ARTIFACT_MISSING'
    throw artifactError
  }

  await appendDocumentPacketEvent({
    packetId: packet.id,
    organisationId: packet.organisation_id || null,
    versionId: versionId || null,
    eventType: 'final_signed_generated',
    eventPayload: {
      packetVersionId: versionId || null,
      finalArtifactPath,
      sourceFormat: normalizeText(response?.sourceFormat || ''),
    },
  })

  await linkPacketVersionToCanonicalRequirementSafely(client, {
    packet,
    version: {
      ...(packetVersion || {}),
      id: versionId || packetVersion?.id || null,
    },
    actorUserId: context.user.id,
    metadata: {
      final_artifact_path: finalArtifactPath,
      source_format: normalizeText(response?.sourceFormat || ''),
    },
  })

  return {
    packetId: packet.id,
    packetVersionId: versionId || null,
    packetVersion,
    finalArtifact: response?.finalArtifact || null,
    sourceFormat: response?.sourceFormat || null,
    note: normalizeNullableText(response?.note),
  }
}

export async function checkDocumentConversionHealth() {
  const client = requireClient()
  const invocation = await client.functions.invoke('document-conversion-health', {
    method: 'GET',
  })

  if (invocation.error) {
    return {
      healthy: false,
      status: 'unreachable',
      message: normalizeText(invocation.error?.message) || 'Unable to reach conversion health check.',
      details: null,
    }
  }

  const payload = invocation.data || {}
  const status = normalizeText(payload?.status) || 'unknown_error'
  return {
    healthy: Boolean(payload?.healthy),
    status,
    message:
      normalizeText(payload?.message) ||
      (status === 'healthy' ? 'Document conversion available.' : 'Document conversion unavailable.'),
    details: payload?.details || null,
  }
}

export async function deleteDocumentSigningFields({
  packetId,
  packetVersionId = null,
  organisationId = null,
} = {}) {
  const client = requireClient()
  const { packet, context } = await fetchPacketForSigningContext(client, packetId, organisationId)
  if (!context.isOrgAdmin) {
    throw new Error('Only Principal/Super Admin/Admin can remove signing fields.')
  }

  let query = client.from('document_signing_fields').delete().eq('packet_id', packet.id)
  if (packetVersionId) query = query.eq('packet_version_id', packetVersionId)
  const { error, count } = await query
  if (error) {
    if (isMissingTableOrSchemaError(error)) return { deletedCount: 0 }
    throw error
  }
  return { deletedCount: Number(count || 0) }
}

export async function deleteDocumentPacketSigners({
  packetId,
  packetVersionId = null,
  organisationId = null,
} = {}) {
  const client = requireClient()
  const { packet, context } = await fetchPacketForSigningContext(client, packetId, organisationId)
  if (!context.isOrgAdmin) {
    throw new Error('Only Principal/Super Admin/Admin can remove packet signers.')
  }

  let query = client.from('document_packet_signers').delete().eq('packet_id', packet.id)
  if (packetVersionId) query = query.eq('packet_version_id', packetVersionId)
  const { error, count } = await query
  if (error) {
    if (isMissingTableOrSchemaError(error)) return { deletedCount: 0 }
    throw error
  }
  return { deletedCount: Number(count || 0) }
}

export async function upsertDocumentPlaceholderDefinition(input = {}) {
  const client = requireClient()
  const context = await resolvePacketContext(client, { organisationId: input.organisationId || null })
  if (!context.isOrgAdmin) {
    throw new Error('Only Principal/Super Admin/Admin can manage placeholder definitions.')
  }

  const payload = {
    packet_type: assertPacketType(input.packetType),
    placeholder_key: normalizeText(input.placeholderKey),
    entity_scope: normalizeText(input.entityScope || 'transaction'),
    data_type: normalizeText(input.dataType || 'text'),
    description: normalizeNullableText(input.description),
    normalization_rule: normalizeNullableText(input.normalizationRule),
    example_value: normalizeNullableText(input.exampleValue),
    is_required_default: Boolean(input.isRequiredDefault),
    is_active: input.isActive !== false,
  }

  if (!payload.placeholder_key) {
    throw new Error('placeholderKey is required.')
  }

  const { data, error } = await client
    .from('document_placeholder_registry')
    .upsert(payload, { onConflict: 'packet_type,placeholder_key' })
    .select(
      'id, packet_type, placeholder_key, entity_scope, data_type, description, normalization_rule, example_value, is_required_default, is_active, created_at, updated_at',
    )
    .single()
  if (error) throw error
  return data
}
