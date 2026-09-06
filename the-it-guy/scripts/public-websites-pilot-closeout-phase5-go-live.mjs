#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolve4, resolve6, resolveCname, resolveMx, resolveNs, resolveTxt } from 'node:dns/promises'
import { createClient } from '@supabase/supabase-js'

export const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
export const GO_LIVE_CONFIRMATION = 'AUTHORIZE_KINGSTONS_CLIENT_DOMAIN_GO_LIVE'
const APPROVAL_CONTRACT = 'public-websites-pilot-closeout-phase5-go-live-approval-v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA = /^[0-9a-f]{40}$/i
const FINGERPRINT = /^[0-9a-f]{64}$/i

function option(argv, name) {
  const inline = argv.find((value) => value.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] || '' : ''
}

export function parseGoLiveArgs(argv = process.argv.slice(2)) {
  const actions = ['--preflight', '--approve'].filter((name) => argv.includes(name))
  if (actions.length > 1) throw new Error('Choose only one Phase 5 operation.')
  return {
    action: actions[0]?.slice(2) || 'preflight',
    organisationId: option(argv, '--organisation-id'),
    hostname: option(argv, '--hostname').trim().toLowerCase(),
    approvalPath: option(argv, '--approval'),
    phase4EvidencePath: option(argv, '--phase4-evidence'),
    operator: option(argv, '--operator') || process.env.GITHUB_ACTOR || process.env.USER || '',
    confirmation: option(argv, '--confirm'),
    output: option(argv, '--output'),
    requireReady: argv.includes('--require-ready'),
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
  const projectRef = String(environment.SUPABASE_PRODUCTION_PROJECT_REF || PRODUCTION_PROJECT_REF).trim()
  const url = String(environment.SUPABASE_PRODUCTION_URL || environment.SUPABASE_URL || environment.VITE_SUPABASE_URL || '').trim()
  const key = String(environment.SUPABASE_PRODUCTION_SERVICE_ROLE_KEY || environment.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (projectRef !== PRODUCTION_PROJECT_REF || !url || !key) throw new Error('Production credentials do not match the pinned Phase 5 target.')
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.hostname !== `${projectRef}.supabase.co` || parsed.pathname !== '/') {
    throw new Error('Production Supabase URL does not match the pinned Phase 5 target.')
  }
  return { projectRef, url, key }
}

export function validateGoLiveApproval(value, now = Date.now()) {
  if (value?.contract !== APPROVAL_CONTRACT) throw new Error('Phase 5 client approval contract is invalid.')
  if (!UUID.test(String(value.organisationId || '')) || !SHA.test(String(value.sourceCommit || '')) || !FINGERPRINT.test(String(value.phase4EvidenceFingerprint || ''))) {
    throw new Error('Phase 5 approval must bind exact organisation, source and Phase 4 evidence identifiers.')
  }
  const hostname = String(value.targetHostname || '').trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(hostname)
    || hostname.endsWith('.vercel.app') || hostname.endsWith('.sites.propdata.co.za')
    || /^(mail|mailhost|autodiscover|smtp|imap|pop)\./.test(hostname)) throw new Error('Phase 5 approval requires a safe client-owned website hostname.')
  for (const key of ['candidateDeploymentUrl', 'rollbackDeploymentUrl']) {
    if (!/^https:\/\/[a-z0-9][a-z0-9.-]*\.vercel\.app\/?$/i.test(String(value[key] || ''))) throw new Error(`Phase 5 approval requires ${key}.`)
  }
  if (value.candidateDeploymentUrl === value.rollbackDeploymentUrl) throw new Error('Candidate and rollback deployments must be distinct.')
  if (value.clientApproved !== true || value.emailDnsChangesAllowed !== false || value.nameserverChangesAllowed !== false) {
    throw new Error('Named client approval is required and may not authorise email DNS or nameserver changes.')
  }
  for (const key of ['clientApproverName', 'clientApproverRole', 'approvalReference']) {
    if (String(value[key] || '').trim().length < 2) throw new Error(`Phase 5 approval requires ${key}.`)
  }
  const approvedAt = Date.parse(value.approvedAt)
  if (!Number.isFinite(approvedAt) || approvedAt > now + 60_000 || approvedAt < now - 14 * 86_400_000) {
    throw new Error('Phase 5 client approval must be dated within the last 14 days.')
  }
  if (value.confirmation !== GO_LIVE_CONFIRMATION) throw new Error(`Phase 5 approval requires ${GO_LIVE_CONFIRMATION}.`)
  return { ...value, targetHostname: hostname, sourceCommit: value.sourceCommit.toLowerCase(), phase4EvidenceFingerprint: value.phase4EvidenceFingerprint.toLowerCase() }
}

