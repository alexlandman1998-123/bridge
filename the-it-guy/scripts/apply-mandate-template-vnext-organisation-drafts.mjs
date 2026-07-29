import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  buildMandateTemplateVNextApprovalDigestPayload,
  stringifyMandateTemplateApprovalDigestPayload,
} from '../src/core/documents/mandateTemplateApprovalReleaseGate.js'
import {
  buildMandateTemplateOrganisationSyncPlan,
} from '../src/core/documents/mandateTemplateOrganisationSync.js'
import {
  listMandateTemplateWordingVNextSections,
} from '../src/core/documents/mandateTemplateWordingVNext.js'

const WRITE_FLAG = 'MANDATE_TEMPLATE_VNEXT_ORG_SYNC_WRITE'
const TEMPLATE_SELECT = 'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, template_storage_bucket, template_storage_path, template_file_name, version_tag, description, status, is_default, is_active, metadata_json, definition_schema_version, definition_json, revision_root_template_id, revision_parent_template_id, revision_number, superseded_by_template_id, created_at, updated_at, published_at'
const SECTION_SELECT = 'id, template_id, section_key, section_label, section_type, sort_order, is_required, is_repeatable, condition_json, placeholder_keys, legal_text, metadata_json, created_at, updated_at'

function arg(name, fallback = '') {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3).trim() || fallback
}

function argValues(name) {
  const prefix = `--${name}=`
  return process.argv.filter((value) => value.startsWith(prefix)).map((value) => value.slice(prefix.length).trim()).filter(Boolean)
}

