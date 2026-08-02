import { mkdir, writeFile } from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { syncCanonicalRequiredDocumentsForTransactionContext } from '../src/services/documents/documentRequestCanonicalTransactionSyncService.js'

const PHASE = 'document_request_phase13_commit_pilot'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase13-commit-pilot.json'
const DEFAULT_PILOT_TRANSACTION_IDS = Object.freeze([
  '4b057a60-ff57-4ebb-82ac-77a4df4eff6c',
  '9fdb69f0-5fe2-475d-8615-a254aa4440e6',
  '26f10c15-99f8-463a-8085-ee0ee9e830db',
])
const MAX_PILOT_TRANSACTIONS = 5
const PRESERVED_REQUIRED_DOCUMENT_STATUSES = new Set([
  'uploaded',
  'under_review',
  'accepted',
  'approved',
  'completed',
  'reupload_required',
  'rejected',
])
const REQUIRED_DOCUMENT_AUDIT_SELECT =
  'id, transaction_id, document_key, status, is_uploaded, uploaded_document_id, uploaded_at, verified_at, rejected_at'

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
    dryRun: true,
    output: DEFAULT_OUTPUT_PATH,
    transactionIds: [],
    useDefaultPilot: false,
    allowLargePilot: false,
  }

  for (const arg of argv) {
    if (arg === '--commit') options.commit = true
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--use-default-pilot') options.useDefaultPilot = true
    else if (arg === '--allow-large-pilot') options.allowLargePilot = true
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
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

  if (!options.transactionIds.length && options.useDefaultPilot) {
    options.transactionIds = [...DEFAULT_PILOT_TRANSACTION_IDS]
  }

  options.transactionIds = [...new Set(options.transactionIds)]
  options.dryRun = options.commit !== true
  return options
}

function assertPilotOptions(options = {}) {
  if (!options.transactionIds?.length) {
    throw new Error('At least one transaction id is required. Use --transaction-ids=... or --use-default-pilot.')
  }
  if (options.allowLargePilot !== true && options.transactionIds.length > MAX_PILOT_TRANSACTIONS) {
    throw new Error(`Phase 13 commit pilot is limited to ${MAX_PILOT_TRANSACTIONS} transactions.`)
  }
}

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isMissingSchemaError(error = null, token = '') {
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase()
  const code = String(error?.code || '').trim()
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('schema cache') ||
    (token && message.includes(token.toLowerCase()))
  )
}

async function safeQuery(label, query, fallback = []) {
  const result = await query
  if (result.error) {
    if (isMissingSchemaError(result.error, label)) return fallback
    throw new Error(`${label}: ${result.error.message || 'query failed'}`)
  }
  return result.data || fallback
}

async function fetchTransactionContext(client, transactionId) {
  const transactionResult = await client.from('transactions').select('*').eq('id', transactionId).maybeSingle()
  if (transactionResult.error) throw new Error(`transactions: ${transactionResult.error.message || 'query failed'}`)
  if (!transactionResult.data) return null

  const onboardingRows = await safeQuery(
    'onboarding_form_data',
    client
      .from('onboarding_form_data')
      .select('*')
      .eq('transaction_id', transactionId)
      .order('updated_at', { ascending: false })
      .limit(1),
    [],
  )
  const listing = transactionResult.data.listing_id
    ? (
        await safeQuery(
          'listings',
          client.from('listings').select('*').eq('id', transactionResult.data.listing_id).limit(1),
          [],
        )
      )[0] || {}
    : {}

  return {
    transaction: transactionResult.data,
    onboardingFormData: extractFormData(onboardingRows[0] || null),
    sellerFormData: extractSellerFormData(listing),
    listing,
  }
}

function extractFormData(row = null) {
  if (!row) return {}
  if (isPlainObject(row.form_data)) return row.form_data
  if (isPlainObject(row.formData)) return row.formData
  return {}
}

function extractSellerFormData(listing = {}) {
  return (
    (isPlainObject(listing.seller_onboarding_form_data) && listing.seller_onboarding_form_data) ||
    (isPlainObject(listing.sellerOnboardingFormData) && listing.sellerOnboardingFormData) ||
    (isPlainObject(listing.seller_form_data) && listing.seller_form_data) ||
    (isPlainObject(listing.sellerFormData) && listing.sellerFormData) ||
    {}
  )
}

