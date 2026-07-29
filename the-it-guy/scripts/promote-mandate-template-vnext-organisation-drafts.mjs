import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  buildMandateTemplateVNextApprovalDigestPayload,
  stringifyMandateTemplateApprovalDigestPayload,
} from '../src/core/documents/mandateTemplateApprovalReleaseGate.js'
import {
  listMandateTemplateWordingVNextSections,
} from '../src/core/documents/mandateTemplateWordingVNext.js'

const WRITE_FLAG = 'MANDATE_TEMPLATE_VNEXT_PROMOTE_WRITE'
const TEMPLATE_SELECT = 'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, template_storage_bucket, template_storage_path, template_file_name, version_tag, description, status, is_default, is_active, metadata_json, definition_schema_version, definition_json, revision_root_template_id, revision_parent_template_id, revision_number, superseded_by_template_id, created_by, updated_by, published_by, published_at, archived_by, archived_at, created_at, updated_at'
const SECTION_SELECT = 'id, template_id, section_key, placeholder_keys'
const LEGAL_RELEASE_METADATA_KEYS = new Set([
  'legal_review_status',
  'legal_approved_at',
  'legal_approval_reference',
  'legal_approved_by',
  'legal_approval_content_digest',
  'legal_counsel_review_evidence_digest',
  'legal_b1_manifest_digest',
  'legal_b3_applied_at',
  'legal_b3_applied_by',
  'legal_b3_application_reference',
  'legal_phase4_b3_release_contract',
  'legal_revoked_at',
  'legal_revocation_reason',
  'legal_approval_history',
  'legalApprovalStatus',
  'legalApprovedAt',
  'legalApprovalReference',
  'legalApprovedBy',
  'legalApprovalContentDigest',
  'legalCounselReviewEvidenceDigest',
  'legalB1ManifestDigest',
  'legalB3AppliedAt',
  'legalB3AppliedBy',
  'legalB3ApplicationReference',
  'legalPhase4B3ReleaseContract',
  'legalReview',
  'legal_review',
])

function arg(name, fallback = '') {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3).trim() || fallback
}

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function metadata(template = {}) {
  return template.metadata_json && typeof template.metadata_json === 'object' && !Array.isArray(template.metadata_json)
    ? template.metadata_json
    : {}
}

function stripLegalReleaseClaims(source = {}) {
  return Object.fromEntries(
    Object.entries(source && typeof source === 'object' && !Array.isArray(source) ? source : {})
      .filter(([key]) => !LEGAL_RELEASE_METADATA_KEYS.has(key)),
  )
}

function sourceDigest(template = {}) {
  const meta = metadata(template)
  return text(meta.mandate_vnext_source_content_digest || meta.mandateVnextSourceContentDigest || meta.mandate_vnext_phase7_sync?.source_content_digest || meta.mandateVnextPhase7Sync?.sourceContentDigest)
}

