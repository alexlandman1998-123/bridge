import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PHASE4_B3_RELEASE_CONTRACT } from '../src/core/documents/legalTemplateApproval.js'
import {
  buildMandateGlobalRoutePhase3Plan,
  GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
} from './mandate-template-global-routes-phase3.mjs'
import {
  buildRouteSections,
  GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
  GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG,
  listMandateGlobalRouteTemplates,
  SECTION_SELECT,
  TEMPLATE_SELECT,
} from './mandate-template-global-routes-phase2.mjs'

export const GLOBAL_MANDATE_ROUTE_PHASE4_COVERAGE_AUDIT_VERSION = 'mandate_global_routes_phase4_coverage_audit_v1'

function arg(name, fallback = '') {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3).trim() || fallback
}

function text(value) {
  return String(value ?? '').trim()
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function routeTemplateKey(routeKey = '') {
  return `mandate_${routeKey}_v1`
}

function routeCoverageMatrix(routes = listMandateGlobalRouteTemplates()) {
  return {
    sellerProfiles: [...new Set(routes.map((route) => route.sellerProfile).filter(Boolean))].sort(),
    propertyProfiles: [...new Set(routes.map((route) => route.propertyProfile).filter(Boolean))].sort(),
    routeKeys: routes.map((route) => route.key),
    templateKeys: routes.map((route) => routeTemplateKey(route.key)),
  }
}

function sectionsForTemplate(sections = [], templateId = '') {
  return sections
    .filter((section) => section.template_id === templateId)
    .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0) || text(left.section_key).localeCompare(text(right.section_key)))
}

function latestVersionForTemplate(versionRows = [], templateId = '') {
  return versionRows
    .filter((row) => row.template_id === templateId)
    .sort((left, right) => Date.parse(right.updated_at || right.published_at || right.created_at || '') - Date.parse(left.updated_at || left.published_at || left.created_at || ''))[0] || null
}

function matchingProvenance(provenanceRows = [], target = {}) {
  return provenanceRows.find((row) => (
    row.template_id === target.templateId
    && row.release_contract === PHASE4_B3_RELEASE_CONTRACT
    && row.content_digest === target.contentDigest
    && row.review_evidence_digest === target.reviewEvidenceDigest
    && row.b1_manifest_digest === target.b1ManifestDigest
  )) || null
}

function addIssue(issues, code, detail, extra = {}) {
  issues.push({ code, detail, ...extra })
}

