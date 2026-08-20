import { createHash } from 'node:crypto'
import { normalizeProperty24Text, summarizeProperty24Payload } from './client.js'
import { summarizeProperty24LeadPayload } from './leadService.js'

const DAY_MS = 24 * 60 * 60 * 1000

function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toIsoDate(value) {
  const date = toDate(value)
  return date ? date.toISOString() : ''
}

function clampDateWindow({ value, now = new Date(), maxAgeDays, fallbackAgeDays }) {
  const current = toDate(now) || new Date()
  const oldest = new Date(current.getTime() - maxAgeDays * DAY_MS)
  const fallback = new Date(current.getTime() - fallbackAgeDays * DAY_MS)
  const requested = toDate(value) || fallback
  if (requested < oldest) return oldest.toISOString()
  if (requested > current) return current.toISOString()
  return requested.toISOString()
}

export function clampProperty24UpdatesFromDate(value, now = new Date()) {
  return clampDateWindow({ value, now, maxAgeDays: 7, fallbackAgeDays: 1 })
}

export function clampProperty24LeadsAfter(value, now = new Date()) {
  return clampDateWindow({ value, now, maxAgeDays: 30, fallbackAgeDays: 1 })
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.listings)) return value.listings
  if (Array.isArray(value?.Listings)) return value.Listings
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.Items)) return value.Items
  if (Array.isArray(value?.leads)) return value.leads
  if (Array.isArray(value?.Leads)) return value.Leads
  return []
}

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null
}

function extractListingNumber(value = {}) {
  return toNumber(
    value.listingNumber ||
      value.ListingNumber ||
      value.listingId ||
      value.ListingId ||
      value.id ||
      value.Id,
  )
}

function extractLeadListingNumber(value = {}) {
  return toNumber(
    value.listingNumber ||
      value.ListingNumber ||
      value.property24ListingNumber ||
      value.Property24ListingNumber ||
      value.externalListingNumber ||
      value.ExternalListingNumber,
  )
}

function normalizeStatus(value = '') {
  return normalizeProperty24Text(value).toLowerCase().replace(/[\s_-]+/g, '_')
}

function extractStatus(value = {}) {
  return normalizeProperty24Text(
    value.status ||
      value.Status ||
      value.listingStatus ||
      value.ListingStatus ||
      value.state ||
      value.State ||
      value.externalStatus ||
      value.ExternalStatus,
  )
}

function mapProperty24StatusToSyncStatus({ status = '', isOnPortal = null } = {}) {
  if (isOnPortal === true) return 'on_portal'
  const key = normalizeStatus(status)
  if (!key) return isOnPortal === false ? 'not_on_portal' : ''
  if (['newlisting', 'new_listing', 'active', 'published', 'on_portal', 'live'].includes(key)) return 'on_portal'
  if (['withdrawn', 'cancelled', 'cancelledsale', 'cancelled_sale', 'expired', 'sold', 'rented'].includes(key)) return 'removed'
  if (['paused', 'suspended'].includes(key)) return 'paused'
  if (['blocked', 'failed', 'rejected'].includes(key)) return 'failed'
  return isOnPortal === false ? 'not_on_portal' : ''
}

function extractIsOnPortal(value = {}) {
  const direct = value.isOnPortal ?? value.IsOnPortal ?? value.onPortal ?? value.OnPortal ?? value.isLive ?? value.IsLive
  return typeof direct === 'boolean' ? direct : null
}

function extractUpdatedAt(value = {}) {
  return toIsoDate(
    value.updatedAt ||
      value.UpdatedAt ||
      value.lastUpdatedAt ||
      value.LastUpdatedAt ||
      value.modifiedAt ||
      value.ModifiedAt ||
      value.statusChangedAt ||
      value.StatusChangedAt,
  )
}

function summarizeRemoteListing(value = {}) {
  const status = extractStatus(value)
  const isOnPortal = extractIsOnPortal(value)
  return {
    listingNumber: extractListingNumber(value),
    status: status || null,
    statusKey: normalizeStatus(status),
    syncStatusKey: mapProperty24StatusToSyncStatus({ status, isOnPortal }),
    isOnPortal,
    updatedAt: extractUpdatedAt(value) || null,
  }
}

