#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'

const prerequisiteSteps = [
  {
    key: 'buyer_phase1_live_staging_transaction_contract',
    label: 'Buyer Phase 1 live staging transaction harness',
    script: 'verify:buyer-side-phase1-live-staging-transaction',
    coverage: 'Phase 1 fixture, local diagnostic, transaction spine, onboarding, document request, and registration-readiness contracts remain green locally.',
  },
]

const personaMatrix = [
  {
    key: 'buyer',
    label: 'Buyer',
    emailKey: 'BUYER_SIDE_STAGING_BUYER_EMAIL',
    passwordKey: 'BUYER_SIDE_STAGING_BUYER_PASSWORD',
    expectations: {
      buyer_lead: false,
      offer: false,
      transaction: false,
      transaction_participants: false,
      transaction_role_players: false,
      document_request: false,
      documents: false,
      workflow_events: false,
      transaction_events: false,
      transaction_comments: false,
    },
  },
  {
    key: 'assigned_agent',
    label: 'Assigned agent',
    emailKey: 'BUYER_SIDE_STAGING_AGENT_EMAIL',
    passwordKey: 'BUYER_SIDE_STAGING_AGENT_PASSWORD',
    expectations: {
      buyer_lead: true,
      offer: true,
      transaction: true,
      transaction_participants: true,
      transaction_role_players: true,
      document_request: true,
      documents: true,
      workflow_events: true,
      transaction_events: true,
      transaction_comments: true,
    },
  },
  {
    key: 'branch_manager',
    label: 'Branch manager',
    emailKey: 'BUYER_SIDE_STAGING_BRANCH_MANAGER_EMAIL',
    passwordKey: 'BUYER_SIDE_STAGING_BRANCH_MANAGER_PASSWORD',
    expectations: {
      buyer_lead: true,
      offer: true,
      transaction: true,
      transaction_participants: true,
      transaction_role_players: true,
      document_request: true,
      documents: true,
      workflow_events: true,
      transaction_events: true,
      transaction_comments: true,
    },
  },
  {
    key: 'attorney',
    label: 'Transfer attorney',
    emailKey: 'BUYER_SIDE_STAGING_ATTORNEY_EMAIL',
    passwordKey: 'BUYER_SIDE_STAGING_ATTORNEY_PASSWORD',
    expectations: {
      buyer_lead: false,
      offer: false,
      transaction: true,
      transaction_participants: true,
      transaction_role_players: true,
      document_request: true,
      documents: true,
      workflow_events: true,
      transaction_events: true,
      transaction_comments: true,
    },
  },
  {
    key: 'bond',
    label: 'Bond user',
    emailKey: 'BUYER_SIDE_STAGING_BOND_EMAIL',
    passwordKey: 'BUYER_SIDE_STAGING_BOND_PASSWORD',
    expectations: {
      buyer_lead: false,
      offer: false,
      transaction: true,
      transaction_participants: true,
      transaction_role_players: true,
      document_request: true,
      documents: true,
      workflow_events: true,
      transaction_events: true,
      transaction_comments: true,
    },
  },
  {
    key: 'unrelated',
    label: 'Unrelated user',
    emailKey: 'BUYER_SIDE_STAGING_UNRELATED_EMAIL',
    passwordKey: 'BUYER_SIDE_STAGING_UNRELATED_PASSWORD',
    expectations: {
      buyer_lead: false,
      offer: false,
      transaction: false,
      transaction_participants: false,
      transaction_role_players: false,
      document_request: false,
      documents: false,
      workflow_events: false,
      transaction_events: false,
      transaction_comments: false,
    },
  },
]

