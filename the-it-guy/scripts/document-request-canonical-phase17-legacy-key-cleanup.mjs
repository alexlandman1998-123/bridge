import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const execFileAsync = promisify(execFile)

const PHASE = 'document_request_phase17_legacy_key_cleanup'
const PHASE15_SCRIPT = 'scripts/document-request-canonical-phase15-operational-rollout.mjs'
const PHASE16_SCRIPT = 'scripts/document-request-canonical-phase16-automation.mjs'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase17-legacy-key-cleanup.json'
const DEFAULT_PRECHECK_ROLLOUT_OUTPUT_PATH = 'output/document-request-phase17-precheck-operational-rollout.json'
const DEFAULT_PRECHECK_PORTAL_OUTPUT_PATH = 'output/document-request-phase17-precheck-portal-verification.json'
const DEFAULT_POSTCHECK_AUTOMATION_OUTPUT_PATH = 'output/document-request-phase17-postcheck-automation.json'
const DEFAULT_POSTCHECK_ROLLOUT_OUTPUT_PATH = 'output/document-request-phase17-postcheck-operational-rollout.json'
const DEFAULT_POSTCHECK_PORTAL_OUTPUT_PATH = 'output/document-request-phase17-postcheck-portal-verification.json'
const DEFAULT_LIMIT = 10
const MAX_LEGACY_CLEANUP_TRANSACTIONS = 25
const DEFAULT_TIMEOUT_MS = 240000
const PRESERVED_REQUIRED_DOCUMENT_STATUSES = new Set([
  'uploaded',
  'under_review',
  'accepted',
  'approved',
  'completed',
  'reupload_required',
  'rejected',
])

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        const key = line.slice(0, index).trim()
        let value = line.slice(index + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        return [key, value]
      }),
  )
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    commit: false,
    confirmLegacyCleanup: false,
    skipPostcheck: false,
    allowLargeCleanup: false,
    limit: DEFAULT_LIMIT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    output: DEFAULT_OUTPUT_PATH,
    precheckRolloutOutput: DEFAULT_PRECHECK_ROLLOUT_OUTPUT_PATH,
    precheckPortalOutput: DEFAULT_PRECHECK_PORTAL_OUTPUT_PATH,
    postcheckAutomationOutput: DEFAULT_POSTCHECK_AUTOMATION_OUTPUT_PATH,
    postcheckRolloutOutput: DEFAULT_POSTCHECK_ROLLOUT_OUTPUT_PATH,
    postcheckPortalOutput: DEFAULT_POSTCHECK_PORTAL_OUTPUT_PATH,
    transactionIds: [],
  }

  for (const arg of argv) {
    if (arg === '--commit') options.commit = true
    else if (arg === '--dry-run') options.commit = false
    else if (arg === '--confirm-legacy-cleanup') options.confirmLegacyCleanup = true
    else if (arg === '--skip-postcheck') options.skipPostcheck = true
    else if (arg === '--allow-large-cleanup') options.allowLargeCleanup = true
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length)) || DEFAULT_LIMIT
    else if (arg.startsWith('--timeout-ms=')) options.timeoutMs = Number(arg.slice('--timeout-ms='.length)) || DEFAULT_TIMEOUT_MS
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    else if (arg.startsWith('--precheck-rollout-output=')) options.precheckRolloutOutput = arg.slice('--precheck-rollout-output='.length)
    else if (arg.startsWith('--precheck-portal-output=')) options.precheckPortalOutput = arg.slice('--precheck-portal-output='.length)
    else if (arg.startsWith('--postcheck-automation-output=')) {
      options.postcheckAutomationOutput = arg.slice('--postcheck-automation-output='.length)
    } else if (arg.startsWith('--postcheck-rollout-output=')) {
      options.postcheckRolloutOutput = arg.slice('--postcheck-rollout-output='.length)
    } else if (arg.startsWith('--postcheck-portal-output=')) {
      options.postcheckPortalOutput = arg.slice('--postcheck-portal-output='.length)
    } else if (arg.startsWith('--transaction-ids=')) {
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
  options.limit = Math.max(1, Math.min(options.limit, MAX_LEGACY_CLEANUP_TRANSACTIONS))
  options.timeoutMs = Math.max(1000, Math.min(Math.round(options.timeoutMs), DEFAULT_TIMEOUT_MS))
  return options
}

