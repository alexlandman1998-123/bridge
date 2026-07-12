#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NODE_BIN = process.execPath
const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const CHILD_OUTPUT_REPORT_LIMIT = 1600

export const ATTORNEY_WORKFLOW_PHASE4_ENV_KEYS = Object.freeze([
  'ATTORNEY_WORKFLOW_PHASE4_SUPABASE_PROJECT_REF',
  'ATTORNEY_WORKFLOW_PHASE4_TRANSACTION_ID',
  'ATTORNEY_WORKFLOW_PHASE4_TRANSFER_FIRM_ID',
  'ATTORNEY_WORKFLOW_PHASE4_BOND_FIRM_ID',
  'ATTORNEY_WORKFLOW_PHASE4_CANCELLATION_FIRM_ID',
  'ATTORNEY_WORKFLOW_PHASE4_TRANSFER_EMAIL',
  'ATTORNEY_WORKFLOW_PHASE4_TRANSFER_PASSWORD',
  'ATTORNEY_WORKFLOW_PHASE4_BOND_EMAIL',
  'ATTORNEY_WORKFLOW_PHASE4_BOND_PASSWORD',
  'ATTORNEY_WORKFLOW_PHASE4_CANCELLATION_EMAIL',
  'ATTORNEY_WORKFLOW_PHASE4_CANCELLATION_PASSWORD',
  'ATTORNEY_WORKFLOW_PHASE4_UNRELATED_EMAIL',
  'ATTORNEY_WORKFLOW_PHASE4_UNRELATED_PASSWORD',
])

const prerequisiteSteps = [
  {
    key: 'phase3_aggregate_launch_gate',
    label: 'Attorney workflow Phase 3 aggregate launch gate',
    scriptPath: 'scripts/attorney-workflow-phase3-launch-gate.mjs',
    coverage: 'Phase 0, Phase 1, Phase 2, attorney workflow, legal scenario, cardinality, and finance readiness gates remain green.',
  },
]

export const attorneyPhase4LaneExpectations = Object.freeze([
  Object.freeze({
    laneKey: 'transfer',
    attorneyRole: 'transfer_attorney',
    label: 'Transfer attorney',
    expectedFirmKey: 'transferFirmId',
    emailKey: 'transferEmail',
    passwordKey: 'transferPassword',
  }),
  Object.freeze({
    laneKey: 'bond',
    attorneyRole: 'bond_attorney',
    label: 'Bond attorney',
    expectedFirmKey: 'bondFirmId',
    emailKey: 'bondEmail',
    passwordKey: 'bondPassword',
  }),
  Object.freeze({
    laneKey: 'cancellation',
    attorneyRole: 'cancellation_attorney',
    label: 'Cancellation attorney',
    expectedFirmKey: 'cancellationFirmId',
    emailKey: 'cancellationEmail',
    passwordKey: 'cancellationPassword',
  }),
])

