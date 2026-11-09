// Extracted read path; queries, filters, mapping and cache behaviour are preserved.
import { isMissingColumnError, requireClient, isMissingSchemaError } from '../../lib/api/shared/readHelpers.js'
import { normalizeDevelopmentUnitRow, fetchUnitsBase, hydrateUnitRows } from '../developments/unitReadApi.js'
import { normalizeStage, dedupeTransactionRows, normalizeMainStage, latestTimestamp } from '../../core/transactions/legacyReadModel.js'
import { createPerfTimer } from '../../lib/performanceTrace'
import { readTimedCache, unitSummaryCache, TRANSACTION_SUMMARY_CACHE_TTL_MS, unitSummaryInFlight, writeTimedCache } from './readCache.js'
import { financeTypeMatchesFilter } from '../../core/transactions/financeType'
import { selectWithoutKnownMissingColumns, registerKnownMissingColumns } from '../../lib/api/shared/schemaReadCompatibility.js'
import { enrichRowsWithReadinessContext } from './readinessReadApi.js'

export function normalizeStoredTransactionType(value, fallback = 'developer_sale') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (!normalized) {
    return fallback
  }

  if (normalized === 'development' || normalized === 'developer_sale') {
    return 'developer_sale'
  }

  if (normalized === 'private' || normalized === 'private_property') {
    return 'private_property'
  }

  return fallback
}

export async function fetchUnitsByIds(client, unitIds = [], developmentId = null) {
  const uniqueUnitIds = [...new Set((unitIds || []).filter(Boolean))]
  if (!uniqueUnitIds.length) {
    return []
  }

  let query = client
    .from('units')
    .select(
      'id, development_id, unit_number, unit_label, phase, block, unit_type, unit_type_id, bedrooms, bathrooms, parking_count, size_sqm, list_price, current_price, price, status, vat_applicable, floorplan_id, catalogue_floorplan_id, structure_node_id, notes, development:developments(id, name)',
    )
    .in('id', uniqueUnitIds)

  if (developmentId && developmentId !== 'all') {
    query = query.eq('development_id', developmentId)
  }

  let result = await query.order('unit_number', { ascending: true })

  if (
    result.error &&
    (isMissingColumnError(result.error, 'unit_label') || isMissingColumnError(result.error, 'list_price') || isMissingColumnError(result.error, 'unit_type_id') || isMissingColumnError(result.error, 'catalogue_floorplan_id') || isMissingColumnError(result.error, 'structure_node_id'))
  ) {
    let fallback = client
      .from('units')
      .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
      .in('id', uniqueUnitIds)

    if (developmentId && developmentId !== 'all') {
      fallback = fallback.eq('development_id', developmentId)
    }

    result = await fallback.order('unit_number', { ascending: true })
  }

  const { data, error } = result
  if (error) {
    throw error
  }

  return (data || []).map((row) => ({
    ...row,
    ...normalizeDevelopmentUnitRow(row),
  }))
}

export async function fetchActiveTransactionUnitIds(client, developmentId = null) {
  let query = client
    .from('transactions')
    .select('id, unit_id, stage, is_active, updated_at, created_at')
    .not('unit_id', 'is', null)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (developmentId && developmentId !== 'all') {
    query = query.eq('development_id', developmentId)
  }

  let result = await query

  if (
    result.error &&
    (isMissingColumnError(result.error, 'is_active') || isMissingColumnError(result.error, 'development_id'))
  ) {
    let fallback = client
      .from('transactions')
      .select('id, unit_id, stage, updated_at, created_at')
      .not('unit_id', 'is', null)
      .order('updated_at', { ascending: false })

    if (developmentId && developmentId !== 'all') {
      fallback = fallback.eq('development_id', developmentId)
    }

    result = await fallback
  }

  if (result.error) {
    throw result.error
  }

  const rows = (result.data || []).filter((item) => {
    if (item?.is_active === false) {
      return false
    }
    return normalizeStage(item?.stage, null) !== 'Available'
  })

  return [...new Set(rows.map((item) => item.unit_id).filter(Boolean))]
}