function summarizeLocalSync(value = {}, listing = null) {
  return {
    id: value.id || null,
    listingId: value.private_listing_id || value.privateListingId || null,
    agencyId: toNumber(value.agency_id || value.agencyId),
    listingNumber: toNumber(value.listing_number || value.listingNumber),
    externalStatus: normalizeProperty24Text(value.external_status || value.externalStatus),
    externalStatusKey: normalizeStatus(value.external_status || value.externalStatus),
    isOnPortal: Boolean(value.is_on_portal ?? value.isOnPortal),
    lastSuccessfulSyncAt: value.last_successful_sync_at || value.lastSuccessfulSyncAt || null,
    lastCheckedAt: value.last_checked_at || value.lastCheckedAt || null,
    listing: listing
      ? {
          id: listing.id || null,
          organisationId: listing.organisation_id || listing.organisationId || null,
          title: listing.title || null,
          status: listing.listing_status || listing.listingStatus || null,
          property24Status: listing.property24_status || listing.property24Status || null,
          property24Reference: listing.property24_reference || listing.property24Reference || null,
        }
      : null,
  }
}

async function selectRows(query) {
  const result = await query
  if (result?.error) throw result.error
  return Array.isArray(result?.data) ? result.data : []
}

export async function fetchProperty24LocalSyncRows({
  supabase,
  environment = 'exdev',
  agencyId,
  listingNumber,
  limit = 500,
} = {}) {
  if (!supabase) throw new Error('Supabase client is required.')
  let query = supabase
    .from('property24_listing_syncs')
    .select('*')
    .eq('environment', environment)
    .limit(limit)
  if (agencyId) query = query.eq('agency_id', Number(agencyId))
  if (listingNumber) query = query.eq('listing_number', Number(listingNumber))

  const syncRows = await selectRows(query)
  const listingIds = [...new Set(syncRows.map((row) => row.private_listing_id).filter(Boolean))]
  if (!listingIds.length) return syncRows.map((sync) => ({ sync, listing: null }))

  let listingRows = []
  try {
    listingRows = await selectRows(
      supabase
        .from('private_listings')
        .select('id, organisation_id, listing_status, title, property24_reference, property24_status')
        .in('id', listingIds),
    )
  } catch {
    listingRows = []
  }
  const listingsById = new Map(listingRows.map((listing) => [listing.id, listing]))
  return syncRows.map((sync) => ({
    sync,
    listing: listingsById.get(sync.private_listing_id) || null,
  }))
}

export function createProperty24ReconciliationComparison({ localRows = [], remoteRows = [] } = {}) {
  const local = localRows.map(({ sync, listing }) => summarizeLocalSync(sync, listing))
  const remote = remoteRows.map(summarizeRemoteListing).filter((row) => row.listingNumber)
  const localByNumber = new Map(local.filter((row) => row.listingNumber).map((row) => [row.listingNumber, row]))
  const remoteByNumber = new Map(remote.map((row) => [row.listingNumber, row]))

  const matched = []
  const statusDrift = []
  for (const [listingNumber, localSync] of localByNumber.entries()) {
    const remoteListing = remoteByNumber.get(listingNumber)
    if (!remoteListing) continue
    matched.push({ listingNumber, local: localSync, remote: remoteListing })
    const remoteStatus = remoteListing.syncStatusKey
    const localStatus = localSync.externalStatusKey
    const statusChanged = Boolean(remoteStatus && localStatus && remoteStatus !== localStatus)
    const portalChanged = remoteListing.isOnPortal !== null && remoteListing.isOnPortal !== localSync.isOnPortal
    if (statusChanged || portalChanged) {
      statusDrift.push({
        listingNumber,
        listingId: localSync.listingId,
        localStatus: localSync.externalStatus || null,
        remoteStatus: remoteListing.status || null,
        localIsOnPortal: localSync.isOnPortal,
        remoteIsOnPortal: remoteListing.isOnPortal,
      })
    }
  }

  const missingOnProperty24 = local.filter((row) => row.listingNumber && !remoteByNumber.has(row.listingNumber))
  const unexpectedOnProperty24 = remote.filter((row) => row.listingNumber && !localByNumber.has(row.listingNumber))

  return {
    summary: {
      localCount: local.length,
      remoteCount: remote.length,
      matchedCount: matched.length,
      missingOnProperty24Count: missingOnProperty24.length,
      unexpectedOnProperty24Count: unexpectedOnProperty24.length,
      statusDriftCount: statusDrift.length,
    },
    matched,
    missingOnProperty24,
    unexpectedOnProperty24,
    statusDrift,
  }
}