const staticChecks = [
  {
    key: 'phase4_audit_doc',
    label: 'Attorney Phase 4 audit doc defines strict live multi-firm smoke evidence.',
    file: 'docs/audits/attorney-workflow-phase4-multi-firm-smoke.md',
    patterns: [
      /# Attorney Workflow Phase 4 Multi-Firm Smoke/,
      /## Goal/,
      /## Commands/,
      /## Strict Live Evidence/,
      /## Acceptance/,
      /Decision: PHASE 4 HARNESS IMPLEMENTED; STRICT LIVE MULTI-FIRM EVIDENCE REQUIRED/,
    ],
  },
  {
    key: 'phase3_prerequisite',
    label: 'Phase 4 script keeps the Phase 3 aggregate launch gate as a prerequisite.',
    file: 'scripts/attorney-workflow-phase4-multi-firm-smoke.mjs',
    patterns: [
      /scripts\/attorney-workflow-phase3-launch-gate\.mjs/,
      /phase3_aggregate_launch_gate/,
    ],
  },
  {
    key: 'live_assignment_probe',
    label: 'Phase 4 live probe checks transaction attorney assignments for all three lanes.',
    file: 'scripts/attorney-workflow-phase4-multi-firm-smoke.mjs',
    patterns: [
      /transaction_attorney_assignments/,
      /transfer_attorney/,
      /bond_attorney/,
      /cancellation_attorney/,
      /can_update_workflow_lane/,
      /at least two distinct attorney firms/,
    ],
  },
  {
    key: 'live_workflow_lane_probe',
    label: 'Phase 4 live probe checks transfer, bond, and cancellation workflow subprocesses.',
    file: 'scripts/attorney-workflow-phase4-multi-firm-smoke.mjs',
    patterns: [
      /transaction_subprocesses/,
      /process_type/,
      /current_stage/,
      /lane_status/,
    ],
  },
  {
    key: 'persona_visibility_probe',
    label: 'Phase 4 live probe signs in transfer, bond, cancellation, and unrelated personas.',
    file: 'scripts/attorney-workflow-phase4-multi-firm-smoke.mjs',
    patterns: [
      /signInWithPassword/,
      /transferEmail/,
      /bondEmail/,
      /cancellationEmail/,
      /unrelatedEmail/,
      /unrelated user must not see the transaction/,
    ],
  },
  {
    key: 'env_placeholders',
    label: '.env.example declares Phase 4 staging transaction and persona placeholders.',
    file: '.env.example',
    patterns: ATTORNEY_WORKFLOW_PHASE4_ENV_KEYS.map((key) => new RegExp(`^${key}=`, 'm')),
  },
  {
    key: 'package_scripts',
    label: 'Package exposes Phase 4 local and strict live commands.',
    file: 'package.json',
    patterns: [
      /"test:attorney-workflow-phase4-multi-firm-smoke":\s*"node scripts\/attorney-workflow-phase4-multi-firm-smoke\.test\.mjs"/,
      /"verify:attorney-workflow-phase4-multi-firm-smoke":\s*"node scripts\/attorney-workflow-phase4-multi-firm-smoke\.mjs"/,
      /"verify:attorney-workflow-phase4-live":\s*"node scripts\/attorney-workflow-phase4-multi-firm-smoke\.mjs --live --confirm-staging --require-live"/,
    ],
  },
  {
    key: 'phase8_index',
    label: 'Phase 8 launch readiness links the Phase 4 audit and strict live command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Attorney workflow Phase 4 multi-firm smoke: `docs\/audits\/attorney-workflow-phase4-multi-firm-smoke\.md`/,
      /npm run verify:attorney-workflow-phase4-multi-firm-smoke/,
      /npm run verify:attorney-workflow-phase4-live/,
    ],
  },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function truncateOutput(value = '', maxLength = CHILD_OUTPUT_REPORT_LIMIT) {
  const text = String(value || '')
  if (text.length <= maxLength) return text
  const headLength = Math.min(400, Math.floor(maxLength / 3))
  const tailLength = maxLength - headLength
  return [
    text.slice(0, headLength),
    `\n... [truncated ${text.length - maxLength} chars] ...\n`,
    text.slice(-tailLength),
  ].join('')
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
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-prerequisites') options.skipPrerequisites = true
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
        return [line.slice(0, separator), cleanEnvValue(line.slice(separator + 1))]
      }),
  )
}

