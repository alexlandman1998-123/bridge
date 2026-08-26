import { createHash } from 'node:crypto'
import {
  createPrivatePropertyClient,
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
  createPrivatePropertyArch9ListingPreview,
  fetchArch9ListingForPrivatePropertyPreview,
} from './privatePropertyListingPreviewService.js'
import {
  recordPrivatePropertyListingSync,
} from './privatePropertyListingSyncService.js'

export const PRIVATE_PROPERTY_CONTROLLED_PUBLISH_SERVICE_VERSION = 'arch9_private_property_controlled_publish_rehearsal_v1'

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

export function createPrivatePropertyPayloadDigest(value = '') {
  const normalized = typeof value === 'string' ? value : JSON.stringify(value ?? null)
  return createHash('sha256').update(normalized).digest('hex')
}

export function buildPrivatePropertyPublishConfirmation({ listingId = '', environment = 'sandbox' } = {}) {
  return `PRIVATE_PROPERTY_PUBLISH:${normalizePrivatePropertyText(listingId)}:${normalizeEnvironment(environment)}`
}

function createPreviewOptions({ readiness = {}, overrides = {} } = {}) {
  return {
    ...overrides,
    branchGuid: normalizePrivatePropertyText(overrides.branchGuid) || normalizePrivatePropertyText(readiness.agencyConfig?.branchGuid),
    agentIds: normalizePrivatePropertyText(overrides.agentIds) || normalizePrivatePropertyText(readiness.agentMapping?.agentIds),
  }
}

function extractPrivatePropertyReference(summary = {}) {
  const text = normalizePrivatePropertyText(summary.resultText)
  const explicit = text.match(/(?:reference|ref|listing\s*id)[:\s-]+([A-Z]{1,10}-[A-Z0-9-]+|T\d+|[A-Z0-9]{4,})/i)
  return explicit ? explicit[1] : ''
}

function createBaseReport({ listingId = '', environment = 'sandbox', apply = false, recordSync = false, readiness = null, preview = null } = {}) {
  const payloadSummary = preview?.summary || readiness?.preview?.summary || null
  return {
    version: PRIVATE_PROPERTY_CONTROLLED_PUBLISH_SERVICE_VERSION,
    phase: 'private-property-go-live-phase4-controlled-publish-rehearsal',
    generatedAt: new Date().toISOString(),
    environment: normalizeEnvironment(environment),
    listingId: normalizePrivatePropertyText(listingId),
    apply: Boolean(apply),
    recordSync: Boolean(recordSync),
    status: 'BLOCKED',
    safety: {
      readinessChecked: Boolean(readiness),
      privatePropertyApiCalled: false,
      databaseWritten: false,
      rawCredentialsStored: false,
      listingPublished: false,
    },
    readiness: readiness
      ? {
        status: readiness.status,
        ready: readiness.ready,
        blockers: readiness.blockers,
        warnings: readiness.warnings,
        checks: readiness.checks,
      }
      : null,
    submitCandidate: payloadSummary
      ? {
        propertyId: normalizePrivatePropertyText(payloadSummary.propertyId),
        branchGuid: normalizePrivatePropertyText(payloadSummary.branchId),
        agentIds: Array.isArray(payloadSummary.agentIds) ? payloadSummary.agentIds.map(normalizePrivatePropertyText).filter(Boolean) : [],
        listingType: normalizePrivatePropertyText(payloadSummary.listingType),
        category: normalizePrivatePropertyText(payloadSummary.category),
        mandateType: normalizePrivatePropertyText(payloadSummary.mandateType),
        propertyStatus: normalizePrivatePropertyText(payloadSummary.propertyStatus),
        suburbId: payloadSummary.suburbId ?? null,
        payloadDigest: preview?.payloadPreview ? createPrivatePropertyPayloadDigest(preview.payloadPreview) : '',
        listingXmlDigest: preview?.listingXml ? createPrivatePropertyPayloadDigest(preview.listingXml) : '',
      }
      : null,
    blockers: [],
    warnings: [],
    apiResponse: null,
    syncResult: null,
    nextStep: 'Resolve blockers before submitting to Private Property.',
  }
}

async function buildSubmitPreview({ client, listingId = '', readiness = {}, overrides = {} } = {}) {
  const bundle = await fetchArch9ListingForPrivatePropertyPreview({ client, listingId })
  return createPrivatePropertyArch9ListingPreview({
    ...bundle,
    agentMapping: readiness.agentMapping || {},
    options: createPreviewOptions({ readiness, overrides }),
  })
}