const liveProbeSurfaces = [
  {
    key: 'buyer_lead',
    label: 'Buyer lead',
    table: 'leads',
    field: 'lead_id',
    idConfigKey: 'buyerLeadId',
    select: 'lead_id',
    requiredForAllowed: true,
  },
  {
    key: 'offer',
    label: 'Accepted offer',
    table: 'offers',
    field: 'id',
    idConfigKey: 'offerId',
    select: 'id',
    requiredForAllowed: true,
  },
  {
    key: 'transaction',
    label: 'Transaction',
    table: 'transactions',
    field: 'id',
    idConfigKey: 'transactionId',
    select: 'id',
    requiredForAllowed: true,
  },
  {
    key: 'transaction_participants',
    label: 'Transaction participants',
    table: 'transaction_participants',
    field: 'transaction_id',
    idConfigKey: 'transactionId',
    select: 'id',
    requiredForAllowed: false,
  },
  {
    key: 'transaction_role_players',
    label: 'Transaction roleplayers',
    table: 'transaction_role_players',
    field: 'transaction_id',
    idConfigKey: 'transactionId',
    select: 'id',
    requiredForAllowed: false,
  },
  {
    key: 'document_request',
    label: 'Buyer document request',
    table: 'document_requests',
    field: 'id',
    idConfigKey: 'documentRequestId',
    select: 'id',
    requiredForAllowed: true,
  },
  {
    key: 'documents',
    label: 'Transaction documents',
    table: 'documents',
    field: 'transaction_id',
    idConfigKey: 'transactionId',
    select: 'id',
    requiredForAllowed: false,
  },
  {
    key: 'workflow_events',
    label: 'Transaction workflow events',
    table: 'transaction_workflow_events',
    field: 'transaction_id',
    idConfigKey: 'transactionId',
    select: 'id',
    requiredForAllowed: false,
  },
  {
    key: 'transaction_events',
    label: 'Transaction events',
    table: 'transaction_events',
    field: 'transaction_id',
    idConfigKey: 'transactionId',
    select: 'id',
    requiredForAllowed: false,
  },
  {
    key: 'transaction_comments',
    label: 'Transaction comments',
    table: 'transaction_comments',
    field: 'transaction_id',
    idConfigKey: 'transactionId',
    select: 'id',
    requiredForAllowed: false,
    missingOk: true,
  },
]

