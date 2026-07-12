#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NODE_BIN = process.execPath

const phase4Step = {
  key: 'phase4_staging_sweep',
  label: 'Bond originator Phase 4 staging sweep',
  scriptPath: 'scripts/bond-originator-phase4-staging-sweep.mjs',
  coverage: 'Bond-originator Phase 3 prerequisite plus read-only staging stuck-file sweep harness.',
}

const finalSignoffEvidence = [
  {
    key: 'final_staging_approval',
    label: 'Final staging approval',
    requiredKeys: [
      'BOND_ORIGINATOR_PHASE5_SIGNOFF_APPROVER',
      'BOND_ORIGINATOR_PHASE5_SIGNOFF_APPROVED_AT',
      'BOND_ORIGINATOR_PHASE5_RELEASE_NOTES_URL',
    ],
    dateKeys: ['BOND_ORIGINATOR_PHASE5_SIGNOFF_APPROVED_AT'],
  },
  {
    key: 'residual_risk_register',
    label: 'Residual risk register',
    requiredKeys: [
      'BOND_ORIGINATOR_PHASE5_RESIDUAL_RISK_REGISTER_URL',
      'BOND_ORIGINATOR_PHASE5_RESIDUAL_RISK_OWNER',
    ],
  },
  {
    key: 'stuck_file_remediation_owner',
    label: 'Stuck-file remediation owner',
    requiredKeys: [
      'BOND_ORIGINATOR_PHASE5_REMEDIATION_OWNER',
      'BOND_ORIGINATOR_PHASE5_REMEDIATION_PLAYBOOK_URL',
    ],
  },
  {
    key: 'rollback_owner',
    label: 'Rollback owner and plan',
    requiredKeys: [
      'BOND_ORIGINATOR_PHASE5_ROLLBACK_OWNER',
      'BOND_ORIGINATOR_PHASE5_ROLLBACK_PLAN_URL',
    ],
  },
  {
    key: 'launch_support_owner',
    label: 'Launch support owner and playbook',
    requiredKeys: [
      'BOND_ORIGINATOR_PHASE5_SUPPORT_OWNER',
      'BOND_ORIGINATOR_PHASE5_SUPPORT_PLAYBOOK_URL',
    ],
  },
  {
    key: 'post_launch_monitoring',
    label: 'Post-launch monitoring',
    requiredKeys: [
      'BOND_ORIGINATOR_PHASE5_MONITORING_OWNER',
      'BOND_ORIGINATOR_PHASE5_MONITORING_CHECKLIST_URL',
      'BOND_ORIGINATOR_PHASE5_POST_LAUNCH_WATCH_WINDOW',
    ],
  },
]

const phase5EnvKeys = finalSignoffEvidence.flatMap((item) => item.requiredKeys)

