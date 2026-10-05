import { beginRentalPublicationAttempt, updateRentalPublicationAttempt, retainUncertainRentalPublication, isDefinitePortalRejection, publicRentalPublicationAttempt } from './rentalPublicationAttemptService.js'
import { createHash } from 'node:crypto'
import {
  createPrivatePropertyClient,
  normalizePrivatePropertyText,
  summarizePrivatePropertySoapResponse,
  validatePrivatePropertySoapResult,
} from './privatePropertyClient.js'
import {
  resolvePrivatePropertyCredentials,
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
import { inspectPrivatePropertyListingRecovery } from './privatePropertyListingRecoveryService.js'

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
    ...(readiness.locationResolution?.suburbId ? { suburbId: readiness.locationResolution.suburbId } : {}),
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
      listingSubmitted: false,
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
    locationResolution: readiness?.locationResolution || null,
    recovery: readiness?.recovery || null,
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
  const bundle = await fetchArch9ListingForPrivatePropertyPreview({ client, listingId, environment: readiness.environment })
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

  let readiness = await buildPrivatePropertyGoLiveReadinessReport({
    client,
    listingId: normalizedListingId,
    environment: normalizedEnvironment,
    secrets,
    overrides,
  })
  let preview = readiness.ready
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

  const needsRetainedAddressCheck = normalizedEnvironment === 'production' && report.blockers.length > 0 && report.blockers.every((blocker) => blocker.startsWith('private_property_activated_address_'))
  if ((!readiness.ready || !preview?.canPreview) && !needsRetainedAddressCheck) {
    report.status = 'BLOCKED'
    report.nextStep = 'Resolve readiness blockers, then re-run the controlled publish rehearsal.'
    return report
  }

  const credentials = await resolvePrivatePropertyCredentials({ client, config: readiness.agencyConfig, secrets })
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

  const expectedConfirmation = buildPrivatePropertyPublishConfirmation({
    listingId: normalizedListingId,
    environment: normalizedEnvironment,
  })
  if (apply && normalizedEnvironment === 'production' && confirmation !== expectedConfirmation) {
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

  if (normalizedEnvironment === 'production') {
    readiness = await buildPrivatePropertyGoLiveReadinessReport({
      client, listingId: normalizedListingId, environment: normalizedEnvironment, secrets, overrides,
      verifyLocation: true, privateProperty: portal,
    })
    preview = readiness.ready ? await buildSubmitPreview({ client, listingId: normalizedListingId, readiness, overrides }) : null
    Object.assign(report, createBaseReport({ listingId: normalizedListingId, environment: normalizedEnvironment, apply, recordSync, readiness, preview }))
    report.safety.privatePropertyApiCalled = readiness.safety.privatePropertyApiCalled
    report.blockers = [...readiness.blockers]
    report.warnings = [...readiness.warnings]
    if (!readiness.ready || !preview?.canPreview) {
      report.blockers = unique([...report.blockers, ...(preview?.dataBlockers || []), ...(preview?.technicalBlockers || [])])
      report.nextStep = readiness.nextStep
      return report
    }
    if (preview.summary.addressFingerprint !== readiness.locationResolution.addressFingerprint) {
      report.blockers = ['private_property_address_changed_during_location_check']
      report.nextStep = 'The address changed during the location check. Review the current address before sending it.'
      return report
    }
  }

  if (!apply) {
    report.status = 'DRY_RUN_READY'
    report.nextStep = 'Re-run with --apply to submit this exact Private Property listing after confirming the evidence.'
    return report
  }

  // This also protects direct callers that bypass the browser preview. Check
  // the retained record immediately before mutation, with this exact candidate.
  const currentBundle = await fetchArch9ListingForPrivatePropertyPreview({ client, listingId: normalizedListingId, environment: normalizedEnvironment })
  if (normalizedEnvironment === 'production' && currentBundle.existingSync?.property_id && currentBundle.existingSync.property_id !== preview.summary.propertyId) {
    report.blockers = ['private_property_existing_identity_changed']
    report.nextStep = 'The existing Private Property record changed. Refresh the review before sending changes.'
    return report
  }
  const recovery = readiness.recovery || await inspectPrivatePropertyListingRecovery({ portal, existingSync: currentBundle.existingSync, address: preview.payloadPreview.address })
  report.recovery = recovery
  if (recovery.checked) report.safety.privatePropertyApiCalled = true
  if (recovery.blockers.length) {
    report.blockers = unique([...report.blockers, ...recovery.blockers])
    report.nextStep = recovery.message
    return report
  }

  const attempt = currentBundle.listing?.listing_category === 'rental' ? await beginRentalPublicationAttempt({ client,listingId:normalizedListingId,
    channel:'private_property',environment:normalizedEnvironment,identity:{ propertyId:preview.summary.propertyId,branchGuid:preview.summary.branchId,
      listingType:preview.summary.listingType,existed:Boolean(currentBundle.existingSync?.property_id) },payload:preview.listingXml }) : null
  if (currentBundle.listing?.listing_category === 'rental' && !attempt) throw new Error('The rental listing changed during publishing. Reload and recheck it before sending.')
  let receipt = {}
  report.safety.privatePropertyApiCalled = true
  try {
    const response = await portal.updateListing(preview.listingXml)
    const responseSummary = validatePrivatePropertySoapResult(response, 'UpdateListing')
    const privatePropertyRef = extractPrivatePropertyReference(responseSummary)
    receipt = { accepted:true,reference:privatePropertyRef }
    if (attempt) await updateRentalPublicationAttempt(client,attempt,{ state:'uncertain',receipt })
    report.status = 'SUBMITTED'
    report.safety.listingSubmitted = true
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
        payloadSummary: {
          ...preview.summary,
          submission: {
            submittedAt: report.generatedAt,
            payloadDigest: report.submitCandidate.payloadDigest,
            listingXmlDigest: report.submitCandidate.listingXmlDigest,
            responseSummary,
          },
        },
        submittedAt: report.generatedAt,
      })
      report.safety.databaseWritten = true
      if (attempt && (syncResult.externalLinkWarning || !syncResult.sync?.id)) throw new Error('Private Property accepted the rental but saving its local channel details failed.')
      report.syncResult = {
        arch9Status: syncResult.arch9Status,
        syncId: normalizePrivatePropertyText(syncResult.sync?.id),
        listingId: normalizePrivatePropertyText(syncResult.listing?.id),
        externalLinkWarning: syncResult.externalLinkWarning || null,
      }
    }
    if (attempt && recordSync) {
      await updateRentalPublicationAttempt(client,attempt,{ state:'accepted',receipt })
      report.submissionAttempt = publicRentalPublicationAttempt({ ...attempt,state:'accepted',receipt })
    } else if (attempt) {
      report.status = 'UNCERTAIN'
      report.submissionAttempt = publicRentalPublicationAttempt({ ...attempt,state:'uncertain',receipt })
    }
  } catch (error) {
    if (attempt) {
      if (!receipt.accepted && isDefinitePortalRejection(error)) await updateRentalPublicationAttempt(client,attempt,{ state:'rejected',last_error:error.message })
      else await retainUncertainRentalPublication(client,attempt,error,receipt)
    }
    report.status = attempt && (receipt.accepted || !isDefinitePortalRejection(error)) ? 'UNCERTAIN' : 'BLOCKED'
    report.submissionAttempt = publicRentalPublicationAttempt({ ...attempt,state:report.status === 'UNCERTAIN' ? 'uncertain' : 'rejected',receipt })
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
    report.nextStep = report.status === 'UNCERTAIN' ? 'Reconcile the saved submission before sending again; Private Property may already have accepted it.' : 'Fix the Private Property submit error, then re-run the controlled publish rehearsal.'
  }

  return report
}