const staticChecks = [
  {
    key: 'phase2_audit_doc',
    label: 'Buyer Phase 2 audit doc defines the RLS persona matrix and live probe surfaces.',
    file: 'docs/audits/buyer-side-launch-hardening-phase2.md',
    patterns: [
      /# Buyer-Side Launch Hardening Phase 2/,
      /## Goal/,
      /## Commands/,
      /## Persona Access Matrix/,
      /## Live Probe Surfaces/,
      /## Static Policy Contracts/,
      /## Acceptance/,
      /## Current Result/,
      /Decision: PHASE 2 HARNESS IMPLEMENTED; LIVE RLS EVIDENCE REQUIRED/,
    ],
  },
  {
    key: 'package_script',
    label: 'Package exposes the buyer Phase 2 RLS access probe command.',
    file: 'package.json',
    patterns: [
      /"verify:buyer-side-phase2-rls-access":\s*"node scripts\/buyer-side-phase2-rls-access-probes\.mjs"/,
      /"verify:buyer-side-phase1-live-staging-transaction":\s*"node scripts\/buyer-side-phase1-live-staging-transaction-gate\.mjs"/,
    ],
  },
  {
    key: 'phase0_index_updated',
    label: 'Buyer Phase 0 scope lock lists the Phase 2 RLS access command.',
    file: 'docs/audits/buyer-side-launch-hardening-phase0.md',
    patterns: [
      /Phase 2 \| RLS and cross-workspace access probes/,
      /npm run verify:buyer-side-phase2-rls-access/,
      /node scripts\/buyer-side-phase2-rls-access-probes\.mjs --live --confirm-staging --require-live/,
    ],
  },
  {
    key: 'phase8_index_updated',
    label: 'Phase 8 launch readiness links Buyer Phase 2 and its live RLS command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Buyer-side launch hardening Phase 2 RLS access probes: `docs\/audits\/buyer-side-launch-hardening-phase2\.md`/,
      /npm run verify:buyer-side-phase2-rls-access/,
      /node scripts\/buyer-side-phase2-rls-access-probes\.mjs --live --confirm-staging --require-live/,
    ],
  },
  {
    key: 'phase1_persona_handoff',
    label: 'Phase 1 explicitly hands authenticated persona credentials to Phase 2.',
    file: 'docs/audits/buyer-side-launch-hardening-phase1.md',
    patterns: [
      /persona credentials from Phase 0 are reported in Phase 1/,
      /hard requirements for the authenticated RLS matrix in Phase 2/,
    ],
  },
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
    key: 'buyer_lead_rls_hardened',
    label: 'Buyer lead access is gated by org admin, assigned user/agent, assigned email, and support scopes.',
    file: '../supabase/migrations/202606090010_created_by_access_remediation.sql',
    patterns: [
      /create policy leads_support_role_select on public\.leads/,
      /public\.bridge_is_org_admin\(organisation_id\)/,
      /assigned_user_id = auth\.uid\(\)/,
      /assigned_agent_id = auth\.uid\(\)/,
      /lower\(coalesce\(assigned_agent_email, ''\)\) = lower\(coalesce\(auth\.jwt\(\) ->> 'email', ''\)\)/,
      /public\.bridge_support_can_access_record\(/,
    ],
  },
  {
    key: 'offer_member_rls_policies',
    label: 'Offer rows are member-scoped for authenticated users.',
    file: '../supabase/migrations/202605210002_buyer_lifecycle_phase1.sql',
    patterns: [
      /alter table if exists public\.offers enable row level security/,
      /create policy offers_org_members_select[\s\S]*bridge_is_active_member\(organisation_id\)/,
      /create policy offers_org_members_insert[\s\S]*bridge_is_active_member\(organisation_id\)/,
      /create policy offers_org_members_update[\s\S]*bridge_is_active_member\(organisation_id\)/,
    ],
  },
  {
    key: 'offer_public_token_policies',
    label: 'Public offer tokens are status and expiry constrained.',
    file: '../supabase/migrations/202605220005_offer_workflow_phase1_state_model.sql',
    patterns: [
      /create policy offers_public_token_select[\s\S]*offer_token is not null[\s\S]*expiry_date is null or expiry_date >= current_date/,
      /create policy offers_public_token_update[\s\S]*offer_token is not null[\s\S]*with check/,
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
      /transaction_participants_select_transaction_spine_scope[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
      /transaction_role_players_select_transaction_spine_scope[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
      /transaction_events_select_transaction_spine_scope[\s\S]*bridge_can_access_transaction_spine\(transaction_id\)/,
    ],
  },
  {
    key: 'buyer_documents_inherit_spine',
    label: 'Buyer document requests and documents inherit transaction-spine RLS.',
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
  {
    key: 'transaction_comments_broad_grants_removed',
    label: 'Transaction comments are included in broad demo-grant cleanup and live matrix probes.',
    file: '../supabase/migrations/202607070001_drop_demo_all_rls_grants.sql',
    patterns: [
      /\('transaction_comments'\)/,
      /execute format\(\s*'drop policy if exists %I on %I\.%I'/,
      /execute format\('revoke all privileges on table public\.%I from anon'/,
      /execute format\(\s*'revoke insert, update, delete, truncate on table public\.%I from authenticated'/,
    ],
  },
  {
    key: 'script_live_matrix_locked',
    label: 'Phase 2 script includes every required persona and probe surface.',
    file: 'scripts/buyer-side-phase2-rls-access-probes.mjs',
    patterns: [
      /key: 'buyer'/,
      /key: 'assigned_agent'/,
      /key: 'branch_manager'/,
      /key: 'attorney'/,
      /key: 'bond'/,
      /key: 'unrelated'/,
      /key: 'buyer_lead'/,
      /key: 'offer'/,
      /key: 'transaction'/,
      /key: 'document_request'/,
      /key: 'workflow_events'/,
      /key: 'transaction_comments'/,
    ],
  },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function cleanEnvValue(value = '') {
  return normalizeText(value).replace(/^["']|["']$/g, '').replace(/\\n$/g, '')
}

function parseArgs(argv) {
  const options = {
    staticOnly: false,
    skipPrerequisites: false,
    live: false,
    confirmStaging: false,
    requireLive: false,
    sampleLimit: 5,
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-prerequisites') options.skipPrerequisites = true
    else if (arg === '--live') options.live = true
    else if (arg === '--confirm-staging') options.confirmStaging = true
    else if (arg === '--require-live') {
      options.live = true
      options.requireLive = true
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

function parseEnvFile(fileName) {
  const filePath = new URL(fileName, PROJECT_ROOT)
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
        return [line.slice(0, separator), cleanEnvValue(line.slice(separator + 1))]
      }),
  )
}

function loadEnv() {
  const files = {
    base: parseEnvFile('.env'),
    staging: parseEnvFile('.env.staging.local'),
  }
  const processOverrides = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => normalizeText(value)),
  )
  const merged = { ...files.base, ...files.staging, ...processOverrides }
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_URL && merged.SUPABASE_URL) merged.VITE_SUPABASE_URL = merged.SUPABASE_URL
  if (!merged.SUPABASE_ANON_KEY && merged.VITE_SUPABASE_ANON_KEY) merged.SUPABASE_ANON_KEY = merged.VITE_SUPABASE_ANON_KEY
  if (!merged.SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY
  return merged
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function buildConfig(env) {
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  return {
    supabaseUrl,
    anonKey: normalizeText(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY),
    projectRef: normalizeText(env.BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF) || projectRefFromUrl(supabaseUrl),
    buyerLeadId: normalizeText(env.BUYER_SIDE_STAGING_BUYER_LEAD_ID),
    offerId: normalizeText(env.BUYER_SIDE_STAGING_OFFER_ID),
    transactionId: normalizeText(env.BUYER_SIDE_STAGING_TRANSACTION_ID),
    documentRequestId: normalizeText(env.BUYER_SIDE_STAGING_DOCUMENT_REQUEST_ID),
    personas: personaMatrix.map((persona) => ({
      ...persona,
      email: normalizeText(env[persona.emailKey]),
      password: normalizeText(env[persona.passwordKey]),
    })),
  }
}

function createReport(options) {
  return {
    phase: '2',
    scope: 'buyer-side-launch-hardening',
    gate: 'rls-cross-workspace-access-probes',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Buyer Phase 2 RLS blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      commandSkippedCount: 0,
      livePassCount: 0,
      liveWarningCount: 0,
      liveBlockedCount: 0,
      liveCriticalCount: 0,
    },
    staticChecks: [],
    commands: [],
    live: {
      mode: options.live ? 'staging-read-only' : 'skipped',
      projectRef: null,
      transactionId: null,
      buyerLeadId: null,
      offerId: null,
      documentRequestId: null,
      personasConfigured: {},
      matrix: [],
      checks: [],
      warnings: [],
    },
    liveCommand: 'node scripts/buyer-side-phase2-rls-access-probes.mjs --live --confirm-staging --require-live',
    acceptance: [
      'Static RLS policy contracts cover buyer lead, offer, transaction, document, workflow, activity, and comments surfaces.',
      'Live mode signs in as buyer, assigned agent, branch manager, attorney, bond user, and unrelated user.',
      'Live mode proves allowed personas can read the buyer transaction surfaces they own.',
      'Live mode proves buyer and unrelated users cannot read internal raw tables outside token-scoped flows.',
      'Live mode is read-only and requires explicit --live --confirm-staging flags.',
    ],
  }
}

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

function runStaticChecks(report) {
  for (const check of staticChecks) {
    const result = {
      key: check.key,
      label: check.label,
      file: check.file,
      status: 'PASS',
      missingPatterns: [],
    }

    try {
      const source = readProjectFile(check.file)
      for (const pattern of check.patterns) {
        if (!pattern.test(source)) {
          result.status = 'BLOCKED'
          result.missingPatterns.push(String(pattern))
        }
      }
    } catch (error) {
      result.status = 'BLOCKED'
      result.error = error?.message || String(error)
    }

    report.staticChecks.push(result)
    if (result.status === 'PASS') report.summary.staticPassCount += 1
    else report.summary.staticBlockedCount += 1
  }
}

function tailLines(value, count = 10) {
  return String(value || '').trim().split('\n').filter(Boolean).slice(-count).join('\n')
}

function runNpmScript(step) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn(NPM_BIN, ['run', step.script], {
      cwd: PROJECT_ROOT_PATH,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => {
      resolve({
        key: step.key,
        label: step.label,
        script: step.script,
        command: `npm run ${step.script}`,
        coverage: step.coverage,
        status: code === 0 ? 'PASS' : 'BLOCKED',
        exitCode: code,
        durationMs: Date.now() - startedAt,
        stdout: tailLines(stdout),
        stderr: tailLines(stderr),
      })
    })
    child.on('error', (error) => {
      resolve({
        key: step.key,
        label: step.label,
        script: step.script,
        command: `npm run ${step.script}`,
        coverage: step.coverage,
        status: 'BLOCKED',
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      })
    })
  })
}

async function runPrerequisites(report, options) {
  if (options.staticOnly || options.skipPrerequisites) {
    for (const step of prerequisiteSteps) {
      report.commands.push({
        key: step.key,
        label: step.label,
        script: step.script,
        command: `npm run ${step.script}`,
        coverage: step.coverage,
        status: 'SKIPPED',
      })
      report.summary.commandSkippedCount += 1
    }
    return
  }

  for (const step of prerequisiteSteps) {
    const result = await runNpmScript(step)
    report.commands.push(result)
    if (result.status === 'PASS') report.summary.commandPassCount += 1
    else report.summary.commandBlockedCount += 1
  }
}

function addLiveCheck(report, key, status, label, detail = '') {
  const check = { key, status, label, detail }
  report.live.checks.push(check)
  if (status === 'PASS') report.summary.livePassCount += 1
  if (status === 'WARN') {
    report.summary.liveWarningCount += 1
    report.live.warnings.push(check)
  }
  if (status === 'BLOCKED') report.summary.liveBlockedCount += 1
  if (status === 'CRITICAL') report.summary.liveCriticalCount += 1
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

async function signIn(config, persona) {
  const client = createSupabaseClient(config.supabaseUrl, config.anonKey)
  const { data, error } = await client.auth.signInWithPassword({
    email: persona.email,
    password: persona.password,
  })
  if (error) throw error
  return { client, userId: data?.user?.id || null }
}

function isMissingTableError(error = {}) {
  const code = normalizeText(error.code)
  const message = normalizeText(error.message || error.details || error.hint).toLowerCase()
  return code === '42P01' || message.includes('does not exist') || message.includes('could not find the table')
}

async function runSurfaceProbe(client, surface, config, sampleLimit) {
  const idValue = normalizeText(config[surface.idConfigKey])
  const query = client
    .from(surface.table)
    .select(surface.select)
    .eq(surface.field, idValue)
    .limit(sampleLimit)

  const { data, error } = await query
  if (error) return { rowsVisible: 0, error }
  return { rowsVisible: Array.isArray(data) ? data.length : 0, error: null }
}

function validateLiveConfig(report, config, options) {
  report.live.projectRef = config.projectRef || null
  report.live.transactionId = config.transactionId || null
  report.live.buyerLeadId = config.buyerLeadId || null
  report.live.offerId = config.offerId || null
  report.live.documentRequestId = config.documentRequestId || null
  report.live.personasConfigured = Object.fromEntries(
    config.personas.map((persona) => [persona.key, Boolean(persona.email && persona.password)]),
  )

  const missing = new Set()
  if (!config.supabaseUrl) missing.add('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!config.anonKey) missing.add('SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY')
  if (!config.projectRef) missing.add('BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF or Supabase URL project ref')
  if (!config.buyerLeadId) missing.add('BUYER_SIDE_STAGING_BUYER_LEAD_ID')
  if (!config.offerId) missing.add('BUYER_SIDE_STAGING_OFFER_ID')
  if (!config.transactionId) missing.add('BUYER_SIDE_STAGING_TRANSACTION_ID')
  if (!config.documentRequestId) missing.add('BUYER_SIDE_STAGING_DOCUMENT_REQUEST_ID')
  for (const persona of config.personas) {
    if (!persona.email) missing.add(persona.emailKey)
    if (!persona.password) missing.add(persona.passwordKey)
  }

  if (missing.size) {
    addLiveCheck(
      report,
      'phase2_live_configuration',
      options.live ? 'BLOCKED' : 'WARN',
      'Phase 2 live RLS configuration is incomplete.',
      [...missing].join(', '),
    )
  } else {
    addLiveCheck(report, 'phase2_live_configuration', 'PASS', 'Phase 2 live RLS configuration is complete.')
  }

  if (!config.projectRef) {
    addLiveCheck(report, 'phase2_staging_ref', options.live ? 'BLOCKED' : 'WARN', 'Could not resolve staging project ref.')
  } else if (config.projectRef !== STAGING_PROJECT_REF) {
    addLiveCheck(
      report,
      'phase2_staging_ref',
      'CRITICAL',
      'Refusing to run Buyer Phase 2 against a non-approved Supabase project.',
      `Expected ${STAGING_PROJECT_REF}; resolved ${config.projectRef}.`,
    )
  } else {
    addLiveCheck(report, 'phase2_staging_ref', 'PASS', 'Supabase project ref matches approved staging.')
  }

  if (options.live && !options.confirmStaging) {
    addLiveCheck(report, 'phase2_confirm_staging', 'CRITICAL', 'Live Buyer Phase 2 requires --confirm-staging.')
  } else if (options.live) {
    addLiveCheck(report, 'phase2_confirm_staging', 'PASS', 'Live staging RLS run was explicitly confirmed.')
  }
}

function classifyProbe({ persona, surface, result }) {
  const expectedAllowed = Boolean(persona.expectations[surface.key])
  const rowsVisible = result.rowsVisible || 0
  const deniedByDatabase = Boolean(result.error)
  const missingOptional = result.error && surface.missingOk && isMissingTableError(result.error)

  if (expectedAllowed) {
    if (missingOptional) {
      return {
        status: 'WARN',
        outcome: 'optional_surface_missing',
        detail: `${surface.table} is not available in this staging schema.`,
      }
    }
    if (deniedByDatabase) {
      return {
        status: 'BLOCKED',
        outcome: 'unexpected_database_denial',
        detail: result.error.message,
      }
    }
    if (rowsVisible > 0) {
      return {
        status: 'PASS',
        outcome: 'expected_rows_visible',
        detail: `${rowsVisible} row(s) visible.`,
      }
    }
    return {
      status: surface.requiredForAllowed ? 'BLOCKED' : 'WARN',
      outcome: surface.requiredForAllowed ? 'expected_rows_missing' : 'optional_rows_missing',
      detail: surface.requiredForAllowed
        ? 'Expected at least one visible row for this required surface.'
        : 'No rows visible; this may be valid if the staging fixture has no rows on this optional surface.',
    }
  }

  if (deniedByDatabase || rowsVisible === 0) {
    return {
      status: 'PASS',
      outcome: deniedByDatabase ? 'denied_by_database' : 'no_rows_visible',
      detail: deniedByDatabase ? result.error.message : 'No rows visible.',
    }
  }

  return {
    status: 'CRITICAL',
    outcome: 'unexpected_rows_visible',
    detail: `${rowsVisible} row(s) visible to a denied persona.`,
  }
}

async function runLiveMatrix(report, options, config) {
  validateLiveConfig(report, config, options)

  if (!options.live) {
    report.live.mode = 'skipped'
    return
  }

  if (report.summary.liveBlockedCount > 0 || report.summary.liveCriticalCount > 0) return

  for (const persona of config.personas) {
    const personaReport = {
      key: persona.key,
      label: persona.label,
      expected: persona.expectations,
      signedIn: false,
      userId: null,
      probes: [],
    }
    report.live.matrix.push(personaReport)

    let session
    try {
      session = await signIn(config, persona)
      personaReport.signedIn = true
      personaReport.userId = session.userId
      addLiveCheck(report, `${persona.key}_signin`, 'PASS', `${persona.label} signed in for RLS probing.`)
    } catch (error) {
      addLiveCheck(report, `${persona.key}_signin`, 'BLOCKED', `${persona.label} sign-in failed.`, error.message)
      continue
    }

    for (const surface of liveProbeSurfaces) {
      const result = await runSurfaceProbe(session.client, surface, config, options.sampleLimit)
      const classified = classifyProbe({ persona, surface, result })
      const probe = {
        surface: surface.key,
        table: surface.table,
        expectedAllowed: Boolean(persona.expectations[surface.key]),
        rowsVisible: result.rowsVisible || 0,
        status: classified.status,
        outcome: classified.outcome,
        detail: classified.detail,
      }
      if (result.error) {
        probe.error = {
          code: result.error.code || null,
          message: result.error.message || String(result.error),
        }
      }
      personaReport.probes.push(probe)
      addLiveCheck(
        report,
        `${persona.key}_${surface.key}`,
        classified.status,
        `${persona.label}: ${surface.label}`,
        classified.detail,
      )
    }
  }
}

function finalizeReport(report, options) {
  if (
    report.summary.staticBlockedCount > 0 ||
    report.summary.commandBlockedCount > 0 ||
    report.summary.liveBlockedCount > 0 ||
    report.summary.liveCriticalCount > 0
  ) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Buyer Phase 2 RLS blockers are cleared'
    return report
  }

  if (options.live) {
    report.summary.status = report.summary.liveWarningCount > 0 ? 'READY_LIVE_WITH_WARNINGS' : 'READY_LIVE'
    report.summary.recommendation = 'Buyer Phase 2 live RLS access probes passed'
    return report
  }

  if (report.summary.commandSkippedCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Buyer Phase 2 static RLS contracts passed; run without skip flags before local sign-off'
    return report
  }

  report.summary.status = 'READY_LOCAL_CONTRACT'
  report.summary.recommendation = 'Buyer Phase 2 harness is implemented; run live RLS command when persona credentials and staging IDs are available'
  return report
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = createReport(options)
  const config = buildConfig(loadEnv())

  runStaticChecks(report)
  await runPrerequisites(report, options)

  if (options.staticOnly) {
    report.live.mode = 'skipped'
  } else {
    await runLiveMatrix(report, options, config)
  }

  finalizeReport(report, options)
  console.log(JSON.stringify(report, null, 2))

  if (
    !['READY_LOCAL_CONTRACT', 'READY_STATIC_ONLY', 'READY_LIVE', 'READY_LIVE_WITH_WARNINGS'].includes(report.summary.status)
  ) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
