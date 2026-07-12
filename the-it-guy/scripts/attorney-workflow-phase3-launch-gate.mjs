#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NODE_BIN = process.execPath

export const ATTORNEY_WORKFLOW_PHASE3_GATE_STEPS = Object.freeze([
  Object.freeze({
    key: 'phase0_contract',
    label: 'Attorney workflow Phase 0 contract',
    scriptPath: 'scripts/attorney-workflow-contract-phase0.test.mjs',
    coverage: 'Scenario matrix, lanes, blockers, permissions, manual-review boundary, and phase map remain locked.',
  }),
  Object.freeze({
    key: 'phase1_queue_actions',
    label: 'Attorney workflow Phase 1 queue actions',
    scriptPath: 'scripts/attorney-workflow-phase1-queue-actions.test.mjs',
    coverage: 'Attorney queue actions route or execute instead of rendering dead-end buttons.',
  }),
  Object.freeze({
    key: 'phase2_permission_lock',
    label: 'Attorney workflow Phase 2 permission lock',
    scriptPath: 'scripts/attorney-workflow-phase2-permission-lock.test.mjs',
    coverage: 'Lane mutations are assigned-lane and assigned-firm scoped.',
  }),
  Object.freeze({
    key: 'attorney_resolvers',
    label: 'Attorney workflow resolver fixtures',
    scriptPath: 'scripts/verify-attorney-workflow-resolvers.mjs',
    coverage: 'Transaction facts resolve required transfer, bond, and cancellation workflow lanes.',
  }),
  Object.freeze({
    key: 'attorney_lanes',
    label: 'Attorney workflow lane contract',
    scriptPath: 'scripts/verify-attorney-workflow-lanes.mjs',
    coverage: 'Attorney lane definitions and progression contracts remain valid.',
  }),
  Object.freeze({
    key: 'attorney_readiness',
    label: 'Attorney workflow readiness',
    scriptPath: 'scripts/verify-attorney-readiness.mjs',
    coverage: 'Attorney readiness gates keep missing-data, document, signing, and stale-work blockers visible.',
  }),
  Object.freeze({
    key: 'attorney_document_requirements',
    label: 'Attorney document requirements',
    scriptPath: 'scripts/verify-attorney-document-requirements.mjs',
    coverage: 'Attorney document requirement resolution remains aligned with workflow lane facts.',
  }),
  Object.freeze({
    key: 'legal_scenario_matrix',
    label: 'Legal scenario matrix',
    scriptPath: 'scripts/legal-scenario-matrix.test.mjs',
    coverage: 'Supported, manual-review, and unsupported legal scenario boundaries remain explicit.',
  }),
  Object.freeze({
    key: 'legal_requirement_cardinality',
    label: 'Legal requirement cardinality',
    scriptPath: 'scripts/legal-requirement-cardinality-phase2.test.mjs',
    coverage: 'Repeated legal actors such as directors, trustees, spouses, and signatories remain cardinality-aware.',
  }),
  Object.freeze({
    key: 'finance_tab_launch_readiness',
    label: 'Finance tab launch readiness',
    scriptPath: 'scripts/finance-tab-launch-readiness.test.mjs',
    coverage: 'The direct Node finance readiness gate is green before attorney launch aggregation passes.',
  }),
])

function nowIso() {
  return new Date().toISOString()
}

export function createAttorneyWorkflowPhase3Report() {
  return {
    phase: '3',
    scope: 'attorney-workflow',
    gate: 'aggregate-launch-gate',
    generatedAt: nowIso(),
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until attorney workflow aggregate blockers are cleared',
      passCount: 0,
      blockedCount: 0,
      totalCount: ATTORNEY_WORKFLOW_PHASE3_GATE_STEPS.length,
    },
    commands: [],
    acceptance: [
      'Phase 0 workflow contract remains locked.',
      'Phase 1 queue actions remain wired or routed.',
      'Phase 2 lane/firm-scoped mutation permissions remain enforced.',
      'Attorney workflow resolver, lane, readiness, and document requirement checks pass.',
      'Legal scenario and person-cardinality gates remain green.',
      'Finance readiness direct Node gate passes before aggregate launch readiness is reported.',
    ],
  }
}

function formatCommand(command, args = []) {
  return [command, ...args].join(' ')
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

export function summarizeAttorneyWorkflowPhase3Report(report) {
  const passCount = report.commands.filter((item) => item.status === 'PASS').length
  const blockedCount = report.commands.filter((item) => item.status !== 'PASS').length
  report.summary.passCount = passCount
  report.summary.blockedCount = blockedCount
  report.summary.totalCount = report.commands.length
  report.summary.status = blockedCount ? 'BLOCKED' : 'READY'
  report.summary.recommendation = blockedCount
    ? 'NO-GO until attorney workflow aggregate blockers are cleared'
    : 'GO TO PHASE 4 WITH ATTORNEY AGGREGATE GATE GREEN'
  return report
}

export async function runAttorneyWorkflowPhase3LaunchGate() {
  const report = createAttorneyWorkflowPhase3Report()
  for (const step of ATTORNEY_WORKFLOW_PHASE3_GATE_STEPS) {
    report.commands.push(await runCommand(step))
  }
  return summarizeAttorneyWorkflowPhase3Report(report)
}

async function main() {
  const report = await runAttorneyWorkflowPhase3LaunchGate()
  console.log('\n[attorney_workflow_phase3] aggregate result')
  console.log(JSON.stringify(report, null, 2))
  if (report.summary.status !== 'READY') process.exitCode = 1
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(JSON.stringify({
      phase: '3',
      scope: 'attorney-workflow',
      gate: 'aggregate-launch-gate',
      summary: {
        status: 'BLOCKED',
        recommendation: 'NO-GO until attorney workflow aggregate blockers are cleared',
      },
      error: error.message,
      stack: error.stack,
    }, null, 2))
    process.exitCode = 1
  })
}
