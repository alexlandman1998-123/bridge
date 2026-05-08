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

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNullableText(value) {
  const text = normalizeText(value)
  return text || null
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isMissingTableOrSchemaError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  return code === '42P01' || code === 'PGRST205'
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
  let query = client
    .from('organisation_users')
    .select('id, organisation_id, role, status, user_id, email')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  if (organisationId) {
    query = query.eq('organisation_id', organisationId)
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

export async function listDocumentPacketTemplates({
  packetType = null,
  moduleType = null,
  includeInactive = false,
  organisationId = null,
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

  const { data, error } = await query
  if (error) throw error
  return (data || []).map((template) => hydrateTemplateRecord(template))
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

export async function createDocumentPacket(input = {}) {
  const client = requireClient()
  const context = await resolvePacketContext(client, { organisationId: input.organisationId || null })
  const packetType = assertPacketType(input.packetType)

  const payload = {
    organisation_id: context.organisationId,
    packet_type: packetType,
    title: normalizeNullableText(input.title),
    status: normalizeText(input.status || 'draft'),
    template_id: normalizeNullableText(input.templateId),
    template_key_snapshot: normalizeNullableText(input.templateKeySnapshot),
    template_label_snapshot: normalizeNullableText(input.templateLabelSnapshot),
    transaction_id: normalizeNullableText(input.transactionId),
    lead_id: normalizeNullableText(input.leadId),
    contact_id: normalizeNullableText(input.contactId),
    deal_id: normalizeNullableText(input.dealId),
    unit_id: normalizeNullableText(input.unitId),
    assigned_agent_id: normalizeNullableText(input.assignedAgentId) || context.user.id,
    created_by: context.user.id,
    source_context_json: input.sourceContextJson && typeof input.sourceContextJson === 'object' ? input.sourceContextJson : {},
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
  if (error) throw error

  await appendDocumentPacketEvent({
    packetId: data.id,
    organisationId: context.organisationId,
    eventType: 'packet_created',
    eventPayload: {
      packetType: data.packet_type,
      templateId: data.template_id,
    },
  })

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

  const mutatesPacketContent =
    updates.title !== undefined ||
    updates.templateId !== undefined ||
    updates.sourceContextJson !== undefined ||
    updates.brandingSnapshotJson !== undefined
  if (mutatesPacketContent) {
    await assertPacketNotLockedForSigning(client, existingPacket, { actionLabel: 'be edited' })
  }

  const payload = {}
  if (updates.title !== undefined) payload.title = normalizeNullableText(updates.title)
  if (updates.status !== undefined) payload.status = normalizeText(updates.status)
  if (updates.templateId !== undefined) payload.template_id = normalizeNullableText(updates.templateId)
  if (updates.assignedAgentId !== undefined) payload.assigned_agent_id = normalizeNullableText(updates.assignedAgentId)
  if (updates.sourceContextJson !== undefined) payload.source_context_json = updates.sourceContextJson || {}
  if (updates.brandingSnapshotJson !== undefined) payload.branding_snapshot_json = updates.brandingSnapshotJson || {}
  if (updates.sentAt !== undefined) payload.sent_at = updates.sentAt
  if (updates.completedAt !== undefined) payload.completed_at = updates.completedAt
  if (updates.archivedAt !== undefined) payload.archived_at = updates.archivedAt

  const { data, error } = await client
    .from('document_packets')
    .update(payload)
    .eq('id', packetId)
    .select(
      'id, organisation_id, packet_type, title, status, template_id, template_key_snapshot, template_label_snapshot, transaction_id, lead_id, contact_id, deal_id, unit_id, assigned_agent_id, created_by, current_version_number, source_context_json, branding_snapshot_json, sent_at, completed_at, archived_at, created_at, updated_at',
    )
    .single()
  if (error) throw error

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
  let query = client
    .from('document_packets')
    .select(
      'id, organisation_id, packet_type, title, status, template_id, template_key_snapshot, template_label_snapshot, transaction_id, lead_id, contact_id, deal_id, unit_id, assigned_agent_id, created_by, current_version_number, source_context_json, branding_snapshot_json, sent_at, completed_at, archived_at, created_at, updated_at',
    )
    .eq('organisation_id', context.organisationId)
    .order('updated_at', { ascending: false })

  if (packetType) query = query.eq('packet_type', assertPacketType(packetType))
  if (status) query = query.eq('status', normalizeText(status))
  if (assignedAgentId) query = query.eq('assigned_agent_id', assignedAgentId)
  if (transactionId) query = query.eq('transaction_id', transactionId)
  if (leadId) query = query.eq('lead_id', leadId)
  if (resolvedLimit && resolvedLimit > 0) query = query.limit(resolvedLimit)

  const { data, error } = await query
  if (error) throw error
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

  if (packetError) throw packetError
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
    rendered_document_id: normalizeNullableText(input.renderedDocumentId),
    rendered_file_path: normalizeNullableText(input.renderedFilePath),
    rendered_file_name: normalizeNullableText(input.renderedFileName),
    rendered_file_url: normalizeNullableText(input.renderedFileUrl),
    placeholders_resolved_json:
      input.placeholdersResolvedJson && typeof input.placeholdersResolvedJson === 'object' ? input.placeholdersResolvedJson : {},
    placeholders_missing_json: Array.isArray(input.placeholdersMissingJson) ? input.placeholdersMissingJson : [],
    section_manifest_json: Array.isArray(input.sectionManifestJson) ? input.sectionManifestJson : [],
    validation_summary_json:
      input.validationSummaryJson && typeof input.validationSummaryJson === 'object' ? input.validationSummaryJson : {},
    generated_by: normalizeNullableText(input.generatedBy) || null,
    generated_at: input.generatedAt || new Date().toISOString(),
  }

  const { data, error } = await client
    .from('document_packet_versions')
    .insert(payload)
    .select(PACKET_VERSION_SELECT)
    .single()
  if (error) throw error

  await client.from('document_packets').update({ current_version_number: versionNumber }).eq('id', packet.id)

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
  if (!packetId) throw new Error('packetId is required.')
  if (!normalizeText(eventType)) throw new Error('eventType is required.')

  const context = await resolvePacketContext(client, { organisationId })

  const { data, error } = await client
    .from('document_packet_events')
    .insert({
      packet_id: packetId,
      organisation_id: context.organisationId,
      version_id: normalizeNullableText(versionId),
      event_type: normalizeText(eventType),
      event_payload_json: eventPayload && typeof eventPayload === 'object' ? eventPayload : {},
      created_by: context.user.id,
    })
    .select('id, packet_id, organisation_id, version_id, event_type, event_payload_json, created_by, created_at')
    .single()
  if (error) throw error
  return data
}

export async function archiveDocumentPacket(packetId, { reason = '' } = {}) {
  const client = requireClient()
  if (!packetId) throw new Error('packetId is required.')

  const archivedAt = new Date().toISOString()
  const packet = await updateDocumentPacket(packetId, {
    status: 'archived',
    archivedAt,
  })

  await appendDocumentPacketEvent({
    packetId,
    organisationId: packet?.organisation_id || null,
    eventType: 'packet_archived',
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

  const [orgResult, brandingResult] = await Promise.all([
    client
      .from('organisations')
      .select('id, name, display_name')
      .eq('id', context.organisationId)
      .maybeSingle(),
    client
      .from('organisation_branding')
      .select('organisation_id, logo_light_url, logo_dark_url')
      .eq('organisation_id', context.organisationId)
      .maybeSingle(),
  ])

  if (orgResult.error) throw orgResult.error
  if (brandingResult.error) throw brandingResult.error

  return {
    organisationId: context.organisationId,
    organisationName: normalizeText(orgResult.data?.display_name || orgResult.data?.name || 'Bridge Workspace'),
    logoLightUrl: normalizeNullableText(brandingResult.data?.logo_light_url),
    logoDarkUrl: normalizeNullableText(brandingResult.data?.logo_dark_url),
    bridgeLogoLabel: 'bridge.',
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
      'id, organisation_id, packet_type, status, current_version_number, assigned_agent_id, created_by',
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
  if (!context.isOrgAdmin) {
    throw new Error('Only Principal/Super Admin/Admin can manage packet signers.')
  }
  assertPacketCanPrepareSigning(packet)

  const version = await assertPacketVersionBelongsToPacket(client, packet.id, packetVersionId)
  const items = Array.isArray(signers) ? signers : []
  if (!items.length) return []

  const payload = items.map((item, index) => ({
    organisation_id: packet.organisation_id,
    packet_id: packet.id,
    packet_document_id: normalizeNullableText(item?.packetDocumentId || packetDocumentId || version?.rendered_document_id),
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

  const { data, error } = await client
    .from('document_packet_signers')
    .upsert(payload, { onConflict: 'packet_version_id,signer_role,signer_email' })
    .select(
      'id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, signing_token, token_expires_at, token_used_at, viewed_at, signed_at, created_at, updated_at',
    )
  if (error) throw error

  if (normalizeBoolean(markSigningPrep, true)) {
    await updateDocumentPacket(packet.id, { status: 'signing_prep' })
  }

  await appendDocumentPacketEvent({
    packetId: packet.id,
    organisationId: packet.organisation_id,
    versionId: version.id,
    eventType: 'signers_defined',
    eventPayload: {
      signerCount: data?.length || 0,
      packetVersionId: version.id,
    },
  })

  return data || []
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
  if (!context.isOrgAdmin) {
    throw new Error('Only Principal/Super Admin/Admin can manage signing fields.')
  }
  assertPacketCanPrepareSigning(packet)

  const version = await assertPacketVersionBelongsToPacket(client, packet.id, packetVersionId)
  const items = Array.isArray(fields) ? fields : []
  if (!items.length) return []

  const payload = items.map((item) => ({
    organisation_id: packet.organisation_id,
    packet_id: packet.id,
    packet_document_id: normalizeNullableText(item?.packetDocumentId || packetDocumentId || version?.rendered_document_id),
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
    await updateDocumentPacket(packet.id, { status: 'signing_prep' })
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
  if (!context.isOrgAdmin) {
    throw new Error('Only Principal/Super Admin/Admin can generate signing links.')
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

  const expiryHours = Math.max(1, Number(expiresInHours) || 72)
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString()
  const normalizedBaseUrl = normalizeText(baseUrl).replace(/\/$/, '') || (typeof window !== 'undefined' ? window.location.origin : '')

  const updates = []
  for (const signer of signers) {
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
  if (!context.isOrgAdmin) {
    throw new Error('Only Principal/Super Admin/Admin can generate final signed documents.')
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
