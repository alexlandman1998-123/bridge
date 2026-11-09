// Extracted portfolio read; a missing optional profile keeps the summary cover fallback.
import { fetchDashboardOverview as fetchScopedDashboardOverview } from '../reporting/api.js'
import { requireClient, isMissingTableError, isMissingColumnError, isPermissionDeniedError, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { refreshDevelopmentMedia } from '../../lib/developmentMediaStorage.js'
import { normalizeDevelopmentProfile, getDevelopmentProfileCoverImage } from './profileNormalization.js'
import { normalizeDevelopmentRolePlayerDefaults } from './configurationApi.js'

export async function fetchDevelopmentsData({ organisationId = null } = {}) {
  // The index only needs unit and transaction summaries. Avoid loading the
  // attorney, handover and snag workspaces before the cards can render.
  const overview = await fetchScopedDashboardOverview({ organisationId, includeSecondaryData: false })
  const client = requireClient()
  const normalizedOrganisationId = String(organisationId || '').trim()
  const summaries = overview.developmentSummaries || []
  const directDevelopmentRows = []
  let relatedDevelopmentIds = null

  // Development access is relationship-based as of the Availability foundation.
  // Keep the legacy organisation_id query as a compatibility fallback while
  // environments receive the migration.
  if (normalizedOrganisationId) {
    const relationshipsQuery = await client
      .from('development_organisation_relationships')
      .select('development_id')
      .eq('organisation_id', normalizedOrganisationId)
      .eq('status', 'active')

    if (!relationshipsQuery.error) {
      relatedDevelopmentIds = [...new Set((relationshipsQuery.data || []).map((row) => String(row?.development_id || '').trim()).filter(Boolean))]
    } else if (!isMissingTableError(relationshipsQuery.error, 'development_organisation_relationships')) {
      throw relationshipsQuery.error
    }
  }

  let developmentsQuery = client
    .from('developments')
    .select(
      'id, organisation_id, name, planned_units, total_units_expected, status, location, developer_company',
    )

  if (normalizedOrganisationId) {
    developmentsQuery = Array.isArray(relatedDevelopmentIds)
      ? relatedDevelopmentIds.length
        ? developmentsQuery.in('id', relatedDevelopmentIds)
        : null
      : developmentsQuery.eq('organisation_id', normalizedOrganisationId)
  }

  let developmentsResult = developmentsQuery ? await developmentsQuery : { data: [], error: null }

  if (
    developmentsResult.error &&
    (isMissingColumnError(developmentsResult.error, 'total_units_expected') ||
      isMissingColumnError(developmentsResult.error, 'location') ||
      isMissingColumnError(developmentsResult.error, 'developer_company') ||
      isMissingColumnError(developmentsResult.error, 'status'))
  ) {
    if (normalizedOrganisationId && isMissingColumnError(developmentsResult.error, 'organisation_id')) {
      developmentsResult = { data: [], error: null }
    } else {
      let fallbackDevelopmentsQuery = client
        .from('developments')
        .select(normalizedOrganisationId ? 'id, organisation_id, name, planned_units' : 'id, name, planned_units')

      if (normalizedOrganisationId) {
        fallbackDevelopmentsQuery = Array.isArray(relatedDevelopmentIds)
          ? relatedDevelopmentIds.length
            ? fallbackDevelopmentsQuery.in('id', relatedDevelopmentIds)
            : null
          : fallbackDevelopmentsQuery.eq('organisation_id', normalizedOrganisationId)
      }

      developmentsResult = fallbackDevelopmentsQuery ? await fallbackDevelopmentsQuery : { data: [], error: null }
    }
  } else if (
    developmentsResult.error &&
    normalizedOrganisationId &&
    isMissingColumnError(developmentsResult.error, 'organisation_id')
  ) {
    developmentsResult = { data: [], error: null }
  }

  if (!developmentsResult.error) {
    directDevelopmentRows.push(...(developmentsResult.data || []))
  } else if (!isPermissionDeniedError(developmentsResult.error)) {
    throw developmentsResult.error
  }

  const summaryById = new Map(summaries.filter((item) => item?.id).map((item) => [String(item.id), item]))

  for (const row of directDevelopmentRows) {
    const id = String(row?.id || '').trim()
    if (!id || summaryById.has(id)) {
      continue
    }

    const plannedUnits = normalizeOptionalNumber(row?.total_units_expected ?? row?.planned_units) ?? 0
    summaryById.set(id, {
      id,
      name: row?.name || 'Untitled development',
      totalUnits: plannedUnits,
      unitsSold: 0,
      unitsInTransfer: 0,
      unitsRegistered: 0,
      lastActivity: row?.updated_at || row?.created_at || null,
      location: row?.location || null,
      phase: row?.status || null,
      developerCompany: row?.developer_company || null,
    })
  }

  const mergedSummaries = [...summaryById.values()].sort((left, right) =>
    String(left.name || '').localeCompare(String(right.name || ''), undefined, {
      sensitivity: 'base',
    }),
  )

  if (!mergedSummaries.length) {
    return {
      metrics: {
        ...overview.metrics,
        totalDevelopments: 0,
      },
      rows: overview.rows || [],
      developments: [],
    }
  }

  const developmentIds = mergedSummaries.map((item) => item.id).filter(Boolean)
  let profileByDevelopmentId = {}
  let defaultAttorneyByDevelopmentId = {}
  let configuredAttorneyByDevelopmentId = {}

  if (developmentIds.length) {
    let profileQuery = await client
      .from('development_profiles')
      .select('development_id, location, status, image_links, marketing_content, developer_company')
      .in('development_id', developmentIds)

    // Older environments may not yet have marketing_content. Keep their
    // image_links fallback working while newer workspaces use the configured
    // Marketing cover image.
    if (profileQuery.error && isMissingColumnError(profileQuery.error, 'marketing_content')) {
      profileQuery = await client
        .from('development_profiles')
        .select('development_id, location, status, image_links, developer_company')
        .in('development_id', developmentIds)
    }

    if (!profileQuery.error) {
      profileByDevelopmentId = (await refreshDevelopmentMedia(client, profileQuery.data || [], { strict: false })).reduce((accumulator, row) => {
        accumulator[row.development_id] = normalizeDevelopmentProfile(row)
        return accumulator
      }, {})
    } else if (!isMissingTableError(profileQuery.error, 'development_profiles')) {
      throw profileQuery.error
    }

    const settingsQuery = await client
      .from('development_settings')
      .select('development_id, stakeholder_teams')
      .in('development_id', developmentIds)

    if (!settingsQuery.error) {
      defaultAttorneyByDevelopmentId = (settingsQuery.data || []).reduce((accumulator, row) => {
        const teams = row?.stakeholder_teams && typeof row.stakeholder_teams === 'object'
          ? row.stakeholder_teams
          : {}
        const defaults = normalizeDevelopmentRolePlayerDefaults(
          teams.rolePlayerDefaults || teams.role_player_defaults,
        )
        const name = defaults.defaultTransferAttorneySource !== 'none'
          ? defaults.defaultTransferAttorneyName
          : ''
        accumulator[row.development_id] = name || ''
        return accumulator
      }, {})
    } else if (
      !isMissingTableError(settingsQuery.error, 'development_settings') &&
      !isMissingColumnError(settingsQuery.error, 'stakeholder_teams') &&
      !isPermissionDeniedError(settingsQuery.error)
    ) {
      throw settingsQuery.error
    }

    // An active development-attorney configuration is the canonical setup
    // signal. The stakeholder-team default is retained for legacy records,
    // but must not make a configured attorney look missing when that older
    // settings read is unavailable to the current user.
    let attorneyConfigsQuery = await client
      .from('development_attorney_configs')
      .select('development_id, attorney_firm_name, primary_contact_name, is_active')
      .in('development_id', developmentIds)
      .eq('is_active', true)

    if (attorneyConfigsQuery.error && isMissingColumnError(attorneyConfigsQuery.error, 'is_active')) {
      attorneyConfigsQuery = await client
        .from('development_attorney_configs')
        .select('development_id, attorney_firm_name, primary_contact_name')
        .in('development_id', developmentIds)
    }

    if (!attorneyConfigsQuery.error) {
      configuredAttorneyByDevelopmentId = (attorneyConfigsQuery.data || []).reduce((accumulator, row) => {
        const developmentId = String(row?.development_id || '').trim()
        const attorneyName = String(row?.attorney_firm_name || row?.primary_contact_name || '').trim()
        if (developmentId && attorneyName && !accumulator[developmentId]) {
          accumulator[developmentId] = attorneyName
        }
        return accumulator
      }, {})
    } else if (
      !isMissingTableError(attorneyConfigsQuery.error, 'development_attorney_configs') &&
      !isPermissionDeniedError(attorneyConfigsQuery.error)
    ) {
      throw attorneyConfigsQuery.error
    }
  }

  return {
    metrics: {
      ...overview.metrics,
      totalDevelopments: mergedSummaries.length,
    },
    rows: overview.rows || [],
    developments: mergedSummaries.map((item) => {
      const profile = profileByDevelopmentId[item.id] || null
      return {
        ...item,
        coverImageUrl: getDevelopmentProfileCoverImage(profile || {}) || item.coverImageUrl || null,
        location: profile?.location || item.location || null,
        phase: profile?.status || item.phase || null,
        developerCompany: profile?.developerCompany || item.developerCompany || null,
        defaultAttorneyName: configuredAttorneyByDevelopmentId[item.id] || defaultAttorneyByDevelopmentId[item.id] || '',
      }
    }),
  }
}
