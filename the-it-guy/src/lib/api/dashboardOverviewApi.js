import { supabase } from '../supabaseClient'
import {
  CANONICAL_TRANSACTION_STAGES,
  MAIN_PROCESS_STAGES,
  getMainStageFromDetailedStage,
  isInTransferStage,
  normalizeStageLabel,
} from '../../core/transactions/stageConfig'

const HANDOVER_STATUSES = ['not_started', 'in_progress', 'completed']
const TRANSACTION_HANDOVER_SELECT = `
  id,
  transaction_id,
  development_id,
  unit_id,
  buyer_id,
  status,
  handover_date,
  electricity_meter_reading,
  water_meter_reading,
  gas_meter_reading,
  keys_handed_over,
  remote_handed_over,
  manuals_handed_over,
  inspection_completed,
  notes,
  signature_name,
  signature_signed_at,
  created_at,
  updated_at
`
const TRANSACTION_COMMISSION_SNAPSHOTS_ENABLED = import.meta.env.VITE_ENABLE_TRANSACTION_COMMISSION_SNAPSHOTS === 'true'

const knownMissingSchemaColumns = new Set()
let transactionCommissionSnapshotsAvailable = TRANSACTION_COMMISSION_SNAPSHOTS_ENABLED

function scopeQueryToUnitIds(query, unitIds = []) {
  return query.in('unit_id', unitIds)
}

export function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY to .env.')
  }

  return supabase
}

export function isMissingTableError(error, tableName) {
  if (!error) {
    return false
  }

  const status = Number(error.status || error.statusCode || 0)
  const code = String(error.code || '').toUpperCase()
  const message = String(error.message || '').toLowerCase()
  if (message.includes('permission denied')) {
    return false
  }
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'NOT_FOUND' ||
    status === 404 ||
    message.includes('relation does not exist') ||
    message.includes('schema cache') ||
    message.includes(`could not find the table '${String(tableName || '').toLowerCase()}'`) ||
    message.includes(`could not find the '${String(tableName || '').toLowerCase()}' table`)
  )
}

export function isMissingColumnError(error, columnName) {
  if (!error) {
    return false
  }

  const status = Number(error.status || error.statusCode || 0)
  const code = String(error.code || '').toUpperCase()
  const message = String(error.message || '').toLowerCase()
  const details = String(error.details || '').toLowerCase()
  const hint = String(error.hint || '').toLowerCase()
  const normalizedColumnName = String(columnName || '')
    .trim()
    .toLowerCase()
  if (message.includes('permission denied')) {
    return false
  }
  const missingColumnByCode = code === '42703' || code === 'PGRST204' || code === 'PGRST116'
  const hasNamedColumnMatch = normalizedColumnName
    ? message.includes(normalizedColumnName) ||
      details.includes(normalizedColumnName) ||
      hint.includes(normalizedColumnName)
    : true
  if (missingColumnByCode) {
    return hasNamedColumnMatch
  }
  if (status === 400 && message.includes('column') && message.includes('does not exist')) {
    return hasNamedColumnMatch
  }
  return normalizedColumnName
    ? message.includes('column') && message.includes(normalizedColumnName)
    : message.includes('column')
}

export function isPermissionDeniedError(error) {
  if (!error) {
    return false
  }

  const message = String(error.message || '').toLowerCase()
  return error.code === '42501' || message.includes('permission denied')
}

export function isMissingSchemaError(error) {
  if (!error) {
    return false
  }

  return ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error.code)
}

export function registerKnownMissingColumns(error, columnNames = []) {
  if (!error) {
    return false
  }

  let registered = false
  const message = String(error.message || '')
  const details = String(error.details || '')
  const hint = String(error.hint || '')
  const parseSources = [message, details, hint]
  const regexes = [
    /column\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s+does not exist/gi,
    /could not find the ['"]([a-zA-Z0-9_]+)['"] column/gi,
    /['"]([a-zA-Z0-9_]+)['"]\s+column/gi,
  ]

  for (const source of parseSources) {
    for (const pattern of regexes) {
      pattern.lastIndex = 0
      let match = pattern.exec(source)
      while (match) {
        const normalized = String(match[1] || '')
          .trim()
          .toLowerCase()
        if (normalized && !knownMissingSchemaColumns.has(normalized)) {
          knownMissingSchemaColumns.add(normalized)
          registered = true
        }
        match = pattern.exec(source)
      }
    }
  }

  for (const columnName of columnNames) {
    const normalized = String(columnName || '')
      .trim()
      .toLowerCase()
    if (!normalized) {
      continue
    }
    if (isMissingColumnError(error, normalized)) {
      knownMissingSchemaColumns.add(normalized)
      registered = true
    }
  }

  return registered
}

export function selectWithoutKnownMissingColumns(selectClause) {
  const clause = String(selectClause || '').trim()
  if (!clause || !knownMissingSchemaColumns.size) {
    return clause
  }

  const fields = clause
    .split(',')
    .map((part) => String(part || '').trim())
    .filter(Boolean)

  const filtered = fields.filter((field) => {
    const normalizedField = field
      .replace(/\s+as\s+.+$/i, '')
      .trim()
      .toLowerCase()
    return !knownMissingSchemaColumns.has(normalizedField)
  })

  return (filtered.length ? filtered : fields).join(', ')
}

export function normalizeTextValue(value) {
  const text = String(value || '').trim()
  return text
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    return null
  }

  return parsed
}

function normalizeNullableBoolean(value) {
  if (value === true || value === false) {
    return value
  }
  if (value === null || value === undefined || value === '') {
    return null
  }
  if (typeof value === 'number') {
    return value === 1 ? true : value === 0 ? false : null
  }

  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (['yes', 'y', 'true', '1'].includes(normalized)) return true
  if (['no', 'n', 'false', '0'].includes(normalized)) return false
  return null
}

function normalizeDevelopmentUnitRow(row = {}) {
  const rawFloorplanId = row.floorplan_id || row.floorplanId || null
  const normalizedFloorplanId =
    typeof rawFloorplanId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawFloorplanId)
      ? rawFloorplanId
      : null

  return {
    id: row.id || null,
    developmentId: row.development_id || row.developmentId || null,
    unitNumber: normalizeTextValue(row.unit_number ?? row.unitNumber),
    unitLabel: normalizeTextValue(row.unit_label ?? row.unitLabel),
    phase: normalizeTextValue(row.phase),
    block: normalizeTextValue(row.block),
    unitType: normalizeTextValue(row.unit_type ?? row.unitType),
    bedrooms: normalizeOptionalNumber(row.bedrooms),
    bathrooms: normalizeOptionalNumber(row.bathrooms),
    parkingCount: normalizeOptionalNumber(row.parking_count ?? row.parkingCount),
    sizeSqm: normalizeOptionalNumber(row.size_sqm ?? row.sizeSqm),
    listPrice: normalizeOptionalNumber(row.list_price ?? row.listPrice ?? row.price),
    currentPrice: normalizeOptionalNumber(row.current_price ?? row.currentPrice ?? row.price),
    price: normalizeOptionalNumber(row.price ?? row.list_price ?? row.listPrice),
    status: normalizeTextValue(row.status) || 'Available',
    vatApplicable: normalizeNullableBoolean(row.vat_applicable ?? row.vatApplicable),
    floorplanId: normalizedFloorplanId,
    notes: normalizeTextValue(row.notes),
  }
}