export function buildMandateGlobalRouteCoverageAudit({
  sourceTemplate = null,
  routeTemplates = [],
  sourceSections = [],
  routeSections = [],
  provenanceRows = [],
  versionRows = [],
  reference = 'phase3-global-mandate-route-library',
  checkedAt = new Date().toISOString(),
} = {}) {
  const expectedRoutes = listMandateGlobalRouteTemplates()
  const phase3Plan = buildMandateGlobalRoutePhase3Plan({
    sourceTemplate,
    routeTemplates,
    sourceSections,
    routeSections,
    reference,
  })
  const issues = []

  if (expectedRoutes.length !== 8) {
    addIssue(issues, 'ROUTE_LIBRARY_CARDINALITY_CHANGED', `Expected exactly 8 mandate route variants; found ${expectedRoutes.length}.`)
  }
  if (phase3Plan.status !== 'ALREADY_RELEASED') {
    addIssue(issues, 'PHASE3_RELEASE_NOT_COMPLETE', `Phase 3 status is ${phase3Plan.status}; expected ALREADY_RELEASED.`, {
      phase3Blockers: phase3Plan.blockers,
    })
  }

  const routeRows = phase3Plan.targetPlans.map((target) => {
    const route = expectedRoutes.find((item) => item.key === target.routeKey) || {}
    const template = routeTemplates.find((item) => item.id === target.templateId) || null
    const metadata = object(template?.metadata_json)
    const sections = sectionsForTemplate(routeSections, target.templateId)
    const expectedSections = buildRouteSections(sourceSections, route)
    const provenance = matchingProvenance(provenanceRows, target)
    const version = latestVersionForTemplate(versionRows, target.templateId)
    const blockers = []

    if (!template) addIssue(blockers, 'ROUTE_TEMPLATE_MISSING', `Missing template row for ${target.routeKey}.`)
    if (template && template.status !== 'published') addIssue(blockers, 'ROUTE_TEMPLATE_NOT_PUBLISHED', `Route ${target.routeKey} is ${template.status}; expected published.`)
    if (template && template.is_active !== true) addIssue(blockers, 'ROUTE_TEMPLATE_NOT_ACTIVE', `Route ${target.routeKey} is not active.`)
    if (template && template.is_default === true) addIssue(blockers, 'ROUTE_TEMPLATE_SHOULD_NOT_BE_DEFAULT', `Route ${target.routeKey} should not be marked default.`)
    if (template && metadata.template_scope !== 'global_route_variant') addIssue(blockers, 'ROUTE_TEMPLATE_SCOPE_INVALID', `Route ${target.routeKey} does not declare global_route_variant scope.`)
    if (template && metadata.mandate_template_variant !== target.routeKey) addIssue(blockers, 'ROUTE_TEMPLATE_VARIANT_INVALID', `Route ${target.routeKey} metadata variant does not match.`)
    if (template && metadata.seller_clause_profile !== route.sellerProfile) addIssue(blockers, 'ROUTE_SELLER_PROFILE_INVALID', `Route ${target.routeKey} seller profile does not match.`)
    if (template && metadata.property_clause_profile !== route.propertyProfile) addIssue(blockers, 'ROUTE_PROPERTY_PROFILE_INVALID', `Route ${target.routeKey} property profile does not match.`)
    if (target.action !== 'already_released') addIssue(blockers, 'ROUTE_NOT_ALREADY_RELEASED', `Route ${target.routeKey} action is ${target.action}; expected already_released.`)
    if (target.sectionCount !== target.expectedSectionCount) addIssue(blockers, 'ROUTE_SECTION_COUNT_MISMATCH', `Route ${target.routeKey} section count is ${target.sectionCount}; expected ${target.expectedSectionCount}.`)
    if (JSON.stringify(sections.map((section) => section.section_key)) !== JSON.stringify(expectedSections.map((section) => section.section_key))) {
      addIssue(blockers, 'ROUTE_SECTION_KEYS_MISMATCH', `Route ${target.routeKey} section keys do not match the source-derived route pack set.`)
    }
    if (!provenance) addIssue(blockers, 'ROUTE_B3_PROVENANCE_MISSING', `Route ${target.routeKey} is missing matching Phase 4 B3 provenance.`)
    if (!version) addIssue(blockers, 'ROUTE_VERSION_SNAPSHOT_MISSING', `Route ${target.routeKey} is missing a template version snapshot.`)
    if (version && version.status !== 'published') addIssue(blockers, 'ROUTE_VERSION_NOT_PUBLISHED', `Route ${target.routeKey} version snapshot is ${version.status}; expected published.`)
    if (version && version.version_tag !== GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG) addIssue(blockers, 'ROUTE_VERSION_TAG_MISMATCH', `Route ${target.routeKey} version tag is ${version.version_tag}; expected ${GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG}.`)

    issues.push(...blockers.map((issue) => ({ ...issue, routeKey: target.routeKey, templateId: target.templateId })))

    return {
      routeKey: target.routeKey,
      routeLabel: target.routeLabel,
      templateId: target.templateId,
      templateKey: target.templateKey,
      sellerProfile: route.sellerProfile || null,
      propertyProfile: route.propertyProfile || null,
      allowedConditionalPackKeys: route.allowedConditionalPackKeys || [],
      status: blockers.length ? 'blocked' : 'covered',
      published: template?.status === 'published',
      active: template?.is_active === true,
      isDefault: template?.is_default === true,
      sectionCount: target.sectionCount,
      expectedSectionCount: target.expectedSectionCount,
      contentDigest: target.contentDigest,
      reviewEvidenceDigest: target.reviewEvidenceDigest,
      b1ManifestDigest: target.b1ManifestDigest,
      provenanceMatched: Boolean(provenance),
      versionSnapshotMatched: Boolean(version && version.status === 'published' && version.version_tag === GLOBAL_MANDATE_ROUTE_TEMPLATE_VERSION_TAG),
      blockers,
    }
  })

  const coveredRows = routeRows.filter((row) => row.status === 'covered')
  const matrix = routeCoverageMatrix(expectedRoutes)
  return {
    auditVersion: GLOBAL_MANDATE_ROUTE_PHASE4_COVERAGE_AUDIT_VERSION,
    checkedAt,
    mutatedData: false,
    status: issues.length ? 'BLOCKED' : 'COVERED',
    phase2Version: GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
    phase3Version: GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
    runtimeReleaseContract: PHASE4_B3_RELEASE_CONTRACT,
    sourceTemplateId: sourceTemplate?.id || null,
    sourceTemplateKey: sourceTemplate?.template_key || null,
    b1ManifestDigest: phase3Plan.b1ManifestDigest,
    summary: {
      expectedRouteCount: expectedRoutes.length,
      coveredRouteCount: coveredRows.length,
      blockedRouteCount: routeRows.length - coveredRows.length,
      publishedRouteCount: routeRows.filter((row) => row.published).length,
      activeRouteCount: routeRows.filter((row) => row.active).length,
      provenanceMatchedCount: routeRows.filter((row) => row.provenanceMatched).length,
      versionSnapshotMatchedCount: routeRows.filter((row) => row.versionSnapshotMatched).length,
      sellerProfileCount: matrix.sellerProfiles.length,
      propertyProfileCount: matrix.propertyProfiles.length,
    },
    matrix,
    phase3Status: phase3Plan.status,
    routeRows,
    blockers: issues,
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

async function fetchGlobalRouteTemplates(client) {
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

async function fetchProvenance(client, templateIds = []) {
  if (!templateIds.length) return []
  const { data, error } = await client
    .from('document_packet_template_release_provenance_phase4')
    .select('template_id, audit_event_id, content_digest, review_evidence_digest, b1_manifest_digest, review_reference, reviewed_by, reviewed_at, b3_applied_at, b3_applied_by, b3_application_reference, release_contract')
    .in('template_id', templateIds)
    .eq('release_contract', PHASE4_B3_RELEASE_CONTRACT)
  if (error) throw error
  return data || []
}

async function fetchVersions(client, templateIds = []) {
  if (!templateIds.length) return []
  const { data, error } = await client
    .from('document_packet_template_versions')
    .select('id, template_id, version_tag, status, sections_snapshot_json, placeholder_keys, metadata_json, published_at, created_at, updated_at')
    .in('template_id', templateIds)
  if (error) throw error
  return data || []
}

async function main() {
  const outputPath = arg('out', 'docs/mandate-template-global-routes-phase4-coverage-audit-report.json')
  const reference = arg('reference', 'phase3-global-mandate-route-library')
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !serviceRoleKey) throw new Error('Supabase URL and service role key are required.')

  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const sourceTemplate = await fetchSourceTemplate(client)
  const routeTemplates = await fetchGlobalRouteTemplates(client)
  const sourceSections = sourceTemplate?.id ? await fetchSections(client, [sourceTemplate.id]) : []
  const routeSections = await fetchSections(client, routeTemplates.map((template) => template.id))
  const templateIds = routeTemplates.map((template) => template.id).filter(Boolean)
  const provenanceRows = await fetchProvenance(client, templateIds)
  const versionRows = await fetchVersions(client, templateIds)
  const audit = buildMandateGlobalRouteCoverageAudit({
    sourceTemplate,
    routeTemplates,
    sourceSections,
    routeSections,
    provenanceRows,
    versionRows,
    reference,
  })

  const report = {
    ...audit,
    projectRef: new URL(url).hostname.split('.')[0],
  }

  await writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    status: report.status,
    mutatedData: report.mutatedData,
    projectRef: report.projectRef,
    expectedRouteCount: report.summary.expectedRouteCount,
    coveredRouteCount: report.summary.coveredRouteCount,
    provenanceMatchedCount: report.summary.provenanceMatchedCount,
    versionSnapshotMatchedCount: report.summary.versionSnapshotMatchedCount,
    blockers: report.blockers.map((blocker) => blocker.code),
    outputPath,
  }, null, 2))
  if (report.status !== 'COVERED') process.exitCode = 1
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  await main()
}
