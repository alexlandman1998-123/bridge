import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  getMandateTemplateContentRule,
  listMandateTemplateContentRules,
  MANDATE_TEMPLATE_CONTENT_PACK_KEYS,
} from '../src/core/documents/mandateTemplateContentRules.js'

export const WRITE_FLAG = 'MANDATE_TEMPLATE_GLOBAL_ROUTES_WRITE'
export const GLOBAL_MANDATE_ROUTE_PHASE2_VERSION = 'mandate_global_routes_phase2_v1'
export const GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG = 'global-route-phase2-v1'

export const TEMPLATE_SELECT = [
  'id',
  'organisation_id',
  'module_type',
  'packet_type',
  'template_key',
  'template_label',
  'template_format',
  'template_storage_bucket',
  'template_storage_path',
  'template_file_name',
  'version_tag',
  'description',
  'status',
  'is_default',
  'is_active',
  'metadata_json',
  'definition_schema_version',
  'definition_json',
  'revision_root_template_id',
  'revision_parent_template_id',
  'revision_number',
  'superseded_by_template_id',
  'content_hash',
  'change_summary',
  'document_model',
  'canonical_contract_version',
  'created_by',
  'updated_by',
  'published_by',
  'published_at',
  'archived_by',
  'archived_at',
  'created_at',
  'updated_at',
].join(', ')

export const SECTION_SELECT = [
  'id',
  'template_id',
  'section_key',
  'section_label',
  'section_type',
  'sort_order',
  'is_required',
  'is_repeatable',
  'condition_json',
  'placeholder_keys',
  'legal_text',
  'metadata_json',
  'created_at',
  'updated_at',
].join(', ')

const CONDITIONAL_PACK_KEYS = new Set(Object.values(MANDATE_TEMPLATE_CONTENT_PACK_KEYS))
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

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function cloneJson(value, fallback) {
  if (value === undefined || value === null) return fallback
  return JSON.parse(JSON.stringify(value))
}

function stripLegalReleaseClaims(source = {}) {
  return Object.fromEntries(
    Object.entries(object(source)).filter(([key]) => !LEGAL_RELEASE_METADATA_KEYS.has(key)),
  )
}

function routeTemplateKey(routeKey = '') {
  return `mandate_${routeKey}_v1`
}

function routeTemplateLabel(route = {}) {
  return `Seller Mandate - ${text(route.label) || text(route.key)}`
}

function routeTemplateDescription(route = {}) {
  return `Global Arch9 mandate route draft for ${text(route.label) || text(route.key)}.`
}

function routeMetadata(route = {}, sourceTemplate = {}, { appliedAt = '', appliedBy = '', reference = '' } = {}) {
  const sourceMetadata = stripLegalReleaseClaims(sourceTemplate.metadata_json)
  return {
    ...sourceMetadata,
    template_scope: 'global_route_variant',
    platform_global_route_template: true,
    platform_default_can_route_without_org_template: false,
    mandate_global_route_phase2_version: GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
    mandate_global_route_phase2_applied_at: appliedAt || null,
    mandate_global_route_phase2_applied_by: appliedBy || null,
    mandate_global_route_phase2_reference: reference || null,
    mandate_route_source_template_id: sourceTemplate.id || null,
    mandate_template_variant: route.key,
    mandateTemplateVariant: route.key,
    template_variant: route.key,
    templateVariant: route.key,
    mandate_clause_profile: route.key,
    mandateClauseProfile: route.key,
    seller_clause_profile: route.sellerProfile || null,
    sellerClauseProfile: route.sellerProfile || null,
    mandate_seller_clause_profile: route.sellerProfile || null,
    property_clause_profile: route.propertyProfile || null,
    propertyClauseProfile: route.propertyProfile || null,
    mandate_property_clause_profile: route.propertyProfile || null,
    approved_default_route_scan: route.key,
    render_mode: sourceMetadata.render_mode || sourceMetadata.renderMode || 'native_structured',
    renderMode: sourceMetadata.renderMode || sourceMetadata.render_mode || 'native_structured',
    native_template: true,
    nativeTemplate: true,
  }
}

