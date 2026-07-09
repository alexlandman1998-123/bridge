import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'

const REQUIRED_TABLES = [
  { table: 'leads', select: 'lead_id,organisation_id' },
  { table: 'contacts', select: 'contact_id,organisation_id' },
  { table: 'private_listings', select: 'id,organisation_id' },
  { table: 'lead_ingestion_logs', select: 'log_id,organisation_id' },
  { table: 'lead_assignment_history', select: 'assignment_id,organisation_id' },
  { table: 'lead_communication_events', select: 'communication_id,organisation_id' },
  { table: 'lead_requirements', select: 'requirement_id,organisation_id' },
  { table: 'lead_listing_interests', select: 'interest_id,organisation_id' },
  { table: 'lead_saved_searches', select: 'saved_search_id,organisation_id' },
  { table: 'tasks', select: 'task_id,organisation_id' },
  { table: 'listing_publication_data', select: 'id,listing_id' },
  { table: 'listing_media', select: 'id,listing_id' },
  { table: 'listing_external_links', select: 'id,listing_id' },
  { table: 'private_listing_document_requirements', select: 'id,private_listing_id' },
  { table: 'private_listing_documents', select: 'id,private_listing_id' },
]

const REQUIRED_RPCS = [
  'bridge_can_access_private_listing',
  'bridge_delete_agency_lead',
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function parseArgs(argv) {
  const options = {
    failOnBlocked: false,
    skipNetwork: false,
    sampleLimit: 1,
  }

  for (const arg of argv) {
    if (arg === '--fail-on-blocked') {
      options.failOnBlocked = true
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
  const stagingEnv = parseEnvFile(`${appRoot}/.env.staging.local`)
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

function createReport(options) {
  return {
    phase: '7',
    scope: 'agency-runtime-readiness',
    generatedAt: new Date().toISOString(),
    mode: options.skipNetwork ? 'static-readiness' : 'read-only-runtime',
    targetProjectRef: STAGING_PROJECT_REF,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until blocked live probes are completed',
      passCount: 0,
      warningCount: 0,
      blockedCount: 0,
      criticalCount: 0,
    },
    findings: [],
    requiredTables: REQUIRED_TABLES.map((item) => item.table),
    requiredRpcs: REQUIRED_RPCS,
    runtime: {
      projectRef: null,
      actorConfigured: false,
      externalIsolationConfigured: false,
      openApiChecked: false,
      authenticatedReadProbes: [],
      externalIsolationProbes: [],
    },
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
    report.summary.recommendation = 'NO-GO until blocked live probes are completed'
  } else if (report.summary.warningCount > 0) {
    report.summary.status = 'READY_WITH_WARNINGS'
    report.summary.recommendation = 'Proceed only after reviewing warnings'
  } else {
    report.summary.status = 'READY'
    report.summary.recommendation = 'Runtime readiness checks passed'
  }
  return report
}

function requireConfig(env, report) {
  const config = {
    supabaseUrl: normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizeText(env.SUPABASE_SERVICE_ROLE_KEY),
    anonKey: normalizeText(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || env.SUPABASE_ANON_KEY),
    actorEmail: normalizeEmail(env.AGENCY_RUNTIME_AGENT_EMAIL || env.STAGING_INTERNAL_EMAIL),
    actorPassword: normalizeText(env.AGENCY_RUNTIME_AGENT_PASSWORD || env.STAGING_INTERNAL_PASSWORD),
    externalEmail: normalizeEmail(env.AGENCY_RUNTIME_UNRELATED_EMAIL || ''),
    externalPassword: normalizeText(env.AGENCY_RUNTIME_UNRELATED_PASSWORD || ''),
  }
  config.projectRef = projectRefFromUrl(config.supabaseUrl)
  report.runtime.projectRef = config.projectRef || null
  report.runtime.actorConfigured = Boolean(config.actorEmail && config.actorPassword)
  report.runtime.externalIsolationConfigured = Boolean(config.externalEmail && config.externalPassword)

  const missing = []
  if (!config.supabaseUrl) missing.push('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!config.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!config.anonKey) missing.push('VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY/SUPABASE_ANON_KEY')
  if (!config.actorEmail) missing.push('AGENCY_RUNTIME_AGENT_EMAIL/STAGING_INTERNAL_EMAIL')
  if (!config.actorPassword) missing.push('AGENCY_RUNTIME_AGENT_PASSWORD/STAGING_INTERNAL_PASSWORD')

  if (missing.length) {
    addFinding(report, 'Environment', 'BLOCKED', 'Missing runtime credentials.', missing.join(', '))
  } else {
    addFinding(report, 'Environment', 'PASS', 'Required staging runtime credentials are configured.')
  }

  if (!config.projectRef) {
    addFinding(report, 'Environment', 'BLOCKED', 'Could not resolve Supabase project ref from URL.')
  } else if (config.projectRef !== STAGING_PROJECT_REF) {
    addFinding(
      report,
      'Environment',
      'CRITICAL',
      'Runtime readiness is pointed at the wrong Supabase project.',
      `Expected ${STAGING_PROJECT_REF}; resolved ${config.projectRef}.`,
    )
  } else {
    addFinding(report, 'Environment', 'PASS', 'Runtime readiness is pointed at the approved staging Supabase project.')
  }

  if (!config.externalEmail || !config.externalPassword) {
    addFinding(
      report,
      'External Isolation',
      'BLOCKED',
      'Unrelated-user RLS isolation probe is not configured.',
      'Set AGENCY_RUNTIME_UNRELATED_EMAIL and AGENCY_RUNTIME_UNRELATED_PASSWORD to prove non-members cannot see agency rows.',
    )
  }

  return { config, missing }
}

function createSupabaseClient(supabaseUrl, key) {
  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

async function readOpenApi(config) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Accept: 'application/openapi+json',
    },
  })
  if (!response.ok) throw new Error(`OpenAPI schema request failed: HTTP ${response.status}`)
  return response.json()
}

function getSchemas(spec) {
  return spec?.components?.schemas || spec?.definitions || {}
}

function hasTable(spec, table) {
  return Boolean(spec?.paths?.[`/${table}`] || getSchemas(spec)[table])
}

function hasRpc(spec, rpc) {
  return Boolean(spec?.paths?.[`/rpc/${rpc}`])
}

async function runOpenApiProbe(report, config) {
  try {
    const spec = await readOpenApi(config)
    report.runtime.openApiChecked = true

    const missingTables = REQUIRED_TABLES.filter(({ table }) => !hasTable(spec, table)).map(({ table }) => table)
    if (missingTables.length) {
      addFinding(report, 'OpenAPI Schema', 'CRITICAL', 'Required Agency tables are not exposed through PostgREST.', missingTables.join(', '))
    } else {
      addFinding(report, 'OpenAPI Schema', 'PASS', 'Required Agency tables are exposed through PostgREST.')
    }

    const missingRpcs = REQUIRED_RPCS.filter((rpc) => !hasRpc(spec, rpc))
    if (missingRpcs.length) {
      addFinding(report, 'OpenAPI Schema', 'CRITICAL', 'Required Agency RPCs are not exposed through PostgREST.', missingRpcs.join(', '))
    } else {
      addFinding(report, 'OpenAPI Schema', 'PASS', 'Required Agency RPCs are exposed through PostgREST.')
    }
  } catch (error) {
    addFinding(report, 'OpenAPI Schema', 'BLOCKED', 'Could not read staging OpenAPI schema.', error?.message || String(error))
  }
}

async function signInActor(report, config, label, email, password) {
  const client = createSupabaseClient(config.supabaseUrl, config.anonKey)
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    addFinding(report, label, 'BLOCKED', 'Could not sign in runtime probe user.', error.message)
    return null
  }
  if (!data?.session?.access_token) {
    addFinding(report, label, 'BLOCKED', 'Runtime probe user sign-in returned no session.')
    return null
  }
  addFinding(report, label, 'PASS', 'Runtime probe user signed in successfully.')
  return client
}

