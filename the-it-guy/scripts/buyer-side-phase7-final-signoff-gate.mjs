#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NODE_BIN = process.execPath

const phase6Step = {
  key: 'phase6_launch_candidate',
  label: 'Buyer Phase 6 launch-candidate aggregate',
  scriptPath: 'scripts/buyer-side-phase6-launch-candidate-gate.mjs',
  coverage: 'Buyer local launch-candidate evidence, including Phase 0, diagnostic, and Phases 1 through 5.',
}

const finalSignoffEvidence = [
  {
    key: 'staging_run_approval',
    label: 'Final staging run approval',
    requiredKeys: [
      'BUYER_SIDE_PHASE7_STAGING_RUN_ID',
      'BUYER_SIDE_PHASE7_SIGNOFF_APPROVER',
      'BUYER_SIDE_PHASE7_SIGNOFF_APPROVED_AT',
      'BUYER_SIDE_PHASE7_RELEASE_NOTES_URL',
    ],
    dateKeys: ['BUYER_SIDE_PHASE7_SIGNOFF_APPROVED_AT'],
  },
  {
    key: 'residual_risk_register',
    label: 'Residual risk register',
    requiredKeys: [
      'BUYER_SIDE_PHASE7_RESIDUAL_RISK_REGISTER_URL',
      'BUYER_SIDE_PHASE7_RESIDUAL_RISK_OWNER',
    ],
  },
  {
    key: 'rollback_owner',
    label: 'Rollback owner and plan',
    requiredKeys: [
      'BUYER_SIDE_PHASE7_ROLLBACK_OWNER',
      'BUYER_SIDE_PHASE7_ROLLBACK_PLAN_URL',
    ],
  },
  {
    key: 'support_owner',
    label: 'Launch support owner and playbook',
    requiredKeys: [
      'BUYER_SIDE_PHASE7_SUPPORT_OWNER',
      'BUYER_SIDE_PHASE7_SUPPORT_PLAYBOOK_URL',
    ],
  },
  {
    key: 'post_launch_monitoring',
    label: 'Post-launch monitoring checklist',
    requiredKeys: [
      'BUYER_SIDE_PHASE7_MONITORING_OWNER',
      'BUYER_SIDE_PHASE7_MONITORING_CHECKLIST_URL',
      'BUYER_SIDE_PHASE7_POST_LAUNCH_WATCH_WINDOW',
    ],
  },
]

const phase7EnvKeys = finalSignoffEvidence.flatMap((item) => item.requiredKeys)