export async function runPrivatePropertyControlledPublishRehearsal({
  client,
  listingId = '',
  environment = 'sandbox',
  secrets = process.env,
  overrides = {},
  apply = false,
  confirmation = '',
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
  const preview = readiness.ready
    ? await buildSubmitPreview({
      client,
      listingId: normalizedListingId,
      readiness,
      overrides,
    })
    : null
  const report = createBaseReport({
    listingId: normalizedListingId,
    environment: normalizedEnvironment,
    apply,
    recordSync,
    readiness,
    preview,
  })
  report.blockers = unique([
    ...(readiness.blockers || []),
    ...(preview?.canPreview === false ? [...(preview.dataBlockers || []), ...(preview.technicalBlockers || [])] : []),
  ])
  report.warnings = unique(readiness.warnings || [])

  if (!readiness.ready || !preview?.canPreview) {
    report.status = 'BLOCKED'
    report.nextStep = 'Resolve readiness blockers, then re-run the controlled publish rehearsal.'
    return report
  }

  const credentials = resolvePrivatePropertyRuntimeCredentials(readiness.agencyConfig, secrets)
  report.credentialCheck = credentials.redacted
  if (credentials.missingSecrets.length) {
    report.status = 'BLOCKED'
    report.blockers = unique([
      ...report.blockers,
      ...credentials.missingSecrets.map((secretName) => `missing_runtime_secret:${secretName}`),
    ])
    report.nextStep = 'Add the missing runtime secret values, then re-run the controlled publish rehearsal.'
    return report
  }

  if (!apply) {
    report.status = 'DRY_RUN_READY'
    report.nextStep = 'Re-run with --apply to submit this exact Private Property listing after confirming the evidence.'
    return report
  }

  const expectedConfirmation = buildPrivatePropertyPublishConfirmation({
    listingId: normalizedListingId,
    environment: normalizedEnvironment,
  })
  if (normalizedEnvironment === 'production' && confirmation !== expectedConfirmation) {
    report.status = 'BLOCKED'
    report.blockers = unique([...report.blockers, 'missing_production_publish_confirmation'])
    report.expectedConfirmation = expectedConfirmation
    report.nextStep = `Re-run with --confirm=${expectedConfirmation} if this exact production publish is approved.`
    return report
  }

  const portal = privateProperty || createPrivateProperty({
    baseUrl: readiness.agencyConfig.baseUrl,
    username: credentials.username,
    password: credentials.password,
  })

  report.safety.privatePropertyApiCalled = true
  try {
    const response = await portal.updateListing(preview.listingXml)
    const responseSummary = response.summary || summarizePrivatePropertySoapResponse('UpdateListing', response.data || '')
    const privatePropertyRef = extractPrivatePropertyReference(responseSummary)
    report.status = 'SUBMITTED'
    report.safety.listingPublished = true
    report.apiResponse = {
      status: response.status,
      durationMs: response.durationMs,
      summary: responseSummary,
      privatePropertyReference: privatePropertyRef || null,
    }
    report.nextStep = recordSync
      ? 'Poll the Private Property event feed and reconcile activation/images.'
      : 'Record sync state or run the event feed poll once Private Property processes the listing.'

    if (recordSync) {
      const syncResult = await recordPrivatePropertyListingSync({
        client,
        listingId: normalizedListingId,
        propertyId: preview.summary.propertyId,
        branchGuid: preview.summary.branchId,
        environment: normalizedEnvironment,
        listingType: preview.summary.listingType,
        privatePropertyRef,
        externalStatus: 'submitted',
        isOnPortal: false,
        suburbId: preview.summary.suburbId,
        agentIds: preview.summary.agentIds,
        responseSummary,
        payloadSummary: preview.summary,
        submittedAt: report.generatedAt,
      })
      report.safety.databaseWritten = true
      report.syncResult = {
        arch9Status: syncResult.arch9Status,
        syncId: normalizePrivatePropertyText(syncResult.sync?.id),
        listingId: normalizePrivatePropertyText(syncResult.listing?.id),
        externalLinkWarning: syncResult.externalLinkWarning || null,
      }
    }
  } catch (error) {
    report.status = 'BLOCKED'
    report.safety.listingPublished = false
    report.blockers = unique([...report.blockers, 'private_property_update_listing_failed'])
    report.apiResponse = {
      error: {
        name: error.name || 'Error',
        message: error.message,
        status: error.status || null,
        statusText: error.statusText || '',
        faultCode: error.faultCode || '',
        faultString: error.faultString || '',
        responseSummary: error.responseBody ? summarizePrivatePropertySoapResponse('UpdateListing', error.responseBody) : null,
      },
    }
    report.nextStep = 'Fix the Private Property submit error, then re-run the controlled publish rehearsal.'
  }

  return report
}