const staticChecks = [
  {
    key: 'phase5_audit_doc',
    label: 'Bond originator Phase 5 audit doc defines final sign-off evidence.',
    file: 'docs/audits/bond-originator-phase5-final-signoff.md',
    patterns: [
      /# Bond Originator Phase 5 Final Sign-Off/,
      /## Goal/,
      /## Commands/,
      /## Final Sign-Off Evidence/,
      /## Status Semantics/,
      /## Acceptance/,
      /## Current Result/,
      /Decision: PHASE 5 HARNESS IMPLEMENTED; FINAL SIGN-OFF EVIDENCE REQUIRED BEFORE PRODUCTION GO/,
    ],
  },
  {
    key: 'phase_audit_docs_exist',
    label: 'Bond-originator launch audit docs exist for Phase 3 through Phase 5.',
    files: [
      'docs/audits/bond-originator-phase3-launch-gate.md',
      'docs/audits/bond-originator-phase4-staging-sweep.md',
      'docs/audits/bond-originator-phase5-final-signoff.md',
    ],
  },
  {
    key: 'package_phase5_scripts',
    label: 'Package exposes the bond-originator Phase 5 final sign-off gate.',
    file: 'package.json',
    patterns: [
      /"test:bond-originator-phase5-final-signoff":\s*"node scripts\/bond-originator-phase5-final-signoff\.test\.mjs"/,
      /"verify:bond-originator-phase5-final-signoff":\s*"node scripts\/bond-originator-phase5-final-signoff\.mjs"/,
      /"verify:bond-originator-phase4-staging-sweep":\s*"node scripts\/bond-originator-phase4-staging-sweep\.mjs"/,
    ],
  },
  {
    key: 'phase4_handoff_doc',
    label: 'Phase 4 audit doc hands production go evidence to Phase 5.',
    file: 'docs/audits/bond-originator-phase4-staging-sweep.md',
    patterns: [
      /Decision: PHASE 4 HARNESS IMPLEMENTED; STRICT LIVE STAGING SWEEP REQUIRED/,
      /Phase 5/,
      /final sign-off/i,
    ],
  },
  {
    key: 'phase8_launch_readiness',
    label: 'Launch readiness links the Phase 5 final sign-off gate and strict command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Bond originator Phase 5 final sign-off: `docs\/audits\/bond-originator-phase5-final-signoff\.md`/,
      /npm run verify:bond-originator-phase5-final-signoff/,
      /node scripts\/bond-originator-phase5-final-signoff\.mjs --require-final-signoff/,
    ],
  },
  {
    key: 'env_contract',
    label: '.env.example declares bond-originator Phase 5 final sign-off placeholders.',
    file: '.env.example',
    patterns: phase5EnvKeys.map((key) => new RegExp(`^${key}=`, 'm')),
  },
  {
    key: 'phase5_script_contract',
    label: 'Phase 5 script requires Phase 4 live evidence and final sign-off metadata.',
    file: 'scripts/bond-originator-phase5-final-signoff.mjs',
    patterns: [
      /--require-final-signoff/,
      /--require-live-evidence/,
      /scripts\/bond-originator-phase4-staging-sweep\.mjs/,
      /BOND_ORIGINATOR_PHASE5_SIGNOFF_APPROVER/,
      /BOND_ORIGINATOR_PHASE5_RESIDUAL_RISK_OWNER/,
      /BOND_ORIGINATOR_PHASE5_ROLLBACK_OWNER/,
      /BOND_ORIGINATOR_PHASE5_SUPPORT_OWNER/,
      /BOND_ORIGINATOR_PHASE5_MONITORING_CHECKLIST_URL/,
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
    requireLiveEvidence: false,
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-phase-gates') options.skipPhaseGates = true
    else if (arg === '--require-final-signoff') {
      options.requireFinalSignoff = true
      options.requireLiveEvidence = true
    } else if (arg === '--require-live-evidence') options.requireLiveEvidence = true
    else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

function createReport(options) {
  return {
    phase: '5',
    scope: 'bond-originator',
    gate: 'final-production-signoff',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Bond Originator Phase 5 final sign-off blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      commandSkippedCount: 0,
      signoffPassCount: 0,
      signoffBlockedCount: 0,
      signoffPendingCount: 0,
    },
    staticChecks: [],
    commands: [],
    signoffEvidence: [],
    acceptance: [
      'Phase 4 local staging-sweep harness is callable from the final sign-off gate.',
      'Strict final sign-off mode requires Phase 4 strict live staging sweep evidence.',
      'Final approval is explicit and timestamped.',
      'Residual-risk, stuck-file remediation, rollback, support, and monitoring ownership are required before production go.',
      'Local sign-off package readiness is separated from final production go evidence.',
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

async function runPhase4Gate(report, options) {
  const phase4Args = options.requireLiveEvidence ? ['--live', '--confirm-staging', '--require-live'] : []
  if (options.staticOnly || options.skipPhaseGates) {
    report.commands.push({
      key: phase4Step.key,
      label: phase4Step.label,
      command: commandText(phase4Step.scriptPath, phase4Args),
      coverage: phase4Step.coverage,
      status: 'SKIPPED',
    })
    report.summary.commandSkippedCount += 1
    return
  }

  const args = [phase4Step.scriptPath, ...phase4Args]
  const raw = await runCommand(NODE_BIN, args, {
    key: phase4Step.key,
    label: phase4Step.label,
    command: commandText(phase4Step.scriptPath, phase4Args),
    coverage: options.requireLiveEvidence
      ? `${phase4Step.coverage} Strict live staging sweep evidence is required.`
      : phase4Step.coverage,
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

function addSignoffEvidence(report, evidence) {
  report.signoffEvidence.push(evidence)
  if (evidence.status === 'PASS') report.summary.signoffPassCount += 1
  if (evidence.status === 'BLOCKED') report.summary.signoffBlockedCount += 1
  if (evidence.status === 'PENDING') report.summary.signoffPendingCount += 1
}

function runFinalSignoffEvidence(report, options) {
  const env = loadEnv()

  for (const evidence of finalSignoffEvidence) {
    const missingConfiguration = missingEnvKeys(env, evidence.requiredKeys)
    const invalidConfiguration = invalidDateKeys(env, evidence.dateKeys || [])

    if (!options.requireFinalSignoff) {
      addSignoffEvidence(report, {
        key: evidence.key,
        label: evidence.label,
        status: 'PENDING',
        detail: 'Required before production go; skipped in local final sign-off package mode.',
        missingConfiguration,
        invalidConfiguration,
      })
    } else if (missingConfiguration.length || invalidConfiguration.length) {
      addSignoffEvidence(report, {
        key: evidence.key,
        label: evidence.label,
        status: 'BLOCKED',
        missingConfiguration,
        invalidConfiguration,
      })
    } else {
      addSignoffEvidence(report, {
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
    report.summary.signoffBlockedCount > 0
  ) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Bond Originator Phase 5 final sign-off blockers are cleared'
    return report
  }

  if (options.requireFinalSignoff) {
    report.summary.status = 'READY_FINAL_SIGNOFF'
    report.summary.recommendation = 'Bond Originator Phase 5 final sign-off passed; ready for production go decision'
    return report
  }

  if (options.staticOnly || report.summary.commandSkippedCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Bond Originator Phase 5 static final sign-off contracts passed; run without skip flags before local sign-off package review'
    return report
  }

  report.summary.status = 'READY_LOCAL_SIGNOFF_PACKAGE'
  report.summary.recommendation = 'Bond Originator Phase 5 local sign-off package passed; final production-go evidence remains pending'
  return report
}

export async function buildBondOriginatorPhase5FinalSignoffReport(options = {}) {
  const report = createReport(options)
  runStaticChecks(report)
  await runPhase4Gate(report, options)
  runFinalSignoffEvidence(report, options)
  return finalizeReport(report, options)
}

async function main() {
  const options = parseArgs()
  const report = await buildBondOriginatorPhase5FinalSignoffReport(options)
  console.log(JSON.stringify(report, null, 2))

  if (!['READY_STATIC_ONLY', 'READY_LOCAL_SIGNOFF_PACKAGE', 'READY_FINAL_SIGNOFF'].includes(report.summary.status)) {
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
