#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
export const HYPERCARE_CONFIRMATION = 'AUTHORIZE_KINGSTONS_HYPERCARE_RECORDING'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const OBSERVATION_CONTRACT = 'public-websites-pilot-closeout-phase6-observation-v1'
const ACCEPTANCE_CONTRACT = 'public-websites-pilot-closeout-phase6-acceptance-v1'

function option(argv, name) {
  const inline = argv.find((value) => value.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] || '' : ''
}

export function parseHypercareArgs(argv = process.argv.slice(2)) {
  const actions = ['--status', '--start', '--observe', '--incident', '--resolve', '--accept'].filter((name) => argv.includes(name))
  if (actions.length > 1) throw new Error('Choose only one Phase 6 operation.')
  return {
    action: actions[0]?.slice(2) || 'status',
    organisationId: option(argv, '--organisation-id'),
    operator: option(argv, '--operator') || process.env.GITHUB_ACTOR || process.env.USER || '',
    evidencePath: option(argv, '--evidence'),
    acceptancePath: option(argv, '--acceptance'),
    observationDate: option(argv, '--date') || new Date().toISOString().slice(0, 10),
    severity: option(argv, '--severity'),
    category: option(argv, '--category'),
    summary: option(argv, '--summary'),
    incidentId: option(argv, '--incident-id'),
    resolution: option(argv, '--resolution'),
    confirmation: option(argv, '--confirm'),
    output: option(argv, '--output'),
    requireReady: argv.includes('--require-ready'),
    help: argv.includes('--help') || argv.includes('-h'),
  }
}

export function assertProductionTarget(environment = process.env) {
  const projectRef = String(environment.SUPABASE_PRODUCTION_PROJECT_REF || PRODUCTION_PROJECT_REF).trim()
  const url = String(environment.SUPABASE_PRODUCTION_URL || environment.SUPABASE_URL || '').trim()
  const key = String(environment.SUPABASE_PRODUCTION_SERVICE_ROLE_KEY || environment.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (projectRef !== PRODUCTION_PROJECT_REF || !url || !key) throw new Error('Production credentials do not match the pinned Phase 6 target.')
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.hostname !== `${projectRef}.supabase.co` || parsed.pathname !== '/') {
    throw new Error('Production Supabase URL does not match the pinned Phase 6 target.')
  }
  return { projectRef, url, key }
}

