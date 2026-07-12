#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NODE_BIN = process.execPath

export const WORKFLOW_OVERRIDE_PHASE13_GATE_STEPS = Object.freeze([
  Object.freeze({
    key: 'phase0_override_contract',
    label: 'Workflow override Phase 0 contract',
    scriptPath: 'scripts/workflow-override-contract-phase0.test.mjs',
    coverage: 'Completion modes, override actions, signed artifact statuses, and reason requirements remain locked.',
  }),
  Object.freeze({
    key: 'phase1_status_normalization',
    label: 'Workflow override Phase 1 status normalization',
    scriptPath: 'scripts/workflow-override-status-normalization-phase1.test.mjs',
    coverage: 'Legacy and modern completion statuses normalize to one shared override contract.',
  }),
  Object.freeze({
    key: 'runtime_workflow_actions',
    label: 'Workflow action runtime suite',
    scriptPath: 'server/tests/workflowActionService.test.js',
    coverage: 'Normal, manual, paper, agent-assisted, out-of-sequence, and blocked workflow actions behave correctly.',
  }),
  Object.freeze({
    key: 'runtime_workflow_overrides',
    label: 'Workflow override runtime suite',
    scriptPath: 'server/tests/workflowOverrideService.test.js',
    coverage: 'Manual overrides write evidence, events, recompute audits, waiver metadata, and permission boundaries.',
  }),
  Object.freeze({
    key: 'phase3_paper_otp',
    label: 'Workflow override Phase 3 paper OTP',
    scriptPath: 'scripts/workflow-paper-otp-phase3.test.mjs',
    coverage: 'Paper OTP capture remains a first-class non-digital completion path.',
  }),
  Object.freeze({
    key: 'phase4_manual_contracts',
    label: 'Workflow override Phase 4 manual contract signing',
    scriptPath: 'scripts/workflow-manual-contract-signing-phase4.test.mjs',
    coverage: 'Transfer, bond, and cancellation manual contract upload actions remain wired.',
  }),
  Object.freeze({
    key: 'phase5_manual_mandate',
    label: 'Workflow override Phase 5 manual mandate',
    scriptPath: 'scripts/workflow-manual-mandate-phase5.test.mjs',
    coverage: 'Manual signed mandate uploads continue to sync into workflow evidence.',
  }),
  Object.freeze({
    key: 'phase6_agent_assisted_onboarding',
    label: 'Workflow override Phase 6 agent-assisted onboarding',
    scriptPath: 'scripts/workflow-agent-assisted-onboarding-phase6.test.mjs',
    coverage: 'Buyer and seller onboarding can be completed through agent-assisted capture.',
  }),
  Object.freeze({
    key: 'phase7_agent_assisted_supporting_docs',
    label: 'Workflow override Phase 7 agent-assisted supporting documents',
    scriptPath: 'scripts/workflow-agent-assisted-supporting-docs-phase7.test.mjs',
    coverage: 'Offline supporting document verification remains available and auditable.',
  }),
  Object.freeze({
    key: 'phase8_diagnostic',
    label: 'Workflow override Phase 8 diagnostic',
    scriptPath: 'scripts/workflow-override-diagnostic-phase8.test.mjs',
    coverage: 'Per-transaction override diagnostics still prove every required blocking step has a recovery path.',
  }),
  Object.freeze({
    key: 'phase9_agent_ui_actions',
    label: 'Workflow override Phase 9 agent UI actions',
    scriptPath: 'scripts/workflow-agent-ui-actions-phase9.test.mjs',
    coverage: 'Agent and attorney transaction screens still send the supported non-digital workflow action payloads.',
  }),
  Object.freeze({
    key: 'phase10_payload_policy',
    label: 'Workflow override Phase 10 payload policy',
    scriptPath: 'scripts/workflow-action-payload-policy-phase10.test.mjs',
    coverage: 'Manual and agent-assisted actions require audit reason, capture method, consent method, and valid completion mode.',
  }),
  Object.freeze({
    key: 'phase11_waive_vs_complete',
    label: 'Workflow override Phase 11 waive-vs-complete separation',
    scriptPath: 'scripts/workflow-waive-vs-complete-phase11.test.mjs',
    coverage: 'Waived/skipped outcomes cannot be recorded as ordinary workflow action completion.',
  }),
  Object.freeze({
    key: 'phase12_health_report',
    label: 'Workflow override Phase 12 health report',
    scriptPath: 'scripts/workflow-override-health-report-phase12.test.mjs',
    coverage: 'Aggregate health reporting catches waiver action-completion leaks and missing waiver audit metadata.',
  }),
])

