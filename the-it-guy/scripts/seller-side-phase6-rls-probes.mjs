#!/usr/bin/env node
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'

const staticChecks = [
  {
    key: 'transaction_spine_resolver_current_ownership',
    label: 'Transaction spine access is based on current ownership, assignment, participants, roleplayers, and support delegation.',
    file: '../supabase/migrations/202606090010_created_by_access_remediation.sql',
    patterns: [
      /create or replace function public\.bridge_can_access_transaction_spine/,
      /tx\.owner_user_id = auth\.uid\(\)/,
      /tx\.assigned_user_id = auth\.uid\(\)/,
      /tx\.assigned_agent_email/,
      /from public\.transaction_participants tp/,
      /from public\.transaction_role_players trp/,
      /from public\.transaction_bond_applications tba/,
      /bridge_support_can_access_record/,
    ],
    forbiddenInFunction: [
      /tx\.created_by\s*=\s*auth\.uid\(\)/i,
      /created_by\s*=\s*auth\.uid\(\)/i,
    ],
  },
  {
    key: 'transaction_spine_policies_hardened',
    label: 'Transaction select/update policies defer to the transaction spine resolver.',
    file: '../supabase/migrations/202606090010_created_by_access_remediation.sql',
    patterns: [
      /create policy transactions_select_transaction_spine_scope[\s\S]*public\.bridge_can_access_transaction_spine\(id\)/,
      /create policy transactions_update_transaction_spine_scope[\s\S]*public\.bridge_can_access_transaction_spine\(id\)/,
    ],
  },
  {
    key: 'transaction_related_tables_inherit_spine',
    label: 'Transaction participants, roleplayers, events, assignments, and bond applications inherit transaction-spine RLS.',
    file: '../supabase/migrations/202605310005_transaction_spine_policy_reset.sql',
    patterns: [
      /alter table if exists public\.transaction_participants enable row level security/,
      /alter table if exists public\.transaction_role_players enable row level security/,
      /alter table if exists public\.transaction_events enable row level security/,
      /alter table if exists public\.transaction_attorney_assignments enable row level security/,
      /alter table if exists public\.transaction_bond_applications enable row level security/,
      /transaction_bond_applications_insert_scope_hardened[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
      /transaction_bond_applications_update_scope_hardened[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
      /transaction_participants_select_transaction_spine_scope[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
      /transaction_role_players_select_transaction_spine_scope[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
      /transaction_events_select_transaction_spine_scope[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
      /transaction_attorney_assignments_select_transaction_spine_scope[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
    ],
  },
  {
    key: 'seller_transaction_documents_inherit_spine',
    label: 'Seller-side transaction documents and document requests inherit transaction-spine RLS.',
    file: '../supabase/migrations/202606090009_support_role_asset_rls.sql',
    patterns: [
      /create policy document_requests_support_role_select[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
      /create policy documents_support_role_select[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
    ],
  },
  {
    key: 'workflow_events_inherit_spine',
    label: 'Workflow events inherit transaction-spine RLS for audit visibility.',
    file: '../supabase/migrations/202606020020_transaction_workflow_events_phase5.sql',
    patterns: [
      /alter table if exists public\.transaction_workflow_events enable row level security/,
      /transaction_workflow_events_select_transaction_scope[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
      /transaction_workflow_events_insert_transaction_scope[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
    ],
  },
]

const liveProbeTables = [
  { key: 'transaction', table: 'transactions', field: 'id', select: 'id, organisation_id, assigned_branch_id, owner_user_id, assigned_user_id, assigned_agent_email' },
  { key: 'participants', table: 'transaction_participants', field: 'transaction_id', select: 'id, transaction_id, role_type, participant_email' },
  { key: 'roleplayers', table: 'transaction_role_players', field: 'transaction_id', select: 'id, transaction_id, role_type, email_address' },
  { key: 'events', table: 'transaction_events', field: 'transaction_id', select: 'id, transaction_id, event_type' },
  { key: 'workflow_events', table: 'transaction_workflow_events', field: 'transaction_id', select: 'id, transaction_id, event_type' },
  { key: 'bond_applications', table: 'transaction_bond_applications', field: 'transaction_id', select: 'id, transaction_id, status' },
  { key: 'documents', table: 'documents', field: 'transaction_id', select: 'id, transaction_id, document_type' },
  { key: 'document_requests', table: 'document_requests', field: 'transaction_id', select: 'id, transaction_id, document_type' },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function parseArgs(argv) {
  const options = {
    live: false,
    confirmStaging: false,
    requireLive: false,
    transactionId: '',
    sampleLimit: 5,
  }

  for (const arg of argv) {
    if (arg === '--live') options.live = true
    else if (arg === '--confirm-staging') options.confirmStaging = true
    else if (arg === '--require-live') {
      options.live = true
      options.requireLive = true
    } else if (arg.startsWith('--transaction-id=')) {
      options.transactionId = normalizeText(arg.slice('--transaction-id='.length))
    } else if (arg.startsWith('--sample-limit=')) {
      const sampleLimit = Number.parseInt(arg.slice('--sample-limit='.length), 10)
      if (!Number.isInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > 25) {
        throw new Error('--sample-limit must be an integer from 1 to 25')
      }
      options.sampleLimit = sampleLimit
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
  const localEnv = parseEnvFile(`${PROJECT_ROOT_PATH}/.env`)
  const stagingEnv = parseEnvFile(`${PROJECT_ROOT_PATH}/.env.staging.local`)
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeText(value)))
  const merged = { ...localEnv, ...stagingEnv, ...processOverrides }
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_URL && merged.SUPABASE_URL) merged.VITE_SUPABASE_URL = merged.SUPABASE_URL
  if (!merged.SUPABASE_ANON_KEY && merged.VITE_SUPABASE_ANON_KEY) merged.SUPABASE_ANON_KEY = merged.VITE_SUPABASE_ANON_KEY
  if (!merged.SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY
  return merged
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function createReport(options) {
  return {
    phase: '6',
    scope: 'seller-side-transaction-launch',
    gate: 'rls-cross-workspace-probes',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Phase 6 RLS blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      livePassCount: 0,
      liveBlockedCount: 0,
      liveCriticalCount: 0,
      liveWarningCount: 0,
    },
    staticChecks: [],
    live: {
      mode: options.live ? 'staging-read-only' : 'skipped',
      projectRef: null,
      transactionId: null,
      actorConfigured: false,
      unrelatedConfigured: false,
      actorProbes: [],
      unrelatedProbes: [],
      warnings: [],
    },
  }
}

function addLiveFinding(report, status, message) {
  if (status === 'PASS') report.summary.livePassCount += 1
  if (status === 'WARN') report.summary.liveWarningCount += 1
  if (status === 'BLOCKED') report.summary.liveBlockedCount += 1
  if (status === 'CRITICAL') report.summary.liveCriticalCount += 1
  if (status === 'WARN') report.live.warnings.push(message)
}

function readFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

function extractTransactionSpineFunction(source = '') {
  const match = source.match(/create or replace function public\.bridge_can_access_transaction_spine[\s\S]*?grant execute on function public\.bridge_can_access_transaction_spine\(uuid\) to authenticated;/i)
  return match?.[0] || ''
}

function runStaticChecks(report) {
  for (const check of staticChecks) {
    const result = {
      key: check.key,
      label: check.label,
      file: check.file,
      status: 'PASS',
      missingPatterns: [],
      forbiddenPatterns: [],
    }

    try {
      const source = readFile(check.file)
      for (const pattern of check.patterns) {
        if (!pattern.test(source)) {
          result.status = 'BLOCKED'
          result.missingPatterns.push(String(pattern))
        }
      }

      if (check.forbiddenInFunction?.length) {
        const functionSource = extractTransactionSpineFunction(source)
        for (const pattern of check.forbiddenInFunction) {
          if (pattern.test(functionSource)) {
            result.status = 'BLOCKED'
            result.forbiddenPatterns.push(String(pattern))
          }
        }
      }
    } catch (error) {
      result.status = 'BLOCKED'
      result.error = error?.message || String(error)
    }

    if (result.status === 'PASS') report.summary.staticPassCount += 1
    else report.summary.staticBlockedCount += 1
    report.staticChecks.push(result)
  }
}

function createSupabaseClient(supabaseUrl, anonKey) {
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

async function signIn(config, email, password) {
  const client = createSupabaseClient(config.supabaseUrl, config.anonKey)
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return { client, userId: data?.user?.id || null, email }
}

function getLiveConfig(env, report, options) {
  const config = {
    supabaseUrl: normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    anonKey: normalizeText(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY),
    actorEmail: normalizeText(env.SELLER_SIDE_RLS_ACTOR_EMAIL || env.STAGING_INTERNAL_EMAIL),
    actorPassword: normalizeText(env.SELLER_SIDE_RLS_ACTOR_PASSWORD || env.STAGING_INTERNAL_PASSWORD),
    unrelatedEmail: normalizeText(env.SELLER_SIDE_RLS_UNRELATED_EMAIL || env.AGENCY_RUNTIME_UNRELATED_EMAIL),
    unrelatedPassword: normalizeText(env.SELLER_SIDE_RLS_UNRELATED_PASSWORD || env.AGENCY_RUNTIME_UNRELATED_PASSWORD),
    transactionId: normalizeText(options.transactionId || env.SELLER_SIDE_RLS_TRANSACTION_ID),
  }
  config.projectRef = projectRefFromUrl(config.supabaseUrl)
  report.live.projectRef = config.projectRef || null
  report.live.actorConfigured = Boolean(config.actorEmail && config.actorPassword)
  report.live.unrelatedConfigured = Boolean(config.unrelatedEmail && config.unrelatedPassword)

  const missing = []
  if (!config.supabaseUrl) missing.push('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!config.anonKey) missing.push('SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY')
  if (!config.actorEmail) missing.push('SELLER_SIDE_RLS_ACTOR_EMAIL/STAGING_INTERNAL_EMAIL')
  if (!config.actorPassword) missing.push('SELLER_SIDE_RLS_ACTOR_PASSWORD/STAGING_INTERNAL_PASSWORD')
  if (!config.unrelatedEmail) missing.push('SELLER_SIDE_RLS_UNRELATED_EMAIL/AGENCY_RUNTIME_UNRELATED_EMAIL')
  if (!config.unrelatedPassword) missing.push('SELLER_SIDE_RLS_UNRELATED_PASSWORD/AGENCY_RUNTIME_UNRELATED_PASSWORD')

  if (missing.length) addLiveFinding(report, 'BLOCKED', `Missing live RLS probe configuration: ${missing.join(', ')}`)
  if (!options.confirmStaging) addLiveFinding(report, 'BLOCKED', 'Live RLS probe requires --confirm-staging.')
  if (config.projectRef && config.projectRef !== STAGING_PROJECT_REF) {
    addLiveFinding(report, 'CRITICAL', `Live RLS probe points at ${config.projectRef}; expected staging ${STAGING_PROJECT_REF}.`)
  }

  return { config, missing }
}

async function resolveTransaction(client, transactionId = '') {
  const select = 'id, organisation_id, assigned_branch_id, owner_user_id, assigned_user_id, assigned_agent_email'
  if (transactionId) {
    const { data, error } = await client.from('transactions').select(select).eq('id', transactionId).maybeSingle()
    if (error) throw error
    return data || null
  }

  const { data, error } = await client.from('transactions').select(select).limit(1)
  if (error) throw error
  return Array.isArray(data) ? data[0] || null : null
}

async function queryProbe(client, probe, transactionId, sampleLimit) {
  const value = probe.field === 'id' ? transactionId : transactionId
  return client.from(probe.table).select(probe.select).eq(probe.field, value).limit(sampleLimit)
}

async function runLiveProbes(report, options) {
  const env = loadEnv()
  const { config, missing } = getLiveConfig(env, report, options)
  if (missing.length || !options.confirmStaging || config.projectRef !== STAGING_PROJECT_REF) return

  let actor
  let unrelated
  try {
    actor = await signIn(config, config.actorEmail, config.actorPassword)
    addLiveFinding(report, 'PASS', 'Actor staging session signed in.')
  } catch (error) {
    addLiveFinding(report, 'BLOCKED', `Actor sign-in failed: ${error.message}`)
    return
  }

  try {
    unrelated = await signIn(config, config.unrelatedEmail, config.unrelatedPassword)
    addLiveFinding(report, 'PASS', 'Unrelated staging session signed in.')
  } catch (error) {
    addLiveFinding(report, 'BLOCKED', `Unrelated sign-in failed: ${error.message}`)
    return
  }

  let transaction = null
  try {
    transaction = await resolveTransaction(actor.client, config.transactionId)
  } catch (error) {
    addLiveFinding(report, 'BLOCKED', `Actor transaction lookup failed: ${error.message}`)
    return
  }

  if (!transaction?.id) {
    addLiveFinding(report, 'BLOCKED', config.transactionId ? `Actor cannot read transaction ${config.transactionId}.` : 'Actor has no visible transaction to probe.')
    return
  }

  report.live.transactionId = transaction.id
  addLiveFinding(report, 'PASS', `Actor transaction target resolved: ${transaction.id}`)

  for (const probe of liveProbeTables) {
    const actorResult = await queryProbe(actor.client, probe, transaction.id, options.sampleLimit)
    if (actorResult.error) {
      report.live.actorProbes.push({ key: probe.key, table: probe.table, status: 'blocked', rowsVisible: 0, error: actorResult.error.message })
      addLiveFinding(report, 'BLOCKED', `Actor read failed for ${probe.table}: ${actorResult.error.message}`)
    } else {
      const rowsVisible = Array.isArray(actorResult.data) ? actorResult.data.length : 0
      report.live.actorProbes.push({ key: probe.key, table: probe.table, status: 'pass', rowsVisible })
      addLiveFinding(report, 'PASS', `Actor can query ${probe.table} for the target transaction (${rowsVisible} row(s)).`)
    }

    const unrelatedResult = await queryProbe(unrelated.client, probe, transaction.id, options.sampleLimit)
    if (unrelatedResult.error) {
      report.live.unrelatedProbes.push({ key: probe.key, table: probe.table, status: 'pass_denied_by_database', rowsVisible: 0, error: unrelatedResult.error.message })
      addLiveFinding(report, 'PASS', `Unrelated user is denied from ${probe.table}.`)
      continue
    }

    const rowsVisible = Array.isArray(unrelatedResult.data) ? unrelatedResult.data.length : 0
    const status = rowsVisible > 0 ? 'critical_rows_visible' : 'pass_no_rows'
    report.live.unrelatedProbes.push({ key: probe.key, table: probe.table, status, rowsVisible })
    if (rowsVisible > 0) {
      addLiveFinding(report, 'CRITICAL', `Unrelated user can see ${probe.table} for transaction ${transaction.id}: ${rowsVisible} row(s).`)
    } else {
      addLiveFinding(report, 'PASS', `Unrelated user sees no rows in ${probe.table} for the target transaction.`)
    }
  }
}

function finalizeReport(report, options) {
  if (report.summary.staticBlockedCount > 0 || report.summary.liveCriticalCount > 0 || report.summary.liveBlockedCount > 0) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Phase 6 RLS blockers are cleared'
    return report
  }

  if (!options.live) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Static RLS contracts passed; run with --live --confirm-staging for staging sign-off'
    return report
  }

  if (report.summary.liveWarningCount > 0) {
    report.summary.status = 'READY_WITH_WARNINGS'
    report.summary.recommendation = 'Review warnings before production cutover'
    return report
  }

  report.summary.status = 'READY'
  report.summary.recommendation = 'Seller-side transaction RLS static and live probes passed'
  return report
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = createReport(options)
  runStaticChecks(report)
  if (options.live) await runLiveProbes(report, options)
  finalizeReport(report, options)
  console.log(JSON.stringify(report, null, 2))

  if (
    report.summary.staticBlockedCount > 0 ||
    report.summary.liveCriticalCount > 0 ||
    (options.live && report.summary.liveBlockedCount > 0)
  ) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    stack: error.stack,
  }, null, 2))
  process.exitCode = 1
})