function routeDefinition(sourceTemplate = {}, route = {}, sections = []) {
  const definition = object(cloneJson(sourceTemplate.definition_json, {}))
  return {
    ...definition,
    route: route.key,
    mandateTemplateVariant: route.key,
    sections: sections.map((section) => ({
      sectionKey: section.section_key,
      sectionLabel: section.section_label,
      sectionType: section.section_type,
      sortOrder: section.sort_order,
      isRequired: section.is_required,
      isRepeatable: section.is_repeatable,
      conditionJson: section.condition_json,
      placeholderKeys: section.placeholder_keys,
      legalText: section.legal_text,
      metadataJson: section.metadata_json,
    })),
  }
}

function sectionPayload(section = {}, route = {}) {
  const metadata = {
    ...object(section.metadata_json),
    mandate_template_variant: route.key,
    mandateTemplateVariant: route.key,
    mandate_global_route_phase2_version: GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
  }
  const isAllowedPack = getMandateTemplateContentRule(route.key).allowedConditionalPackKeys.includes(section.section_key)
  return {
    section_key: section.section_key,
    section_label: section.section_label,
    section_type: section.section_type || 'legal_text',
    sort_order: Number.isFinite(Number(section.sort_order)) ? Number(section.sort_order) : 0,
    is_required: section.is_required !== false,
    is_repeatable: section.is_repeatable === true,
    condition_json: isAllowedPack ? {} : cloneJson(section.condition_json, {}),
    placeholder_keys: Array.isArray(section.placeholder_keys) ? section.placeholder_keys.map(text).filter(Boolean) : [],
    legal_text: String(section.legal_text ?? ''),
    metadata_json: metadata,
  }
}

export function listMandateGlobalRouteTemplates() {
  return listMandateTemplateContentRules().filter((route) => route.key !== 'default')
}

export function buildRouteSections(sourceSections = [], route = {}) {
  const rule = getMandateTemplateContentRule(route.key)
  const allowedPacks = new Set(rule.allowedConditionalPackKeys)
  return sourceSections
    .filter((section) => {
      const sectionKey = text(section.section_key)
      return !CONDITIONAL_PACK_KEYS.has(sectionKey) || allowedPacks.has(sectionKey)
    })
    .map((section) => sectionPayload(section, route))
}

export function buildRouteTemplatePayload({ sourceTemplate = {}, route = {}, sourceSections = [], appliedAt = '', appliedBy = '', reference = '' } = {}) {
  const sections = buildRouteSections(sourceSections, route)
  const sourceRootId = sourceTemplate.revision_root_template_id || sourceTemplate.id || null
  return {
    organisation_id: null,
    module_type: sourceTemplate.module_type || 'agency',
    packet_type: 'mandate',
    template_key: routeTemplateKey(route.key),
    template_label: routeTemplateLabel(route),
    template_format: sourceTemplate.template_format || 'structured',
    template_storage_bucket: null,
    template_storage_path: null,
    template_file_name: null,
    version_tag: GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG,
    description: routeTemplateDescription(route),
    status: 'draft',
    is_default: false,
    is_active: false,
    metadata_json: routeMetadata(route, sourceTemplate, { appliedAt, appliedBy, reference }),
    definition_schema_version: sourceTemplate.definition_schema_version || 1,
    definition_json: routeDefinition(sourceTemplate, route, sections),
    revision_root_template_id: sourceRootId,
    revision_parent_template_id: sourceTemplate.id || null,
    revision_number: 1,
    content_hash: sourceTemplate.content_hash || null,
    change_summary: `Create global ${route.key} mandate route draft.`,
    document_model: sourceTemplate.document_model || null,
    canonical_contract_version: sourceTemplate.canonical_contract_version || null,
    sections,
  }
}

