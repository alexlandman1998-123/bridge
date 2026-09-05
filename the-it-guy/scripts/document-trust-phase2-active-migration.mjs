import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const PHASE = 'document_trust_phase2_active_migration'
const PHASE17_SCRIPT = 'scripts/document-request-canonical-phase17-legacy-key-cleanup.mjs'
const DEFAULT_OUTPUT_PATH = 'output/document-trust-phase2-active-migration.json'
const DEFAULT_CLEANUP_OUTPUT_PATH = 'output/document-trust-phase2-active-migration-cleanup.json'
const MAX_ACTIVE_TRANSACTION_BATCH = 25

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    commit: false,
    confirmPhase2ActiveMigration: false,
    allowLargeBatch: false,
    limit: 10,
    transactionIds: [],
    output: DEFAULT_OUTPUT_PATH,
    cleanupOutput: DEFAULT_CLEANUP_OUTPUT_PATH,
  }
  for (const arg of argv) {
    if (arg === '--commit') options.commit = true
    else if (arg === '--dry-run') options.commit = false
    else if (arg === '--confirm-phase2-active-migration') options.confirmPhase2ActiveMigration = true
    else if (arg === '--allow-large-batch') options.allowLargeBatch = true
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length)) || options.limit
    else if (arg.startsWith('--transaction-ids=')) {
      options.transactionIds.push(...arg.slice('--transaction-ids='.length).split(',').map((value) => value.trim()).filter(Boolean))
    } else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    else if (arg.startsWith('--cleanup-output=')) options.cleanupOutput = arg.slice('--cleanup-output='.length)
  }
  options.transactionIds = [...new Set(options.transactionIds)]
  options.limit = Math.max(1, Math.min(options.limit, MAX_ACTIVE_TRANSACTION_BATCH))
  return options
}

function assertOptions(options) {
  if (options.commit && !options.confirmPhase2ActiveMigration) {
    throw new Error('Phase 2 writes require --confirm-phase2-active-migration.')
  }
  if (!options.allowLargeBatch && options.transactionIds.length > MAX_ACTIVE_TRANSACTION_BATCH) {
    throw new Error(`Phase 2 is limited to ${MAX_ACTIVE_TRANSACTION_BATCH} active transactions by default.`)
  }
}

function buildReviewQueue(cleanup = {}) {
  return (cleanup.skippedRows || []).map((row) => ({
    transactionId: row.transactionId,
    legacyRequiredDocumentId: row.id,
    documentKey: row.documentKey,
    reason: row.reason || 'manual_review_required',
    action: 'Preserve the evidence and map or resolve this row manually; do not disable it automatically.',
  }))
}

