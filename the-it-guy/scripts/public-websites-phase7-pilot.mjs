#!/usr/bin/env node

import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const MUTATION_CONFIRMATION = 'MANAGE_ONE_AGENCY_STAGING_PILOT'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MANUAL_ACCEPTANCE_CHECKS = [
  'crossTenantIsolation',
  'draftIsolation',
  'listingPublishUpdateUnpublish',
  'leadIdempotencyAndFallback',
  'mobile320',
  'mobile375',
  'tablet768',
  'iosSafari',
  'androidChrome',
]

function option(argv, name) {
  const inline = argv.find((value) => value.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] || '' : ''
}

export function parsePilotArgs(argv = process.argv.slice(2)) {
  const modes = ['--activate', '--pause', '--complete', '--plan'].filter((name) => argv.includes(name))
  if (modes.length > 1) throw new Error('Choose only one pilot status mutation.')
  return {
    help: argv.includes('--help') || argv.includes('-h'),
    status: modes[0]?.slice(2) || null,
    organisationId: option(argv, '--organisation-id'),
    hostname: option(argv, '--bind-hostname'),
    baseUrl: option(argv, '--base-url'),
    operator: option(argv, '--operator') || process.env.GITHUB_ACTOR || process.env.USER || '',
    notes: option(argv, '--notes'),
    confirmation: option(argv, '--confirm'),
    output: option(argv, '--output'),
    manualEvidence: option(argv, '--manual-evidence'),
    requireReady: argv.includes('--require-ready'),
    json: argv.includes('--json'),
  }
}

