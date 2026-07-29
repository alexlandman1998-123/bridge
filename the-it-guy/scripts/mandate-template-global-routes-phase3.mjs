import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { assessLegalTemplateApproval, PHASE4_B3_RELEASE_CONTRACT, readLegalTemplateApproval } from '../src/core/documents/legalTemplateApproval.js'
import { getMandateTemplateContentRule } from '../src/core/documents/mandateTemplateContentRules.js'
import {
  buildRouteSections,
  GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
  GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG,
  listMandateGlobalRouteTemplates,
  SECTION_SELECT,
  TEMPLATE_SELECT,
} from './mandate-template-global-routes-phase2.mjs'

export const PHASE3_WRITE_FLAG = 'MANDATE_TEMPLATE_GLOBAL_ROUTES_PHASE3_WRITE'
export const GLOBAL_MANDATE_ROUTE_PHASE3_VERSION = 'mandate_global_routes_phase3_publish_approval_v1'
export const GLOBAL_MANDATE_ROUTE_PHASE3_REVIEW_CONTRACT = 'mandate-global-route-derivative-review-v1'

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

const CONTENT_DIGEST_METADATA_EXCLUSION_KEYS = new Set([
  ...LEGAL_RELEASE_METADATA_KEYS,
  'mandate_global_route_phase3_version',
  'mandate_global_route_phase3_published_at',
  'mandate_global_route_phase3_published_by',
  'mandate_global_route_phase3_reference',
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

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)]),
  )
}