function loadEnv() {
  const base = parseEnvFile(`${PROJECT_ROOT_PATH}/.env`)
  const staging = parseEnvFile(`${PROJECT_ROOT_PATH}/.env.staging.local`)
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeText(value)))
  const merged = { ...base, ...staging, ...processOverrides }
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
    projectRef: normalizeText(env.ATTORNEY_WORKFLOW_PHASE4_SUPABASE_PROJECT_REF) || projectRefFromUrl(supabaseUrl),
    serviceRoleKey: normalizeText(env.SUPABASE_SERVICE_ROLE_KEY),
    anonKey: normalizeText(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY),
    transactionId: normalizeText(env.ATTORNEY_WORKFLOW_PHASE4_TRANSACTION_ID),
    transferFirmId: normalizeText(env.ATTORNEY_WORKFLOW_PHASE4_TRANSFER_FIRM_ID),
    bondFirmId: normalizeText(env.ATTORNEY_WORKFLOW_PHASE4_BOND_FIRM_ID),
    cancellationFirmId: normalizeText(env.ATTORNEY_WORKFLOW_PHASE4_CANCELLATION_FIRM_ID),
    transferEmail: normalizeText(env.ATTORNEY_WORKFLOW_PHASE4_TRANSFER_EMAIL),
    transferPassword: normalizeText(env.ATTORNEY_WORKFLOW_PHASE4_TRANSFER_PASSWORD),
    bondEmail: normalizeText(env.ATTORNEY_WORKFLOW_PHASE4_BOND_EMAIL),
    bondPassword: normalizeText(env.ATTORNEY_WORKFLOW_PHASE4_BOND_PASSWORD),
    cancellationEmail: normalizeText(env.ATTORNEY_WORKFLOW_PHASE4_CANCELLATION_EMAIL),
    cancellationPassword: normalizeText(env.ATTORNEY_WORKFLOW_PHASE4_CANCELLATION_PASSWORD),
    unrelatedEmail: normalizeText(env.ATTORNEY_WORKFLOW_PHASE4_UNRELATED_EMAIL),
    unrelatedPassword: normalizeText(env.ATTORNEY_WORKFLOW_PHASE4_UNRELATED_PASSWORD),
  }
}

function createReport(options) {
  return {
    phase: '4',
    scope: 'attorney-workflow',
    gate: 'multi-firm-staging-smoke',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Attorney Phase 4 blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      prerequisitePassCount: 0,
      prerequisiteBlockedCount: 0,
      livePassCount: 0,
      liveBlockedCount: 0,
      liveCriticalCount: 0,
      liveWarningCount: 0,
    },
    staticChecks: [],
    prerequisites: [],
    live: {
      mode: options.live ? 'staging-read-only' : 'skipped',
      projectRef: null,
      transactionId: null,
      assignmentChecks: [],
      laneChecks: [],
      personaChecks: [],
      warnings: [],
    },
    acceptance: [
      'Phase 3 aggregate launch gate remains green.',
      'A real staging transaction is identified.',
      'Transfer, bond, and cancellation attorney assignments are active.',
      'At least two distinct attorney firms are represented across the three lanes.',
      'Transfer, bond, and cancellation workflow lanes exist for the transaction.',
      'Assigned attorney personas can see the transaction while an unrelated user cannot.',
    ],
  }
}

function readFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

function addStaticResult(report, result) {
  if (result.status === 'PASS') report.summary.staticPassCount += 1
  else report.summary.staticBlockedCount += 1
  report.staticChecks.push(result)
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
      const source = readFile(check.file)
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
    addStaticResult(report, result)
  }
}

