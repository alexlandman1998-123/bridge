#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'

const localCommandSteps = [
  {
    key: 'buyer_phase0_scope_fixtures',
    label: 'Buyer Phase 0 scope and fixture contract',
    script: 'verify:buyer-side-phase0-scope-fixtures',
    coverage: 'Buyer launch journey, route surface, staging personas, staging record IDs, env placeholders, owners, and blockers are locked.',
  },
  {
    key: 'buyer_local_lead_registration_diagnostic',
    label: 'Buyer local lead-to-registration diagnostic',
    script: 'verify:buyer-side-lead-registration-diagnostic',
    coverage: 'Local buyer lead, onboarding, offer, transaction, finance, documents, workflow, registration, and browser-entry contracts pass.',
  },
]

const phase1RequiredRecordKeys = [
  'BUYER_SIDE_LAUNCH_BASE_URL',
  'BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF',
  'BUYER_SIDE_STAGING_BUYER_LEAD_ID',
  'BUYER_SIDE_STAGING_LISTING_ID',
  'BUYER_SIDE_STAGING_OFFER_ID',
  'BUYER_SIDE_STAGING_TRANSACTION_ID',
  'BUYER_SIDE_STAGING_ONBOARDING_TOKEN',
  'BUYER_SIDE_STAGING_PORTAL_TOKEN',
  'BUYER_SIDE_STAGING_DOCUMENT_REQUEST_ID',
]

const phase1PersonaKeys = [
  'BUYER_SIDE_STAGING_BUYER_EMAIL',
  'BUYER_SIDE_STAGING_BUYER_PASSWORD',
  'BUYER_SIDE_STAGING_AGENT_EMAIL',
  'BUYER_SIDE_STAGING_AGENT_PASSWORD',
  'BUYER_SIDE_STAGING_BRANCH_MANAGER_EMAIL',
  'BUYER_SIDE_STAGING_BRANCH_MANAGER_PASSWORD',
  'BUYER_SIDE_STAGING_ATTORNEY_EMAIL',
  'BUYER_SIDE_STAGING_ATTORNEY_PASSWORD',
  'BUYER_SIDE_STAGING_BOND_EMAIL',
  'BUYER_SIDE_STAGING_BOND_PASSWORD',
  'BUYER_SIDE_STAGING_UNRELATED_EMAIL',
  'BUYER_SIDE_STAGING_UNRELATED_PASSWORD',
]