export function buildMandateGlobalRouteTemplatePlan({ sourceTemplate = null, sourceSections = [], existingTemplates = [] } = {}) {
  const blockers = []
  if (!sourceTemplate?.id) {
    blockers.push({ code: 'SOURCE_TEMPLATE_MISSING', detail: 'A published active global mandate_default_v1 source template is required.' })
  }
  if (!sourceSections.length) {
    blockers.push({ code: 'SOURCE_TEMPLATE_SECTIONS_MISSING', detail: 'The source global mandate template has no sections to clone.' })
  }

  const targetPlans = listMandateGlobalRouteTemplates().map((route) => {
    const templateKey = routeTemplateKey(route.key)
    const existingForRoute = existingTemplates
      .filter((template) => template.template_key === templateKey || object(template.metadata_json).mandate_template_variant === route.key || object(template.metadata_json).mandateTemplateVariant === route.key)
      .sort((left, right) => Date.parse(right.updated_at || right.created_at || '') - Date.parse(left.updated_at || left.created_at || ''))
    const published = existingForRoute.find((template) => lower(template.status) === 'published' && template.is_active === true)
    const draft = existingForRoute.find((template) => lower(template.status) === 'draft')
    const existing = published || draft || existingForRoute[0] || null
    const action = published
      ? 'already_published'
      : draft
        ? 'update_draft'
        : existing
          ? 'blocked'
          : 'create_draft'
    const plan = {
      routeKey: route.key,
      routeLabel: route.label,
      sellerProfile: route.sellerProfile,
      propertyProfile: route.propertyProfile,
      allowedConditionalPackKeys: route.allowedConditionalPackKeys,
      templateKey,
      existingTemplateId: existing?.id || null,
      existingStatus: existing?.status || null,
      action,
      ready: ['already_published', 'update_draft', 'create_draft'].includes(action),
      blockers: [],
    }
    if (action === 'blocked') {
      plan.blockers.push({
        code: 'ROUTE_TEMPLATE_STATE_UNEXPECTED',
        detail: `Route ${route.key} has a non-draft, non-published existing template (${existing.status}).`,
      })
    }
    return plan
  })

  for (const plan of targetPlans) {
    blockers.push(...plan.blockers.map((blocker) => ({ ...blocker, routeKey: plan.routeKey })))
  }

  return {
    status: blockers.length ? 'BLOCKED' : targetPlans.some((plan) => ['create_draft', 'update_draft'].includes(plan.action)) ? 'READY_TO_APPLY' : 'ALREADY_READY',
    sourceTemplateId: sourceTemplate?.id || null,
    sourceSectionCount: sourceSections.length,
    routeCount: targetPlans.length,
    actionCount: targetPlans.filter((plan) => ['create_draft', 'update_draft'].includes(plan.action)).length,
    targetPlans,
    blockers,
  }
}

