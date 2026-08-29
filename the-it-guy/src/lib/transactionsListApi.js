import { MAIN_PROCESS_STAGES, STAGES, getMainStageFromDetailedStage, normalizeStageLabel } from '../core/transactions/stageConfig'
import { financeTypeMatchesFilter } from '../core/transactions/financeType'
import { supabase } from './supabaseClient'

const SELECT = 'id, organisation_id, owner_user_id, matter_number, transaction_reference, transaction_type, property_type, development_id, unit_id, buyer_id, property_address_line_1, suburb, city, property_description, sales_price, purchase_price, finance_type, purchaser_type, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, bank, next_action, expected_transfer_date, finance_status, attorney_stage, risk_status, operational_state, missing_documents_count, uploaded_documents_count, total_required_documents, updated_at, created_at, is_active'
const FALLBACK_SELECT = 'id, organisation_id, development_id, unit_id, buyer_id, finance_type, purchaser_type, purchase_price, sales_price, stage, attorney, bond_originator, next_action, updated_at, created_at'
const SUMMARY_RELATIONS = 'buyer:buyers(id, name, phone, email), unit:units(id, development_id, unit_number, phase, price, status, development:developments(id, name, location)), development:developments(id, name, location)'
const SUMMARY_SELECT = `${SELECT}, ${SUMMARY_RELATIONS}`
const SUMMARY_FALLBACK_SELECT = `${FALLBACK_SELECT}, ${SUMMARY_RELATIONS}`
const TTL_MS = 60_000
const cache = new Map()
const inflight = new Map()
let cacheGeneration = 0

const text = (value) => String(value || '').trim()
const comparable = (value) => text(value).toLowerCase()
const missingSchema = (error) => ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205'].includes(text(error?.code).toUpperCase()) || comparable(error?.message).includes('does not exist') || comparable(error?.message).includes('schema cache')
const missingColumn = (error, column) => missingSchema(error) && comparable(error?.message).includes(comparable(column))
const one = (value) => Array.isArray(value) ? value[0] || null : value || null

function stageFor(stage, status = 'Available') {
  const primary = normalizeStageLabel(stage)
  if (STAGES.includes(primary)) return primary
  const fallback = normalizeStageLabel(status)
  return STAGES.includes(fallback) ? fallback : 'Available'
}

function mainStageFor(mainStage, stage) {
  const normalized = text(mainStage).toUpperCase()
  return MAIN_PROCESS_STAGES.includes(normalized) ? normalized : getMainStageFromDetailedStage(stage)
}

async function cached(key, loader, { forceRefresh = false } = {}) {
  const hit = cache.get(key)
  if (!forceRefresh && hit?.expiresAt > Date.now()) return hit.rows
  if (inflight.has(key)) return inflight.get(key)
  const requestGeneration = cacheGeneration
  const request = loader().then((rows) => {
    if (requestGeneration === cacheGeneration) {
      cache.set(key, { rows, expiresAt: Date.now() + TTL_MS })
    }
    return rows
  }).finally(() => {
    if (inflight.get(key) === request) inflight.delete(key)
  })
  inflight.set(key, request)
  return request
}

function normalizedIdentity(identityContext = {}) {
  return {
    email: comparable(identityContext.email),
    fullName: text(identityContext.fullName || identityContext.full_name || identityContext.name),
  }
}

function participantCacheKey(options = {}) {
  const identity = normalizedIdentity(options.identityContext)
  return `participant:${text(options.userId)}:${comparable(options.roleType)}:${text(options.organisationId)}:${identity.email}:${comparable(identity.fullName)}`
}

function listCacheKey(options = {}) {
  return `list:${JSON.stringify({
    organisationId: text(options.organisationId),
    developmentId: options.developmentId || null,
    stage: options.stage || 'all',
    financeType: options.financeType || 'all',
    activeTransactionsOnly: options.activeTransactionsOnly !== false,
  })}`
}

async function resolveIdentity(client, userId, identityContext = {}) {
  const supplied = normalizedIdentity(identityContext)
  if (supplied.email || supplied.fullName) return supplied
  const result = await client.from('profiles').select('email, full_name').eq('id', userId).maybeSingle()
  if (result.error && !missingSchema(result.error)) throw result.error
  return normalizedIdentity(result.data || {})
}

