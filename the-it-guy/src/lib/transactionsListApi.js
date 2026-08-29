import { MAIN_PROCESS_STAGES, STAGES, getMainStageFromDetailedStage, normalizeStageLabel } from '../core/transactions/stageConfig'
import { financeTypeMatchesFilter } from '../core/transactions/financeType'
import { supabase } from './supabaseClient'

const SELECT = 'id, organisation_id, owner_user_id, matter_number, transaction_reference, transaction_type, property_type, development_id, unit_id, buyer_id, property_address_line_1, suburb, city, property_description, sales_price, purchase_price, finance_type, purchaser_type, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, bank, next_action, expected_transfer_date, finance_status, attorney_stage, risk_status, operational_state, missing_documents_count, uploaded_documents_count, total_required_documents, updated_at, created_at, is_active'
const FALLBACK_SELECT = 'id, organisation_id, development_id, unit_id, buyer_id, finance_type, purchaser_type, purchase_price, sales_price, stage, attorney, bond_originator, next_action, updated_at, created_at'
const TTL_MS = 60_000
const cache = new Map()
const inflight = new Map()

const text = (value) => String(value || '').trim()
const comparable = (value) => text(value).toLowerCase()
const missingSchema = (error) => ['42P01', '42703', 'PGRST204'].includes(text(error?.code).toUpperCase()) || comparable(error?.message).includes('does not exist') || comparable(error?.message).includes('schema cache')
const index = (rows) => Object.fromEntries((rows || []).filter((row) => row?.id).map((row) => [row.id, row]))

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

async function cached(key, loader) {
  const hit = cache.get(key)
  if (hit?.expiresAt > Date.now()) return hit.rows
  if (inflight.has(key)) return inflight.get(key)
  const request = loader().then((rows) => {
    cache.set(key, { rows, expiresAt: Date.now() + TTL_MS })
    return rows
  }).finally(() => inflight.delete(key))
  inflight.set(key, request)
  return request
}

async function transactionRows({ developmentId = null, organisationId = '' } = {}) {
  let query = supabase.from('transactions').select(SELECT)
  if (developmentId) query = query.eq('development_id', developmentId)
  if (organisationId) query = query.eq('organisation_id', organisationId)
  let result = await query
  if (result.error && missingSchema(result.error)) {
    let fallback = supabase.from('transactions').select(FALLBACK_SELECT)
    if (developmentId) fallback = fallback.eq('development_id', developmentId)
    if (organisationId) fallback = fallback.eq('organisation_id', organisationId)
    result = await fallback
  }
  if (result.error) throw result.error
  return (result.data || []).filter((row) => row?.is_active !== false)
}

async function hydrate(transactions) {
  const buyerIds = [...new Set(transactions.map((row) => row?.buyer_id).filter(Boolean))]
  const unitIds = [...new Set(transactions.map((row) => row?.unit_id).filter(Boolean))]
  const developmentIds = new Set(transactions.map((row) => row?.development_id).filter(Boolean))
  const [buyerResult, unitResult] = await Promise.all([
    buyerIds.length ? supabase.from('buyers').select('id, name, phone, email').in('id', buyerIds) : { data: [], error: null },
    unitIds.length ? supabase.from('units').select('id, development_id, unit_number, phase, price, status').in('id', unitIds) : { data: [], error: null },
  ])
  if (buyerResult.error && !missingSchema(buyerResult.error)) throw buyerResult.error
  if (unitResult.error && !missingSchema(unitResult.error)) throw unitResult.error
  for (const unit of unitResult.data || []) if (unit.development_id) developmentIds.add(unit.development_id)
  const developmentResult = developmentIds.size ? await supabase.from('developments').select('id, name, location').in('id', [...developmentIds]) : { data: [], error: null }
  if (developmentResult.error && !missingSchema(developmentResult.error)) throw developmentResult.error
  const buyers = index(buyerResult.data)
  const units = index(unitResult.data)
  const developments = index(developmentResult.data)
  return transactions.map((transaction) => {
    const unit = units[transaction.unit_id] || null
    const development = developments[transaction.development_id || unit?.development_id] || null
    const stage = stageFor(transaction.stage, unit?.status)
    return { unit, development, transaction, buyer: buyers[transaction.buyer_id] || null, stage, mainStage: mainStageFor(transaction.current_main_stage, stage), handover: null, snagSummary: { totalCount: 0, openCount: 0, latestUpdatedAt: null, status: 'clear' }, onboarding: null, documentSummary: { uploadedCount: Number(transaction.uploaded_documents_count || 0), totalRequired: Number(transaction.total_required_documents || 0), missingCount: Number(transaction.missing_documents_count || 0) } }
  }).sort((a, b) => new Date(b.transaction?.updated_at || b.transaction?.created_at || 0) - new Date(a.transaction?.updated_at || a.transaction?.created_at || 0))
}

function filtered(rows, { stage = 'all', financeType = 'all', activeTransactionsOnly = true } = {}) {
  return rows.filter((row) => (!activeTransactionsOnly || row.transaction?.is_active !== false) && (stage === 'all' || row.stage === stage) && (financeType === 'all' || financeTypeMatchesFilter(row.transaction?.finance_type, financeType)))
}

export function preloadTransactionsListApi() {
  return Promise.resolve()
}

export function fetchTransactionsListSummary(options = {}) {
  const normalized = { ...options, organisationId: text(options.organisationId) }
  return cached(`list:${JSON.stringify(normalized)}`, async () => filtered(await hydrate(await transactionRows(normalized)), normalized))
}

export async function fetchTransactionsByParticipantSummary({ userId, roleType = null, organisationId = '' } = {}) {
  if (!userId) return []
  return cached(`participant:${userId}:${roleType}:${organisationId}`, async () => {
    const [profileResult, participantResult, rows] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, role').eq('id', userId).maybeSingle(),
      supabase.from('transaction_participants').select('transaction_id, status, removed_at').eq('user_id', userId),
      fetchTransactionsListSummary({ organisationId, activeTransactionsOnly: true }),
    ])
    if (profileResult.error && !missingSchema(profileResult.error)) throw profileResult.error
    if (participantResult.error && !missingSchema(participantResult.error)) throw participantResult.error
    const profile = profileResult.data || { id: userId }
    const ids = new Set((participantResult.data || []).filter((row) => !row.removed_at && comparable(row.status || 'active') !== 'removed').map((row) => row.transaction_id))
    const role = comparable(roleType || profile.role)
    if (['admin', 'internal_admin', 'platform_admin'].includes(role)) return rows
    return rows.filter(({ transaction }) => {
      if (ids.has(transaction.id) || transaction.owner_user_id === userId) return true
      const email = comparable(profile.email)
      const name = comparable(profile.full_name)
      if (role === 'agent') return (email && comparable(transaction.assigned_agent_email) === email) || (name && comparable(transaction.assigned_agent) === name)
      if (role === 'attorney') return (email && comparable(transaction.assigned_attorney_email) === email) || (name && comparable(transaction.attorney) === name)
      if (role === 'bond_originator') return (email && comparable(transaction.assigned_bond_originator_email) === email) || (name && comparable(transaction.bond_originator) === name)
      return false
    })
  })
}

export async function fetchUnitsDataSummary(options = {}) {
  const rows = await fetchTransactionsListSummary(options)
  if (options.activeTransactionsOnly) return rows
  let query = supabase.from('units').select('id, development_id, unit_number, phase, price, status')
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