async function fetchRequiredDocumentRows(client, transactionId) {
  const result = await client
    .from('transaction_required_documents')
    .select(REQUIRED_DOCUMENT_AUDIT_SELECT)
    .eq('transaction_id', transactionId)

  if (result.error) {
    if (isMissingSchemaError(result.error, 'transaction_required_documents')) return { available: false, rows: [] }
    throw new Error(`transaction_required_documents: ${result.error.message || 'query failed'}`)
  }

  return { available: true, rows: result.data || [] }
}

async function countDocumentRequests(client, transactionId) {
  const result = await client
    .from('document_requests')
    .select('id', { count: 'exact', head: true })
    .eq('transaction_id', transactionId)

  if (result.error) {
    if (isMissingSchemaError(result.error, 'document_requests')) return { available: false, count: null }
    throw new Error(`document_requests: ${result.error.message || 'query failed'}`)
  }

  return { available: true, count: Number(result.count || 0) }
}

function keySummary(rows = []) {
  return rows.map((row) => row.document_key || row.key).filter(Boolean).sort()
}

function nonCanonicalRequiredDocumentKeys(rows = [], canonicalKeys = []) {
  const canonicalKeySet = new Set(canonicalKeys.map(normalizeKey))
  return rows
    .map((row) => row.document_key)
    .filter((key) => key && !canonicalKeySet.has(normalizeKey(key)))
    .sort()
}

function preservedSnapshot(rows = []) {
  return new Map(
    rows
      .filter((row) => {
        const status = normalizeKey(row.status)
        return PRESERVED_REQUIRED_DOCUMENT_STATUSES.has(status) || row.is_uploaded === true || row.uploaded_document_id
      })
      .map((row) => [
        normalizeKey(row.document_key),
        {
          documentKey: row.document_key,
          status: normalizeKey(row.status),
          isUploaded: row.is_uploaded === true,
          uploadedDocumentId: row.uploaded_document_id || null,
          uploadedAt: row.uploaded_at || null,
          verifiedAt: row.verified_at || null,
          rejectedAt: row.rejected_at || null,
        },
      ]),
  )
}

function comparePreservedRows(beforeSnapshot, afterRows = []) {
  const afterByKey = new Map(afterRows.map((row) => [normalizeKey(row.document_key), row]))
  const changes = []

  for (const [key, before] of beforeSnapshot.entries()) {
    const afterRow = afterByKey.get(key)
    if (!afterRow) {
      changes.push({ documentKey: before.documentKey, changed: 'missing_after_commit' })
      continue
    }
    const after = {
      documentKey: afterRow.document_key,
      status: normalizeKey(afterRow.status),
      isUploaded: afterRow.is_uploaded === true,
      uploadedDocumentId: afterRow.uploaded_document_id || null,
      uploadedAt: afterRow.uploaded_at || null,
      verifiedAt: afterRow.verified_at || null,
      rejectedAt: afterRow.rejected_at || null,
    }
    const changedFields = Object.keys(before).filter((field) => before[field] !== after[field])
    if (changedFields.length) {
      changes.push({ documentKey: before.documentKey, changedFields, before, after })
    }
  }

  return changes
}