function timeValue(value) {
  return Date.parse(value || '') || 0
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

async function fetchActiveAgencyOrganisations(client) {
  const { data, error } = await client
    .from('organisations')
    .select('id, name, type, status')
    .eq('type', 'agency')
    .eq('status', 'active')
    .order('name', { ascending: true })
  if (error) throw error
  return data || []
}

async function fetchMandateTemplates(client, organisationIds = []) {
  if (!organisationIds.length) return []
  const { data, error } = await client
    .from('document_packet_templates')
    .select(TEMPLATE_SELECT)
    .in('organisation_id', organisationIds)
    .eq('module_type', 'agency')
    .eq('packet_type', 'mandate')
  if (error) throw error
  return data || []
}

async function fetchSections(client, templateIds = []) {
  if (!templateIds.length) return []
  const { data, error } = await client
    .from('document_template_sections')
    .select(SECTION_SELECT)
    .in('template_id', templateIds)
  if (error) throw error
  return data || []
}

function pickCandidate(templates = [], expectedContentDigest = '') {
  const matching = templates
    .filter((template) => sourceDigest(template) === expectedContentDigest)
    .sort((left, right) => timeValue(right.updated_at || right.created_at) - timeValue(left.updated_at || left.created_at))
  const alreadyPromoted = matching.find((template) => lower(template.status) === 'published' && template.is_active === true && template.is_default === true)
  return alreadyPromoted || matching.find((template) => lower(template.status) === 'draft') || matching[0] || null
}

function buildPlan({ organisations = [], templates = [], sections = [], expectedContentDigest = '' } = {}) {
  const blockers = []
  const actions = []
  const targetPlans = organisations.map((organisation) => {
    const orgTemplates = templates.filter((template) => template.organisation_id === organisation.id)
    const candidate = pickCandidate(orgTemplates, expectedContentDigest)
    const sectionCount = candidate
      ? sections.filter((section) => section.template_id === candidate.id).length
      : 0
    const plan = {
      organisationId: organisation.id,
      organisationName: organisation.name || null,
      templateId: candidate?.id || null,
      templateKey: candidate?.template_key || null,
      status: candidate?.status || null,
      isActive: candidate?.is_active === true,
      isDefault: candidate?.is_default === true,
      sectionCount,
      action: 'blocked',
      ready: false,
      blockers: [],
    }

    if (!candidate) {
      plan.blockers.push({ code: 'PROMOTE_TEMPLATE_MISSING', detail: 'No mandate vNext synced template exists for this active organisation.' })
    } else if (sectionCount !== 16) {
      plan.blockers.push({ code: 'PROMOTE_SECTION_COUNT_INVALID', detail: `Expected 16 sections; found ${sectionCount}.` })
    } else if (lower(candidate.status) === 'published' && candidate.is_active === true && candidate.is_default === true) {
      plan.action = 'already_promoted'
      plan.ready = true
    } else if (lower(candidate.status) === 'draft' && candidate.is_active !== true && candidate.is_default !== true) {
      plan.action = 'promote'
      plan.ready = true
      actions.push({
        organisationId: organisation.id,
        organisationName: organisation.name || null,
        templateId: candidate.id,
        templateKey: candidate.template_key,
        versionTag: candidate.version_tag,
        sectionCount,
      })
    } else {
      plan.blockers.push({
        code: 'PROMOTE_TEMPLATE_STATE_UNEXPECTED',
        detail: `Expected a draft/inactive/non-default template or already promoted template; found status=${candidate.status}, is_active=${candidate.is_active}, is_default=${candidate.is_default}.`,
      })
    }

    blockers.push(...plan.blockers.map((blocker) => ({ ...blocker, organisationId: organisation.id })))
    return plan
  })

  return {
    status: blockers.length ? 'BLOCKED' : actions.length ? 'READY_TO_PROMOTE' : 'ALREADY_PROMOTED',
    targetPlans,
    actions,
    blockers,
  }
}

async function promoteTemplate(client, template = {}, sections = [], { appliedAt, appliedBy, reference, makeDefault = true } = {}) {
  const rootId = template.revision_root_template_id || template.id
  const strippedDraftMetadata = stripLegalReleaseClaims(metadata(template))
  if (JSON.stringify(strippedDraftMetadata) !== JSON.stringify(metadata(template))) {
    const { error } = await client
      .from('document_packet_templates')
      .update({
        metadata_json: strippedDraftMetadata,
        updated_at: appliedAt,
      })
      .eq('id', template.id)
      .eq('status', 'draft')
    if (error) throw error
  }

  const meta = {
    ...strippedDraftMetadata,
    mandate_vnext_phase7_promotion: {
      promoted_at: appliedAt,
      promoted_by: appliedBy,
      promotion_reference: reference,
      bypassed_org_admin_rpc: true,
      bypass_reason: 'service_owned_bulk_mandate_vnext_release',
    },
  }

  if (makeDefault) {
    const { error } = await client
      .from('document_packet_templates')
      .update({ is_default: false })
      .eq('organisation_id', template.organisation_id)
      .eq('packet_type', template.packet_type)
      .neq('id', template.id)
      .eq('is_default', true)
    if (error) throw error
  }

  const { error: archiveError } = await client
    .from('document_packet_templates')
    .update({
      status: 'archived',
      is_active: false,
      is_default: false,
      superseded_by_template_id: template.id,
      archived_at: appliedAt,
      updated_at: appliedAt,
    })
    .eq('revision_root_template_id', rootId)
    .neq('id', template.id)
    .eq('status', 'published')
  if (archiveError) throw archiveError

  const { data: updated, error: updateError } = await client
    .from('document_packet_templates')
    .update({
      revision_root_template_id: rootId,
      status: 'published',
      is_active: true,
      is_default: makeDefault,
      published_at: appliedAt,
      archived_at: null,
      archived_by: null,
      metadata_json: meta,
      updated_at: appliedAt,
    })
    .eq('id', template.id)
    .select(TEMPLATE_SELECT)
    .single()
  if (updateError) throw updateError

  const placeholderKeys = unique(
    sections
      .filter((section) => section.template_id === template.id)
      .flatMap((section) => Array.isArray(section.placeholder_keys) ? section.placeholder_keys.map(text) : []),
  )
  const versionPayload = {
    template_id: updated.id,
    organisation_id: updated.organisation_id,
    module_type: updated.module_type,
    packet_type: updated.packet_type,
    template_key: updated.template_key,
    template_label: updated.template_label,
    template_format: updated.template_format,
    version_tag: updated.version_tag,
    status: 'published',
    storage_bucket: updated.template_storage_bucket,
    storage_path: updated.template_storage_path,
    file_name: updated.template_file_name,
    description: updated.description,
    sections_snapshot_json: updated.definition_json?.sections || [],
    placeholder_keys: placeholderKeys,
    metadata_json: updated.metadata_json,
    definition_schema_version: updated.definition_schema_version || 1,
    definition_json: updated.definition_json || {},
    created_by: updated.created_by,
    updated_by: null,
    published_by: null,
    created_at: updated.created_at,
    updated_at: appliedAt,
    published_at: appliedAt,
  }
  const { error: versionError } = await client
    .from('document_packet_template_versions')
    .upsert(versionPayload, { onConflict: 'template_id,version_tag' })
  if (versionError) throw versionError

  return updated
}

async function applyB3Approval(client, templateIds = [], approvalEvidence = {}, { appliedBy = '', reference = '' } = {}) {
  if (!templateIds.length) return null
  const approvals = templateIds.map((templateId) => ({
    templateId,
    packetType: 'mandate',
    decision: 'approved',
    contentDigest: approvalEvidence.contentDigest,
    reviewEvidenceDigest: approvalEvidence.reviewEvidenceDigest,
    reviewedBy: approvalEvidence.approvedBy || appliedBy,
    reviewedAt: approvalEvidence.approvedAt,
    reviewReference: approvalEvidence.reference || reference,
  }))
  const { data, error } = await client.rpc('bridge_apply_legal_document_counsel_approvals', {
    p_b1_manifest_digest: approvalEvidence.b1ManifestDigest,
    p_approvals: approvals,
    p_applied_by: appliedBy,
    p_application_reference: reference,
  })
  if (error) throw error
  return data
}

const apply = process.argv.includes('--apply')
const makeDefault = !process.argv.includes('--no-default')
const appliedBy = arg('applied-by')
const reference = arg('reference')
const confirmDigest = arg('confirm-digest')
const confirmTargetCount = Number(arg('confirm-target-count', '0'))
const approvalEvidencePath = arg('approval-evidence-json', 'config/mandate-template-vnext-approval-evidence.json')
const approvalEvidence = JSON.parse(await readFile(new URL(`../${approvalEvidencePath}`, import.meta.url), 'utf8'))
const digestPayload = buildMandateTemplateVNextApprovalDigestPayload({ sections: listMandateTemplateWordingVNextSections() })
const expectedContentDigest = digest(stringifyMandateTemplateApprovalDigestPayload(digestPayload))

const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !serviceRoleKey) throw new Error('Supabase URL and service role key are required.')

