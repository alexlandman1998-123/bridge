import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  assessLegalTemplateApproval,
  PHASE4_B3_RELEASE_CONTRACT,
} from '../src/core/documents/legalTemplateApproval.js'
import {
  mandateTemplateSelectionMatchesSpecificRoute,
  resolveSignableTemplatePolicy,
  selectSignableMandateRouteSelection,
} from '../src/core/documents/documentGenerationContainment.js'
import {
  resolveMandateTemplateRoutingMetadata,
  scoreMandateTemplateCandidate,
} from '../src/core/documents/mandateTemplateRouting.js'
import {
  GLOBAL_MANDATE_ROUTE_PHASE4_COVERAGE_AUDIT_VERSION,
  buildMandateGlobalRouteCoverageAudit,
} from './mandate-template-global-routes-phase4-coverage-audit.mjs'
import {
  GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
} from './mandate-template-global-routes-phase3.mjs'
import {
  GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
  SECTION_SELECT,
  TEMPLATE_SELECT,
  listMandateGlobalRouteTemplates,
} from './mandate-template-global-routes-phase2.mjs'

export const GLOBAL_MANDATE_ROUTE_PHASE5_ORGANISATION_ROLLOUT_VERSION = 'mandate_global_routes_phase5_organisation_rollout_v1'

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

function routeTemplateKey(routeKey = '') {
  return `mandate_${routeKey}_v1`
}

function templateUpdatedTime(template = {}) {
  return Date.parse(template.updated_at || template.updatedAt || template.published_at || template.publishedAt || template.created_at || template.createdAt || '') || 0
}

function routeProfile(route = {}) {
  return {
    templateVariant: route.key,
    clauseProfile: route.key,
    sellerClauseProfile: route.sellerProfile,
    propertyClauseProfile: route.propertyProfile,
    propertyTitleType: route.propertyProfile,
  }
}

function isPublishedActiveMandateTemplate(template = {}) {
  return lower(template.packet_type || template.packetType) === 'mandate' &&
    lower(template.module_type || template.moduleType || 'agency') === 'agency' &&
    ['published', 'active', 'approved', 'live'].includes(lower(template.status)) &&
    template.is_active !== false
}

function metadataVariant(template = {}) {
  const metadata = object(template.metadata_json || template.metadataJson)
  return text(metadata.mandate_template_variant || metadata.mandateTemplateVariant || metadata.template_variant || metadata.templateVariant)
}

function isGlobalRouteTemplate(template = {}, route = {}) {
  return !text(template.organisation_id || template.organisationId) &&
    text(template.template_key || template.templateKey) === routeTemplateKey(route.key) &&
    metadataVariant(template) === route.key
}

function isOrganisationTemplate(template = {}, organisationId = '') {
  return text(template.organisation_id || template.organisationId) === organisationId
}

function isGenericOrganisationTemplate(template = {}, organisationId = '') {
  if (!isOrganisationTemplate(template, organisationId)) return false
  return !resolveMandateTemplateRoutingMetadata(template).hasRoutingMetadata
}

function compareRoutingSelection(left = {}, right = {}, organisationId = '') {
  if (right.score !== left.score) return right.score - left.score
  const leftOrg = isOrganisationTemplate(left.template, organisationId) ? 0 : 1
  const rightOrg = isOrganisationTemplate(right.template, organisationId) ? 0 : 1
  if (leftOrg !== rightOrg) return leftOrg - rightOrg
  if (Boolean(left.template?.is_default) !== Boolean(right.template?.is_default)) return left.template?.is_default ? -1 : 1
  const updatedDelta = templateUpdatedTime(right.template) - templateUpdatedTime(left.template)
  if (updatedDelta) return updatedDelta
  return text(left.template?.id).localeCompare(text(right.template?.id))
}