function nowIso() {
  return new Date().toISOString()
}

function formatCommand(command, args = []) {
  return [command, ...args].join(' ')
}

export function createWorkflowOverridePhase13Report() {
  return {
    phase: '13',
    scope: 'workflow-overrides',
    gate: 'operational-launch-gate',
    generatedAt: nowIso(),
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until workflow override operational gate blockers are cleared',
      passCount: 0,
      blockedCount: 0,
      totalCount: WORKFLOW_OVERRIDE_PHASE13_GATE_STEPS.length,
    },
    commands: [],
    acceptance: [
      'Override contract and status normalization remain locked.',
      'Runtime workflow actions and manual overrides remain green.',
      'Paper, manual upload, and agent-assisted completion paths remain available.',
      'Payload policy and waive-vs-complete separation remain enforced.',
      'Per-transaction diagnostics and aggregate health reporting remain green.',
    ],
  }
}

function runCommand(step) {
  return new Promise((resolve) => {
    const args = [step.scriptPath, ...(step.args || [])]
    const startedAt = Date.now()
    console.log(`\n[${step.key}] ${step.label}`)
    console.log(`$ ${formatCommand(NODE_BIN, args)}`)

    const child = spawn(NODE_BIN, args, {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text
      process.stdout.write(text)
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      process.stderr.write(text)
    })
    child.on('error', (error) => {
      resolve({
        ...step,
        status: 'BLOCKED',
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        command: formatCommand(NODE_BIN, args),
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}${error.message}`,
      })
    })
    child.on('close', (exitCode) => {
      resolve({
        ...step,
        status: exitCode === 0 ? 'PASS' : 'BLOCKED',
        exitCode,
        durationMs: Date.now() - startedAt,
        command: formatCommand(NODE_BIN, args),
        stdout,
        stderr,
      })
    })
  })
}

export function summarizeWorkflowOverridePhase13Report(report) {
  const passCount = report.commands.filter((item) => item.status === 'PASS').length
  const blockedCount = report.commands.filter((item) => item.status !== 'PASS').length
  report.summary.passCount = passCount
  report.summary.blockedCount = blockedCount
  report.summary.totalCount = report.commands.length
  report.summary.status = blockedCount ? 'BLOCKED' : 'READY'
  report.summary.recommendation = blockedCount
    ? 'NO-GO until workflow override operational gate blockers are cleared'
    : 'GO FOR OVERRIDE OPERATIONAL PILOT'
  return report
}

export async function runWorkflowOverridePhase13LaunchGate() {
  const report = createWorkflowOverridePhase13Report()
  for (const step of WORKFLOW_OVERRIDE_PHASE13_GATE_STEPS) {
    report.commands.push(await runCommand(step))
  }
  return summarizeWorkflowOverridePhase13Report(report)
}

async function main() {
  const report = await runWorkflowOverridePhase13LaunchGate()
  console.log('\n[workflow_override_phase13] aggregate result')
  console.log(JSON.stringify(report, null, 2))
  if (report.summary.status !== 'READY') process.exitCode = 1
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(JSON.stringify({
      phase: '13',
      scope: 'workflow-overrides',
      gate: 'operational-launch-gate',
      summary: {
        status: 'BLOCKED',
        recommendation: 'NO-GO until workflow override operational gate blockers are cleared',
      },
      error: error.message,
      stack: error.stack,
    }, null, 2))
    process.exitCode = 1
  })
}