const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const organisations = await fetchActiveAgencyOrganisations(client)
const organisationIds = organisations.map((organisation) => organisation.id)
const templates = await fetchMandateTemplates(client, organisationIds)
const sections = await fetchSections(client, templates.map((template) => template.id))
const plan = buildPlan({ organisations, templates, sections, expectedContentDigest })

const blockers = [
  ...plan.blockers,
  ...(approvalEvidence.status !== 'approved' ? [{ code: 'APPROVAL_NOT_APPROVED', detail: 'Approval evidence must be approved.' }] : []),
  ...(approvalEvidence.contentDigest !== expectedContentDigest ? [{ code: 'APPROVAL_DIGEST_MISMATCH', detail: 'Approval evidence does not match the mandate vNext digest.' }] : []),
  ...(apply && process.env[WRITE_FLAG] !== 'true' ? [{ code: 'WRITE_FLAG_MISSING', detail: `${WRITE_FLAG}=true is required with --apply.` }] : []),
  ...(apply && confirmDigest !== expectedContentDigest ? [{ code: 'CONFIRM_DIGEST_MISMATCH', detail: '--confirm-digest must match the approved content digest.' }] : []),
  ...(apply && confirmTargetCount !== organisations.length ? [{ code: 'CONFIRM_TARGET_COUNT_MISMATCH', detail: '--confirm-target-count must match the resolved active organisation count.' }] : []),
  ...(apply && !appliedBy ? [{ code: 'APPLIED_BY_MISSING', detail: '--applied-by is required with --apply.' }] : []),
  ...(apply && !reference ? [{ code: 'PROMOTION_REFERENCE_MISSING', detail: '--reference is required with --apply.' }] : []),
]