const staticChecks = [
  {
    key: 'phase7_audit_doc',
    label: 'Buyer Phase 7 audit doc defines final sign-off package and strict final evidence handling.',
    file: 'docs/audits/buyer-side-launch-hardening-phase7.md',
    patterns: [
      /# Buyer-Side Launch Hardening Phase 7/,
      /## Goal/,
      /## Commands/,
      /## Final Sign-Off Evidence/,
      /## Status Semantics/,
      /## Acceptance/,
      /## Current Result/,
      /Decision: PHASE 7 HARNESS IMPLEMENTED; FINAL STAGING SIGN-OFF EVIDENCE REQUIRED BEFORE PRODUCTION GO/,
    ],
  },
  {
    key: 'phase_audit_docs_exist',
    label: 'Buyer launch hardening audit docs exist for Phase 0 through Phase 7 and the local diagnostic.',
    files: [
      'docs/audits/buyer-side-launch-hardening-phase0.md',
      'docs/audits/buyer-side-launch-hardening-phase1.md',
      'docs/audits/buyer-side-launch-hardening-phase2.md',
      'docs/audits/buyer-side-launch-hardening-phase3.md',
      'docs/audits/buyer-side-launch-hardening-phase4.md',
      'docs/audits/buyer-side-launch-hardening-phase5.md',
      'docs/audits/buyer-side-launch-hardening-phase6.md',
      'docs/audits/buyer-side-launch-hardening-phase7.md',
      'docs/audits/buyer-side-lead-registration-diagnostic.md',
    ],
  },
  {
    key: 'package_script',
    label: 'Package exposes the buyer Phase 7 final sign-off command.',
    file: 'package.json',
    patterns: [
      /"verify:buyer-side-phase7-final-signoff":\s*"node scripts\/buyer-side-phase7-final-signoff-gate\.mjs"/,
      /"verify:buyer-side-phase6-launch-candidate":\s*"node scripts\/buyer-side-phase6-launch-candidate-gate\.mjs"/,
    ],
  },
  {
    key: 'phase0_index_updated',
    label: 'Buyer Phase 0 scope lock lists Phase 7 local and strict final sign-off commands.',
    file: 'docs/audits/buyer-side-launch-hardening-phase0.md',
    patterns: [
      /Phase 7 \| Final staging sign-off/,
      /npm run verify:buyer-side-phase7-final-signoff/,
      /node scripts\/buyer-side-phase7-final-signoff-gate\.mjs --require-final-signoff/,
      /### Phase 7 Final Staging Sign-Off/,
      /B-BUYER-0-6/,
      /BUYER_SIDE_PHASE7_STAGING_RUN_ID/,
      /BUYER_SIDE_PHASE7_MONITORING_CHECKLIST_URL/,
    ],
  },
  {
    key: 'phase8_index_updated',
    label: 'Phase 8 launch readiness links Buyer Phase 7 and its final sign-off commands.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Buyer-side launch hardening Phase 7 final staging sign-off: `docs\/audits\/buyer-side-launch-hardening-phase7\.md`/,
      /npm run verify:buyer-side-phase7-final-signoff/,
      /node scripts\/buyer-side-phase7-final-signoff-gate\.mjs --require-final-signoff/,
    ],
  },
  {
    key: 'env_contract',
    label: '.env.example declares buyer Phase 7 final sign-off placeholders.',
    file: '.env.example',
    patterns: phase7EnvKeys.map((key) => new RegExp(`^${key}=`, 'm')),
  },
  {
    key: 'phase6_handoff_result',
    label: 'Phase 6 handoff records local launch-candidate readiness and strict live blockers.',
    file: 'docs/audits/buyer-side-launch-hardening-phase6.md',
    patterns: [
      /READY_LOCAL_CANDIDATE/,
      /Strict live staging evidence: `BLOCKED`/,
      /Strict live blocker summary/,
    ],
  },
  {
    key: 'phase7_script_contract',
    label: 'Phase 7 script requires Phase 6 strict live evidence and final sign-off metadata.',
    file: 'scripts/buyer-side-phase7-final-signoff-gate.mjs',
    patterns: [
      /--require-final-signoff/,
      /--require-live-evidence/,
      /BUYER_SIDE_PHASE7_STAGING_RUN_ID/,
      /BUYER_SIDE_PHASE7_ROLLBACK_OWNER/,
      /BUYER_SIDE_PHASE7_SUPPORT_OWNER/,
      /BUYER_SIDE_PHASE7_MONITORING_CHECKLIST_URL/,
    ],
  },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function parseArgs(argv) {
  const options = {
    staticOnly: false,
    skipPhaseGates: false,
    requireFinalSignoff: false,
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-phase-gates') options.skipPhaseGates = true
    else if (arg === '--require-final-signoff') options.requireFinalSignoff = true
    else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

function createReport(options) {
  return {
    phase: '7',
    scope: 'buyer-side-launch-hardening',
    gate: 'final-staging-signoff',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Buyer Phase 7 final sign-off blockers are cleared',
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
      'Phase 6 local launch-candidate evidence is callable from the final sign-off gate.',
      'Strict final sign-off mode requires the Phase 6 strict live evidence chain.',
      'Final staging run approval is explicit and timestamped.',
      'Residual-risk, rollback, support, and monitoring ownership are required before production go.',
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

function tailLines(value, count = 12) {
  return String(value || '').trim().split('\n').filter(Boolean).slice(-count).join('\n')
}

function parseChildReport(stdout) {
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

function summarizeChildReport(childReport) {
  if (!childReport || typeof childReport !== 'object') return {}

  return {
    childStatus: childReport.summary?.status || null,
    childRecommendation: childReport.summary?.recommendation || null,
    childFindings: dedupeFindings(collectActionableFindings(childReport, [], [], 24)).slice(0, 12),
  }
}

function dedupeFindings(findings) {
  const seen = new Set()
  return findings.filter((finding) => {
    const signature = [
      finding.key,
      finding.status,
      finding.label,
      finding.detail,
      finding.missingConfiguration.join(','),
      finding.missingFiles.join(','),
      finding.missingPatterns.join(','),
    ].join('|')
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
}

function collectActionableFindings(value, findings = [], path = [], limit = 12) {
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

async function runPhase6Gate(report, options) {
  const phase6Args = options.requireFinalSignoff ? ['--require-live-evidence'] : []
  if (options.staticOnly || options.skipPhaseGates) {
    report.commands.push({
      key: phase6Step.key,
      label: phase6Step.label,
      command: commandText(phase6Step.scriptPath, phase6Args),
      coverage: phase6Step.coverage,
      status: 'SKIPPED',
    })
    report.summary.commandSkippedCount += 1
    return
  }

  const args = [phase6Step.scriptPath, ...phase6Args]
  const raw = await runCommand(NODE_BIN, args, {
    key: phase6Step.key,
    label: phase6Step.label,
    command: commandText(phase6Step.scriptPath, phase6Args),
    coverage: options.requireFinalSignoff
      ? `${phase6Step.coverage} Strict live Phase 1 through Phase 5 evidence is required.`
      : phase6Step.coverage,
  })
  const result = {
    ...raw,
    ...summarizeChildReport(parseChildReport(raw.stdout)),
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
    report.summary.recommendation = 'NO-GO until Buyer Phase 7 final sign-off blockers are cleared'
    return report
  }

  if (options.requireFinalSignoff) {
    report.summary.status = 'READY_FINAL_SIGNOFF'
    report.summary.recommendation = 'Buyer Phase 7 final staging sign-off passed; ready for production go decision'
    return report
  }

  if (options.staticOnly || report.summary.commandSkippedCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Buyer Phase 7 static final sign-off contracts passed; run without skip flags before local sign-off package review'
    return report
  }

  report.summary.status = 'READY_LOCAL_SIGNOFF_PACKAGE'
  report.summary.recommendation = 'Buyer Phase 7 local sign-off package passed; final staging approval evidence remains pending'
  return report
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = createReport(options)

  runStaticChecks(report)
  await runPhase6Gate(report, options)
  runFinalSignoffEvidence(report, options)
  finalizeReport(report, options)

  console.log(JSON.stringify(report, null, 2))

  if (!['READY_STATIC_ONLY', 'READY_LOCAL_SIGNOFF_PACKAGE', 'READY_FINAL_SIGNOFF'].includes(report.summary.status)) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
