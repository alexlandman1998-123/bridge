#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NODE_BIN = process.execPath

const phase5Step = {
  key: 'phase5_final_signoff',
  label: 'Bond originator Phase 5 final sign-off',
  scriptPath: 'scripts/bond-originator-phase5-final-signoff.mjs',
  coverage: 'Bond-originator Phase 4 prerequisite plus final production-go sign-off evidence harness.',
}

const monitoringEvidence = [
  {
    key: 'monitoring_window',
    label: 'Monitoring run window',
    requiredKeys: [
      'BOND_ORIGINATOR_PHASE6_MONITORING_RUN_ID',
      'BOND_ORIGINATOR_PHASE6_MONITORING_OWNER',
      'BOND_ORIGINATOR_PHASE6_MONITORING_STARTED_AT',
      'BOND_ORIGINATOR_PHASE6_WATCH_WINDOW',
    ],
    dateKeys: ['BOND_ORIGINATOR_PHASE6_MONITORING_STARTED_AT'],
  },
  {
    key: 'dashboard_and_alerting',
    label: 'Dashboard and alerting',
    requiredKeys: [
      'BOND_ORIGINATOR_PHASE6_DASHBOARD_URL',
      'BOND_ORIGINATOR_PHASE6_ALERT_CHANNEL_URL',
    ],
  },
  {
    key: 'stuck_file_thresholds',
    label: 'Stuck-file thresholds',
    requiredKeys: [
      'BOND_ORIGINATOR_PHASE6_CRITICAL_STUCK_FILE_THRESHOLD',
      'BOND_ORIGINATOR_PHASE6_WARNING_STUCK_FILE_THRESHOLD',
      'BOND_ORIGINATOR_PHASE6_SLA_BREACH_THRESHOLD',
    ],
    numericKeys: [
      'BOND_ORIGINATOR_PHASE6_CRITICAL_STUCK_FILE_THRESHOLD',
      'BOND_ORIGINATOR_PHASE6_WARNING_STUCK_FILE_THRESHOLD',
      'BOND_ORIGINATOR_PHASE6_SLA_BREACH_THRESHOLD',
    ],
  },
  {
    key: 'incident_response',
    label: 'Incident response ownership',
    requiredKeys: [
      'BOND_ORIGINATOR_PHASE6_ESCALATION_OWNER',
      'BOND_ORIGINATOR_PHASE6_INCIDENT_RUNBOOK_URL',
      'BOND_ORIGINATOR_PHASE6_SUPPORT_HANDOVER_URL',
    ],
  },
  {
    key: 'operational_review',
    label: 'Operational review cadence',
    requiredKeys: [
      'BOND_ORIGINATOR_PHASE6_REVIEW_CADENCE',
      'BOND_ORIGINATOR_PHASE6_REVIEW_APPROVER',
    ],
  },
]

const phase6EnvKeys = monitoringEvidence.flatMap((item) => item.requiredKeys)

