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
    key: 'phase5_signing_appointments',
    label: 'Attorney workflow Phase 5 signing appointment contract',
    scriptPath: 'scripts/attorney-workflow-phase5-signing-appointments.mjs',
    coverage: 'Phase 5 remains green before Phase 6 person-level requirement UX is accepted.',
  },
  {
    key: 'legal_requirement_cardinality',
    label: 'Legal requirement cardinality for directors and trustees',
    scriptPath: 'scripts/legal-requirement-cardinality-phase2.test.mjs',
    coverage: 'Director and trustee requirements still expand to one row per person.',
  },
  {
    key: 'legal_beneficial_ownership',
    label: 'Legal beneficial-owner requirement cardinality',
    scriptPath: 'scripts/legal-beneficial-ownership-phase3.test.mjs',
    coverage: 'Beneficial-owner person-level requirements still expand for buyer and seller legal entities.',
  },
]

const staticChecks = [
  {
    key: 'transaction_detail_person_level_view_model',
    label: 'Attorney transaction detail derives person-level requirement rows from required documents.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /PERSON_LEVEL_REQUIREMENT_GROUPS/,
      /buildPersonLevelRequirementRows/,
      /summarizePersonLevelRequirementRows/,
      /personLevelRequirementRows/,
      /personLevelRequirementSummary/,
    ],
  },
  {
    key: 'transaction_detail_person_level_categories',
    label: 'Person-level UX covers directors, trustees, spouses, co-owners, signatories, and beneficial owners.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /key: 'director'/,
      /key: 'trustee'/,
      /key: 'spouse'/,
      /key: 'co_owner'/,
      /key: 'signatory'/,
      /key: 'beneficial_owner'/,
      /Directors, trustees, spouses, co-owners, signatories, and beneficial owners/,
    ],
  },
  {
    key: 'transaction_detail_person_level_panel',
    label: 'Documents workspace renders the person-level requirements panel with upload and review actions.',
    file: 'src/pages/AttorneyTransactionDetail.jsx',
    patterns: [
      /function PersonLevelRequirementsPanel/,
      /Person-Level Requirements/,
      /onUploadRequirement/,
      /getPersonLevelRequirementAction/,
      /openDocumentUploadModal\(\{ requirement \}\)/,
      /setActiveDocumentLibraryCategory\('missing'\)/,
      /getDocumentCommandStatusTone\(requirement\.status\)/,
    ],
  },
  {
    key: 'package_scripts',
    label: 'Package exposes Phase 6 person-level requirement commands.',
    file: 'package.json',
    patterns: [
      /"test:attorney-workflow-phase6-person-level-requirements":\s*"node scripts\/attorney-workflow-phase6-person-level-requirements\.test\.mjs"/,
      /"verify:attorney-workflow-phase6-person-level-requirements":\s*"node scripts\/attorney-workflow-phase6-person-level-requirements\.mjs"/,
    ],
  },
  {
    key: 'phase6_audit_doc',
    label: 'Attorney Phase 6 audit doc records person-level requirement UX evidence.',
    file: 'docs/audits/attorney-workflow-phase6-person-level-requirements.md',
    patterns: [
      /# Attorney Workflow Phase 6 Person-Level Requirements/,
      /## Goal/,
      /## Implemented/,
      /## Verification/,
      /Decision: GO TO PHASE 7 WITH PERSON-LEVEL REQUIREMENTS VISIBLE/,
    ],
  },
  {
    key: 'phase0_contract_updated',
    label: 'Phase 0 contract closes B-ATTY-0-6 and lists Phase 6 evidence.',
    file: 'docs/audits/attorney-workflow-contract-phase0.md',
    patterns: [
      /Attorney workflow Phase 6 person-level requirements/,
      /\| B-ATTY-0-6 \| Closed \| Attorney UX \/ Legal Docs \| Person-level director, trustee, spouse, co-owner, signatory, and beneficial-owner requirements are surfaced in attorney transaction UI\. \| Phase 6 \|/,
    ],
  },
  {
    key: 'launch_readiness_index',
    label: 'Launch readiness links the Phase 6 audit and verification command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Attorney workflow Phase 6 person-level requirements: `docs\/audits\/attorney-workflow-phase6-person-level-requirements\.md`/,
      /npm run verify:attorney-workflow-phase6-person-level-requirements/,
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
    phase: '6',
    scope: 'attorney-workflow',
    gate: 'person-level-requirements',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Attorney Phase 6 blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      prerequisitePassCount: 0,
      prerequisiteBlockedCount: 0,
    },
    staticChecks: [],
    prerequisites: [],
    acceptance: [
      'Attorney transaction detail shows person-level requirement rows in the Documents workspace.',
      'Director, trustee, spouse, co-owner, signatory, and beneficial-owner categories are explicit.',
      'Rows remain grouped by person instead of being hidden as aggregate legal-entity requirements.',
      'Open person-level requirements can launch the existing upload workflow.',
      'Legal cardinality tests remain green for multi-director, multi-trustee, and beneficial-owner cases.',
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
    report.summary.recommendation = 'NO-GO until Attorney Phase 6 blockers are cleared'
  } else if (options.staticOnly || options.skipPrerequisites) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Static Phase 6 person-level requirement contract passed; run full verification before sign-off'
  } else {
    report.summary.status = 'READY'
    report.summary.recommendation = 'GO TO PHASE 7 WITH PERSON-LEVEL REQUIREMENTS VISIBLE'
  }
  return report
}

export async function runAttorneyWorkflowPhase6PersonLevelRequirements(options = {}) {
  const report = createReport(options)
  runStaticChecks(report)
  await runPrerequisites(report, options)
  return finalizeReport(report, options)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = await runAttorneyWorkflowPhase6PersonLevelRequirements(options)
  console.log(JSON.stringify(report, null, 2))
  if (report.summary.status === 'BLOCKED') process.exitCode = 1
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(JSON.stringify({
      phase: '6',
      scope: 'attorney-workflow',
      gate: 'person-level-requirements',
      summary: {
        status: 'BLOCKED',
        recommendation: 'NO-GO until Attorney Phase 6 blockers are cleared',
      },
      error: error.message,
      stack: error.stack,
    }, null, 2))
    process.exitCode = 1
  })
}