async function runMemberContextProbe(report, client) {
  const { data, error } = await client.from('organisation_users').select('*').limit(5)
  if (error) {
    addFinding(report, 'Authenticated RLS', 'BLOCKED', 'Authenticated user cannot read organisation membership context.', error.message)
    return
  }

  const count = Array.isArray(data) ? data.length : 0
  if (count === 0) {
    addFinding(report, 'Authenticated RLS', 'BLOCKED', 'Authenticated user has no visible organisation membership rows.')
    return
  }

  addFinding(report, 'Authenticated RLS', 'PASS', 'Authenticated user can read organisation membership context.', `${count} visible row(s).`)
}

async function runAuthenticatedTableProbes(report, client, sampleLimit) {
  for (const { table, select } of REQUIRED_TABLES) {
    const { data, error } = await client.from(table).select(select).limit(sampleLimit)
    if (error) {
      report.runtime.authenticatedReadProbes.push({ table, status: 'blocked', rowsVisible: 0, error: error.message })
      addFinding(report, 'Authenticated RLS', 'BLOCKED', `Authenticated user read probe failed for ${table}.`, error.message)
      continue
    }

    const rowsVisible = Array.isArray(data) ? data.length : 0
    report.runtime.authenticatedReadProbes.push({ table, status: 'pass', rowsVisible })
    addFinding(report, 'Authenticated RLS', 'PASS', `Authenticated user can query ${table}.`, `${rowsVisible} row(s) visible with limit ${sampleLimit}.`)
  }
}

