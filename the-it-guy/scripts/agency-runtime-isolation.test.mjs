import crypto from 'node:crypto'
import fs from 'node:fs'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { runRuntimeReadiness } from './agency-runtime-readiness.test.mjs'

const appRoot = new URL('../', import.meta.url)
const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const FIXTURE_NAMESPACE = 'agency_runtime_phase8'
const DEFAULT_UNRELATED_EMAIL_PREFIX = 'qa.agency.runtime.unrelated'
const DEFAULT_UNRELATED_EMAIL_DOMAIN = 'bridgenine.co.za'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    sampleLimit: 1,
  }

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true
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
  const localEnv = parseEnvFile(new URL('.env', appRoot))
  const stagingEnv = parseEnvFile(new URL('.env.staging.local', appRoot))
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

function createRunToken() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

function createReport(options) {
  return {
    phase: '8',
    scope: 'agency-runtime-isolation',
    generatedAt: new Date().toISOString(),
    mode: options.dryRun ? 'dry-run' : 'staging-auth-fixture-and-runtime-probe',
    targetProjectRef: STAGING_PROJECT_REF,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until external isolation is proven',
      passCount: 0,
      warningCount: 0,
      blockedCount: 0,
      criticalCount: 0,
    },
    findings: [],
    fixture: {
      namespace: FIXTURE_NAMESPACE,
      email: null,
      userId: null,
      exists: false,
      created: false,
      updated: false,
      ephemeral: false,
      passwordGenerated: false,
      membershipRows: null,
    },
    runtimeSummary: null,
    runtimeFindings: [],
    externalIsolationProbes: [],
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
    report.summary.recommendation = 'NO-GO until blocked isolation checks are completed'
  } else if (report.summary.warningCount > 0) {
    report.summary.status = 'READY_WITH_WARNINGS'
    report.summary.recommendation = report.mode === 'dry-run'
      ? 'Dry-run only; run without --dry-run to prove external isolation'
      : 'External isolation passed; review warnings before launch'
  } else {
    report.summary.status = 'READY'
    report.summary.recommendation = 'External isolation passed'
  }
  return report
}