export async function fetchUnitsDataSummary({
  developmentId = null,
  stage = 'all',
  financeType = 'all',
  activeTransactionsOnly = false,
} = {}) {
  const timer = createPerfTimer('api.fetchUnitsDataSummary', {
    developmentId: developmentId || 'all',
    stage,
    financeType,
    activeTransactionsOnly,
  })
  const cacheKey = JSON.stringify({
    developmentId: developmentId || 'all',
    stage,
    financeType,
    activeTransactionsOnly,
  })
  const cached = readTimedCache(unitSummaryCache, cacheKey, TRANSACTION_SUMMARY_CACHE_TTL_MS)
  if (cached) {
    timer.mark('cache_hit')
    timer.end({ rowCount: cached.length })
    return cached
  }

  if (unitSummaryInFlight.has(cacheKey)) {
    timer.mark('inflight_hit')
    const rows = await unitSummaryInFlight.get(cacheKey)
    timer.end({ rowCount: rows.length })
    return rows
  }

  const loader = (async () => {
    const client = requireClient()
    timer.mark('units_query_start')
    const units = activeTransactionsOnly
      ? await fetchUnitsByIds(client, await fetchActiveTransactionUnitIds(client, developmentId), developmentId)
      : await fetchUnitsBase(client, developmentId)
    timer.mark('units_query_end', { unitCount: units.length })

    timer.mark('hydrate_summary_start')
    const hydratedRows = dedupeTransactionRows(
      await hydrateUnitRows(client, units, {
        includeOperationalSignals: false,
      }),
    )
    timer.mark('hydrate_summary_end', { hydratedCount: hydratedRows.length })

    const rows = dedupeTransactionRows(
      hydratedRows.filter((row) => {
        if (activeTransactionsOnly && !row?.transaction?.id) {
          return false
        }

        const stageMatch = stage === 'all' ? true : row.stage === stage
        const financeMatch = financeTypeMatchesFilter(row.transaction?.finance_type, financeType)

        return stageMatch && financeMatch
      }),
    )

    writeTimedCache(unitSummaryCache, cacheKey, rows)
    timer.end({ rowCount: rows.length })
    return rows
  })()

  unitSummaryInFlight.set(cacheKey, loader)
  try {
    return await loader
  } finally {
    unitSummaryInFlight.delete(cacheKey)
  }
}

export async function fetchUnitsData({
  developmentId = null,
  stage = 'all',
  financeType = 'all',
  activeTransactionsOnly = false,
} = {}) {
  return fetchUnitsDataSummary({
    developmentId,
    stage,
    financeType,
    activeTransactionsOnly,
  })
}

export function inferTransactionType(transaction = {}) {
  const explicitType = normalizeStoredTransactionType(transaction?.transaction_type, '')
  if (explicitType === 'developer_sale') {
    return 'development'
  }
  if (explicitType === 'private_property') {
    return 'private'
  }

  return transaction?.development_id || transaction?.unit_id ? 'development' : 'private'
}

