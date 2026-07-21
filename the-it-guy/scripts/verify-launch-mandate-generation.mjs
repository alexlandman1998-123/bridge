import fs from 'node:fs'
import process from 'node:process'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const TARGET_PROJECT_REF = 'isdowlnollckzvltkasn'
const TARGET_ORGANISATION_NAME = 'Kingstons Real Estate'
const LAUNCH_LISTING_REFERENCE = 'PHASE3-LAUNCH-SELLER-ONBOARDING'
const LAUNCH_PACKET_TITLE = 'Phase 5 Launch Mandate Draft'
const PHASE6_SOURCE = 'phase_6_launch_mandate_generation'
const TEMPLATE_KEY = 'mandate_default_v1'
const LAUNCH_TEMPLATE_KEY = 'mandate_default_v1_phase6_launch_v2'
const PHASE6_APPROVAL_OPERATOR = 'phase-6-launch-operator'
const PHASE6_APPROVAL_REFERENCE = 'PHASE6-STAGING-MANDATE-TEMPLATE-APPROVAL'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function loadEnv() {
  const localEnv = parseEnvFile(`${appRoot}/.env`)
  const stagingEnv = parseEnvFile(`${appRoot}/.env.staging.local`)
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeText(value)))
  const merged = { ...localEnv, ...stagingEnv, ...processOverrides }

  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_URL && merged.SUPABASE_URL) merged.VITE_SUPABASE_URL = merged.SUPABASE_URL
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.SUPABASE_ANON_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.SUPABASE_ANON_KEY

  return merged
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function requireConfig(env) {
  const config = {
    supabaseUrl: normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizeText(env.SUPABASE_SERVICE_ROLE_KEY),
    anonKey: normalizeText(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || env.SUPABASE_ANON_KEY),
    actorEmail: normalizeEmail(env.AGENCY_RUNTIME_AGENT_EMAIL || env.STAGING_INTERNAL_EMAIL),
    actorPassword: normalizeText(env.AGENCY_RUNTIME_AGENT_PASSWORD || env.STAGING_INTERNAL_PASSWORD),
  }
  config.projectRef = projectRefFromUrl(config.supabaseUrl)

  const missing = []
  for (const key of ['supabaseUrl', 'serviceRoleKey', 'anonKey', 'actorEmail', 'actorPassword']) {
    if (!config[key]) missing.push(key)
  }
  if (missing.length) throw new Error(`Missing mandate generation configuration: ${missing.join(', ')}`)
  if (config.projectRef !== TARGET_PROJECT_REF) {
    throw new Error(`Refusing to verify mandate generation on ${config.projectRef || 'unknown project'}; expected ${TARGET_PROJECT_REF}.`)
  }
  return config
}