async function participantTransactionIds(client, { identityColumn, identityValue, roleType, organisationId }) {
  if (!identityColumn || !identityValue) return []
  const relation = organisationId ? ', transaction:transactions!inner(organisation_id)' : ''
  const run = async (includeStatus = true) => {
    let query = client
      .from('transaction_participants')
      .select(`transaction_id, role_type${includeStatus ? ', status, removed_at' : ''}${relation}`)
      .eq(identityColumn, identityValue)
    if (roleType) query = query.eq('role_type', roleType)
    if (organisationId) query = query.eq('transaction.organisation_id', organisationId)
    return query
  }
  let result = await run(true)
  if (result.error && (missingColumn(result.error, 'status') || missingColumn(result.error, 'removed_at'))) {
    result = await run(false)
  }
  if (result.error) {
    if (missingSchema(result.error)) return []
    throw result.error
  }
  return (result.data || [])
    .filter((row) => !row?.removed_at && comparable(row?.status || 'active') !== 'removed')
    .map((row) => row?.transaction_id)
    .filter(Boolean)
}

async function assignedTransactionIds(client, { column, value, organisationId, comparison = 'eq' }) {
  if (!column || !value) return []
  let query = client.from('transactions').select('id')
  if (organisationId) query = query.eq('organisation_id', organisationId)
  query = comparison === 'ilike' ? query.ilike(column, value) : query.eq(column, value)
  const result = await query
  if (result.error) {
    if (missingSchema(result.error)) return []
    throw result.error
  }
  return (result.data || []).map((row) => row?.id).filter(Boolean)
}

async function resolveAccessibleTransactionIds(client, {
  userId,
  roleType = null,
  organisationId = '',
  identityContext = {},
} = {}) {
  const role = comparable(roleType)
  const scopedOrganisationId = text(organisationId)
  if (!userId || (role === 'agent' && !scopedOrganisationId)) return []

  const byUserPromise = participantTransactionIds(client, {
    identityColumn: 'user_id',
    identityValue: userId,
    roleType: role,
    organisationId: scopedOrganisationId,
  })
  const identity = await resolveIdentity(client, userId, identityContext)
  const assignmentColumns = {
    agent: { email: 'assigned_agent_email', name: 'assigned_agent' },
    attorney: { email: 'assigned_attorney_email', name: 'attorney' },
    bond_originator: { email: 'assigned_bond_originator_email', name: 'bond_originator' },
  }[role] || {}
  const idGroups = await Promise.all([
    byUserPromise,
    participantTransactionIds(client, {
      identityColumn: 'participant_email',
      identityValue: identity.email,
      roleType: role,
      organisationId: scopedOrganisationId,
    }),
    assignedTransactionIds(client, {
      column: 'owner_user_id',
      value: userId,
      organisationId: scopedOrganisationId,
    }),
    assignedTransactionIds(client, {
      column: assignmentColumns.email,
      value: identity.email,
      organisationId: scopedOrganisationId,
      comparison: 'ilike',
    }),
    assignedTransactionIds(client, {
      column: assignmentColumns.name,
      value: identity.fullName,
      organisationId: scopedOrganisationId,
      comparison: 'ilike',
    }),
  ])
  return [...new Set(idGroups.flat().filter(Boolean))]
}

function normalizeSummaryRows(transactions = []) {
  return transactions.map((source) => {
    const buyer = one(source?.buyer)
    const rawUnit = one(source?.unit)
    const nestedDevelopment = one(rawUnit?.development)
    const directDevelopment = one(source?.development)
    const unit = rawUnit ? { ...rawUnit } : null
    if (unit) delete unit.development
    const transaction = { ...source }
    delete transaction.buyer
    delete transaction.unit
    delete transaction.development
    const development = directDevelopment || nestedDevelopment
    const stage = stageFor(transaction.stage, unit?.status)
    return {
      unit,
      development,
      transaction,
      buyer,
      stage,
      mainStage: mainStageFor(transaction.current_main_stage, stage),
      handover: null,
      snagSummary: { totalCount: 0, openCount: 0, latestUpdatedAt: null, status: 'clear' },
      onboarding: null,
      documentSummary: {
        uploadedCount: Number(transaction.uploaded_documents_count || 0),
        totalRequired: Number(transaction.total_required_documents || 0),
        missingCount: Number(transaction.missing_documents_count || 0),
      },
    }
  }).sort((a, b) => new Date(b.transaction?.updated_at || b.transaction?.created_at || 0) - new Date(a.transaction?.updated_at || a.transaction?.created_at || 0))
}