export function validatePhase4Evidence(value, approval) {
  if (value?.contract !== 'public-websites-pilot-closeout-phase4-evidence-v1' || value?.status !== 'ACTIVE' || value?.active !== true) {
    throw new Error('An active Phase 4 dark-launch evidence artifact is required.')
  }
  const { evidenceFingerprint, ...core } = value
  const actual = createHash('sha256').update(JSON.stringify(core)).digest('hex')
  if (actual !== evidenceFingerprint || actual !== approval.phase4EvidenceFingerprint) throw new Error('Phase 4 evidence fingerprint does not verify.')
  if (value?.target?.organisationId !== approval.organisationId) throw new Error('Phase 4 evidence belongs to another organisation.')
  return actual
}

function registrableDomain(hostname) {
  const labels = hostname.split('.').filter(Boolean)
  const suffix = labels.slice(-2).join('.')
  return labels.slice(-(new Set(['co.za', 'org.za', 'net.za', 'web.za']).has(suffix) ? 3 : 2)).join('.')
}

async function safeResolve(resolver, name) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await resolver(name) } catch (error) {
      if (['ENODATA', 'ENOTFOUND', 'ENODOMAIN'].includes(error?.code)) return []
      if (attempt === 1) return []
    }
  }
  return []
}

function txtValues(rows) { return rows.map((parts) => parts.join('')).sort() }

export async function captureDnsBaseline(hostname) {
  const root = registrableDomain(hostname)
  const [cname, a, aaaa, mx, ns, rootTxt, dmarcTxt] = await Promise.all([
    safeResolve(resolveCname, hostname), safeResolve(resolve4, hostname), safeResolve(resolve6, hostname),
    safeResolve(resolveMx, root), safeResolve(resolveNs, root), safeResolve(resolveTxt, root), safeResolve(resolveTxt, `_dmarc.${root}`),
  ])
  return {
    contract: 'public-websites-pilot-closeout-phase5-dns-baseline-v1',
    hostname, registrableDomain: root, capturedAt: new Date().toISOString(),
    websiteRecordsBefore: [
      ...cname.map((value) => ({ name: hostname, type: 'CNAME', value })),
      ...a.map((value) => ({ name: hostname, type: 'A', value })),
      ...aaaa.map((value) => ({ name: hostname, type: 'AAAA', value })),
    ],
    emailAndIdentityRecordsBefore: [
      ...mx.sort((x, y) => x.priority - y.priority).map((row) => ({ name: root, type: 'MX', priority: row.priority, value: row.exchange })),
      ...txtValues(rootTxt).map((value) => ({ name: root, type: 'TXT', value })),
      ...txtValues(dmarcTxt).map((value) => ({ name: `_dmarc.${root}`, type: 'TXT', value })),
    ],
    nameserversBefore: ns.sort(),
    plannedWebsiteRecords: [],
    emailDnsUnchanged: true,
    nameserversUnchanged: true,
    domainLinked: false,
    dnsChanged: false,
  }
}

async function one(query, label) {
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`${label}: ${error.message}`)
  return data || null
}

async function fetchCheck(url, init = {}) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12_000), ...init })
    return { status: response.status, location: response.headers.get('location'), text: await response.text() }
  } catch (error) { return { status: 0, location: null, text: '', error: error instanceof Error ? error.message : String(error) } }
}