function runPrerequisite(step) {
  return new Promise((resolve) => {
    const args = [step.scriptPath, ...(step.args || [])]
    const startedAt = Date.now()
    console.log(`\n[${step.key}] ${step.label}`)
    console.log(`$ ${[NODE_BIN, ...args].join(' ')}`)
    const child = spawn(NODE_BIN, args, {
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
    child.on('error', (error) => {
      const stderrWithError = `${stderr}${stderr ? '\n' : ''}${error.message}`
      console.log(`[${step.key}] BLOCKED in ${Date.now() - startedAt}ms`)
      if (stdout) console.log(truncateOutput(stdout))
      if (stderrWithError) console.error(truncateOutput(stderrWithError))
      resolve({
        ...step,
        status: 'BLOCKED',
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderrWithError),
      })
    })
    child.on('close', (exitCode) => {
      const status = exitCode === 0 ? 'PASS' : 'BLOCKED'
      console.log(`[${step.key}] ${status} in ${Date.now() - startedAt}ms`)
      if (status === 'BLOCKED') {
        if (stdout) console.log(truncateOutput(stdout))
        if (stderr) console.error(truncateOutput(stderr))
      }
      resolve({
        ...step,
        status,
        exitCode,
        durationMs: Date.now() - startedAt,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
      })
    })
  })
}

async function runPrerequisites(report, options) {
  if (options.skipPrerequisites || options.staticOnly) return
  for (const step of prerequisiteSteps) {
    const result = await runPrerequisite(step)
    if (result.status === 'PASS') report.summary.prerequisitePassCount += 1
    else report.summary.prerequisiteBlockedCount += 1
    report.prerequisites.push(result)
  }
}

function addLiveCheck(report, bucket, result) {
  if (result.status === 'PASS') report.summary.livePassCount += 1
  if (result.status === 'WARN') report.summary.liveWarningCount += 1
  if (result.status === 'BLOCKED') report.summary.liveBlockedCount += 1
  if (result.status === 'CRITICAL') report.summary.liveCriticalCount += 1
  if (result.status === 'WARN') report.live.warnings.push(result.message)
  report.live[bucket].push(result)
}

function isActiveAssignment(row = {}) {
  const status = normalizeLower(row.assignment_status || row.status || 'active')
  return !['removed', 'revoked', 'inactive', 'declined'].includes(status)
}

function assignmentCoversLane(row = {}, expectation = {}) {
  const role = normalizeLower(row.attorney_role || row.assignment_type)
  const assignmentType = normalizeLower(row.assignment_type || row.attorney_role)
  if (role === expectation.attorneyRole) return true
  if (expectation.laneKey === 'transfer') return ['transfer', 'transfer_and_bond'].includes(assignmentType)
  if (expectation.laneKey === 'bond') return ['bond', 'transfer_and_bond'].includes(assignmentType)
  if (expectation.laneKey === 'cancellation') return assignmentType === 'cancellation'
  return false
}

function getFirmId(row = {}) {
  return normalizeText(row.attorney_firm_id || row.firm_id)
}

async function runServiceRoleProbes(report, config, service) {
  const transactionQuery = await service
    .from('transactions')
    .select('id')
    .eq('id', config.transactionId)
    .maybeSingle()
  addLiveCheck(report, 'assignmentChecks', {
    key: 'transaction_exists',
    label: 'Staging transaction exists',
    status: transactionQuery.error || !transactionQuery.data?.id ? 'CRITICAL' : 'PASS',
    message: transactionQuery.error?.message || (transactionQuery.data?.id ? 'Transaction found.' : 'Transaction was not found.'),
  })
  if (transactionQuery.error || !transactionQuery.data?.id) return { assignments: [], subprocesses: [] }

  const assignmentQuery = await service
    .from('transaction_attorney_assignments')
    .select('id, transaction_id, firm_id, attorney_firm_id, assignment_type, attorney_role, primary_attorney_id, attorney_user_id, status, assignment_status, can_update_workflow_lane')
    .eq('transaction_id', config.transactionId)
  const assignments = assignmentQuery.data || []
  if (assignmentQuery.error) {
    addLiveCheck(report, 'assignmentChecks', {
      key: 'assignment_query',
      label: 'Attorney assignment query',
      status: 'CRITICAL',
      message: assignmentQuery.error.message,
    })
    return { assignments: [], subprocesses: [] }
  }

  const matchedAssignments = []
  for (const expectation of attorneyPhase4LaneExpectations) {
    const match = assignments.find((row) => isActiveAssignment(row) && assignmentCoversLane(row, expectation))
    if (!match) {
      addLiveCheck(report, 'assignmentChecks', {
        key: `${expectation.laneKey}_assignment`,
        label: `${expectation.label} assignment`,
        status: 'CRITICAL',
        message: `${expectation.label} assignment is missing or inactive.`,
      })
      continue
    }

    matchedAssignments.push(match)
    const firmId = getFirmId(match)
    const expectedFirmId = config[expectation.expectedFirmKey]
    const firmMatches = !expectedFirmId || expectedFirmId === firmId
    const canUpdate = match.can_update_workflow_lane !== false
    addLiveCheck(report, 'assignmentChecks', {
      key: `${expectation.laneKey}_assignment`,
      label: `${expectation.label} assignment`,
      status: firmId && firmMatches && canUpdate ? 'PASS' : 'BLOCKED',
      assignmentId: match.id,
      firmId,
      expectedFirmId: expectedFirmId || null,
      canUpdateWorkflowLane: canUpdate,
      message: firmId
        ? firmMatches
          ? canUpdate
            ? `${expectation.label} assignment is active and lane-editable.`
            : `${expectation.label} assignment has can_update_workflow_lane=false.`
          : `${expectation.label} assignment firm does not match configured fixture.`
        : `${expectation.label} assignment has no firm id.`,
    })
  }

  const distinctFirmIds = [...new Set(matchedAssignments.map(getFirmId).filter(Boolean))]
  addLiveCheck(report, 'assignmentChecks', {
    key: 'multi_firm_distribution',
    label: 'Multi-firm assignment distribution',
    status: distinctFirmIds.length >= 2 ? 'PASS' : 'CRITICAL',
    firmIds: distinctFirmIds,
    message: distinctFirmIds.length >= 2
      ? `Transaction has ${distinctFirmIds.length} distinct attorney firms.`
      : 'Phase 4 requires at least two distinct attorney firms across transfer, bond, and cancellation lanes.',
  })

  const subprocessQuery = await service
    .from('transaction_subprocesses')
    .select('id, transaction_id, process_type, attorney_role, status, current_stage, lane_status')
    .eq('transaction_id', config.transactionId)
  const subprocesses = subprocessQuery.data || []
  if (subprocessQuery.error) {
    addLiveCheck(report, 'laneChecks', {
      key: 'subprocess_query',
      label: 'Attorney workflow subprocess query',
      status: 'CRITICAL',
      message: subprocessQuery.error.message,
    })
    return { assignments, subprocesses: [] }
  }

  for (const expectation of attorneyPhase4LaneExpectations) {
    const lane = subprocesses.find((row) => {
      const processType = normalizeLower(row.process_type === 'attorney' ? 'transfer' : row.process_type)
      const role = normalizeLower(row.attorney_role)
      return processType === expectation.laneKey || role === expectation.attorneyRole
    })
    addLiveCheck(report, 'laneChecks', {
      key: `${expectation.laneKey}_workflow_lane`,
      label: `${expectation.label} workflow lane`,
      status: lane?.id ? 'PASS' : 'CRITICAL',
      subprocessId: lane?.id || null,
      currentStage: lane?.current_stage || null,
      laneStatus: lane?.lane_status || lane?.status || null,
      message: lane?.id ? `${expectation.label} workflow lane exists.` : `${expectation.label} workflow lane is missing.`,
    })
  }

  return { assignments, subprocesses }
}

async function signInPersona(config, expectation) {
  const email = config[expectation.emailKey]
  const password = config[expectation.passwordKey]
  if (!email || !password) {
    return {
      client: null,
      error: new Error(`${expectation.label} credentials are missing.`),
      configured: false,
    }
  }
  const client = createClient(config.supabaseUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  return { client, error, configured: true }
}

async function queryPersonaVisibility(client, transactionId) {
  const transactionQuery = await client
    .from('transactions')
    .select('id')
    .eq('id', transactionId)
    .maybeSingle()
  const assignmentQuery = await client
    .from('transaction_attorney_assignments')
    .select('id, attorney_role, firm_id, attorney_firm_id')
    .eq('transaction_id', transactionId)
    .limit(10)
  return {
    transactionVisible: Boolean(transactionQuery.data?.id),
    assignmentRows: assignmentQuery.data || [],
    transactionError: transactionQuery.error,
    assignmentError: assignmentQuery.error,
  }
}

async function runPersonaProbes(report, config) {
  if (!config.anonKey) {
    addLiveCheck(report, 'personaChecks', {
      key: 'anon_key',
      label: 'Anon key',
      status: 'CRITICAL',
      message: 'SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY is required for persona probes.',
    })
    return
  }

  for (const expectation of attorneyPhase4LaneExpectations) {
    const signIn = await signInPersona(config, expectation)
    if (signIn.error || !signIn.client) {
      addLiveCheck(report, 'personaChecks', {
        key: `${expectation.laneKey}_persona_signin`,
        label: `${expectation.label} persona sign-in`,
        status: signIn.configured ? 'CRITICAL' : 'BLOCKED',
        message: signIn.error?.message || 'Unable to sign in persona.',
      })
      continue
    }
    const visibility = await queryPersonaVisibility(signIn.client, config.transactionId)
    addLiveCheck(report, 'personaChecks', {
      key: `${expectation.laneKey}_persona_visibility`,
      label: `${expectation.label} persona visibility`,
      status: visibility.transactionVisible && visibility.assignmentRows.length > 0 ? 'PASS' : 'CRITICAL',
      transactionVisible: visibility.transactionVisible,
      assignmentRowCount: visibility.assignmentRows.length,
      message: visibility.transactionVisible
        ? `${expectation.label} can see the transaction and ${visibility.assignmentRows.length} assignment rows.`
        : visibility.transactionError?.message || `${expectation.label} cannot see the transaction.`,
    })
  }

  const unrelated = await signInPersona(config, {
    label: 'Unrelated user',
    emailKey: 'unrelatedEmail',
    passwordKey: 'unrelatedPassword',
  })
  if (unrelated.error || !unrelated.client) {
    addLiveCheck(report, 'personaChecks', {
      key: 'unrelated_persona_signin',
      label: 'Unrelated user persona sign-in',
      status: unrelated.configured ? 'CRITICAL' : 'BLOCKED',
      message: unrelated.error?.message || 'Unable to sign in unrelated user.',
    })
    return
  }
  const visibility = await queryPersonaVisibility(unrelated.client, config.transactionId)
  addLiveCheck(report, 'personaChecks', {
    key: 'unrelated_persona_denial',
    label: 'Unrelated user denial',
    status: !visibility.transactionVisible && visibility.assignmentRows.length === 0 ? 'PASS' : 'CRITICAL',
    transactionVisible: visibility.transactionVisible,
    assignmentRowCount: visibility.assignmentRows.length,
    message: !visibility.transactionVisible && visibility.assignmentRows.length === 0
      ? 'Unrelated user must not see the transaction, and the denial passed.'
      : 'Unrelated user must not see the transaction or attorney assignments.',
  })
}

async function runLiveProbes(report, options) {
  if (!options.live) return

  const env = loadEnv()
  const config = buildConfig(env)
  report.live.projectRef = config.projectRef || null
  report.live.transactionId = config.transactionId || null

  const requiredConfig = [
    ['SUPABASE_URL or VITE_SUPABASE_URL', config.supabaseUrl],
    ['SUPABASE_SERVICE_ROLE_KEY', config.serviceRoleKey],
    ['SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY', config.anonKey],
    ['ATTORNEY_WORKFLOW_PHASE4_TRANSACTION_ID', config.transactionId],
    ['ATTORNEY_WORKFLOW_PHASE4_TRANSFER_FIRM_ID', config.transferFirmId],
    ['ATTORNEY_WORKFLOW_PHASE4_BOND_FIRM_ID', config.bondFirmId],
    ['ATTORNEY_WORKFLOW_PHASE4_CANCELLATION_FIRM_ID', config.cancellationFirmId],
    ['ATTORNEY_WORKFLOW_PHASE4_TRANSFER_EMAIL', config.transferEmail],
    ['ATTORNEY_WORKFLOW_PHASE4_TRANSFER_PASSWORD', config.transferPassword],
    ['ATTORNEY_WORKFLOW_PHASE4_BOND_EMAIL', config.bondEmail],
    ['ATTORNEY_WORKFLOW_PHASE4_BOND_PASSWORD', config.bondPassword],
    ['ATTORNEY_WORKFLOW_PHASE4_CANCELLATION_EMAIL', config.cancellationEmail],
    ['ATTORNEY_WORKFLOW_PHASE4_CANCELLATION_PASSWORD', config.cancellationPassword],
    ['ATTORNEY_WORKFLOW_PHASE4_UNRELATED_EMAIL', config.unrelatedEmail],
    ['ATTORNEY_WORKFLOW_PHASE4_UNRELATED_PASSWORD', config.unrelatedPassword],
  ]
  const missingConfig = requiredConfig.filter(([, value]) => !value).map(([label]) => label)
  if (missingConfig.length) {
    addLiveCheck(report, 'assignmentChecks', {
      key: 'live_configuration',
      label: 'Live configuration',
      status: options.requireLive ? 'CRITICAL' : 'BLOCKED',
      message: `Missing live configuration: ${missingConfig.join(', ')}.`,
    })
    return
  }
  if (config.projectRef !== STAGING_PROJECT_REF) {
    addLiveCheck(report, 'assignmentChecks', {
      key: 'staging_project_ref',
      label: 'Approved staging project',
      status: 'CRITICAL',
      message: `Refusing to run against project "${config.projectRef || 'unknown'}"; expected staging project "${STAGING_PROJECT_REF}".`,
    })
    return
  }
  if (!options.confirmStaging) {
    addLiveCheck(report, 'assignmentChecks', {
      key: 'confirm_staging',
      label: 'Explicit staging confirmation',
      status: 'CRITICAL',
      message: 'Live Phase 4 requires --confirm-staging.',
    })
    return
  }

  const service = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  await runServiceRoleProbes(report, config, service)
  await runPersonaProbes(report, config)
}

function finalizeReport(report, options) {
  const staticBlocked = report.summary.staticBlockedCount > 0
  const prereqBlocked = report.summary.prerequisiteBlockedCount > 0
  const liveBlocked = report.summary.liveBlockedCount > 0 || report.summary.liveCriticalCount > 0
  const liveRequiredButSkipped = options.requireLive && !options.live

  if (staticBlocked || prereqBlocked || liveBlocked || liveRequiredButSkipped) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Attorney Phase 4 blockers are cleared'
  } else if (options.live) {
    report.summary.status = 'READY_LIVE'
    report.summary.recommendation = 'GO TO PHASE 5 WITH STRICT LIVE MULTI-FIRM ATTORNEY SMOKE GREEN'
  } else {
    report.summary.status = 'READY_LOCAL_CONTRACT'
    report.summary.recommendation = 'Phase 4 harness is implemented; run strict live multi-firm smoke before Phase 4 sign-off'
  }
  return report
}

export async function runAttorneyWorkflowPhase4MultiFirmSmoke(options = {}) {
  const report = createReport(options)
  runStaticChecks(report)
  await runPrerequisites(report, options)
  await runLiveProbes(report, options)
  return finalizeReport(report, options)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = await runAttorneyWorkflowPhase4MultiFirmSmoke(options)
  console.log(JSON.stringify(report, null, 2))
  if (report.summary.status === 'BLOCKED') process.exitCode = 1
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(JSON.stringify({
      phase: '4',
      scope: 'attorney-workflow',
      gate: 'multi-firm-staging-smoke',
      summary: {
        status: 'BLOCKED',
        recommendation: 'NO-GO until Attorney Phase 4 blockers are cleared',
      },
      error: error.message,
      stack: error.stack,
    }, null, 2))
    process.exitCode = 1
  })
}
