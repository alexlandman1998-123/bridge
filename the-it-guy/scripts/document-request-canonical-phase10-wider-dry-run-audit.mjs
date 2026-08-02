import { mkdir, writeFile } from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { runCanonicalDocumentRequestRecalculationBatch } from '../src/services/documents/documentRequestCanonicalAdminRecalculationService.js'
import { syncCanonicalRequiredDocumentsForTransactionContext } from '../src/services/documents/documentRequestCanonicalTransactionSyncService.js'

const DEFAULT_LIMIT = 500
const DEFAULT_MAX_PER_COHORT = 2
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase10-wider-dry-run-audit.json'

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
    limit: DEFAULT_LIMIT,
    maxPerCohort: DEFAULT_MAX_PER_COHORT,
    output: DEFAULT_OUTPUT_PATH,
    transactionIds: [],
  }

  for (const arg of argv) {
    if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length)) || DEFAULT_LIMIT
    else if (arg.startsWith('--max-per-cohort=')) {
      options.maxPerCohort = Number(arg.slice('--max-per-cohort='.length)) || DEFAULT_MAX_PER_COHORT
    } else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
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
  return options
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  return ['true', 'yes', 'y', '1', 'required', 'applies', 'bond', 'existing_bond', 'outstanding'].includes(normalized)
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function firstValue(...values) {
  return values.find((value) => {
    if (typeof value === 'boolean') return true
    return value !== null && value !== undefined && String(value).trim() !== ''
  })
}

function readPath(source = {}, pathExpression = '') {
  return pathExpression.split('.').reduce((value, key) => {
    if (!isPlainObject(value)) return undefined
    return value[key]
  }, source)
}

function firstPath(source = {}, paths = []) {
  for (const pathExpression of paths) {
    const value = readPath(source, pathExpression)
    if (value !== null && value !== undefined && String(value).trim() !== '') return value
  }
  return ''
}

function normalizeEntityType(value = '') {
  const normalized = normalizeKey(value)
  if (['company', 'pty', 'pty_ltd', 'close_corporation', 'cc'].includes(normalized)) return 'company'
  if (['trust', 'family_trust'].includes(normalized)) return 'trust'
  if (['deceased_estate', 'estate_late', 'estate'].includes(normalized)) return 'deceased_estate'
  if (['power_of_attorney', 'poa', 'representative'].includes(normalized)) return 'power_of_attorney'
  if (['foreign', 'foreign_individual', 'non_resident'].includes(normalized)) return 'foreign_individual'
  if (
    [
      'married',
      'married_cop',
      'married_coc',
      'married_in_community',
      'married_in_community_of_property',
      'married_anc',
      'married_anc_accrual',
      'married_out_of_community',
      'married_out_of_community_of_property',
      'single',
      'unmarried',
      'divorced',
      'widowed',
    ].includes(normalized)
  ) {
    return 'individual'
  }
  if (['individual', 'natural_person', 'person'].includes(normalized)) return 'individual'
  return normalized
}

