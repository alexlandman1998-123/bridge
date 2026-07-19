import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { runRuntimeReadiness } from './agency-runtime-readiness.test.mjs'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const LEAD_CAPTURE_DOMAIN = 'leads.arch9.co.za'
const REQUIRED_SOURCES = ['General', 'Website', 'Property24', 'Private Property', 'Facebook']
const EXPECTED_MX_HOSTS = ['mxa.mailgun.org', 'mxb.mailgun.org']
const ENV_FILE = `${appRoot}/.env.staging.local`

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function parseArgs(argv) {
  const options = {
    persistIsolationEnv: false,
    sampleLimit: 1,
    skipNetwork: false,
  }

  for (const arg of argv) {
    if (arg === '--persist-isolation-env') {
      options.persistIsolationEnv = true
    } else if (arg === '--skip-network') {
      options.skipNetwork = true
    } else if (arg.startsWith('--sample-limit=')) {
      const value = Number.parseInt(arg.slice('--sample-limit='.length), 10)
      if (!Number.isInteger(value) || value < 0 || value > 25) {
        throw new Error('--sample-limit must be an integer from 0 to 25')
      }
      options.sampleLimit = value
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function loadEnv() {
  const localEnv = parseEnvFile(`${appRoot}/.env`)
  const stagingEnv = parseEnvFile(ENV_FILE)
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeText(value)))
  const merged = { ...localEnv, ...stagingEnv, ...processOverrides }

  if (!merged.VITE_SUPABASE_URL && merged.SUPABASE_URL) merged.VITE_SUPABASE_URL = merged.SUPABASE_URL
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.SUPABASE_ANON_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.SUPABASE_ANON_KEY

  return merged
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function createReport() {
  return {
    phase: '2',
    scope: 'lead-pilot-environment-readiness',
    generatedAt: new Date().toISOString(),
    targetProjectRef: STAGING_PROJECT_REF,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until blocked environment probes are completed',
      passCount: 0,
      warningCount: 0,
      blockedCount: 0,
      criticalCount: 0,
    },
    findings: [],
    aliases: {
      totalActive: 0,
      organisations: 0,
      agents: 0,
      bySource: {},
      sourceSpecificAgentAliases: 0,
    },
    mx: {
      domain: LEAD_CAPTURE_DOMAIN,
      hosts: [],
    },
    runtimeReadiness: null,
  }
}

function addFinding(report, phase, status, title, detail = '') {
  report.findings.push({ phase, status, title, detail })
  if (status === 'PASS') report.summary.passCount += 1
  if (status === 'WARN') report.summary.warningCount += 1
  if (status === 'BLOCKED') report.summary.blockedCount += 1
  if (status === 'CRITICAL') report.summary.criticalCount += 1
}

function finalizeReport(report) {
  if (report.summary.criticalCount > 0) {
    report.summary.status = 'FAILED'
    report.summary.recommendation = 'NO-GO'
  } else if (report.summary.blockedCount > 0) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until blocked environment probes are completed'
  } else if (report.summary.warningCount > 0) {
    report.summary.status = 'READY_WITH_WARNINGS'
    report.summary.recommendation = 'Proceed only after reviewing warnings'
  } else {
    report.summary.status = 'READY'
    report.summary.recommendation = 'Lead pilot environment checks passed'
  }
  return report
}

