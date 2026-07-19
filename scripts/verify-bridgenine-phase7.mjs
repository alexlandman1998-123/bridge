#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { resolve4, resolveCname, resolveMx, resolveTxt } from 'node:dns/promises'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const EVIDENCE_DIR = path.join(ROOT, 'migration-evidence/2026-07-19-bridgenine-removal-phase7')
const WRITE_EVIDENCE = process.argv.includes('--write')
const DOMAIN = 'bridgenine.co.za'

const checks = []

function record(id, passed, detail, evidence = undefined) {
  checks.push({ id, passed: Boolean(passed), detail, ...(evidence === undefined ? {} : { evidence }) })
}

function command(command, args) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    }
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout || ''),
      stderr: String(error?.stderr || ''),
      status: Number(error?.status ?? 1),
    }
  }
}

async function dnsLookup(resolver, name) {
  try {
    return { present: true, records: await resolver(name) }
  } catch (error) {
    if (error?.code === 'ENODATA' || error?.code === 'ENOTFOUND') {
      return { present: false, records: [] }
    }
    return { present: null, records: [], error: error?.code || error?.message || 'DNS lookup failed' }
  }
}

async function endpoint(url, { expectedStatus, mustBeRetired = false } = {}) {
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    })
    if (mustBeRetired) {
      return {
        passed: response.status >= 400,
        detail: response.status >= 400
          ? `Retired host does not serve or redirect application traffic (HTTP ${response.status}).`
          : `Retired host still serves or redirects traffic (HTTP ${response.status}).`,
        status: response.status,
      }
    }
    return {
      passed: response.status === expectedStatus,
      detail: `Expected HTTP ${expectedStatus}; received HTTP ${response.status}.`,
      status: response.status,
    }
  } catch (error) {
    if (mustBeRetired && (error?.cause?.code === 'ENOTFOUND' || error?.cause?.code === 'EAI_AGAIN')) {
      return {
        passed: true,
        detail: 'Retired host no longer resolves.',
        networkError: error.cause.code,
      }
    }
    return {
      passed: false,
      detail: `Endpoint check failed: ${error?.cause?.code || error?.message || 'unknown error'}.`,
    }
  }
}

const exactDomainPattern = /(^|\s)bridgenine\.co\.za(\s|$)/im
const oldHostPattern = /(^|\s)(?:www\.|app\.|admin\.)?bridgenine\.co\.za(\s|$)/im

const vercelDomains = command('vercel', ['domains', 'ls'])
record(
  'vercel.domain_ownership_removed',
  vercelDomains.ok && !exactDomainPattern.test(vercelDomains.stdout),
  vercelDomains.ok
    ? 'Vercel team domain inventory does not contain bridgenine.co.za.'
    : 'Unable to read the Vercel team domain inventory.',
)

const vercelAliases = command('vercel', ['alias', 'ls', '--limit', '100'])
record(
  'vercel.aliases_removed',
  vercelAliases.ok && !oldHostPattern.test(vercelAliases.stdout),
  vercelAliases.ok
    ? 'Vercel alias inventory contains no Bridgenine web hosts.'
    : 'Unable to read the Vercel alias inventory.',
)

const apexA = await dnsLookup(resolve4, DOMAIN)
record(
  'dns.apex_a_removed',
  apexA.present === false,
  apexA.present === false
    ? 'Apex A record is absent.'
    : apexA.present === true
      ? 'Apex A record is still present.'
      : `Apex A record could not be verified: ${apexA.error}.`,
  { recordCount: apexA.records.length },
)

for (const host of ['www', 'app', 'admin']) {
  const name = `${host}.${DOMAIN}`
  const cname = await dnsLookup(resolveCname, name)
  record(
    `dns.${host}_cname_removed`,
    cname.present === false,
    cname.present === false
      ? `${name} CNAME is absent.`
      : cname.present === true
        ? `${name} CNAME is still present.`
        : `${name} CNAME could not be verified: ${cname.error}.`,
    { recordCount: cname.records.length },
  )
}

const mx = await dnsLookup(resolveMx, DOMAIN)
const txt = await dnsLookup(resolveTxt, DOMAIN)
const flattenedTxt = txt.records.map((parts) => parts.join(''))
const hasSpf = flattenedTxt.some((value) => value.startsWith('v=spf1'))
const hasMailConfig = flattenedTxt.some((value) => value.startsWith('mailconf='))
const mailDecision = String(process.env.BRIDGENINE_MAIL_DECISION || '').trim().toLowerCase()

