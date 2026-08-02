import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { syncCanonicalRequiredDocumentsForTransactionContext } from '../src/services/documents/documentRequestCanonicalTransactionSyncService.js'

const execFileAsync = promisify(execFile)

const PHASE = 'document_request_phase15_operational_rollout'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase15-operational-rollout.json'
const DEFAULT_PORTAL_OUTPUT_PATH = 'output/document-request-phase15-portal-verification.json'
const DEFAULT_LIMIT = 10
const MAX_OPERATIONAL_ROLLOUT_TRANSACTIONS = 25
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
    confirmOperationalRollout: false,
    dryRun: true,
    output: DEFAULT_OUTPUT_PATH,
    portalOutput: DEFAULT_PORTAL_OUTPUT_PATH,
    transactionIds: [],
    limit: DEFAULT_LIMIT,
    allowLargeRollout: false,
    allowNoActivePortal: false,
    skipPortalVerification: false,
  }

  for (const arg of argv) {
    if (arg === '--commit') options.commit = true
    else if (arg === '--confirm-operational-rollout') options.confirmOperationalRollout = true
    else if (arg === '--allow-large-rollout') options.allowLargeRollout = true
    else if (arg === '--allow-no-active-portal') options.allowNoActivePortal = true
    else if (arg === '--skip-portal-verification') options.skipPortalVerification = true
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length)) || DEFAULT_LIMIT
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
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
  options.limit = Math.max(1, Math.min(options.limit, MAX_OPERATIONAL_ROLLOUT_TRANSACTIONS))
  options.dryRun = options.commit !== true
  return options
}

