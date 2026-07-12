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
    key: 'phase8_exceptional_legal_scenarios',
    label: 'Attorney workflow Phase 8 exceptional legal scenario gate',
    scriptPath: 'scripts/attorney-workflow-phase8-exceptional-legal-scenarios.mjs',
    coverage: 'Manual-review and unsupported legal scenarios remain owned before pilot monitoring is accepted.',
  },
  {
    key: 'legacy_phase9_coordination',
    label: 'Existing attorney Phase 9 coordination verifier',
    scriptPath: 'scripts/verify-attorney-workflow-phase9.mjs',
    coverage: 'Existing lane coordination summary coverage remains green.',
  },
]

const staticChecks = [
  {
    key: 'pilot_monitor_model',
    label: 'Attorney transaction detail derives stuck-matter and pilot feedback metrics.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /function getAttorneyPilotMonitorTone/,
      /function getAttorneyPilotFeedbackEntries/,
      /function buildAttorneyPilotMonitorModel/,
      /blockedLaneCount/,
      /delayedLaneCount/,
      /overdueLaneCount/,
      /daysIdle/,
      /missingDocumentCount/,
      /roleplayerBlockerCount/,
      /feedbackEntries/,
      /No pilot feedback logged/,
      /Stuck-matter intervention is required\./,
    ],
  },
  {
    key: 'pilot_monitor_panel',
    label: 'Attorney overview renders the pilot monitor with stuck signals and feedback capture.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /function AttorneyPilotMonitorPanel/,
      /Pilot Monitor/,
      /Stuck Matter Signals/,
      /Pilot Feedback/,
      /Idle Days/,
      /Blocked Lanes/,
      /Document Gaps/,
      /Log Pilot Feedback/,
      /Open Activity/,
      /<AttorneyPilotMonitorPanel/,
      /model=\{attorneyPilotMonitor\}/,
    ],
  },
  {
    key: 'pilot_monitor_data_wiring',
    label: 'Pilot monitor uses live workflow, legal exception, document, roleplayer, activity, and discussion signals.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /const attorneyPilotMonitor = useMemo/,
      /workflowLanes,/,
      /documentReadiness,/,
      /roleplayerActionableBlockers,/,
      /legalExceptionReview,/,
      /activityFeed,/,
      /visibleTransactionDiscussion,/,
      /matterHealthLabel,/,
    ],
  },
  {
    key: 'pilot_feedback_action',
    label: 'Pilot feedback CTA drafts an internal attorney note tied to a workflow lane.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /function handleDraftAttorneyPilotFeedbackNote/,
      /Pilot feedback\./,
      /Pilot health:/,
      /Open pilot signals:/,
      /setDiscussionType\('internal_note'\)/,
      /setDiscussionVisibility\('internal'\)/,
      /setDiscussionActionKey\('quick_internal_note'\)/,
      /setDiscussionLaneKey\(/,
      /openWorkspaceMenu\('activity'\)/,
      /onDraftFeedback=\{handleDraftAttorneyPilotFeedbackNote\}/,
    ],
  },
  {
    key: 'package_scripts',
    label: 'Package exposes Phase 9 pilot monitoring commands.',
    file: 'package.json',
    patterns: [
      /"test:attorney-workflow-phase9-pilot-monitoring":\s*"node scripts\/attorney-workflow-phase9-pilot-monitoring\.test\.mjs"/,
      /"verify:attorney-workflow-phase9-pilot-monitoring":\s*"node scripts\/attorney-workflow-phase9-pilot-monitoring\.mjs"/,
    ],
  },
  {
    key: 'phase9_audit_doc',
    label: 'Attorney Phase 9 audit doc records pilot monitoring evidence.',
    file: 'docs/audits/attorney-workflow-phase9-pilot-monitoring.md',
    patterns: [
      /# Attorney Workflow Phase 9 Pilot Monitoring/,
      /## Goal/,
      /## Implemented/,
      /## Verification/,
      /Decision: READY FOR ATTORNEY PILOT MONITORING/,
    ],
  },
  {
    key: 'phase0_contract_updated',
    label: 'Phase 0 contract lists Phase 9 evidence and closes the pilot metrics item.',
    file: 'docs/audits/attorney-workflow-contract-phase0.md',
    patterns: [
      /Attorney workflow Phase 9 pilot monitoring/,
      /npm run verify:attorney-workflow-phase9-pilot-monitoring/,
      /B-ATTY-0-8 \| Closed \| Attorney Operations \/ Pilot QA \| Stuck-matter metrics and pilot feedback capture are surfaced in the attorney overview\. \| Phase 9/,
    ],
  },
  {
    key: 'readiness_indexes',
    label: 'Launch readiness links the Phase 9 audit and verification command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Attorney workflow Phase 9 pilot monitoring: `docs\/audits\/attorney-workflow-phase9-pilot-monitoring\.md`/,
      /npm run verify:attorney-workflow-phase9-pilot-monitoring/,
    ],
  },
  {
    key: 'prior_phase_links',
    label: 'Prior phase docs point at Phase 9 instead of leaving pilot monitoring open.',
    file: 'docs/audits/attorney-workflow-phase8-exceptional-legal-scenarios.md',
    patterns: [
      /Phase 9 pilot monitoring is implemented in `docs\/audits\/attorney-workflow-phase9-pilot-monitoring\.md`/,
    ],
    pairedFiles: [
      {
        file: 'docs/audits/attorney-workflow-phase3-launch-gate.md',
        patterns: [
          /Phase 9 pilot monitoring is implemented in `docs\/audits\/attorney-workflow-phase9-pilot-monitoring\.md`/,
        ],
      },
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
    phase: '9',
    scope: 'attorney-workflow',
    gate: 'pilot-monitoring',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Attorney Phase 9 pilot monitoring is complete',
      staticPassCount: 0,
      staticBlockedCount: 0,
      prerequisitePassCount: 0,
      prerequisiteBlockedCount: 0,
    },
    staticChecks: [],
    prerequisites: [],
    acceptance: [
      'Attorney overview shows stuck-matter metrics for idle days, blocked lanes, and document gaps.',
      'Attorney overview shows pilot feedback capture status.',
      'Pilot feedback can be drafted as an internal attorney note tied to a workflow lane.',
      'Phase 8 exceptional legal scenario ownership remains green.',
      'The existing Phase 9 coordination verifier remains green.',
    ],
  }
}

