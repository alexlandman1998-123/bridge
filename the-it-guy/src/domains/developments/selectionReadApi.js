// Extracted read path; queries, filters, mapping and cache behaviour are preserved.
import { requireClient, isMissingTableError, isMissingColumnError, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { fetchDevelopmentIdsForOrganisation } from './scopeReadApi.js'
import { normalizeDevelopmentSettingsRow } from './configurationApi.js'
import { fetchActiveTransactionsForUnitIds } from '../transactions/summaryReadApi.js'

export let developmentOptionsCache = null

export let developmentOptionsCachedAt = 0

export let developmentOptionsInFlight = null

export const DEVELOPMENT_OPTIONS_CACHE_TTL_MS = 30 * 1000

export function invalidateDevelopmentOptionsCache() {
  developmentOptionsCache = null
  developmentOptionsCachedAt = 0
  developmentOptionsInFlight = null
}

export async function fetchDevelopmentOptions({ developmentIds = [], organisationId = null } = {}) {
  const normalizedOrganisationId = String(organisationId || '').trim()
  let normalizedDevelopmentIds = [
    ...new Set((developmentIds || []).map((item) => String(item || '').trim()).filter(Boolean)),
  ]
  if (normalizedOrganisationId) {
    const client = requireClient()
    const organisationDevelopmentIds = await fetchDevelopmentIdsForOrganisation(client, normalizedOrganisationId)
    if (!organisationDevelopmentIds.length) return []
    const allowedIds = new Set(organisationDevelopmentIds)
    normalizedDevelopmentIds = normalizedDevelopmentIds.length
      ? normalizedDevelopmentIds.filter((id) => allowedIds.has(id))
      : organisationDevelopmentIds
  }
  const isScopedQuery = normalizedDevelopmentIds.length > 0

  if (isScopedQuery && developmentOptionsCache?.length) {
    const cachedScopedRows = developmentOptionsCache.filter((row) =>
      normalizedDevelopmentIds.includes(String(row?.id || '').trim()),
    )
    if (cachedScopedRows.length) {
      return cachedScopedRows.map((row) => ({ ...row }))
    }
  }

  if (isScopedQuery) {
    const client = requireClient()
    const attachReservationDefaults = async (rows = []) => {
      const normalizedRows = Array.isArray(rows) ? rows : []
      const scopedIds = normalizedRows.map((row) => row.id).filter(Boolean)
      if (!scopedIds.length) {
        return normalizedRows
      }

      const settingsQuery = await client
        .from('development_settings')
        .select(
          'development_id, reservation_deposit_enabled_by_default, reservation_deposit_amount, reservation_deposit_amount_type, reservation_deposit_treatment, reservation_deposit_payable_to, reservation_deposit_payment_details, default_alteration_charge_treatment, stakeholder_teams',
        )
        .in('development_id', scopedIds)

      if (
        settingsQuery.error &&
        !isMissingTableError(settingsQuery.error, 'development_settings') &&
        !isMissingColumnError(settingsQuery.error, 'reservation_deposit_enabled_by_default') &&
        !isMissingColumnError(settingsQuery.error, 'reservation_deposit_amount') &&
        !isMissingColumnError(settingsQuery.error, 'reservation_deposit_amount_type') &&
        !isMissingColumnError(settingsQuery.error, 'reservation_deposit_treatment') &&
        !isMissingColumnError(settingsQuery.error, 'reservation_deposit_payable_to') &&
        !isMissingColumnError(settingsQuery.error, 'default_alteration_charge_treatment')
      ) {
        throw settingsQuery.error
      }

      const settingsByDevelopmentId = new Map((settingsQuery.data || []).map((item) => [item.development_id, item]))

      return normalizedRows.map((row) => {
        const setting = settingsByDevelopmentId.get(row.id)
        const normalizedSetting = normalizeDevelopmentSettingsRow(setting)
        return {
          ...row,
          reservation_deposit_enabled_by_default: Boolean(setting?.reservation_deposit_enabled_by_default),
          reservation_deposit_amount: normalizeOptionalNumber(setting?.reservation_deposit_amount),
          reservation_deposit_amount_type: normalizedSetting.reservation_deposit_amount_type,
          reservation_deposit_vat_treatment: normalizedSetting.reservation_deposit_vat_treatment,
          reservation_deposit_due_trigger: normalizedSetting.reservation_deposit_due_trigger,
          reservation_deposit_treatment: normalizedSetting.reservation_deposit_treatment,
          reservation_deposit_payable_to: normalizedSetting.reservation_deposit_payable_to,
          default_alteration_charge_treatment: normalizedSetting.default_alteration_charge_treatment,
          stakeholder_teams: normalizedSetting.stakeholderTeams,
          role_player_defaults: normalizedSetting.rolePlayerDefaults,
          rolePlayerDefaults: normalizedSetting.rolePlayerDefaults,
        }
      })
    }

    let scopedQuery = await client
      .from('developments')
      .select('id, organisation_id, name, planned_units, total_units_expected, location, address, formatted_address, street_address, suburb, city, province, developer_company, status')
      .in('id', normalizedDevelopmentIds)
      .order('name', { ascending: true })

    if (!scopedQuery.error) {
      const scopedRows = scopedQuery.data.map((row) => ({
        ...row,
        planned_units: typeof row.planned_units === 'number' ? row.planned_units : normalizeOptionalNumber(row.total_units_expected),
      }))
      return attachReservationDefaults(scopedRows)
    }

    if (
      scopedQuery.error.code !== '42703' &&
      !isMissingColumnError(scopedQuery.error, 'organisation_id')
    ) {
      throw scopedQuery.error
    }

    scopedQuery = await client
      .from('developments')
      .select('id, name')
      .in('id', normalizedDevelopmentIds)
      .order('name', { ascending: true })

    if (scopedQuery.error) {
      throw scopedQuery.error
    }

    const scopedRows = scopedQuery.data.map((row) => ({
      ...row,
      planned_units: null,
    }))
    return attachReservationDefaults(scopedRows)
  }

  const now = Date.now()
  if (developmentOptionsCache && now - developmentOptionsCachedAt < DEVELOPMENT_OPTIONS_CACHE_TTL_MS) {
    return developmentOptionsCache.map((row) => ({ ...row }))
  }

  if (developmentOptionsInFlight) {
    const rows = await developmentOptionsInFlight
    return rows.map((row) => ({ ...row }))
  }

  const client = requireClient()

  developmentOptionsInFlight = (async () => {
    const attachReservationDefaults = async (rows = []) => {
      const normalizedRows = Array.isArray(rows) ? rows : []
      const developmentIds = normalizedRows.map((row) => row.id).filter(Boolean)
      if (!developmentIds.length) {
        return normalizedRows
      }

      const settingsQuery = await client
        .from('development_settings')
        .select(
          'development_id, reservation_deposit_enabled_by_default, reservation_deposit_amount, reservation_deposit_amount_type, reservation_deposit_treatment, reservation_deposit_payable_to, reservation_deposit_payment_details, default_alteration_charge_treatment, stakeholder_teams',
        )
        .in('development_id', developmentIds)

      if (
        settingsQuery.error &&
        !isMissingTableError(settingsQuery.error, 'development_settings') &&
        !isMissingColumnError(settingsQuery.error, 'reservation_deposit_enabled_by_default') &&
        !isMissingColumnError(settingsQuery.error, 'reservation_deposit_amount') &&
        !isMissingColumnError(settingsQuery.error, 'reservation_deposit_amount_type') &&
        !isMissingColumnError(settingsQuery.error, 'reservation_deposit_treatment') &&
        !isMissingColumnError(settingsQuery.error, 'reservation_deposit_payable_to') &&
        !isMissingColumnError(settingsQuery.error, 'default_alteration_charge_treatment')
      ) {
        throw settingsQuery.error
      }

      const settingsByDevelopmentId = new Map((settingsQuery.data || []).map((item) => [item.development_id, item]))

      return normalizedRows.map((row) => {
        const setting = settingsByDevelopmentId.get(row.id)
        const normalizedSetting = normalizeDevelopmentSettingsRow(setting)
        return {
          ...row,
          reservation_deposit_enabled_by_default: Boolean(setting?.reservation_deposit_enabled_by_default),
          reservation_deposit_amount: normalizeOptionalNumber(setting?.reservation_deposit_amount),
          reservation_deposit_amount_type: normalizedSetting.reservation_deposit_amount_type,
          reservation_deposit_vat_treatment: normalizedSetting.reservation_deposit_vat_treatment,
          reservation_deposit_due_trigger: normalizedSetting.reservation_deposit_due_trigger,
          reservation_deposit_treatment: normalizedSetting.reservation_deposit_treatment,
          reservation_deposit_payable_to: normalizedSetting.reservation_deposit_payable_to,
          default_alteration_charge_treatment: normalizedSetting.default_alteration_charge_treatment,
          stakeholder_teams: normalizedSetting.stakeholderTeams,
          role_player_defaults: normalizedSetting.rolePlayerDefaults,
          rolePlayerDefaults: normalizedSetting.rolePlayerDefaults,
        }
      })
    }

    const { data, error } = await client
      .from('developments')
      .select('id, organisation_id, name, planned_units, total_units_expected, location, address, formatted_address, street_address, suburb, city, province, developer_company, status')
      .order('name', { ascending: true })

    if (!error) {
      const normalizedRows = data.map((row) => ({
        ...row,
        planned_units: typeof row.planned_units === 'number' ? row.planned_units : normalizeOptionalNumber(row.total_units_expected),
      }))
      const rowsWithDefaults = await attachReservationDefaults(normalizedRows)
      developmentOptionsCache = rowsWithDefaults
      developmentOptionsCachedAt = Date.now()
      return rowsWithDefaults
    }

    if (error.code !== '42703' && !isMissingColumnError(error, 'organisation_id')) {
      throw error
    }

    const fallback = await client.from('developments').select('id, name').order('name', { ascending: true })

    if (fallback.error) {
      throw fallback.error
    }

    const normalizedRows = fallback.data.map((row) => ({
      ...row,
      planned_units: null,
    }))
    const rowsWithDefaults = await attachReservationDefaults(normalizedRows)
    developmentOptionsCache = rowsWithDefaults
    developmentOptionsCachedAt = Date.now()
    return rowsWithDefaults
  })()

  try {
    const rows = await developmentOptionsInFlight
    return rows.map((row) => ({ ...row }))
  } finally {
    developmentOptionsInFlight = null
  }
}

export async function fetchUnitsForTransactionSetup(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    return []
  }

  const { data: units, error: unitsError } = await client
    .from('units')
    .select('id, unit_number, phase, price, status, development_id')
    .eq('development_id', developmentId)
    .order('unit_number', { ascending: true })

  if (unitsError) {
    throw unitsError
  }

  const unitIds = units.map((unit) => unit.id)
  const activeTransactions = await fetchActiveTransactionsForUnitIds(client, unitIds)

  const latestTransactionByUnit = {}
  for (const transaction of activeTransactions) {
    if (!latestTransactionByUnit[transaction.unit_id]) {
      latestTransactionByUnit[transaction.unit_id] = transaction
    }
  }

  const buyerIds = [...new Set(activeTransactions.map((transaction) => transaction.buyer_id).filter(Boolean))]
  let buyersById = {}

  if (buyerIds.length) {
    const { data: buyers, error: buyersError } = await client.from('buyers').select('id, name').in('id', buyerIds)

    if (buyersError) {
      throw buyersError
    }

    buyersById = buyers.reduce((accumulator, buyer) => {
      accumulator[buyer.id] = buyer
      return accumulator
    }, {})
  }

  return units.map((unit) => {
    const activeTransaction = latestTransactionByUnit[unit.id] || null
    const activeBuyer = activeTransaction?.buyer_id ? buyersById[activeTransaction.buyer_id] || null : null

    return {
      ...unit,
      activeTransaction: activeTransaction
        ? {
            id: activeTransaction.id,
            stage: activeTransaction.stage,
            financeType: activeTransaction.finance_type,
            buyerName: activeBuyer?.name || null,
            updatedAt: activeTransaction.updated_at,
          }
        : null,
    }
  })
}

export { fetchDevelopmentParticipants, fetchAssignedDevelopmentIdsForRole } from './participantReadApi.js'
