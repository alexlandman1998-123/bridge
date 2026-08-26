import {
  createPrivatePropertyClient,
  extractPrivatePropertyXmlBlocks,
  extractPrivatePropertyXmlTag,
  normalizePrivatePropertyText,
  summarizePrivatePropertySoapResponse,
} from './privatePropertyClient.js'
import {
  resolvePrivatePropertyRuntimeCredentials,
} from './privatePropertyAgencyConfigService.js'
import {
  buildPrivatePropertyGoLiveReadinessReport,
} from './privatePropertyGoLiveReadinessService.js'
import {
  recordPrivatePropertyListingSync,
  resolvePrivatePropertyExternalStatus,
} from './privatePropertyListingSyncService.js'

export const PRIVATE_PROPERTY_POST_SUBMIT_MONITOR_SERVICE_VERSION = 'arch9_private_property_post_submit_monitor_v1'

function normalizeKey(value = '') {
  return normalizePrivatePropertyText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeEnvironment(value = '') {
  const key = normalizeKey(value)
  return key === 'production' ? 'production' : 'sandbox'
}

function unique(values = []) {
  return [...new Set(values.map(normalizePrivatePropertyText).filter(Boolean))]
}

function parsePrivatePropertyActiveListings(xml = '') {
  return extractPrivatePropertyXmlBlocks(xml, 'ActiveListing').map((block) => ({
    listingType: extractPrivatePropertyXmlTag(block, 'ListingType'),
    privatePropertyRef: extractPrivatePropertyXmlTag(block, 'PrivatePropertyRef'),
    uniqueId: extractPrivatePropertyXmlTag(block, 'UniqueId'),
  }))
}

export function parsePrivatePropertyPostSubmitEvents(xml = '') {
  const blocks = [
    ...extractPrivatePropertyXmlBlocks(xml, 'LisitngEventFeedData'),
    ...extractPrivatePropertyXmlBlocks(xml, 'ListingEventFeedData'),
  ]
  return blocks.map((block) => {
    const eventDescription = extractPrivatePropertyXmlTag(block, 'EventDescription') || extractPrivatePropertyXmlTag(block, 'Description')
    const referenceFromDescription = /^T\d+/i.test(eventDescription) ? eventDescription : ''
    return {
      listingFeedEventType: extractPrivatePropertyXmlTag(block, 'ListingFeedEventType'),
      eventType: extractPrivatePropertyXmlTag(block, 'EventType'),
      propertyId: extractPrivatePropertyXmlTag(block, 'PropertyId') || extractPrivatePropertyXmlTag(block, 'ListingFeedRef') || extractPrivatePropertyXmlTag(block, 'UniqueListingId') || extractPrivatePropertyXmlTag(block, 'UniqueListingID'),
      privatePropertyRef: extractPrivatePropertyXmlTag(block, 'PrivatePropertyRef') || extractPrivatePropertyXmlTag(block, 'ReferenceNumber') || referenceFromDescription,
      eventDescription,
      eventStatus: extractPrivatePropertyXmlTag(block, 'ListingFeedEventStatus'),
      eventDate: extractPrivatePropertyXmlTag(block, 'EventDate') || extractPrivatePropertyXmlTag(block, 'TimeStamp') || extractPrivatePropertyXmlTag(block, 'CreatedDate'),
    }
  })
}

function eventMatchesProperty(event = {}, propertyId = '') {
  const id = normalizePrivatePropertyText(propertyId)
  if (!id) return true
  return normalizePrivatePropertyText(event.propertyId) === id || normalizePrivatePropertyText(event.eventDescription).includes(id)
}

function selectLatestEvent(events = [], propertyId = '') {
  const matches = events.filter((event) => eventMatchesProperty(event, propertyId))
  return matches[0] || null
}

function createBlockedReport({ listingId = '', environment = 'sandbox', blockers = [], readiness = null } = {}) {
  return {
    version: PRIVATE_PROPERTY_POST_SUBMIT_MONITOR_SERVICE_VERSION,
    phase: 'private-property-go-live-phase5-post-submit-monitor',
    generatedAt: new Date().toISOString(),
    environment: normalizeEnvironment(environment),
    listingId: normalizePrivatePropertyText(listingId),
    status: 'BLOCKED',
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      rawCredentialsStored: false,
    },
    readiness: readiness
      ? {
        status: readiness.status,
        ready: readiness.ready,
        blockers: readiness.blockers,
        warnings: readiness.warnings,
      }
      : null,
    blockers: unique(blockers),
    warnings: unique(readiness?.warnings || []),
    nextStep: 'Resolve blockers before polling Private Property post-submit state.',
  }
}