async function fetchSourceTemplate(client) {
  const { data, error } = await client
    .from('document_packet_templates')
    .select(TEMPLATE_SELECT)
    .is('organisation_id', null)
    .eq('module_type', 'agency')
    .eq('packet_type', 'mandate')
    .eq('template_key', 'mandate_default_v1')
    .eq('status', 'published')
    .eq('is_active', true)
    .eq('is_default', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function fetchSections(client, templateIds = []) {
  if (!templateIds.length) return []
  const { data, error } = await client
    .from('document_template_sections')
    .select(SECTION_SELECT)
    .in('template_id', templateIds)
    .order('sort_order', { ascending: true })
    .order('section_key', { ascending: true })
  if (error) throw error
  return data || []
}

async function fetchExistingGlobalMandateTemplates(client) {
  const { data, error } = await client
    .from('document_packet_templates')
    .select(TEMPLATE_SELECT)
    .is('organisation_id', null)
    .eq('module_type', 'agency')
    .eq('packet_type', 'mandate')
  if (error) throw error
  return data || []
}

async function replaceSections(client, templateId, sections = []) {
  const rows = sections.map((section) => ({ ...section, template_id: templateId }))
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

  const { data: definitionJson, error: definitionError } = await client.rpc('bridge_build_template_definition_b1', { p_template_id: templateId })
  if (definitionError) throw definitionError
  if (definitionJson) {
    const { error } = await client
      .from('document_packet_templates')
      .update({ definition_json: definitionJson })
      .eq('id', templateId)
    if (error) throw error
  }
}

async function applyPlan(client, { plan, sourceTemplate, sourceSections, appliedBy, reference } = {}) {
  const applied = []
  const appliedAt = new Date().toISOString()
  for (const target of plan.targetPlans) {
    if (!['create_draft', 'update_draft'].includes(target.action)) continue
    const payload = buildRouteTemplatePayload({
      sourceTemplate,
      route: getMandateTemplateContentRule(target.routeKey),
      sourceSections,
      appliedAt,
      appliedBy,
      reference,
    })
    const { sections, ...templatePayload } = payload
    let templateId = target.existingTemplateId
    if (target.action === 'update_draft') {
      const { data, error } = await client
        .from('document_packet_templates')
        .update(templatePayload)
        .eq('id', templateId)
        .eq('status', 'draft')
        .select('id')
        .single()
      if (error) throw error
      templateId = data.id
    } else {
      const { data, error } = await client
        .from('document_packet_templates')
        .insert(templatePayload)
        .select('id')
        .single()
      if (error) throw error
      templateId = data.id
    }
    await replaceSections(client, templateId, sections)
    applied.push({
      routeKey: target.routeKey,
      action: target.action,
      templateId,
      templateKey: payload.template_key,
      sectionCount: sections.length,
    })
  }
  return applied
}

async function main() {
  const apply = process.argv.includes('--apply')
  const appliedBy = arg('applied-by')
  const reference = arg('reference')
  const confirmRouteCount = Number(arg('confirm-route-count', '0'))
  const outputPath = arg('out', apply
    ? 'docs/mandate-template-global-routes-phase2-apply-report.json'
    : 'docs/mandate-template-global-routes-phase2-dry-run-report.json')

  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !serviceRoleKey) throw new Error('Supabase URL and service role key are required.')

  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const sourceTemplate = await fetchSourceTemplate(client)
  const sourceSections = sourceTemplate?.id ? await fetchSections(client, [sourceTemplate.id]) : []
  const existingTemplates = await fetchExistingGlobalMandateTemplates(client)
  const plan = buildMandateGlobalRouteTemplatePlan({ sourceTemplate, sourceSections, existingTemplates })
  const routeCount = listMandateGlobalRouteTemplates().length
  const blockers = [
    ...plan.blockers,
    ...(apply && process.env[WRITE_FLAG] !== 'true' ? [{ code: 'WRITE_FLAG_MISSING', detail: `${WRITE_FLAG}=true is required with --apply.` }] : []),
    ...(apply && confirmRouteCount !== routeCount ? [{ code: 'CONFIRM_ROUTE_COUNT_MISMATCH', detail: `--confirm-route-count must be ${routeCount}.` }] : []),
    ...(apply && !appliedBy ? [{ code: 'APPLIED_BY_MISSING', detail: '--applied-by is required with --apply.' }] : []),
    ...(apply && !reference ? [{ code: 'REFERENCE_MISSING', detail: '--reference is required with --apply.' }] : []),
  ]

  const applied = apply && !blockers.length
    ? await applyPlan(client, { plan, sourceTemplate, sourceSections, appliedBy, reference })
    : []

  const refreshedTemplates = await fetchExistingGlobalMandateTemplates(client)
  const refreshedPlan = buildMandateGlobalRouteTemplatePlan({ sourceTemplate, sourceSections, existingTemplates: refreshedTemplates })
  const routeTemplateIds = refreshedPlan.targetPlans.map((target) => target.existingTemplateId).filter(Boolean)
  const routeSections = await fetchSections(client, routeTemplateIds)
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    status: blockers.length ? 'BLOCKED' : apply ? 'APPLIED_DRAFTS' : plan.status,
    mutatedData: apply && applied.length > 0,
    projectRef: new URL(url).hostname.split('.')[0],
    version: GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
    sourceTemplateId: sourceTemplate?.id || null,
    sourceTemplateKey: sourceTemplate?.template_key || null,
    sourceSectionCount: sourceSections.length,
    routeCount,
    actionCount: plan.actionCount,
    blockers,
    targetPlans: refreshedPlan.targetPlans.map((target) => ({
      ...target,
      sectionCount: target.existingTemplateId
        ? routeSections.filter((section) => section.template_id === target.existingTemplateId).length
        : 0,
    })),
    applied,
  }

  await writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    status: report.status,
    mode: report.mode,
    mutatedData: report.mutatedData,
    projectRef: report.projectRef,
    routeCount: report.routeCount,
    actionCount: report.actionCount,
    appliedCount: applied.length,
    blockers: blockers.map((blocker) => blocker.code),
    outputPath,
  }, null, 2))
  if (blockers.length) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  await main()
}
