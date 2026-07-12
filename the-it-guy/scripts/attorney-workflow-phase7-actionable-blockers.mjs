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
    key: 'phase6_person_level_requirements',
    label: 'Attorney workflow Phase 6 person-level requirement contract',
    scriptPath: 'scripts/attorney-workflow-phase6-person-level-requirements.mjs',
    coverage: 'Phase 6 remains green before blocker actions are accepted.',
  },
  {
    key: 'legacy_phase7_triage_actions',
    label: 'Existing attorney Phase 7 triage action verifier',
    scriptPath: 'scripts/verify-attorney-workflow-phase7.mjs',
    coverage: 'Existing follow-up and signing triage actions remain wired.',
  },
]

const staticChecks = [
  {
    key: 'action_resolver',
    label: 'Attorney transaction detail exposes a reusable actionable blocker resolver.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /ATTORNEY_ACTIONABLE_BLOCKER_TARGETS/,
      /function getAttorneyActionableBlockerAction/,
      /function ActionableBlockerButton/,
      /function ActionableBlockerRows/,
      /function handleAttorneyActionableBlocker/,
      /target === 'documents'/,
      /target === 'signing'/,
      /target === 'roleplayers'/,
      /target === 'registration'/,
      /target === 'finance'/,
      /openLegalWorkflowDetail\(detailKey\)/,
    ],
  },
  {
    key: 'unblocker_board_actions',
    label: 'Attorney unblocker board renders actions beside visible facts, documents, signing, and lane blockers.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /function AttorneyRequirementsBoard\(\{[\s\S]*onResolveBlocker = null/,
      /source: 'attorney_unblocker_board'/,
      /source: 'attorney_unblocker_board_count'/,
      /<ActionableBlockerButton[\s\S]*context=\{\{ workflow, sectionKey: section\.key, item \}\}/,
      /onResolveBlocker=\{handleAttorneyActionableBlocker\}/,
    ],
  },
  {
    key: 'workflow_hub_actions',
    label: 'Workflow hub blocker messages include a local action.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /function LegalWorkflowHubCard\(\{ workflow, onOpen, onExecuteAction = null, onResolveBlocker = null \}\)/,
      /source: 'legal_workflow_hub_card'/,
      /context=\{\{ workflow, sectionKey: 'blockers', item: \{ label: workflow\.blockers\[0\] \} \}\}/,
    ],
  },
  {
    key: 'document_readiness_actions',
    label: 'Document readiness blockers open the missing document list from the readiness card.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /source: 'document_readiness'/,
      /ATTORNEY_ACTIONABLE_BLOCKER_TARGETS\.missing_documents/,
      /setActiveDocumentLibraryCategory\(action\.documentFilter\)/,
    ],
  },
  {
    key: 'roleplayer_actions',
    label: 'Roleplayer blockers and stale introductions render action rows.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /const roleplayerActionableBlockers = useMemo/,
      /target: 'send_roleplayer_intro'/,
      /target: 'send_team_handoff'/,
      /Roleplayer Blocker Actions/,
      /rows=\{roleplayerActionableBlockers\}/,
      /openRoleplayerConfirmation\(\)/,
    ],
  },
  {
    key: 'registration_actions',
    label: 'Registration validation blockers include local action and recheck controls.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /source: 'registration_validation'/,
      /ATTORNEY_ACTIONABLE_BLOCKER_TARGETS\.recheck/,
      /void refreshRegistrationValidation\(\)/,
      /Open Registration/,
      /Recheck Requirements/,
    ],
  },
  {
    key: 'package_scripts',
    label: 'Package exposes Phase 7 actionable blocker commands.',
    file: 'package.json',
    patterns: [
      /"test:attorney-workflow-phase7-actionable-blockers":\s*"node scripts\/attorney-workflow-phase7-actionable-blockers\.test\.mjs"/,
      /"verify:attorney-workflow-phase7-actionable-blockers":\s*"node scripts\/attorney-workflow-phase7-actionable-blockers\.mjs"/,
    ],
  },
  {
    key: 'phase7_audit_doc',
    label: 'Attorney Phase 7 audit doc records actionable blocker evidence.',
    file: 'docs/audits/attorney-workflow-phase7-actionable-blockers.md',
    patterns: [
      /# Attorney Workflow Phase 7 Actionable Blockers/,
      /## Goal/,
      /## Implemented/,
      /## Verification/,
      /Decision: GO TO PHASE 8 WITH BLOCKERS ACTIONABLE WHERE THEY APPEAR/,
    ],
  },
  {
    key: 'phase0_contract_updated',
    label: 'Phase 0 contract lists Phase 7 evidence.',
    file: 'docs/audits/attorney-workflow-contract-phase0.md',
    patterns: [
      /Attorney workflow Phase 7 actionable blockers/,
      /Phase 7 \| Make every blocker actionable from the page where it appears\./,
    ],
  },
  {
    key: 'launch_readiness_index',
    label: 'Launch readiness links the Phase 7 audit and verification command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Attorney workflow Phase 7 actionable blockers: `docs\/audits\/attorney-workflow-phase7-actionable-blockers\.md`/,
      /npm run verify:attorney-workflow-phase7-actionable-blockers/,
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
    phase: '7',
    scope: 'attorney-workflow',
    gate: 'actionable-blockers',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Attorney Phase 7 blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      prerequisitePassCount: 0,
      prerequisiteBlockedCount: 0,
    },
    staticChecks: [],
    prerequisites: [],
    acceptance: [
      'Visible workflow blockers have an action beside the blocker text.',
      'Visible document readiness blockers can open the missing document list.',
      'Visible roleplayer blockers can open assignment, intro, or handoff actions.',
      'Visible registration validation blockers can open registration or recheck requirements.',
      'The existing Phase 7 follow-up triage action verifier remains green.',
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
    report.summary.recommendation = 'NO-GO until Attorney Phase 7 blockers are cleared'
  } else if (options.staticOnly || options.skipPrerequisites) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Static Phase 7 actionable blocker contract passed; run full verification before sign-off'
  } else {
    report.summary.status = 'READY'
    report.summary.recommendation = 'GO TO PHASE 8 WITH BLOCKERS ACTIONABLE WHERE THEY APPEAR'
  }
  return report
}

export async function runAttorneyWorkflowPhase7ActionableBlockers(options = {}) {
  const report = createReport(options)
  runStaticChecks(report)
  await runPrerequisites(report, options)
  return finalizeReport(report, options)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = await runAttorneyWorkflowPhase7ActionableBlockers(options)
  console.log(JSON.stringify(report, null, 2))
  if (report.summary.status === 'BLOCKED') process.exitCode = 1
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(JSON.stringify({
      phase: '7',
      scope: 'attorney-workflow',
      gate: 'actionable-blockers',
      summary: {
        status: 'BLOCKED',
        recommendation: 'NO-GO until Attorney Phase 7 blockers are cleared',
      },
      error: error.message,
      stack: error.stack,
    }, null, 2))
    process.exitCode = 1
  })
}