function assertOptions(options = {}) {
  if (options.commit && options.confirmLegacyCleanup !== true) {
    throw new Error('Legacy key cleanup writes require --confirm-legacy-cleanup.')
  }
  if (options.allowLargeCleanup !== true && options.transactionIds.length > MAX_LEGACY_CLEANUP_TRANSACTIONS) {
    throw new Error(`Phase 17 legacy cleanup is limited to ${MAX_LEGACY_CLEANUP_TRANSACTIONS} transactions by default.`)
  }
}

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function hasPreservedState(row = {}) {
  const status = normalizeKey(row.status)
  return (
    PRESERVED_REQUIRED_DOCUMENT_STATUSES.has(status) ||
    row.is_uploaded === true ||
    Boolean(row.uploaded_document_id) ||
    Boolean(row.uploaded_at) ||
    Boolean(row.verified_at) ||
    Boolean(row.rejected_at)
  )
}

function isActivePortalAffectingRow(row = {}) {
  const visibility = normalizeKey(row.visibility_scope || 'client')
  const status = normalizeKey(row.status || '')
  return (
    row.is_required !== false &&
    row.enabled !== false &&
    !['internal', 'internal_only'].includes(visibility) &&
    status !== 'not_required'
  )
}

function groupNonCanonicalKeys(portalReport = {}) {
  const byTransaction = new Map()
  for (const result of portalReport.results || []) {
    const transactionId = String(result.transactionId || '').trim()
    if (!transactionId) continue
    byTransaction.set(transactionId, new Set((result.nonCanonicalExistingKeys || []).map(normalizeKey).filter(Boolean)))
  }
  return byTransaction
}

function compactRow(row = {}) {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    documentKey: row.document_key,
    documentLabel: row.document_label,
    status: row.status,
    isRequired: row.is_required,
    enabled: row.enabled,
    visibilityScope: row.visibility_scope,
    requiredFromRole: row.required_from_role,
    isUploaded: row.is_uploaded === true,
    uploadedDocumentId: row.uploaded_document_id || null,
  }
}

async function runPhase15Precheck(options) {
  await mkdir(path.dirname(options.precheckRolloutOutput), { recursive: true })
  await mkdir(path.dirname(options.precheckPortalOutput), { recursive: true })
  const args = [
    PHASE15_SCRIPT,
    `--limit=${options.limit}`,
    `--output=${options.precheckRolloutOutput}`,
    `--portal-output=${options.precheckPortalOutput}`,
  ]
  if (options.transactionIds.length) args.push(`--transaction-ids=${options.transactionIds.join(',')}`)
  if (options.allowLargeCleanup) args.push('--allow-large-rollout')
  await execFileAsync(process.execPath, args, {
    cwd: process.cwd(),
    timeout: options.timeoutMs,
    maxBuffer: 1024 * 1024 * 32,
  })
  return {
    rollout: JSON.parse(await readFile(options.precheckRolloutOutput, 'utf8')),
    portal: JSON.parse(await readFile(options.precheckPortalOutput, 'utf8')),
  }
}

async function runPhase16Postcheck(options) {
  if (options.skipPostcheck) return null
  await mkdir(path.dirname(options.postcheckAutomationOutput), { recursive: true })
  await execFileAsync(process.execPath, [
    PHASE16_SCRIPT,
    '--source=phase17_postcheck',
    `--limit=${options.limit}`,
    `--timeout-ms=${options.timeoutMs}`,
    `--output=${options.postcheckAutomationOutput}`,
    `--rollout-output=${options.postcheckRolloutOutput}`,
    `--portal-output=${options.postcheckPortalOutput}`,
    ...(options.transactionIds.length ? [`--transaction-ids=${options.transactionIds.join(',')}`] : []),
    ...(options.allowLargeCleanup ? ['--allow-large-rollout'] : []),
  ], {
    cwd: process.cwd(),
    timeout: options.timeoutMs,
    maxBuffer: 1024 * 1024 * 32,
  })
  return JSON.parse(await readFile(options.postcheckAutomationOutput, 'utf8'))
}

async function fetchCandidateRows(client, byTransaction) {
  const transactionIds = [...byTransaction.keys()]
  if (!transactionIds.length) return []
  const allKeys = [...new Set([...byTransaction.values()].flatMap((keys) => [...keys]))]
  if (!allKeys.length) return []
  const result = await client
    .from('transaction_required_documents')
    .select(
      'id, transaction_id, document_key, document_label, status, is_required, enabled, visibility_scope, required_from_role, is_uploaded, uploaded_document_id, uploaded_at, verified_at, rejected_at, updated_at',
    )
    .in('transaction_id', transactionIds)
    .in('document_key', allKeys)

  if (result.error) throw new Error(`transaction_required_documents: ${result.error.message || 'query failed'}`)
  return (result.data || []).filter((row) => byTransaction.get(row.transaction_id)?.has(normalizeKey(row.document_key)))
}

