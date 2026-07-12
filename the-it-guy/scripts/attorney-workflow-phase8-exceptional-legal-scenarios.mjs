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
    key: 'phase7_actionable_blockers',
    label: 'Attorney workflow Phase 7 actionable blocker gate',
    scriptPath: 'scripts/attorney-workflow-phase7-actionable-blockers.mjs',
    coverage: 'Visible blockers remain actionable before exceptional legal scenarios are accepted.',
  },
  {
    key: 'legal_support_boundary',
    label: 'Legal support-boundary regression gate',
    scriptPath: 'scripts/legal-support-boundary-phase1.test.mjs',
    coverage: 'Manual-review and unsupported legal boundaries remain classified by the source resolver.',
  },
  {
    key: 'legacy_phase8_close_loop',
    label: 'Existing attorney Phase 8 close-loop verifier',
    scriptPath: 'scripts/verify-attorney-workflow-phase8.mjs',
    coverage: 'Existing close-loop follow-up action coverage remains green.',
  },
]

const staticChecks = [
  {
    key: 'boundary_resolver',
    label: 'Attorney transaction detail resolves the legal support boundary for the current matter.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /import \{ resolveLegalSupportBoundary \} from '\.\.\/core\/legal\/legalSupportBoundary\.js'/,
      /const legalExceptionBoundary = useMemo/,
      /resolveLegalSupportBoundary\(\{/,
      /sellerOnboardingData/,
      /const legalExceptionReview = useMemo/,
      /buildLegalExceptionReviewModel\(\{/,
    ],
  },
  {
    key: 'exception_model',
    label: 'Exceptional legal states are modelled with explicit supported, manual-review, and unsupported policy.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /function getLegalExceptionTone/,
      /Automation stopped/,
      /Manual review required/,
      /Supported automation/,
      /function getLegalExceptionOwner/,
      /Conveyancer \/ firm principal/,
      /Assigned conveyancer/,
      /function buildLegalExceptionReviewModel/,
      /manualReviewRequired/,
      /unsupported/,
      /showPanel: status !== 'supported' \|\| reviewRows\.length > 0/,
    ],
  },
  {
    key: 'exception_panel',
    label: 'Attorney overview renders a Legal Exception Review panel with stop or pause copy.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /function LegalExceptionReviewPanel/,
      /Legal Exception Review/,
      /Automated progression is stopped until a conveyancer explicitly decides how this matter continues\./,
      /Automated progression is paused for conveyancer review while intake and supporting documents remain visible\./,
      /Boundary Summary/,
      /Operational Owner/,
      /Review Boundary Docs/,
      /Add Review Note/,
      /workspaceRole === 'attorney' && activeWorkspaceMenu === 'overview'/,
      /<LegalExceptionReviewPanel/,
      /model=\{legalExceptionReview\}/,
      /onManageOwner=\{openRoleplayerConfirmation\}/,
    ],
  },
  {
    key: 'exception_actions',
    label: 'Legal exception actions route to roleplayer ownership, boundary documents, and internal review notes.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /function handleOpenLegalExceptionDocuments/,
      /setActiveDocumentLibraryCategory\(legalExceptionReview\?\.unsupported \? 'missing' : 'critical'\)/,
      /openWorkspaceMenu\('documents'\)/,
      /function handleDraftLegalExceptionReviewNote/,
      /setDiscussionType\('internal_note'\)/,
      /setDiscussionVisibility\('internal'\)/,
      /setDiscussionActionKey\('quick_internal_note'\)/,
      /Legal exception review required\./,
      /openWorkspaceMenu\('activity'\)/,
      /onOpenDocuments=\{handleOpenLegalExceptionDocuments\}/,
      /onDraftReviewNote=\{handleDraftLegalExceptionReviewNote\}/,
    ],
  },
  {
    key: 'legal_boundary_fixture_coverage',
    label: 'Legal support-boundary tests cover manual review and unsupported stop requirements.',
    file: 'scripts/legal-support-boundary-phase1.test.mjs',
    patterns: [
      /manual_review/,
      /unsupported/,
      /legal_support_boundary_review/,
      /legal_support_boundary_stop/,
      /foreign_purchaser/,
      /tx-foreign-cash/,
      /business rescue/i,
    ],
  },
  {
    key: 'package_scripts',
    label: 'Package exposes Phase 8 exceptional legal scenario commands.',
    file: 'package.json',
    patterns: [
      /"test:attorney-workflow-phase8-exceptional-legal-scenarios":\s*"node scripts\/attorney-workflow-phase8-exceptional-legal-scenarios\.test\.mjs"/,
      /"verify:attorney-workflow-phase8-exceptional-legal-scenarios":\s*"node scripts\/attorney-workflow-phase8-exceptional-legal-scenarios\.mjs"/,
    ],
  },
  {
    key: 'phase8_audit_doc',
    label: 'Attorney Phase 8 audit doc records exceptional legal scenario ownership evidence.',
    file: 'docs/audits/attorney-workflow-phase8-exceptional-legal-scenarios.md',
    patterns: [
      /# Attorney Workflow Phase 8 Exceptional Legal Scenarios/,
      /## Goal/,
      /## Implemented/,
      /## Verification/,
      /Decision: GO TO PHASE 9 WITH EXCEPTIONAL LEGAL SCENARIOS OWNED/,
    ],
  },
  {
    key: 'phase0_contract_updated',
    label: 'Phase 0 contract closes B-ATTY-0-7 and lists Phase 8 evidence.',
    file: 'docs/audits/attorney-workflow-contract-phase0.md',
    patterns: [
      /Attorney workflow Phase 8 exceptional legal scenarios/,
      /npm run verify:attorney-workflow-phase8-exceptional-legal-scenarios/,
      /B-ATTY-0-7 \| Closed \| Attorney Operations \| Manual-review and unsupported branches surface explicit operational ownership, pause\/stop policy, and review actions\. \| Phase 8/,
    ],
  },
  {
    key: 'readiness_indexes',
    label: 'Launch readiness and prior phase docs link the Phase 8 audit and command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Attorney workflow Phase 8 exceptional legal scenarios: `docs\/audits\/attorney-workflow-phase8-exceptional-legal-scenarios\.md`/,
      /npm run verify:attorney-workflow-phase8-exceptional-legal-scenarios/,
    ],
  },
  {
    key: 'phase3_and_phase7_links',
    label: 'Phase 3 and Phase 7 docs no longer leave exceptional ownership as an open attorney workflow gap.',
    file: 'docs/audits/attorney-workflow-phase7-actionable-blockers.md',
    patterns: [
      /Phase 8 exceptional legal scenario ownership is implemented in `docs\/audits\/attorney-workflow-phase8-exceptional-legal-scenarios\.md`/,
    ],
    pairedFiles: [
      {
        file: 'docs/audits/attorney-workflow-phase3-launch-gate.md',
        patterns: [
          /Phase 8 exceptional legal scenario ownership is implemented in `docs\/audits\/attorney-workflow-phase8-exceptional-legal-scenarios\.md`/,
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
    phase: '8',
    scope: 'attorney-workflow',
    gate: 'exceptional-legal-scenarios',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Attorney Phase 8 exceptional legal scenario handling is complete',
      staticPassCount: 0,
      staticBlockedCount: 0,
      prerequisitePassCount: 0,
      prerequisiteBlockedCount: 0,
    },
    staticChecks: [],
    prerequisites: [],
    acceptance: [
      'Manual-review legal scenarios show a visible pause policy in the attorney overview.',
      'Unsupported legal scenarios show a visible stop policy in the attorney overview.',
      'The operational owner is visible and can be assigned or managed.',
      'Boundary documents can be opened directly from the exception panel.',
      'The attorney can draft an internal legal exception review note from the panel.',
      'B-ATTY-0-7 is closed in the Phase 0 contract.',
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
    report.summary.recommendation = 'NO-GO until Attorney Phase 8 exceptional legal scenario handling is complete'
  } else if (options.staticOnly || options.skipPrerequisites) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Static Phase 8 exceptional legal scenario contract passed; run full verification before sign-off'
  } else {
    report.summary.status = 'READY'
    report.summary.recommendation = 'GO TO PHASE 9 WITH EXCEPTIONAL LEGAL SCENARIOS OWNED'
  }
  return report
}

export async function runAttorneyWorkflowPhase8ExceptionalLegalScenarios(options = {}) {
  const report = createReport(options)
  runStaticChecks(report)
  await runPrerequisites(report, options)
  return finalizeReport(report, options)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = await runAttorneyWorkflowPhase8ExceptionalLegalScenarios(options)
  console.log(JSON.stringify(report, null, 2))
  if (report.summary.status === 'BLOCKED') process.exitCode = 1
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(JSON.stringify({
      phase: '8',
      scope: 'attorney-workflow',
      gate: 'exceptional-legal-scenarios',
      summary: {
        status: 'BLOCKED',
        recommendation: 'NO-GO until Attorney Phase 8 exceptional legal scenario handling is complete',
      },
      error: error.message,
      stack: error.stack,
    }, null, 2))
    process.exitCode = 1
  })
}