async function runPilotForTransaction(client, transactionId, options) {
  const beforeRequired = await fetchRequiredDocumentRows(client, transactionId)
  const beforeRequests = await countDocumentRequests(client, transactionId)
  const beforeSnapshot = preservedSnapshot(beforeRequired.rows)
  const context = await fetchTransactionContext(client, transactionId)

  if (!context) {
    return {
      transactionId,
      ok: false,
      skipped: true,
      reason: 'transaction_not_found',
      error: null,
      dryRun: options.dryRun,
      commit: options.commit,
      mutatedData: false,
      synced: 0,
      rowCount: 0,
      beforeRequiredDocumentCount: beforeRequired.available ? beforeRequired.rows.length : null,
      afterRequiredDocumentCount: beforeRequired.available ? beforeRequired.rows.length : null,
      requiredDocumentRowsDelta: 0,
      beforeDocumentRequestsCount: beforeRequests.count,
      afterDocumentRequestsCount: beforeRequests.count,
      documentRequestsDelta: 0,
      documentRequestsChanged: false,
      preservedRowsChanged: [],
      nonCanonicalExistingKeys: [],
      keys: [],
      pendingPolicySkipped: [],
    }
  }

  const result = await syncCanonicalRequiredDocumentsForTransactionContext({
    client,
    transactionId,
    transaction: context.transaction,
    onboardingFormData: context.onboardingFormData,
    sellerFormData: context.sellerFormData,
    listing: context.listing,
    audience: 'auto',
    dryRun: !options.commit,
  })

  const afterRequired = await fetchRequiredDocumentRows(client, transactionId)
  const afterRequests = await countDocumentRequests(client, transactionId)
  const documentRequestsDelta =
    beforeRequests.count === null || afterRequests.count === null ? null : afterRequests.count - beforeRequests.count
  const requiredDocumentRowsDelta = afterRequired.rows.length - beforeRequired.rows.length
  const preservedRowsChanged = comparePreservedRows(beforeSnapshot, afterRequired.rows)
  const keys = keySummary(result.rows || result.persistedRows || [])
  const nonCanonicalExistingKeys = nonCanonicalRequiredDocumentKeys(afterRequired.rows, keys)

  return {
    transactionId,
    ok: true,
    skipped: result.skipped === true,
    reason: result.reason || null,
    error: null,
    dryRun: result.dryRun === true,
    commit: options.commit === true,
    mutatedData: options.commit === true && result.dryRun !== true,
    requestedAudience: result.requestedAudience || 'auto',
    derivedAudience: result.derivedAudience || result.audience || null,
    coverage: result.coverage || null,
    synced: result.synced || 0,
    rowCount: keys.length,
    beforeRequiredDocumentCount: beforeRequired.available ? beforeRequired.rows.length : null,
    afterRequiredDocumentCount: afterRequired.available ? afterRequired.rows.length : null,
    requiredDocumentRowsDelta,
    beforeDocumentRequestsCount: beforeRequests.count,
    afterDocumentRequestsCount: afterRequests.count,
    documentRequestsDelta,
    documentRequestsChanged: documentRequestsDelta !== null ? documentRequestsDelta !== 0 : null,
    preservedRowsChanged,
    nonCanonicalExistingKeys,
    pendingPolicySkipped: result.skippedPendingPolicyKeys || [],
    keys,
  }
}

function summarize(results = [], options = {}) {
  const failed = results.filter((result) => result.ok !== true).length
  const skipped = results.filter((result) => result.skipped === true).length
  const documentRequestsDeltas = results.map((result) => result.documentRequestsDelta).filter((value) => value !== null)
  return {
    total: results.length,
    completed: results.length - failed,
    failed,
    skipped,
    rowsCalculated: results.reduce((total, result) => total + (Number(result.rowCount) || 0), 0),
    synced: results.reduce((total, result) => total + (Number(result.synced) || 0), 0),
    requiredDocumentRowsDelta: results.reduce(
      (total, result) => total + (Number(result.requiredDocumentRowsDelta) || 0),
      0,
    ),
    documentRequestsDelta:
      documentRequestsDeltas.length === results.length
        ? documentRequestsDeltas.reduce((total, value) => total + value, 0)
        : null,
    documentRequestsCreated: documentRequestsDeltas.length === results.length
      ? documentRequestsDeltas.reduce((total, value) => total + value, 0) > 0
      : null,
    preservedRowsChanged: results.reduce((total, result) => total + (result.preservedRowsChanged?.length || 0), 0),
    nonCanonicalExistingKeys: results.reduce((total, result) => total + (result.nonCanonicalExistingKeys?.length || 0), 0),
    wroteRows: options.commit === true && results.some((result) => Number(result.synced || 0) > 0),
  }
}

async function run() {
  const options = parseArgs()
  assertPilotOptions(options)

  const env = {
    ...readEnvFile('.env'),
    ...readEnvFile('.env.staging.local'),
    ...process.env,
  }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')

  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const results = []

  for (const transactionId of options.transactionIds) {
    try {
      results.push(await runPilotForTransaction(client, transactionId, options))
    } catch (error) {
      results.push({
        transactionId,
        ok: false,
        skipped: true,
        reason: 'pilot_failed',
        error: error?.message || String(error),
        dryRun: options.dryRun,
        commit: options.commit,
        mutatedData: false,
        synced: 0,
        rowCount: 0,
        beforeRequiredDocumentCount: null,
        afterRequiredDocumentCount: null,
        requiredDocumentRowsDelta: 0,
        beforeDocumentRequestsCount: null,
        afterDocumentRequestsCount: null,
        documentRequestsDelta: null,
        documentRequestsChanged: null,
        preservedRowsChanged: [],
        nonCanonicalExistingKeys: [],
        keys: [],
        pendingPolicySkipped: [],
      })
    }
  }

  const report = {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    commit: options.commit,
    mutatedData: options.commit === true,
    transactionIds: options.transactionIds,
    summary: summarize(results, options),
    results,
  }

  await mkdir(path.dirname(options.output), { recursive: true })
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
}

run().catch((error) => {
  console.error(error?.stack || error?.message || error)
  process.exitCode = 1
})