if (mailDecision === 'retain') {
  record(
    'mail.policy_applied',
    mx.present === true && mx.records.length > 0 && hasSpf && hasMailConfig,
    'Mail-retention policy requires MX, SPF, and mail configuration records to remain present.',
    { decision: mailDecision, mxCount: mx.records.length, hasSpf, hasMailConfig },
  )
} else if (mailDecision === 'retire') {
  record(
    'mail.policy_applied',
    mx.present === false && !hasSpf && !hasMailConfig,
    'Mail-retirement policy requires MX, SPF, and mail configuration records to be absent.',
    { decision: mailDecision, mxCount: mx.records.length, hasSpf, hasMailConfig },
  )
} else {
  record(
    'mail.policy_applied',
    false,
    'Set BRIDGENINE_MAIL_DECISION=retain or retire after mailbox ownership is confirmed.',
    { decision: null, mxCount: mx.records.length, hasSpf, hasMailConfig },
  )
}

const canonicalEndpoints = [
  ['web.arch9_apex', 'https://arch9.co.za/'],
  ['web.arch9_www', 'https://www.arch9.co.za/'],
  ['web.arch9_app', 'https://app.arch9.co.za/auth'],
  ['web.arch9_admin', 'https://admin.arch9.co.za/login'],
  ['web.arch9_listings_api', 'https://app.arch9.co.za/api/public/listings'],
]

for (const [id, url] of canonicalEndpoints) {
  const result = await endpoint(url, { expectedStatus: 200 })
  record(id, result.passed, result.detail, { url, status: result.status ?? null })
}

for (const host of [DOMAIN, `www.${DOMAIN}`, `app.${DOMAIN}`, `admin.${DOMAIN}`]) {
  const url = `https://${host}/`
  const result = await endpoint(url, { mustBeRetired: true })
  record(`web.retired_${host.replaceAll('.', '_')}`, result.passed, result.detail, {
    url,
    status: result.status ?? null,
    networkError: result.networkError ?? null,
  })
}

const repositoryScan = command('rg', [
  '-n',
  '-i',
  'bridgenine\\.co\\.za',
  'supabase/config.toml',
  'the-it-guy/vercel.json',
  'apps/admin/vercel.json',
  'the-it-guy/src',
  'apps/admin/src',
  '--glob',
  '!**/__tests__/**',
])
const repositoryClean = !repositoryScan.ok && repositoryScan.status === 1
record(
  'repository.active_references_removed',
  repositoryClean,
  repositoryClean
    ? 'No active application/configuration Bridgenine references were found.'
    : repositoryScan.ok
      ? 'Active application/configuration Bridgenine references remain.'
      : 'Repository reference scan could not be completed.',
  repositoryScan.ok ? { matches: repositoryScan.stdout.trim().split('\n').filter(Boolean).slice(0, 20) } : undefined,
)

record(
  'supabase.redirect_allowlist_verified',
  process.env.BRIDGENINE_SUPABASE_ALLOWLIST_VERIFIED === 'true',
  process.env.BRIDGENINE_SUPABASE_ALLOWLIST_VERIFIED === 'true'
    ? 'Live Supabase Auth redirect allowlist was explicitly verified clean.'
    : 'Live Supabase Auth redirect allowlist has not been explicitly verified clean.',
)

record(
  'supabase.auth_exception_resolved',
  process.env.BRIDGENINE_AUTH_EXCEPTION_RESOLVED === 'true',
  process.env.BRIDGENINE_AUTH_EXCEPTION_RESOLVED === 'true'
    ? 'The nine previously unreadable Auth positions were explicitly resolved or accepted.'
    : 'The nine previously unreadable Supabase Auth positions remain unresolved.',
)

const failedChecks = checks.filter((check) => !check.passed)
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  domain: DOMAIN,
  status: failedChecks.length === 0 ? 'complete' : 'blocked',
  summary: {
    total: checks.length,
    passed: checks.length - failedChecks.length,
    failed: failedChecks.length,
  },
  checks,
  blockers: failedChecks.map(({ id, detail }) => ({ id, detail })),
}

if (WRITE_EVIDENCE) {
  await mkdir(EVIDENCE_DIR, { recursive: true })
  await writeFile(path.join(EVIDENCE_DIR, 'audit-latest.json'), `${JSON.stringify(report, null, 2)}\n`)
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.exitCode = failedChecks.length === 0 ? 0 : 2
