import { isOrganisationAdminMembershipRole, normalizeOrganisationMembershipRole } from './organisationAccess'
import { DOCUMENTS_BUCKET_CANDIDATES, supabase } from './supabaseClient'

export const DOCUMENT_PACKET_TYPES = ['otp', 'mandate', 'addendum', 'supporting_legal', 'custom']
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
  'seller',
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
  'id, packet_id, organisation_id, version_number, render_status, rendered_document_id, rendered_file_path, rendered_file_name, rendered_file_url, final_signed_file_path, final_signed_file_url, final_signed_file_bucket, final_signed_file_name, final_signed_document_id, finalised_at, finalised_by, placeholders_resolved_json, placeholders_missing_json, section_manifest_json, validation_summary_json, generated_by, generated_at, created_at, updated_at'

let organisationBrandingTableAvailable = true

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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(normalizeText(value))
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

function isStorageBucketMissingError(error) {
  const code = normalizeText(error?.code).toLowerCase()
  const message = normalizeText(error?.message).toLowerCase()
  return (
    code === 'bucket_not_found' ||
    (message.includes('bucket') && (message.includes('not found') || message.includes('does not exist')))
  )
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
    const renderedSignedUrl = await createSignedUrlAcrossBuckets(client, renderedPath, DOCUMENTS_BUCKET_CANDIDATES)
    hydrated.rendered_file_access_url = renderedSignedUrl?.signedUrl || normalizeNullableText(version?.rendered_file_url)
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
  if (typeof crypto?.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
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
  return {
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
}

async function getAuthenticatedUser(client) {
  const authResult = await client.auth.getUser()
  if (authResult.error) throw authResult.error
  if (!authResult.data?.user?.id) throw new Error('You must be signed in to access document packets.')
  return authResult.data.user
}

async function resolvePacketContext(client, { organisationId = null } = {}) {
  const user = await getAuthenticatedUser(client)
  const rawOrganisationId = normalizeText(organisationId)
  const scopedOrganisationId = normalizeNullableUuid(rawOrganisationId)
  let query = client
    .from('organisation_users')
    .select('id, organisation_id, role, status, user_id, email')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  if (scopedOrganisationId) {
    query = query.eq('organisation_id', scopedOrganisationId)
  } else if (rawOrganisationId) {
    console.debug('[PACKETS] Ignoring non-UUID organisation reference while resolving packet context.', {
      valueType: typeof organisationId,
    })
  }

  const { data, error } = await query.limit(1).maybeSingle()
  if (error) throw error
  if (!data?.organisation_id) {
    throw new Error('No active organisation membership found for this user.')
  }

  const membershipRole = normalizeOrganisationMembershipRole(data.role)
  return {
    user,
    organisationId: data.organisation_id,
    membershipRole,
    isOrgAdmin: isOrganisationAdminMembershipRole(membershipRole),
  }
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
  if (['signing_prep', 'sent', 'partially_signed', 'completed'].includes(status)) {
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
  const context = await resolvePacketContext(client, { organisationId })

  let query = client
    .from('document_packet_templates')
    .select(
      'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, template_storage_path, version_tag, description, is_default, is_active, metadata_json, created_by, created_at, updated_at',
    )
    .or(`organisation_id.eq.${context.organisationId},organisation_id.is.null`)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false })

  if (packetType) query = query.eq('packet_type', assertPacketType(packetType))
  if (moduleType) query = query.eq('module_type', normalizeText(moduleType).toLowerCase())
  if (!includeInactive) query = query.eq('is_active', true)
  if (Number.isFinite(Number(limit)) && Number(limit) > 0) query = query.limit(Number(limit))

  const { data, error } = await query
  if (error) throw error
  return (data || []).map((template) => hydrateTemplateRecord(template))
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
  templateKey = '',
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
  const safeTemplateKey = normalizeTemplateKey(templateKey || `${normalizedPacketType}_template`, normalizedPacketType)
  const objectPath = `legal-templates/${context.organisationId}/${normalizedPacketType}/${safeTemplateKey}/${Date.now()}-${normalizeStorageSafeName(selectedFile.name, `${normalizedPacketType}.docx`)}`

  let uploadedBucket = ''
  let lastError = null
  for (const bucketName of DOCUMENTS_BUCKET_CANDIDATES) {
    const { error } = await client.storage.from(bucketName).upload(objectPath, selectedFile, {
      upsert: true,
      cacheControl: '3600',
      contentType: selectedFile.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    if (!error) {
      uploadedBucket = bucketName
      lastError = null
      break
    }

    if (isStorageBucketMissingError(error)) {
      lastError = error
      continue
    }

    throw error
  }

  if (!uploadedBucket) {
    if (lastError) {
      throw new Error(
        `Unable to upload legal template. Checked buckets: ${DOCUMENTS_BUCKET_CANDIDATES.join(', ')}.`,
      )
    }
    throw new Error('Unable to upload legal template.')
  }

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
  }
}

export async function fetchDocumentPacketTemplate(templateId, { includeSections = true } = {}) {
  const client = requireClient()
  if (!templateId) throw new Error('templateId is required.')

  const { data: template, error: templateError } = await client
    .from('document_packet_templates')
    .select(
      'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, template_storage_path, version_tag, description, is_default, is_active, metadata_json, created_by, created_at, updated_at',
    )
    .eq('id', templateId)
    .maybeSingle()

  if (templateError) throw templateError
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

  return { ...hydrateTemplateRecord(template), sections }
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

  const payload = {
    organisation_id: context.organisationId,
    module_type: moduleType,
    packet_type: packetType,
    template_key: templateKey,
    template_label: templateLabel,
    template_format: templateFormat,
    template_storage_path: normalizeNullableText(input.templateStoragePath),
    version_tag: versionTag,
    description: normalizeNullableText(input.description),
    is_default: Boolean(input.isDefault),
    is_active: input.isActive === undefined ? true : Boolean(input.isActive),
    metadata_json: input.metadataJson && typeof input.metadataJson === 'object' ? input.metadataJson : {},
    created_by: context.user.id,
  }

  const { data, error } = await client
    .from('document_packet_templates')
    .insert(payload)
    .select(
      'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, template_storage_path, version_tag, description, is_default, is_active, metadata_json, created_by, created_at, updated_at',
    )
    .single()
  if (error) throw error

  const template = hydrateTemplateRecord(data)
  const sections = Array.isArray(input.sections) ? input.sections : []
  if (sections.length) {
    await replaceDocumentTemplateSections(template.id, sections, { organisationId: context.organisationId })
  }

  return fetchDocumentPacketTemplate(template.id, { includeSections: true })
}

export async function updateDocumentPacketTemplate(templateId, updates = {}) {
  const client = requireClient()
  if (!templateId) throw new Error('templateId is required.')
  const context = await resolvePacketContext(client, { organisationId: updates.organisationId || null })
  if (!context.isOrgAdmin) {
    throw new Error('Only Principal/Super Admin/Admin can update signing templates.')
  }

  const { data: existing, error: existingError } = await client
    .from('document_packet_templates')
    .select(
      'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, template_storage_path, version_tag, description, is_default, is_active, metadata_json, created_by, created_at, updated_at',
    )
    .eq('id', templateId)
    .maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw new Error('Template not found.')
  if (normalizeText(existing.organisation_id) !== normalizeText(context.organisationId)) {
    throw new Error('You can only edit templates owned by your organisation.')
  }

  const payload = {}
  if (updates.templateLabel !== undefined) payload.template_label = normalizeText(updates.templateLabel)
  if (updates.description !== undefined) payload.description = normalizeNullableText(updates.description)
  if (updates.isActive !== undefined) payload.is_active = Boolean(updates.isActive)
  if (updates.isDefault !== undefined) payload.is_default = Boolean(updates.isDefault)
  if (updates.templateStoragePath !== undefined) payload.template_storage_path = normalizeNullableText(updates.templateStoragePath)
  if (updates.templateFormat !== undefined) payload.template_format = normalizeText(updates.templateFormat).toLowerCase() || 'docx'
  if (updates.versionTag !== undefined) payload.version_tag = normalizeText(updates.versionTag) || existing.version_tag
  if (updates.metadataJson !== undefined) {
    payload.metadata_json =
      updates.metadataJson && typeof updates.metadataJson === 'object'
        ? updates.metadataJson
        : existing.metadata_json || {}
  }

  if (Object.keys(payload).length) {
    const { error } = await client
      .from('document_packet_templates')
      .update(payload)
      .eq('id', templateId)
    if (error) throw error
  }

  if (Array.isArray(updates.sections)) {
    await replaceDocumentTemplateSections(templateId, updates.sections, { organisationId: context.organisationId })
  }

  return fetchDocumentPacketTemplate(templateId, { includeSections: true })
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
    const { data, error } = await client
      .from('document_packet_versions')
      .select(PACKET_VERSION_SELECT)
      .eq('packet_id', packetId)
      .order('version_number', { ascending: false })
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

  const { data, error } = await client
    .from('document_packet_versions')
    .select(PACKET_VERSION_SELECT)
    .eq('packet_id', packetId)
    .order('version_number', { ascending: false })

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
  let uploadedBucket = ''
  let lastError = null

  for (const bucketName of FINAL_SIGNED_BUCKET_CANDIDATES) {
    const { error } = await client.storage.from(bucketName).upload(objectPath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/pdf',
    })
    if (!error) {
      uploadedBucket = bucketName
      break
    }
    if (isStorageBucketMissingError(error)) {
      lastError = error
      continue
    }
    throw error
  }

  if (!uploadedBucket) {
    throw lastError || new Error('Unable to upload final signed document.')
  }

  const signedResult = await client.storage.from(uploadedBucket).createSignedUrl(objectPath, 60 * 60 * 24 * 30)

  return {
    bucket: uploadedBucket,
    path: objectPath,
    fileName: file.name || safeName,
    signedUrl: normalizeText(signedResult?.data?.signedUrl) || null,
  }
}

async function getNextPacketVersionNumber(client, packetId) {
  const { data, error } = await client
    .from('document_packet_versions')
    .select('version_number')
    .eq('packet_id', packetId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const latest = normalizeOptionalNumber(data?.version_number) || 0
  return latest + 1
}

export async function createDocumentPacketVersion(input = {}) {
  const client = requireClient()
  if (!input.packetId) throw new Error('packetId is required.')

  const packet = await fetchDocumentPacket(input.packetId, { includeVersions: false, includeEvents: false })
  if (!packet) throw new Error('Document packet not found.')
  await assertPacketNotLockedForSigning(client, packet, { actionLabel: 'be regenerated' })

  const versionNumber = normalizeOptionalNumber(input.versionNumber) || (await getNextPacketVersionNumber(client, input.packetId))
  const resolvedRenderStatus = normalizeText(input.renderStatus || 'draft')

  const payload = {
    packet_id: packet.id,
    organisation_id: packet.organisation_id,
    version_number: versionNumber,
    render_status: resolvedRenderStatus,
    rendered_document_id: normalizeNullableUuid(input.renderedDocumentId),
    rendered_file_path: normalizeNullableText(input.renderedFilePath),
    rendered_file_name: normalizeNullableText(input.renderedFileName),
    rendered_file_url: normalizeNullableText(input.renderedFileUrl),
    placeholders_resolved_json:
      input.placeholdersResolvedJson && typeof input.placeholdersResolvedJson === 'object' ? input.placeholdersResolvedJson : {},
    placeholders_missing_json: Array.isArray(input.placeholdersMissingJson) ? input.placeholdersMissingJson : [],
    section_manifest_json: Array.isArray(input.sectionManifestJson) ? input.sectionManifestJson : [],
    validation_summary_json:
      input.validationSummaryJson && typeof input.validationSummaryJson === 'object' ? input.validationSummaryJson : {},
    generated_by: normalizeNullableUuid(input.generatedBy),
    generated_at: input.generatedAt || new Date().toISOString(),
  }

  const { data, error } = await client
    .from('document_packet_versions')
    .insert(payload)
    .select(PACKET_VERSION_SELECT)
    .single()
  if (error) throw error

  const { error: packetUpdateError } = await client
    .from('document_packets')
    .update({ current_version_number: versionNumber })
    .eq('id', packet.id)
  if (packetUpdateError) throw packetUpdateError

  await appendDocumentPacketEvent({
    packetId: packet.id,
    organisationId: packet.organisation_id,
    versionId: data.id,
    eventType: 'version_created',
    eventPayload: {
      versionNumber,
      renderStatus: resolvedRenderStatus,
      renderedDocumentId: data.rendered_document_id,
    },
  })

  return hydratePacketVersionAccessUrls(client, data)
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
  if (!resolvedPacketId) throw new Error('A saved document packet is required before logging packet activity.')
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

export async function archiveDocumentPacket(packetId, { reason = '' } = {}) {
  if (!packetId) throw new Error('packetId is required.')

  const archivedAt = new Date().toISOString()
  const packet = await updateDocumentPacket(packetId, {
    status: 'archived',
    archivedAt,
  })

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

  const orgResult = await client
    .from('organisations')
    .select('id, name, display_name')
    .eq('id', context.organisationId)
    .maybeSingle()
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

  return {
    organisationId: context.organisationId,
    organisationName: normalizeText(orgResult.data?.display_name || orgResult.data?.name || 'Bridge Workspace'),
    logoLightUrl: normalizeNullableText(brandingData?.logo_light_url),
    logoDarkUrl: normalizeNullableText(brandingData?.logo_dark_url),
    bridgeLegalName: 'Bridge Legal',
    bridgeLogoLabel: 'Powered by Bridge 9',
    bridgeLogoLightUrl: '/brand/bridge_9_white_background.png',
    bridgeLogoDarkUrl: '/brand/bridge_9_dark_background.png',
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
    .select('id, packet_id, organisation_id, version_number, rendered_document_id')
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
  const [fields, signers] = await Promise.all([
    listDocumentSigningFields({ packetId, packetVersionId, organisationId }),
    listDocumentPacketSigners({ packetId, packetVersionId, organisationId }),
  ])

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
} = {}) {
  const client = requireClient()
  const { packet, context } = await fetchPacketForSigningContext(client, packetId, organisationId)
  if (!canManagePacketSigning(context, packet)) {
    throw new Error('Only the assigned agent, packet creator, or an organisation admin can generate signing links.')
  }
  assertPacketCanPrepareSigning(packet)

  const targetVersion = packetVersionId
    ? await assertPacketVersionBelongsToPacket(client, packet.id, packetVersionId)
    : await (async () => {
        const { data, error } = await client
          .from('document_packet_versions')
          .select('id, packet_id, organisation_id, version_number')
          .eq('packet_id', packet.id)
          .eq('render_status', 'generated')
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) throw error
        if (!data) throw new Error('No generated packet version found for signer links.')
        return data
      })()

  const signers = await listDocumentPacketSigners({
    packetId: packet.id,
    packetVersionId: targetVersion.id,
    organisationId: packet.organisation_id,
  })
  if (!signers.length) {
    throw new Error('No signers found. Prepare signing fields first.')
  }
  const activeSigners = signers.filter((signer) => normalizeText(signer?.status).toLowerCase() !== 'signed')
  if (!activeSigners.length) {
    throw new Error('All configured signers have already completed signing for this packet version.')
  }

  const expiryHours = Math.min(168, Math.max(1, Number(expiresInHours) || 72))
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString()
  const normalizedBaseUrl = normalizeText(baseUrl).replace(/\/$/, '') || (typeof window !== 'undefined' ? window.location.origin : '')

  const updates = []
  for (const signer of signers) {
    const signerStatus = normalizeText(signer?.status).toLowerCase()
    const isCompletedSigner = signerStatus === 'signed'
    if (isCompletedSigner) {
      updates.push({
        ...signer,
        signing_link: null,
      })
      continue
    }
    const existingToken = normalizeText(signer?.signing_token)
    const shouldRefresh = regenerate || !existingToken
    const nextToken = shouldRefresh ? generateSecureSigningToken() : existingToken

    const { data, error } = await client
      .from('document_packet_signers')
      .update({
        signing_token: nextToken,
        token_expires_at: expiresAt,
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

  await appendDocumentPacketEvent({
    packetId: packet.id,
    organisationId: packet.organisation_id,
    versionId: targetVersion.id,
    eventType: 'signer_links_generated',
    eventPayload: {
      signerCount: updates.length,
      packetVersionId: targetVersion.id,
      expiresAt,
      regenerate: Boolean(regenerate),
    },
  })

  const nowIso = new Date().toISOString()
  const sourceContext = packet.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : {}
  const packetUpdate = {
    status: 'sent',
    sent_at: packet.status === 'sent' ? undefined : nowIso,
    source_context_json: {
      ...sourceContext,
      signing_method: sourceContext.signing_method || 'digital',
      signingMethod: sourceContext.signingMethod || 'digital',
      signing_status: 'sent_for_signature',
      signingStatus: 'sent_for_signature',
      mandateStatus: 'sent_for_signature',
      signingLinkLastSentAt: nowIso,
      signingLinkResentAt: regenerate ? nowIso : sourceContext.signingLinkResentAt || null,
      signerCount: updates.filter((item) => normalizeText(item?.signing_link)).length,
    },
  }
  Object.keys(packetUpdate).forEach((key) => {
    if (packetUpdate[key] === undefined) delete packetUpdate[key]
  })
  const { error: packetUpdateError } = await client
    .from('document_packets')
    .update(packetUpdate)
    .eq('id', packet.id)
  if (packetUpdateError) throw packetUpdateError

  return {
    packetId: packet.id,
    packetVersionId: targetVersion.id,
    expiresAt,
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

  const invocation = await client.functions.invoke('generate-final-signed-document', { body: payload })
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