const staticChecks = [
  {
    key: 'phase1_audit_doc',
    label: 'Buyer launch Phase 1 audit doc defines live staging transaction evidence.',
    file: 'docs/audits/buyer-side-launch-hardening-phase1.md',
    patterns: [
      /# Buyer-Side Launch Hardening Phase 1/,
      /## Goal/,
      /## Commands/,
      /## Live Staging Evidence Contract/,
      /## Read-Only Live Gate Checks/,
      /## Acceptance/,
      /## Current Result/,
      /Decision: PHASE 1 HARNESS IMPLEMENTED; LIVE STAGING EVIDENCE REQUIRED/,
    ],
  },
  {
    key: 'package_script',
    label: 'Package exposes the buyer Phase 1 verification command.',
    file: 'package.json',
    patterns: [
      /"verify:buyer-side-phase1-live-staging-transaction":\s*"node scripts\/buyer-side-phase1-live-staging-transaction-gate\.mjs"/,
      /"verify:buyer-side-phase0-scope-fixtures":\s*"node scripts\/buyer-side-phase0-scope-fixtures-gate\.mjs"/,
      /"verify:buyer-side-lead-registration-diagnostic":\s*"node scripts\/buyer-side-lead-registration-diagnostic-gate\.mjs"/,
    ],
  },
  {
    key: 'phase0_index_updated',
    label: 'Buyer Phase 0 scope lock lists the Phase 1 live staging command.',
    file: 'docs/audits/buyer-side-launch-hardening-phase0.md',
    patterns: [
      /Phase 1 \| Live staging buyer transaction run/,
      /npm run verify:buyer-side-phase1-live-staging-transaction/,
      /node scripts\/buyer-side-phase1-live-staging-transaction-gate\.mjs --live --confirm-staging --require-live/,
    ],
  },
  {
    key: 'phase8_index_updated',
    label: 'Phase 8 launch readiness links Buyer Phase 1 and its live command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Buyer-side launch hardening Phase 1 live staging transaction: `docs\/audits\/buyer-side-launch-hardening-phase1\.md`/,
      /npm run verify:buyer-side-phase1-live-staging-transaction/,
      /node scripts\/buyer-side-phase1-live-staging-transaction-gate\.mjs --live --confirm-staging --require-live/,
    ],
  },
  {
    key: 'env_record_contract',
    label: '.env.example declares Phase 1 buyer staging record placeholders.',
    file: '.env.example',
    patterns: phase1RequiredRecordKeys.map((key) => new RegExp(`^${key}=`, 'm')),
  },
  {
    key: 'transaction_spine_contract',
    label: 'Accepted-offer transaction creation preserves buyer lead, offer, listing, branch, finance, routing, and onboarding URL context.',
    file: 'src/lib/transactionLifecycleService.js',
    patterns: [
      /\/client\/onboarding\/\$\{onboardingToken\}/,
      /originating_buyer_lead_id: offerRecord\?\.buyerLeadId/,
      /accepted_offer_id: offerRecord\?\.id/,
      /buyer_contact_id: payload\?\.buyerContactId \|\| offerRecord\?\.buyerContactId/,
      /assigned_branch_id: branchId \|\| null/,
      /routing_profile_json: routingProfile/,
      /finance_type: routingFields\.finance_type/,
    ],
  },
  {
    key: 'buyer_onboarding_submission_contract',
    label: 'Buyer onboarding token route can load, save draft, and submit buyer facts.',
    file: 'src/pages/ClientOnboarding.jsx',
    patterns: [
      /useParams/,
      /fetchClientOnboardingByToken/,
      /saveClientOnboardingDraft/,
      /submitClientOnboarding/,
      /resolveBuyerOnboardingFlow/,
      /isBuyerOnboardingDemoToken/,
    ],
  },
  {
    key: 'registration_evidence_contract',
    label: 'Registration completion remains evidence-gated and auditable.',
    file: 'server/services/workflowActionService.js',
    patterns: [
      /function validateRegistrationPayload/,
      /REGISTRATION_DATE_REQUIRED/,
      /TITLE_DEED_NUMBER_REQUIRED/,
      /REGISTRATION_CONFIRMATION_REQUIRED/,
      /workflowKey: 'registration'/,
      /eventType: 'workflow_action_completed'/,
    ],
  },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function cleanEnvValue(value = '') {
  return normalizeText(value).replace(/^["']|["']$/g, '').replace(/\\n$/g, '')
}

function parseArgs(argv) {
  const options = {
    staticOnly: false,
    skipLocalDiagnostic: false,
    live: false,
    confirmStaging: false,
    requireLive: false,
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-local-diagnostic') options.skipLocalDiagnostic = true
    else if (arg === '--live') options.live = true
    else if (arg === '--confirm-staging') options.confirmStaging = true
    else if (arg === '--require-live') {
      options.live = true
      options.requireLive = true
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function envPath(fileName) {
  return new URL(fileName, PROJECT_ROOT)
}

function parseEnvFile(fileName) {
  const filePath = envPath(fileName)
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
    example: parseEnvFile('.env.example'),
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

  return { files, merged }
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function buildConfig(env) {
  const supabaseUrl = normalizeText(env.merged.SUPABASE_URL || env.merged.VITE_SUPABASE_URL)
  return {
    baseUrl: normalizeText(env.merged.BUYER_SIDE_LAUNCH_BASE_URL || env.merged.VITE_PUBLIC_APP_URL || env.merged.VITE_APP_BASE_URL),
    supabaseUrl,
    projectRef: normalizeText(env.merged.BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF) || projectRefFromUrl(supabaseUrl),
    serviceRoleKey: normalizeText(env.merged.SUPABASE_SERVICE_ROLE_KEY),
    anonKey: normalizeText(env.merged.SUPABASE_ANON_KEY || env.merged.VITE_SUPABASE_ANON_KEY || env.merged.VITE_SUPABASE_KEY),
    buyerLeadId: normalizeText(env.merged.BUYER_SIDE_STAGING_BUYER_LEAD_ID),
    listingId: normalizeText(env.merged.BUYER_SIDE_STAGING_LISTING_ID),
    offerId: normalizeText(env.merged.BUYER_SIDE_STAGING_OFFER_ID),
    transactionId: normalizeText(env.merged.BUYER_SIDE_STAGING_TRANSACTION_ID),
    onboardingToken: normalizeText(env.merged.BUYER_SIDE_STAGING_ONBOARDING_TOKEN),
    portalToken: normalizeText(env.merged.BUYER_SIDE_STAGING_PORTAL_TOKEN),
    documentRequestId: normalizeText(env.merged.BUYER_SIDE_STAGING_DOCUMENT_REQUEST_ID),
    recordKeysConfigured: Object.fromEntries(
      phase1RequiredRecordKeys.map((key) => [key, normalizeText(env.merged[key]).length > 0]),
    ),
    personaKeysConfigured: Object.fromEntries(
      phase1PersonaKeys.map((key) => [key, normalizeText(env.merged[key]).length > 0]),
    ),
  }
}

function createReport(options) {
  return {
    phase: '1',
    scope: 'buyer-side-launch-hardening',
    gate: 'live-staging-buyer-transaction-smoke',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Buyer Phase 1 blockers are cleared',
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
      baseUrlConfigured: false,
      serviceRoleConfigured: false,
      recordKeysConfigured: {},
      personaKeysConfigured: {},
      checks: [],
      evidence: {
        buyerLeadId: null,
        listingId: null,
        offerId: null,
        transactionId: null,
        documentRequestId: null,
        onboardingTokenMatchesTransaction: null,
        portalTokenMatchesTransaction: null,
        registrationReadiness: null,
      },
    },
    liveCommand: 'node scripts/buyer-side-phase1-live-staging-transaction-gate.mjs --live --confirm-staging --require-live',
    acceptance: [
      'Buyer Phase 0 fixture contract remains locked.',
      'Local buyer lead-to-registration diagnostic remains green.',
      'Live mode refuses non-staging projects unless the approved staging ref is configured.',
      'Live mode validates one real buyer lead, listing, offer, transaction, onboarding token, portal token, and document request.',
      'Live mode validates buyer lead, accepted offer, listing, finance/routing, onboarding, document, and registration-readiness continuity.',
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

async function runLocalCommands(report, options) {
  if (options.staticOnly || options.skipLocalDiagnostic) {
    for (const step of localCommandSteps) {
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

  for (const step of localCommandSteps) {
    const result = await runNpmScript(step)
    report.commands.push(result)
    if (result.status === 'PASS') report.summary.commandPassCount += 1
    else report.summary.commandBlockedCount += 1
  }
}

function addLiveCheck(report, key, status, label, detail = '') {
  report.live.checks.push({ key, status, label, detail })
  if (status === 'PASS') report.summary.livePassCount += 1
  if (status === 'WARN') report.summary.liveWarningCount += 1
  if (status === 'BLOCKED') report.summary.liveBlockedCount += 1
  if (status === 'CRITICAL') report.summary.liveCriticalCount += 1
}

function isUuidLike(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(normalizeText(value))
}

function sameId(left, right) {
  return normalizeLower(left) && normalizeLower(left) === normalizeLower(right)
}

function anyField(row = {}, fields = []) {
  for (const field of fields) {
    const value = normalizeText(row?.[field])
    if (value) return value
  }
  return ''
}

async function maybeSingle(client, table, column, value) {
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq(column, value)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`${table}.${column}: ${error.message}`)
  return data || null
}

async function fetchRows(client, table, column, value, limit = 50) {
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq(column, value)
    .limit(limit)
  if (error) throw new Error(`${table}.${column}: ${error.message}`)
  return data || []
}

function resolveRegistrationReadiness(transaction = {}, subprocesses = [], steps = []) {
  const stageText = normalizeLower([
    transaction.current_main_stage,
    transaction.stage,
    transaction.lifecycle_state,
    transaction.registration_status,
    transaction.attorney_stage,
  ].filter(Boolean).join(' '))
  const stageReady = /\b(registration|registered|closeout|complete|completed|lodged)\b/.test(stageText)
  const evidenceReady = Boolean(
    normalizeText(transaction.registration_date) &&
      normalizeText(transaction.title_deed_number) &&
      normalizeText(transaction.registration_confirmation_document_id),
  )
  const workflowReady = [...subprocesses, ...steps].some((row) => {
    const keyText = normalizeLower([row.workflow_key, row.subprocess_key, row.key, row.step_key, row.status].filter(Boolean).join(' '))
    return keyText.includes('registration') && /(pending|ready|complete|completed|done|lodged)/.test(keyText)
  })

  return {
    ready: stageReady || evidenceReady || workflowReady,
    stageReady,
    evidenceReady,
    workflowReady,
  }
}

function validateConfig(report, config, options) {
  report.live.projectRef = config.projectRef || null
  report.live.baseUrlConfigured = Boolean(config.baseUrl)
  report.live.serviceRoleConfigured = Boolean(config.serviceRoleKey)
  report.live.recordKeysConfigured = config.recordKeysConfigured
  report.live.personaKeysConfigured = config.personaKeysConfigured

  const missingRuntime = new Set()
  if (!config.baseUrl) missingRuntime.add('BUYER_SIDE_LAUNCH_BASE_URL')
  if (!config.supabaseUrl) missingRuntime.add('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!config.serviceRoleKey) missingRuntime.add('SUPABASE_SERVICE_ROLE_KEY')
  if (!config.projectRef) missingRuntime.add('BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF or Supabase URL project ref')
  for (const key of phase1RequiredRecordKeys) {
    if (!config.recordKeysConfigured[key]) missingRuntime.add(key)
  }
  const missingRuntimeList = [...missingRuntime]

  const missingPersonaKeys = phase1PersonaKeys.filter((key) => !config.personaKeysConfigured[key])
  if (missingPersonaKeys.length) {
    addLiveCheck(
      report,
      'phase1_persona_credentials',
      options.live ? 'WARN' : 'WARN',
      'Phase 1 detected persona credential gaps reserved for later authenticated phases.',
      missingPersonaKeys.join(', '),
    )
  } else {
    addLiveCheck(report, 'phase1_persona_credentials', 'PASS', 'All buyer-side staging persona credentials are configured.')
  }

  if (missingRuntimeList.length) {
    addLiveCheck(
      report,
      'phase1_live_configuration',
      options.live ? 'BLOCKED' : 'WARN',
      'Phase 1 live staging configuration is incomplete.',
      missingRuntimeList.join(', '),
    )
  } else {
    addLiveCheck(report, 'phase1_live_configuration', 'PASS', 'Phase 1 live staging configuration is complete.')
  }

  if (!config.projectRef) {
    addLiveCheck(report, 'phase1_staging_ref', options.live ? 'BLOCKED' : 'WARN', 'Could not resolve staging project ref.')
  } else if (config.projectRef !== STAGING_PROJECT_REF) {
    addLiveCheck(
      report,
      'phase1_staging_ref',
      'CRITICAL',
      'Refusing to run Buyer Phase 1 against a non-approved Supabase project.',
      `Expected ${STAGING_PROJECT_REF}; resolved ${config.projectRef}.`,
    )
  } else {
    addLiveCheck(report, 'phase1_staging_ref', 'PASS', 'Supabase project ref matches approved staging.')
  }

  if (options.live && !options.confirmStaging) {
    addLiveCheck(
      report,
      'phase1_confirm_staging',
      'CRITICAL',
      'Live Buyer Phase 1 requires --confirm-staging before querying staging.',
    )
  } else if (options.live) {
    addLiveCheck(report, 'phase1_confirm_staging', 'PASS', 'Live staging run was explicitly confirmed.')
  }

  return missingRuntimeList.length === 0 && config.projectRef === STAGING_PROJECT_REF && (!options.live || options.confirmStaging)
}

async function runLiveChecks(report, options, config) {
  if (options.staticOnly) {
    report.live.mode = 'skipped'
    return
  }

  validateConfig(report, config, options)

  if (!options.live) {
    report.live.mode = 'skipped'
    return
  }

  if (report.summary.liveBlockedCount > 0 || report.summary.liveCriticalCount > 0) {
    return
  }

  const service = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  const lead = await maybeSingle(service, 'leads', 'lead_id', config.buyerLeadId)
  if (!lead) {
    addLiveCheck(report, 'buyer_lead_exists', 'BLOCKED', 'Configured buyer lead does not exist in staging.')
  } else {
    report.live.evidence.buyerLeadId = lead.lead_id || null
    const leadKind = normalizeLower(anyField(lead, ['lead_category', 'lead_type', 'type', 'interest', 'source_type', 'pipeline_type']))
    if (leadKind && !leadKind.includes('buyer')) {
      addLiveCheck(report, 'buyer_lead_exists', 'BLOCKED', 'Configured lead is not explicitly buyer-scoped.', leadKind)
    } else if (!leadKind) {
      addLiveCheck(report, 'buyer_lead_exists', 'WARN', 'Configured lead exists, but buyer/seller classification is not visible on the row.')
    } else {
      addLiveCheck(report, 'buyer_lead_exists', 'PASS', 'Configured buyer lead exists and is buyer-scoped.')
    }
  }

  const offer = await maybeSingle(service, 'offers', 'id', config.offerId)
  if (!offer) {
    addLiveCheck(report, 'offer_exists', 'BLOCKED', 'Configured accepted offer does not exist in staging.')
  } else {
    report.live.evidence.offerId = offer.id || null
    const offerStatus = normalizeLower(anyField(offer, ['status', 'offer_status', 'lifecycle_status']))
    if (offerStatus && !['accepted', 'converted_to_transaction', 'seller_accepted'].includes(offerStatus)) {
      addLiveCheck(report, 'offer_exists', 'BLOCKED', 'Configured offer is not accepted or converted.', offerStatus)
    } else {
      addLiveCheck(report, 'offer_exists', 'PASS', 'Configured offer exists and is accepted or converted.')
    }
  }

  const transaction = await maybeSingle(service, 'transactions', 'id', config.transactionId)
  if (!transaction) {
    addLiveCheck(report, 'transaction_exists', 'BLOCKED', 'Configured buyer transaction does not exist in staging.')
    return
  }

  report.live.evidence.transactionId = transaction.id || null
  addLiveCheck(report, 'transaction_exists', 'PASS', 'Configured buyer transaction exists in staging.')

  const transactionListingId = anyField(transaction, ['listing_id', 'unit_id', 'property_id'])
  if (sameId(transactionListingId, config.listingId)) {
    report.live.evidence.listingId = transactionListingId
    addLiveCheck(report, 'transaction_listing_link', 'PASS', 'Transaction is linked to the configured listing.')
  } else {
    addLiveCheck(report, 'transaction_listing_link', 'BLOCKED', 'Transaction listing does not match configured listing.')
  }

  if (sameId(transaction.originating_buyer_lead_id || transaction.originating_lead_id || transaction.buyer_id, config.buyerLeadId)) {
    addLiveCheck(report, 'transaction_buyer_lead_link', 'PASS', 'Transaction preserves the configured buyer lead.')
  } else {
    addLiveCheck(report, 'transaction_buyer_lead_link', 'BLOCKED', 'Transaction does not preserve the configured buyer lead.')
  }

  if (sameId(transaction.accepted_offer_id, config.offerId)) {
    addLiveCheck(report, 'transaction_offer_link', 'PASS', 'Transaction preserves the configured accepted offer.')
  } else {
    addLiveCheck(report, 'transaction_offer_link', 'BLOCKED', 'Transaction does not preserve the configured accepted offer.')
  }

  if (normalizeText(transaction.buyer_contact_id || transaction.buyer_id)) {
    addLiveCheck(report, 'transaction_buyer_contact', 'PASS', 'Transaction has buyer contact or buyer identity context.')
  } else {
    addLiveCheck(report, 'transaction_buyer_contact', 'BLOCKED', 'Transaction is missing buyer contact and buyer identity context.')
  }

  if (normalizeText(transaction.assigned_branch_id) && normalizeText(transaction.assigned_agent_id || transaction.assigned_agent_email)) {
    addLiveCheck(report, 'transaction_assignment', 'PASS', 'Transaction preserves branch and agent assignment context.')
  } else {
    addLiveCheck(report, 'transaction_assignment', 'BLOCKED', 'Transaction is missing branch or agent assignment context.')
  }

  if (normalizeText(transaction.finance_type)) {
    addLiveCheck(report, 'transaction_finance_type', 'PASS', 'Transaction has buyer finance type.')
  } else {
    addLiveCheck(report, 'transaction_finance_type', 'BLOCKED', 'Transaction is missing buyer finance type.')
  }

  if (transaction.routing_profile_json && typeof transaction.routing_profile_json === 'object') {
    addLiveCheck(report, 'transaction_routing_profile', 'PASS', 'Transaction has routing profile JSON.')
  } else {
    addLiveCheck(report, 'transaction_routing_profile', 'WARN', 'Transaction routing profile JSON is not visible on the row.')
  }

  if (normalizeText(transaction.onboarding_token) && normalizeText(transaction.onboarding_url)) {
    const tokenMatches = normalizeText(transaction.onboarding_token) === config.onboardingToken
    report.live.evidence.onboardingTokenMatchesTransaction = tokenMatches
    addLiveCheck(
      report,
      'transaction_onboarding_link',
      tokenMatches ? 'PASS' : 'BLOCKED',
      tokenMatches
        ? 'Transaction onboarding token matches the configured staging token.'
        : 'Transaction onboarding token does not match the configured staging token.',
    )
  } else {
    addLiveCheck(report, 'transaction_onboarding_link', 'BLOCKED', 'Transaction is missing onboarding token or URL.')
  }

  const portalLink = await maybeSingle(service, 'client_portal_links', 'token', config.portalToken)
  if (!portalLink) {
    addLiveCheck(report, 'buyer_portal_link', 'BLOCKED', 'Configured buyer portal token does not resolve.')
  } else {
    const tokenMatches = sameId(portalLink.transaction_id, config.transactionId)
    report.live.evidence.portalTokenMatchesTransaction = tokenMatches
    addLiveCheck(
      report,
      'buyer_portal_link',
      tokenMatches ? 'PASS' : 'BLOCKED',
      tokenMatches
        ? 'Buyer portal token resolves to the configured transaction.'
        : 'Buyer portal token resolves to a different transaction.',
    )
  }

  const documentRequest = await maybeSingle(service, 'document_requests', 'id', config.documentRequestId)
  if (!documentRequest) {
    addLiveCheck(report, 'buyer_document_request', 'BLOCKED', 'Configured buyer document request does not exist.')
  } else {
    report.live.evidence.documentRequestId = documentRequest.id || null
    const docMatches = sameId(documentRequest.transaction_id, config.transactionId)
    addLiveCheck(
      report,
      'buyer_document_request',
      docMatches ? 'PASS' : 'BLOCKED',
      docMatches
        ? 'Configured buyer document request belongs to the configured transaction.'
        : 'Configured buyer document request belongs to a different transaction.',
    )
  }

  let subprocesses = []
  let steps = []
  try {
    subprocesses = await fetchRows(service, 'transaction_subprocesses', 'transaction_id', config.transactionId)
    steps = await fetchRows(service, 'transaction_subprocess_steps', 'transaction_id', config.transactionId)
  } catch (error) {
    addLiveCheck(report, 'registration_workflow_rows', 'WARN', 'Could not inspect transaction workflow rows.', error.message)
  }

  const readiness = resolveRegistrationReadiness(transaction, subprocesses, steps)
  report.live.evidence.registrationReadiness = readiness
  addLiveCheck(
    report,
    'registration_readiness',
    readiness.ready ? 'PASS' : 'BLOCKED',
    readiness.ready
      ? 'Configured transaction is registration-ready or registered by stage, evidence, or workflow state.'
      : 'Configured transaction has not reached registration-ready or registered state.',
    JSON.stringify(readiness),
  )
}

function finalizeReport(report, options) {
  if (
    report.summary.staticBlockedCount > 0 ||
    report.summary.commandBlockedCount > 0 ||
    report.summary.liveBlockedCount > 0 ||
    report.summary.liveCriticalCount > 0
  ) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Buyer Phase 1 blockers are cleared'
    return report
  }

  if (options.live) {
    report.summary.status = report.summary.liveWarningCount > 0 ? 'READY_LIVE_WITH_WARNINGS' : 'READY_LIVE'
    report.summary.recommendation = 'Buyer Phase 1 live staging transaction evidence passed'
    return report
  }

  if (report.summary.commandSkippedCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Buyer Phase 1 static contract passed; run without skip flags before local sign-off'
    return report
  }

  report.summary.status = 'READY_LOCAL_CONTRACT'
  report.summary.recommendation = 'Buyer Phase 1 harness is implemented; run live staging command when fixture credentials and IDs are available'
  return report
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = createReport(options)
  const env = loadEnv()
  const config = buildConfig(env)

  runStaticChecks(report)
  await runLocalCommands(report, options)
  await runLiveChecks(report, options, config)
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