function stableJson(value) {
  return JSON.stringify(sortJson(value))
}

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`
}

function stripLegalReleaseClaims(source = {}) {
  return Object.fromEntries(
    Object.entries(object(source)).filter(([key]) => !LEGAL_RELEASE_METADATA_KEYS.has(key)),
  )
}

function stripContentDigestMetadata(source = {}) {
  return Object.fromEntries(
    Object.entries(object(source)).filter(([key]) => !CONTENT_DIGEST_METADATA_EXCLUSION_KEYS.has(key)),
  )
}

function hasLegalReleaseClaims(source = {}) {
  return Object.keys(object(source)).some((key) => LEGAL_RELEASE_METADATA_KEYS.has(key))
}

function routeTemplateKey(routeKey = '') {
  return `mandate_${routeKey}_v1`
}

function timeValue(value) {
  return Date.parse(value || '') || 0
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))].sort()
}

function normalizeSection(section = {}) {
  return {
    section_key: text(section.section_key),
    section_label: text(section.section_label),
    section_type: text(section.section_type || 'legal_text'),
    sort_order: Number.isFinite(Number(section.sort_order)) ? Number(section.sort_order) : 0,
    is_required: section.is_required !== false,
    is_repeatable: section.is_repeatable === true,
    condition_json: sortJson(object(section.condition_json)),
    placeholder_keys: unique(Array.isArray(section.placeholder_keys) ? section.placeholder_keys : []),
    legal_text: String(section.legal_text ?? ''),
    metadata_json: sortJson(stripContentDigestMetadata(section.metadata_json)),
  }
}

function normalizeDefinitionForDigest(definition = {}) {
  const normalized = sortJson(stripContentDigestMetadata(definition))
  if (object(normalized).status === 'active') return { ...normalized, status: 'draft' }
  return normalized
}

function metadataRouteKey(template = {}) {
  const metadata = object(template.metadata_json)
  return text(metadata.mandate_template_variant || metadata.mandateTemplateVariant || metadata.template_variant || metadata.templateVariant)
}

function readSourceApproval(template = {}, assessment = {}) {
  const metadata = object(template.metadata_json)
  const nested = object(metadata.legal_review || metadata.legalReview)
  return {
    ...object(assessment.approval),
    approvedBy: text(metadata.legal_approved_by || metadata.legalApprovedBy || nested.approvedBy),
  }
}

function sectionsForTemplate(sections = [], templateId = '') {
  return sections
    .filter((section) => section.template_id === templateId)
    .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0) || text(left.section_key).localeCompare(text(right.section_key)))
}

export function buildRouteApprovalDigestPayload({ template = {}, route = {}, sections = [] } = {}) {
  return {
    release_contract: GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
    runtime_release_contract: PHASE4_B3_RELEASE_CONTRACT,
    phase2_version: GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
    packet_type: 'mandate',
    module_type: template.module_type || 'agency',
    template_id: text(template.id),
    template_key: text(template.template_key),
    template_label: text(template.template_label),
    version_tag: text(template.version_tag),
    route_key: route.key,
    route_label: route.label,
    seller_clause_profile: route.sellerProfile || null,
    property_clause_profile: route.propertyProfile || null,
    allowed_conditional_pack_keys: unique(route.allowedConditionalPackKeys),
    metadata_json: sortJson(stripContentDigestMetadata(template.metadata_json)),
    definition_schema_version: template.definition_schema_version || 1,
    definition_json: normalizeDefinitionForDigest(template.definition_json),
    sections: sections.map(normalizeSection),
  }
}

export function buildRouteReviewEvidencePayload({ route = {}, sourceApproval = {}, contentDigest = '', reference = '' } = {}) {
  return {
    review_contract: GLOBAL_MANDATE_ROUTE_PHASE3_REVIEW_CONTRACT,
    phase3_version: GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
    decision: 'approved',
    route_key: route.key,
    route_label: route.label,
    content_digest: contentDigest,
    derived_from: {
      source_template_key: 'mandate_default_v1',
      source_content_digest: sourceApproval.contentDigest || null,
      source_review_evidence_digest: sourceApproval.reviewEvidenceDigest || null,
      source_b1_manifest_digest: sourceApproval.b1ManifestDigest || null,
      source_reference: sourceApproval.reference || null,
      source_approved_by: sourceApproval.approvedBy || null,
      source_approved_at: sourceApproval.approvedAt || null,
    },
    reference,
  }
}

export function buildRouteReleaseSet({ sourceTemplate = {}, routeTemplates = [], sourceSections = [], routeSections = [], reference = '' } = {}) {
  const sourceAssessment = assessLegalTemplateApproval(sourceTemplate, { expectedPacketType: 'mandate' })
  const sourceApproval = readSourceApproval(sourceTemplate, sourceAssessment)
  const releaseItems = []

  for (const route of listMandateGlobalRouteTemplates()) {
    const expectedKey = routeTemplateKey(route.key)
    const matchingTemplates = routeTemplates
      .filter((template) => template.template_key === expectedKey || metadataRouteKey(template) === route.key)
      .sort((left, right) => timeValue(right.updated_at || right.created_at) - timeValue(left.updated_at || left.created_at))
    const published = matchingTemplates.find((template) => lower(template.status) === 'published' && template.is_active === true)
    const draft = matchingTemplates.find((template) => lower(template.status) === 'draft')
    const template = published || draft || matchingTemplates[0] || null
    const sections = template ? sectionsForTemplate(routeSections, template.id) : []
    const expectedSections = buildRouteSections(sourceSections, getMandateTemplateContentRule(route.key))
    const digestPayload = template ? buildRouteApprovalDigestPayload({ template, route, sections }) : null
    const contentDigest = digestPayload ? digest(stableJson(digestPayload)) : ''
    const reviewEvidencePayload = contentDigest
      ? buildRouteReviewEvidencePayload({ route, sourceApproval, contentDigest, reference })
      : null
    const reviewEvidenceDigest = reviewEvidencePayload ? digest(stableJson(reviewEvidencePayload)) : ''
    releaseItems.push({
      routeKey: route.key,
      routeLabel: route.label,
      templateKey: expectedKey,
      template,
      templateId: template?.id || null,
      existingStatus: template?.status || null,
      isActive: template?.is_active === true,
      isDefault: template?.is_default === true,
      matchingTemplateCount: matchingTemplates.length,
      activePublishedCount: matchingTemplates.filter((item) => lower(item.status) === 'published' && item.is_active === true).length,
      sectionCount: sections.length,
      expectedSectionCount: expectedSections.length,
      sectionKeys: sections.map((section) => section.section_key),
      expectedSectionKeys: expectedSections.map((section) => section.section_key),
      contentDigest,
      reviewEvidenceDigest,
      digestPayload,
      reviewEvidencePayload,
    })
  }

  const b1ManifestPayload = {
    phase: 'mandate-global-routes-phase3-b1-manifest',
    version: GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
    runtime_release_contract: PHASE4_B3_RELEASE_CONTRACT,
    source_template_id: sourceTemplate?.id || null,
    source_template_key: sourceTemplate?.template_key || null,
    source_approval: {
      contentDigest: sourceApproval.contentDigest || null,
      reviewEvidenceDigest: sourceApproval.reviewEvidenceDigest || null,
      b1ManifestDigest: sourceApproval.b1ManifestDigest || null,
      reference: sourceApproval.reference || null,
      approvedBy: sourceApproval.approvedBy || null,
      approvedAt: sourceApproval.approvedAt || null,
    },
    routes: releaseItems.map((item) => ({
      routeKey: item.routeKey,
      templateId: item.templateId,
      templateKey: item.templateKey,
      sectionKeys: item.sectionKeys,
      contentDigest: item.contentDigest,
      reviewEvidenceDigest: item.reviewEvidenceDigest,
    })),
  }

  return {
    sourceAssessment,
    sourceApproval,
    items: releaseItems,
    b1ManifestPayload,
    b1ManifestDigest: digest(stableJson(b1ManifestPayload)),
  }
}

export function buildMandateGlobalRoutePhase3Plan({ sourceTemplate = null, routeTemplates = [], sourceSections = [], routeSections = [], reference = '' } = {}) {
  const blockers = []
  if (!sourceTemplate?.id) {
    blockers.push({ code: 'SOURCE_TEMPLATE_MISSING', detail: 'A published active global mandate_default_v1 source template is required.' })
  }
  if (!sourceSections.length) {
    blockers.push({ code: 'SOURCE_TEMPLATE_SECTIONS_MISSING', detail: 'The source mandate_default_v1 template must have sections.' })
  }

  const releaseSet = buildRouteReleaseSet({
    sourceTemplate: sourceTemplate || {},
    routeTemplates,
    sourceSections,
    routeSections,
    reference,
  })

  if (!releaseSet.sourceAssessment.approved) {
    blockers.push({
      code: 'SOURCE_TEMPLATE_LEGAL_APPROVAL_MISSING',
      detail: 'The source mandate_default_v1 template must already have valid B3 legal approval metadata.',
      reasons: releaseSet.sourceAssessment.reasons,
    })
  }

  const targetPlans = releaseSet.items.map((item) => {
    const approvalAssessment = item.template
      ? assessLegalTemplateApproval(item.template, { expectedPacketType: 'mandate' })
      : null
    const legalApproval = item.template ? readLegalTemplateApproval(item.template) : {}
    const sectionKeysMatch = stableJson(item.sectionKeys) === stableJson(item.expectedSectionKeys)
    const plan = {
      routeKey: item.routeKey,
      routeLabel: item.routeLabel,
      templateKey: item.templateKey,
      templateId: item.templateId,
      existingStatus: item.existingStatus,
      isActive: item.isActive,
      isDefault: item.isDefault,
      sectionCount: item.sectionCount,
      expectedSectionCount: item.expectedSectionCount,
      contentDigest: item.contentDigest || null,
      reviewEvidenceDigest: item.reviewEvidenceDigest || null,
      b1ManifestDigest: releaseSet.b1ManifestDigest,
      action: 'blocked',
      ready: false,
      blockers: [],
    }

    if (!item.templateId) {
      plan.blockers.push({ code: 'ROUTE_TEMPLATE_MISSING', detail: `Missing Phase 2 route template for ${item.routeKey}.` })
    } else if (item.activePublishedCount > 1) {
      plan.blockers.push({ code: 'ROUTE_TEMPLATE_DUPLICATE_ACTIVE_PUBLISHED', detail: `Route ${item.routeKey} has multiple active published templates.` })
    } else if (item.sectionCount !== item.expectedSectionCount || !sectionKeysMatch) {
      plan.blockers.push({
        code: 'ROUTE_TEMPLATE_SECTION_MISMATCH',
        detail: `Route ${item.routeKey} sections do not match the Phase 2 source-derived pack set.`,
        sectionKeys: item.sectionKeys,
        expectedSectionKeys: item.expectedSectionKeys,
      })
    } else if (lower(item.existingStatus) === 'published' && item.isActive) {
      if (approvalAssessment.approved) {
        if (legalApproval.contentDigest !== item.contentDigest || legalApproval.reviewEvidenceDigest !== item.reviewEvidenceDigest || legalApproval.b1ManifestDigest !== releaseSet.b1ManifestDigest) {
          plan.blockers.push({
            code: 'ROUTE_TEMPLATE_APPROVAL_DIGEST_DRIFT',
            detail: `Route ${item.routeKey} is approved, but its approval digests do not match the current Phase 3 release set.`,
          })
        } else {
          plan.action = 'already_released'
          plan.ready = true
        }
      } else {
        plan.action = 'apply_b3'
        plan.ready = true
      }
    } else if (lower(item.existingStatus) === 'draft' && item.isActive !== true && item.isDefault !== true) {
      if (hasLegalReleaseClaims(item.template.metadata_json)) {
        plan.blockers.push({
          code: 'DRAFT_TEMPLATE_HAS_LEGAL_RELEASE_CLAIMS',
          detail: `Route ${item.routeKey} draft carries legal approval metadata. Recreate the draft before publishing.`,
        })
      } else {
        plan.action = 'publish_and_apply_b3'
        plan.ready = true
      }
    } else {
      plan.blockers.push({
        code: 'ROUTE_TEMPLATE_STATE_UNEXPECTED',
        detail: `Expected draft inactive non-default or active published route template; found status=${item.existingStatus}, is_active=${item.isActive}, is_default=${item.isDefault}.`,
      })
    }

    blockers.push(...plan.blockers.map((blocker) => ({ ...blocker, routeKey: item.routeKey })))
    return plan
  })

  const actionCount = targetPlans.filter((plan) => ['publish_and_apply_b3', 'apply_b3'].includes(plan.action)).length
  return {
    status: blockers.length ? 'BLOCKED' : actionCount ? 'READY_TO_RELEASE' : 'ALREADY_RELEASED',
    version: GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
    sourceTemplateId: sourceTemplate?.id || null,
    sourceTemplateKey: sourceTemplate?.template_key || null,
    sourceApproval: releaseSet.sourceApproval,
    routeCount: targetPlans.length,
    actionCount,
    b1ManifestDigest: releaseSet.b1ManifestDigest,
    targetPlans,
    releaseSet,
    blockers,
  }
}

export function buildB3ApprovalBatch({ plan = {}, targetPlans = [], appliedBy = '', reference = '' } = {}) {
  const sourceApproval = plan.sourceApproval || {}
  return targetPlans
    .filter((target) => ['publish_and_apply_b3', 'apply_b3'].includes(target.action))
    .map((target) => ({
      templateId: target.templateId,
      packetType: 'mandate',
      decision: 'approved',
      contentDigest: target.contentDigest,
      reviewEvidenceDigest: target.reviewEvidenceDigest,
      reviewedBy: sourceApproval.approvedBy || appliedBy,
      reviewedAt: sourceApproval.approvedAt,
      reviewReference: `${sourceApproval.reference || reference}-ROUTE-${target.routeKey.toUpperCase()}`,
    }))
}

export function buildTemplateVersionPayload({ template = {}, sections = [], appliedAt = '' } = {}) {
  const placeholderKeys = unique(sections.flatMap((section) => Array.isArray(section.placeholder_keys) ? section.placeholder_keys : []))
  return {
    template_id: template.id,
    organisation_id: template.organisation_id,
    module_type: template.module_type,
    packet_type: template.packet_type,
    template_key: template.template_key,
    template_label: template.template_label,
    template_format: template.template_format,
    version_tag: template.version_tag || GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG,
    status: 'published',
    storage_bucket: template.template_storage_bucket,
    storage_path: template.template_storage_path,
    file_name: template.template_file_name,
    description: template.description,
    sections_snapshot_json: template.definition_json?.sections || sections.map(normalizeSection),
    placeholder_keys: placeholderKeys,
    metadata_json: template.metadata_json || {},
    definition_schema_version: template.definition_schema_version || 1,
    definition_json: template.definition_json || {},
    created_by: template.created_by,
    updated_by: null,
    published_by: null,
    created_at: template.created_at,
    updated_at: appliedAt,
    published_at: template.published_at || appliedAt,
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

async function fetchGlobalMandateRouteTemplates(client) {
  const keys = listMandateGlobalRouteTemplates().map((route) => routeTemplateKey(route.key))
  const { data, error } = await client
    .from('document_packet_templates')
    .select(TEMPLATE_SELECT)
    .is('organisation_id', null)
    .eq('module_type', 'agency')
    .eq('packet_type', 'mandate')
    .in('template_key', keys)
  if (error) throw error
  return data || []
}

async function fetchRouteProvenance(client, templateIds = []) {
  if (!templateIds.length) return []
  const { data, error } = await client
    .from('document_packet_template_release_provenance_phase4')
    .select('template_id, audit_event_id, content_digest, review_evidence_digest, b1_manifest_digest, review_reference, reviewed_by, reviewed_at, b3_applied_at, b3_applied_by, b3_application_reference, release_contract')
    .in('template_id', templateIds)
    .eq('release_contract', PHASE4_B3_RELEASE_CONTRACT)
  if (error) throw error
  return data || []
}

async function publishRouteTemplate(client, template = {}, { appliedAt = '', appliedBy = '', reference = '' } = {}) {
  const metadata = {
    ...stripLegalReleaseClaims(template.metadata_json),
    mandate_global_route_phase3_version: GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
    mandate_global_route_phase3_published_at: appliedAt,
    mandate_global_route_phase3_published_by: appliedBy,
    mandate_global_route_phase3_reference: reference,
  }
  const { data, error } = await client
    .from('document_packet_templates')
    .update({
      revision_root_template_id: template.revision_root_template_id || template.id,
      status: 'published',
      is_active: true,
      is_default: false,
      published_at: appliedAt,
      archived_at: null,
      archived_by: null,
      metadata_json: metadata,
      updated_at: appliedAt,
    })
    .eq('id', template.id)
    .eq('status', 'draft')
    .select(TEMPLATE_SELECT)
    .single()
  if (error) throw error
  return data
}

async function applyB3Approval(client, approvals = [], { b1ManifestDigest = '', appliedBy = '', reference = '' } = {}) {
  if (!approvals.length) return null
  const { data, error } = await client.rpc('bridge_apply_legal_document_counsel_approvals', {
    p_b1_manifest_digest: b1ManifestDigest,
    p_approvals: approvals,
    p_applied_by: appliedBy,
    p_application_reference: reference,
  })
  if (error) throw error
  return data
}

async function upsertPublishedVersions(client, templates = [], sections = [], { appliedAt = '' } = {}) {
  const versionRows = templates.map((template) => buildTemplateVersionPayload({
    template,
    sections: sectionsForTemplate(sections, template.id),
    appliedAt,
  }))
  if (!versionRows.length) return []
  const { error } = await client
    .from('document_packet_template_versions')
    .upsert(versionRows, { onConflict: 'template_id,version_tag' })
  if (error) throw error
  return versionRows.map((row) => ({ templateId: row.template_id, versionTag: row.version_tag }))
}

async function applyPlan(client, { plan, routeTemplates = [], routeSections = [], appliedBy = '', reference = '' } = {}) {
  const appliedAt = new Date().toISOString()
  const byId = new Map(routeTemplates.map((template) => [template.id, template]))
  const published = []
  for (const target of plan.targetPlans.filter((item) => item.action === 'publish_and_apply_b3')) {
    const template = byId.get(target.templateId)
    const updated = await publishRouteTemplate(client, template, { appliedAt, appliedBy, reference })
    published.push({
      routeKey: target.routeKey,
      templateId: updated.id,
      templateKey: updated.template_key,
      status: updated.status,
      isActive: updated.is_active,
      isDefault: updated.is_default,
      publishedAt: updated.published_at,
    })
  }

  const b3Approvals = buildB3ApprovalBatch({ plan, targetPlans: plan.targetPlans, appliedBy, reference })
  const b3Result = await applyB3Approval(client, b3Approvals, {
    b1ManifestDigest: plan.b1ManifestDigest,
    appliedBy,
    reference,
  })

  const routeIds = plan.targetPlans.map((target) => target.templateId).filter(Boolean)
  const refreshed = await fetchGlobalMandateRouteTemplates(client)
  const refreshedTargets = refreshed.filter((template) => routeIds.includes(template.id))
  const refreshedSections = await fetchSections(client, routeIds)
  const versions = await upsertPublishedVersions(client, refreshedTargets, refreshedSections, { appliedAt })

  return {
    appliedAt,
    published,
    b3Approvals,
    b3Result,
    versions,
    routeSections: refreshedSections,
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const appliedBy = arg('applied-by')
  const reference = arg('reference')
  const confirmRouteCount = Number(arg('confirm-route-count', '0'))
  const outputPath = arg('out', apply
    ? 'docs/mandate-template-global-routes-phase3-apply-report.json'
    : 'docs/mandate-template-global-routes-phase3-dry-run-report.json')

  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !serviceRoleKey) throw new Error('Supabase URL and service role key are required.')

  const routeCount = listMandateGlobalRouteTemplates().length
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const sourceTemplate = await fetchSourceTemplate(client)
  const routeTemplates = await fetchGlobalMandateRouteTemplates(client)
  const sourceSections = sourceTemplate?.id ? await fetchSections(client, [sourceTemplate.id]) : []
  const routeSections = await fetchSections(client, routeTemplates.map((template) => template.id))
  const plan = buildMandateGlobalRoutePhase3Plan({
    sourceTemplate,
    routeTemplates,
    sourceSections,
    routeSections,
    reference,
  })
  const blockers = [
    ...plan.blockers,
    ...(apply && process.env[PHASE3_WRITE_FLAG] !== 'true' ? [{ code: 'WRITE_FLAG_MISSING', detail: `${PHASE3_WRITE_FLAG}=true is required with --apply.` }] : []),
    ...(apply && confirmRouteCount !== routeCount ? [{ code: 'CONFIRM_ROUTE_COUNT_MISMATCH', detail: `--confirm-route-count must be ${routeCount}.` }] : []),
    ...(apply && !appliedBy ? [{ code: 'APPLIED_BY_MISSING', detail: '--applied-by is required with --apply.' }] : []),
    ...(apply && !reference ? [{ code: 'REFERENCE_MISSING', detail: '--reference is required with --apply.' }] : []),
  ]

  const applied = apply && !blockers.length
    ? await applyPlan(client, { plan, routeTemplates, routeSections, appliedBy, reference })
    : null

  const refreshedSource = await fetchSourceTemplate(client)
  const refreshedTemplates = await fetchGlobalMandateRouteTemplates(client)
  const refreshedSourceSections = refreshedSource?.id ? await fetchSections(client, [refreshedSource.id]) : []
  const refreshedSections = await fetchSections(client, refreshedTemplates.map((template) => template.id))
  const refreshedPlan = buildMandateGlobalRoutePhase3Plan({
    sourceTemplate: refreshedSource,
    routeTemplates: refreshedTemplates,
    sourceSections: refreshedSourceSections,
    routeSections: refreshedSections,
    reference,
  })
  const provenanceRows = await fetchRouteProvenance(client, refreshedPlan.targetPlans.map((target) => target.templateId).filter(Boolean))
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    status: blockers.length ? 'BLOCKED' : apply ? 'RELEASED' : plan.status,
    mutatedData: Boolean(apply && applied && (applied.published.length || applied.b3Approvals.length || applied.versions.length)),
    projectRef: new URL(url).hostname.split('.')[0],
    version: GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
    phase2Version: GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
    routeCount,
    actionCount: plan.actionCount,
    sourceTemplateId: refreshedSource?.id || null,
    sourceTemplateKey: refreshedSource?.template_key || null,
    b1ManifestDigest: refreshedPlan.b1ManifestDigest,
    blockers,
    targetPlans: refreshedPlan.targetPlans.map((target) => ({
      ...target,
      provenanceCount: provenanceRows.filter((row) => row.template_id === target.templateId).length,
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
    releasedCount: refreshedPlan.targetPlans.filter((target) => target.action === 'already_released').length,
    blockers: blockers.map((blocker) => blocker.code),
    outputPath,
    b1ManifestDigest: report.b1ManifestDigest,
  }, null, 2))
  if (blockers.length) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  await main()
}
