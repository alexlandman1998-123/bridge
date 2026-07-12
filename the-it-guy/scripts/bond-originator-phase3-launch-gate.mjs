#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NODE_BIN = process.execPath

const localGateSteps = [
  {
    key: 'phase0_stuck_file_sweep_fixture',
    label: 'Phase 0 stuck-file sweep fixture',
    scriptPath: 'scripts/bond-originator-stuck-file-sweep.test.mjs',
    coverage: 'Orphaned READY_FOR_REVIEW rows, invalid statuses, stale bank waits, additional-document waits, and attorney handoff gaps.',
  },
  {
    key: 'phase1_queue_contract',
    label: 'Phase 1 operational queue contract',
    scriptPath: 'src/services/__tests__/bondOperationalQueueService.test.js',
    coverage: 'Canonical visible queue keys, hidden terminal rows, external waits, and review-required fallback.',
  },
  {
    key: 'phase2_diagnostics_contract',
    label: 'Phase 2 diagnostics queue surfacing',
    scriptPath: 'src/services/__tests__/bondOperationalDiagnosticsService.test.js',
    coverage: 'Operational queue key propagation, remediation links, grant evidence routing, and action queues.',
  },
  {
    key: 'command_center_queue_contract',
    label: 'Command center queue contract',
    scriptPath: 'src/services/__tests__/bondCommandCenterService.test.js',
    coverage: 'Bond command center queue aggregation and operational queue compatibility.',
  },
  {
    key: 'queue_panel_ui_contract',
    label: 'Bond queue panel UI contract',
    scriptPath: 'src/components/bond/__tests__/BondQueuePanel.test.jsx',
    coverage: 'Queue labels and canonical queue display coverage.',
  },
  {
    key: 'dashboard_ui_contract',
    label: 'Bond dashboard UI contract',
    scriptPath: 'src/components/bond/__tests__/BondDashboard.test.jsx',
    coverage: 'Operational queue diagnostics and empty-state display coverage.',
  },
  {
    key: 'bond_application_classification',
    label: 'Bond application classification contract',
    scriptPath: 'src/services/__tests__/bondApplicationClassification.test.js',
    coverage: 'Bond intake classification compatibility with transaction finance workflows.',
  },
]

const optionalBuildStep = {
  key: 'production_build',
  label: 'Production build',
  executable: 'npm',
  args: ['run', 'build'],
  command: 'npm run build',
  coverage: 'Vite production bundle still compiles after bond-originator queue changes.',
}