function assertOptions(options = {}) {
  if (options.commit && options.confirmOperationalRollout !== true) {
    throw new Error('Operational rollout writes require --confirm-operational-rollout.')
  }
  if (options.allowLargeRollout !== true && options.transactionIds.length > MAX_OPERATIONAL_ROLLOUT_TRANSACTIONS) {
    throw new Error(`Phase 15 operational rollout is limited to ${MAX_OPERATIONAL_ROLLOUT_TRANSACTIONS} transactions.`)
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

async function fetchPortalAccessSummary(client, transactionId) {
  const [buyerLinks, sellerContexts, externalAccess] = await Promise.all([
    safeQuery(
      'client_portal_links',
      client
        .from('client_portal_links')
        .select('id, is_active, updated_at')
        .eq('transaction_id', transactionId),
      [],
    ),
    safeQuery(
      'client_portal_contexts',
      client
        .from('client_portal_contexts')
        .select('id, context_type, status, seller_workspace_token, updated_at')
        .eq('transaction_id', transactionId),
      [],
    ),
    safeQuery(
      'transaction_external_access',
      client
        .from('transaction_external_access')
        .select('id, role, status, revoked_at, expires_at, updated_at')
        .eq('transaction_id', transactionId),
      [],
    ),
  ])

  const activeBuyerPortalLinks = buyerLinks.filter((row) => row.is_active !== false).length
  const activeSellerPortalContexts = sellerContexts.filter((row) => {
    const status = String(row.status || 'active').toLowerCase()
    return String(row.context_type || '').toLowerCase() === 'selling' && ['active', 'pending'].includes(status)
  }).length
  const activeExternalAccessRows = externalAccess.filter((row) => {
    const status = String(row.status || 'active').toLowerCase()
    return !row.revoked_at && ['active', 'pending', ''].includes(status)
  }).length

  return {
    buyerPortalLinks: buyerLinks.length,
    activeBuyerPortalLinks,
    sellerPortalContexts: sellerContexts.filter((row) => String(row.context_type || '').toLowerCase() === 'selling').length,
    activeSellerPortalContexts,
    sellerWorkspaceTokenPresent: sellerContexts.some((row) => String(row.seller_workspace_token || '').trim()),
    externalAccessRows: externalAccess.length,
    activeExternalAccessRows,
    hasActivePortalAccess: activeBuyerPortalLinks > 0 || activeSellerPortalContexts > 0 || activeExternalAccessRows > 0,
    externalRoles: [...new Set(externalAccess.map((row) => String(row.role || '').trim()).filter(Boolean))].sort(),
  }
}

function addCandidate(candidates, transactionId, source, updatedAt = '') {
  const normalizedTransactionId = String(transactionId || '').trim()
  if (!normalizedTransactionId) return
  const current = candidates.get(normalizedTransactionId) || {
    transactionId: normalizedTransactionId,
    sources: [],
    updatedAt: '',
  }
  current.sources = [...new Set([...current.sources, source])]
  current.updatedAt = [current.updatedAt, updatedAt].filter(Boolean).sort().at(-1) || ''
  candidates.set(normalizedTransactionId, current)
}

async function selectOperationalCandidates(client, options = {}) {
  if (options.transactionIds.length) {
    return options.transactionIds.map((transactionId) => ({
      transactionId,
      sources: ['explicit'],
      updatedAt: '',
    }))
  }

  const [buyerLinks, sellerContexts, externalAccess] = await Promise.all([
    safeQuery(
      'client_portal_links',
      client
        .from('client_portal_links')
        .select('transaction_id, is_active, updated_at')
        .eq('is_active', true)
        .not('transaction_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(options.limit * 4),
      [],
    ),
    safeQuery(
      'client_portal_contexts',
      client
        .from('client_portal_contexts')
        .select('transaction_id, context_type, status, updated_at')
        .in('status', ['active', 'pending'])
        .not('transaction_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(options.limit * 4),
      [],
    ),
    safeQuery(
      'transaction_external_access',
      client
        .from('transaction_external_access')
        .select('transaction_id, role, status, revoked_at, updated_at')
        .not('transaction_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(options.limit * 4),
      [],
    ),
  ])
  const candidates = new Map()

  for (const row of buyerLinks) addCandidate(candidates, row.transaction_id, 'active_buyer_portal_link', row.updated_at)
  for (const row of sellerContexts) addCandidate(candidates, row.transaction_id, 'active_seller_portal_context', row.updated_at)
  for (const row of externalAccess) {
    const status = String(row.status || 'active').toLowerCase()
    if (row.revoked_at || !['active', 'pending', ''].includes(status)) continue
    addCandidate(candidates, row.transaction_id, 'active_external_access', row.updated_at)
  }

  return [...candidates.values()]
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
    .slice(0, options.limit)
}

function keySummary(rows = []) {
  return rows.map((row) => row.document_key || row.key).filter(Boolean).sort()
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
      changes.push({ documentKey: before.documentKey, changed: 'missing_after_rollout' })
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

async function runRolloutForCandidate(client, candidate, options) {
  const transactionId = candidate.transactionId
  const portalAccess = await fetchPortalAccessSummary(client, transactionId)
  const beforeRequired = await fetchRequiredDocumentRows(client, transactionId)
  const beforeRequests = await countDocumentRequests(client, transactionId)
  const beforeSnapshot = preservedSnapshot(beforeRequired.rows)
  const context = await fetchTransactionContext(client, transactionId)
  const warnings = []

  if (!portalAccess.hasActivePortalAccess) warnings.push('no_active_portal_access_found')
  if (!context) {
    return {
      transactionId,
      ok: false,
      skipped: true,
      reason: 'transaction_not_found',
      sources: candidate.sources,
      warnings,
      dryRun: options.dryRun,
      commit: options.commit,
      mutatedData: false,
      synced: 0,
      rowCount: 0,
      beforeRequiredDocumentCount: beforeRequired.rows.length,
      afterRequiredDocumentCount: beforeRequired.rows.length,
      requiredDocumentRowsDelta: 0,
      beforeDocumentRequestsCount: beforeRequests.count,
      afterDocumentRequestsCount: beforeRequests.count,
      documentRequestsDelta: 0,
      documentRequestsChanged: false,
      preservedRowsChanged: [],
      portalAccess,
      keys: [],
    }
  }
  if (options.commit && !portalAccess.hasActivePortalAccess && options.allowNoActivePortal !== true) {
    return {
      transactionId,
      ok: false,
      skipped: true,
      reason: 'active_portal_access_required_for_commit',
      sources: candidate.sources,
      warnings,
      dryRun: options.dryRun,
      commit: options.commit,
      mutatedData: false,
      synced: 0,
      rowCount: 0,
      beforeRequiredDocumentCount: beforeRequired.rows.length,
      afterRequiredDocumentCount: beforeRequired.rows.length,
      requiredDocumentRowsDelta: 0,
      beforeDocumentRequestsCount: beforeRequests.count,
      afterDocumentRequestsCount: beforeRequests.count,
      documentRequestsDelta: 0,
      documentRequestsChanged: false,
      preservedRowsChanged: [],
      portalAccess,
      keys: [],
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
  const preservedRowsChanged = comparePreservedRows(beforeSnapshot, afterRequired.rows)

  return {
    transactionId,
    ok: true,
    skipped: result.skipped === true,
    reason: result.reason || null,
    sources: candidate.sources,
    warnings,
    dryRun: result.dryRun === true,
    commit: options.commit,
    mutatedData: options.commit === true && result.dryRun !== true,
    requestedAudience: result.requestedAudience || 'auto',
    derivedAudience: result.derivedAudience || result.audience || null,
    coverage: result.coverage || null,
    synced: result.synced || 0,
    rowCount: keySummary(result.rows || result.persistedRows || []).length,
    beforeRequiredDocumentCount: beforeRequired.rows.length,
    afterRequiredDocumentCount: afterRequired.rows.length,
    requiredDocumentRowsDelta: afterRequired.rows.length - beforeRequired.rows.length,
    beforeDocumentRequestsCount: beforeRequests.count,
    afterDocumentRequestsCount: afterRequests.count,
    documentRequestsDelta,
    documentRequestsChanged: documentRequestsDelta !== null ? documentRequestsDelta !== 0 : null,
    preservedRowsChanged,
    portalAccess,
    pendingPolicySkipped: result.skippedPendingPolicyKeys || [],
    keys: keySummary(result.rows || result.persistedRows || []),
  }
}

async function runPortalVerification(transactionIds = [], options = {}) {
  if (options.skipPortalVerification || !transactionIds.length) return null
  await execFileAsync(process.execPath, [
    'scripts/document-request-canonical-phase14-portal-verification.mjs',
    `--transaction-ids=${transactionIds.join(',')}`,
    `--output=${options.portalOutput}`,
    '--allow-large-verification',
  ], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 16,
  })

  return JSON.parse(await readFile(options.portalOutput, 'utf8'))
}

function summarize(results = [], portalReport = null, options = {}) {
  const failed = results.filter((result) => result.ok !== true).length
  const skipped = results.filter((result) => result.skipped === true).length
  const documentRequestsDeltas = results.map((result) => result.documentRequestsDelta).filter((value) => value !== null)
  const portalFailed = Number(portalReport?.summary?.failed || 0) || 0
  const portalMissingCommittedKeys = Number(portalReport?.summary?.missingCommittedKeysFromSharedPortal || 0) || 0
  const portalDocumentRequestsCreated = portalReport?.summary?.documentRequestsCreated === true
  const gatePassed =
    failed === 0 &&
    results.every((result) => (result.preservedRowsChanged?.length || 0) === 0) &&
    documentRequestsDeltas.every((delta) => delta === 0) &&
    portalFailed === 0 &&
    portalMissingCommittedKeys === 0 &&
    portalDocumentRequestsCreated !== true

  return {
    total: results.length,
    completed: results.length - failed,
    failed,
    skipped,
    warnings: results.reduce((total, result) => total + (result.warnings?.length || 0), 0) + Number(portalReport?.summary?.warnings || 0),
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
    documentRequestsCreated:
      documentRequestsDeltas.length === results.length
        ? documentRequestsDeltas.reduce((total, value) => total + value, 0) > 0
        : null,
    preservedRowsChanged: results.reduce((total, result) => total + (result.preservedRowsChanged?.length || 0), 0),
    portalVerificationFailed: portalFailed,
    portalMissingCommittedKeys,
    portalDocumentRequestsCreated,
    gatePassed,
    wroteRows: options.commit === true && results.some((result) => Number(result.synced || 0) > 0),
  }
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
  const candidates = await selectOperationalCandidates(client, options)
  const transactionIds = candidates.map((candidate) => candidate.transactionId)
  const results = []

  for (const candidate of candidates) {
    try {
      results.push(await runRolloutForCandidate(client, candidate, options))
    } catch (error) {
      results.push({
        transactionId: candidate.transactionId,
        ok: false,
        skipped: true,
        reason: 'operational_rollout_failed',
        error: error?.message || String(error),
        sources: candidate.sources,
        warnings: [],
        dryRun: options.dryRun,
        commit: options.commit,
        mutatedData: false,
        synced: 0,
        rowCount: 0,
        requiredDocumentRowsDelta: 0,
        documentRequestsDelta: null,
        documentRequestsChanged: null,
        preservedRowsChanged: [],
        keys: [],
      })
    }
  }

  const portalVerification = await runPortalVerification(transactionIds, options)
  const report = {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    commit: options.commit,
    confirmOperationalRollout: options.confirmOperationalRollout,
    mutatedData: options.commit === true,
    selection: {
      explicitTransactionIds: options.transactionIds.length > 0,
      limit: options.limit,
      candidateCount: candidates.length,
      candidates,
    },
    transactionIds,
    summary: summarize(results, portalVerification, options),
    portalVerification: portalVerification
      ? {
          output: options.portalOutput,
          summary: portalVerification.summary,
        }
      : null,
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