const staticChecks = [
  {
    key: 'phase6_audit_doc',
    label: 'Bond originator Phase 6 audit doc defines post-launch monitoring evidence.',
    file: 'docs/audits/bond-originator-phase6-post-launch-monitoring.md',
    patterns: [
      /# Bond Originator Phase 6 Post-Launch Monitoring/,
      /## Goal/,
      /## Commands/,
      /## Monitoring Evidence/,
      /## Alert Semantics/,
      /## Acceptance/,
      /## Current Result/,
      /Decision: PHASE 6 HARNESS IMPLEMENTED; POST-LAUNCH MONITORING EVIDENCE REQUIRED/,
    ],
  },
  {
    key: 'phase_audit_docs_exist',
    label: 'Bond-originator launch audit docs exist for Phase 3 through Phase 6.',
    files: [
      'docs/audits/bond-originator-phase3-launch-gate.md',
      'docs/audits/bond-originator-phase4-staging-sweep.md',
      'docs/audits/bond-originator-phase5-final-signoff.md',
      'docs/audits/bond-originator-phase6-post-launch-monitoring.md',
    ],
  },
  {
    key: 'package_phase6_scripts',
    label: 'Package exposes the bond-originator Phase 6 post-launch monitoring gate.',
    file: 'package.json',
    patterns: [
      /"test:bond-originator-phase6-post-launch-monitoring":\s*"node scripts\/bond-originator-phase6-post-launch-monitoring\.test\.mjs"/,
      /"verify:bond-originator-phase6-post-launch-monitoring":\s*"node scripts\/bond-originator-phase6-post-launch-monitoring\.mjs"/,
      /"verify:bond-originator-phase5-final-signoff":\s*"node scripts\/bond-originator-phase5-final-signoff\.mjs"/,
    ],
  },
  {
    key: 'phase5_handoff_doc',
    label: 'Phase 5 audit doc hands post-launch close-loop ownership to Phase 6.',
    file: 'docs/audits/bond-originator-phase5-final-signoff.md',
    patterns: [
      /Decision: PHASE 5 HARNESS IMPLEMENTED; FINAL SIGN-OFF EVIDENCE REQUIRED BEFORE PRODUCTION GO/,
      /Phase 6/,
      /post-launch monitoring/i,
    ],
  },
  {
    key: 'phase8_launch_readiness',
    label: 'Launch readiness links the Phase 6 post-launch monitoring gate and strict command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Bond originator Phase 6 post-launch monitoring: `docs\/audits\/bond-originator-phase6-post-launch-monitoring\.md`/,
      /npm run verify:bond-originator-phase6-post-launch-monitoring/,
      /node scripts\/bond-originator-phase6-post-launch-monitoring\.mjs --require-monitoring/,
    ],
  },
  {
    key: 'env_contract',
    label: '.env.example declares bond-originator Phase 6 post-launch monitoring placeholders.',
    file: '.env.example',
    patterns: phase6EnvKeys.map((key) => new RegExp(`^${key}=`, 'm')),
  },
  {
    key: 'phase6_script_contract',
    label: 'Phase 6 script requires Phase 5 and post-launch monitoring metadata.',
    file: 'scripts/bond-originator-phase6-post-launch-monitoring.mjs',
    patterns: [
      /--require-monitoring/,
      /--require-final-signoff/,
      /scripts\/bond-originator-phase5-final-signoff\.mjs/,
      /BOND_ORIGINATOR_PHASE6_MONITORING_RUN_ID/,
      /BOND_ORIGINATOR_PHASE6_DASHBOARD_URL/,
      /BOND_ORIGINATOR_PHASE6_CRITICAL_STUCK_FILE_THRESHOLD/,
      /BOND_ORIGINATOR_PHASE6_ESCALATION_OWNER/,
      /BOND_ORIGINATOR_PHASE6_REVIEW_APPROVER/,
    ],
  },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    staticOnly: false,
    skipPhaseGates: false,
    requireFinalSignoff: false,
    requireMonitoring: false,
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-phase-gates') options.skipPhaseGates = true
    else if (arg === '--require-final-signoff') options.requireFinalSignoff = true
    else if (arg === '--require-monitoring') {
      options.requireMonitoring = true
      options.requireFinalSignoff = true
    } else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