function requireConfig(env, report) {
  const configuredEmail = normalizeEmail(env.AGENCY_RUNTIME_UNRELATED_EMAIL || env.AGENCY_RUNTIME_ISOLATION_EMAIL)
  const generatedEmail = `${DEFAULT_UNRELATED_EMAIL_PREFIX}+${createRunToken()}@${DEFAULT_UNRELATED_EMAIL_DOMAIN}`
  const config = {
    supabaseUrl: normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizeText(env.SUPABASE_SERVICE_ROLE_KEY),
    anonKey: normalizeText(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || env.SUPABASE_ANON_KEY),
    email: configuredEmail || generatedEmail,
    generatedEmail: !configuredEmail,
    password: normalizeText(env.AGENCY_RUNTIME_UNRELATED_PASSWORD || env.AGENCY_RUNTIME_ISOLATION_PASSWORD),
  }
  config.projectRef = projectRefFromUrl(config.supabaseUrl)

  report.fixture.email = config.email
  report.fixture.ephemeral = config.generatedEmail

  const missing = []
  if (!config.supabaseUrl) missing.push('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!config.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!config.anonKey) missing.push('VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY/SUPABASE_ANON_KEY')

  if (missing.length) {
    addFinding(report, 'Environment', 'BLOCKED', 'Missing staging fixture credentials.', missing.join(', '))
  } else {
    addFinding(report, 'Environment', 'PASS', 'Staging fixture credentials are configured.')
  }

  if (!config.projectRef) {
    addFinding(report, 'Environment', 'BLOCKED', 'Could not resolve Supabase project ref from URL.')
  } else if (config.projectRef !== STAGING_PROJECT_REF) {
    addFinding(
      report,
      'Environment',
      'CRITICAL',
      'Runtime isolation is pointed at the wrong Supabase project.',
      `Expected ${STAGING_PROJECT_REF}; resolved ${config.projectRef}.`,
    )
  } else {
    addFinding(report, 'Environment', 'PASS', 'Runtime isolation is pointed at the approved staging Supabase project.')
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

function buildFixtureMetadata(existingMetadata = {}) {
  return {
    ...existingMetadata,
    fixture_namespace: FIXTURE_NAMESPACE,
    fixture_role: 'unrelated_agency_rls_probe',
    source: 'agency-runtime-isolation',
    updated_at: new Date().toISOString(),
  }
}

function generatePassword() {
  return `${crypto.randomBytes(18).toString('base64url')}A9!`
}

async function findAuthUserByEmail(service, email) {
  let page = 1
  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const users = Array.isArray(data?.users) ? data.users : []
    const found = users.find((user) => normalizeEmail(user?.email) === email)
    if (found?.id) return found
    if (users.length < 200) return null
    page += 1
  }
}

async function signInExistingFixture(config) {
  if (!config.password) return null
  const client = createClient(config.supabaseUrl, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
  const { data, error } = await client.auth.signInWithPassword({
    email: config.email,
    password: config.password,
  })
  await client.auth.signOut({ scope: 'local' }).catch(() => {})
  if (error) return null
  return data?.user || null
}

async function ensureFixtureUser(service, config, report) {
  let lookupError = null
  let existingUser = null
  try {
    existingUser = await findAuthUserByEmail(service, config.email)
  } catch (error) {
    lookupError = error
  }
  if (!existingUser && !config.generatedEmail) {
    existingUser = await signInExistingFixture(config)
  }
  if (existingUser?.id) {
    if (!config.password) {
      throw new Error('AGENCY_RUNTIME_UNRELATED_PASSWORD or AGENCY_RUNTIME_ISOLATION_PASSWORD is required to reuse the configured fixture user.')
    }
    report.fixture.userId = existingUser.id
    report.fixture.exists = true
    addFinding(
      report,
      'Fixture',
      'PASS',
      'Existing unrelated auth fixture user reused safely.',
      lookupError ? 'Resolved through the configured fixture credentials because the Auth Admin listing endpoint was unavailable.' : '',
    )
    return { user: existingUser, password: config.password }
  }
  if (lookupError && !config.generatedEmail) throw lookupError

  const password = config.password || generatePassword()
  report.fixture.passwordGenerated = !config.password
  const { data, error } = await service.auth.admin.createUser({
    email: config.email,
    password,
    email_confirm: true,
    user_metadata: buildFixtureMetadata({ created_at: new Date().toISOString() }),
  })
  if (error) throw error

  const user = data?.user || null
  report.fixture.userId = user?.id || null
  report.fixture.created = true
  addFinding(report, 'Fixture', 'PASS', 'Managed unrelated auth fixture user created.', config.generatedEmail ? 'Generated a unique namespaced email for this run.' : '')
  return { user, password }
}

async function assertNoOrganisationMembership(service, user, report) {
  if (!user?.id) {
    addFinding(report, 'Fixture', 'CRITICAL', 'Unrelated auth fixture user has no user id.')
    return false
  }

  const { data, error } = await service
    .from('organisation_users')
    .select('*')
    .eq('user_id', user.id)
    .limit(10)

  if (error) {
    addFinding(report, 'Fixture', 'BLOCKED', 'Could not verify unrelated user organisation membership.', error.message)
    return false
  }

  const rows = Array.isArray(data) ? data.length : 0
  report.fixture.membershipRows = rows
  if (rows > 0) {
    addFinding(report, 'Fixture', 'CRITICAL', 'Unrelated auth fixture user is linked to organisation membership rows.', `${rows} row(s).`)
    return false
  }

  addFinding(report, 'Fixture', 'PASS', 'Unrelated auth fixture user has zero organisation memberships.')
  return true
}

async function runPhase8(options = parseArgs(process.argv.slice(2))) {
  const report = createReport(options)
  const env = loadEnv()
  const { config, missing } = requireConfig(env, report)

  if (missing.length || !config.projectRef || config.projectRef !== STAGING_PROJECT_REF) {
    return finalizeReport(report)
  }

  const service = createServiceClient(config)

  if (options.dryRun) {
    addFinding(
      report,
      'Fixture',
      'WARN',
      'Dry-run did not create an unrelated auth fixture user.',
      config.generatedEmail
        ? 'A unique namespaced auth user would be created during a real run.'
        : 'The configured AGENCY_RUNTIME_UNRELATED_EMAIL would be used during a real run.',
    )
    return finalizeReport(report)
  }

  let fixture
  try {
    fixture = await ensureFixtureUser(service, config, report)
  } catch (error) {
    addFinding(report, 'Fixture', 'BLOCKED', 'Could not create or update unrelated auth fixture user.', error.message)
    return finalizeReport(report)
  }

  const isolated = await assertNoOrganisationMembership(service, fixture.user, report)
  if (!isolated || report.summary.criticalCount > 0 || report.summary.blockedCount > 0) {
    return finalizeReport(report)
  }

  process.env.AGENCY_RUNTIME_UNRELATED_EMAIL = config.email
  process.env.AGENCY_RUNTIME_UNRELATED_PASSWORD = fixture.password

  const runtimeReport = await runRuntimeReadiness({
    failOnBlocked: true,
    skipNetwork: false,
    sampleLimit: options.sampleLimit,
  })

  report.runtimeSummary = runtimeReport.summary
  report.runtimeFindings = runtimeReport.findings
  report.externalIsolationProbes = runtimeReport.runtime?.externalIsolationProbes || []

  if (runtimeReport.summary.criticalCount > 0) {
    addFinding(report, 'External Isolation', 'CRITICAL', 'Runtime external isolation probe failed.', runtimeReport.summary.recommendation)
  } else if (runtimeReport.summary.blockedCount > 0) {
    addFinding(report, 'External Isolation', 'BLOCKED', 'Runtime external isolation probe is blocked.', runtimeReport.summary.recommendation)
  } else {
    addFinding(report, 'External Isolation', 'PASS', 'Runtime external isolation probe passed.')
  }

  return finalizeReport(report)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2))
  const report = await runPhase8(options)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  if (report.summary.criticalCount > 0 || report.summary.blockedCount > 0) {
    process.exitCode = 1
  }
}

export { runPhase8 }