function planCleanup(rows = []) {
  const cleanupRows = []
  const skippedRows = []

  for (const row of rows) {
    const preserved = hasPreservedState(row)
    const active = isActivePortalAffectingRow(row)
    if (preserved || !active) {
      skippedRows.push({
        ...compactRow(row),
        reason: preserved ? 'preserved_upload_or_review_state' : 'already_inactive',
      })
      continue
    }
    cleanupRows.push(compactRow(row))
  }

  return { cleanupRows, skippedRows }
}

async function commitCleanup(client, rows = []) {
  const updatedAt = new Date().toISOString()
  const results = []
  for (const row of rows) {
    const result = await client
      .from('transaction_required_documents')
      .update({
        is_required: false,
        enabled: false,
        status: 'not_required',
        visibility_scope: 'internal',
        updated_at: updatedAt,
      })
      .eq('id', row.id)
      .select('id, transaction_id, document_key, status, is_required, enabled, visibility_scope')
      .maybeSingle()

    if (result.error) {
      results.push({ id: row.id, transactionId: row.transactionId, documentKey: row.documentKey, ok: false, error: result.error.message })
    } else {
      results.push({ ...compactRow(result.data), ok: true })
    }
  }
  return results
}

function summarize({ precheckRollout, cleanupRows, skippedRows, commitResults, postcheckAutomation, options }) {
  const failedUpdates = (commitResults || []).filter((row) => row.ok !== true).length
  const postSummary = postcheckAutomation?.summary || null
  return {
    dryRun: options.commit !== true,
    totalTransactions: Number(precheckRollout?.summary?.total || 0),
    precheckNonCanonicalKeys: Number(precheckRollout?.portalVerification?.summary?.nonCanonicalExistingKeys || 0),
    eligibleCleanupRows: cleanupRows.length,
    skippedRows: skippedRows.length,
    rowsUpdated: (commitResults || []).filter((row) => row.ok === true).length,
    failedUpdates,
    postcheckReadyForScheduledAutomation: postSummary?.readyForScheduledAutomation ?? null,
    postcheckLegacyNonCanonicalKeyCount: postSummary?.legacyNonCanonicalKeyCount ?? null,
    postcheckBlockedReasons: postSummary?.blockedReasons || [],
  }
}

async function writeReport(output, report) {
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
}

async function run() {
  const options = parseArgs()
  assertOptions(options)

  const env = {
    ...readEnvFile('.env'),
    ...readEnvFile('.env.staging.local'),
    ...process.env,
  }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')

  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const precheck = await runPhase15Precheck(options)
  const precheckRollout = precheck.rollout
  const precheckPortal = precheck.portal
  const byTransaction = groupNonCanonicalKeys(precheckPortal)
  const candidateRows = await fetchCandidateRows(client, byTransaction)
  const { cleanupRows, skippedRows } = planCleanup(candidateRows)
  const commitResults = options.commit ? await commitCleanup(client, cleanupRows) : []
  const postcheckAutomation = options.commit ? await runPhase16Postcheck(options) : null
  const report = {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    dryRun: options.commit !== true,
    commit: options.commit,
    confirmLegacyCleanup: options.confirmLegacyCleanup,
    mutatedData: options.commit === true && commitResults.some((row) => row.ok === true),
    strategy: {
      action: 'disable_hide_zero_state_non_canonical_required_document_rows',
      update: {
        is_required: false,
        enabled: false,
        status: 'not_required',
        visibility_scope: 'internal',
      },
      preservesUploadedOrReviewedRows: true,
      deletesRows: false,
      writesDocumentRequests: false,
    },
    precheck: {
      rolloutOutput: options.precheckRolloutOutput,
      portalOutput: options.precheckPortalOutput,
      summary: precheckRollout.summary,
      portalVerification: {
        output: options.precheckPortalOutput,
        summary: precheckPortal.summary,
      },
      transactionIds: precheckRollout.transactionIds,
    },
    summary: summarize({ precheckRollout, cleanupRows, skippedRows, commitResults, postcheckAutomation, options }),
    cleanupRows,
    skippedRows,
    commitResults,
    postcheck: postcheckAutomation
      ? {
          automationOutput: options.postcheckAutomationOutput,
          rolloutOutput: options.postcheckRolloutOutput,
          portalOutput: options.postcheckPortalOutput,
          summary: postcheckAutomation.summary,
          readiness: postcheckAutomation.readiness,
        }
      : null,
  }

  await writeReport(options.output, report)
  console.log(JSON.stringify(report, null, 2))
  if ((report.summary.failedUpdates || 0) > 0) process.exitCode = 1
}

run().catch((error) => {
  console.error(error?.stack || error?.message || error)
  process.exitCode = 1
})