function text(value) {
  return String(value ?? '').trim()
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function sectionRow(templateId, section = {}, index = 0) {
  return {
    template_id: templateId,
    section_key: text(section.sectionKey || section.section_key || section.key) || `section_${index + 1}`,
    section_label: text(section.sectionLabel || section.section_label || section.label) || `Section ${index + 1}`,
    section_type: text(section.sectionType || section.section_type || section.type || 'legal_text').toLowerCase() || 'legal_text',
    sort_order: Number.isFinite(Number(section.sortOrder ?? section.sort_order)) ? Math.trunc(Number(section.sortOrder ?? section.sort_order)) : index,
    is_required: section.isRequired === undefined ? Boolean(section.is_required ?? true) : Boolean(section.isRequired),
    is_repeatable: Boolean(section.isRepeatable ?? section.is_repeatable),
    condition_json: section.conditionJson && typeof section.conditionJson === 'object'
      ? section.conditionJson
      : section.condition_json && typeof section.condition_json === 'object'
        ? section.condition_json
        : {},
    placeholder_keys: Array.isArray(section.placeholderKeys)
      ? section.placeholderKeys.map(text).filter(Boolean)
      : Array.isArray(section.placeholder_keys)
        ? section.placeholder_keys.map(text).filter(Boolean)
        : [],
    legal_text: String(section.legalText ?? section.legal_text ?? ''),
    metadata_json: section.metadataJson && typeof section.metadataJson === 'object'
      ? section.metadataJson
      : section.metadata_json && typeof section.metadata_json === 'object'
        ? section.metadata_json
        : {},
  }
}

function templatePayload(input = {}, { appliedBy = '', reference = '', appliedAt = '' } = {}) {
  return {
    organisation_id: input.organisationId,
    module_type: input.moduleType || 'agency',
    packet_type: input.packetType || 'mandate',
    template_key: input.templateKey,
    template_label: input.templateLabel,
    template_format: input.templateFormat || 'structured',
    template_storage_bucket: input.templateStorageBucket || null,
    template_storage_path: input.templateStoragePath || null,
    template_file_name: input.templateFileName || null,
    version_tag: input.versionTag || 'phase7-v1',
    description: input.description || null,
    status: input.templateStatus || 'draft',
    is_default: input.isDefault === true,
    is_active: input.isActive === true,
    metadata_json: {
      ...(input.metadataJson || {}),
      mandate_vnext_phase7_draft_application: {
        applied_by: appliedBy,
        applied_at: appliedAt,
        application_reference: reference,
      },
    },
    definition_schema_version: 1,
    definition_json: input.canonicalDefinition || {},
    revision_root_template_id: input.revisionRootTemplateId || null,
    revision_parent_template_id: input.revisionParentTemplateId || null,
    revision_number: Math.max(1, Math.trunc(Number(input.revisionNumber || 1))),
  }
}

async function replaceSections(client, templateId, sections = []) {
  const rows = sections.map((section, index) => sectionRow(templateId, section, index))
  if (rows.length) {
    const { error } = await client
      .from('document_template_sections')
      .upsert(rows, { onConflict: 'template_id,section_key' })
    if (error) throw error
  }

  const { data: currentSections, error: currentError } = await client
    .from('document_template_sections')
    .select('id, section_key')
    .eq('template_id', templateId)
  if (currentError) throw currentError

  const keepKeys = new Set(rows.map((row) => row.section_key))
  const deleteIds = (currentSections || [])
    .filter((row) => !keepKeys.has(row.section_key))
    .map((row) => row.id)
  if (deleteIds.length) {
    const { error } = await client
      .from('document_template_sections')
      .delete()
      .in('id', deleteIds)
    if (error) throw error
  }
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

async function fetchExistingMandateTemplates(client, organisationIds = []) {
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

async function fetchAppliedTemplates(client, templateIds = []) {
  if (!templateIds.length) return []
  const { data: templates, error: templateError } = await client
    .from('document_packet_templates')
    .select(TEMPLATE_SELECT)
    .in('id', templateIds)
  if (templateError) throw templateError
  const { data: sections, error: sectionError } = await client
    .from('document_template_sections')
    .select(SECTION_SELECT)
    .in('template_id', templateIds)
    .order('sort_order', { ascending: true })
  if (sectionError) throw sectionError
  return (templates || []).map((template) => ({
    ...template,
    sections: (sections || []).filter((section) => section.template_id === template.id),
  }))
}

const apply = process.argv.includes('--apply')
const allActiveOrgs = process.argv.includes('--all-active-orgs')
const appliedBy = arg('applied-by')
const reference = arg('reference')
const confirmDigest = arg('confirm-digest')
const confirmTargetCount = Number(arg('confirm-target-count', '0'))
const approvalEvidencePath = arg('approval-evidence-json', 'config/mandate-template-vnext-approval-evidence.json')
const approvalEvidence = JSON.parse(await readFile(new URL(`../${approvalEvidencePath}`, import.meta.url), 'utf8'))
const sections = listMandateTemplateWordingVNextSections()
const rendererSource = await readFile(new URL('../../supabase/functions/generate-mandate/index.ts', import.meta.url), 'utf8')
const digestPayload = buildMandateTemplateVNextApprovalDigestPayload({ sections })
const expectedContentDigest = digest(stringifyMandateTemplateApprovalDigestPayload(digestPayload))
const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !serviceRoleKey) throw new Error('Supabase URL and service role key are required.')

const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const organisations = allActiveOrgs
  ? await fetchActiveAgencyOrganisations(client)
  : argValues('organisation-id').map((id) => ({ id, name: '' }))
const organisationIds = organisations.map((organisation) => organisation.id).filter(Boolean)
const existingTemplates = await fetchExistingMandateTemplates(client, organisationIds)
const plan = buildMandateTemplateOrganisationSyncPlan({
  organisations,
  existingTemplates,
  sections,
  rendererSource,
  approvalEvidence,
  expectedContentDigest,
  generatedAt: '2026-07-28T12:00:00.000Z',
})

const blockers = [
  ...plan.blockers,
  ...(apply && process.env[WRITE_FLAG] !== 'true' ? [{ code: 'WRITE_FLAG_MISSING', detail: `${WRITE_FLAG}=true is required with --apply.` }] : []),
  ...(apply && confirmDigest !== expectedContentDigest ? [{ code: 'CONFIRM_DIGEST_MISMATCH', detail: '--confirm-digest must match the approved content digest.' }] : []),
  ...(apply && confirmTargetCount !== plan.summary.targetCount ? [{ code: 'CONFIRM_TARGET_COUNT_MISMATCH', detail: '--confirm-target-count must match the resolved active organisation count.' }] : []),
  ...(apply && !appliedBy ? [{ code: 'APPLIED_BY_MISSING', detail: '--applied-by is required with --apply.' }] : []),
  ...(apply && !reference ? [{ code: 'APPLICATION_REFERENCE_MISSING', detail: '--reference is required with --apply.' }] : []),
]

const applied = []
if (apply && !blockers.length) {
  const appliedAt = new Date().toISOString()
  for (const action of plan.actions) {
    const targetPlan = plan.targetPlans.find((item) => item.organisationId === action.organisationId)
    const input = targetPlan?.templateInput
    if (!input) continue
    let templateId = targetPlan.existingTemplateId || ''
    const payload = templatePayload(input, { appliedBy, reference, appliedAt })
    if (action.action === 'update_draft') {
      const { data, error } = await client
        .from('document_packet_templates')
        .update(payload)
        .eq('id', templateId)
        .select('id')
        .single()
      if (error) throw error
      templateId = data.id
    } else {
      const { data, error } = await client
        .from('document_packet_templates')
        .insert(payload)
        .select('id')
        .single()
      if (error) throw error
      templateId = data.id
    }
    await replaceSections(client, templateId, input.sections)
    applied.push({
      organisationId: action.organisationId,
      action: action.action,
      templateId,
      templateKey: action.templateKey,
      sectionCount: input.sections.length,
    })
  }
}

const alreadySyncedTemplateIds = plan.targetPlans
  .filter((item) => item.action === 'already_synced')
  .map((item) => item.existingTemplateId)
  .filter(Boolean)
const verifiedTemplateIds = [...new Set([
  ...applied.map((item) => item.templateId),
  ...alreadySyncedTemplateIds,
])]
const appliedTemplates = await fetchAppliedTemplates(client, verifiedTemplateIds)
const report = {
  mode: apply ? 'apply' : 'dry-run',
  status: blockers.length ? 'BLOCKED' : apply ? 'APPLIED_DRAFTS' : 'DRY_RUN_READY',
  mutatedData: apply && applied.length > 0,
  expectedContentDigest,
  targetCount: plan.summary.targetCount,
  actionCount: plan.summary.actionCount,
  alreadySyncedCount: plan.summary.alreadySyncedCount,
  organisations,
  targetPlans: plan.targetPlans.map((item) => ({
    organisationId: item.organisationId,
    organisationName: item.organisationName,
    action: item.action,
    existingTemplateId: item.existingTemplateId || null,
    existingTemplateKey: item.existingTemplateKey || null,
    ready: item.ready,
  })),
  actions: plan.actions,
  blockers,
  applied,
  appliedTemplates: appliedTemplates.map((template) => ({
    id: template.id,
    organisationId: template.organisation_id,
    templateKey: template.template_key,
    status: template.status,
    isActive: template.is_active,
    isDefault: template.is_default,
    sectionCount: template.sections.length,
    sourceDigest: template.metadata_json?.mandate_vnext_source_content_digest || null,
  })),
}

const outputPath = arg('out', apply
  ? 'docs/mandate-template-vnext-organisation-draft-apply-report.json'
  : 'docs/mandate-template-vnext-organisation-draft-dry-run-report.json')
await writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  status: report.status,
  mode: report.mode,
  mutatedData: report.mutatedData,
  targetCount: report.targetCount,
  actionCount: report.actionCount,
  appliedCount: applied.length,
  blockers: blockers.map((blocker) => blocker.code),
  outputPath,
  expectedContentDigest,
}, null, 2))
if (blockers.length) process.exitCode = 1