export async function createProperty24ReconciliationReport({
  supabase,
  property24,
  config = {},
  now = new Date(),
} = {}) {
  if (!property24) throw new Error('Property24 client is required.')
  const environment = normalizeProperty24Text(config.environment) || 'exdev'
  const agencyId = normalizeProperty24Text(config.agencyId)
  const localRows = await fetchProperty24LocalSyncRows({
    supabase,
    environment,
    agencyId,
    limit: config.limit || 500,
  })
  const result = await property24.fetchListingReconciliation({
    agencyId,
    agentId: normalizeProperty24Text(config.agentId),
  })
  const remoteRows = asArray(result.data)
  return {
    generatedAt: toIsoDate(now),
    environment,
    agencyId,
    property24: {
      httpStatus: result.status,
      durationMs: result.durationMs,
      summary: summarizeProperty24Payload(result.data),
    },
    ...createProperty24ReconciliationComparison({ localRows, remoteRows }),
  }
}

export async function createProperty24UpdatesReport({
  supabase,
  property24,
  config = {},
  now = new Date(),
} = {}) {
  if (!property24) throw new Error('Property24 client is required.')
  const environment = normalizeProperty24Text(config.environment) || 'exdev'
  const agencyId = normalizeProperty24Text(config.agencyId)
  const fromDate = clampProperty24UpdatesFromDate(config.fromDate, now)
  const localRows = await fetchProperty24LocalSyncRows({
    supabase,
    environment,
    agencyId,
    limit: config.limit || 500,
  })
  const localByNumber = new Map(localRows.map(({ sync, listing }) => {
    const summary = summarizeLocalSync(sync, listing)
    return [summary.listingNumber, summary]
  }))
  const result = await property24.fetchListingUpdates(fromDate)
  const updates = asArray(result.data).map((update) => {
    const remote = summarizeRemoteListing(update)
    const local = localByNumber.get(remote.listingNumber) || null
    return {
      ...remote,
      listingId: local?.listingId || null,
      knownToArch9: Boolean(local),
      localStatus: local?.externalStatus || null,
      localIsOnPortal: local?.isOnPortal ?? null,
    }
  })
  return {
    generatedAt: toIsoDate(now),
    environment,
    agencyId,
    fromDate,
    property24: {
      httpStatus: result.status,
      durationMs: result.durationMs,
      summary: summarizeProperty24Payload(result.data),
    },
    summary: {
      updateCount: updates.length,
      matchedCount: updates.filter((update) => update.knownToArch9).length,
      unmatchedCount: updates.filter((update) => !update.knownToArch9).length,
    },
    updates,
  }
}

export async function createProperty24PortalVisibilityReport({
  supabase,
  property24,
  config = {},
  now = new Date(),
} = {}) {
  if (!property24) throw new Error('Property24 client is required.')
  const environment = normalizeProperty24Text(config.environment) || 'exdev'
  const agencyId = normalizeProperty24Text(config.agencyId)
  const limit = Math.min(Math.max(Number(config.limit || 25), 1), 100)
  const localRows = await fetchProperty24LocalSyncRows({ supabase, environment, agencyId, limit })
  const checks = []
  for (const row of localRows) {
    const local = summarizeLocalSync(row.sync, row.listing)
    if (!local.listingNumber) continue
    try {
      const result = await property24.checkListingOnPortal(local.listingNumber)
      checks.push({
        listingNumber: local.listingNumber,
        listingId: local.listingId,
        localIsOnPortal: local.isOnPortal,
        remoteIsOnPortal: Boolean(result.data),
        drift: Boolean(result.data) !== local.isOnPortal,
        httpStatus: result.status,
        durationMs: result.durationMs,
      })
    } catch (error) {
      checks.push({
        listingNumber: local.listingNumber,
        listingId: local.listingId,
        localIsOnPortal: local.isOnPortal,
        remoteIsOnPortal: null,
        drift: false,
        error: {
          message: error.message,
          httpStatus: error.status || null,
          response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
        },
      })
    }
  }
  return {
    generatedAt: toIsoDate(now),
    environment,
    agencyId,
    summary: {
      checkedCount: checks.length,
      driftCount: checks.filter((check) => check.drift).length,
      failedCount: checks.filter((check) => check.error).length,
    },
    checks,
  }
}

