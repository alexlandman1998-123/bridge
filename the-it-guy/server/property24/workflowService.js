import { createHash } from 'node:crypto'
import {
  createRedactedProperty24Payload,
  resolveProperty24Environment,
} from './publishService.js'
import { normalizeProperty24Text, summarizeProperty24Payload } from './client.js'
import { recordProperty24ListingSync } from './syncService.js'

function stableJsonStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableJsonStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function createProperty24Hash(value) {
  return createHash('sha256').update(stableJsonStringify(value ?? null)).digest('hex')
}

export function createProperty24PayloadHashes(payload = {}) {
  const imagePayload = Array.isArray(payload?.photos) ? payload.photos : payload?.photos === null ? null : []
  return {
    payloadHash: createProperty24Hash({
      ...(payload || {}),
      photos: Array.isArray(payload?.photos)
        ? payload.photos.map((photo) => ({
            mimeContentType: photo.mimeContentType,
            caption: photo.caption || null,
            isFloorPlan: Boolean(photo.isFloorPlan),
            byteLengthApprox: photo.bytes ? Math.round((String(photo.bytes).length * 3) / 4) : 0,
          }))
        : payload?.photos ?? null,
    }),
    imagePayloadHash: createProperty24Hash(imagePayload),
  }
}

export function resolveProperty24PublishAction({ preview = {}, config = {} } = {}) {
  const listingNumber = normalizeProperty24Text(
    config.listingNumber ||
      preview.payload?.listingNumber ||
      preview.previewPayload?.listingNumber ||
      preview.summary?.listingNumber,
  )
  return listingNumber ? 'update' : 'create'
}

export function createProperty24IdempotencyKey({
  listingId,
  environment = 'exdev',
  action = 'update',
  payloadHash = '',
  status = '',
} = {}) {
  return [
    'property24',
    normalizeProperty24Text(environment) || 'exdev',
    normalizeProperty24Text(action) || 'update',
    normalizeProperty24Text(listingId),
    normalizeProperty24Text(status),
    normalizeProperty24Text(payloadHash),
  ].join(':')
}

async function single(query) {
  return typeof query.single === 'function' ? query.single() : query
}

function isMissingProperty24AttemptsTable(error = {}) {
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (message.includes('property24_sync_attempts') && (
      message.includes('schema cache') ||
      message.includes('does not exist') ||
      message.includes('could not find')
    ))
}

export async function createProperty24SyncAttempt({
  client,
  listingId,
  environment = 'exdev',
  agencyId,
  listingNumber,
  action,
  idempotencyKey,
  payloadHash,
  imagePayloadHash,
  requestPayloadSummary = {},
  actorUserId = null,
} = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const payload = {
    private_listing_id: normalizeProperty24Text(listingId) || null,
    environment: normalizeProperty24Text(environment) || 'exdev',
    agency_id: agencyId ? Number(agencyId) : null,
    listing_number: listingNumber ? Number(listingNumber) : null,
    action,
    status: 'running',
    idempotency_key: idempotencyKey,
    payload_hash: normalizeProperty24Text(payloadHash),
    image_payload_hash: normalizeProperty24Text(imagePayloadHash),
    request_payload_summary: requestPayloadSummary && typeof requestPayloadSummary === 'object' ? requestPayloadSummary : {},
    response_summary: {},
    error_summary: {},
    actor_user_id: normalizeProperty24Text(actorUserId) || null,
    started_at: new Date().toISOString(),
    finished_at: null,
  }

  const { data, error } = await single(
    client
      .from('property24_sync_attempts')
      .upsert(payload, { onConflict: 'idempotency_key' })
      .select('*')
      .single(),
  )
  if (error && isMissingProperty24AttemptsTable(error)) {
    return {
      ...payload,
      id: null,
      status: 'skipped',
      warning: {
        code: 'property24_sync_attempts_missing',
        message: 'property24_sync_attempts table is not available; external write continued without attempt persistence.',
      },
    }
  }
  if (error) throw error
  return data
}