export function normalizeStage(rawStage, rawStatus) {
  const normalizedStage = normalizeStageLabel(rawStage)
  if (CANONICAL_TRANSACTION_STAGES.includes(normalizedStage)) {
    return normalizedStage
  }

  const normalizedStatus = normalizeStageLabel(rawStatus)
  if (CANONICAL_TRANSACTION_STAGES.includes(normalizedStatus)) {
    return normalizedStatus
  }

  return 'Available'
}

export function normalizeMainStage(rawMainStage, fallbackDetailedStage = 'Available') {
  const normalized = String(rawMainStage || '').toUpperCase()
  if (MAIN_PROCESS_STAGES.includes(normalized)) {
    return normalized
  }

  return getMainStageFromDetailedStage(fallbackDetailedStage)
}

function byUnitNumber(a, b) {
  return String(a.unit.unit_number).localeCompare(String(b.unit.unit_number), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function byDevelopmentThenUnit(a, b) {
  const byName = String(a.development?.name || '').localeCompare(String(b.development?.name || ''), undefined, {
    sensitivity: 'base',
  })

  if (byName !== 0) {
    return byName
  }

  return byUnitNumber(a, b)
}

export function latestTimestamp(row) {
  return row.transaction?.updated_at || row.transaction?.created_at || null
}

function getTransactionRowIdentity(row) {
  const transactionId = row?.transaction?.id
  if (transactionId) {
    return `transaction:${transactionId}`
  }

  const unitId = row?.unit?.id
  if (unitId) {
    return `unit:${unitId}`
  }

  return null
}

function selectPreferredTransactionRow(currentRow, candidateRow) {
  if (!currentRow) {
    return candidateRow
  }

  const transactionUnitId = candidateRow?.transaction?.unit_id || currentRow?.transaction?.unit_id || null
  if (transactionUnitId) {
    const currentMatchesUnit = String(currentRow?.unit?.id || '') === String(transactionUnitId)
    const candidateMatchesUnit = String(candidateRow?.unit?.id || '') === String(transactionUnitId)

    if (candidateMatchesUnit && !currentMatchesUnit) {
      return candidateRow
    }

    if (currentMatchesUnit && !candidateMatchesUnit) {
      return currentRow
    }
  }

  const currentUpdatedAt = new Date(latestTimestamp(currentRow) || 0).getTime()
  const candidateUpdatedAt = new Date(latestTimestamp(candidateRow) || 0).getTime()
  return candidateUpdatedAt >= currentUpdatedAt ? candidateRow : currentRow
}

function dedupeTransactionRows(rows = []) {
  const deduped = new Map()
  const fallbackRows = []

  for (const row of rows || []) {
    const identity = getTransactionRowIdentity(row)
    if (!identity) {
      fallbackRows.push(row)
      continue
    }

    const current = deduped.get(identity)
    deduped.set(identity, selectPreferredTransactionRow(current, row))
  }

  return [...deduped.values(), ...fallbackRows]
}

function buildDashboardMetrics(rows, developmentCount) {
  const totalRevenue = rows.reduce((sum, row) => {
    if (row.stage === 'Available') {
      return sum
    }

    const value = Number(row.transaction?.sales_price ?? row.unit?.price)
    return Number.isFinite(value) ? sum + value : sum
  }, 0)

  return {
    totalDevelopments: developmentCount,
    totalUnits: rows.length,
    activeTransactions: rows.filter((row) => row.transaction && row.stage !== 'Available' && row.stage !== 'Registered')
      .length,
    unitsInTransfer: rows.filter((row) => isInTransferStage(row.stage)).length,
    unitsRegistered: rows.filter((row) => row.stage === 'Registered').length,
    totalRevenue,
  }
}

function buildDevelopmentSummaries(rows) {
  const map = new Map()

  for (const row of rows) {
    const developmentId = row.unit?.development_id || row.development?.id || null
    const developmentName = row.development?.name || 'Unknown Development'
    const existing = map.get(developmentId) || {
      id: developmentId,
      name: developmentName,
      totalUnits: 0,
      unitsSold: 0,
      unitsInTransfer: 0,
      unitsRegistered: 0,
      lastActivity: null,
    }

    existing.totalUnits += 1

    if (row.stage !== 'Available') {
      existing.unitsSold += 1
    }

    if (isInTransferStage(row.stage)) {
      existing.unitsInTransfer += 1
    }

    if (row.stage === 'Registered') {
      existing.unitsRegistered += 1
    }

    const rowActivity = latestTimestamp(row)
    if (rowActivity && (!existing.lastActivity || new Date(rowActivity) > new Date(existing.lastActivity))) {
      existing.lastActivity = rowActivity
    }

    map.set(developmentId, existing)
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function buildAlerts(rows) {
  const waitingBondApproval = rows
    .filter((row) => row.stage === 'Finance Pending')
    .sort((a, b) => new Date(latestTimestamp(b) || 0) - new Date(latestTimestamp(a) || 0))
    .slice(0, 6)

  const waitingAttorneys = rows
    .filter((row) => row.stage === 'Proceed to Attorneys')
    .sort((a, b) => new Date(latestTimestamp(b) || 0) - new Date(latestTimestamp(a) || 0))
    .slice(0, 6)

  const recentUpdates = rows
    .filter((row) => row.transaction)
    .sort((a, b) => new Date(latestTimestamp(b) || 0) - new Date(latestTimestamp(a) || 0))
    .slice(0, 8)

  return {
    waitingBondApproval,
    waitingAttorneys,
    recentUpdates,
  }
}

async function queryClientIssues(client, { unitId = null, unitIds = [] } = {}) {
  const selectVariants = [
    'id, development_id, unit_id, transaction_id, buyer_id, category, description, location, priority, photo_path, signed_off_by, signed_off_at, status, created_at, updated_at',
    'id, development_id, unit_id, transaction_id, buyer_id, category, description, location, priority, photo_path, status, created_at, updated_at',
    'id, development_id, unit_id, buyer_id, category, description, location, priority, photo_path, status, created_at, updated_at',
    'id, development_id, unit_id, buyer_id, category, description, location, priority, status, created_at',
  ]

  let lastError = null

  for (const selectClause of selectVariants) {
    let query = client.from('client_issues').select(selectClause).order('created_at', { ascending: false })

    if (unitId) {
      query = query.eq('unit_id', unitId)
    } else if (unitIds.length) {
      query = scopeQueryToUnitIds(query, unitIds)
    }

    const result = await query
    if (!result.error) {
      return result
    }

    lastError = result.error

    if (
      !isMissingColumnError(result.error, 'transaction_id') &&
      !isMissingColumnError(result.error, 'signed_off_by') &&
      !isMissingColumnError(result.error, 'signed_off_at') &&
      !isMissingColumnError(result.error, 'photo_path') &&
      !isMissingColumnError(result.error, 'updated_at')
    ) {
      return result
    }
  }

  return { data: null, error: lastError }
}

async function fetchUnitsBase(client, developmentId = null, developmentIds = []) {
  let query = client
    .from('units')
    .select(
      'id, development_id, unit_number, unit_label, phase, block, unit_type, bedrooms, bathrooms, parking_count, size_sqm, list_price, current_price, price, status, vat_applicable, floorplan_id, notes, development:developments(id, name)',
    )

  if (developmentId && developmentId !== 'all') {
    query = query.eq('development_id', developmentId)
  } else if (developmentIds.length) {
    query = query.in('development_id', developmentIds)
  }

  let result = await query.order('unit_number', { ascending: true })

  if (
    result.error &&
    (isMissingColumnError(result.error, 'unit_label') || isMissingColumnError(result.error, 'list_price'))
  ) {
    result = await client
      .from('units')
      .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
      .order('unit_number', { ascending: true })

    if (developmentId && developmentId !== 'all') {
      result = await client
        .from('units')
        .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
        .eq('development_id', developmentId)
        .order('unit_number', { ascending: true })
    } else if (developmentIds.length) {
      result = await client
        .from('units')
        .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
        .in('development_id', developmentIds)
        .order('unit_number', { ascending: true })
    }
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

async function fetchActiveTransactionsForUnitIds(client, unitIds) {
  if (!unitIds.length) {
    return []
  }

  const baseQuery = scopeQueryToUnitIds(
    client.from('transactions').select(
      selectWithoutKnownMissingColumns(
        'id, unit_id, buyer_id, finance_type, purchaser_type, stage, current_main_stage, current_sub_stage_summary, risk_status, sales_price, purchase_price, cash_amount, bond_amount, deposit_amount, bank, attorney, bond_originator, next_action, comment, owner_user_id, access_level, lifecycle_state, attorney_stage, operational_state, waiting_on_role, registration_date, title_deed_number, registered_at, completed_at, archived_at, cancelled_at, last_meaningful_activity_at, final_report_generated_at, is_active, updated_at, created_at',
      ),
    ),
    unitIds,
  ).order('updated_at', { ascending: false })

  const withActiveFlag = await baseQuery
  if (!withActiveFlag.error) {
    // Older and unit-backfilled transactions may predate `is_active` and
    // therefore carry NULL. Treat only an explicit false as inactive.
    return (withActiveFlag.data || [])
      .filter((item) => item?.is_active !== false)
      .filter((item) => normalizeStage(item?.stage, null) !== 'Available')
  }

  if (
    !isMissingColumnError(withActiveFlag.error, 'risk_status') &&
    !isMissingColumnError(withActiveFlag.error, 'is_active') &&
    !isMissingColumnError(withActiveFlag.error, 'sales_price') &&
    !isMissingColumnError(withActiveFlag.error, 'purchase_price') &&
    !isMissingColumnError(withActiveFlag.error, 'cash_amount') &&
    !isMissingColumnError(withActiveFlag.error, 'bond_amount') &&
    !isMissingColumnError(withActiveFlag.error, 'deposit_amount') &&
    !isMissingColumnError(withActiveFlag.error, 'bank') &&
    !isMissingColumnError(withActiveFlag.error, 'owner_user_id') &&
    !isMissingColumnError(withActiveFlag.error, 'access_level') &&
    !isMissingColumnError(withActiveFlag.error, 'current_main_stage') &&
    !isMissingColumnError(withActiveFlag.error, 'current_sub_stage_summary') &&
    !isMissingColumnError(withActiveFlag.error, 'purchaser_type') &&
    !isMissingColumnError(withActiveFlag.error, 'comment') &&
    !isMissingColumnError(withActiveFlag.error, 'lifecycle_state') &&
    !isMissingColumnError(withActiveFlag.error, 'attorney_stage') &&
    !isMissingColumnError(withActiveFlag.error, 'operational_state') &&
    !isMissingColumnError(withActiveFlag.error, 'waiting_on_role') &&
    !isMissingColumnError(withActiveFlag.error, 'registration_date') &&
    !isMissingColumnError(withActiveFlag.error, 'title_deed_number') &&
    !isMissingColumnError(withActiveFlag.error, 'registered_at') &&
    !isMissingColumnError(withActiveFlag.error, 'completed_at') &&
    !isMissingColumnError(withActiveFlag.error, 'archived_at') &&
    !isMissingColumnError(withActiveFlag.error, 'cancelled_at') &&
    !isMissingColumnError(withActiveFlag.error, 'last_meaningful_activity_at') &&
    !isMissingColumnError(withActiveFlag.error, 'final_report_generated_at')
  ) {
    throw withActiveFlag.error
  }

  registerKnownMissingColumns(withActiveFlag.error, [
    'risk_status',
    'is_active',
    'sales_price',
    'purchase_price',
    'cash_amount',
    'bond_amount',
    'deposit_amount',
    'bank',
    'owner_user_id',
    'access_level',
    'current_main_stage',
    'current_sub_stage_summary',
    'purchaser_type',
    'comment',
    'lifecycle_state',
    'attorney_stage',
    'operational_state',
    'waiting_on_role',
    'registration_date',
    'title_deed_number',
    'registered_at',
    'completed_at',
    'archived_at',
    'cancelled_at',
    'last_meaningful_activity_at',
    'final_report_generated_at',
  ])

  let fallbackQuery = await scopeQueryToUnitIds(
    client.from('transactions').select(
      selectWithoutKnownMissingColumns(
        'id, unit_id, buyer_id, finance_type, purchaser_type, stage, current_main_stage, current_sub_stage_summary, sales_price, purchase_price, cash_amount, bond_amount, deposit_amount, bank, attorney, bond_originator, next_action, comment, owner_user_id, access_level, lifecycle_state, attorney_stage, operational_state, waiting_on_role, registration_date, title_deed_number, registered_at, completed_at, archived_at, cancelled_at, last_meaningful_activity_at, final_report_generated_at, updated_at, created_at',
      ),
    ),
    unitIds,
  ).order('updated_at', { ascending: false })

  if (
    fallbackQuery.error &&
    (isMissingColumnError(fallbackQuery.error, 'sales_price') ||
      isMissingColumnError(fallbackQuery.error, 'purchase_price') ||
      isMissingColumnError(fallbackQuery.error, 'cash_amount') ||
      isMissingColumnError(fallbackQuery.error, 'bond_amount') ||
      isMissingColumnError(fallbackQuery.error, 'deposit_amount') ||
      isMissingColumnError(fallbackQuery.error, 'bank') ||
      isMissingColumnError(fallbackQuery.error, 'owner_user_id') ||
      isMissingColumnError(fallbackQuery.error, 'access_level') ||
      isMissingColumnError(fallbackQuery.error, 'current_main_stage') ||
      isMissingColumnError(fallbackQuery.error, 'current_sub_stage_summary') ||
      isMissingColumnError(fallbackQuery.error, 'purchaser_type') ||
      isMissingColumnError(fallbackQuery.error, 'comment') ||
      isMissingColumnError(fallbackQuery.error, 'lifecycle_state') ||
      isMissingColumnError(fallbackQuery.error, 'attorney_stage') ||
      isMissingColumnError(fallbackQuery.error, 'operational_state') ||
      isMissingColumnError(fallbackQuery.error, 'waiting_on_role') ||
      isMissingColumnError(fallbackQuery.error, 'registration_date') ||
      isMissingColumnError(fallbackQuery.error, 'title_deed_number') ||
      isMissingColumnError(fallbackQuery.error, 'registered_at') ||
      isMissingColumnError(fallbackQuery.error, 'completed_at') ||
      isMissingColumnError(fallbackQuery.error, 'archived_at') ||
      isMissingColumnError(fallbackQuery.error, 'cancelled_at') ||
      isMissingColumnError(fallbackQuery.error, 'last_meaningful_activity_at') ||
      isMissingColumnError(fallbackQuery.error, 'final_report_generated_at'))
  ) {
    registerKnownMissingColumns(fallbackQuery.error, [
      'sales_price',
      'purchase_price',
      'cash_amount',
      'bond_amount',
      'deposit_amount',
      'bank',
      'owner_user_id',
      'access_level',
      'current_main_stage',
      'current_sub_stage_summary',
      'purchaser_type',
      'comment',
      'lifecycle_state',
      'attorney_stage',
      'operational_state',
      'waiting_on_role',
      'registration_date',
      'title_deed_number',
      'registered_at',
      'completed_at',
      'archived_at',
      'cancelled_at',
      'last_meaningful_activity_at',
      'final_report_generated_at',
    ])
    fallbackQuery = await scopeQueryToUnitIds(
      client.from('transactions').select(
        'id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at',
      ),
      unitIds,
    ).order('updated_at', { ascending: false })
  }

  if (fallbackQuery.error) {
    throw fallbackQuery.error
  }

  return (fallbackQuery.data || []).filter((item) => normalizeStage(item?.stage, null) !== 'Available')
}

async function fetchDashboardCoreTransactionsForUnitIds(client, unitIds) {
  if (!unitIds.length) return []

  const coreSelect =
    'id, organisation_id, transaction_reference, transaction_type, property_type, unit_id, buyer_id, property_address_line_1, suburb, city, property_description, finance_type, purchaser_type, stage, current_main_stage, sales_price, purchase_price, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, bank, next_action, updated_at, created_at, is_active'
  let result = await scopeQueryToUnitIds(
    client.from('transactions').select(selectWithoutKnownMissingColumns(coreSelect)),
    unitIds,
  )
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (result.error && isMissingColumnError(result.error)) {
    registerKnownMissingColumns(result.error, [
      'organisation_id',
      'transaction_reference',
      'transaction_type',
      'property_type',
      'property_address_line_1',
      'suburb',
      'city',
      'property_description',
      'purchaser_type',
      'current_main_stage',
      'sales_price',
      'purchase_price',
      'assigned_agent',
      'assigned_agent_email',
      'assigned_attorney_email',
      'assigned_bond_originator_email',
      'bank',
      'is_active',
    ])
    result = await scopeQueryToUnitIds(
      client.from('transactions').select(selectWithoutKnownMissingColumns(coreSelect)),
      unitIds,
    ).order('updated_at', { ascending: false })
  }

  if (result.error) throw result.error
  return (result.data || [])
    .filter((item) => item?.is_active !== false)
    .filter((item) => normalizeStage(item?.stage, null) !== 'Available')
}

async function fetchDashboardTransactionRows(client, units = [], developmentIds = []) {
  const scopedDevelopmentIds = [...new Set((developmentIds || []).filter(Boolean))]
  if (!scopedDevelopmentIds.length) return []

  const selectClause =
    'id, organisation_id, development_id, unit_id, buyer_id, transaction_reference, transaction_type, property_type, finance_type, purchaser_type, stage, current_main_stage, sales_price, purchase_price, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, bank, next_action, creation_status, is_active, updated_at, created_at'
  let result = await client
    .from('transactions')
    .select(selectWithoutKnownMissingColumns(selectClause))
    .in('development_id', scopedDevelopmentIds)
    .order('updated_at', { ascending: false })

  if (result.error && isMissingColumnError(result.error)) {
    registerKnownMissingColumns(result.error, [
      'organisation_id',
      'transaction_reference',
      'transaction_type',
      'property_type',
      'purchaser_type',
      'current_main_stage',
      'sales_price',
      'purchase_price',
      'assigned_agent',
      'assigned_agent_email',
      'assigned_attorney_email',
      'assigned_bond_originator_email',
      'bank',
      'creation_status',
      'is_active',
    ])
    result = await client
      .from('transactions')
      .select(selectWithoutKnownMissingColumns(selectClause))
      .in('development_id', scopedDevelopmentIds)
      .order('updated_at', { ascending: false })
  }

  if (result.error) throw result.error
  const transactions = result.data || []
  if (!transactions.length) return []

  const buyerIds = [...new Set(transactions.map((transaction) => transaction?.buyer_id).filter(Boolean))]
  const buyersQuery = buyerIds.length
    ? await client.from('buyers').select(selectWithoutKnownMissingColumns('id, name, phone, email')).in('id', buyerIds)
    : { data: [], error: null }
  if (buyersQuery.error) throw buyersQuery.error

  const unitsById = new Map((units || []).map((unit) => [unit.id, unit]))
  const developmentsById = new Map()
  for (const unit of units || []) {
    const development = unit?.development
    if (development?.id) developmentsById.set(development.id, development)
  }
  const buyersById = new Map((buyersQuery.data || []).map((buyer) => [buyer.id, buyer]))

  return transactions.map((transaction) => {
    const unit = transaction?.unit_id ? unitsById.get(transaction.unit_id) || null : null
    const development = transaction?.development_id
      ? developmentsById.get(transaction.development_id) || unit?.development || null
      : unit?.development || null
    const stage = normalizeStage(transaction?.stage, unit?.status || 'Available')
    return {
      unit,
      development,
      transaction,
      buyer: transaction?.buyer_id ? buyersById.get(transaction.buyer_id) || null : null,
      stage,
      mainStage: normalizeMainStage(transaction?.current_main_stage, stage),
      documentSummary: { uploadedCount: 0, totalRequired: 0, missingCount: 0 },
    }
  })
}

function getDefaultHandoverRecord({ developmentId = null, unitId = null, transaction = null, buyer = null } = {}) {
  return {
    id: null,
    transactionId: transaction?.id || null,
    developmentId: developmentId || transaction?.development_id || null,
    unitId: unitId || transaction?.unit_id || null,
    buyerId: transaction?.buyer_id || buyer?.id || null,
    status: 'not_started',
    handoverDate: '',
    electricityMeterReading: '',
    waterMeterReading: '',
    gasMeterReading: '',
    keysHandedOver: false,
    remoteHandedOver: false,
    manualsHandedOver: false,
    inspectionCompleted: false,
    notes: '',
    signatureName: buyer?.name || '',
    signatureSignedAt: null,
    createdAt: null,
    updatedAt: null,
  }
}

function normalizeHandoverRow(row, defaults) {
  const status = String(row?.status || defaults.status || 'not_started')
    .trim()
    .toLowerCase()

  return {
    ...defaults,
    id: row?.id || defaults.id || null,
    transactionId: row?.transaction_id || defaults.transactionId || null,
    developmentId: row?.development_id || defaults.developmentId || null,
    unitId: row?.unit_id || defaults.unitId || null,
    buyerId: row?.buyer_id || defaults.buyerId || null,
    status: HANDOVER_STATUSES.includes(status) ? status : 'not_started',
    handoverDate: row?.handover_date || '',
    electricityMeterReading: row?.electricity_meter_reading || '',
    waterMeterReading: row?.water_meter_reading || '',
    gasMeterReading: row?.gas_meter_reading || '',
    keysHandedOver: Boolean(row?.keys_handed_over),
    remoteHandedOver: Boolean(row?.remote_handed_over),
    manualsHandedOver: Boolean(row?.manuals_handed_over),
    inspectionCompleted: Boolean(row?.inspection_completed),
    notes: row?.notes || '',
    signatureName: row?.signature_name || defaults.signatureName || '',
    signatureSignedAt: row?.signature_signed_at || null,
    createdAt: row?.created_at || defaults.createdAt || null,
    updatedAt: row?.updated_at || defaults.updatedAt || null,
  }
}

async function hydrateUnitRows(client, units, { includeOperationalSignals = true } = {}) {
  if (!units.length) {
    return []
  }

  const unitIds = units.map((unit) => unit.id)
  const transactions = includeOperationalSignals
    ? await fetchActiveTransactionsForUnitIds(client, unitIds)
    : await fetchDashboardCoreTransactionsForUnitIds(client, unitIds)

  const latestByUnit = {}
  for (const transaction of transactions) {
    if (!latestByUnit[transaction.unit_id]) {
      latestByUnit[transaction.unit_id] = transaction
    }
  }

  const buyerIds = [...new Set(transactions.map((transaction) => transaction.buyer_id).filter(Boolean))]
  let buyersById = {}

  if (buyerIds.length) {
    const buyersQuery = await client
      .from('buyers')
      .select(selectWithoutKnownMissingColumns('id, name, phone, email'))
      .in('id', buyerIds)

    const { data: buyers, error: buyersError } = buyersQuery

    if (buyersError) {
      throw buyersError
    }

    buyersById = buyers.reduce((accumulator, buyer) => {
      accumulator[buyer.id] = buyer
      return accumulator
    }, {})
  }

  const rows = units.map((unit) => {
    const transaction = latestByUnit[unit.id] || null
    const buyer = transaction?.buyer_id ? buyersById[transaction.buyer_id] || null : null
    const stage = normalizeStage(transaction?.stage, unit.status)

    return {
      unit,
      development: unit.development,
      transaction,
      buyer,
      stage,
      mainStage: normalizeMainStage(transaction?.current_main_stage, stage),
    }
  })

  if (!includeOperationalSignals) {
    return rows.sort(byDevelopmentThenUnit)
  }

  const transactionIds = rows.map((row) => row.transaction?.id).filter(Boolean)
  const transactionIdByUnitId = rows.reduce((accumulator, row) => {
    if (row.transaction?.id) {
      accumulator[row.unit.id] = row.transaction.id
    }
    return accumulator
  }, {})

  let handoverRows = []
  if (transactionIds.length) {
    const handoverQuery = await client
      .from('transaction_handover')
      .select(TRANSACTION_HANDOVER_SELECT)
      .in('transaction_id', transactionIds)
      .order('updated_at', { ascending: false })

    if (handoverQuery.error) {
      if (!isMissingTableError(handoverQuery.error, 'transaction_handover')) {
        throw handoverQuery.error
      }
    } else {
      handoverRows = handoverQuery.data || []
    }
  }

  const handoverByUnitId = {}
  for (const handoverRow of handoverRows) {
    const unitId =
      handoverRow.unit_id ||
      Object.keys(transactionIdByUnitId).find((key) => transactionIdByUnitId[key] === handoverRow.transaction_id)
    if (!unitId || handoverByUnitId[unitId]) {
      continue
    }

    const row = rows.find((item) => item.unit.id === unitId)
    const defaults = getDefaultHandoverRecord({
      developmentId: row?.unit?.development_id || handoverRow.development_id || null,
      unitId,
      transaction: row?.transaction || {
        id: handoverRow.transaction_id,
        buyer_id: handoverRow.buyer_id,
      },
      buyer: row?.buyer || null,
    })

    handoverByUnitId[unitId] = normalizeHandoverRow(handoverRow, defaults)
  }

  const issuesResult = await queryClientIssues(client, { unitIds })
  let issues = []
  if (issuesResult.error) {
    if (!isMissingTableError(issuesResult.error, 'client_issues') && !isPermissionDeniedError(issuesResult.error)) {
      throw issuesResult.error
    }
  } else {
    issues = issuesResult.data || []
  }

  const snagSummaryByUnitId = {}
  for (const issue of issues) {
    const unitId = issue.unit_id
    if (!unitId) {
      continue
    }

    if (!snagSummaryByUnitId[unitId]) {
      snagSummaryByUnitId[unitId] = {
        totalCount: 0,
        openCount: 0,
        latestUpdatedAt: null,
      }
    }

    const summary = snagSummaryByUnitId[unitId]
    const normalizedStatus = String(issue.status || '')
      .trim()
      .toLowerCase()
    const updatedAt = issue.updated_at || issue.created_at || null

    summary.totalCount += 1
    if (!['resolved', 'closed', 'completed'].includes(normalizedStatus)) {
      summary.openCount += 1
    }

    if (updatedAt && (!summary.latestUpdatedAt || new Date(updatedAt) > new Date(summary.latestUpdatedAt))) {
      summary.latestUpdatedAt = updatedAt
    }
  }

  return rows
    .map((row) => {
      const defaultHandover = getDefaultHandoverRecord({
        developmentId: row.unit?.development_id || null,
        unitId: row.unit?.id || null,
        transaction: row.transaction,
        buyer: row.buyer,
      })
      const handover = handoverByUnitId[row.unit.id] || defaultHandover
      const snagSummary = snagSummaryByUnitId[row.unit.id] || {
        totalCount: 0,
        openCount: 0,
        latestUpdatedAt: null,
      }

      return {
        ...row,
        handover,
        snagSummary: {
          ...snagSummary,
          status: snagSummary.totalCount === 0 ? 'clear' : snagSummary.openCount > 0 ? 'open' : 'resolved',
        },
      }
    })
    .sort(byDevelopmentThenUnit)
}

export async function fetchDevelopmentIdsForOrganisation(client, organisationId = '') {
  const normalizedOrganisationId = String(organisationId || '').trim()
  if (!normalizedOrganisationId) return []

  const [directQuery, relationshipQuery, transactionQuery] = await Promise.all([
    client.from('developments').select('id').eq('organisation_id', normalizedOrganisationId),
    // Developments can be shared with a developer organisation without their
    // owning `organisation_id` changing. The detail workspace already honours
    // this relationship; the dashboard must use the same scope.
    client
      .from('development_organisation_relationships')
      .select('development_id')
      .eq('organisation_id', normalizedOrganisationId)
      .eq('status', 'active'),
    client
      .from('transactions')
      .select('development_id')
      .eq('organisation_id', normalizedOrganisationId)
      .not('development_id', 'is', null),
  ])

  const directIds = !directQuery.error
    ? (directQuery.data || []).map((row) => String(row?.id || '').trim()).filter(Boolean)
    : []

  if (
    directQuery.error &&
    !isMissingColumnError(directQuery.error, 'organisation_id') &&
    !isPermissionDeniedError(directQuery.error)
  ) {
    throw directQuery.error
  }

  const relationshipIds = !relationshipQuery.error
    ? (relationshipQuery.data || []).map((row) => String(row?.development_id || '').trim()).filter(Boolean)
    : []

  if (
    relationshipQuery.error &&
    !isMissingTableError(relationshipQuery.error, 'development_organisation_relationships') &&
    !isMissingSchemaError(relationshipQuery.error) &&
    !isPermissionDeniedError(relationshipQuery.error)
  ) {
    throw relationshipQuery.error
  }

  if (transactionQuery.error) {
    if (
      isMissingColumnError(transactionQuery.error, 'organisation_id') ||
      isMissingColumnError(transactionQuery.error, 'development_id') ||
      isMissingTableError(transactionQuery.error, 'transactions') ||
      isPermissionDeniedError(transactionQuery.error)
    ) {
      return [...new Set([...directIds, ...relationshipIds])]
    }
    throw transactionQuery.error
  }

  return [
    ...new Set([
      ...directIds,
      ...relationshipIds,
      ...(transactionQuery.data || []).map((row) => String(row?.development_id || '').trim()).filter(Boolean),
    ]),
  ]
}

function normalizeCommissionSnapshotRow(snapshot = null) {
  if (!snapshot || typeof snapshot !== 'object') return null

  return {
    gross_commission_percentage: normalizeOptionalNumber(
      snapshot.gross_commission_percentage ?? snapshot.grossCommissionPercentage,
    ),
    gross_commission_amount: normalizeOptionalNumber(
      snapshot.gross_commission_amount ?? snapshot.grossCommissionAmount,
    ),
    agent_split_percentage_snapshot: normalizeOptionalNumber(
      snapshot.agent_split_percentage_snapshot ??
        snapshot.agentSplitPercentageSnapshot ??
        snapshot.agentSplitPercentage,
    ),
    agency_split_percentage_snapshot: normalizeOptionalNumber(
      snapshot.agency_split_percentage_snapshot ??
        snapshot.agencySplitPercentageSnapshot ??
        snapshot.agencySplitPercentage,
    ),
    agent_commission_amount: normalizeOptionalNumber(
      snapshot.agent_commission_amount ?? snapshot.agentCommissionAmount,
    ),
    agency_commission_amount: normalizeOptionalNumber(
      snapshot.agency_commission_amount ?? snapshot.agencyCommissionAmount,
    ),
  }
}

function deriveSnapshotFromTransactionRow(transaction = {}) {
  const normalized = normalizeCommissionSnapshotRow(transaction)
  if (!normalized) return null
  const hasSnapshot =
    normalized.gross_commission_amount !== null ||
    normalized.agent_commission_amount !== null ||
    normalized.agency_commission_amount !== null ||
    normalized.gross_commission_percentage !== null
  return hasSnapshot ? normalized : null
}

function applyCommissionSnapshotToTransaction(transaction = {}, snapshot = null) {
  if (!transaction || typeof transaction !== 'object' || !snapshot) {
    return transaction
  }
  return {
    ...transaction,
    commission_amount: snapshot.gross_commission_amount,
    gross_commission_amount: snapshot.gross_commission_amount,
    gross_commission_percentage: snapshot.gross_commission_percentage,
    agent_commission: snapshot.agent_commission_amount,
    agent_commission_earned: snapshot.agent_commission_amount,
    agency_commission_amount: snapshot.agency_commission_amount,
    agent_split_percentage_snapshot: snapshot.agent_split_percentage_snapshot,
    agency_split_percentage_snapshot: snapshot.agency_split_percentage_snapshot,
    commission_snapshot_source: 'snapshot',
  }
}

export async function hydrateRowsWithCommissionSnapshots(client, rows = []) {
  const baseRows = Array.isArray(rows) ? rows : []
  const transactionIds = [...new Set(baseRows.map((row) => row?.transaction?.id).filter(Boolean))]
  if (!transactionIds.length || !TRANSACTION_COMMISSION_SNAPSHOTS_ENABLED || !transactionCommissionSnapshotsAvailable) {
    return baseRows
  }

  const commissionQuery = await client
    .from('transaction_commissions')
    .select(
      'transaction_id, gross_commission_amount, gross_commission_percentage, agent_commission_amount, agency_commission_amount, agent_split_percentage_snapshot, agency_split_percentage_snapshot',
    )
    .in('transaction_id', transactionIds)

  const commissionByTransactionId = new Map()
  if (!commissionQuery.error) {
    for (const item of commissionQuery.data || []) {
      commissionByTransactionId.set(String(item.transaction_id), normalizeCommissionSnapshotRow(item))
    }
  } else if (
    isMissingTableError(commissionQuery.error, 'transaction_commissions') ||
    isMissingSchemaError(commissionQuery.error) ||
    isMissingColumnError(commissionQuery.error) ||
    isPermissionDeniedError(commissionQuery.error)
  ) {
    transactionCommissionSnapshotsAvailable = false
    console.warn('[TRANSACTIONS] commission snapshots unavailable; using transaction rows only.', commissionQuery.error)
  } else if (!isPermissionDeniedError(commissionQuery.error)) {
    throw commissionQuery.error
  }

  return baseRows.map((row) => {
    const transactionId = row?.transaction?.id ? String(row.transaction.id) : ''
    if (!transactionId || !row?.transaction) return row
    const snapshot = commissionByTransactionId.get(transactionId) || deriveSnapshotFromTransactionRow(row.transaction)
    if (!snapshot) return row
    return {
      ...row,
      transaction: applyCommissionSnapshotToTransaction(row.transaction, snapshot),
    }
  })
}

export async function fetchDashboardOverview({
  developmentId = null,
  client: scopedClient = null,
  organisationId = null,
  includeSecondaryData = true,
} = {}) {
  const client = scopedClient || requireClient()
  const normalizedOrganisationId = String(organisationId || '').trim()
  const normalizedDevelopmentId = String(developmentId || '').trim()
  let allowedDevelopmentIds = null
  if (normalizedOrganisationId) {
    allowedDevelopmentIds = new Set(await fetchDevelopmentIdsForOrganisation(client, normalizedOrganisationId))
    if (!allowedDevelopmentIds.size) {
      return {
        rows: [],
        transactionRows: [],
        metrics: buildDashboardMetrics([], 0),
        developmentSummaries: [],
        alerts: buildAlerts([]),
      }
    }
    if (
      normalizedDevelopmentId &&
      normalizedDevelopmentId !== 'all' &&
      !allowedDevelopmentIds.has(normalizedDevelopmentId)
    ) {
      return {
        rows: [],
        transactionRows: [],
        metrics: buildDashboardMetrics([], 0),
        developmentSummaries: [],
        alerts: buildAlerts([]),
      }
    }
  }

  let units = await fetchUnitsBase(
    client,
    developmentId,
    allowedDevelopmentIds ? [...allowedDevelopmentIds] : [],
  )
  if (allowedDevelopmentIds) {
    units = units.filter((unit) =>
      allowedDevelopmentIds.has(String(unit?.development_id || unit?.development?.id || '').trim()),
    )
  }
  const baseRows = dedupeTransactionRows(
    await hydrateUnitRows(client, units, { includeOperationalSignals: includeSecondaryData }),
  )
  const rows = includeSecondaryData
    ? await hydrateRowsWithCommissionSnapshots(client, baseRows)
    : baseRows

  const developmentSummaries = buildDevelopmentSummaries(rows)
  const dashboardDevelopmentIds = normalizedDevelopmentId && normalizedDevelopmentId !== 'all'
    ? [normalizedDevelopmentId]
    : allowedDevelopmentIds
      ? [...allowedDevelopmentIds]
      : [...new Set(units.map((unit) => unit?.development_id).filter(Boolean))]
  // The unit hydration above already selects the current transaction for each
  // unit. Use that canonical view for dashboard headline metrics instead of
  // counting historical/replaced transaction rows from backfill attempts.
  const transactionRows = rows.filter((row) => row?.transaction?.id)
  const metrics = buildDashboardMetrics(rows, developmentSummaries.length)

  return {
    rows,
    transactionRows,
    metrics: {
      ...metrics,
      totalTransactions: transactionRows.length,
      activeTransactions: transactionRows.filter((row) => {
        const mainStage = normalizeMainStage(row?.transaction?.current_main_stage, row?.stage)
        return row?.transaction?.is_active !== false && !['AVAIL', 'REG'].includes(mainStage)
      }).length,
    },
    developmentSummaries,
    alerts: buildAlerts(rows),
  }
}