function extractLeadValue(lead = {}, ...keys) {
  for (const key of keys) {
    const value = lead[key]
    if (value !== undefined && value !== null && normalizeProperty24Text(value)) return value
  }
  return ''
}

function createLeadDedupeKey({ listingNumber, email, phone, message, receivedAt }) {
  return createHash('sha256')
    .update([
      listingNumber || '',
      normalizeProperty24Text(email).toLowerCase(),
      normalizeProperty24Text(phone).replace(/[^\d+]/g, ''),
      normalizeProperty24Text(message).toLowerCase(),
      normalizeProperty24Text(receivedAt),
    ].join('|'))
    .digest('hex')
}

export function normalizeProperty24LeadForImport(lead = {}, listingMap = new Map()) {
  const listingNumber = extractLeadListingNumber(lead)
  const local = listingMap.get(listingNumber) || null
  const contactName = normalizeProperty24Text(extractLeadValue(lead, 'contactName', 'ContactName', 'name', 'Name', 'fullName', 'FullName'))
  const email = normalizeProperty24Text(extractLeadValue(lead, 'email', 'Email', 'emailAddress', 'EmailAddress'))
  const phone = normalizeProperty24Text(extractLeadValue(lead, 'mobile', 'Mobile', 'phoneNumber', 'PhoneNumber', 'telephone', 'Telephone'))
  const message = normalizeProperty24Text(extractLeadValue(lead, 'message', 'Message', 'comments', 'Comments', 'body', 'Body'))
  const receivedAt = toIsoDate(extractLeadValue(lead, 'receivedAt', 'ReceivedAt', 'createdAt', 'CreatedAt', 'date', 'Date'))
  const externalReference = normalizeProperty24Text(extractLeadValue(lead, 'id', 'Id', 'leadId', 'LeadId', 'reference', 'Reference'))
    || createLeadDedupeKey({ listingNumber, email, phone, message, receivedAt })
  return {
    source: 'Property24',
    externalReference,
    dedupeKey: createLeadDedupeKey({ listingNumber, email, phone, message, receivedAt }),
    listingNumber,
    listingId: local?.listingId || null,
    organisationId: local?.listing?.organisationId || null,
    receivedAt: receivedAt || null,
    contactName,
    email,
    phone,
    message,
    readyForCrmIngestion: Boolean(local?.listingId && local?.listing?.organisationId && (email || phone || contactName)),
    raw: lead,
  }
}

