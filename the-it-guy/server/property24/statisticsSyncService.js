import { normalizeProperty24Text, summarizeProperty24Payload } from './client.js'
import { normalizeProperty24ListingStatistics } from './statisticsContract.js'
import { buildProperty24ListingStatisticsSnapshot } from './statisticsStorage.js'
import { fetchOrganisationProperty24Credentials } from './organisationCredentialService.js'
import { resolveProperty24EnvironmentCredentials } from './environmentService.js'
import { listingStatisticsWindow, shiftStatisticsDate, statisticsDate } from '../services/listingStatisticsDates.js'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_DATE_RANGE_DAYS = 62
const DEFAULT_LOOKBACK_DAYS = 7
const PROPERTY24_STATISTICS_LISTING_TYPES = Object.freeze(['Sale', 'Rental'])

export function isProperty24StatisticsApiVersionSupported(value) {
  const match = normalizeProperty24Text(value).toLowerCase().match(/^v(\d+)$/)
  return Boolean(match && Number(match[1]) >= 55)
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.listings)) return value.listings
  if (Array.isArray(value?.items)) return value.items
  return []
}

function requiredText(value, label) {
  const normalized = normalizeProperty24Text(value)
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function parseDate(value, label) {
  const normalized = statisticsDate(normalizeProperty24Text(value), label)
  const date = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`)
  return date
}

function formatDate(date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date, days) {
  return new Date(date.getTime() + (days * DAY_MS))
}

function normalizeListingTypes(value) {
  const supplied = Array.isArray(value) ? value : PROPERTY24_STATISTICS_LISTING_TYPES
  const listingTypes = [...new Set(supplied.map((item) => normalizeProperty24Text(item).toLowerCase()))]
    .map((item) => item === 'sale' ? 'Sale' : item === 'rental' ? 'Rental' : '')
    .filter(Boolean)
  if (!listingTypes.length) throw new Error('listingTypes must include Sale or Rental.')
  return listingTypes
}

export function resolveProperty24StatisticsDateWindow({
  startDate = '',
  endDate = '',
  lastUpdateDate = '',
  now = new Date(),
} = {}) {
  const latestStatisticDate = normalizeProperty24Text(lastUpdateDate)
    ? parseDate(lastUpdateDate, 'lastUpdateDate')
    : addDays(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), -1)
  const resolvedEnd = normalizeProperty24Text(endDate)
    ? parseDate(endDate, 'endDate')
    : addDays(latestStatisticDate, 1)
  const resolvedStart = normalizeProperty24Text(startDate)
    ? parseDate(startDate, 'startDate')
    : addDays(resolvedEnd, -DEFAULT_LOOKBACK_DAYS)
  const rangeDays = Math.round((resolvedEnd.getTime() - resolvedStart.getTime()) / DAY_MS)
  if (rangeDays <= 0) throw new Error('endDate must be after startDate.')
  if (rangeDays > MAX_DATE_RANGE_DAYS) throw new Error(`Property24 statistics sync is limited to ${MAX_DATE_RANGE_DAYS} days.`)
  return {
    startDate: formatDate(resolvedStart),
    endDate: formatDate(resolvedEnd),
    lastUpdateDate: formatDate(latestStatisticDate),
  }
}

async function createSyncRun(supabase, values) {
  const result = await supabase
    .from('property24_statistics_sync_runs')
    .insert(values)
    .select('id')
    .single()
  if (result.error) throw result.error
  return result.data?.id || ''
}

async function finishSyncRun(supabase, runId, values) {
  if (!runId) return
  const result = await supabase
    .from('property24_statistics_sync_runs')
    .update({ ...values, completed_at: new Date().toISOString() })
    .eq('id', runId)
  if (result.error) throw result.error
}

async function resolveListingIdsByNumber({ supabase, organisationId, environment, agencyId }) {
  const listings = new Map()
  // Keep each page below the REST API row cap. Filter ownership in the
  // database rather than first building a potentially truncated list of IDs.
  for (let offset = 0; offset < 10_000; offset += 500) {
    const result = await supabase.from('property24_listing_syncs')
      .select('listing_number, private_listing_id, private_listings!inner(id, organisation_id)')
      .eq('environment', environment).eq('agency_id', agencyId)
      .eq('private_listings.organisation_id', organisationId)
      .order('listing_number').range(offset, offset + 499)
    if (result.error) throw result.error
    const rows = result.data || []
    for (const row of rows) {
      const owner = Array.isArray(row.private_listings) ? row.private_listings[0] : row.private_listings
      const number = Number(row.listing_number)
      if (owner?.organisation_id !== organisationId || owner?.id !== row.private_listing_id
        || !Number.isSafeInteger(number) || number <= 0
        || (listings.has(number) && listings.get(number) !== row.private_listing_id)) {
        throw new Error('Property24 statistics listing mapping is invalid.')
      }
      listings.set(number, row.private_listing_id)
    }
    if (rows.length < 500) return listings
  }
  throw new Error('Property24 statistics listing inventory exceeds the supported limit.')
}

function syncErrorSummary(error, recordErrors = []) {
  return {
    message: normalizeProperty24Text(error?.message) || 'Property24 statistics sync failed.',
    code: normalizeProperty24Text(error?.code) || null,
    httpStatus: Number(error?.status) || null,
    invalidRecordCount: recordErrors.length,
    invalidRecords: recordErrors.slice(0, 20),
  }
}

export async function syncProperty24ListingStatistics({
  supabase,
  property24,
  config = {},
  now = new Date(),
} = {}) {
  if (!supabase?.from) throw new Error('Supabase client is required.')
  if (!property24?.fetchStatisticsLastUpdateDate || !property24?.fetchAgencyListingStatistics) {
    throw new Error('Property24 statistics client is required.')
  }

  const organisationId = requiredText(config.organisationId, 'organisationId')
  const agencyId = Number(requiredText(config.agencyId, 'agencyId'))
  if (!Number.isSafeInteger(agencyId) || agencyId <= 0) throw new Error('agencyId must be a positive integer.')
  const environment = normalizeProperty24Text(config.environment || 'production').toLowerCase()
  if (!['exdev', 'production'].includes(environment)) throw new Error('environment must be exdev or production.')
  const sourceApiVersion = requiredText(config.sourceApiVersion || property24.apiVersion, 'sourceApiVersion').toLowerCase()
  if (!/^v\d+$/.test(sourceApiVersion)) throw new Error('sourceApiVersion must use the form vNN.')
  if (!isProperty24StatisticsApiVersionSupported(sourceApiVersion)) {
    throw new Error('Property24 statistics sync requires Listing Service v55 or later.')
  }
  const listingTypes = normalizeListingTypes(config.listingTypes)

  const latestResult = await property24.fetchStatisticsLastUpdateDate()
  const window = resolveProperty24StatisticsDateWindow({
    startDate: config.startDate,
    endDate: config.endDate,
    lastUpdateDate: latestResult.data,
    now,
  })
  const runId = await createSyncRun(supabase, {
    organisation_id: organisationId,
    agency_id: agencyId,
    environment,
    source_api_version: sourceApiVersion,
    requested_from_date: window.startDate,
    requested_to_date: window.endDate,
    requested_by: normalizeProperty24Text(config.requestedBy) || null,
    status: 'running',
  })

  const recordErrors = []
  try {
    const [listingMap, ...statisticsResults] = await Promise.all([
      resolveListingIdsByNumber({ supabase, organisationId, environment, agencyId }),
      ...listingTypes.map((listingType) => property24.fetchAgencyListingStatistics({
        agencyIds: [agencyId],
        listingType,
        startDate: window.startDate,
        endDate: window.endDate,
      })),
    ])
    const remoteRows = statisticsResults.flatMap((result) => asArray(result.data))
    const snapshots = []
    for (const row of remoteRows) {
      try {
        const statistic = normalizeProperty24ListingStatistics(row)
        if (statistic.agencyId !== agencyId) throw new Error('Property24 returned statistics for another agency.')
        statisticsDate(statistic.statisticDate, 'statistic.date')
        // Fetching one boundary day on either side permits inclusive/exclusive
        // supplier boundaries. Persist each requested calendar day once.
        const storageStart = config.storageStartDate || window.startDate
        const storageEnd = config.storageEndDate || shiftStatisticsDate(window.endDate, -1)
        if (statistic.statisticDate < storageStart || statistic.statisticDate > storageEnd) continue
        if (statistic.unexpectedFields.length) {
          recordErrors.push({
            listingNumber: statistic.listingNumber,
            code: 'unrecognised_property24_statistics_fields',
            fields: statistic.unexpectedFields,
          })
        }
        snapshots.push(buildProperty24ListingStatisticsSnapshot({
          organisationId,
          privateListingId: listingMap.get(statistic.listingNumber),
          environment,
          sourceApiVersion,
          statistic,
          syncedAt: now.toISOString(),
        }))
      } catch (error) {
        recordErrors.push({
          listingNumber: Number(row?.listingNumber) || null,
          code: 'invalid_statistics_record',
          message: normalizeProperty24Text(error.message) || 'Invalid Property24 statistics record.',
        })
      }
    }
    if (snapshots.length) {
      const writeResult = await supabase
        .from('property24_listing_statistics_daily')
        .upsert(snapshots, {
          onConflict: 'organisation_id,environment,agency_id,listing_number,statistic_date',
        })
      if (writeResult.error) throw writeResult.error
    }
    const status = recordErrors.length ? 'partial' : 'completed'
    await finishSyncRun(supabase, runId, {
      status,
      received_count: remoteRows.length,
      stored_count: snapshots.length,
      error_summary: recordErrors.length ? { invalidRecords: recordErrors.slice(0, 20), invalidRecordCount: recordErrors.length } : {},
    })
    return {
      status,
      runId,
      organisationId,
      agencyId,
      environment,
      sourceApiVersion,
      window,
      lastUpdate: {
        httpStatus: latestResult.status,
        durationMs: latestResult.durationMs,
        data: latestResult.data,
      },
      listingTypes,
      receivedCount: remoteRows.length,
      storedCount: snapshots.length,
      recordErrors,
      property24: statisticsResults.map((result, index) => ({
        listingType: listingTypes[index],
        httpStatus: result.status,
        durationMs: result.durationMs,
        summary: summarizeProperty24Payload(result.data),
      })),
    }
  } catch (error) {
    await finishSyncRun(supabase, runId, {
      status: 'failed',
      error_summary: syncErrorSummary(error, recordErrors),
    }).catch(() => undefined)
    throw error
  }
}

export async function resolveProperty24StatisticsCredentials({ supabase, organisationId, environment, env }) {
  const runtime = resolveProperty24EnvironmentCredentials({ env, environment })
  const stored = await fetchOrganisationProperty24Credentials({ supabase, organisationId, environment })
  const credentials = { ...runtime, ...(stored ? { username: stored.username, password: stored.password, userGroupId: stored.userGroupId, credentialSource: stored.source } : {}) }
  credentials.configured = Boolean(credentials.environmentMatches && credentials.username && credentials.password)
  return credentials
}

export async function syncProperty24StatisticsBackfill({ supabase, property24, config = {}, now = new Date() }) {
  const window = listingStatisticsWindow({ days: config.days ?? 90, startDate: config.startDate, endDate: config.endDate, now })
  const reports = []
  for (let start = window.startDate; start <= window.endDate; start = shiftStatisticsDate(start, 30)) {
    const end = [shiftStatisticsDate(start, 29), window.endDate].sort()[0]
    reports.push(await syncProperty24ListingStatistics({ supabase, property24, now, config: {
      ...config, startDate: shiftStatisticsDate(start, -1), endDate: shiftStatisticsDate(end, 1), storageStartDate: start, storageEndDate: end,
    } }))
  }
  return { status: reports.some((report) => report.status !== 'completed') ? 'partial' : 'completed', window,
    storedCount: reports.reduce((sum, report) => sum + report.storedCount, 0), receivedCount: reports.reduce((sum, report) => sum + report.receivedCount, 0),
    chunks: reports.map(({ status, runId, window: chunk, storedCount }) => ({ status, runId, window: chunk, storedCount })) }
}
