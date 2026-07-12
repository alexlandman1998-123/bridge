#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NODE_BIN = process.execPath
const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'

const phase3Step = {
  key: 'phase3_launch_gate',
  label: 'Bond originator Phase 3 launch gate',
  scriptPath: 'scripts/bond-originator-phase3-launch-gate.mjs',
  coverage: 'Phase 0 stuck-file sweep fixture, Phase 1 queue contract, Phase 2 diagnostics/UI surfacing, and classification compatibility.',
}

const phase4EnvKeys = [
  'BOND_ORIGINATOR_PHASE4_SUPABASE_PROJECT_REF',
  'BOND_ORIGINATOR_PHASE4_STAGING_RUN_ID',
  'BOND_ORIGINATOR_PHASE4_SWEEP_APPROVER',
  'BOND_ORIGINATOR_PHASE4_SWEEP_APPROVED_AT',
  'BOND_ORIGINATOR_PHASE4_RELEASE_NOTES_URL',
  'BOND_ORIGINATOR_PHASE4_REMEDIATION_OWNER',
  'BOND_ORIGINATOR_PHASE4_MONITORING_OWNER',
]

const requiredLiveConfigKeys = [
  'supabaseUrl',
  'serviceRoleKey',
  'projectRef',
  'stagingRunId',
  'sweepApprover',
  'sweepApprovedAt',
  'releaseNotesUrl',
  'remediationOwner',
  'monitoringOwner',
]