const promoted = []
if (apply && !blockers.length) {
  const appliedAt = new Date().toISOString()
  const byTemplateId = new Map(templates.map((template) => [template.id, template]))
  for (const action of plan.actions) {
    const template = byTemplateId.get(action.templateId)
    const updated = await promoteTemplate(client, template, sections, { appliedAt, appliedBy, reference, makeDefault })
    promoted.push({
      organisationId: updated.organisation_id,
      templateId: updated.id,
      templateKey: updated.template_key,
      status: updated.status,
      isActive: updated.is_active,
      isDefault: updated.is_default,
      publishedAt: updated.published_at,
    })
  }
  if (promoted.length) {
    const b3Result = await applyB3Approval(client, promoted.map((item) => item.templateId), approvalEvidence, { appliedBy, reference })
    for (const item of promoted) item.b3Applied = true
    promoted.b3Result = b3Result
  }
}

const refreshedTemplates = await fetchMandateTemplates(client, organisationIds)
const refreshedSections = await fetchSections(client, refreshedTemplates.map((template) => template.id))
const refreshedPlan = buildPlan({ organisations, templates: refreshedTemplates, sections: refreshedSections, expectedContentDigest })
const report = {
  mode: apply ? 'apply' : 'dry-run',
  status: blockers.length ? 'BLOCKED' : apply ? 'PROMOTED' : plan.status,
  mutatedData: apply && promoted.length > 0,
  makeDefault,
  expectedContentDigest,
  targetCount: organisations.length,
  actionCount: plan.actions.length,
  alreadyPromotedCount: refreshedPlan.targetPlans.filter((item) => item.action === 'already_promoted').length,
  organisations,
  targetPlans: refreshedPlan.targetPlans,
  actions: plan.actions,
  blockers,
  promoted,
  b3Result: promoted.b3Result || null,
}

const outputPath = arg('out', apply
  ? 'docs/mandate-template-vnext-organisation-promotion-report.json'
  : 'docs/mandate-template-vnext-organisation-promotion-dry-run-report.json')
await writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  status: report.status,
  mode: report.mode,
  mutatedData: report.mutatedData,
  targetCount: report.targetCount,
  actionCount: report.actionCount,
  alreadyPromotedCount: report.alreadyPromotedCount,
  promotedCount: promoted.length,
  blockers: blockers.map((blocker) => blocker.code),
  outputPath,
  expectedContentDigest,
}, null, 2))
if (blockers.length) process.exitCode = 1