export function loadManualAcceptance(path, organisationId, expectedSourceCommit = process.env.GITHUB_SHA || '') {
  if (!path) return null
  let evidence
  try { evidence = JSON.parse(readFileSync(resolve(path), 'utf8')) } catch (error) {
    throw new Error(`Manual acceptance evidence is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (evidence?.contract !== 'public-websites-phase7-manual-acceptance-v1') throw new Error('Manual acceptance evidence has the wrong contract.')
  if (evidence?.organisationId !== organisationId) throw new Error('Manual acceptance evidence does not match the selected pilot organisation.')
  if (!/^[0-9a-f]{40}$/i.test(String(evidence?.sourceCommit || ''))) throw new Error('Manual acceptance evidence requires a full sourceCommit SHA.')
  if (expectedSourceCommit && evidence.sourceCommit.toLowerCase() !== expectedSourceCommit.toLowerCase()) {
    throw new Error('Manual acceptance evidence was reviewed against a different source commit.')
  }
  if (String(evidence?.reviewedBy || '').trim().length < 2) throw new Error('Manual acceptance evidence requires reviewedBy.')
  const reviewedAt = Date.parse(evidence?.reviewedAt)
  if (!Number.isFinite(reviewedAt) || reviewedAt > Date.now() + 60_000 || reviewedAt < Date.now() - (14 * 24 * 60 * 60 * 1000)) {
    throw new Error('Manual acceptance evidence must have a valid reviewedAt within the last 14 days.')
  }
  return evidence
}

export function assertStagingTarget(environment = process.env) {
  const projectRef = String(environment.SUPABASE_STAGING_PROJECT_REF || '').trim()
  const supabaseUrl = String(environment.SUPABASE_URL || environment.SUPABASE_STAGING_URL || '').trim()
  const serviceRoleKey = String(environment.SUPABASE_SERVICE_ROLE_KEY || environment.SUPABASE_STAGING_SERVICE_ROLE_KEY || '').trim()
  if (!/^[a-z0-9]{8,64}$/.test(projectRef)) throw new Error('SUPABASE_STAGING_PROJECT_REF is required and must be a lowercase project reference.')
  if (projectRef === PRODUCTION_PROJECT_REF) throw new Error('Refusing to target the production Supabase project.')
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Staging SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  let parsed
  try { parsed = new URL(supabaseUrl) } catch { throw new Error('SUPABASE_URL must be a valid HTTPS URL.') }
  if (parsed.protocol !== 'https:' || parsed.hostname !== `${projectRef}.supabase.co` || parsed.pathname !== '/') {
    throw new Error('SUPABASE_URL must match the explicit staging project reference exactly.')
  }
  return { projectRef, supabaseUrl, serviceRoleKey }
}

function checked(passed, id, evidence) {
  return { id, passed: Boolean(passed), evidence }
}

function uniqueKinds(pages = []) {
  return [...new Set(pages.map((page) => page.page_kind))].sort()
}

async function publicSmoke(baseUrl) {
  if (!baseUrl) return { requested: false, checks: [] }
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.vercel.app')) {
    throw new Error('--base-url must be an HTTPS Vercel staging deployment URL.')
  }
  const paths = ['/', '/properties', '/about', '/contact', '/valuation', '/robots.txt', '/sitemap.xml']
  const checks = []
  for (const path of paths) {
    try {
      const response = await fetch(new URL(path, parsed), { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
      checks.push(checked(response.status >= 200 && response.status < 400, `public:${path}`, `HTTP ${response.status}`))
    } catch (error) {
      checks.push(checked(false, `public:${path}`, error instanceof Error ? error.message : 'request failed'))
    }
  }
  return { requested: true, baseUrl: parsed.origin, checks }
}

async function selectOrThrow(query, label) {
  const { data, error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  return data || []
}

export async function collectPilotEvidence(client, { organisationId, baseUrl, projectRef, manualAcceptance = null }) {
  const enrolments = await selectOrThrow(
    client.from('website_pilot_enrolments').select('organisation_id, cohort, status, activated_at, paused_at, completed_at, updated_at').order('created_at'),
    'Pilot enrolments could not be loaded',
  )
  const activeEnrolments = enrolments.filter((row) => row.status === 'active')
  const selectedId = organisationId || activeEnrolments[0]?.organisation_id || enrolments[0]?.organisation_id || ''
  const selected = enrolments.find((row) => row.organisation_id === selectedId) || null

  let site = null
  let domains = []
  let revisions = []
  let pages = []
  let listingPublications = []
  let publicationEvents = []
  let leadSubmissions = []
  if (selectedId) {
    const siteRows = await selectOrThrow(
      client.from('website_sites').select('id, organisation_id, status, preview_slug, published_revision_id, template_key').eq('organisation_id', selectedId).limit(2),
      'Pilot site could not be loaded',
    )
    site = siteRows[0] || null
    if (site) {
      ;[domains, revisions, pages, listingPublications, publicationEvents, leadSubmissions] = await Promise.all([
        selectOrThrow(client.from('website_domains').select('hostname, domain_kind, status, is_primary').eq('website_site_id', site.id), 'Domains could not be loaded'),
        selectOrThrow(client.from('website_site_revisions').select('id, revision_number, status, source_revision_id, content_fingerprint').eq('website_site_id', site.id), 'Revisions could not be loaded'),
        selectOrThrow(client.from('website_pages').select('id, revision_id, page_kind, slug').eq('website_site_id', site.id), 'Pages could not be loaded'),
        selectOrThrow(client.from('website_listing_publications').select('listing_id, status, last_synced_at').eq('website_site_id', site.id), 'Listing publications could not be loaded'),
        selectOrThrow(client.from('website_publication_events').select('action, from_revision_id, to_revision_id, content_fingerprint, created_at').eq('website_site_id', site.id), 'Publication events could not be loaded'),
        selectOrThrow(client.from('website_lead_submissions').select('id, status, lead_id, page_id, listing_id, notification_status, created_at').eq('website_site_id', site.id), 'Lead receipts could not be loaded'),
      ])
    }
  }

  const publishedRevision = revisions.find((revision) => revision.id === site?.published_revision_id && revision.status === 'published') || null
  const publishedPages = pages.filter((page) => page.revision_id === site?.published_revision_id)
  const standardKinds = ['about', 'contact', 'home', 'valuation']
  const activeDomains = domains.filter((domain) => domain.status === 'active')
  const publishedListings = listingPublications.filter((row) => row.status === 'published')
  const routedLeads = leadSubmissions.filter((row) => row.lead_id && row.status === 'routed')
  const publicationActions = new Set(publicationEvents.map((event) => event.action))
  const smoke = await publicSmoke(baseUrl)
  const checks = [
    checked(activeEnrolments.length === 1, 'pilot:single-active-agency', `${activeEnrolments.length} active enrolment(s)`),
    checked(Boolean(selected && selected.status === 'active'), 'pilot:selected-agency-active', selected?.status || 'not enrolled'),
    checked(Boolean(site && site.template_key === 'property-standard-v1'), 'site:single-template', site?.template_key || 'site missing'),
    checked(Boolean(site?.status === 'published' && site?.published_revision_id), 'site:published-pointer', site?.status || 'site missing'),
    checked(Boolean(publishedRevision?.content_fingerprint), 'site:reviewed-revision', publishedRevision ? `revision ${publishedRevision.revision_number}` : 'published revision missing'),
    checked(activeDomains.length > 0, 'domain:active-preview', `${activeDomains.length} active domain(s)`),
    checked(standardKinds.every((kind) => uniqueKinds(publishedPages).includes(kind)), 'pages:standard-routes', uniqueKinds(publishedPages).join(', ') || 'no published pages'),
    checked(publishedListings.length > 0, 'listings:published-channel', `${publishedListings.length} published listing(s)`),
    checked(publicationActions.has('published'), 'publication:history', [...publicationActions].sort().join(', ') || 'no events'),
    checked(publicationActions.has('rolled_back'), 'publication:rollback-exercised', [...publicationActions].sort().join(', ') || 'no events'),
    checked(routedLeads.length > 0, 'leads:routed-to-crm', `${routedLeads.length} routed lead receipt(s)`),
    ...MANUAL_ACCEPTANCE_CHECKS.map((name) => checked(
      manualAcceptance?.checks?.[name] === true,
      `manual:${name}`,
      manualAcceptance ? `${manualAcceptance.reviewedBy} at ${manualAcceptance.reviewedAt}` : 'manual evidence not supplied',
    )),
    ...smoke.checks,
  ]
  const readyForPhase8 = checks.every((check) => check.passed)
  return {
    contract: 'public-websites-phase7-staging-pilot-v1',
    capturedAt: new Date().toISOString(),
    target: { projectRef, environment: 'staging', organisationId: selectedId || null, publicBaseUrl: smoke.baseUrl || null },
    status: readyForPhase8 ? 'PASS' : 'BLOCKED',
    readyForPhase8,
    checks,
    counts: {
      enrolments: enrolments.length,
      activeEnrolments: activeEnrolments.length,
      revisions: revisions.length,
      publishedPages: publishedPages.length,
      activeDomains: activeDomains.length,
      publishedListings: publishedListings.length,
      publicationEvents: publicationEvents.length,
      routedLeads: routedLeads.length,
    },
    manualAcceptance: manualAcceptance ? {
      reviewedBy: manualAcceptance.reviewedBy,
      reviewedAt: manualAcceptance.reviewedAt,
      sourceCommit: manualAcceptance.sourceCommit,
      notes: String(manualAcceptance.notes || '').slice(0, 1000) || null,
    } : null,
  }
}

function printUsage() {
  console.log('Usage:')
  console.log('  node scripts/public-websites-phase7-pilot.mjs [--organisation-id <uuid>] [--base-url <https://*.vercel.app>] [--manual-evidence <file>] [--require-ready] [--output <file>] [--json]')
  console.log(`  node scripts/public-websites-phase7-pilot.mjs --activate|--pause|--complete|--plan --organisation-id <uuid> --operator <name> --confirm ${MUTATION_CONFIRMATION}`)
  console.log(`  node scripts/public-websites-phase7-pilot.mjs --bind-hostname <hostname.vercel.app> --organisation-id <uuid> --confirm ${MUTATION_CONFIRMATION}`)
}

async function main() {
  const options = parsePilotArgs()
  if (options.help) return printUsage()
  const target = assertStagingTarget()
  const mutating = Boolean(options.status || options.hostname)
  if (options.organisationId && !UUID_PATTERN.test(options.organisationId)) throw new Error('--organisation-id must be a UUID.')
  if (mutating) {
    if (!options.organisationId) throw new Error('--organisation-id is required for pilot mutations.')
    if (options.confirmation !== MUTATION_CONFIRMATION) throw new Error(`Pilot mutations require --confirm ${MUTATION_CONFIRMATION}.`)
    if (String(options.operator).trim().length < 2) throw new Error('--operator is required for pilot mutations.')
  }
  const manualAcceptance = loadManualAcceptance(options.manualEvidence, options.organisationId)

  const client = createClient(target.supabaseUrl, target.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  if (options.status) {
    const { error } = await client.rpc('website_set_pilot_enrolment', {
      p_organisation_id: options.organisationId,
      p_status: options.status === 'plan' ? 'planned' : options.status === 'complete' ? 'completed' : options.status,
      p_configured_by: options.operator,
      p_operator_notes: options.notes || null,
    })
    if (error) throw new Error(`Pilot status was not changed: ${error.message}`)
  }
  if (options.hostname) {
    const { error } = await client.rpc('website_bind_pilot_hostname', {
      p_organisation_id: options.organisationId,
      p_hostname: options.hostname,
    })
    if (error) throw new Error(`Pilot hostname was not bound: ${error.message}`)
  }

  const report = await collectPilotEvidence(client, { organisationId: options.organisationId, baseUrl: options.baseUrl, projectRef: target.projectRef, manualAcceptance })
  const evidence = { ...report, evidenceFingerprint: createHash('sha256').update(JSON.stringify(report)).digest('hex') }
  const output = `${JSON.stringify(evidence, null, 2)}\n`
  if (options.output) {
    const outputPath = resolve(options.output)
    writeFileSync(outputPath, output, { encoding: 'utf8', mode: 0o400 })
    chmodSync(outputPath, 0o400)
  }
  if (options.json || !options.output) process.stdout.write(output)
  else console.log(`Phase 7 evidence written to ${resolve(options.output)} (${report.status}).`)
  if (options.requireReady && !report.readyForPhase8) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Phase 7 pilot blocked: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
