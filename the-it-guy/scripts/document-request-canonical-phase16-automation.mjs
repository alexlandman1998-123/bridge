import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const PHASE = 'document_request_phase16_automation'
const PHASE15_SCRIPT = 'scripts/document-request-canonical-phase15-operational-rollout.mjs'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase16-automation.json'
const DEFAULT_ROLLOUT_OUTPUT_PATH = 'output/document-request-phase16-operational-rollout.json'
const DEFAULT_PORTAL_OUTPUT_PATH = 'output/document-request-phase16-portal-verification.json'
const DEFAULT_LIMIT = 10
const MAX_AUTOMATION_TRANSACTIONS = 25
const DEFAULT_TIMEOUT_MS = 240000

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    commit: false,
    confirmAutomation: false,
    allowLegacyKeys: false,
    allowLargeRollout: false,
    schedulingEnabled: false,
    source: 'manual',
    output: DEFAULT_OUTPUT_PATH,
    rolloutOutput: DEFAULT_ROLLOUT_OUTPUT_PATH,
    portalOutput: DEFAULT_PORTAL_OUTPUT_PATH,
    transactionIds: [],
    limit: DEFAULT_LIMIT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }

  for (const arg of argv) {
    if (arg === '--commit') options.commit = true
    else if (arg === '--dry-run') options.commit = false
    else if (arg === '--confirm-automation') options.confirmAutomation = true
    else if (arg === '--allow-legacy-keys') options.allowLegacyKeys = true
    else if (arg === '--allow-large-rollout') options.allowLargeRollout = true
    else if (arg === '--scheduling-enabled') options.schedulingEnabled = true
    else if (arg.startsWith('--source=')) options.source = arg.slice('--source='.length) || options.source
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length)) || DEFAULT_LIMIT
    else if (arg.startsWith('--timeout-ms=')) options.timeoutMs = Number(arg.slice('--timeout-ms='.length)) || DEFAULT_TIMEOUT_MS
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    else if (arg.startsWith('--rollout-output=')) options.rolloutOutput = arg.slice('--rollout-output='.length)
    else if (arg.startsWith('--portal-output=')) options.portalOutput = arg.slice('--portal-output='.length)
    else if (arg.startsWith('--transaction-ids=')) {
      options.transactionIds.push(
        ...arg
          .slice('--transaction-ids='.length)
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      )
    }
  }

  options.transactionIds = [...new Set(options.transactionIds)]
  options.limit = Math.max(1, Math.min(options.limit, MAX_AUTOMATION_TRANSACTIONS))
  options.timeoutMs = Math.max(1000, Math.min(Math.round(options.timeoutMs), DEFAULT_TIMEOUT_MS))
  return options
}

function assertOptions(options = {}) {
  if (options.commit && options.confirmAutomation !== true) {
    throw new Error('Automated document request writes require --confirm-automation.')
  }
  if (options.allowLargeRollout !== true && options.transactionIds.length > MAX_AUTOMATION_TRANSACTIONS) {
    throw new Error(`Phase 16 automation is limited to ${MAX_AUTOMATION_TRANSACTIONS} transactions by default.`)
  }
}

function addJsonSuffix(filePath, suffix) {
  const extension = path.extname(filePath)
  const stem = extension ? filePath.slice(0, -extension.length) : filePath
  return `${stem}${suffix}${extension || '.json'}`
}

function phase15Args(options, paths, commit = false) {
  const args = [
    PHASE15_SCRIPT,
    `--limit=${options.limit}`,
    `--output=${paths.rolloutOutput}`,
    `--portal-output=${paths.portalOutput}`,
  ]
  if (options.transactionIds.length) args.push(`--transaction-ids=${options.transactionIds.join(',')}`)
  if (options.allowLargeRollout) args.push('--allow-large-rollout')
  if (commit) args.push('--commit', '--confirm-operational-rollout')
  return args
}

async function runPhase15(options, paths, commit = false) {
  await mkdir(path.dirname(paths.rolloutOutput), { recursive: true })
  await mkdir(path.dirname(paths.portalOutput), { recursive: true })
  await execFileAsync(process.execPath, phase15Args(options, paths, commit), {
    cwd: process.cwd(),
    timeout: options.timeoutMs,
    maxBuffer: 1024 * 1024 * 32,
  })
  return JSON.parse(await readFile(paths.rolloutOutput, 'utf8'))
}