export async function fetchStandaloneTransactionRows(client, { developmentId = null, excludeTransactionIds = [] } = {}) {
  const excluded = new Set((excludeTransactionIds || []).filter(Boolean))

  let baseQuery = client
    .from('transactions')
    .select(
      selectWithoutKnownMissingColumns(
        'id, matter_number, transaction_reference, transaction_type, property_type, development_id, unit_id, buyer_id, property_address_line_1, property_address_line_2, suburb, city, province, postal_code, property_description, matter_owner, sales_price, purchase_price, finance_type, purchaser_type, finance_managed_by, stage, current_main_stage, current_sub_stage_summary, risk_status, stage_date, sale_date, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, bank, expected_transfer_date, next_action, comment, owner_user_id, access_level, is_active, lifecycle_state, attorney_stage, operational_state, waiting_on_role, registration_date, title_deed_number, registered_at, completed_at, archived_at, cancelled_at, last_meaningful_activity_at, final_report_generated_at, updated_at, created_at',
      ),
    )

  if (developmentId) {
    baseQuery = baseQuery.eq('development_id', developmentId)
  }

  let query = await baseQuery

  if (
    query.error &&
    (isMissingColumnError(query.error, 'transaction_type') ||
      isMissingColumnError(query.error, 'matter_number') ||
      isMissingColumnError(query.error, 'property_type') ||
      isMissingColumnError(query.error, 'property_address_line_1') ||
      isMissingColumnError(query.error, 'lifecycle_state') ||
      isMissingColumnError(query.error, 'attorney_stage') ||
      isMissingColumnError(query.error, 'operational_state') ||
      isMissingColumnError(query.error, 'waiting_on_role') ||
      isMissingColumnError(query.error, 'registration_date') ||
      isMissingColumnError(query.error, 'title_deed_number') ||
      isMissingColumnError(query.error, 'owner_user_id') ||
      isMissingColumnError(query.error, 'access_level') ||
      isMissingColumnError(query.error, 'registered_at') ||
      isMissingColumnError(query.error, 'completed_at') ||
      isMissingColumnError(query.error, 'archived_at') ||
      isMissingColumnError(query.error, 'cancelled_at') ||
      isMissingColumnError(query.error, 'last_meaningful_activity_at') ||
      isMissingColumnError(query.error, 'final_report_generated_at'))
  ) {
    registerKnownMissingColumns(query.error, [
      'transaction_type',
      'property_type',
      'property_address_line_1',
      'lifecycle_state',
      'attorney_stage',
      'operational_state',
      'waiting_on_role',
      'registration_date',
      'title_deed_number',
      'owner_user_id',
      'access_level',
      'registered_at',
      'completed_at',
      'archived_at',
      'cancelled_at',
      'last_meaningful_activity_at',
      'final_report_generated_at',
    ])
    let fallbackQuery = client
      .from('transactions')
      .select(
        selectWithoutKnownMissingColumns(
          'id, development_id, unit_id, buyer_id, sales_price, purchase_price, finance_type, purchaser_type, finance_managed_by, stage, current_main_stage, current_sub_stage_summary, risk_status, stage_date, sale_date, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, bank, expected_transfer_date, next_action, comment, is_active, lifecycle_state, attorney_stage, operational_state, waiting_on_role, registration_date, title_deed_number, registered_at, completed_at, archived_at, cancelled_at, last_meaningful_activity_at, final_report_generated_at, updated_at, created_at',
        ),
      )

    if (developmentId) {
      fallbackQuery = fallbackQuery.eq('development_id', developmentId)
    }

    query = await fallbackQuery
  }

  if (query.error && isMissingColumnError(query.error)) {
    let legacyFallbackQuery = client
      .from('transactions')
      .select(
        'id, development_id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at',
      )

    if (developmentId) {
      legacyFallbackQuery = legacyFallbackQuery.eq('development_id', developmentId)
    }

    query = await legacyFallbackQuery
  }

  if (query.error) {
    throw query.error
  }

  const sourceRows = (query.data || [])
    .filter((transaction) => !excluded.has(transaction.id))
    .filter((transaction) => transaction?.is_active !== false)
    .filter((transaction) => !transaction?.unit_id)
    .filter((transaction) => (developmentId ? transaction?.development_id === developmentId : true))

  if (!sourceRows.length) {
    return []
  }

  const buyerIds = [...new Set(sourceRows.map((transaction) => transaction?.buyer_id).filter(Boolean))]
  const developmentIds = [...new Set(sourceRows.map((transaction) => transaction?.development_id).filter(Boolean))]
  let buyersById = {}
  let developmentsById = {}

  if (buyerIds.length) {
    const buyersQuery = await client
      .from('buyers')
      .select(selectWithoutKnownMissingColumns('id, name, phone, email'))
      .in('id', buyerIds)

    if (buyersQuery.error) {
      throw buyersQuery.error
    }

    buyersById = (buyersQuery.data || []).reduce((accumulator, buyer) => {
      accumulator[buyer.id] = buyer
      return accumulator
    }, {})
  }

  if (developmentIds.length) {
    const developmentsQuery = await client.from('developments').select('id, name, location').in('id', developmentIds)
    if (developmentsQuery.error && !isMissingSchemaError(developmentsQuery.error)) {
      throw developmentsQuery.error
    }

    developmentsById = (developmentsQuery.data || []).reduce((accumulator, item) => {
      accumulator[item.id] = item
      return accumulator
    }, {})
  }

  return sourceRows.map((transaction) => {
    const stage = normalizeStage(transaction?.stage, null)
    return {
      unit: null,
      development: transaction?.development_id ? developmentsById[transaction.development_id] || null : null,
      transaction: {
        ...transaction,
        transaction_type: inferTransactionType(transaction),
      },
      buyer: transaction?.buyer_id ? buyersById[transaction.buyer_id] || null : null,
      stage,
      mainStage: normalizeMainStage(transaction?.current_main_stage, stage),
    }
  })
}

export async function fetchTransactionsData({ developmentId = null } = {}) {
  const client = requireClient()
  const unitRows = await fetchUnitsData({
    developmentId,
    stage: 'all',
    financeType: 'all',
  })
  const transactionRows = unitRows.filter((row) => row.transaction)
  const standaloneRows = await fetchStandaloneTransactionRows(client, {
    developmentId,
    excludeTransactionIds: transactionRows.map((row) => row?.transaction?.id).filter(Boolean),
  })
  const combinedRows = dedupeTransactionRows([...transactionRows, ...standaloneRows])
  const enrichedRows = dedupeTransactionRows(await enrichRowsWithReadinessContext(client, combinedRows))

  return enrichedRows.sort((a, b) => new Date(latestTimestamp(b) || 0) - new Date(latestTimestamp(a) || 0))
}