export async function completeProperty24SyncAttempt({
  client,
  attemptId,
  status,
  responseSummary = {},
  errorSummary = {},
  httpStatus = null,
  durationMs = null,
  listingNumber = null,
} = {}) {
  if (!client) throw new Error('Supabase client is required.')
  if (!attemptId) return null
  const patch = {
    status,
    response_summary: responseSummary && typeof responseSummary === 'object' ? responseSummary : {},
    error_summary: errorSummary && typeof errorSummary === 'object' ? errorSummary : {},
    property24_http_status: httpStatus,
    duration_ms: durationMs,
    listing_number: listingNumber ? Number(listingNumber) : null,
    finished_at: new Date().toISOString(),
  }
  const { data, error } = await single(
    client
      .from('property24_sync_attempts')
      .update(patch)
      .eq('id', attemptId)
      .select('*')
      .single(),
  )
  if (error) throw error
  return data
}

function extractListingNumber(value) {
  if (!value || typeof value !== 'object') return normalizeProperty24Text(value)
  return normalizeProperty24Text(value.listingNumber || value.ListingNumber || value.id || value.Id)
}

function extractReasons(value) {
  if (!value || typeof value !== 'object') return []
  return Array.isArray(value.reasons) ? value.reasons : Array.isArray(value.Reasons) ? value.Reasons : []
}

function summarizeWorkflowError(error = {}) {
  return {
    name: error.name || 'Error',
    message: error.message || 'Property24 workflow failed.',
    httpStatus: error.status || null,
    response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
  }
}

export function buildProperty24LifecycleState({ listing = null, sync = null, listingNumber = null, portalCheck = null, environment = 'exdev' } = {}) {
  const normalizedListingStatus = normalizeProperty24Text(listing?.property24_status || listing?.property24Status).toLowerCase()
  const normalizedSyncStatus = normalizeProperty24Text(sync?.external_status || sync?.externalStatus).toLowerCase()
  const reference = normalizeProperty24Text(listingNumber || sync?.listing_number || listing?.property24_reference || listing?.property24Reference)
  const isOnPortal = Boolean(portalCheck?.isOnPortal ?? sync?.is_on_portal)
  const removed = ['removed', 'withdrawn', 'cancelled', 'cancelledsale', 'expired'].includes(normalizedSyncStatus) ||
    ['removed', 'withdrawn'].includes(normalizedListingStatus)
  const paused = ['paused', 'pending'].includes(normalizedSyncStatus) || ['paused', 'pending'].includes(normalizedListingStatus)
  const failed = ['failed'].includes(normalizedSyncStatus) || ['failed', 'error'].includes(normalizedListingStatus)
  const published = !removed && (isOnPortal || ['published', 'live', 'active'].includes(normalizedListingStatus) || normalizedSyncStatus === 'on_portal')
  const state = !reference
    ? 'draft'
    : failed
      ? 'failed'
      : removed
        ? 'withdrawn'
        : paused
          ? 'paused'
          : published
            ? 'published'
            : 'submitted'

  return {
    state,
    label: {
      draft: 'Not Published',
      submitted: 'Submitted',
      published: 'Live on Property24',
      paused: 'Paused',
      withdrawn: 'Withdrawn',
      failed: 'Needs Attention',
    }[state] || 'Unknown',
    listingNumber: reference || null,
    environment: normalizeProperty24Text(environment || sync?.environment) || 'exdev',
    property24ListingUrl: normalizeProperty24Text(listing?.property24_listing_url || listing?.property24ListingUrl) || null,
    externalStatus: normalizedSyncStatus || null,
    property24Status: normalizedListingStatus || null,
    isOnPortal,
    lastSyncedAt: sync?.last_successful_sync_at || sync?.lastSuccessfulSyncAt || sync?.updated_at || listing?.updated_at || null,
    lastCheckedAt: sync?.last_checked_at || sync?.lastCheckedAt || null,
    lastError: sync?.last_error || sync?.lastError || null,
    actions: {
      canPreview: true,
      canPublish: state !== 'withdrawn',
      canUpdate: Boolean(reference) && state !== 'withdrawn',
      canRefreshStatus: Boolean(reference),
      canWithdraw: Boolean(reference) && state !== 'withdrawn',
      canImportLeads: Boolean(reference) && state !== 'withdrawn',
      primaryPublishLabel: reference ? 'Update Property24' : 'Publish to Property24',
      withdrawLabel: 'Withdraw from Property24',
    },
  }
}