function numberFrom(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function evaluateReadiness(rolloutReport = {}, options = {}) {
  const summary = rolloutReport.summary || {}
  const portalSummary = rolloutReport.portalVerification?.summary || {}
  const blockedReasons = []
  const reviewReasons = []
  const legacyKeyCount = numberFrom(portalSummary.nonCanonicalExistingKeys)

  if (numberFrom(summary.total) === 0) blockedReasons.push('no_candidate_transactions')
  if (numberFrom(summary.failed) > 0) blockedReasons.push('rollout_failures_present')
  if (summary.gatePassed !== true) blockedReasons.push('phase15_gate_failed')
  if (summary.documentRequestsCreated === true || numberFrom(summary.documentRequestsDelta) > 0) {
    blockedReasons.push('legacy_document_requests_would_change')
  }
  if (numberFrom(summary.preservedRowsChanged) > 0) blockedReasons.push('preserved_upload_or_review_rows_would_change')
  if (numberFrom(summary.portalVerificationFailed) > 0) blockedReasons.push('portal_verification_failures_present')
  if (numberFrom(summary.portalMissingCommittedKeys) > 0) blockedReasons.push('portal_missing_committed_keys')
  if (portalSummary.documentRequestsCreated === true) blockedReasons.push('portal_legacy_document_requests_present')
  if (legacyKeyCount > 0 && options.allowLegacyKeys !== true) blockedReasons.push('legacy_non_canonical_keys_present')
  if (numberFrom(summary.warnings) > 0) reviewReasons.push('rollout_warnings_present')

  return {
    rolloutGatePassed: summary.gatePassed === true,
    commitEligible: blockedReasons.length === 0,
    readyForScheduledAutomation: blockedReasons.length === 0 && reviewReasons.length === 0,
    allowLegacyKeys: options.allowLegacyKeys === true,
    legacyNonCanonicalKeyCount: legacyKeyCount,
    blockedReasons,
    reviewReasons,
  }
}

function reportSummary({ status, activeRollout, preflightRollout, commitRollout, readiness, options }) {
  const rollout = activeRollout || commitRollout || preflightRollout || {}
  const summary = rollout.summary || {}
  return {
    status,
    source: options.source,
    total: numberFrom(summary.total),
    completed: numberFrom(summary.completed),
    failed: numberFrom(summary.failed),
    warnings: numberFrom(summary.warnings),
    rowsCalculated: numberFrom(summary.rowsCalculated),
    synced: numberFrom(summary.synced),
    requiredDocumentRowsDelta: numberFrom(summary.requiredDocumentRowsDelta),
    documentRequestsDelta: summary.documentRequestsDelta ?? null,
    documentRequestsCreated: summary.documentRequestsCreated ?? null,
    preservedRowsChanged: numberFrom(summary.preservedRowsChanged),
    portalVerificationFailed: numberFrom(summary.portalVerificationFailed),
    portalMissingCommittedKeys: numberFrom(summary.portalMissingCommittedKeys),
    legacyNonCanonicalKeyCount: readiness.legacyNonCanonicalKeyCount,
    readyForScheduledAutomation: readiness.readyForScheduledAutomation,
    commitEligible: readiness.commitEligible,
    wroteRows: summary.wroteRows === true,
    blockedReasons: readiness.blockedReasons,
    reviewReasons: readiness.reviewReasons,
  }
}

async function writeReport(output, report) {
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
}

async function run() {
  const options = parseArgs()
  assertOptions(options)

  const generatedAt = new Date().toISOString()
  const dryRun = options.commit !== true
  let status = 'dry_run_completed'
  let activeRollout = null
  let preflightRollout = null
  let commitRollout = null
  let readiness = null

  if (dryRun) {
    activeRollout = await runPhase15(options, {
      rolloutOutput: options.rolloutOutput,
      portalOutput: options.portalOutput,
    }, false)
    readiness = evaluateReadiness(activeRollout, options)
  } else {
    preflightRollout = await runPhase15(options, {
      rolloutOutput: addJsonSuffix(options.rolloutOutput, '-preflight'),
      portalOutput: addJsonSuffix(options.portalOutput, '-preflight'),
    }, false)
    readiness = evaluateReadiness(preflightRollout, options)
    if (!readiness.commitEligible) {
      status = 'blocked'
    } else {
      commitRollout = await runPhase15(options, {
        rolloutOutput: options.rolloutOutput,
        portalOutput: options.portalOutput,
      }, true)
      activeRollout = commitRollout
      readiness = evaluateReadiness(commitRollout, options)
      status = readiness.commitEligible ? 'commit_completed' : 'commit_completed_with_gate_warning'
    }
  }

  const report = {
    phase: PHASE,
    generatedAt,
    dryRun,
    commitRequested: options.commit === true,
    commitExecuted: Boolean(commitRollout),
    confirmAutomation: options.confirmAutomation,
    mutatedData: Boolean(commitRollout?.summary?.wroteRows),
    schedulingEnabled: options.schedulingEnabled === true,
    automation: {
      source: options.source,
      limit: options.limit,
      explicitTransactionIds: options.transactionIds.length > 0,
      transactionIds: options.transactionIds,
      timeoutMs: options.timeoutMs,
      schedule: options.schedulingEnabled ? '30 1 * * *' : null,
      dryRunDefault: true,
      requiresCommitFlag: true,
      requiresConfirmAutomation: true,
      blocksLegacyNonCanonicalKeysByDefault: true,
    },
    readiness,
    summary: reportSummary({ status, activeRollout, preflightRollout, commitRollout, readiness, options }),
    rollout: activeRollout
      ? {
          output: options.rolloutOutput,
          portalOutput: options.portalOutput,
          summary: activeRollout.summary,
          selection: activeRollout.selection,
          transactionIds: activeRollout.transactionIds,
          portalVerification: activeRollout.portalVerification,
        }
      : null,
    preflight: preflightRollout
      ? {
          output: addJsonSuffix(options.rolloutOutput, '-preflight'),
          portalOutput: addJsonSuffix(options.portalOutput, '-preflight'),
          summary: preflightRollout.summary,
          selection: preflightRollout.selection,
          transactionIds: preflightRollout.transactionIds,
          portalVerification: preflightRollout.portalVerification,
        }
      : null,
  }

  await writeReport(options.output, report)
  console.log(JSON.stringify(report, null, 2))
  if (options.commit && !report.commitExecuted) process.exitCode = 2
}

run().catch((error) => {
  console.error(error?.stack || error?.message || error)
  process.exitCode = 1
})
