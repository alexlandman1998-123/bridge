import {
  createProperty24Arch9ListingPreview,
  fetchArch9ListingForProperty24Preview,
  loadProperty24ImageBytesForPreview,
  normalizeProperty24PreviewText,
} from './listingDataService.js'
import {
  PROPERTY24_EXDEV_BASE_URL,
  summarizeProperty24Payload,
} from './client.js'
import { recordProperty24ListingSync } from './syncService.js'

export function resolveProperty24Environment(baseUrl = PROPERTY24_EXDEV_BASE_URL) {
  return String(baseUrl || '').replace(/\/+$/g, '') === PROPERTY24_EXDEV_BASE_URL ? 'exdev' : 'production'
}

export function createRedactedProperty24Payload(payload = {}) {
  if (!payload || typeof payload !== 'object') return null
  return {
    ...payload,
    photos: Array.isArray(payload.photos)
      ? payload.photos.map((photo) => ({
          mimeContentType: photo.mimeContentType,
          caption: photo.caption || null,
          isFloorPlan: Boolean(photo.isFloorPlan),
          bytesLoaded: Boolean(photo.bytes),
          byteLengthApprox: photo.bytes ? Math.round((String(photo.bytes).length * 3) / 4) : 0,
        }))
      : payload.photos,
  }
}

export async function buildProperty24ListingSubmitPlan({
  supabase,
  listingId,
  agencyId,
  agentId,
  agentSourceReference,
  suburbId,
  propertyTypeId,
  expiryDate,
  listingNumber,
  storageBaseUrl = '',
  maxImages = 20,
  photosChanged = true,
  convertImagesToJpeg = true,
} = {}) {
  if (!supabase) throw new Error('Supabase client is required.')
  const bundle = await fetchArch9ListingForProperty24Preview({ client: supabase, listingId })
  const loaded = await loadProperty24ImageBytesForPreview({
    media: bundle.media,
    storageClient: supabase,
    storageBaseUrl,
    maxImages,
    convertImagesToJpeg,
  })

  return createProperty24Arch9ListingPreview({
    ...bundle,
    media: loaded.media,
    agentMapping: {
      property24AgentId: agentId,
      sourceReference: agentSourceReference,
    },
    catalogMapping: {
      suburbId,
      propertyTypeId,
    },
    imageByteLoad: {
      summary: loaded.summary,
      results: loaded.results,
    },
    options: {
      agencyId,
      expiryDate,
      listingNumber,
      photosChanged,
      includeSubmitPayload: true,
    },
  })
}

export function createProperty24PublishReport({ config = {}, preview, apply = false } = {}) {
  return {
    phase: 'property24-publish-listing',
    generatedAt: new Date().toISOString(),
    mode: apply ? 'APPLY' : 'DRY_RUN',
    status: preview?.canSubmit ? (apply ? 'READY_TO_APPLY' : 'DRY_RUN_READY') : 'BLOCKED',
    safety: {
      property24ApiCalled: false,
      databaseWritten: false,
      listingPublished: false,
    },
    listingId: normalizeProperty24PreviewText(config.listingId),
    preview: {
      canSubmit: Boolean(preview?.canSubmit),
      dataBlockers: preview?.dataBlockers || [],
      technicalBlockers: preview?.technicalBlockers || [],
      summary: preview?.summary || {},
      imageByteLoad: preview?.imageByteLoad || null,
    },
    redactedPayload: createRedactedProperty24Payload(preview?.payload),
  }
}

export async function applyProperty24ListingPublish({
  supabase,
  property24,
  config = {},
  preview,
  report,
  allowPublishWithoutMandate = true,
  publishWithoutMandateReason = 'Property24 ExDev publish accepted before mandate evidence upload.',
} = {}) {
  if (!supabase) throw new Error('Supabase client is required.')
  if (!property24) throw new Error('Property24 client is required.')
  if (!preview?.payload) throw new Error('Property24 submit payload is required.')
  const nextReport = report || createProperty24PublishReport({ config, preview, apply: true })

  let result
  try {
    result = await property24.saveListing(preview.payload)
    nextReport.status = 'SUBMITTED'
    nextReport.safety.property24ApiCalled = true
    nextReport.safety.listingPublished = true
    nextReport.property24Response = {
      httpStatus: result.status,
      durationMs: result.durationMs,
      summary: summarizeProperty24Payload(result.data),
      data: result.data,
    }
  } catch (error) {
    nextReport.status = 'FAILED'
    nextReport.safety.property24ApiCalled = true
    nextReport.error = {
      name: error.name || 'Error',
      message: error.message,
      httpStatus: error.status || null,
      response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
    }
    return nextReport
  }

  const listingNumber = result.data?.listingNumber || result.data?.ListingNumber || result.data
  let portalIsOnPortal = Boolean(result.data?.isOnPortal ?? result.data?.IsOnPortal)
  if (listingNumber && typeof listingNumber !== 'object') {
    try {
      const portalResult = await property24.checkListingOnPortal(listingNumber)
      portalIsOnPortal = Boolean(portalResult.data)
      nextReport.portalCheck = {
        httpStatus: portalResult.status,
        durationMs: portalResult.durationMs,
        summary: summarizeProperty24Payload(portalResult.data),
        data: portalResult.data,
      }
    } catch (error) {
      nextReport.portalCheck = {
        status: 'FAILED',
        message: error.message,
        httpStatus: error.status || null,
        response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
      }
    }

    const syncRecord = await recordProperty24ListingSync({
      client: supabase,
      listingId: config.listingId,
      agencyId: config.agencyId,
      listingNumber,
      environment: config.environment || resolveProperty24Environment(config.property24BaseUrl),
      isOnPortal: portalIsOnPortal,
      reasons: Array.isArray(result.data?.reasons) ? result.data.reasons : [],
      responseSummary: nextReport.property24Response.summary,
      payloadSummary: preview.summary,
      payloadHash: config.payloadHash,
      imagePayloadHash: config.imagePayloadHash,
      property24ListingUrl: config.property24ListingUrl,
      allowPublishWithoutMandate,
      publishWithoutMandateReason,
    })
    nextReport.databaseWrite = {
      table: 'property24_listing_syncs',
      privateListingId: syncRecord.sync.private_listing_id,
      listingNumber: syncRecord.sync.listing_number,
      property24Status: syncRecord.listing.property24_status,
      property24Reference: syncRecord.listing.property24_reference,
      ...(syncRecord.syncWarning ? { syncWarning: syncRecord.syncWarning } : {}),
      ...(syncRecord.statusUpdateWarning ? { statusUpdateWarning: syncRecord.statusUpdateWarning } : {}),
      ...(syncRecord.externalLinkWarning ? { externalLinkWarning: syncRecord.externalLinkWarning } : {}),
    }
    nextReport.safety.databaseWritten = true
  }

  return nextReport
}