export async function applyControlledProperty24ListingPublish({
  supabase,
  property24,
  config = {},
  preview,
  report,
  applyPublish,
  allowPublishWithoutMandate = true,
  publishWithoutMandateReason = 'Property24 API publish accepted before mandate evidence upload.',
} = {}) {
  if (!supabase) throw new Error('Supabase client is required.')
  if (!property24) throw new Error('Property24 client is required.')
  const action = resolveProperty24PublishAction({ preview, config })
  const hashes = createProperty24PayloadHashes(preview?.payload)
  const environment = config.environment || resolveProperty24Environment(config.property24BaseUrl)
  const idempotencyKey = config.idempotencyKey || createProperty24IdempotencyKey({
    listingId: config.listingId,
    environment,
    action,
    payloadHash: hashes.payloadHash,
  })

  const attempt = await createProperty24SyncAttempt({
    client: supabase,
    listingId: config.listingId,
    environment,
    agencyId: config.agencyId,
    listingNumber: config.listingNumber || preview?.payload?.listingNumber || preview?.summary?.listingNumber,
    action,
    idempotencyKey,
    payloadHash: hashes.payloadHash,
    imagePayloadHash: hashes.imagePayloadHash,
    requestPayloadSummary: {
      action,
      redactedPayload: createRedactedProperty24Payload(preview?.payload),
      preview: report?.preview || null,
    },
    actorUserId: config.actorUserId,
  })

  if (!preview?.canSubmit) {
    const blockedAttempt = await completeProperty24SyncAttempt({
      client: supabase,
      attemptId: attempt.id,
      status: 'blocked',
      errorSummary: {
        dataBlockers: preview?.dataBlockers || [],
        technicalBlockers: preview?.technicalBlockers || [],
      },
      listingNumber: config.listingNumber || preview?.summary?.listingNumber,
    })
    return {
      ...(report || {}),
      status: 'BLOCKED',
      syncAttempt: blockedAttempt || attempt,
    }
  }

  const nextReport = await applyPublish({
    supabase,
    property24,
    config: {
      ...config,
      environment,
      payloadHash: hashes.payloadHash,
      imagePayloadHash: hashes.imagePayloadHash,
    },
    preview,
    report,
    allowPublishWithoutMandate,
    publishWithoutMandateReason,
  })
  const listingNumber = extractListingNumber(nextReport.property24Response?.data) ||
    nextReport.databaseWrite?.listingNumber ||
    config.listingNumber ||
    preview?.summary?.listingNumber
  const completedAttempt = await completeProperty24SyncAttempt({
    client: supabase,
    attemptId: attempt.id,
    status: nextReport.status === 'FAILED' ? 'failed' : 'succeeded',
    responseSummary: {
      property24Response: nextReport.property24Response?.summary || null,
      portalCheck: nextReport.portalCheck?.summary || nextReport.portalCheck || null,
      databaseWrite: nextReport.databaseWrite || null,
    },
    errorSummary: nextReport.error || {},
    httpStatus: nextReport.property24Response?.httpStatus || nextReport.error?.httpStatus || null,
    durationMs: nextReport.property24Response?.durationMs || null,
    listingNumber,
  })

  return {
    ...nextReport,
    syncAttempt: completedAttempt || attempt,
  }
}

function resolveSyncStatusFromProperty24Status(listingStatus = '', isOnPortal = false) {
  const status = normalizeProperty24Text(listingStatus).toLowerCase()
  if (['withdrawn', 'cancelled', 'cancelledsale', 'expired'].includes(status)) return 'removed'
  if (['failed'].includes(status)) return 'failed'
  return isOnPortal ? 'on_portal' : 'not_on_portal'
}

