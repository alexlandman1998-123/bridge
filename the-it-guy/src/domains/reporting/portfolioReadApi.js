// Extracted from the legacy API; query, mapping and error behaviour are preserved.
import { isInTransferStage } from '../../core/transactions/stageConfig'
import { latestTimestamp, dedupeTransactionRows } from '../../core/transactions/legacyReadModel.js'
import { requireClient, isMissingTableError, isPermissionDeniedError } from '../../lib/api/shared/readHelpers.js'
import { fetchDevelopmentIdsForOrganisation } from '../developments/scopeReadApi.js'
import { fetchUnitsBase, hydrateUnitRows } from '../developments/unitReadApi.js'
import { hydrateRowsWithCommissionSnapshots } from '../transactions/summaryReadApi.js'
import { refreshDevelopmentMedia } from '../../lib/developmentMediaStorage.js'
import { normalizeDevelopmentProfile } from '../developments/profileNormalization.js'

export function buildDashboardMetrics(rows, developmentCount) {
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

export function buildDevelopmentSummaries(rows) {
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

export function buildAlerts(rows) {
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

export async function fetchDashboardOverview({
  developmentId = null,
  client: scopedClient = null,
  organisationId = null,
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
        metrics: buildDashboardMetrics([], 0),
        developmentSummaries: [],
        alerts: buildAlerts([]),
      }
    }
  }

  let units = await fetchUnitsBase(client, developmentId)
  if (allowedDevelopmentIds) {
    units = units.filter((unit) =>
      allowedDevelopmentIds.has(String(unit?.development_id || unit?.development?.id || '').trim()),
    )
  }
  const baseRows = dedupeTransactionRows(await hydrateUnitRows(client, units))
  const rows = await hydrateRowsWithCommissionSnapshots(client, baseRows)

  const developmentSummaries = buildDevelopmentSummaries(rows)
  // Keep the dashboard's cover imagery consistent with the Developments
  // portfolio without duplicating an image URL onto every unit row.
  const summaryDevelopmentIds = developmentSummaries.map((item) => item.id).filter(Boolean)
  let profileByDevelopmentId = {}
  if (summaryDevelopmentIds.length) {
    const profilesResult = await client
      .from('development_profiles')
      .select('development_id, image_links, location, status')
      .in('development_id', summaryDevelopmentIds)
    if (!profilesResult.error) {
      profileByDevelopmentId = (await refreshDevelopmentMedia(client, profilesResult.data || [], { strict: false })).reduce((accumulator, profile) => {
        accumulator[profile.development_id] = normalizeDevelopmentProfile(profile)
        return accumulator
      }, {})
    } else if (!isMissingTableError(profilesResult.error) && !isPermissionDeniedError(profilesResult.error)) {
      throw profilesResult.error
    }
  }
  const hydratedDevelopmentSummaries = developmentSummaries.map((summary) => {
    const profile = profileByDevelopmentId[summary.id] || {}
    return {
      ...summary,
      coverImageUrl: profile.imageLinks?.[0] || null,
      location: profile.location || null,
      phase: profile.status || null,
    }
  })

  return {
    rows,
    metrics: buildDashboardMetrics(rows, hydratedDevelopmentSummaries.length),
    developmentSummaries: hydratedDevelopmentSummaries,
    alerts: buildAlerts(rows),
  }
}