function readJson(path, label) {
  if (!path) throw new Error(`${label} file is required.`)
  try { return JSON.parse(readFileSync(resolve(path), 'utf8')) } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function validateObservation(value) {
  if (value?.contract !== OBSERVATION_CONTRACT) throw new Error('Phase 6 observation contract is invalid.')
  for (const field of ['routesPassed', 'mobilePassed', 'desktopPassed', 'listingSyncPassed', 'imageDeliveryPassed', 'allLeadsInCrm']) {
    if (typeof value[field] !== 'boolean') throw new Error(`Phase 6 observation requires boolean ${field}.`)
  }
  for (const field of ['runtimeErrorCount', 'tenantLeakCount', 'lostLeadCount', 'brokenListingCount', 'seriousRegressionCount']) {
    if (!Number.isInteger(value[field]) || value[field] < 0) throw new Error(`Phase 6 observation requires non-negative integer ${field}.`)
  }
  if (!Array.isArray(value.routeChecks) || !Array.isArray(value.mediaChecks) || !value.leadReconciliation || typeof value.leadReconciliation !== 'object') {
    throw new Error('Phase 6 observation requires route, media and lead-reconciliation evidence.')
  }
  return value
}

export function validateAcceptance(value) {
  if (value?.contract !== ACCEPTANCE_CONTRACT || value?.productionAccepted !== true) throw new Error('Final production acceptance contract is invalid.')
  for (const field of ['clientApproverName', 'clientApproverRole', 'approvalReference']) {
    if (String(value[field] || '').trim().length < 2) throw new Error(`Final production acceptance requires ${field}.`)
  }
  return value
}

async function maybeOne(query, label, { allowMissingRelation = false } = {}) {
  const { data, error } = await query.maybeSingle()
  if (error && !(allowMissingRelation && ['42P01', 'PGRST205'].includes(error.code))) throw new Error(`${label}: ${error.message}`)
  return { data: data || null, schemaInstalled: !error }
}

async function rows(query, label, { allowMissingRelation = false } = {}) {
  const { data, error } = await query
  if (error && !(allowMissingRelation && ['42P01', 'PGRST205'].includes(error.code))) throw new Error(`${label}: ${error.message}`)
  return { data: data || [], schemaInstalled: !error }
}

export function deriveHypercareStatus({ release, domain, window, schemaInstalled }) {
  if (!release || release.status !== 'active' || !release.activated_at) return 'BLOCKED_PRE_LIVE'
  if (!domain || domain.domain_kind !== 'custom' || domain.status !== 'active' || domain.is_primary !== true) return 'BLOCKED_PRE_LIVE'
  if (!schemaInstalled) return 'BLOCKED_SCHEMA_PENDING'
  if (!window) return 'READY_TO_START'
  if (window.status === 'accepted') return 'PRODUCTION_ACCEPTED'
  if (window.status === 'failed') return 'FAILED'
  return 'OBSERVING'
}

export async function collectHypercareStatus(client, { projectRef, organisationId }) {
  const releaseResult = await maybeOne(client.from('website_production_releases').select('*').eq('organisation_id', organisationId), 'Production release')
  const release = releaseResult.data
  const siteId = release?.website_site_id
  const domainResult = siteId
    ? await maybeOne(client.from('website_domains').select('id,hostname,domain_kind,status,is_primary,verified_at').eq('website_site_id', siteId).eq('hostname', release.target_hostname), 'Custom domain')
    : { data: null }
  const windowResult = await maybeOne(client.from('website_hypercare_windows').select('*').eq('organisation_id', organisationId), 'Hypercare window', { allowMissingRelation: true })
  const window = windowResult.data
  const observationsResult = window
    ? await rows(client.from('website_hypercare_daily_observations').select('id,observation_date,result,runtime_error_count,tenant_leak_count,lost_lead_count,broken_listing_count,serious_regression_count').eq('hypercare_window_id', window.id).order('observation_date'), 'Daily observations')
    : { data: [] }
  const incidentsResult = window
    ? await rows(client.from('website_hypercare_incidents').select('id,severity,category,status,summary,created_at,resolved_at').eq('hypercare_window_id', window.id).order('created_at'), 'Incidents')
    : { data: [] }
  const listingsResult = siteId
    ? await rows(client.from('website_listing_publications').select('id,listing_id,status,last_synced_at,updated_at').eq('website_site_id', siteId), 'Listing publications')
    : { data: [] }
  const mediaResult = siteId
    ? await rows(client.from('website_listing_media_assets').select('id,listing_id,status,public_url,updated_at').eq('website_site_id', siteId), 'Listing media')
    : { data: [] }
  const leadsResult = siteId && release?.activated_at
    ? await rows(client.from('website_lead_submissions').select('id,status,lead_id,contact_id,notification_status,created_at,routed_at').eq('website_site_id', siteId).gte('created_at', release.activated_at), 'Website lead submissions')
    : { data: [] }
  const leads = leadsResult.data
  const unreconciledLeads = leads.filter((lead) => lead.status !== 'duplicate' && (lead.status !== 'routed' || !lead.lead_id || !lead.contact_id))
  const failedNotifications = leads.filter((lead) => lead.notification_status === 'failed')
  const openIncidents = incidentsResult.data.filter((incident) => incident.status === 'open')
  const passDays = observationsResult.data.filter((observation) => observation.result === 'pass').length
  const domain = domainResult.data
  const status = deriveHypercareStatus({ release, domain, window, schemaInstalled: windowResult.schemaInstalled })
  const activeCustomDomain = Boolean(domain?.domain_kind === 'custom' && domain?.status === 'active' && domain?.is_primary)
  return {
    contract: 'public-websites-pilot-closeout-phase6-status-v1',
    capturedAt: new Date().toISOString(),
    projectRef,
    organisationId,
    status,
    phase6Implemented: true,
    observationStarted: status === 'OBSERVING' || status === 'PRODUCTION_ACCEPTED',
    schemaInstalled: windowResult.schemaInstalled,
    release: release ? { id: release.id, status: release.status, targetHostname: release.target_hostname, activatedAt: release.activated_at } : null,
    activeCustomDomain,
    domainLinked: activeCustomDomain,
    dnsChangedByPhase6: false,
    window: window ? { id: window.id, status: window.status, startedAt: window.started_at, earliestAcceptanceAt: window.earliest_acceptance_at, targetAcceptanceAt: window.target_acceptance_at, acceptedAt: window.accepted_at } : null,
    monitoring: {
      observations: observationsResult.data.length,
      passingDays: passDays,
      requiredPassingDays: 7,
      openIncidents: openIncidents.length,
      publishedListings: listingsResult.data.filter((listing) => listing.status === 'published').length,
      activeMediaAssets: mediaResult.data.filter((asset) => asset.status === 'active').length,
    },
    leadReconciliation: {
      submissions: leads.length,
      unreconciled: unreconciledLeads.length,
      failedNotifications: failedNotifications.length,
      allLeadsInCrm: unreconciledLeads.length === 0,
    },
    pauseReadiness: {
      ready: Boolean(release?.rollback_deployment_url),
      command: 'website_rollback_production_release',
      rollbackDeploymentUrl: release?.rollback_deployment_url || null,
    },
    exitGatePassed: status === 'PRODUCTION_ACCEPTED',
    blockers: [
      ...(!release || release.status !== 'active' ? ['Phase 5 custom-domain production release is not active.'] : []),
      ...(!activeCustomDomain ? ['The Kingstons domain is intentionally not linked and primary.'] : []),
      ...(!windowResult.schemaInstalled ? ['The Phase 6 production schema is pending deployment.'] : []),
      ...(window && passDays < 7 ? [`${7 - passDays} passing daily observation(s) still required.`] : []),
      ...(openIncidents.length ? [`${openIncidents.length} incident(s) remain open.`] : []),
      ...(unreconciledLeads.length ? [`${unreconciledLeads.length} website submission(s) are not reconciled to CRM.`] : []),
    ],
  }
}

async function executeAction(client, options) {
  if (options.action === 'status') return
  if (!UUID.test(options.organisationId)) throw new Error('A valid Kingstons organisation UUID is required.')
  if (options.confirmation !== HYPERCARE_CONFIRMATION) throw new Error(`Phase 6 mutations require ${HYPERCARE_CONFIRMATION}.`)
  let rpc
  if (options.action === 'start') rpc = ['website_start_hypercare', { p_organisation_id: options.organisationId, p_operator: options.operator }]
  if (options.action === 'observe') rpc = ['website_record_hypercare_observation', { p_organisation_id: options.organisationId, p_observation_date: options.observationDate, p_evidence: validateObservation(readJson(options.evidencePath, 'Observation evidence')), p_operator: options.operator }]
  if (options.action === 'incident') rpc = ['website_record_hypercare_incident', { p_organisation_id: options.organisationId, p_severity: options.severity, p_category: options.category, p_summary: options.summary, p_operator: options.operator }]
  if (options.action === 'resolve') {
    if (!UUID.test(options.incidentId)) throw new Error('A valid incident UUID is required.')
    rpc = ['website_resolve_hypercare_incident', { p_incident_id: options.incidentId, p_resolution: options.resolution, p_operator: options.operator }]
  }
  if (options.action === 'accept') rpc = ['website_accept_hypercare', { p_organisation_id: options.organisationId, p_acceptance: validateAcceptance(readJson(options.acceptancePath, 'Acceptance')), p_operator: options.operator }]
  const { error } = await client.rpc(rpc[0], rpc[1])
  if (error) throw new Error(`Phase 6 ${options.action} failed: ${error.message}`)
}

function usage() {
  return `Usage: node scripts/public-websites-pilot-closeout-phase6-hypercare.mjs --status|--start|--observe|--incident|--resolve|--accept --organisation-id UUID [options]\n\nStatus is read-only. Every mutation requires --confirm ${HYPERCARE_CONFIRMATION}. Phase 6 never links a domain, changes DNS, promotes a deployment, or sends a lead.\n`
}

async function main() {
  const options = parseHypercareArgs()
  if (options.help) return process.stdout.write(usage())
  if (!UUID.test(options.organisationId)) throw new Error('A valid Kingstons organisation UUID is required.')
  const target = assertProductionTarget()
  const client = createClient(target.url, target.key, { auth: { persistSession: false, autoRefreshToken: false } })
  await executeAction(client, options)
  const report = await collectHypercareStatus(client, { projectRef: target.projectRef, organisationId: options.organisationId })
  const evidence = { ...report, evidenceFingerprint: createHash('sha256').update(JSON.stringify(report)).digest('hex') }
  const output = `${JSON.stringify(evidence, null, 2)}\n`
  if (options.output) {
    const outputPath = resolve(options.output)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, output, { encoding: 'utf8', mode: 0o400 })
    chmodSync(outputPath, 0o400)
  } else process.stdout.write(output)
  if (options.requireReady && !['READY_TO_START', 'OBSERVING', 'PRODUCTION_ACCEPTED'].includes(report.status)) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Phase 6 hypercare blocked: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
