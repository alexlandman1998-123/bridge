import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createClient } from '@supabase/supabase-js'
import {
  buildCanonicalDocumentRequestScenarioFromTransactionContext,
} from '../src/services/documents/documentRequestCanonicalTransactionSyncService.js'

const PHASE = 'document_request_phase14_portal_verification'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase14-portal-verification.json'
const DEFAULT_PILOT_TRANSACTION_IDS = Object.freeze([
  '4b057a60-ff57-4ebb-82ac-77a4df4eff6c',
  '9fdb69f0-5fe2-475d-8615-a254aa4440e6',
  '26f10c15-99f8-463a-8085-ee0ee9e830db',
])
const MAX_VERIFICATION_TRANSACTIONS = 10
const REQUIRED_DOCUMENT_SELECT =
  'id, transaction_id, document_key, document_label, is_required, is_uploaded, status, enabled, group_key, group_label, description, required_from_role, visibility_scope, allow_multiple, uploaded_document_id, uploaded_at, verified_at, rejected_at, notes, sort_order, canonical_requirement_instance_id, created_at, updated_at'

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
    output: DEFAULT_OUTPUT_PATH,
    transactionIds: [],
    useDefaultPilot: false,
    allowLargeVerification: false,
  }

  for (const arg of argv) {
    if (arg === '--use-default-pilot') options.useDefaultPilot = true
    else if (arg === '--allow-large-verification') options.allowLargeVerification = true
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
  return options
}