function requireConfig(env, report) {
  const config = {
    supabaseUrl: normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizeText(env.SUPABASE_SERVICE_ROLE_KEY),
    anonKey: normalizeText(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || env.SUPABASE_ANON_KEY),
    actorEmail: normalizeLower(env.AGENCY_RUNTIME_AGENT_EMAIL || env.STAGING_INTERNAL_EMAIL),
    actorPassword: normalizeText(env.AGENCY_RUNTIME_AGENT_PASSWORD || env.STAGING_INTERNAL_PASSWORD),
    externalEmail: normalizeLower(env.AGENCY_RUNTIME_UNRELATED_EMAIL),
    externalPassword: normalizeText(env.AGENCY_RUNTIME_UNRELATED_PASSWORD),
  }
  config.projectRef = projectRefFromUrl(config.supabaseUrl)

  const missing = []
  if (!config.supabaseUrl) missing.push('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!config.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!config.anonKey) missing.push('VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY/SUPABASE_ANON_KEY')
  if (!config.actorEmail) missing.push('AGENCY_RUNTIME_AGENT_EMAIL/STAGING_INTERNAL_EMAIL')
  if (!config.actorPassword) missing.push('AGENCY_RUNTIME_AGENT_PASSWORD/STAGING_INTERNAL_PASSWORD')

  if (missing.length) {
    addFinding(report, 'Environment', 'BLOCKED', 'Missing staging environment credentials.', missing.join(', '))
  } else {
    addFinding(report, 'Environment', 'PASS', 'Required staging environment credentials are configured.')
  }

  if (!config.projectRef) {
    addFinding(report, 'Environment', 'BLOCKED', 'Could not resolve Supabase project ref from URL.')
  } else if (config.projectRef !== STAGING_PROJECT_REF) {
    addFinding(
      report,
      'Environment',
      'CRITICAL',
      'Pilot readiness is pointed at the wrong Supabase project.',
      `Expected ${STAGING_PROJECT_REF}; resolved ${config.projectRef}.`,
    )
  } else {
    addFinding(report, 'Environment', 'PASS', 'Pilot readiness is pointed at the approved staging Supabase project.')
  }

  return { config, missing }
}

function createServiceClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function updateEnvFile(filePath, values) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').split(/\n/) : []
  const remaining = existing.filter((line) => {
    const key = line.split('=')[0]
    return !Object.hasOwn(values, key)
  })
  const additions = Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`)
  fs.writeFileSync(filePath, `${[...remaining.filter(Boolean), ...additions].join('\n')}\n`)
}

function createFixturePassword() {
  return `${crypto.randomBytes(18).toString('base64url')}A9!`
}

function createFixtureEmail() {
  const token = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  return `qa.agency.runtime.unrelated+${token}@example.test`
}

async function persistIsolationEnvIfNeeded(report, config, options) {
  if (config.externalEmail && config.externalPassword) {
    addFinding(report, 'External Isolation', 'PASS', 'Unrelated-user staging credentials are configured.')
    return true
  }

  if (!options.persistIsolationEnv) {
    addFinding(
      report,
      'External Isolation',
      'BLOCKED',
      'Unrelated-user staging credentials are not configured.',
      'Run this script once with --persist-isolation-env to create a managed staging fixture in the ignored .env.staging.local file.',
    )
    return false
  }

  const service = createServiceClient(config)
  const email = createFixtureEmail()
  const password = createFixturePassword()
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      fixture_namespace: 'lead_pilot_phase2',
      fixture_role: 'unrelated_agency_rls_probe',
      source: 'lead-pilot-environment-readiness',
      created_at: new Date().toISOString(),
    },
  })

  if (error) {
    addFinding(report, 'External Isolation', 'BLOCKED', 'Could not create unrelated-user staging fixture.', error.message)
    return false
  }

  const userId = data?.user?.id || ''
  const { data: memberships, error: membershipError } = await service
    .from('organisation_users')
    .select('id')
    .eq('user_id', userId)
    .limit(1)

  if (membershipError) {
    addFinding(report, 'External Isolation', 'BLOCKED', 'Could not verify unrelated fixture membership.', membershipError.message)
    return false
  }

  if (Array.isArray(memberships) && memberships.length > 0) {
    addFinding(report, 'External Isolation', 'CRITICAL', 'Unrelated fixture unexpectedly has organisation membership.')
    return false
  }

  updateEnvFile(ENV_FILE, {
    AGENCY_RUNTIME_UNRELATED_EMAIL: email,
    AGENCY_RUNTIME_UNRELATED_PASSWORD: password,
  })
  process.env.AGENCY_RUNTIME_UNRELATED_EMAIL = email
  process.env.AGENCY_RUNTIME_UNRELATED_PASSWORD = password
  config.externalEmail = email
  config.externalPassword = password
  addFinding(report, 'External Isolation', 'PASS', 'Managed unrelated-user staging fixture created and stored in ignored local env.')
  return true
}

async function checkLeadCaptureAliases(report, config) {
  const service = createServiceClient(config)
  const { data, error } = await service
    .from('lead_capture_aliases')
    .select('alias_id,organisation_id,agent_user_id,source,routing_level,alias_domain,status')
    .eq('alias_domain', LEAD_CAPTURE_DOMAIN)
    .eq('status', 'active')
    .limit(1000)

  if (error) {
    addFinding(report, 'Lead Capture Aliases', 'CRITICAL', 'Could not read active lead capture aliases.', error.message)
    return
  }

  const rows = Array.isArray(data) ? data : []
  const organisations = new Set(rows.map((row) => normalizeText(row.organisation_id)).filter(Boolean))
  const agents = new Set(rows.map((row) => normalizeText(row.agent_user_id)).filter(Boolean))
  const bySource = Object.fromEntries(REQUIRED_SOURCES.map((source) => [source, 0]))
  let sourceSpecificAgentAliases = 0

  for (const row of rows) {
    const source = REQUIRED_SOURCES.find((item) => normalizeLower(item) === normalizeLower(row.source))
    if (source) bySource[source] += 1
    if (
      normalizeLower(row.routing_level) === 'agent_source' &&
      normalizeText(row.agent_user_id) &&
      REQUIRED_SOURCES.slice(1).some((item) => normalizeLower(item) === normalizeLower(row.source))
    ) {
      sourceSpecificAgentAliases += 1
    }
  }

  report.aliases = {
    totalActive: rows.length,
    organisations: organisations.size,
    agents: agents.size,
    bySource,
    sourceSpecificAgentAliases,
  }

  if (!rows.length) {
    addFinding(report, 'Lead Capture Aliases', 'CRITICAL', 'No active lead capture aliases exist for the pilot domain.')
    return
  }

  if (!organisations.size || !agents.size) {
    addFinding(report, 'Lead Capture Aliases', 'CRITICAL', 'Active aliases do not cover at least one organisation and one agent.')
  } else {
    addFinding(
      report,
      'Lead Capture Aliases',
      'PASS',
      'Active pilot aliases cover organisations and agents.',
      `${organisations.size} organisation(s), ${agents.size} agent(s), ${rows.length} active alias(es).`,
    )
  }

  const missingSources = REQUIRED_SOURCES.filter((source) => bySource[source] === 0)
  if (missingSources.length) {
    addFinding(report, 'Lead Capture Aliases', 'CRITICAL', 'Pilot aliases are missing required sources.', missingSources.join(', '))
  } else {
    addFinding(report, 'Lead Capture Aliases', 'PASS', 'Pilot aliases exist for every required source.')
  }

  if (sourceSpecificAgentAliases < REQUIRED_SOURCES.length - 1) {
    addFinding(report, 'Lead Capture Aliases', 'CRITICAL', 'Source-specific agent aliases are incomplete.')
  } else {
    addFinding(report, 'Lead Capture Aliases', 'PASS', 'Source-specific agent aliases are active.')
  }
}

async function checkMx(report) {
  try {
    const records = await dns.resolveMx(LEAD_CAPTURE_DOMAIN)
    const hosts = records
      .map((record) => normalizeLower(record.exchange).replace(/\.$/, ''))
      .sort()
    report.mx.hosts = hosts

    const missingHosts = EXPECTED_MX_HOSTS.filter((host) => !hosts.includes(host))
    if (missingHosts.length) {
      addFinding(report, 'Mail Routing', 'CRITICAL', 'Lead capture domain MX records are not pointed at Mailgun.', missingHosts.join(', '))
    } else {
      addFinding(report, 'Mail Routing', 'PASS', 'Lead capture domain MX records point at Mailgun.')
    }
  } catch (error) {
    addFinding(report, 'Mail Routing', 'BLOCKED', 'Could not resolve lead capture MX records.', error?.message || String(error))
  }
}

function checkBuildConfig(report) {
  const packageJson = JSON.parse(fs.readFileSync(`${appRoot}/package.json`, 'utf8'))
  const buildScript = normalizeText(packageJson?.scripts?.build)
  if (buildScript.includes('--max-old-space-size=8192')) {
    addFinding(report, 'Build Config', 'PASS', 'Build command sets the pilot heap size.')
  } else {
    addFinding(report, 'Build Config', 'CRITICAL', 'Build command does not set NODE_OPTIONS heap size.')
  }

  const viteConfig = fs.readFileSync(`${appRoot}/vite.config.js`, 'utf8')
  if (viteConfig.includes('document-title-fallback') && viteConfig.includes('Bridge Nine')) {
    addFinding(report, 'Build Config', 'PASS', 'Document title has a Bridge Nine fallback for missing staging env.')
  } else {
    addFinding(report, 'Build Config', 'CRITICAL', 'Document title fallback is not configured.')
  }
}

async function checkRuntimeReadiness(report, options) {
  const runtimeReport = await runRuntimeReadiness({
    failOnBlocked: true,
    skipNetwork: false,
    sampleLimit: options.sampleLimit,
  })
  report.runtimeReadiness = {
    status: runtimeReport.summary.status,
    recommendation: runtimeReport.summary.recommendation,
    passCount: runtimeReport.summary.passCount,
    warningCount: runtimeReport.summary.warningCount,
    blockedCount: runtimeReport.summary.blockedCount,
    criticalCount: runtimeReport.summary.criticalCount,
    externalIsolationProbes: runtimeReport.runtime?.externalIsolationProbes || [],
  }

  if (runtimeReport.summary.criticalCount > 0) {
    addFinding(report, 'Runtime Readiness', 'CRITICAL', 'Agency runtime readiness failed.', runtimeReport.summary.recommendation)
  } else if (runtimeReport.summary.blockedCount > 0) {
    addFinding(report, 'Runtime Readiness', 'BLOCKED', 'Agency runtime readiness is blocked.', runtimeReport.summary.recommendation)
  } else {
    addFinding(report, 'Runtime Readiness', 'PASS', 'Agency runtime readiness passed with unrelated-user isolation.')
  }
}

async function run(options = parseArgs(process.argv.slice(2))) {
  const report = createReport()
  const env = loadEnv()
  const { config, missing } = requireConfig(env, report)
  checkBuildConfig(report)

  if (options.skipNetwork) {
    addFinding(report, 'Network', 'BLOCKED', 'Network probes skipped by --skip-network.')
    return finalizeReport(report)
  }

  if (missing.length || !config.projectRef || config.projectRef !== STAGING_PROJECT_REF) {
    return finalizeReport(report)
  }

  const isolationReady = await persistIsolationEnvIfNeeded(report, config, options)
  await checkLeadCaptureAliases(report, config)
  await checkMx(report)
  if (isolationReady) await checkRuntimeReadiness(report, options)

  return finalizeReport(report)
}

const report = await run()
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

if (report.summary.criticalCount > 0 || report.summary.blockedCount > 0) {
  process.exitCode = 1
}
