#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
export const RELEASE_CONFIRMATION = 'AUTHORIZE_ONE_AGENCY_WEBSITE_PRODUCTION_RELEASE'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA_PATTERN = /^[0-9a-f]{40}$/i

function option(argv, name) {
  const inline = argv.find((value) => value.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] || '' : ''
}

export function parseReleaseArgs(argv = process.argv.slice(2)) {
  const actions = ['--plan', '--approve', '--prepare-domain', '--verify-domain', '--activate', '--rollback'].filter((name) => argv.includes(name))
  if (actions.length > 1) throw new Error('Choose only one production release mutation.')
  return {
    action: actions[0]?.slice(2) || 'status',
    organisationId: option(argv, '--organisation-id'),
    phase7EvidencePath: option(argv, '--phase7-evidence'),
    approvalPath: option(argv, '--approval'),
    dnsSnapshotPath: option(argv, '--dns-snapshot'),
    verificationPath: option(argv, '--verification'),
    operator: option(argv, '--operator') || process.env.GITHUB_ACTOR || process.env.USER || '',
    reason: option(argv, '--reason'),
    confirmation: option(argv, '--confirm'),
    baseUrl: option(argv, '--base-url'),
    output: option(argv, '--output'),
    requireActive: argv.includes('--require-active'),
    requireLead: argv.includes('--require-lead'),
    submitSmokeLead: argv.includes('--submit-smoke-lead'),
    help: argv.includes('--help') || argv.includes('-h'),
  }
}

function readJson(path, label) {
  if (!path) throw new Error(`${label} file is required.`)
  try { return JSON.parse(readFileSync(resolve(path), 'utf8')) } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function assertProductionTarget(environment = process.env) {
  const projectRef = String(environment.SUPABASE_PRODUCTION_PROJECT_REF || '').trim()
  const supabaseUrl = String(environment.SUPABASE_URL || environment.SUPABASE_PRODUCTION_URL || '').trim()
  const serviceRoleKey = String(environment.SUPABASE_SERVICE_ROLE_KEY || environment.SUPABASE_PRODUCTION_SERVICE_ROLE_KEY || '').trim()
  if (projectRef !== PRODUCTION_PROJECT_REF) throw new Error('Production project reference does not match the pinned release target.')
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Production Supabase URL and service-role key are required.')
  let parsed
  try { parsed = new URL(supabaseUrl) } catch { throw new Error('Production Supabase URL must be valid HTTPS.') }
  if (parsed.protocol !== 'https:' || parsed.hostname !== `${projectRef}.supabase.co` || parsed.pathname !== '/') {
    throw new Error('Production Supabase URL does not match the pinned project reference exactly.')
  }
  return { projectRef, supabaseUrl, serviceRoleKey }
}

export function validatePhase7Evidence(evidence, organisationId, sourceCommit) {
  if (evidence?.contract !== 'public-websites-phase7-staging-pilot-v1' || evidence?.status !== 'PASS' || evidence?.readyForPhase8 !== true) {
    throw new Error('Phase 7 evidence must be a complete PASS before production approval.')
  }
  if (evidence?.target?.organisationId !== organisationId) throw new Error('Phase 7 evidence belongs to another organisation.')
  if (!/^[a-f0-9]{64}$/i.test(String(evidence?.evidenceFingerprint || ''))) throw new Error('Phase 7 evidence fingerprint is missing.')
  const { evidenceFingerprint, ...core } = evidence
  const actualFingerprint = createHash('sha256').update(JSON.stringify(core)).digest('hex')
  if (actualFingerprint !== evidenceFingerprint) throw new Error('Phase 7 evidence fingerprint does not verify.')
  if (!SHA_PATTERN.test(sourceCommit) || evidence?.manualAcceptance?.sourceCommit?.toLowerCase() !== sourceCommit.toLowerCase()) {
    throw new Error('Phase 7 evidence was not reviewed against this source commit.')
  }
  return evidenceFingerprint.toLowerCase()
}

export function validateReleaseApproval(approval, { organisationId, sourceCommit }) {
  if (approval?.contract !== 'public-websites-phase8-production-approval-v1') throw new Error('Production approval contract is invalid.')
  if (approval?.organisationId !== organisationId || approval?.sourceCommit?.toLowerCase() !== sourceCommit.toLowerCase()) {
    throw new Error('Production approval does not match the organisation and source commit.')
  }
  if (approval?.confirmation !== RELEASE_CONFIRMATION) throw new Error(`Production approval requires ${RELEASE_CONFIRMATION}.`)
  if (!/^https:\/\/[a-z0-9][a-z0-9.-]*\.vercel\.app\/?$/i.test(String(approval?.candidateDeploymentUrl || ''))
    || !/^https:\/\/[a-z0-9][a-z0-9.-]*\.vercel\.app\/?$/i.test(String(approval?.rollbackDeploymentUrl || ''))
    || approval.candidateDeploymentUrl === approval.rollbackDeploymentUrl) {
    throw new Error('Approval requires distinct candidate and rollback Vercel deployment URLs.')
  }
  const hostname = String(approval?.targetHostname || '').trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(hostname)
    || hostname.endsWith('.vercel.app') || hostname.endsWith('.sites.propdata.co.za')
    || /^(mail|mailhost|autodiscover|smtp|imap|pop)\./.test(hostname)) throw new Error('Approval requires a safe client-owned website hostname.')
  const approvedAt = Date.parse(approval?.approvedAt)
  if (!Number.isFinite(approvedAt) || approvedAt > Date.now() + 60_000 || approvedAt < Date.now() - (14 * 24 * 60 * 60 * 1000)) {
    throw new Error('Production approval must be dated within the last 14 days.')
  }
  for (const field of ['approvedBy', 'approvalReference']) {
    if (String(approval?.[field] || '').trim().length < 2) throw new Error(`Production approval requires ${field}.`)
  }
  return { ...approval, targetHostname: hostname }
}