function runPatternGroup(source, patterns = []) {
  return patterns
    .filter((pattern) => !pattern.test(source))
    .map((pattern) => String(pattern))
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
      result.missingPatterns.push(...runPatternGroup(source, check.patterns))
      for (const pattern of check.forbiddenPatterns || []) {
        if (pattern.test(source)) {
          result.forbiddenMatches.push(String(pattern))
        }
      }
      for (const pairedFile of check.pairedFiles || []) {
        const pairedSource = readFile(pairedFile.file)
        result.missingPatterns.push(
          ...runPatternGroup(pairedSource, pairedFile.patterns).map((pattern) => `${pairedFile.file}: ${pattern}`),
        )
      }
      if (result.missingPatterns.length || result.forbiddenMatches.length) {
        result.status = 'BLOCKED'
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
    report.summary.recommendation = 'NO-GO until Attorney Phase 9 pilot monitoring is complete'
  } else if (options.staticOnly || options.skipPrerequisites) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Static Phase 9 pilot monitoring contract passed; run full verification before sign-off'
  } else {
    report.summary.status = 'READY'
    report.summary.recommendation = 'READY FOR ATTORNEY PILOT MONITORING'
  }
  return report
}

export async function runAttorneyWorkflowPhase9PilotMonitoring(options = {}) {
  const report = createReport(options)
  runStaticChecks(report)
  await runPrerequisites(report, options)
  return finalizeReport(report, options)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = await runAttorneyWorkflowPhase9PilotMonitoring(options)
  console.log(JSON.stringify(report, null, 2))
  if (report.summary.status === 'BLOCKED') process.exitCode = 1
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(JSON.stringify({
      phase: '9',
      scope: 'attorney-workflow',
      gate: 'pilot-monitoring',
      summary: {
        status: 'BLOCKED',
        recommendation: 'NO-GO until Attorney Phase 9 pilot monitoring is complete',
      },
      error: error.message,
      stack: error.stack,
    }, null, 2))
    process.exitCode = 1
  })
}