function normalizeMaritalRegime(value = '') {
  const normalized = normalizeKey(value)
  if (['married_in_community', 'in_community', 'community_of_property', 'cop', 'married_cop'].includes(normalized)) {
    return 'married_cop'
  }
  if (
    [
      'married_out_of_community',
      'out_of_community',
      'anc',
      'antenuptial_contract',
      'married_anc',
      'out_of_community_with_accrual',
      'out_of_community_without_accrual',
    ].includes(normalized)
  ) {
    return 'married_anc'
  }
  return normalized
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

function classifyTransaction({ transaction = {}, onboardingFormData = {}, listing = {}, sellerFormData = {} } = {}) {
  const buyerEntityType = normalizeEntityType(
    firstValue(
      transaction.purchaser_type,
      transaction.buyer_entity_type,
      firstPath(onboardingFormData, [
        'purchaser_type',
        'buyer_entity_type',
        'buyer.entity_type',
        'personal.entity_type',
        'buyer.type',
      ]),
    ),
  )
  const sellerEntityType = normalizeEntityType(
    firstValue(
      transaction.seller_type,
      transaction.seller_entity_type,
      listing.seller_type,
      listing.seller_entity_type,
      firstPath(sellerFormData, [
        'seller_type',
        'seller_entity_type',
        'ownership_type',
        'ownershipType',
        'seller.entity_type',
      ]),
    ),
  )
  const buyerMaritalRegime = normalizeMaritalRegime(
    firstValue(
      transaction.buyer_marital_regime,
      firstPath(onboardingFormData, [
        'marital_regime',
        'marital_status',
        'buyer.marital_regime',
        'buyer.marital_status',
        'personal.marital_regime',
        'personal.marital_status',
      ]),
    ),
  )
  const sellerMaritalRegime = normalizeMaritalRegime(
    firstValue(
      transaction.seller_marital_regime,
      listing.seller_marital_regime,
      firstPath(sellerFormData, [
        'marital_regime',
        'marital_status',
        'seller.marital_regime',
        'seller.marital_status',
      ]),
    ),
  )
  const financeType = normalizeKey(
    firstValue(
      transaction.finance_type,
      transaction.purchase_finance_type,
      firstPath(onboardingFormData, ['finance_type', 'purchase_finance_type', 'finance.finance_type']),
    ),
  )
  const propertyType = normalizeKey(
    firstValue(
      transaction.property_type,
      transaction.property_tenure,
      listing.property_type,
      listing.property_category,
      listing.property_tenure,
      firstPath(sellerFormData, ['property_type', 'property_category', 'propertyType', 'propertyCategory']),
    ),
  )
  const sellerHasExistingBond = normalizeBoolean(
    firstValue(
      transaction.seller_has_existing_bond,
      transaction.existing_bond,
      listing.seller_has_existing_bond,
      firstPath(sellerFormData, ['seller_has_existing_bond', 'existing_bond', 'existingBond']),
    ),
  )
  const vatTransaction = normalizeBoolean(
    firstValue(
      transaction.vat_transaction,
      listing.vat_transaction,
      firstPath(sellerFormData, ['vat_transaction', 'vatTransaction']),
    ),
  )
  const buyerKnown = Boolean(buyerEntityType)
  const sellerKnown = Boolean(sellerEntityType)

  const tags = []
  if (buyerEntityType) tags.push(`buyer_${buyerEntityType}`)
  if (sellerEntityType) tags.push(`seller_${sellerEntityType}`)
  if (buyerMaritalRegime) tags.push(`buyer_${buyerMaritalRegime}`)
  if (sellerMaritalRegime) tags.push(`seller_${sellerMaritalRegime}`)
  if (financeType) tags.push(financeType)
  if (propertyType.includes('sectional')) tags.push('sectional_title')
  if (propertyType.includes('estate') || propertyType.includes('hoa')) tags.push('estate_hoa')
  if (propertyType.includes('commercial') || propertyType.includes('mixed_use')) tags.push('commercial_or_mixed_use')
  if (sellerHasExistingBond) tags.push('existing_bond')
  if (vatTransaction) tags.push('vat_transaction')

  return {
    buyerEntityType,
    sellerEntityType,
    buyerMaritalRegime,
    sellerMaritalRegime,
    financeType,
    propertyType,
    sellerHasExistingBond,
    vatTransaction,
    buyerKnown,
    sellerKnown,
    tags: [...new Set(tags.filter(Boolean))],
  }
}

const COHORTS = Object.freeze([
  { key: 'buyer_individual', label: 'Individual buyer', match: (profile) => profile.buyerEntityType === 'individual' },
  { key: 'buyer_company', label: 'Company buyer', match: (profile) => profile.buyerEntityType === 'company' },
  { key: 'buyer_trust', label: 'Trust buyer', match: (profile) => profile.buyerEntityType === 'trust' },
  { key: 'seller_individual', label: 'Individual seller', match: (profile) => profile.sellerEntityType === 'individual' },
  { key: 'seller_company', label: 'Company seller', match: (profile) => profile.sellerEntityType === 'company' },
  { key: 'seller_trust', label: 'Trust seller', match: (profile) => profile.sellerEntityType === 'trust' },
  { key: 'seller_deceased_estate', label: 'Deceased estate seller', match: (profile) => profile.sellerEntityType === 'deceased_estate' },
  { key: 'seller_power_of_attorney', label: 'Power of attorney seller', match: (profile) => profile.sellerEntityType === 'power_of_attorney' },
  { key: 'buyer_married_cop', label: 'Buyer married in community', match: (profile) => profile.buyerMaritalRegime === 'married_cop' },
  { key: 'buyer_married_anc', label: 'Buyer married out of community / ANC', match: (profile) => profile.buyerMaritalRegime === 'married_anc' },
  { key: 'seller_married_cop', label: 'Seller married in community', match: (profile) => profile.sellerMaritalRegime === 'married_cop' },
  { key: 'seller_married_anc', label: 'Seller married out of community / ANC', match: (profile) => profile.sellerMaritalRegime === 'married_anc' },
  { key: 'sectional_title', label: 'Sectional title property', match: (profile) => profile.tags.includes('sectional_title') },
  { key: 'estate_hoa', label: 'Estate / HOA property', match: (profile) => profile.tags.includes('estate_hoa') },
  {
    key: 'existing_bond',
    label: 'Existing seller bond with seller structure',
    match: (profile) => profile.sellerHasExistingBond === true && profile.sellerKnown === true,
  },
  {
    key: 'commercial_vat',
    label: 'Commercial / VAT transaction',
    match: (profile) => profile.tags.includes('commercial_or_mixed_use') || profile.vatTransaction === true,
  },
])

async function safeQuery(label, query, fallback = []) {
  const result = await query
  if (result.error) {
    const message = String(result.error.message || result.error.details || '').toLowerCase()
    if (
      message.includes('does not exist') ||
      message.includes('could not find the table') ||
      message.includes('schema cache') ||
      result.error.code === '42P01' ||
      result.error.code === '42703' ||
      result.error.code === 'PGRST205'
    ) {
      return fallback
    }
    throw new Error(`${label}: ${result.error.message || 'query failed'}`)
  }
  return result.data || fallback
}

async function fetchAuditRows(client, options) {
  const transactions = options.transactionIds.length
    ? await safeQuery(
        'transactions',
        client.from('transactions').select('*').in('id', options.transactionIds).limit(options.transactionIds.length),
      )
    : await safeQuery(
        'transactions',
        client.from('transactions').select('*').order('created_at', { ascending: false }).limit(options.limit),
      )
  const transactionIds = transactions.map((row) => row.id).filter(Boolean)
  const listingIds = [...new Set(transactions.map((row) => row.listing_id).filter(Boolean))]

  const onboardingRows = transactionIds.length
    ? await safeQuery(
        'onboarding_form_data',
        client
          .from('onboarding_form_data')
          .select('*')
          .in('transaction_id', transactionIds)
          .order('updated_at', { ascending: false }),
      )
    : []
  const listings = listingIds.length
    ? await safeQuery('listings', client.from('listings').select('*').in('id', listingIds).limit(listingIds.length))
    : []

  const onboardingByTransactionId = new Map()
  for (const row of onboardingRows) {
    if (!onboardingByTransactionId.has(row.transaction_id)) onboardingByTransactionId.set(row.transaction_id, row)
  }
  const listingById = new Map(listings.map((row) => [row.id, row]))

  return transactions.map((transaction) => {
    const onboardingRow = onboardingByTransactionId.get(transaction.id) || null
    const listing = listingById.get(transaction.listing_id) || {}
    const onboardingFormData = extractFormData(onboardingRow)
    const sellerFormData = extractSellerFormData(listing)
    return {
      transaction,
      onboardingFormData,
      sellerFormData,
      listing,
      profile: classifyTransaction({ transaction, onboardingFormData, sellerFormData, listing }),
    }
  })
}

function selectCohortSamples(auditRows = [], maxPerCohort = DEFAULT_MAX_PER_COHORT) {
  const selectedIds = new Set()
  const cohorts = COHORTS.map((cohort) => {
    const matches = auditRows.filter((row) => cohort.match(row.profile))
    const samples = matches.slice(0, maxPerCohort)
    for (const row of samples) selectedIds.add(row.transaction.id)
    return {
      key: cohort.key,
      label: cohort.label,
      available: matches.length,
      sampled: samples.map((row) => row.transaction.id),
      status: matches.length ? 'covered' : 'not_found_in_live_sample',
    }
  })

  if (!selectedIds.size) {
    for (const row of auditRows.slice(0, Math.min(3, auditRows.length))) selectedIds.add(row.transaction.id)
  }

  return {
    cohorts,
    selectedRows: auditRows.filter((row) => selectedIds.has(row.transaction.id)),
  }
}

function keySummary(rows = []) {
  return rows.map((row) => row.document_key || row.key).filter(Boolean).sort()
}

function summarizeDryRunResult(row, result = {}) {
  const keys = keySummary(result.rows || [])
  return {
    transactionId: row.transaction.id,
    createdAt: row.transaction.created_at || null,
    listingIdPresent: Boolean(row.transaction.listing_id),
    unitIdPresent: Boolean(row.transaction.unit_id),
    profile: row.profile,
    dryRun: result.dryRun === true,
    skipped: result.skipped === true,
    reason: result.reason || null,
    requestedAudience: result.requestedAudience || 'auto',
    derivedAudience: result.derivedAudience || result.audience || null,
    coverage: result.coverage || null,
    rowCount: keys.length,
    synced: result.synced || 0,
    includesSellerTaxNumber: keys.includes('seller_tax_number'),
    includesSellerBankConfirmation: keys.includes('seller_bank_account_confirmation'),
    pendingPolicySkipped: result.skippedPendingPolicyKeys || [],
    keys,
  }
}

async function run() {
  const options = parseArgs()
  const env = {
    ...readEnvFile('.env'),
    ...readEnvFile('.env.staging.local'),
    ...process.env,
  }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')

  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const auditRows = await fetchAuditRows(client, options)
  const { cohorts, selectedRows } = selectCohortSamples(auditRows, options.maxPerCohort)
  const selectedById = new Map(selectedRows.map((row) => [row.transaction.id, row]))
  const transactionIds = selectedRows.map((row) => row.transaction.id)
  const details = new Map()

  const summary = await runCanonicalDocumentRequestRecalculationBatch({
    transactionIds,
    options: { audience: 'auto' },
    async syncTransaction(transactionId, syncOptions) {
      const row = selectedById.get(transactionId)
      if (!row) return { skipped: true, reason: 'transaction_not_selected', rows: [], synced: 0 }
      const result = await syncCanonicalRequiredDocumentsForTransactionContext({
        client,
        transactionId,
        transaction: row.transaction,
        onboardingFormData: row.onboardingFormData,
        sellerFormData: row.sellerFormData,
        listing: row.listing,
        audience: syncOptions.audience || 'auto',
        dryRun: true,
      })
      details.set(transactionId, summarizeDryRunResult(row, result))
      return result
    },
  })

  const missingCohorts = cohorts.filter((cohort) => cohort.status !== 'covered').map((cohort) => cohort.key)
  const dryRunResults = summary.results.map((result) => details.get(result.transactionId) || result)
  const report = {
    phase: 'document_request_phase10_wider_dry_run_audit',
    generatedAt: new Date().toISOString(),
    dryRun: true,
    commit: false,
    mutatedData: false,
    scannedTransactions: auditRows.length,
    sampledTransactions: transactionIds.length,
    cohortCoverage: cohorts,
    missingCohorts,
    summary: {
      version: summary.version,
      total: summary.total,
      completed: summary.completed,
      failed: summary.failed,
      skipped: summary.skipped,
      rowsCalculated: summary.rows,
      synced: summary.synced,
      wroteRows: false,
    },
    results: dryRunResults,
  }

  await mkdir(path.dirname(options.output), { recursive: true })
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
}

run().catch((error) => {
  console.error(error?.stack || error?.message || error)
  process.exitCode = 1
})