const staticChecks = [
  {
    key: 'package_phase3_scripts',
    label: 'Package exposes the Phase 3 bond-originator launch gate.',
    file: 'package.json',
    patterns: [
      /"test:bond-originator-phase3-launch-gate":\s*"node scripts\/bond-originator-phase3-launch-gate\.test\.mjs"/,
      /"verify:bond-originator-phase3-launch-gate":\s*"node scripts\/bond-originator-phase3-launch-gate\.mjs"/,
      /"test:bond-originator-stuck-file-sweep":\s*"node scripts\/bond-originator-stuck-file-sweep\.test\.mjs"/,
      /"verify:bond-originator-stuck-file-sweep":\s*"node scripts\/bond-originator-stuck-file-sweep\.mjs --live --confirm-staging"/,
    ],
  },
  {
    key: 'phase3_audit_doc',
    label: 'Phase 3 audit document records scope, acceptance, and strict staging evidence.',
    file: 'docs/audits/bond-originator-phase3-launch-gate.md',
    patterns: [
      /# Bond Originator Phase 3 Launch Gate/,
      /Phase 0 stuck-file sweep/,
      /Phase 1 operational queue contract/,
      /Phase 2 diagnostics and dashboard surfacing/,
      /npm run verify:bond-originator-phase3-launch-gate/,
      /--require-staging-sweep/,
      /Decision: GO TO STAGING SWEEP BEFORE RELEASE/,
    ],
  },
  {
    key: 'launch_readiness_reference',
    label: 'Launch readiness document points at the Phase 3 gate and Phase 4 strict staging sweep.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Bond originator Phase 3 launch gate: `docs\/audits\/bond-originator-phase3-launch-gate\.md`/,
      /Bond originator Phase 4 staging sweep: `docs\/audits\/bond-originator-phase4-staging-sweep\.md`/,
      /npm run verify:bond-originator-phase3-launch-gate/,
      /node scripts\/bond-originator-phase4-staging-sweep\.mjs --live --confirm-staging --require-live/,
    ],
  },
  {
    key: 'phase1_queue_contract_exports',
    label: 'Phase 1 queue service exports canonical operational queue contract helpers.',
    file: 'src/services/bondOperationalQueueService.js',
    patterns: [
      /export const BOND_OPERATIONAL_QUEUE_KEYS/,
      /export function getBondOperationalQueueContract/,
      /export function isBondOperationallyVisibleRow/,
      /AWAITING_BANK_FEEDBACK/,
      /ADDITIONAL_DOCUMENTS_REQUIRED/,
      /AWAITING_BUYER_REUPLOAD/,
      /AWAITING_GRANT_DOCUMENT/,
      /AWAITING_SIGNED_GRANT/,
      /INSTRUCTION_SENT_AWAITING_ATTORNEY_ACCEPTANCE/,
      /ACTIVE_REVIEW_REQUIRED/,
      /hiddenAllowed/,
    ],
  },
  {
    key: 'phase2_diagnostics_contract_exports',
    label: 'Phase 2 diagnostics use operational queue keys and canonical queue hrefs.',
    file: 'src/services/bondOperationalDiagnosticsService.js',
    patterns: [
      /getBondOperationalQueueContract/,
      /operationalQueueKey/,
      /operationalWaitState/,
      /operationalQueueReason/,
      /buildActionQueues/,
      /view=awaiting-bank-feedback/,
      /view=additional-documents/,
      /view=buyer-reupload/,
      /view=awaiting-grant/,
      /view=awaiting-signed-grant/,
      /view=attorney-acceptance/,
      /view=review-required/,
    ],
  },
  {
    key: 'canonical_queue_ui_labels',
    label: 'Dashboard, HQ command centre, and queue panel know the canonical operational queues.',
    files: [
      'src/components/bond/BondDashboard.jsx',
      'src/components/bond/BondHqCommandCentre.jsx',
      'src/components/bond/BondQueuePanel.jsx',
    ],
    requiredText: [
      'awaiting_bank_feedback',
      'additional_documents_required',
      'awaiting_buyer_reupload',
      'awaiting_grant_document',
      'awaiting_signed_grant',
      'instruction_sent_awaiting_attorney_acceptance',
      'active_review_required',
    ],
  },
  {
    key: 'phase3_gate_steps_locked',
    label: 'Phase 3 gate runs the Phase 0, Phase 1, and Phase 2 regression suites.',
    file: 'scripts/bond-originator-phase3-launch-gate.mjs',
    patterns: [
      /scripts\/bond-originator-stuck-file-sweep\.test\.mjs/,
      /src\/services\/__tests__\/bondOperationalQueueService\.test\.js/,
      /src\/services\/__tests__\/bondOperationalDiagnosticsService\.test\.js/,
      /src\/services\/__tests__\/bondCommandCenterService\.test\.js/,
      /src\/components\/bond\/__tests__\/BondQueuePanel\.test\.jsx/,
      /src\/components\/bond\/__tests__\/BondDashboard\.test\.jsx/,
      /src\/services\/__tests__\/bondApplicationClassification\.test\.js/,
      /scripts\/bond-originator-stuck-file-sweep\.mjs', '--live', '--confirm-staging/,
    ],
  },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    staticOnly: false,
    skipCommands: false,
    includeBuild: false,
    requireStagingSweep: false,
    failSweepOnWarning: false,
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-commands') options.skipCommands = true
    else if (arg === '--include-build') options.includeBuild = true
    else if (arg === '--require-staging-sweep') options.requireStagingSweep = true
    else if (arg === '--fail-sweep-on-warning') options.failSweepOnWarning = true
    else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