function createReport(options) {
  return {
    phase: '6',
    scope: 'bond-originator',
    gate: 'post-launch-monitoring',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Bond Originator Phase 6 post-launch monitoring blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      commandSkippedCount: 0,
      monitoringPassCount: 0,
      monitoringBlockedCount: 0,
      monitoringPendingCount: 0,
    },
    staticChecks: [],
    commands: [],
    monitoringEvidence: [],
    acceptance: [
      'Phase 5 final sign-off harness is callable from the post-launch monitoring gate.',
      'Strict monitoring mode requires Phase 5 final sign-off evidence.',
      'Monitoring run id, owner, started-at timestamp, and watch window are explicit.',
      'Dashboard, alert channel, thresholds, escalation owner, incident runbook, support handover, and review cadence are required.',
      'Local monitoring package readiness is separated from production post-launch evidence.',
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
      files: check.files || null,
      status: 'PASS',
      missingFiles: [],
      missingPatterns: [],
    }

    try {
      if (Array.isArray(check.files)) {
        for (const file of check.files) {
          if (!fs.existsSync(new URL(file, PROJECT_ROOT))) {
            result.status = 'BLOCKED'
            result.missingFiles.push(file)
          }
        }
      } else {
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

function tailLines(value, count = 14) {
  return String(value || '').trim().split('\n').filter(Boolean).slice(-count).join('\n')
}

function parseChildReport(stdout = '') {
  try {
    return JSON.parse(stdout)
  } catch {
    const match = String(stdout || '').match(/\{[\s\S]*\}\s*$/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function collectActionableFindings(value, findings = [], path = [], limit = 16) {
  if (findings.length >= limit || !value || typeof value !== 'object') return findings

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectActionableFindings(item, findings, [...path, index], limit))
    return findings
  }

  const normalizedStatus = normalizeText(value.status).toUpperCase()
  const actionableStatuses = new Set(['BLOCKED', 'FAIL', 'FAILED', 'ERROR', 'CRITICAL', 'WARN', 'WARNING'])
  const hasActionableShape =
    value.key ||
    value.label ||
    value.detail ||
    value.error ||
    (Array.isArray(value.missingConfiguration) && value.missingConfiguration.length > 0) ||
    (Array.isArray(value.missingFiles) && value.missingFiles.length > 0) ||
    (Array.isArray(value.missingPatterns) && value.missingPatterns.length > 0)

  if (actionableStatuses.has(normalizedStatus) && hasActionableShape) {
    findings.push({
      path: path.join('.'),
      key: value.key || null,
      status: normalizedStatus,
      label: value.label || null,
      detail: value.detail || value.error || null,
      missingConfiguration: value.missingConfiguration || [],
      missingFiles: value.missingFiles || [],
      missingPatterns: value.missingPatterns || [],
    })
    if (findings.length >= limit) return findings
  }

  for (const [key, nested] of Object.entries(value)) {
    if (findings.length >= limit) break
    if (key === 'stdout' || key === 'stderr') continue
    collectActionableFindings(nested, findings, [...path, key], limit)
  }

  return findings
}

function summarizeChildReport(childReport = {}) {
  if (!childReport || typeof childReport !== 'object') return {}
  return {
    childStatus: childReport.summary?.status || null,
    childRecommendation: childReport.summary?.recommendation || null,
    childFindings: collectActionableFindings(childReport, [], [], 16),
  }
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

function commandText(scriptPath, args = []) {
  return `${NODE_BIN} ${[scriptPath, ...args].join(' ')}`
}

async function runPhase5Gate(report, options) {
  const phase5Args = options.requireFinalSignoff ? ['--require-final-signoff'] : []
  if (options.staticOnly || options.skipPhaseGates) {
    report.commands.push({
      key: phase5Step.key,
      label: phase5Step.label,
      command: commandText(phase5Step.scriptPath, phase5Args),
      coverage: phase5Step.coverage,
      status: 'SKIPPED',
    })
    report.summary.commandSkippedCount += 1
    return
  }

  const args = [phase5Step.scriptPath, ...phase5Args]
  const raw = await runCommand(NODE_BIN, args, {
    key: phase5Step.key,
    label: phase5Step.label,
    command: commandText(phase5Step.scriptPath, phase5Args),
    coverage: options.requireFinalSignoff
      ? `${phase5Step.coverage} Strict final sign-off evidence is required.`
      : phase5Step.coverage,
  })
  const childReport = parseChildReport(raw.stdout)
  const result = {
    ...raw,
    ...summarizeChildReport(childReport),
    status: raw.exitCode === 0 && !raw.error ? 'PASS' : 'BLOCKED',
    stdout: tailLines(raw.stdout),
    stderr: tailLines(raw.stderr),
  }
  report.commands.push(result)
  if (result.status === 'PASS') report.summary.commandPassCount += 1
  else report.summary.commandBlockedCount += 1
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
  return { ...localEnv, ...stagingEnv, ...processOverrides }
}

function missingEnvKeys(env, keys) {
  return keys.filter((key) => !normalizeText(env[key]))
}

function invalidDateKeys(env, keys) {
  return keys
    .filter((key) => normalizeText(env[key]))
    .filter((key) => Number.isNaN(Date.parse(normalizeText(env[key]))))
    .map((key) => `${key} must be a parseable date/time`)
}

function invalidNumericKeys(env, keys) {
  return keys
    .filter((key) => normalizeText(env[key]))
    .filter((key) => {
      const parsed = Number(normalizeText(env[key]))
      return !Number.isFinite(parsed) || parsed < 0
    })
    .map((key) => `${key} must be a non-negative number`)
}

function addMonitoringEvidence(report, evidence) {
  report.monitoringEvidence.push(evidence)
  if (evidence.status === 'PASS') report.summary.monitoringPassCount += 1
  if (evidence.status === 'BLOCKED') report.summary.monitoringBlockedCount += 1
  if (evidence.status === 'PENDING') report.summary.monitoringPendingCount += 1
}

function runMonitoringEvidence(report, options) {
  const env = loadEnv()

  for (const evidence of monitoringEvidence) {
    const missingConfiguration = missingEnvKeys(env, evidence.requiredKeys)
    const invalidConfiguration = [
      ...invalidDateKeys(env, evidence.dateKeys || []),
      ...invalidNumericKeys(env, evidence.numericKeys || []),
    ]

    if (!options.requireMonitoring) {
      addMonitoringEvidence(report, {
        key: evidence.key,
        label: evidence.label,
        status: 'PENDING',
        detail: 'Required after production go; skipped in local post-launch monitoring package mode.',
        missingConfiguration,
        invalidConfiguration,
      })
    } else if (missingConfiguration.length || invalidConfiguration.length) {
      addMonitoringEvidence(report, {
        key: evidence.key,
        label: evidence.label,
        status: 'BLOCKED',
        missingConfiguration,
        invalidConfiguration,
      })
    } else {
      addMonitoringEvidence(report, {
        key: evidence.key,
        label: evidence.label,
        status: 'PASS',
        evidenceKeys: evidence.requiredKeys,
      })
    }
  }
}

function finalizeReport(report, options) {
  if (
    report.summary.staticBlockedCount > 0 ||
    report.summary.commandBlockedCount > 0 ||
    report.summary.monitoringBlockedCount > 0
  ) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Bond Originator Phase 6 post-launch monitoring blockers are cleared'
    return report
  }

  if (options.requireMonitoring) {
    report.summary.status = 'READY_POST_LAUNCH_MONITORING'
    report.summary.recommendation = 'Bond Originator Phase 6 post-launch monitoring evidence passed'
    return report
  }

  if (options.staticOnly || report.summary.commandSkippedCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Bond Originator Phase 6 static post-launch monitoring contracts passed; run without skip flags before local monitoring package review'
    return report
  }

  report.summary.status = 'READY_LOCAL_MONITORING_PACKAGE'
  report.summary.recommendation = 'Bond Originator Phase 6 local monitoring package passed; post-launch monitoring evidence remains pending'
  return report
}

export async function buildBondOriginatorPhase6PostLaunchMonitoringReport(options = {}) {
  const report = createReport(options)
  runStaticChecks(report)
  await runPhase5Gate(report, options)
  runMonitoringEvidence(report, options)
  return finalizeReport(report, options)
}

async function main() {
  const options = parseArgs()
  const report = await buildBondOriginatorPhase6PostLaunchMonitoringReport(options)
  console.log(JSON.stringify(report, null, 2))

  if (!['READY_STATIC_ONLY', 'READY_LOCAL_MONITORING_PACKAGE', 'READY_POST_LAUNCH_MONITORING'].includes(report.summary.status)) {
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
