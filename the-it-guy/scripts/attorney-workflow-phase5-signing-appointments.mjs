#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NODE_BIN = process.execPath
const CHILD_OUTPUT_REPORT_LIMIT = 1600

const prerequisiteSteps = [
  {
    key: 'phase4_multi_firm_smoke_contract',
    label: 'Attorney workflow Phase 4 multi-firm smoke contract',
    scriptPath: 'scripts/attorney-workflow-phase4-multi-firm-smoke.mjs',
    coverage: 'Phase 4 local multi-firm smoke contract remains green before Phase 5 signing workflow is accepted.',
  },
]

const staticChecks = [
  {
    key: 'transaction_detail_real_appointment_service',
    label: 'Attorney transaction detail creates real signing appointments through the appointment service.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /createAttorneyAppointmentInvite/,
      /Schedule Signing Appointment/,
      /attorney-signing-appointment-form/,
      /SIGNING_APPOINTMENT_TYPE_OPTIONS/,
      /transfer_signing/,
      /bond_signing/,
      /appointment_participants|participantRole/,
      /appointment_confirmation_required|Create Appointment/,
    ],
  },
  {
    key: 'transaction_detail_no_note_shortcut',
    label: 'Schedule signing no longer opens a note draft shortcut.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    forbiddenPatterns: [
      /Signing appointment to be scheduled\./,
      /setWorkflowNoteDraft\(\{\s*laneKey:[\s\S]*Signing appointment to be scheduled\./,
    ],
    patterns: [
      /function getSigningAppointmentWorkflow/,
      /function getSigningAppointmentStage/,
      /openSigningAppointmentWorkflow/,
      /setSigningAppointmentDraft/,
    ],
  },
  {
    key: 'queue_intent_opens_appointment_workflow',
    label: 'Attorney queue schedule-signing intent opens the appointment workflow directly.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /location\.state\?\.attorneyQueueAction !== 'schedule_appointment'/,
      /handledSigningAppointmentIntentRef/,
      /openSigningAppointmentWorkflow\(\)/,
    ],
  },
  {
    key: 'appointment_activity_and_reload',
    label: 'Appointment creation records matter activity and reloads the transaction.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /addTransactionDiscussionComment/,
      /relatedEntityType: 'appointment'/,
      /window\.dispatchEvent\(new Event\('itg:transaction-updated'\)\)/,
      /loadData\(\{ background: true \}\)/,
    ],
  },
  {
    key: 'package_scripts',
    label: 'Package exposes Phase 5 signing appointment commands.',
    file: 'package.json',
    patterns: [
      /"test:attorney-workflow-phase5-signing-appointments":\s*"node scripts\/attorney-workflow-phase5-signing-appointments\.test\.mjs"/,
      /"verify:attorney-workflow-phase5-signing-appointments":\s*"node scripts\/attorney-workflow-phase5-signing-appointments\.mjs"/,
    ],
  },
  {
    key: 'phase5_audit_doc',
    label: 'Attorney Phase 5 audit doc records signing appointment workflow evidence.',
    file: 'docs/audits/attorney-workflow-phase5-signing-appointments.md',
    patterns: [
      /# Attorney Workflow Phase 5 Signing Appointments/,
      /## Goal/,
      /## Implemented/,
      /## Verification/,
      /Decision: GO TO PHASE 6 WITH SIGNING APPOINTMENTS WIRED/,
    ],
  },
  {
    key: 'phase0_contract_updated',
    label: 'Phase 0 contract closes B-ATTY-0-5 and lists Phase 5 evidence.',
    file: 'docs/audits/attorney-workflow-contract-phase0.md',
    patterns: [
      /Attorney workflow Phase 5 signing appointments/,
      /\| B-ATTY-0-5 \| Closed \| Attorney UX \| Signing shortcut now opens a real appointment workflow backed by `appointments` and `appointment_participants`\. \| Phase 5 \|/,
    ],
  },
  {
    key: 'launch_readiness_index',
    label: 'Launch readiness links the Phase 5 audit and verification command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Attorney workflow Phase 5 signing appointments: `docs\/audits\/attorney-workflow-phase5-signing-appointments\.md`/,
      /npm run verify:attorney-workflow-phase5-signing-appointments/,
    ],
  },
]

function parseArgs(argv) {
  const options = {
    staticOnly: false,
    skipPrerequisites: false,
  }
  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-prerequisites') options.skipPrerequisites = true
    else throw new Error(`Unknown option: ${arg}`)
  }
  return options
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

function readFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

function createReport(options) {
  return {
    phase: '5',
    scope: 'attorney-workflow',
    gate: 'signing-appointments',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Attorney Phase 5 blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      prerequisitePassCount: 0,
      prerequisiteBlockedCount: 0,
    },
    staticChecks: [],
    prerequisites: [],
    acceptance: [
      'Schedule Signing opens a real appointment workflow.',
      'Appointment creation writes through the appointment service.',
      'Appointment rows are linked to transaction workflow stage and participant.',
      'Matter activity is recorded after appointment creation.',
      'Queue schedule-signing intent opens the same appointment workflow.',
    ],
  }
}

function runStaticChecks(report) {
  for (const check of staticChecks) {
    const result = {
      key: check.key,
      label: check.label,
      file: check.file,
      status: 'PASS',
      missingPatterns: [],
      forbiddenMatches: [],
    }
    try {
      const source = readFile(check.file)
      for (const pattern of check.patterns || []) {
        if (!pattern.test(source)) {
          result.status = 'BLOCKED'
          result.missingPatterns.push(String(pattern))
        }
      }
      for (const pattern of check.forbiddenPatterns || []) {
        if (pattern.test(source)) {
          result.status = 'BLOCKED'
          result.forbiddenMatches.push(String(pattern))
        }
      }
    } catch (error) {
      result.status = 'BLOCKED'
      result.error = error?.message || String(error)
    }
    if (result.status === 'PASS') report.summary.staticPassCount += 1
    else report.summary.staticBlockedCount += 1
    report.staticChecks.push(result)
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

function finalizeReport(report, options) {
  const staticBlocked = report.summary.staticBlockedCount > 0
  const prereqBlocked = report.summary.prerequisiteBlockedCount > 0
  if (staticBlocked || prereqBlocked) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Attorney Phase 5 blockers are cleared'
  } else if (options.staticOnly || options.skipPrerequisites) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Static Phase 5 signing appointment contract passed; run full verification before sign-off'
  } else {
    report.summary.status = 'READY'
    report.summary.recommendation = 'GO TO PHASE 6 WITH ATTORNEY SIGNING APPOINTMENTS WIRED'
  }
  return report
}

export async function runAttorneyWorkflowPhase5SigningAppointments(options = {}) {
  const report = createReport(options)
  runStaticChecks(report)
  await runPrerequisites(report, options)
  return finalizeReport(report, options)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = await runAttorneyWorkflowPhase5SigningAppointments(options)
  console.log(JSON.stringify(report, null, 2))
  if (report.summary.status === 'BLOCKED') process.exitCode = 1
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(JSON.stringify({
      phase: '5',
      scope: 'attorney-workflow',
      gate: 'signing-appointments',
      summary: {
        status: 'BLOCKED',
        recommendation: 'NO-GO until Attorney Phase 5 blockers are cleared',
      },
      error: error.message,
      stack: error.stack,
    }, null, 2))
    process.exitCode = 1
  })
}