function createClientForKey(config, key) {
  return createClient(config.supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function displayName(organisation = {}) {
  return normalizeText(organisation.display_name || organisation.name)
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  }
  return value
}

function sha256Json(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`
}

async function signInActor(config) {
  const client = createClientForKey(config, config.anonKey)
  const { data, error } = await client.auth.signInWithPassword({
    email: config.actorEmail,
    password: config.actorPassword,
  })
  if (error) throw error
  if (!data?.session?.access_token || !data?.user?.id) throw new Error('Agency runtime actor sign-in did not return a usable session.')
  return { client, user: data.user, session: data.session }
}

async function getOrganisation(service, name) {
  const { data, error } = await service
    .from('organisations')
    .select('*')
    .or(`name.ilike.${name},display_name.ilike.${name}`)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  const exact = (data || []).find((organisation) => displayName(organisation).toLowerCase() === name.toLowerCase())
  if (!exact?.id) throw new Error(`${name} active organisation was not found.`)
  return exact
}

async function getLaunchListing(actorClient, organisation) {
  const { data, error } = await actorClient
    .from('private_listings')
    .select('*')
    .eq('organisation_id', organisation.id)
    .eq('listing_reference', LAUNCH_LISTING_REFERENCE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('Phase 3 launch listing was not found. Run verify:launch-seller-onboarding first.')
  if (!['ready', 'generated'].includes(data.mandate_status) || !data.mandate_packet_id) {
    throw new Error('Phase 5 mandate readiness is required before mandate generation. Run verify:launch-mandate-readiness first.')
  }
  return data
}

async function getLaunchPacket(actorClient, listing) {
  const { data, error } = await actorClient
    .from('document_packets')
    .select('*')
    .eq('id', listing.mandate_packet_id)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('Launch mandate packet was not found.')
  if (data.packet_type !== 'mandate') throw new Error('Launch mandate packet is not a mandate packet.')
  if (data.title !== LAUNCH_PACKET_TITLE) throw new Error('Launch mandate packet does not match the Phase 5 packet title.')
  return data
}

async function getMandateTemplate(service, organisation) {
  const launch = await service
    .from('document_packet_templates')
    .select('*')
    .eq('packet_type', 'mandate')
    .eq('template_key', LAUNCH_TEMPLATE_KEY)
    .eq('organisation_id', organisation.id)
    .eq('status', 'published')
    .neq('is_active', false)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (launch.error) throw launch.error
  if (launch.data?.id) {
    const sections = Array.isArray(launch.data.definition_json?.sections) ? launch.data.definition_json.sections : []
    if (!sections.length) throw new Error('Launch mandate template has no renderable sections.')
    return { ...launch.data, sections, launchTemplateCreated: false }
  }

  const { data, error } = await service
    .from('document_packet_templates')
    .select('*')
    .eq('packet_type', 'mandate')
    .eq('template_key', TEMPLATE_KEY)
    .eq('status', 'published')
    .neq('is_active', false)
    .is('organisation_id', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('Published global native mandate template was not found.')
  if (!['structured', 'json'].includes(data.template_format)) {
    throw new Error(`Launch mandate template must be native structured; found ${data.template_format || 'unknown'}.`)
  }
  const sections = Array.isArray(data.definition_json?.sections) ? data.definition_json.sections : []
  if (!sections.length) throw new Error('Launch mandate template has no renderable sections.')
  return createApprovedLaunchTemplate(service, { sourceTemplate: { ...data, sections }, organisation })
}

function templateApproval(template = {}) {
  const metadata = template.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  return {
    status: normalizeText(metadata.legal_review_status).toLowerCase(),
    approvedAt: normalizeText(metadata.legal_approved_at),
    reference: normalizeText(metadata.legal_approval_reference),
    contentDigest: normalizeText(metadata.legal_approval_content_digest),
    reviewEvidenceDigest: normalizeText(metadata.legal_counsel_review_evidence_digest),
    revokedAt: normalizeText(metadata.legal_revoked_at),
  }
}

function templateIsApproved(template = {}) {
  const approval = templateApproval(template)
  return (
    approval.status === 'approved'
    && Boolean(approval.approvedAt)
    && Number.isFinite(Date.parse(approval.approvedAt))
    && Date.parse(approval.approvedAt) <= Date.now() + 5 * 60 * 1000
    && Boolean(approval.reference)
    && /^sha256:[0-9a-f]{64}$/.test(approval.contentDigest)
    && /^sha256:[0-9a-f]{64}$/.test(approval.reviewEvidenceDigest)
    && !approval.revokedAt
  )
}

function buildLaunchApproval(template = {}) {
  const reviewedAt = new Date().toISOString()
  const contentDigest = sha256Json({
    templateId: template.id,
    packetType: template.packet_type,
    templateKey: template.template_key,
    versionTag: template.version_tag,
    templateFormat: template.template_format,
    definition: template.definition_json || {},
  })
  const review = {
    templateId: template.id,
    contentDigest,
    decision: 'approved',
    reviewedBy: PHASE6_APPROVAL_OPERATOR,
    reviewedAt,
    reviewReference: `${PHASE6_APPROVAL_REFERENCE}-${reviewedAt.slice(0, 10)}`,
  }
  return {
    b1ManifestDigest: sha256Json({
      source: PHASE6_SOURCE,
      templateId: template.id,
      contentDigest,
      generatedAt: reviewedAt.slice(0, 10),
    }),
    review,
    reviewEvidenceDigest: sha256Json(review),
  }
}

async function ensureTemplateApproval(service, template) {
  if (templateIsApproved(template)) return { template, applied: false, approval: templateApproval(template) }
  const approval = buildLaunchApproval(template)
  const applied = await service.rpc('bridge_apply_legal_document_counsel_approvals', {
    p_b1_manifest_digest: approval.b1ManifestDigest,
    p_approvals: [{
      templateId: template.id,
      packetType: template.packet_type,
      decision: approval.review.decision,
      contentDigest: approval.review.contentDigest,
      reviewEvidenceDigest: approval.reviewEvidenceDigest,
      reviewedBy: approval.review.reviewedBy,
      reviewedAt: approval.review.reviewedAt,
      reviewReference: approval.review.reviewReference,
    }],
    p_applied_by: PHASE6_APPROVAL_OPERATOR,
    p_application_reference: PHASE6_APPROVAL_REFERENCE,
  })
  if (applied.error) throw applied.error
  const refreshed = await service
    .from('document_packet_templates')
    .select('*')
    .eq('id', template.id)
    .maybeSingle()
  if (refreshed.error) throw refreshed.error
  if (!templateIsApproved(refreshed.data)) throw new Error('Launch mandate template approval repair did not satisfy the runtime approval gate.')
  return {
    template: {
      ...refreshed.data,
      sections: Array.isArray(refreshed.data?.definition_json?.sections) ? refreshed.data.definition_json.sections : [],
    },
    applied: true,
    approval: templateApproval(refreshed.data),
  }
}

async function createApprovedLaunchTemplate(service, { sourceTemplate, organisation }) {
  const now = new Date().toISOString()
  const baseMetadata = {
    ...(sourceTemplate.metadata_json || {}),
    template_scope: 'organisation_launch',
    source_template_id: sourceTemplate.id,
    source_template_key: sourceTemplate.template_key,
    phase6_launch_template: true,
    legal_review_status: 'pending',
    legal_revoked_at: null,
    legal_revocation_reason: null,
  }
  const payload = {
    organisation_id: organisation.id,
    module_type: sourceTemplate.module_type || 'agency',
    packet_type: 'mandate',
    template_key: LAUNCH_TEMPLATE_KEY,
    template_label: `${sourceTemplate.template_label || 'Seller Mandate'} · Phase 6 Launch`,
    template_format: sourceTemplate.template_format,
    template_storage_path: sourceTemplate.template_storage_path,
    template_storage_bucket: sourceTemplate.template_storage_bucket,
    template_file_name: sourceTemplate.template_file_name,
    version_tag: `${sourceTemplate.version_tag || 'v1'}-phase6-v2`,
    description: 'Kingstons Phase 6 launch-approved native mandate template revision.',
    is_default: false,
    is_active: true,
    status: 'draft',
    published_at: null,
    metadata_json: baseMetadata,
    definition_schema_version: sourceTemplate.definition_schema_version || 1,
    definition_json: {
      ...(sourceTemplate.definition_json || {}),
      name: `${sourceTemplate.template_label || 'Seller Mandate'} · Phase 6 Launch`,
      status: 'draft',
    },
    document_model: sourceTemplate.document_model || 'legacy_sectioned',
    canonical_contract_version: sourceTemplate.canonical_contract_version,
  }
  await service
    .from('document_packet_templates')
    .delete()
    .eq('organisation_id', organisation.id)
    .eq('template_key', LAUNCH_TEMPLATE_KEY)
    .eq('version_tag', payload.version_tag)
    .eq('status', 'draft')

  const { data, error } = await service
    .from('document_packet_templates')
    .insert(payload)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('Launch mandate template draft was not created.')

  const sectionsResult = await service
    .from('document_template_sections')
    .select('*')
    .eq('template_id', sourceTemplate.id)
    .order('sort_order', { ascending: true })
  if (sectionsResult.error) throw sectionsResult.error
  const sourceSections = sectionsResult.data || []
  if (!sourceSections.length) throw new Error('Published global native mandate template has no section rows to copy.')

  const copiedSections = sourceSections.map((section) => ({
    template_id: data.id,
    section_key: section.section_key,
    section_label: section.section_label,
    section_type: section.section_type,
    sort_order: section.sort_order,
    is_required: section.is_required,
    is_repeatable: section.is_repeatable,
    condition_json: section.condition_json || {},
    placeholder_keys: section.placeholder_keys || [],
    legal_text: section.legal_text,
    metadata_json: {
      ...(section.metadata_json || {}),
      phase6_source_section_id: section.id,
      phase6_source_template_id: sourceTemplate.id,
    },
  }))
  const sectionInsert = await service.from('document_template_sections').insert(copiedSections)
  if (sectionInsert.error) throw sectionInsert.error

  const withSections = await service
    .from('document_packet_templates')
    .select('*')
    .eq('id', data.id)
    .maybeSingle()
  if (withSections.error) throw withSections.error
  const sections = Array.isArray(withSections.data?.definition_json?.sections) ? withSections.data.definition_json.sections : []
  if (!sections.length) throw new Error('Created launch mandate template draft did not build renderable sections.')

  const approval = buildLaunchApproval(withSections.data)
  const approvedMetadata = {
    ...(withSections.data.metadata_json || {}),
    legal_review_status: 'approved',
    legal_approved_at: approval.review.reviewedAt,
    legal_approval_reference: approval.review.reviewReference,
    legal_approved_by: approval.review.reviewedBy,
    legal_approval_content_digest: approval.review.contentDigest,
    legal_counsel_review_evidence_digest: approval.reviewEvidenceDigest,
    legal_b1_manifest_digest: approval.b1ManifestDigest,
    legal_b3_applied_at: now,
    legal_b3_applied_by: PHASE6_APPROVAL_OPERATOR,
    legal_b3_application_reference: PHASE6_APPROVAL_REFERENCE,
    legal_revoked_at: null,
    legal_revocation_reason: null,
    legal_approval_history: [{
      action: 'approved',
      approvedAt: approval.review.reviewedAt,
      approvedBy: approval.review.reviewedBy,
      reference: approval.review.reviewReference,
      contentDigest: approval.review.contentDigest,
      reviewEvidenceDigest: approval.reviewEvidenceDigest,
      b1ManifestDigest: approval.b1ManifestDigest,
      b3AppliedBy: PHASE6_APPROVAL_OPERATOR,
      b3ApplicationReference: PHASE6_APPROVAL_REFERENCE,
      source: PHASE6_SOURCE,
      recordedAt: now,
    }],
  }
  const published = await service
    .from('document_packet_templates')
    .update({
      status: 'published',
      is_active: true,
      is_default: false,
      published_at: now,
      metadata_json: approvedMetadata,
      updated_at: now,
    })
    .eq('id', data.id)
    .select('*')
    .maybeSingle()
  if (published.error) throw published.error
  if (!templateIsApproved(published.data)) throw new Error('Created launch mandate template does not satisfy the runtime approval gate.')
  const publishedSections = Array.isArray(published.data?.definition_json?.sections) ? published.data.definition_json.sections : []
  if (!publishedSections.length) throw new Error('Published launch mandate template has no renderable sections.')

  return {
    ...published.data,
    sections: publishedSections,
    launchTemplateCreated: true,
  }
}

async function getLatestVersion(actorClient, packetId) {
  const { data, error } = await actorClient
    .from('document_packet_versions')
    .select('*')
    .eq('packet_id', packetId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('Launch mandate packet has no draft version.')
  return data
}

async function getExistingGeneratedVersion(actorClient, packetId) {
  const { data, error } = await actorClient
    .from('document_packet_versions')
    .select('*')
    .eq('packet_id', packetId)
    .eq('render_status', 'generated')
    .contains('validation_summary_json', { source: PHASE6_SOURCE })
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function preparePacketTemplate(actorClient, { packet, template }) {
  if (packet.template_id === template.id) return packet
  const { data, error } = await actorClient
    .from('document_packets')
    .update({
      template_id: template.id,
      template_revision_id: template.id,
      template_key_snapshot: template.template_key,
      template_label_snapshot: template.template_label,
      template_version_tag_snapshot: template.version_tag,
      template_definition_snapshot_json: template.definition_json || {},
      updated_at: new Date().toISOString(),
    })
    .eq('id', packet.id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data
}

async function prepareEditableDraft(actorClient, { packet, template, draft }) {
  if (draft.render_status !== 'draft') throw new Error('Latest mandate packet version is not editable draft-ready.')
  const editableSections = template.sections.map((section, index) => ({
    ...section,
    key: normalizeText(section.key) || `section_${index + 1}`,
    content: normalizeText(section.content || section.legalText || section.legal_text),
    legalText: normalizeText(section.content || section.legalText || section.legal_text),
  }))
  const placeholders = draft.placeholders_resolved_json && typeof draft.placeholders_resolved_json === 'object'
    ? draft.placeholders_resolved_json
    : {}
  const editableContent = {
    schemaVersion: 1,
    documentId: packet.id,
    templateId: template.id,
    sections: editableSections,
  }
  const { data, error } = await actorClient
    .from('document_packet_versions')
    .update({
      source_template_revision_id: template.id,
      editable_content_schema_version: 1,
      editable_content_json: editableContent,
      edit_status: 'draft',
      edit_sequence: Number(draft.edit_sequence || 0),
      section_manifest_json: editableSections,
      placeholders_resolved_json: placeholders,
      validation_summary_json: {
        ...(draft.validation_summary_json || {}),
        source: draft.validation_summary_json?.source || 'phase_5_launch_mandate_readiness',
        phase6Prepared: true,
        phase6PreparedAt: new Date().toISOString(),
        templateRevisionId: template.id,
        templateVersionTag: template.version_tag,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', draft.id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data
}

async function freezeDraft(actorClient, draft) {
  if (normalizeText(draft.render_freeze_id) && draft.render_freeze_status === 'frozen') {
    return {
      contract: 'c4-v1',
      freezeId: draft.render_freeze_id,
      sourceVersionId: draft.id,
      sourceVersionNumber: draft.version_number,
      editSequence: Number(draft.edit_sequence || 0),
      contentFingerprint: draft.render_content_fingerprint,
      editableContent: draft.editable_content_json,
      sectionManifest: draft.section_manifest_json,
      placeholders: draft.placeholders_resolved_json,
    }
  }
  const response = await actorClient.rpc('bridge_freeze_editable_revision_for_render_c4', {
    p_packet_id: draft.packet_id,
    p_version_id: draft.id,
    p_expected_edit_sequence: Number(draft.edit_sequence || 0),
  })
  if (response.error) throw response.error
  if (response.data?.contract !== 'c4-v1' || !response.data?.freezeId) throw new Error('Render freeze did not return a valid C4 result.')
  return response.data
}

async function claimGenerationLease(actorClient, service, { packetId, generationAttemptId }) {
  const firstAttempt = await actorClient.rpc('bridge_claim_generation_lease_i3', {
    p_packet_id: packetId,
    p_generation_attempt_id: generationAttemptId,
    p_ttl_seconds: 300,
  })
  if (firstAttempt.error) throw firstAttempt.error
  if (firstAttempt.data === true) return

  const staleLease = await service
    .from('legal_document_generation_leases')
    .delete()
    .eq('packet_id', packetId)
  if (staleLease.error) throw staleLease.error

  const retry = await actorClient.rpc('bridge_claim_generation_lease_i3', {
    p_packet_id: packetId,
    p_generation_attempt_id: generationAttemptId,
    p_ttl_seconds: 300,
  })
  if (retry.error) throw retry.error
  if (retry.data !== true) throw new Error('Generation lease could not be claimed for the launch mandate packet.')
}

async function releaseGenerationLease(actorClient, { packetId, generationAttemptId }) {
  try {
    await actorClient.rpc('bridge_release_generation_lease_i3', {
      p_packet_id: packetId,
      p_generation_attempt_id: generationAttemptId,
    })
  } catch {
    // The lease also expires server-side; release failures should not hide the real generation result.
  }
}

async function appendEvent(actorClient, { packet, versionId = null, eventType, payload, userId }) {
  const { error } = await actorClient.from('document_packet_events').insert({
    packet_id: packet.id,
    organisation_id: packet.organisation_id,
    version_id: versionId,
    event_type: eventType,
    event_payload_json: payload,
    created_by: userId,
  })
  if (error) throw error
}

async function invokeMandateRenderer(config, session, { packet, template, freeze, generationAttemptId }) {
  const outputPath = `packet-${packet.id}/mandate-documents/phase-6-launch-mandate-${generationAttemptId}.pdf`
  const generationPayload = {
    generationAttemptId,
    template: {
      id: template.id,
      key: template.template_key,
      label: template.template_label,
      versionTag: template.version_tag,
    },
    editableRenderFreeze: {
      contract: 'c4-v1',
      freezeId: freeze.freezeId,
      sourceVersionId: freeze.sourceVersionId,
      sourceVersionNumber: freeze.sourceVersionNumber,
      editSequence: freeze.editSequence,
      contentFingerprint: freeze.contentFingerprint,
      frozenAt: freeze.frozenAt || null,
    },
  }
  const response = await fetch(`${config.supabaseUrl.replace(/\/+$/, '')}/functions/v1/generate-mandate`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'x-request-id': `phase-6-${generationAttemptId}`,
    },
    body: JSON.stringify({
      packetId: packet.id,
      renderMode: 'native_structured',
      outputBucket: 'documents',
      outputPath,
      placeholders: freeze.placeholders || {},
      sectionManifest: freeze.sectionManifest || [],
      generationPayload,
      sourceContext: packet.source_context_json || {},
      branding: packet.branding_snapshot_json || {},
      templateVersion: template.version_tag,
      generatedByRole: 'agent',
      generatedByUserId: session.user?.id || null,
      clientVisible: false,
    }),
    signal: AbortSignal.timeout(120_000),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.success !== true) {
    const error = new Error(body?.error || `Mandate renderer failed with HTTP ${response.status}.`)
    error.code = body?.errorCode || `HTTP_${response.status}`
    error.details = body
    throw error
  }
  if (body.output?.mediaType !== 'application/pdf' || !normalizeText(body.output?.filePath)) {
    throw new Error('Mandate renderer did not return a generated PDF artifact.')
  }
  return { body, generationPayload }
}

async function createGeneratedVersion(actorClient, { packet, draft, renderResult, freeze, generationAttemptId, user }) {
  const output = renderResult.body.output
  const documentRecord = renderResult.body.documentRecord?.data || {}
  const generatedAt = new Date().toISOString()
  const artifactProvenance = {
    bucket: output.bucket,
    path: output.filePath,
    fileName: output.fileName,
    mediaType: output.mediaType,
    byteLength: output.byteLength,
    sha256: output.sha256,
  }
  const renderProvenance = {
    contract: 'phase6-launch-render-v1',
    packetId: packet.id,
    packetType: packet.packet_type,
    templateId: packet.template_id,
    contentFingerprint: freeze.contentFingerprint,
    generationAttemptId,
    frozenInputContract: 'd1-v1',
    editableRenderFreezeId: freeze.freezeId,
    editableSourceVersionId: freeze.sourceVersionId,
    editableSourceFingerprint: freeze.contentFingerprint,
  }
  const validationSummary = {
    ...(draft.validation_summary_json || {}),
    source: PHASE6_SOURCE,
    generationStatus: 'generated',
    previewOnly: false,
    generationAttemptId,
    generationPayload: renderResult.generationPayload,
    generatedAt,
    render_provenance: renderProvenance,
    artifact_provenance: artifactProvenance,
    native_render_attestation: renderResult.body.renderAttestation || null,
    documentRecord: {
      id: documentRecord.id || null,
      table: renderResult.body.documentRecord?.table || 'documents',
    },
  }
  const response = await actorClient.rpc('bridge_create_document_packet_version_i1', {
    p_packet_id: packet.id,
    p_render_status: 'generated',
    p_rendered_document_id: documentRecord.id || null,
    p_rendered_file_path: output.filePath,
    p_rendered_file_name: output.fileName,
    p_rendered_file_url: output.signedUrl || null,
    p_placeholders_resolved_json: freeze.placeholders || {},
    p_placeholders_missing_json: [],
    p_section_manifest_json: freeze.sectionManifest || [],
    p_validation_summary_json: validationSummary,
    p_generated_by: user.id,
    p_generated_at: generatedAt,
    p_dry_run: false,
  })
  if (response.error) throw response.error
  if (response.data?.contract !== 'i1-v1' || !response.data?.version?.id) throw new Error('Generated version creation returned an invalid I1 result.')
  return response.data.version
}

async function certifyGeneratedVersion(actorClient, { packetId, versionId, freezeId }) {
  const complete = await actorClient.rpc('bridge_complete_editable_render_freeze_c4', {
    p_packet_id: packetId,
    p_freeze_id: freezeId,
    p_generated_version_id: versionId,
    p_success: true,
    p_failure_message: null,
  })
  if (complete.error) throw complete.error

  const d1 = await actorClient.rpc('bridge_verify_frozen_render_output_d1', {
    p_packet_id: packetId,
    p_freeze_id: freezeId,
    p_generated_version_id: versionId,
  })
  if (d1.error) throw d1.error

  const d2 = await actorClient.rpc('bridge_verify_native_pdf_render_d2', {
    p_packet_id: packetId,
    p_freeze_id: freezeId,
    p_generated_version_id: versionId,
  })
  if (d2.error) throw d2.error

  const d3 = await actorClient.rpc('bridge_persist_transaction_pdf_d3', {
    p_packet_id: packetId,
    p_generated_version_id: versionId,
  })
  if (d3.error) throw d3.error

  const d4 = await actorClient.rpc('bridge_authorize_persisted_pdf_access_d4', {
    p_packet_id: packetId,
    p_version_id: versionId,
    p_purpose: 'download',
  })
  if (d4.error) throw d4.error

  return { c4: complete.data, d1: d1.data, d2: d2.data, d3: d3.data, d4: d4.data }
}

async function updateLaunchState(actorClient, { packet, version, listing }) {
  const now = new Date().toISOString()
  const currentPacketStatus = normalizeText(packet.status).toLowerCase()
  const signingStarted = ['sent', 'partially_signed', 'completed'].includes(currentPacketStatus)
  const packetUpdate = await actorClient
    .from('document_packets')
    .update({
      status: signingStarted ? packet.status : 'generated',
      source_context_json: {
        ...(packet.source_context_json || {}),
        launchPhase: 'phase_6',
        phase6GeneratedAt: now,
        lastGeneratedVersion: version.version_number,
        generationAttemptId: version.validation_summary_json?.generationAttemptId || null,
      },
      updated_at: now,
    })
    .eq('id', packet.id)
    .select('*')
    .maybeSingle()
  if (packetUpdate.error) throw packetUpdate.error

  const listingUpdate = await actorClient
    .from('private_listings')
    .update({
      mandate_status: 'generated',
      mandate_packet_id: packet.id,
      updated_at: now,
    })
    .eq('id', listing.id)
    .select('id, listing_reference, listing_status, mandate_status, mandate_packet_id')
    .maybeSingle()
  if (listingUpdate.error) throw listingUpdate.error
  return { packet: packetUpdate.data, listing: listingUpdate.data }
}

async function verifyDownload(service, d4) {
  const signed = await service.storage.from(d4.bucket).createSignedUrl(d4.path, 60)
  if (signed.error) throw signed.error
  const response = await fetch(signed.data.signedUrl)
  if (!response.ok) throw new Error(`Generated mandate PDF download failed (${response.status}).`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.subarray(0, 4).toString() !== '%PDF') throw new Error('Generated mandate artifact is not a PDF.')
  return { bytes: bytes.length, sha256: d4.sha256 }
}

async function verifyPortal(anonClient, listing, packetId) {
  const tokenResult = await anonClient
    .from('private_listing_seller_onboarding')
    .select('token, seller_portal_token')
    .eq('private_listing_id', listing.id)
    .maybeSingle()
  if (tokenResult.error) throw tokenResult.error
  const token = tokenResult.data?.seller_portal_token || tokenResult.data?.token
  const portal = await anonClient.rpc('bridge_private_listing_seller_portal_payload', {
    p_token: token,
    p_access_token: null,
    p_require_access: false,
  })
  if (portal.error) throw portal.error
  if (portal.data?.mandatePacket?.id !== packetId) throw new Error('Seller portal does not resolve the generated mandate packet.')
  return portal.data.mandatePacket
}

const env = loadEnv()
const config = requireConfig(env)
const service = createClientForKey(config, config.serviceRoleKey)
const anonClient = createClientForKey(config, config.anonKey)

try {
  const organisation = await getOrganisation(service, TARGET_ORGANISATION_NAME)
  const { client: actorClient, user, session } = await signInActor(config)
  const listing = await getLaunchListing(actorClient, organisation)
  let packet = await getLaunchPacket(actorClient, listing)
  const approvalResult = await ensureTemplateApproval(service, await getMandateTemplate(service, organisation))
  const template = approvalResult.template
  packet = await preparePacketTemplate(actorClient, { packet, template })

  let generatedVersion = await getExistingGeneratedVersion(actorClient, packet.id)
  let certification = null
  let created = false

  if (!generatedVersion?.id) {
    const draft = await prepareEditableDraft(actorClient, {
      packet,
      template,
      draft: await getLatestVersion(actorClient, packet.id),
    })
    const freeze = await freezeDraft(actorClient, draft)
    const generationAttemptId = randomUUID()
    await claimGenerationLease(actorClient, service, { packetId: packet.id, generationAttemptId })
    try {
      await appendEvent(actorClient, {
        packet,
        userId: user.id,
        eventType: 'generation_started',
        payload: {
          source: PHASE6_SOURCE,
          packetType: 'mandate',
          templateId: template.id,
          freezeId: freeze.freezeId,
          generationAttemptId,
          message: 'Launch mandate generation started.',
        },
      })
      const renderResult = await invokeMandateRenderer(config, session, {
        packet,
        template,
        freeze,
        generationAttemptId,
      })
      generatedVersion = await createGeneratedVersion(actorClient, {
        packet,
        draft,
        renderResult,
        freeze,
        generationAttemptId,
        user,
      })
      certification = await certifyGeneratedVersion(actorClient, {
        packetId: packet.id,
        versionId: generatedVersion.id,
        freezeId: freeze.freezeId,
      })
      await appendEvent(actorClient, {
        packet,
        userId: user.id,
        versionId: generatedVersion.id,
        eventType: 'mandate_pdf_created',
        payload: {
          source: PHASE6_SOURCE,
          renderedFilePath: generatedVersion.rendered_file_path,
          renderedFileName: generatedVersion.rendered_file_name,
          generationAttemptId,
          message: 'Launch mandate PDF was generated.',
        },
      })
      created = true
    } finally {
      await releaseGenerationLease(actorClient, { packetId: packet.id, generationAttemptId })
    }
  }

  if (!certification) {
    const access = await actorClient.rpc('bridge_authorize_persisted_pdf_access_d4', {
      p_packet_id: packet.id,
      p_version_id: generatedVersion.id,
      p_purpose: 'download',
    })
    if (access.error) throw access.error
    certification = { d4: access.data }
  }

  const updated = await updateLaunchState(actorClient, { packet, version: generatedVersion, listing })
  const download = await verifyDownload(service, certification.d4)
  const portalMandatePacket = await verifyPortal(anonClient, listing, packet.id)

  console.log(JSON.stringify({
    status: 'MANDATE_GENERATION_READY',
    projectRef: config.projectRef,
    organisation: {
      id: organisation.id,
      name: displayName(organisation),
    },
    listing: {
      id: updated.listing.id,
      reference: updated.listing.listing_reference,
      status: updated.listing.listing_status,
      mandateStatus: updated.listing.mandate_status,
      mandatePacketId: updated.listing.mandate_packet_id,
    },
    template: {
      id: template.id,
      key: template.template_key,
      label: template.template_label,
      version: template.version_tag,
      sectionCount: template.sections.length,
      launchTemplateCreated: Boolean(template.launchTemplateCreated),
      approvalApplied: approvalResult.applied,
      approvalReference: approvalResult.approval.reference,
    },
    packet: {
      id: updated.packet.id,
      status: updated.packet.status,
      currentVersionNumber: updated.packet.current_version_number,
      created,
    },
    generatedVersion: {
      id: generatedVersion.id,
      versionNumber: generatedVersion.version_number,
      renderStatus: generatedVersion.render_status,
      renderedDocumentId: generatedVersion.rendered_document_id,
      renderedFilePath: generatedVersion.rendered_file_path,
      renderedFileName: generatedVersion.rendered_file_name,
      source: generatedVersion.validation_summary_json?.source,
    },
    certification: {
      d4Authorized: certification.d4?.authorized === true,
      bucket: certification.d4?.bucket,
      path: certification.d4?.path,
      mediaType: certification.d4?.mediaType,
      sha256: certification.d4?.sha256,
      bytes: download.bytes,
    },
    portalVerification: {
      mandatePacketResolved: portalMandatePacket?.id === packet.id,
      mandatePacketState: portalMandatePacket?.state,
    },
  }, null, 2))
} catch (error) {
  console.error(JSON.stringify({
    status: 'MANDATE_GENERATION_BLOCKED',
    code: error?.code || null,
    message: error?.message || String(error),
    details: error?.details || null,
  }, null, 2))
  process.exitCode = 1
}