function scoreRouteTemplates({ organisationId = '', route = {}, templates = [] } = {}) {
  const profile = routeProfile(route)
  return (Array.isArray(templates) ? templates : [])
    .filter((template) => isPublishedActiveMandateTemplate(template))
    .filter((template) => {
      const owner = text(template.organisation_id || template.organisationId)
      return !owner || owner === organisationId
    })
    .map((template) => scoreMandateTemplateCandidate(template, { scenarioProfile: profile }))
    .filter((row) => row.compatible)
    .sort((left, right) => compareRoutingSelection(left, right, organisationId))
}

function addIssue(issues, code, detail, extra = {}) {
  issues.push({ code, detail, ...extra })
}

function buildOrganisationRouteRow({ organisation = {}, route = {}, templates = [] } = {}) {
  const organisationId = text(organisation.id || organisation.organisation_id || organisation.organisationId)
  const scored = scoreRouteTemplates({ organisationId, route, templates })
  const selection = selectSignableMandateRouteSelection(scored)
  const selected = selection?.template || null
  const matchedSpecificRoute = mandateTemplateSelectionMatchesSpecificRoute(selection)
  const resolutionSource = selected
    ? matchedSpecificRoute ? 'mandate_scenario_variant' : 'mandate_scenario_fallback'
    : 'none'
  const policy = selected
    ? resolveSignableTemplatePolicy({
        packetType: 'mandate',
        template: selected,
        resolutionSource,
      })
    : { ok: false, code: 'TEMPLATE_SELECTION_REQUIRED' }
  const approval = selected ? assessLegalTemplateApproval(selected, { expectedPacketType: 'mandate' }) : null
  const selectedOrgTemplate = selected ? isOrganisationTemplate(selected, organisationId) : false
  const selectedGlobalRoute = selected ? isGlobalRouteTemplate(selected, route) : false
  const genericOrgTemplateCount = templates.filter((template) => (
    isPublishedActiveMandateTemplate(template) && isGenericOrganisationTemplate(template, organisationId)
  )).length
  const orgSpecificRouteCandidateCount = scored.filter((row) => (
    isOrganisationTemplate(row.template, organisationId) && mandateTemplateSelectionMatchesSpecificRoute(row)
  )).length
  const blockers = []
  const warnings = []

  if (!selected) {
    addIssue(blockers, 'ORG_ROUTE_SELECTION_MISSING', `Organisation ${organisationId} has no selectable mandate template for ${route.key}.`)
  } else if (!policy.ok) {
    addIssue(blockers, policy.code || 'ORG_ROUTE_SELECTION_POLICY_FAILED', policy.message || `Route ${route.key} failed signable template policy.`, {
      policy,
    })
  }

  if (selected && !approval?.approved) {
    addIssue(blockers, selectedOrgTemplate && matchedSpecificRoute
      ? 'ORG_ROUTE_OVERRIDE_NOT_B3_APPROVED'
      : 'ORG_SELECTED_TEMPLATE_NOT_B3_APPROVED',
    `Selected template for ${organisationId}/${route.key} is not B3-approved.`, {
      selectedTemplateId: selected.id,
      selectedTemplateKey: selected.template_key || selected.templateKey || null,
      approvalReasons: approval?.reasons || [],
    })
  }

  if (selected && !selectedGlobalRoute && !(selectedOrgTemplate && matchedSpecificRoute && approval?.approved)) {
    addIssue(blockers, 'ORG_ROUTE_SELECTION_NOT_APPROVED_GLOBAL_OR_ORG_ROUTE', `Route ${route.key} selected an unexpected template for organisation ${organisationId}.`, {
      selectedTemplateId: selected.id,
      selectedTemplateKey: selected.template_key || selected.templateKey || null,
      selectedOrganisationId: selected.organisation_id || null,
      matchReasons: selection.reasons || [],
    })
  }

  if (genericOrgTemplateCount > 0 && selectedGlobalRoute) {
    warnings.push({
      code: 'ORG_GENERIC_MANDATE_TEMPLATE_BYPASSED',
      detail: `${genericOrgTemplateCount} generic organisation mandate template(s) were safely bypassed for ${route.key}.`,
    })
  }
  if (selectedOrgTemplate && matchedSpecificRoute && approval?.approved) {
    warnings.push({
      code: 'ORG_APPROVED_ROUTE_OVERRIDE_SELECTED',
      detail: `Organisation ${organisationId} has an approved route-specific override for ${route.key}.`,
    })
  }

  return {
    routeKey: route.key,
    routeLabel: route.label,
    sellerProfile: route.sellerProfile,
    propertyProfile: route.propertyProfile,
    status: blockers.length ? 'blocked' : 'ready',
    selectedTemplateId: selected?.id || null,
    selectedTemplateKey: selected?.template_key || selected?.templateKey || null,
    selectedTemplateOrganisationId: selected?.organisation_id || selected?.organisationId || null,
    selectedSource: selectedGlobalRoute ? 'global_route_library' : selectedOrgTemplate ? 'organisation_route_override' : resolutionSource,
    resolutionSource,
    matchReasons: selection?.reasons || [],
    selectedTemplateApproved: approval?.approved === true,
    selectedApprovalReasons: approval?.reasons || [],
    candidateCount: scored.length,
    genericOrgTemplateCount,
    orgSpecificRouteCandidateCount,
    blockers,
    warnings,
  }
}