export async function createProperty24LeadImportPlan({
  supabase,
  property24,
  config = {},
  now = new Date(),
} = {}) {
  if (!property24) throw new Error('Property24 client is required.')
  const environment = normalizeProperty24Text(config.environment) || 'exdev'
  const agencyId = normalizeProperty24Text(config.agencyId)
  const after = clampProperty24LeadsAfter(config.after, now)
  const localRows = await fetchProperty24LocalSyncRows({
    supabase,
    environment,
    agencyId,
    limit: config.limit || 500,
  })
  const listingMap = new Map(localRows.map(({ sync, listing }) => {
    const summary = summarizeLocalSync(sync, listing)
    return [summary.listingNumber, summary]
  }))
  const result = await property24.fetchListingLeads({ after })
  const leads = asArray(result.data).map((lead) => normalizeProperty24LeadForImport(lead, listingMap))
  const duplicateKeys = new Set()
  const prepared = leads.map((lead) => {
    const duplicateInResponse = duplicateKeys.has(lead.dedupeKey)
    duplicateKeys.add(lead.dedupeKey)
    return { ...lead, duplicateInResponse }
  })
  return {
    generatedAt: toIsoDate(now),
    environment,
    agencyId,
    after,
    property24: {
      httpStatus: result.status,
      durationMs: result.durationMs,
      summary: summarizeProperty24LeadPayload(result.data),
    },
    summary: {
      receivedCount: prepared.length,
      readyForCrmIngestionCount: prepared.filter((lead) => lead.readyForCrmIngestion && !lead.duplicateInResponse).length,
      needsReviewCount: prepared.filter((lead) => !lead.readyForCrmIngestion || lead.duplicateInResponse).length,
      nextAfter: summarizeProperty24LeadPayload(result.data).nextAfter || null,
    },
    leads: prepared,
  }
}

export async function createProperty24StatisticsReport({ property24, config = {}, now = new Date() } = {}) {
  if (!property24) throw new Error('Property24 client is required.')
  const agencyId = normalizeProperty24Text(config.agencyId)
  const startDate = normalizeProperty24Text(config.startDate)
  const endDate = normalizeProperty24Text(config.endDate)
  const [lastUpdate, agencyListingStatistics, leadPeriods] = await Promise.all([
    property24.fetchStatisticsLastUpdateDate(),
    property24.fetchAgencyListingStatistics({ agencyIds: agencyId ? [agencyId] : [], startDate, endDate }),
    property24.fetchLeadStatisticsPeriods(),
  ])
  return {
    generatedAt: toIsoDate(now),
    agencyId,
    lastUpdate: {
      httpStatus: lastUpdate.status,
      durationMs: lastUpdate.durationMs,
      summary: summarizeProperty24Payload(lastUpdate.data),
      data: lastUpdate.data,
    },
    agencyListingStatistics: {
      httpStatus: agencyListingStatistics.status,
      durationMs: agencyListingStatistics.durationMs,
      summary: summarizeProperty24Payload(agencyListingStatistics.data),
      data: agencyListingStatistics.data,
    },
    leadStatisticPeriods: {
      httpStatus: leadPeriods.status,
      durationMs: leadPeriods.durationMs,
      summary: summarizeProperty24Payload(leadPeriods.data),
      data: leadPeriods.data,
    },
  }
}

export async function runProperty24ReconciliationJob({
  supabase,
  property24,
  config = {},
  now = new Date(),
} = {}) {
  const includePortalChecks = Boolean(config.includePortalChecks)
  const includeLeads = Boolean(config.includeLeads)
  const includeStatistics = Boolean(config.includeStatistics)
  const report = {
    phase: 'property24-phase5-reconciliation',
    generatedAt: toIsoDate(now),
    environment: normalizeProperty24Text(config.environment) || 'exdev',
    agencyId: normalizeProperty24Text(config.agencyId),
    mode: 'REPORT_ONLY',
    safety: {
      property24ApiCalled: true,
      databaseWritten: false,
      listingPublished: false,
      leadsCreated: false,
    },
    reconciliation: await createProperty24ReconciliationReport({ supabase, property24, config, now }),
    updates: await createProperty24UpdatesReport({ supabase, property24, config, now }),
  }

  if (includePortalChecks) {
    report.portalVisibility = await createProperty24PortalVisibilityReport({ supabase, property24, config, now })
  }
  if (includeLeads) {
    report.leadImportPlan = await createProperty24LeadImportPlan({ supabase, property24, config, now })
  }
  if (includeStatistics) {
    report.statistics = await createProperty24StatisticsReport({ property24, config, now })
  }

  report.status = report.reconciliation.summary.statusDriftCount ||
    report.reconciliation.summary.missingOnProperty24Count ||
    report.reconciliation.summary.unexpectedOnProperty24Count ||
    report.updates.summary.unmatchedCount ||
    report.portalVisibility?.summary?.driftCount
    ? 'NEEDS_REVIEW'
    : 'OK'

  return report
}