export async function collectPreLinkEvidence(client, { projectRef, organisationId, hostname }) {
  const [darkLaunch, release, baseline] = await Promise.all([
    one(client.from('website_production_dark_launches').select('*').eq('organisation_id', organisationId), 'Dark launch could not be loaded'),
    one(client.from('website_production_releases').select('*').eq('organisation_id', organisationId), 'Go-live release could not be loaded'),
    captureDnsBaseline(hostname),
  ])
  const customDomain = release?.website_site_id ? await one(
    client.from('website_domains').select('hostname,status,is_primary,verified_at').eq('website_site_id', release.website_site_id).eq('hostname', hostname),
    'Custom domain could not be loaded',
  ) : null
  const [home, apex, robots, sitemap] = await Promise.all([
    fetchCheck(`https://${hostname}/`),
    fetchCheck(`https://${registrableDomain(hostname)}/`),
    fetchCheck(`https://${hostname}/robots.txt`),
    fetchCheck(`https://${hostname}/sitemap.xml`),
  ])
  const linked = Boolean(customDomain)
  const active = release?.status === 'active' && customDomain?.status === 'active' && customDomain?.is_primary === true
  const checks = [
    { id: 'dark-launch:active', passed: darkLaunch?.status === 'active', evidence: darkLaunch?.status || 'missing' },
    { id: 'client-approval:recorded', passed: release?.client_approval_json?.clientApproved === true, evidence: release?.approval_reference || 'missing' },
    { id: 'domain:linked', passed: linked, evidence: linked ? customDomain.status : 'not linked (intentional)' },
    { id: 'domain:active-primary', passed: active, evidence: active ? 'active primary' : 'not active' },
    { id: 'dns:baseline-captured', passed: baseline.websiteRecordsBefore.length > 0, evidence: `${baseline.websiteRecordsBefore.length} website record(s)` },
    { id: 'dns:email-baseline-captured', passed: baseline.emailAndIdentityRecordsBefore.some((row) => row.type === 'MX'), evidence: `${baseline.emailAndIdentityRecordsBefore.length} email/identity record(s)` },
    { id: 'dns:nameservers-captured', passed: baseline.nameserversBefore.length > 0, evidence: baseline.nameserversBefore.join(', ') },
    { id: 'https:ready', passed: active && home.status === 200, evidence: `HTTP ${home.status || 'unreachable'}` },
    { id: 'redirect:apex-to-primary', passed: active && [301, 302, 307, 308].includes(apex.status) && String(apex.location || '').startsWith(`https://${hostname}`), evidence: apex.location || `HTTP ${apex.status || 'unreachable'}` },
    { id: 'seo:robots', passed: active && robots.status === 200 && !/disallow:\s*\//i.test(robots.text) && robots.text.includes(`https://${hostname}/sitemap.xml`), evidence: `HTTP ${robots.status || 'unreachable'}` },
    { id: 'seo:sitemap', passed: active && sitemap.status === 200 && sitemap.text.includes(`https://${hostname}`), evidence: `HTTP ${sitemap.status || 'unreachable'}` },
    { id: 'analytics:present', passed: active && /\/_vercel\/insights\/script\.js|va\.vercel-scripts\.com\/v1\/script\.js/i.test(home.text), evidence: active ? 'checked live HTML' : 'awaiting domain activation' },
    { id: 'crm:post-activation-lead', passed: false, evidence: active ? 'not yet submitted' : 'awaiting domain activation' },
    { id: 'email-dns:unchanged', passed: true, evidence: 'read-only baseline; no changes made' },
  ]
  const ready = checks.every((check) => check.passed)
  return {
    contract: 'public-websites-pilot-closeout-phase5-readiness-v1',
    capturedAt: new Date().toISOString(), target: { projectRef, organisationId, hostname },
    status: ready ? 'ACTIVE' : 'BLOCKED_PRE_LINK', readyForPhase6: ready,
    boundary: { domainLinked: linked, dnsChanged: false, clientTrafficMoved: active },
    checks, dnsBaseline: baseline,
  }
}

function usage() {
  console.log(`Usage: node scripts/public-websites-pilot-closeout-phase5-go-live.mjs [--preflight|--approve] --organisation-id <uuid> --hostname <client hostname> [--output path]\nApproval requires --approval, --phase4-evidence, --operator and --confirm ${GO_LIVE_CONFIRMATION}. Neither operation links a domain or changes DNS.`)
}

async function main() {
  const options = parseGoLiveArgs()
  if (options.help) return usage()
  if (!UUID.test(options.organisationId)) throw new Error('--organisation-id must be a UUID.')
  if (!options.hostname) throw new Error('--hostname is required.')
  const target = assertProductionTarget()
  const client = createClient(target.url, target.key, { auth: { persistSession: false, autoRefreshToken: false } })
  if (options.action === 'approve') {
    if (options.confirmation !== GO_LIVE_CONFIRMATION) throw new Error(`Approval requires --confirm ${GO_LIVE_CONFIRMATION}.`)
    if (String(options.operator).trim().length < 2) throw new Error('--operator is required.')
    const approval = validateGoLiveApproval(readJson(options.approvalPath, 'Phase 5 client approval'))
    if (approval.organisationId !== options.organisationId || approval.targetHostname !== options.hostname) throw new Error('CLI target does not match the client approval.')
    validatePhase4Evidence(readJson(options.phase4EvidencePath, 'Phase 4 evidence'), approval)
    const { error } = await client.rpc('website_approve_dark_launch_go_live', {
      p_organisation_id: options.organisationId,
      p_target_hostname: approval.targetHostname,
      p_source_commit: approval.sourceCommit,
      p_candidate_deployment_url: approval.candidateDeploymentUrl,
      p_rollback_deployment_url: approval.rollbackDeploymentUrl,
      p_phase4_evidence_fingerprint: approval.phase4EvidenceFingerprint,
      p_client_approval: approval,
      p_approved_at: approval.approvedAt,
      p_configured_by: options.operator,
    })
    if (error) throw new Error(`Phase 5 approval was not recorded: ${error.message}`)
  }
  const report = await collectPreLinkEvidence(client, { projectRef: target.projectRef, organisationId: options.organisationId, hostname: options.hostname })
  const evidence = { ...report, evidenceFingerprint: createHash('sha256').update(JSON.stringify(report)).digest('hex') }
  const output = `${JSON.stringify(evidence, null, 2)}\n`
  if (options.output) {
    const outputPath = resolve(options.output)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, output, { encoding: 'utf8', mode: 0o400 })
    chmodSync(outputPath, 0o400)
  } else process.stdout.write(output)
  if (options.requireReady && !report.readyForPhase6) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Phase 5 go-live blocked: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