function assertOptions(options = {}) {
  if (!options.transactionIds?.length) {
    throw new Error('At least one transaction id is required. Use --transaction-ids=... or --use-default-pilot.')
  }
  if (options.allowLargeVerification !== true && options.transactionIds.length > MAX_VERIFICATION_TRANSACTIONS) {
    throw new Error(`Phase 14 portal verification is limited to ${MAX_VERIFICATION_TRANSACTIONS} transactions.`)
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

async function loadBuildDocumentCenter() {
  const bundleDir = await mkdtemp(path.join(os.tmpdir(), 'document-request-phase14-portal-'))
  const entryPath = path.join(bundleDir, 'entry.mjs')
  const bundlePath = path.join(bundleDir, 'bundle.mjs')
  const servicePath = path.join(process.cwd(), 'src/services/clientPortalWorkspaceService.js')

  await writeFile(entryPath, `export { buildDocumentCenter } from ${JSON.stringify(servicePath)}\n`)
  await build({
    entryPoints: [entryPath],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    define: {
      'import.meta.env': '{}',
    },
    logLevel: 'silent',
  })

  return import(pathToFileURL(bundlePath).href)
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

async function fetchRequiredRows(client, transactionId) {
  return safeQuery(
    'transaction_required_documents',
    client
      .from('transaction_required_documents')
      .select(REQUIRED_DOCUMENT_SELECT)
      .eq('transaction_id', transactionId)
      .order('sort_order', { ascending: true }),
    [],
  )
}

async function fetchDocumentRequestCount(client, transactionId) {
  const result = await client
    .from('document_requests')
    .select('id', { count: 'exact', head: true })
    .eq('transaction_id', transactionId)

  if (result.error) {
    if (isMissingSchemaError(result.error, 'document_requests')) return null
    throw new Error(`document_requests: ${result.error.message || 'query failed'}`)
  }
  return Number(result.count || 0)
}

async function fetchPortalAccessSummary(client, transactionId) {
  const [buyerLinks, sellerContexts, externalAccess] = await Promise.all([
    safeQuery(
      'client_portal_links',
      client
        .from('client_portal_links')
        .select('id, is_active, created_at, updated_at')
        .eq('transaction_id', transactionId),
      [],
    ),
    safeQuery(
      'client_portal_contexts',
      client
        .from('client_portal_contexts')
        .select('id, context_type, status, seller_workspace_token, created_at, updated_at')
        .eq('transaction_id', transactionId),
      [],
    ),
    safeQuery(
      'transaction_external_access',
      client
        .from('transaction_external_access')
        .select('id, role, status, revoked_at, expires_at, created_at, updated_at')
        .eq('transaction_id', transactionId),
      [],
    ),
  ])

  return {
    buyerPortalLinks: buyerLinks.length,
    activeBuyerPortalLinks: buyerLinks.filter((row) => row.is_active !== false).length,
    sellerPortalContexts: sellerContexts.filter((row) => String(row.context_type || '').toLowerCase() === 'selling').length,
    activeSellerPortalContexts: sellerContexts.filter((row) => {
      const status = String(row.status || 'active').toLowerCase()
      return String(row.context_type || '').toLowerCase() === 'selling' && ['active', 'pending'].includes(status)
    }).length,
    sellerWorkspaceTokenPresent: sellerContexts.some((row) => String(row.seller_workspace_token || '').trim()),
    externalAccessRows: externalAccess.length,
    activeExternalAccessRows: externalAccess.filter((row) => {
      const status = String(row.status || 'active').toLowerCase()
      return !row.revoked_at && ['active', 'pending', ''].includes(status)
    }).length,
    externalRoles: [...new Set(externalAccess.map((row) => String(row.role || '').trim()).filter(Boolean))].sort(),
  }
}

function normalizeRequiredRowForPortal(row = {}) {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    key: row.document_key,
    requirement_key: row.document_key,
    document_key: row.document_key,
    label: row.document_label || row.document_key,
    requirement_name: row.document_label || row.document_key,
    name: row.document_label || row.document_key,
    group: row.group_label || row.group_key || 'Documents',
    groupKey: row.group_key || 'buyer_fica',
    groupLabel: row.group_label || row.group_key || 'Documents',
    description: row.description || '',
    status: row.status || 'missing',
    requiredDocumentStatus: row.status || 'missing',
    isRequired: row.is_required !== false,
    isEnabled: row.enabled !== false,
    isUploaded: row.is_uploaded === true,
    expectedFromRole: row.required_from_role || 'client',
    visibilityScope: row.visibility_scope || 'client',
    visibility_scope: row.visibility_scope || 'client',
    uploadedDocumentId: row.uploaded_document_id || null,
    uploaded_document_id: row.uploaded_document_id || null,
    canonicalRequirementInstanceId: row.canonical_requirement_instance_id || null,
    canonical_requirement_instance_id: row.canonical_requirement_instance_id || null,
    sortOrder: row.sort_order ?? 999,
  }
}

function keySet(items = []) {
  return new Set(items.map((item) => normalizeKey(item?.key || item?.sourceId || item?.document_key)).filter(Boolean))
}

function identityKeySet(items = []) {
  return new Set(
    items
      .flatMap((item) => [
        item?.canonicalDocumentRequestKey,
        item?.documentRequestCanonicalKey,
        item?.canonical_document_request_key,
        item?.key,
        item?.sourceId,
        item?.document_key,
      ])
      .map(normalizeKey)
      .filter(Boolean),
  )
}

function duplicateKeys(items = []) {
  const counts = new Map()
  for (const item of items) {
    const key = normalizeKey(item?.key || item?.sourceId || item?.document_key)
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key).sort()
}

function isActiveRequiredRow(row = {}) {
  const visibility = normalizeKey(row.visibility_scope || 'client')
  const status = normalizeKey(row.status || '')
  return (
    row.is_required !== false &&
    row.enabled !== false &&
    !['internal', 'internal_only'].includes(visibility) &&
    status !== 'not_required'
  )
}

function nonCanonicalExistingKeys(requiredRows = [], canonicalKeys = []) {
  const canonicalKeySet = new Set(canonicalKeys.map(normalizeKey))
  return requiredRows
    .filter(isActiveRequiredRow)
    .map((row) => row.document_key)
    .filter((key) => key && !canonicalKeySet.has(normalizeKey(key)))
    .sort()
}

function rowAudience(row = {}) {
  const role = normalizeKey(row.required_from_role || row.expectedFromRole || '')
  const key = normalizeKey(row.document_key || row.key || '')
  const label = normalizeKey(row.document_label || row.label || '')
  if (role === 'buyer' || key.startsWith('buyer_') || key.includes('proof_of_funds') || key.includes('bond')) {
    return 'buyer'
  }
  if (role === 'seller' || key.startsWith('seller_') || label.includes('seller')) {
    return 'seller'
  }
  return 'shared'
}

function expectedKeysForWorkspace(rows = [], workspaceMode = 'shared') {
  return rows
    .filter((row) => {
      const audience = rowAudience(row)
      if (workspaceMode === 'buying') return audience === 'buyer' || audience === 'shared'
      if (workspaceMode === 'selling') return audience === 'seller' || audience === 'shared'
      return true
    })
    .map((row) => row.document_key)
    .filter(Boolean)
}

function summarizeWorkspace(model = {}, expectedKeys = []) {
  const requiredKeys = keySet(model.requiredDocuments || [])
  const itemKeys = keySet(model.items || [])
  const requiredIdentityKeys = identityKeySet(model.requiredDocuments || [])
  const itemIdentityKeys = identityKeySet(model.items || [])
  const canonicalPlanKeys = keySet(model.canonicalDocumentRequestPlan?.requiredDocuments || [])
  return {
    requiredCount: model.requiredDocuments?.length || 0,
    itemCount: model.items?.length || 0,
    summary: model.summary || null,
    canonicalPlanAudience: model.canonicalDocumentRequestPlan?.audience || null,
    canonicalPlanRequestCount: model.canonicalDocumentRequestPlan?.requests?.length || 0,
    canonicalPlanRequiredKeys: [...canonicalPlanKeys].sort(),
    missingExpectedRequiredKeys: expectedKeys.filter((key) => !requiredIdentityKeys.has(normalizeKey(key))).sort(),
    missingExpectedItemKeys: expectedKeys.filter((key) => !itemIdentityKeys.has(normalizeKey(key))).sort(),
    duplicateRequiredKeys: duplicateKeys(model.requiredDocuments || []),
    duplicateItemKeys: duplicateKeys(model.items || []),
    keys: [...requiredKeys].sort(),
    identityKeys: [...requiredIdentityKeys].sort(),
  }
}

async function verifyTransaction({ client, buildDocumentCenter, transactionId }) {
  const context = await fetchTransactionContext(client, transactionId)
  if (!context) {
    return { transactionId, ok: false, reason: 'transaction_not_found', errors: ['transaction_not_found'] }
  }

  const requiredRows = await fetchRequiredRows(client, transactionId)
  const expectedPortalRows = requiredRows.filter((row) => {
    const visibility = normalizeKey(row.visibility_scope || 'client')
    const status = normalizeKey(row.status || '')
    return row.is_required !== false && row.enabled !== false && !['internal', 'internal_only'].includes(visibility) && status !== 'not_required'
  })
  const expectedKeys = expectedPortalRows.map((row) => row.document_key).filter(Boolean)
  const derived = buildCanonicalDocumentRequestScenarioFromTransactionContext({
    transaction: context.transaction,
    onboardingFormData: context.onboardingFormData,
    sellerFormData: context.sellerFormData,
    listing: context.listing,
  })
  const portalData = {
    transaction: context.transaction,
    onboardingFormData: context.onboardingFormData,
    sellerOnboardingFormData: context.sellerFormData,
    listing: context.listing,
    canonicalDocumentRequestScenario: derived.scenario,
    requiredDocuments: expectedPortalRows.map(normalizeRequiredRowForPortal),
    documents: [],
    additionalDocumentRequests: [],
  }
  const buying = summarizeWorkspace(buildDocumentCenter(portalData, 'buying'), expectedKeysForWorkspace(expectedPortalRows, 'buying'))
  const selling = summarizeWorkspace(buildDocumentCenter(portalData, 'selling'), expectedKeysForWorkspace(expectedPortalRows, 'selling'))
  const shared = summarizeWorkspace(buildDocumentCenter(portalData, 'shared'), expectedKeys)
  const sharedVisibleKeys = new Set((shared.identityKeys || shared.keys || []).map(normalizeKey))
  const portalAccess = await fetchPortalAccessSummary(client, transactionId)
  const documentRequestsCount = await fetchDocumentRequestCount(client, transactionId)
  const errors = []
  const warnings = []
  const missingFromShared = expectedKeys.filter((key) => !sharedVisibleKeys.has(normalizeKey(key))).sort()

  if (missingFromShared.length) errors.push('shared_portal_missing_committed_required_documents')
  if (shared.duplicateRequiredKeys.length || shared.duplicateItemKeys.length) warnings.push('shared_portal_duplicate_keys')
  if (buying.duplicateRequiredKeys.length || selling.duplicateRequiredKeys.length) warnings.push('workspace_duplicate_keys')
  if (portalAccess.activeSellerPortalContexts && (selling.missingExpectedRequiredKeys.length || selling.missingExpectedItemKeys.length)) {
    warnings.push('active_seller_portal_missing_committed_seller_documents')
  }
  if (!portalAccess.activeBuyerPortalLinks && !portalAccess.activeSellerPortalContexts && !portalAccess.activeExternalAccessRows) {
    warnings.push('no_active_portal_access_found')
  }

  return {
    transactionId,
    ok: errors.length === 0,
    reason: errors[0] || null,
    errors,
    warnings,
    coverage: derived.coverage,
    requiredDocumentRows: requiredRows.length,
    expectedPortalRequiredRows: expectedPortalRows.length,
    documentRequestsCount,
    documentRequestsCreated: documentRequestsCount === null ? null : documentRequestsCount > 0,
    portalAccess,
    buying,
    selling,
    shared,
    missingCommittedKeysFromSharedPortal: missingFromShared,
    nonCanonicalExistingKeys: nonCanonicalExistingKeys(requiredRows, shared.canonicalPlanRequiredKeys || []),
  }
}

function summarize(results = []) {
  const failed = results.filter((result) => result.ok !== true).length
  return {
    total: results.length,
    completed: results.length - failed,
    failed,
    warnings: results.reduce((total, result) => total + (result.warnings?.length || 0), 0),
    requiredDocumentRows: results.reduce((total, result) => total + (Number(result.requiredDocumentRows) || 0), 0),
    expectedPortalRequiredRows: results.reduce((total, result) => total + (Number(result.expectedPortalRequiredRows) || 0), 0),
    documentRequestsCreated: results.some((result) => result.documentRequestsCreated === true),
    missingCommittedKeysFromSharedPortal: results.reduce(
      (total, result) => total + (result.missingCommittedKeysFromSharedPortal?.length || 0),
      0,
    ),
    nonCanonicalExistingKeys: results.reduce((total, result) => total + (result.nonCanonicalExistingKeys?.length || 0), 0),
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
  const { buildDocumentCenter } = await loadBuildDocumentCenter()
  const results = []

  for (const transactionId of options.transactionIds) {
    try {
      results.push(await verifyTransaction({ client, buildDocumentCenter, transactionId }))
    } catch (error) {
      results.push({
        transactionId,
        ok: false,
        reason: 'portal_verification_failed',
        errors: [error?.message || String(error)],
        warnings: [],
      })
    }
  }

  const report = {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    dryRun: true,
    commit: false,
    mutatedData: false,
    transactionIds: options.transactionIds,
    summary: summarize(results),
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