function createReport(options) {
  return {
    phase: '3',
    scope: 'bond-originator',
    gate: 'launch-safety',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Phase 3 launch-gate blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      skippedCommandCount: 0,
      stagingPassCount: 0,
      stagingBlockedCount: 0,
      stagingPendingCount: 0,
    },
    staticChecks: [],
    commands: [],
    stagingEvidence: [],
    acceptance: [
      'The stuck-file sweep remains callable and fails on orphaned or invalid bond-originator states.',
      'The operational queue service keeps every active external wait in a visible canonical queue.',
      'The diagnostics layer surfaces the same canonical queue contract used by operational pages.',
      'Dashboard and command-centre surfaces label and count the canonical external-wait queues.',
      'Strict release mode runs the read-only staging sweep before production release.',
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
      missingText: [],
    }

    try {
      if (check.files?.length) {
        for (const relativePath of check.files) {
          const fileUrl = new URL(relativePath, PROJECT_ROOT)
          if (!fs.existsSync(fileUrl)) {
            result.status = 'BLOCKED'
            result.missingFiles.push(relativePath)
            continue
          }
          const source = readProjectFile(relativePath)
          for (const expected of check.requiredText || []) {
            if (!source.includes(expected)) {
              result.status = 'BLOCKED'
              result.missingText.push(`${relativePath}: ${expected}`)
            }
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

function tailLines(value, count = 18) {
  return String(value || '').trim().split('\n').filter(Boolean).slice(-count).join('\n')
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

async function runLocalGateCommands(report, options) {
  const steps = [...localGateSteps]
  if (options.includeBuild) steps.push(optionalBuildStep)

  if (options.staticOnly || options.skipCommands) {
    for (const step of steps) {
      const command = step.command || `${NODE_BIN} ${step.scriptPath}`
      report.commands.push({
        key: step.key,
        label: step.label,
        command,
        coverage: step.coverage,
        status: 'SKIPPED',
      })
      report.summary.skippedCommandCount += 1
    }
    return
  }

  for (const step of steps) {
    const executable = step.executable || NODE_BIN
    const args = step.args || [step.scriptPath]
    const command = step.command || `${NODE_BIN} ${args.join(' ')}`
    const raw = await runCommand(executable, args, {
      key: step.key,
      label: step.label,
      command,
      coverage: step.coverage,
    })
    const result = {
      ...raw,
      status: raw.exitCode === 0 && !raw.error ? 'PASS' : 'BLOCKED',
      stdout: tailLines(raw.stdout),
      stderr: tailLines(raw.stderr),
    }
    report.commands.push(result)
    if (result.status === 'PASS') report.summary.commandPassCount += 1
    else report.summary.commandBlockedCount += 1
  }
}

function addStagingEvidence(report, evidence) {
  report.stagingEvidence.push(evidence)
  if (evidence.status === 'PASS') report.summary.stagingPassCount += 1
  if (evidence.status === 'BLOCKED') report.summary.stagingBlockedCount += 1
  if (evidence.status === 'PENDING') report.summary.stagingPendingCount += 1
}

async function runStagingEvidence(report, options) {
  const args = ['scripts/bond-originator-stuck-file-sweep.mjs', '--live', '--confirm-staging']
  if (options.failSweepOnWarning) args.push('--fail-on-warning')
  const command = `${NODE_BIN} ${args.join(' ')}`

  if (!options.requireStagingSweep) {
    addStagingEvidence(report, {
      key: 'read_only_staging_stuck_file_sweep',
      label: 'Read-only staging stuck-file sweep',
      status: 'PENDING',
      command,
      detail: 'Required before production release; skipped in local Phase 3 mode.',
    })
    return
  }

  const raw = await runCommand(NODE_BIN, args, {
    key: 'read_only_staging_stuck_file_sweep',
    label: 'Read-only staging stuck-file sweep',
    command,
  })
  addStagingEvidence(report, {
    ...raw,
    status: raw.exitCode === 0 && !raw.error ? 'PASS' : 'BLOCKED',
    stdout: tailLines(raw.stdout),
    stderr: tailLines(raw.stderr),
  })
}

function finalizeReport(report, options) {
  if (
    report.summary.staticBlockedCount > 0 ||
    report.summary.commandBlockedCount > 0 ||
    report.summary.stagingBlockedCount > 0
  ) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Phase 3 launch-gate blockers are cleared'
    return report
  }

  if (options.requireStagingSweep) {
    report.summary.status = 'READY_STAGING_GATE'
    report.summary.recommendation = 'Bond originator Phase 3 local gate and read-only staging sweep passed'
    return report
  }

  if (options.staticOnly || options.skipCommands) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Bond originator Phase 3 static contracts passed; run without skip flags for local sign-off'
    return report
  }

  report.summary.status = 'READY_LOCAL_GATE'
  report.summary.recommendation = 'Bond originator Phase 3 local launch gate passed; read-only staging sweep remains pending before release'
  return report
}

export async function buildBondOriginatorPhase3LaunchGateReport(options = {}) {
  const report = createReport(options)
  runStaticChecks(report)
  await runLocalGateCommands(report, options)
  await runStagingEvidence(report, options)
  return finalizeReport(report, options)
}

async function main() {
  const options = parseArgs()
  const report = await buildBondOriginatorPhase3LaunchGateReport(options)
  console.log(JSON.stringify(report, null, 2))

  if (!['READY_STATIC_ONLY', 'READY_LOCAL_GATE', 'READY_STAGING_GATE'].includes(report.summary.status)) {
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