async function transactionRows(client, {
  transactionIds = null,
  developmentId = null,
  organisationId = '',
  activeTransactionsOnly = true,
} = {}) {
  if (Array.isArray(transactionIds) && transactionIds.length === 0) return []
  let query = client.from('transactions').select(SUMMARY_SELECT)
  if (Array.isArray(transactionIds)) query = query.in('id', transactionIds)
  if (developmentId) query = query.eq('development_id', developmentId)
  if (organisationId) query = query.eq('organisation_id', organisationId)
  if (activeTransactionsOnly) query = query.eq('is_active', true)
  let result = await query
  if (result.error && missingSchema(result.error)) {
    let fallback = client.from('transactions').select(SUMMARY_FALLBACK_SELECT)
    if (Array.isArray(transactionIds)) fallback = fallback.in('id', transactionIds)
    if (developmentId) fallback = fallback.eq('development_id', developmentId)
    if (organisationId) fallback = fallback.eq('organisation_id', organisationId)
    result = await fallback
  }
  if (result.error) throw result.error
  return normalizeSummaryRows((result.data || []).filter((row) => row?.is_active !== false))
}

function filtered(rows, { stage = 'all', financeType = 'all', activeTransactionsOnly = true } = {}) {
  return rows.filter((row) => (!activeTransactionsOnly || row.transaction?.is_active !== false) && (stage === 'all' || row.stage === stage) && (financeType === 'all' || financeTypeMatchesFilter(row.transaction?.finance_type, financeType)))
}

export function preloadTransactionsListApi({ mode = 'participant', ...options } = {}) {
  return mode === 'organisation'
    ? fetchTransactionsListSummary(options)
    : fetchTransactionsByParticipantSummary(options)
}

export function invalidateTransactionsListCache() {
  cacheGeneration += 1
  cache.clear()
  inflight.clear()
}

export function fetchTransactionsListSummary(options = {}) {
  const client = options.client || supabase
  const normalized = { ...options, organisationId: text(options.organisationId) }
  return cached(
    listCacheKey(normalized),
    async () => filtered(await transactionRows(client, normalized), normalized),
    { forceRefresh: options.forceRefresh === true },
  )
}

export async function fetchTransactionsByParticipantSummary(options = {}) {
  const {
    userId,
    roleType = null,
    organisationId = '',
    identityContext = {},
  } = options
  if (!userId) return []
  const client = options.client || supabase
  const normalized = {
    userId,
    roleType: comparable(roleType),
    organisationId: text(organisationId),
    identityContext,
  }
  return cached(participantCacheKey(normalized), async () => {
    const transactionIds = await resolveAccessibleTransactionIds(client, normalized)
    return transactionRows(client, {
      transactionIds,
      organisationId: normalized.organisationId,
      activeTransactionsOnly: true,
    })
  }, { forceRefresh: options.forceRefresh === true })
}

export async function fetchUnitsDataSummary(options = {}) {
  const client = options.client || supabase
  const rows = await fetchTransactionsListSummary(options)
  if (options.activeTransactionsOnly) return rows
  let query = client.from('units').select('id, development_id, unit_number, phase, price, status')
  if (options.developmentId) query = query.eq('development_id', options.developmentId)
  const result = await query
  if (result.error) throw result.error
  const represented = new Set(rows.map((row) => row.unit?.id).filter(Boolean))
  const empty = (result.data || []).filter((unit) => !represented.has(unit.id)).map((unit) => ({ unit, development: null, transaction: null, buyer: null, stage: stageFor(null, unit.status), mainStage: mainStageFor(null, stageFor(null, unit.status)), handover: null, snagSummary: { totalCount: 0, openCount: 0, latestUpdatedAt: null, status: 'clear' }, onboarding: null, documentSummary: { uploadedCount: 0, totalRequired: 0, missingCount: 0 } }))
  return filtered([...rows, ...empty], options)
}

export async function fetchDevelopmentOptions({ developmentIds = [], organisationId = '' } = {}) {
  let query = supabase.from('developments').select('id, name, location').order('name')
  if (organisationId) query = query.eq('organisation_id', organisationId)
  if (developmentIds.length) query = query.in('id', developmentIds)
  let result = await query
  if (result.error && organisationId && missingSchema(result.error)) result = await supabase.from('developments').select('id, name, location').order('name')
  if (result.error) throw result.error
  return result.data || []
}

let legacyPromise
const legacy = (method, ...args) => (legacyPromise ||= import('./api')).then((api) => api[method](...args))
// Mutations and detail prefetches are loaded only after an explicit user action.
export const enrichRowsWithBondIntakeContext = (rows) => legacy('enrichRowsWithBondIntakeContext', rows)
export const deleteTransactionEverywhere = (options) => legacy('deleteTransactionEverywhere', options)
export const prefetchUnitWorkspaceShell = (unitId) => legacy('prefetchUnitWorkspaceShell', unitId)
export const saveDeveloperTransactionWorkspace = (options) => legacy('saveDeveloperTransactionWorkspace', options)