export async function applyControlledProperty24StatusUpdate({
  supabase,
  property24,
  config = {},
  listingNumber,
  listingStatus,
} = {}) {
  if (!supabase) throw new Error('Supabase client is required.')
  if (!property24) throw new Error('Property24 client is required.')
  const normalizedListingNumber = normalizeProperty24Text(listingNumber || config.listingNumber)
  const normalizedStatus = normalizeProperty24Text(listingStatus || config.status || config.listingStatus)
  if (!normalizedListingNumber) throw new Error('listingNumber is required.')
  if (!normalizedStatus) throw new Error('listingStatus is required.')

  const environment = config.environment || resolveProperty24Environment(config.property24BaseUrl)
  const payloadSummary = {
    listingNumber: normalizedListingNumber,
    listingStatus: normalizedStatus,
  }
  const payloadHash = createProperty24Hash(payloadSummary)
  const attempt = await createProperty24SyncAttempt({
    client: supabase,
    listingId: config.listingId,
    environment,
    agencyId: config.agencyId,
    listingNumber: normalizedListingNumber,
    action: 'status_update',
    idempotencyKey: config.idempotencyKey || createProperty24IdempotencyKey({
      listingId: config.listingId,
      environment,
      action: 'status_update',
      payloadHash,
      status: normalizedStatus,
    }),
    payloadHash,
    imagePayloadHash: createProperty24Hash(null),
    requestPayloadSummary: payloadSummary,
    actorUserId: config.actorUserId,
  })

  try {
    const startedAt = Date.now()
    const result = await property24.updateListingStatus(normalizedListingNumber, normalizedStatus)
    let isOnPortal = false
    let portalCheck = null
    try {
      const portalResult = await property24.checkListingOnPortal(normalizedListingNumber)
      isOnPortal = Boolean(portalResult.data)
      portalCheck = {
        httpStatus: portalResult.status,
        durationMs: portalResult.durationMs,
        summary: summarizeProperty24Payload(portalResult.data),
        data: portalResult.data,
      }
    } catch (error) {
      portalCheck = {
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
      listingNumber: normalizedListingNumber,
      environment,
      isOnPortal,
      externalStatus: resolveSyncStatusFromProperty24Status(normalizedStatus, isOnPortal),
      reasons: extractReasons(result.data),
      responseSummary: summarizeProperty24Payload(result.data),
      payloadSummary,
      payloadHash,
      imagePayloadHash: createProperty24Hash(null),
      property24ListingUrl: config.property24ListingUrl,
      allowPublishWithoutMandate: true,
      publishWithoutMandateReason: 'Property24 status update accepted before mandate evidence upload.',
    })

    const completedAttempt = await completeProperty24SyncAttempt({
      client: supabase,
      attemptId: attempt.id,
      status: 'succeeded',
      responseSummary: {
        property24Response: summarizeProperty24Payload(result.data),
        portalCheck: portalCheck?.summary || portalCheck || null,
        databaseWrite: {
          listingNumber: syncRecord.sync.listing_number,
          property24Status: syncRecord.listing.property24_status,
          property24Reference: syncRecord.listing.property24_reference,
          ...(syncRecord.syncWarning ? { syncWarning: syncRecord.syncWarning } : {}),
        },
      },
      httpStatus: result.status,
      durationMs: result.durationMs ?? Date.now() - startedAt,
      listingNumber: normalizedListingNumber,
    })

    return {
      phase: 'property24-status-update',
      generatedAt: new Date().toISOString(),
      status: 'SUBMITTED',
      lifecycle: buildProperty24LifecycleState({
        listing: syncRecord.listing,
        sync: syncRecord.sync,
        listingNumber: normalizedListingNumber,
        portalCheck,
        environment,
      }),
      listingId: normalizeProperty24Text(config.listingId),
      listingNumber: normalizedListingNumber,
      listingStatus: normalizedStatus,
      property24Response: {
        httpStatus: result.status,
        durationMs: result.durationMs,
        summary: summarizeProperty24Payload(result.data),
        data: result.data,
      },
      portalCheck,
      databaseWrite: {
        table: 'property24_listing_syncs',
        listingNumber: syncRecord.sync.listing_number,
        property24Status: syncRecord.listing.property24_status,
        property24Reference: syncRecord.listing.property24_reference,
        ...(syncRecord.syncWarning ? { syncWarning: syncRecord.syncWarning } : {}),
        ...(syncRecord.externalLinkWarning ? { externalLinkWarning: syncRecord.externalLinkWarning } : {}),
      },
      syncAttempt: completedAttempt || attempt,
    }
  } catch (error) {
    const completedAttempt = await completeProperty24SyncAttempt({
      client: supabase,
      attemptId: attempt.id,
      status: 'failed',
      errorSummary: summarizeWorkflowError(error),
      httpStatus: error.status || null,
      listingNumber: normalizedListingNumber,
    })
    return {
      phase: 'property24-status-update',
      generatedAt: new Date().toISOString(),
      status: 'FAILED',
      listingId: normalizeProperty24Text(config.listingId),
      listingNumber: normalizedListingNumber,
      listingStatus: normalizedStatus,
      error: summarizeWorkflowError(error),
      syncAttempt: completedAttempt || attempt,
    }
  }
}