async function runExternalIsolationProbes(report, client, sampleLimit) {
  const isolationTables = REQUIRED_TABLES.map(({ table }) => table)

  for (const table of isolationTables) {
    const { data, error } = await client.from(table).select('*').limit(sampleLimit)
    if (error) {
      report.runtime.externalIsolationProbes.push({ table, status: 'pass_denied_by_database', rowsVisible: 0 })
      addFinding(report, 'External Isolation', 'PASS', `Unrelated user is denied from ${table}.`, error.message)
      continue
    }

    const rowsVisible = Array.isArray(data) ? data.length : 0
    report.runtime.externalIsolationProbes.push({ table, status: rowsVisible > 0 ? 'critical_rows_visible' : 'pass_no_rows', rowsVisible })
    if (rowsVisible > 0) {
      addFinding(report, 'External Isolation', 'CRITICAL', `Unrelated user can see ${table}.`, `${rowsVisible} row(s) visible with limit ${sampleLimit}.`)
    } else {
      addFinding(report, 'External Isolation', 'PASS', `Unrelated user sees no rows in ${table}.`)
    }
  }
}

async function runRuntimeReadiness(options = parseArgs(process.argv.slice(2))) {
  const report = createReport(options)
  const env = loadEnv()
  const { config, missing } = requireConfig(env, report)

  if (options.skipNetwork) {
    addFinding(report, 'Network', 'BLOCKED', 'Network probes skipped by --skip-network.')
    return finalizeReport(report)
  }

  if (missing.length || !config.projectRef || config.projectRef !== STAGING_PROJECT_REF) {
    return finalizeReport(report)
  }

  await runOpenApiProbe(report, config)

  const actorClient = await signInActor(report, config, 'Authenticated RLS', config.actorEmail, config.actorPassword)
  if (actorClient) {
    await runMemberContextProbe(report, actorClient)
    await runAuthenticatedTableProbes(report, actorClient, options.sampleLimit)
  }

  if (config.externalEmail && config.externalPassword) {
    const externalClient = await signInActor(report, config, 'External Isolation', config.externalEmail, config.externalPassword)
    if (externalClient) {
      await runExternalIsolationProbes(report, externalClient, options.sampleLimit)
    }
  }

  return finalizeReport(report)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2))
  const report = await runRuntimeReadiness(options)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  if (report.summary.criticalCount > 0 || (options.failOnBlocked && report.summary.blockedCount > 0)) {
    process.exitCode = 1
  }
}

export { runRuntimeReadiness }