function summarizeResponse(response = {}, method = '') {
  return response.summary || summarizePrivatePropertySoapResponse(method, response.data || '')
}

export async function runPrivatePropertyPostSubmitMonitor({
  client,
  listingId = '',
  environment = 'sandbox',
  secrets = process.env,
  overrides = {},
  continuationKey = '0',
  startDateTime = '',
  recordSync = false,
  privateProperty = null,
  createPrivateProperty = createPrivatePropertyClient,
} = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const normalizedListingId = normalizePrivatePropertyText(listingId)
  if (!normalizedListingId) throw new Error('--listing-id is required.')
  const normalizedEnvironment = normalizeEnvironment(environment)

  const readiness = await buildPrivatePropertyGoLiveReadinessReport({
    client,
    listingId: normalizedListingId,
    environment: normalizedEnvironment,
    secrets,
    overrides,
  })
  const propertyId = normalizePrivatePropertyText(readiness.preview?.summary?.propertyId)
  const branchGuid = normalizePrivatePropertyText(readiness.agencyConfig?.branchGuid)
  const listingType = normalizePrivatePropertyText(readiness.preview?.summary?.listingType) || 'Sale'
  const agentIds = Array.isArray(readiness.preview?.summary?.agentIds) ? readiness.preview.summary.agentIds : []
  const suburbId = readiness.preview?.summary?.suburbId ?? null
  const credentialResolution = resolvePrivatePropertyRuntimeCredentials(readiness.agencyConfig, secrets)
  const blockers = unique([
    ...(readiness.ready ? [] : readiness.blockers || []),
    ...(!propertyId ? ['missing_private_property_property_id'] : []),
    ...(!branchGuid ? ['missing_private_property_branch_guid'] : []),
    ...credentialResolution.missingSecrets.map((secretName) => `missing_runtime_secret:${secretName}`),
  ])

  if (blockers.length) {
    return createBlockedReport({
      listingId: normalizedListingId,
      environment: normalizedEnvironment,
      blockers,
      readiness,
    })
  }

  const portal = privateProperty || createPrivateProperty({
    baseUrl: readiness.agencyConfig.baseUrl,
    username: credentialResolution.username,
    password: credentialResolution.password,
  })
  const report = {
    version: PRIVATE_PROPERTY_POST_SUBMIT_MONITOR_SERVICE_VERSION,
    phase: 'private-property-go-live-phase5-post-submit-monitor',
    generatedAt: new Date().toISOString(),
    environment: normalizedEnvironment,
    listingId: normalizedListingId,
    propertyId,
    branchGuid,
    listingType,
    recordSync: Boolean(recordSync),
    safety: {
      privatePropertyApiCalled: true,
      databaseWritten: false,
      rawCredentialsStored: false,
    },
    readiness: {
      status: readiness.status,
      ready: readiness.ready,
      warnings: readiness.warnings,
    },
    status: 'BLOCKED',
    blockers: [],
    warnings: unique(readiness.warnings || []),
    checks: [],
    eventFeed: null,
    statusProbe: null,
    syncResult: null,
    nextStep: 'Review Private Property post-submit state.',
  }

  try {
    const [statusResponse, verboseResponse, referenceResponse, activeResponse, eventResponse] = await Promise.all([
      portal.getListingStatus({ branchGuid, propertyId }),
      portal.getListingStatusVerbose({ branchGuid, propertyId }),
      portal.getReferenceNumberByListing({ branchGuid, uniqueListingId: propertyId, listingType }),
      portal.getActiveListings({ branchGuid }),
      portal.getListingEventFeedByBranch({ branchGuid, continuationKey, startDateTime }),
    ])
    const activeListings = parsePrivatePropertyActiveListings(activeResponse.data)
    const activeMatch = activeListings.find((item) => normalizePrivatePropertyText(item.uniqueId) === propertyId)
    const events = parsePrivatePropertyPostSubmitEvents(eventResponse.data)
    const matchingEvents = events.filter((event) => eventMatchesProperty(event, propertyId))
    const latestEvent = selectLatestEvent(events, propertyId)
    const privatePropertyStatus = extractPrivatePropertyXmlTag(statusResponse.data, 'GetListingStatusResult')
    const privatePropertyStatusVerbose = extractPrivatePropertyXmlTag(verboseResponse.data, 'GetListingStatusVerboseResult')
    const privatePropertyRef = extractPrivatePropertyXmlTag(referenceResponse.data, 'GetReferenceNumberByListingResult') ||
      latestEvent?.privatePropertyRef ||
      activeMatch?.privatePropertyRef ||
      ''
    const externalStatus = resolvePrivatePropertyExternalStatus({
      privatePropertyStatus,
      eventType: latestEvent?.listingFeedEventType || latestEvent?.eventType || '',
      eventStatus: latestEvent?.eventStatus || '',
      fallback: activeMatch ? 'active' : 'submitted',
    })

    report.statusProbe = {
      privatePropertyStatus,
      privatePropertyStatusVerbose,
      privatePropertyRef,
      activeListing: activeMatch || null,
      responseSummaries: {
        status: summarizeResponse(statusResponse, 'GetListingStatus'),
        verbose: summarizeResponse(verboseResponse, 'GetListingStatusVerbose'),
        reference: summarizeResponse(referenceResponse, 'GetReferenceNumberByListing'),
        active: summarizeResponse(activeResponse, 'GetActiveListings'),
      },
    }
    report.eventFeed = {
      continuationKey: eventResponse.summary?.continuationKey || '',
      eventCount: events.length,
      matchCount: matchingEvents.length,
      latestEvent,
      events: matchingEvents,
      responseSummary: summarizeResponse(eventResponse, 'GetListingEventFeedByBranch'),
    }
    report.status = externalStatus === 'failed' ? 'ATTENTION_REQUIRED' : activeMatch || externalStatus === 'active' ? 'ACTIVATED' : 'PENDING'
    report.externalStatus = externalStatus
    report.checks = [
      { name: 'listing_status', status: privatePropertyStatus ? 'PASS' : 'BLOCKED' },
      { name: 'reference_number', status: privatePropertyRef ? 'PASS' : 'PENDING' },
      { name: 'active_listing', status: activeMatch ? 'PASS' : 'PENDING' },
      { name: 'event_feed', status: matchingEvents.length ? 'PASS' : 'PENDING' },
    ]
    report.blockers = report.status === 'ATTENTION_REQUIRED' ? ['private_property_listing_event_failed'] : []

    if (recordSync) {
      const syncResult = await recordPrivatePropertyListingSync({
        client,
        listingId: normalizedListingId,
        propertyId,
        branchGuid,
        environment: normalizedEnvironment,
        listingType,
        privatePropertyRef,
        privatePropertyStatus,
        externalStatus,
        isOnPortal: Boolean(activeMatch || externalStatus === 'active'),
        eventType: latestEvent?.listingFeedEventType || latestEvent?.eventType || '',
        eventStatus: latestEvent?.eventStatus || '',
        eventDescription: latestEvent?.eventDescription || '',
        eventAt: latestEvent?.eventDate || '',
        continuationKey: report.eventFeed.continuationKey,
        suburbId,
        agentIds,
        responseSummary: report.statusProbe.responseSummaries,
        payloadSummary: readiness.preview?.summary || {},
        eventSummary: latestEvent || {},
        activatedAt: externalStatus === 'active' ? latestEvent?.eventDate || report.generatedAt : '',
      })
      report.safety.databaseWritten = true
      report.syncResult = {
        arch9Status: syncResult.arch9Status,
        syncId: normalizePrivatePropertyText(syncResult.sync?.id),
        listingId: normalizePrivatePropertyText(syncResult.listing?.id),
        externalLinkWarning: syncResult.externalLinkWarning || null,
      }
    }

    report.nextStep = report.status === 'ACTIVATED'
      ? 'Private Property shows the listing as active. Keep polling event feed until image events settle, then close go-live evidence.'
      : report.status === 'ATTENTION_REQUIRED'
        ? 'Investigate the Private Property event/status error before publishing more listings.'
        : 'Poll again with the returned continuation key until the listing is active or an error event appears.'
  } catch (error) {
    report.status = 'BLOCKED'
    report.blockers = ['private_property_post_submit_monitor_failed']
    report.apiError = {
      name: error.name || 'Error',
      message: error.message,
      status: error.status || null,
      statusText: error.statusText || '',
      faultCode: error.faultCode || '',
      faultString: error.faultString || '',
      responseSummary: error.responseBody ? summarizePrivatePropertySoapResponse(error.method || 'PrivatePropertyMonitor', error.responseBody) : null,
    }
    report.nextStep = 'Fix the Private Property monitor error, then poll again.'
  }

  return report
}