function buildReport(cleanup, options) {
  const precheckSummary = cleanup.precheck?.rollout?.summary || {}
  const portalSummary = cleanup.precheck?.portalVerification?.summary || {}
  const reviewQueue = buildReviewQueue(cleanup)
  const postcheckSummary = cleanup.postcheck?.summary || {}
  const parityPassed = Number(portalSummary.missingCommittedKeysFromSharedPortal || 0) === 0
  const noUnexpectedWrites = cleanup.strategy?.deletesRows === false && cleanup.strategy?.writesDocumentRequests === false
  const updateFailures = Number(cleanup.summary?.failedUpdates || 0)
  const commitVerified = options.commit !== true || (
    updateFailures === 0 &&
    Number(postcheckSummary.legacyNonCanonicalKeyCount || 0) === 0 &&
    postcheckSummary.readyForScheduledAutomation === true
  )
  const checks = [
    { key: 'canonical_parity_before_cleanup', ok: parityPassed },
    { key: 'cleanup_is_disable_hide_only', ok: noUnexpectedWrites },
    { key: 'eligible_row_updates_succeeded', ok: updateFailures === 0 },
    { key: 'review_queue_is_empty_before_commit', ok: options.commit !== true || reviewQueue.length === 0 },
    { key: 'postcheck_confirms_no_active_legacy_keys', ok: commitVerified },
  ]
  const failed = checks.filter((check) => !check.ok)
  return {
    phase: PHASE,
    version: 'document_trust_phase2_active_migration_v1',
    generatedAt: new Date().toISOString(),
    dryRun: options.commit !== true,
    commit: options.commit,
    mutatedData: cleanup.mutatedData === true,
    scope: {
      maxTransactions: MAX_ACTIVE_TRANSACTION_BATCH,
      transactionIds: cleanup.precheck?.transactionIds || [],
      explicitTransactionIds: options.transactionIds.length > 0,
    },
    canonicalParity: {
      requiredDocumentRows: Number(precheckSummary.requiredDocumentRows || 0),
      missingCommittedKeysFromSharedPortal: Number(portalSummary.missingCommittedKeysFromSharedPortal || 0),
      passed: parityPassed,
    },
    cleanup: {
      eligibleRows: Number(cleanup.summary?.eligibleCleanupRows || 0),
      skippedRows: Number(cleanup.summary?.skippedRows || 0),
      rowsUpdated: Number(cleanup.summary?.rowsUpdated || 0),
      failedUpdates: updateFailures,
      deletesRows: cleanup.strategy?.deletesRows === true,
      writesDocumentRequests: cleanup.strategy?.writesDocumentRequests === true,
    },
    reviewQueue,
    postcheck: options.commit
      ? {
          legacyNonCanonicalKeyCount: Number(postcheckSummary.legacyNonCanonicalKeyCount || 0),
          readyForScheduledAutomation: postcheckSummary.readyForScheduledAutomation === true,
        }
      : null,
    gate: {
      status: failed.length ? 'blocked' : options.commit ? 'active_transaction_migration_complete' : 'active_transaction_migration_dry_run_ready',
      ok: failed.length === 0,
      readyForCommit: failed.length === 0 && reviewQueue.length === 0,
      mayProceedToPhase3: options.commit === true && failed.length === 0,
      checks,
      failed,
    },
  }
}

async function main() {
  const options = parseArgs()
  assertOptions(options)
  const buildArgs = ({ commit, output }) => [
    PHASE17_SCRIPT,
    `--limit=${options.limit}`,
    `--output=${output}`,
    ...(commit ? ['--commit', '--confirm-legacy-cleanup'] : ['--dry-run']),
    ...(options.transactionIds.length ? [`--transaction-ids=${options.transactionIds.join(',')}`] : []),
    ...(options.allowLargeBatch ? ['--allow-large-cleanup'] : []),
  ]
  const preflightOutput = options.commit ? `${options.cleanupOutput}.preflight.json` : options.cleanupOutput
  await mkdir(path.dirname(preflightOutput), { recursive: true })
  await execFileAsync(process.execPath, buildArgs({ commit: false, output: preflightOutput }), {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 32,
  })
  let cleanup = JSON.parse(await readFile(preflightOutput, 'utf8'))

  if (options.commit) {
    const preflight = buildReport(cleanup, { ...options, commit: false })
    if (!preflight.canonicalParity.passed || preflight.reviewQueue.length > 0 || preflight.cleanup.failedUpdates > 0) {
      throw new Error('Phase 2 commit is blocked by failed canonical parity or a non-empty review queue. Resolve the dry-run report first.')
    }
    await mkdir(path.dirname(options.cleanupOutput), { recursive: true })
    await execFileAsync(process.execPath, buildArgs({ commit: true, output: options.cleanupOutput }), {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 32,
    })
    cleanup = JSON.parse(await readFile(options.cleanupOutput, 'utf8'))
  }
  const report = buildReport(cleanup, options)
  await mkdir(path.dirname(options.output), { recursive: true })
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({
    phase: report.phase,
    status: report.gate.status,
    output: options.output,
    dryRun: report.dryRun,
    eligibleRows: report.cleanup.eligibleRows,
    reviewQueue: report.reviewQueue.length,
    failedChecks: report.gate.failed.length,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error)
  process.exitCode = 1
})