function validateDnsDocument(document, contract, hostname) {
  if (document?.contract !== contract || String(document?.hostname || '').trim().toLowerCase() !== hostname) {
    throw new Error(`${contract} does not match the approved hostname.`)
  }
  if (document.emailDnsUnchanged !== true || document.nameserversUnchanged !== true) {
    throw new Error('Email DNS and nameservers must remain unchanged.')
  }
  return document
}

async function publicSmoke(baseUrl, hostname) {
  if (!baseUrl) return []
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'https:' || parsed.hostname !== hostname) throw new Error('--base-url must be the exact approved HTTPS production hostname.')
  const paths = ['/', '/properties', '/about', '/contact', '/valuation', '/robots.txt', '/sitemap.xml']
  return Promise.all(paths.map(async (path) => {
    try {
      const response = await fetch(new URL(path, parsed), { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
      return { id: `public:${path}`, passed: response.status >= 200 && response.status < 400, evidence: `HTTP ${response.status}` }
    } catch (error) {
      return { id: `public:${path}`, passed: false, evidence: error instanceof Error ? error.message : 'request failed' }
    }
  }))
}

async function queryOne(query, label) {
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`${label}: ${error.message}`)
  return data || null
}

async function submitProductionSmokeLead(client, organisationId, baseUrl) {
  const smokeEmail = String(process.env.WEBSITE_RELEASE_SMOKE_EMAIL || '').trim().toLowerCase()
  if (!smokeEmail || !baseUrl) throw new Error('Production smoke lead requires WEBSITE_RELEASE_SMOKE_EMAIL and --base-url.')
  const site = await queryOne(
    client.from('website_sites').select('id,published_revision_id').eq('organisation_id', organisationId),
    'Production site could not be loaded for the CRM smoke',
  )
  const page = await queryOne(
    client.from('website_pages').select('id').eq('website_site_id', site?.id || '').eq('revision_id', site?.published_revision_id || '').eq('page_kind', 'home'),
    'Published home page could not be loaded for the CRM smoke',
  )
  if (!page) throw new Error('Published home page is required for the CRM smoke.')
  const response = await fetch(new URL('/api/leads', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'general_enquiry',
      pageId: page.id,
      name: 'PropData release smoke',
      email: smokeEmail,
      message: 'Controlled Phase 8 production routing verification',
      privacyAccepted: true,
      marketingConsent: false,
      pageUrl: new URL('/', baseUrl).href,
      idempotencyKey: `phase8:${randomUUID()}`,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Controlled CRM enquiry returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`)
}

export async function collectProductionEvidence(client, { organisationId, projectRef, baseUrl, requireLead = false }) {
  const release = await queryOne(
    client.from('website_production_releases').select('*').eq('organisation_id', organisationId),
    'Production release could not be loaded',
  )
  let site = null
  let domain = null
  let events = []
  let routedLeadCount = 0
  if (release) {
    ;[site, domain] = await Promise.all([
      queryOne(client.from('website_sites').select('id,status,published_revision_id').eq('organisation_id', organisationId), 'Production site could not be loaded'),
      queryOne(client.from('website_domains').select('hostname,status,is_primary,verified_at').eq('website_site_id', release.website_site_id).eq('hostname', release.target_hostname), 'Production domain could not be loaded'),
    ])
    const [eventResult, leadResult] = await Promise.all([
      client.from('website_production_release_events').select('action,source_commit,deployment_url,content_fingerprint,created_at').eq('release_id', release.id).order('created_at'),
      client.from('website_lead_submissions').select('*', { count: 'exact', head: true }).eq('website_site_id', release.website_site_id).eq('status', 'routed').gte('created_at', release.activated_at || new Date().toISOString()),
    ])
    if (eventResult.error) throw new Error(`Production events could not be loaded: ${eventResult.error.message}`)
    if (leadResult.error) throw new Error(`Production leads could not be counted: ${leadResult.error.message}`)
    events = eventResult.data || []
    routedLeadCount = leadResult.count || 0
  }
  const checks = [
    { id: 'release:active', passed: release?.status === 'active', evidence: release?.status || 'missing' },
    { id: 'release:commit-bound', passed: SHA_PATTERN.test(release?.source_commit || ''), evidence: release?.source_commit || 'missing' },
    { id: 'release:rollback-target', passed: Boolean(release?.rollback_deployment_url), evidence: release?.rollback_deployment_url || 'missing' },
    { id: 'site:published', passed: Boolean(site?.status === 'published' && site?.published_revision_id), evidence: site?.status || 'missing' },
    { id: 'domain:active-primary', passed: Boolean(domain?.status === 'active' && domain?.is_primary && domain?.verified_at), evidence: domain?.status || 'missing' },
    { id: 'audit:activated', passed: events.some((event) => event.action === 'activated'), evidence: events.map((event) => event.action).join(', ') || 'none' },
    { id: 'leads:post-release-routed', passed: routedLeadCount > 0, required: requireLead, evidence: `${routedLeadCount} routed lead(s)` },
    ...await publicSmoke(baseUrl, release?.target_hostname || ''),
  ]
  const active = checks.every((check) => check.passed || check.required === false)
  return {
    contract: 'public-websites-phase8-production-evidence-v1',
    capturedAt: new Date().toISOString(),
    target: { projectRef, organisationId, hostname: release?.target_hostname || null },
    status: active ? 'ACTIVE' : 'BLOCKED',
    active,
    checks,
    release: release ? {
      id: release.id,
      status: release.status,
      sourceCommit: release.source_commit,
      phase7EvidenceFingerprint: release.phase7_evidence_fingerprint,
      candidateDeploymentUrl: release.candidate_deployment_url,
      rollbackDeploymentUrl: release.rollback_deployment_url,
      contentFingerprint: release.content_fingerprint,
      activatedAt: release.activated_at,
    } : null,
  }
}

function printUsage() {
  console.log(`Usage: node scripts/public-websites-phase8-release.mjs [--plan|--approve|--prepare-domain|--verify-domain|--activate|--rollback] --organisation-id <uuid> [files] [--confirm ${RELEASE_CONFIRMATION}]`)
}

async function main() {
  const options = parseReleaseArgs()
  if (options.help) return printUsage()
  if (!UUID_PATTERN.test(options.organisationId)) throw new Error('--organisation-id must be a UUID.')
  const target = assertProductionTarget()
  const mutating = !['status', 'plan'].includes(options.action)
  if (mutating && options.confirmation !== RELEASE_CONFIRMATION) throw new Error(`Production mutations require --confirm ${RELEASE_CONFIRMATION}.`)
  if (mutating && String(options.operator).trim().length < 2) throw new Error('--operator is required for production mutations.')
  const client = createClient(target.supabaseUrl, target.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

  let approval = null
  if (['plan', 'approve', 'activate'].includes(options.action)) {
    const rawApproval = readJson(options.approvalPath, 'Production approval')
    const sourceCommit = String(process.env.GITHUB_SHA || rawApproval?.sourceCommit || '').trim()
    approval = validateReleaseApproval(rawApproval, { organisationId: options.organisationId, sourceCommit })
    if (['plan', 'approve'].includes(options.action)) {
      const phase7Evidence = readJson(options.phase7EvidencePath, 'Phase 7 evidence')
      const phase7Fingerprint = validatePhase7Evidence(phase7Evidence, options.organisationId, sourceCommit)
      if (options.action === 'approve') {
        const { error } = await client.rpc('website_approve_production_release', {
          p_organisation_id: options.organisationId,
          p_target_hostname: approval.targetHostname,
          p_source_commit: sourceCommit.toLowerCase(),
          p_phase7_evidence_fingerprint: phase7Fingerprint,
          p_candidate_deployment_url: approval.candidateDeploymentUrl,
          p_rollback_deployment_url: approval.rollbackDeploymentUrl,
          p_approval_reference: approval.approvalReference,
          p_approved_by: approval.approvedBy,
          p_approved_at: approval.approvedAt,
          p_configured_by: options.operator,
        })
        if (error) throw new Error(`Production release was not approved: ${error.message}`)
      }
    }
  }
  if (options.action === 'prepare-domain') {
    const release = await queryOne(client.from('website_production_releases').select('target_hostname').eq('organisation_id', options.organisationId), 'Release could not be loaded')
    const dnsSnapshot = validateDnsDocument(readJson(options.dnsSnapshotPath, 'DNS snapshot'), 'public-websites-phase8-dns-snapshot-v1', release?.target_hostname || '')
    const { error } = await client.rpc('website_prepare_production_domain', { p_organisation_id: options.organisationId, p_dns_snapshot: dnsSnapshot, p_operator: options.operator })
    if (error) throw new Error(`Production domain was not prepared: ${error.message}`)
  }
  if (options.action === 'verify-domain') {
    const release = await queryOne(client.from('website_production_releases').select('target_hostname').eq('organisation_id', options.organisationId), 'Release could not be loaded')
    const verification = validateDnsDocument(readJson(options.verificationPath, 'Domain verification'), 'public-websites-phase8-domain-verification-v1', release?.target_hostname || '')
    const { error } = await client.rpc('website_verify_production_domain', { p_organisation_id: options.organisationId, p_verification: verification, p_operator: options.operator })
    if (error) throw new Error(`Production domain was not verified: ${error.message}`)
  }
  if (options.action === 'activate') {
    const { error } = await client.rpc('website_activate_production_release', {
      p_organisation_id: options.organisationId,
      p_source_commit: approval.sourceCommit.toLowerCase(),
      p_candidate_deployment_url: approval.candidateDeploymentUrl,
      p_operator: options.operator,
    })
    if (error) throw new Error(`Production release was not activated: ${error.message}`)
    if (options.submitSmokeLead) await submitProductionSmokeLead(client, options.organisationId, options.baseUrl)
  }
  if (options.action === 'rollback') {
    if (String(options.reason).trim().length < 4) throw new Error('--reason is required for rollback.')
    const { error } = await client.rpc('website_rollback_production_release', { p_organisation_id: options.organisationId, p_operator: options.operator, p_reason: options.reason })
    if (error) throw new Error(`Production release was not failed closed: ${error.message}`)
  }

  const report = await collectProductionEvidence(client, { organisationId: options.organisationId, projectRef: target.projectRef, baseUrl: options.baseUrl, requireLead: options.requireLead })
  const evidence = { ...report, evidenceFingerprint: createHash('sha256').update(JSON.stringify(report)).digest('hex') }
  const output = `${JSON.stringify(evidence, null, 2)}\n`
  if (options.output) {
    const outputPath = resolve(options.output)
    writeFileSync(outputPath, output, { encoding: 'utf8', mode: 0o400 })
    chmodSync(outputPath, 0o400)
  } else process.stdout.write(output)
  if (options.requireActive && !report.active) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Phase 8 release blocked: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