export function buildMandateGlobalRouteOrganisationRollout({
  coverageAudit = null,
  organisations = [],
  globalRouteTemplates = [],
  organisationTemplates = [],
  checkedAt = new Date().toISOString(),
} = {}) {
  const blockers = []
  const warnings = []
  const routes = listMandateGlobalRouteTemplates()
  const templates = [...globalRouteTemplates, ...organisationTemplates]
  const activeOrganisations = (Array.isArray(organisations) ? organisations : [])
    .map((organisation) => ({
      id: text(organisation.id || organisation.organisation_id || organisation.organisationId),
      name: text(organisation.name || organisation.organisation_name || organisation.organisationName),
      type: text(organisation.type || organisation.organisation_type || organisation.organisationType),
      status: text(organisation.status || organisation.lifecycle_status || organisation.lifecycleStatus),
    }))
    .filter((organisation) => organisation.id)

  if (!coverageAudit || coverageAudit.status !== 'COVERED') {
    addIssue(blockers, 'PHASE4_COVERAGE_NOT_COVERED', 'Phase 5 rollout requires a covered Phase 4 global route library audit.', {
      phase4Status: coverageAudit?.status || null,
    })
  }
  if (!activeOrganisations.length) {
    addIssue(blockers, 'NO_ACTIVE_AGENCY_ORGANISATIONS', 'No active agency organisations were available for rollout verification.')
  }

  const organisationRows = activeOrganisations.map((organisation) => {
    const routeRows = routes.map((route) => buildOrganisationRouteRow({
      organisation,
      route,
      templates,
    }))
    const orgBlockers = routeRows.flatMap((row) => row.blockers.map((blocker) => ({
      ...blocker,
      organisationId: organisation.id,
      organisationName: organisation.name || null,
      routeKey: row.routeKey,
    })))
    const orgWarnings = routeRows.flatMap((row) => row.warnings.map((warning) => ({
      ...warning,
      organisationId: organisation.id,
      organisationName: organisation.name || null,
      routeKey: row.routeKey,
    })))
    blockers.push(...orgBlockers)
    warnings.push(...orgWarnings)
    return {
      organisationId: organisation.id,
      organisationName: organisation.name || null,
      organisationType: organisation.type || null,
      organisationStatus: organisation.status || null,
      status: orgBlockers.length ? 'blocked' : 'ready',
      readyRouteCount: routeRows.filter((row) => row.status === 'ready').length,
      blockedRouteCount: routeRows.filter((row) => row.status === 'blocked').length,
      globalRouteSelectionCount: routeRows.filter((row) => row.selectedSource === 'global_route_library').length,
      organisationOverrideSelectionCount: routeRows.filter((row) => row.selectedSource === 'organisation_route_override').length,
      genericOrgTemplateBypassCount: routeRows.filter((row) => row.warnings.some((warning) => warning.code === 'ORG_GENERIC_MANDATE_TEMPLATE_BYPASSED')).length,
      routeRows,
    }
  })

  const readyOrganisations = organisationRows.filter((row) => row.status === 'ready')
  return {
    rolloutVersion: GLOBAL_MANDATE_ROUTE_PHASE5_ORGANISATION_ROLLOUT_VERSION,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'BLOCKED' : 'ROLLOUT_READY',
    phase2Version: GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
    phase3Version: GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
    phase4Version: GLOBAL_MANDATE_ROUTE_PHASE4_COVERAGE_AUDIT_VERSION,
    runtimeReleaseContract: PHASE4_B3_RELEASE_CONTRACT,
    summary: {
      organisationCount: organisationRows.length,
      readyOrganisationCount: readyOrganisations.length,
      blockedOrganisationCount: organisationRows.length - readyOrganisations.length,
      routeCount: routes.length,
      organisationRouteCheckCount: organisationRows.length * routes.length,
      readyRouteCheckCount: organisationRows.reduce((total, row) => total + row.readyRouteCount, 0),
      blockedRouteCheckCount: organisationRows.reduce((total, row) => total + row.blockedRouteCount, 0),
      globalRouteSelectionCount: organisationRows.reduce((total, row) => total + row.globalRouteSelectionCount, 0),
      organisationOverrideSelectionCount: organisationRows.reduce((total, row) => total + row.organisationOverrideSelectionCount, 0),
      genericOrgTemplateBypassCount: organisationRows.reduce((total, row) => total + row.genericOrgTemplateBypassCount, 0),
    },
    coverageAuditStatus: coverageAudit?.status || null,
    organisationRows,
    blockers,
    warnings,
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

async function fetchOrganisationMandateTemplates(client, organisationIds = []) {
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
  const outputPath = arg('out', 'docs/mandate-template-global-routes-phase5-organisation-rollout-report.json')
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !serviceRoleKey) throw new Error('Supabase URL and service role key are required.')

  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const organisations = await fetchActiveAgencyOrganisations(client)
  const sourceTemplate = await fetchSourceTemplate(client)
  const globalRouteTemplates = await fetchGlobalRouteTemplates(client)
  const organisationTemplates = await fetchOrganisationMandateTemplates(client, organisations.map((organisation) => organisation.id))
  const sourceSections = sourceTemplate?.id ? await fetchSections(client, [sourceTemplate.id]) : []
  const globalRouteSections = await fetchSections(client, globalRouteTemplates.map((template) => template.id))
  const globalTemplateIds = globalRouteTemplates.map((template) => template.id).filter(Boolean)
  const coverageAudit = buildMandateGlobalRouteCoverageAudit({
    sourceTemplate,
    routeTemplates: globalRouteTemplates,
    sourceSections,
    routeSections: globalRouteSections,
    provenanceRows: await fetchProvenance(client, globalTemplateIds),
    versionRows: await fetchVersions(client, globalTemplateIds),
  })
  const rollout = buildMandateGlobalRouteOrganisationRollout({
    coverageAudit,
    organisations,
    globalRouteTemplates,
    organisationTemplates,
  })
  const report = {
    ...rollout,
    projectRef: new URL(url).hostname.split('.')[0],
  }
  await writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    status: report.status,
    mutatedData: report.mutatedData,
    projectRef: report.projectRef,
    organisationCount: report.summary.organisationCount,
    readyOrganisationCount: report.summary.readyOrganisationCount,
    blockedOrganisationCount: report.summary.blockedOrganisationCount,
    organisationRouteCheckCount: report.summary.organisationRouteCheckCount,
    readyRouteCheckCount: report.summary.readyRouteCheckCount,
    blockedRouteCheckCount: report.summary.blockedRouteCheckCount,
    globalRouteSelectionCount: report.summary.globalRouteSelectionCount,
    organisationOverrideSelectionCount: report.summary.organisationOverrideSelectionCount,
    blockers: report.blockers.map((blocker) => blocker.code),
    outputPath,
  }, null, 2))
  if (report.status !== 'ROLLOUT_READY') process.exitCode = 1
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  await main()
}