const staticChecks = [
  {
    key: 'phase4_audit_doc',
    label: 'Bond originator Phase 4 audit doc defines staging sweep evidence and strict live handling.',
    file: 'docs/audits/bond-originator-phase4-staging-sweep.md',
    patterns: [
      /# Bond Originator Phase 4 Staging Sweep/,
      /## Goal/,
      /## Commands/,
      /## Staging Evidence Contract/,
      /## Sweep Finding Semantics/,
      /## Acceptance/,
      /## Current Result/,
      /Decision: PHASE 4 HARNESS IMPLEMENTED; STRICT LIVE STAGING SWEEP REQUIRED/,
    ],
  },
  {
    key: 'package_phase4_scripts',
    label: 'Package exposes the bond-originator Phase 4 staging sweep gate.',
    file: 'package.json',
    patterns: [
      /"test:bond-originator-phase4-staging-sweep":\s*"node scripts\/bond-originator-phase4-staging-sweep\.test\.mjs"/,
      /"verify:bond-originator-phase4-staging-sweep":\s*"node scripts\/bond-originator-phase4-staging-sweep\.mjs"/,
      /"verify:bond-originator-phase3-launch-gate":\s*"node scripts\/bond-originator-phase3-launch-gate\.mjs"/,
    ],
  },
  {
    key: 'phase3_handoff_doc',
    label: 'Phase 3 audit doc hands strict staging evidence to Phase 4.',
    file: 'docs/audits/bond-originator-phase3-launch-gate.md',
    patterns: [
      /Decision: GO TO STAGING SWEEP BEFORE RELEASE/,
      /Phase 4/,
      /strict staging evidence/i,
    ],
  },
  {
    key: 'phase8_launch_readiness',
    label: 'Launch readiness links the Phase 4 staging sweep and strict live command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Bond originator Phase 4 staging sweep: `docs\/audits\/bond-originator-phase4-staging-sweep\.md`/,
      /npm run verify:bond-originator-phase4-staging-sweep/,
      /node scripts\/bond-originator-phase4-staging-sweep\.mjs --live --confirm-staging --require-live/,
    ],
  },
  {
    key: 'env_contract',
    label: '.env.example declares bond-originator Phase 4 staging evidence placeholders.',
    file: '.env.example',
    patterns: phase4EnvKeys.map((key) => new RegExp(`^${key}=`, 'm')),
  },
  {
    key: 'phase4_script_contract',
    label: 'Phase 4 script requires Phase 3, approved staging, service-role read-only sweep, and evidence metadata.',
    file: 'scripts/bond-originator-phase4-staging-sweep.mjs',
    patterns: [
      /STAGING_PROJECT_REF\s*=\s*'isdowlnollckzvltkasn'/,
      /scripts\/bond-originator-phase3-launch-gate\.mjs/,
      /scripts\/bond-originator-stuck-file-sweep\.mjs/,
      /--live/,
      /--confirm-staging/,
      /--require-live/,
      /BOND_ORIGINATOR_PHASE4_STAGING_RUN_ID/,
      /BOND_ORIGINATOR_PHASE4_SWEEP_APPROVER/,
      /BOND_ORIGINATOR_PHASE4_MONITORING_OWNER/,
    ],
  },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function cleanEnvValue(value = '') {
  return normalizeText(value).replace(/^["']|["']$/g, '')
}

function parseNumber(value, fallback) {
  const parsed = Number.parseInt(normalizeText(value), 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    staticOnly: false,
    skipPhaseGates: false,
    live: false,
    confirmStaging: false,
    requireLive: false,
    failOnWarning: false,
    limit: parseNumber(process.env.BOND_ORIGINATOR_PHASE4_SWEEP_LIMIT, 1000),
    thresholds: {},
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-phase-gates') options.skipPhaseGates = true
    else if (arg === '--live') options.live = true
    else if (arg === '--confirm-staging') options.confirmStaging = true
    else if (arg === '--require-live') {
      options.live = true
      options.requireLive = true
    } else if (arg === '--fail-on-warning') options.failOnWarning = true
    else if (arg === '--limit') options.limit = parseNumber(argv[++index], options.limit)
    else if (arg.startsWith('--limit=')) options.limit = parseNumber(arg.slice('--limit='.length), options.limit)
    else if (arg === '--bank-feedback-days') options.thresholds.bankFeedbackDays = parseNumber(argv[++index], null)
    else if (arg === '--additional-documents-days') options.thresholds.additionalDocumentsDays = parseNumber(argv[++index], null)
    else if (arg === '--attorney-handoff-days') options.thresholds.attorneyHandoffDays = parseNumber(argv[++index], null)
    else throw new Error(`Unknown option: ${arg}`)
  }

  for (const key of Object.keys(options.thresholds)) {
    if (!Number.isInteger(options.thresholds[key]) || options.thresholds[key] < 0) delete options.thresholds[key]
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
  const merged = {
    ...parseEnvFile('.env'),
    ...parseEnvFile('.env.staging.local'),
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeText(value))),
  }
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_URL && merged.SUPABASE_URL) merged.VITE_SUPABASE_URL = merged.SUPABASE_URL
  return merged
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function buildConfig(env = {}) {
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  return {
    supabaseUrl,
    serviceRoleKey: normalizeText(env.SUPABASE_SERVICE_ROLE_KEY),
    projectRef: normalizeText(env.BOND_ORIGINATOR_PHASE4_SUPABASE_PROJECT_REF || env.BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF) || projectRefFromUrl(supabaseUrl),
    stagingRunId: normalizeText(env.BOND_ORIGINATOR_PHASE4_STAGING_RUN_ID),
    sweepApprover: normalizeText(env.BOND_ORIGINATOR_PHASE4_SWEEP_APPROVER),
    sweepApprovedAt: normalizeText(env.BOND_ORIGINATOR_PHASE4_SWEEP_APPROVED_AT),
    releaseNotesUrl: normalizeText(env.BOND_ORIGINATOR_PHASE4_RELEASE_NOTES_URL),
    remediationOwner: normalizeText(env.BOND_ORIGINATOR_PHASE4_REMEDIATION_OWNER),
    monitoringOwner: normalizeText(env.BOND_ORIGINATOR_PHASE4_MONITORING_OWNER),
  }
}

function createReport(options) {
  return {
    phase: '4',
    scope: 'bond-originator',
    gate: 'staging-sweep-evidence',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Bond Originator Phase 4 staging sweep blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      commandSkippedCount: 0,
      livePassCount: 0,
      liveWarningCount: 0,
      liveBlockedCount: 0,
      liveCriticalCount: 0,
      livePendingCount: 0,
    },
    staticChecks: [],
    commands: [],
    live: {
      mode: options.live ? 'staging-read-only' : 'skipped',
      projectRef: null,
      sweepLimit: options.limit,
      failOnWarning: Boolean(options.failOnWarning),
      evidenceKeysConfigured: {},
      checks: [],
      sweepReport: null,
      sweepFindings: [],
    },
    liveCommand: 'node scripts/bond-originator-phase4-staging-sweep.mjs --live --confirm-staging --require-live',
    acceptance: [
      'Phase 3 local launch gate is a prerequisite for staging data evidence.',
      'Live mode only runs against the approved staging Supabase project.',
      'Live mode is read-only and uses the existing stuck-file sweep.',
      'Strict live evidence requires an explicit staging run id, approver, release notes, remediation owner, and monitoring owner.',
      'Critical stuck-file findings block release; warnings remain visible and can be promoted to blockers with --fail-on-warning.',
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
      file: check.file || null,
      status: 'PASS',
      missingFiles: [],
      missingPatterns: [],
    }

    try {
      const fileUrl = new URL(check.file, PROJECT_ROOT)
      if (!fs.existsSync(fileUrl)) {
        result.status = 'BLOCKED'
        result.missingFiles.push(check.file)
      } else {
        const source = readProjectFile(check.file)
        for (const pattern of check.patterns || []) {
          if (!pattern.test(source)) {
            result.status = 'BLOCKED'
            result.missingPatterns.push(String(pattern))
          }
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

function tailLines(value, count = 18) {
  return String(value || '').trim().split('\n').filter(Boolean).slice(-count).join('\n')
}

function parseChildJson(stdout = '') {
  const match = String(stdout || '').match(/\{[\s\S]*\}\s*$/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

function summarizeSweepReport(childReport = {}) {
  if (!childReport || typeof childReport !== 'object') return null
  return {
    gateStatus: childReport.gate?.status || null,
    transactionsScanned: childReport.totals?.transactionsScanned || 0,
    bondTransactions: childReport.totals?.bondTransactions || 0,
    findings: childReport.totals?.findings || 0,
    critical: childReport.totals?.critical || 0,
    warning: childReport.totals?.warning || 0,
    categories: childReport.categories || [],
  }
}

function summarizeSweepFindings(childReport = {}) {
  return (Array.isArray(childReport?.findings) ? childReport.findings : [])
    .slice(0, 20)
    .map((finding) => ({
      severity: finding.severity,
      code: finding.code,
      transactionId: finding.transactionId || null,
      stage: finding.stage || null,
      status: finding.status || null,
      ageDays: finding.ageDays ?? null,
      owner: finding.owner || null,
      recommendedAction: finding.recommendedAction || null,
    }))
}

function runCommand(executable, args, metadata) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn(executable, args, {
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
        ...metadata,
        exitCode: code,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      })
    })
    child.on('error', (error) => {
      resolve({
        ...metadata,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
        stdout,
        stderr,
      })
    })
  })
}

async function runPhase3Gate(report, options) {
  if (options.staticOnly || options.skipPhaseGates) {
    report.commands.push({
      key: phase3Step.key,
      label: phase3Step.label,
      command: `${NODE_BIN} ${phase3Step.scriptPath}`,
      coverage: phase3Step.coverage,
      status: 'SKIPPED',
    })
    report.summary.commandSkippedCount += 1
    return
  }

  const raw = await runCommand(NODE_BIN, [phase3Step.scriptPath], {
    key: phase3Step.key,
    label: phase3Step.label,
    command: `${NODE_BIN} ${phase3Step.scriptPath}`,
    coverage: phase3Step.coverage,
  })
  const childReport = parseChildJson(raw.stdout)
  const result = {
    ...raw,
    childStatus: childReport?.summary?.status || null,
    childRecommendation: childReport?.summary?.recommendation || null,
    status: raw.exitCode === 0 && !raw.error ? 'PASS' : 'BLOCKED',
    stdout: tailLines(raw.stdout),
    stderr: tailLines(raw.stderr),
  }
  report.commands.push(result)
  if (result.status === 'PASS') report.summary.commandPassCount += 1
  else report.summary.commandBlockedCount += 1
}

function addLiveCheck(report, key, status, label, detail = '', metadata = null) {
  const check = { key, status, label, detail }
  if (metadata) check.metadata = metadata
  report.live.checks.push(check)
  if (status === 'PASS') report.summary.livePassCount += 1
  else if (status === 'WARN') report.summary.liveWarningCount += 1
  else if (status === 'BLOCKED') report.summary.liveBlockedCount += 1
  else if (status === 'CRITICAL') report.summary.liveCriticalCount += 1
  else if (status === 'PENDING') report.summary.livePendingCount += 1
}

function missingConfigKeys(config) {
  return requiredLiveConfigKeys
    .filter((key) => !normalizeText(config[key]))
    .map((key) => ({
      supabaseUrl: 'SUPABASE_URL/VITE_SUPABASE_URL',
      serviceRoleKey: 'SUPABASE_SERVICE_ROLE_KEY',
      projectRef: 'BOND_ORIGINATOR_PHASE4_SUPABASE_PROJECT_REF or Supabase URL project ref',
      stagingRunId: 'BOND_ORIGINATOR_PHASE4_STAGING_RUN_ID',
      sweepApprover: 'BOND_ORIGINATOR_PHASE4_SWEEP_APPROVER',
      sweepApprovedAt: 'BOND_ORIGINATOR_PHASE4_SWEEP_APPROVED_AT',
      releaseNotesUrl: 'BOND_ORIGINATOR_PHASE4_RELEASE_NOTES_URL',
      remediationOwner: 'BOND_ORIGINATOR_PHASE4_REMEDIATION_OWNER',
      monitoringOwner: 'BOND_ORIGINATOR_PHASE4_MONITORING_OWNER',
    }[key] || key))
}

function validateLiveConfig(report, options, config) {
  report.live.projectRef = config.projectRef || null
  report.live.evidenceKeysConfigured = {
    BOND_ORIGINATOR_PHASE4_STAGING_RUN_ID: Boolean(config.stagingRunId),
    BOND_ORIGINATOR_PHASE4_SWEEP_APPROVER: Boolean(config.sweepApprover),
    BOND_ORIGINATOR_PHASE4_SWEEP_APPROVED_AT: Boolean(config.sweepApprovedAt),
    BOND_ORIGINATOR_PHASE4_RELEASE_NOTES_URL: Boolean(config.releaseNotesUrl),
    BOND_ORIGINATOR_PHASE4_REMEDIATION_OWNER: Boolean(config.remediationOwner),
    BOND_ORIGINATOR_PHASE4_MONITORING_OWNER: Boolean(config.monitoringOwner),
  }

  const missing = missingConfigKeys(config)
  if (missing.length) {
    addLiveCheck(
      report,
      'phase4_live_configuration',
      options.live ? 'BLOCKED' : 'PENDING',
      'Bond originator Phase 4 live staging configuration is incomplete.',
      missing.join(', '),
    )
  } else {
    addLiveCheck(report, 'phase4_live_configuration', 'PASS', 'Bond originator Phase 4 live staging configuration is complete.')
  }

  if (!config.projectRef) {
    addLiveCheck(report, 'phase4_staging_ref', options.live ? 'BLOCKED' : 'PENDING', 'Could not resolve staging project ref.')
  } else if (config.projectRef !== STAGING_PROJECT_REF) {
    addLiveCheck(
      report,
      'phase4_staging_ref',
      'CRITICAL',
      'Refusing to run Bond Originator Phase 4 against a non-approved Supabase project.',
      `Expected ${STAGING_PROJECT_REF}; resolved ${config.projectRef}.`,
    )
  } else {
    addLiveCheck(report, 'phase4_staging_ref', 'PASS', 'Supabase project ref matches approved staging.')
  }

  if (config.sweepApprovedAt && Number.isNaN(Date.parse(config.sweepApprovedAt))) {
    addLiveCheck(
      report,
      'phase4_sweep_approval_timestamp',
      options.live ? 'BLOCKED' : 'PENDING',
      'Sweep approval timestamp must be parseable.',
      'BOND_ORIGINATOR_PHASE4_SWEEP_APPROVED_AT',
    )
  }

  if (options.live && !options.confirmStaging) {
    addLiveCheck(report, 'phase4_confirm_staging', 'CRITICAL', 'Live Bond Originator Phase 4 requires --confirm-staging.')
  } else if (options.live) {
    addLiveCheck(report, 'phase4_confirm_staging', 'PASS', 'Live staging sweep was explicitly confirmed.')
  }
}

function buildSweepArgs(options) {
  const args = ['scripts/bond-originator-stuck-file-sweep.mjs', '--live', '--confirm-staging', '--limit', String(options.limit)]
  if (options.failOnWarning) args.push('--fail-on-warning')
  if (Number.isInteger(options.thresholds.bankFeedbackDays)) args.push('--bank-feedback-days', String(options.thresholds.bankFeedbackDays))
  if (Number.isInteger(options.thresholds.additionalDocumentsDays)) args.push('--additional-documents-days', String(options.thresholds.additionalDocumentsDays))
  if (Number.isInteger(options.thresholds.attorneyHandoffDays)) args.push('--attorney-handoff-days', String(options.thresholds.attorneyHandoffDays))
  return args
}

async function runLiveSweep(report, options) {
  const args = buildSweepArgs(options)
  const raw = await runCommand(NODE_BIN, args, {
    key: 'read_only_staging_stuck_file_sweep',
    label: 'Read-only staging stuck-file sweep',
    command: `${NODE_BIN} ${args.join(' ')}`,
  })
  const childReport = parseChildJson(raw.stdout)
  report.live.sweepReport = summarizeSweepReport(childReport)
  report.live.sweepFindings = summarizeSweepFindings(childReport)

  const warningCount = Number(childReport?.totals?.warning || 0)
  const criticalCount = Number(childReport?.totals?.critical || 0)
  const status =
    raw.exitCode !== 0 || raw.error || criticalCount > 0
      ? 'BLOCKED'
      : warningCount > 0
        ? 'WARN'
        : 'PASS'
  addLiveCheck(
    report,
    'read_only_staging_stuck_file_sweep',
    status,
    'Read-only staging stuck-file sweep completed.',
    childReport
      ? `findings=${childReport.totals?.findings || 0}, critical=${criticalCount}, warning=${warningCount}`
      : raw.error || 'Sweep did not return a parseable JSON report.',
    {
      exitCode: raw.exitCode,
      durationMs: raw.durationMs,
      stdout: tailLines(raw.stdout),
      stderr: tailLines(raw.stderr),
    },
  )
}

async function runLiveChecks(report, options, config) {
  if (!options.live) {
    addLiveCheck(
      report,
      'phase4_live_staging_sweep',
      'PENDING',
      'Strict read-only staging sweep is required before release.',
      report.liveCommand,
    )
    return
  }

  validateLiveConfig(report, options, config)
  if (report.summary.liveBlockedCount > 0 || report.summary.liveCriticalCount > 0) return
  await runLiveSweep(report, options)
}

function finalizeReport(report, options) {
  if (
    report.summary.staticBlockedCount > 0 ||
    report.summary.commandBlockedCount > 0 ||
    report.summary.liveBlockedCount > 0 ||
    report.summary.liveCriticalCount > 0
  ) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Bond Originator Phase 4 staging sweep blockers are cleared'
    return report
  }

  if (options.live) {
    report.summary.status = report.summary.liveWarningCount > 0 ? 'READY_LIVE_WITH_WARNINGS' : 'READY_LIVE'
    report.summary.recommendation = 'Bond Originator Phase 4 strict live staging sweep evidence passed'
    return report
  }

  if (options.staticOnly || report.summary.commandSkippedCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Bond Originator Phase 4 static staging-sweep contracts passed; run without skip flags before local sign-off'
    return report
  }

  report.summary.status = 'READY_LOCAL_CONTRACT'
  report.summary.recommendation = 'Bond Originator Phase 4 harness is implemented; strict live staging sweep remains required before release'
  return report
}

export async function buildBondOriginatorPhase4StagingSweepReport(options = {}) {
  const report = createReport(options)
  const config = buildConfig(loadEnv())

  runStaticChecks(report)
  await runPhase3Gate(report, options)
  await runLiveChecks(report, options, config)
  return finalizeReport(report, options)
}

async function main() {
  const options = parseArgs()
  const report = await buildBondOriginatorPhase4StagingSweepReport(options)
  console.log(JSON.stringify(report, null, 2))

  if (!['READY_STATIC_ONLY', 'READY_LOCAL_CONTRACT', 'READY_LIVE', 'READY_LIVE_WITH_WARNINGS'].includes(report.summary.status)) {
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
      stack: error.stack,
    }, null, 2))
    process.exitCode = 1
  })
}
