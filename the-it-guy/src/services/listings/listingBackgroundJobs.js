import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

export const LISTING_JOB_TYPES = Object.freeze({
  MEDIA_RECONCILE: 'media_reconcile',
  MEDIA_VARIANT_REFRESH: 'media_variant_refresh',
  PROPERTY24_PUBLISH: 'property24_publish',
  PRIVATE_PROPERTY_PUBLISH: 'private_property_publish',
  DOCUMENT_GENERATE: 'document_generate',
  WEBHOOK_DELIVER: 'webhook_deliver',
})

function normalizeText(value) {
  return String(value || '').trim()
}

export function buildListingJobIdempotencyKey({ listingId, jobType, revision = 'current' } = {}) {
  return [normalizeText(listingId), normalizeText(jobType), normalizeText(revision) || 'current'].join(':')
}

export async function enqueueListingBackgroundJob({
  listingId,
  jobType,
  payload = {},
  idempotencyKey,
  maxAttempts = 5,
} = {}) {
  if (!isSupabaseConfigured || !supabase) return { skipped: true, reason: 'supabase_not_configured' }
  if (!normalizeText(listingId) || !normalizeText(jobType)) throw new Error('Listing id and job type are required.')

  const { data, error } = await supabase.rpc('bridge_enqueue_listing_job_v1', {
    p_listing_id: listingId,
    p_job_type: jobType,
    p_payload: payload,
    p_idempotency_key: normalizeText(idempotencyKey) || null,
    p_max_attempts: Math.min(20, Math.max(1, Number(maxAttempts) || 5)),
  })
  if (error) throw error
  return data
}

export async function enqueueListingMediaReconciliation(listingId, { revision, source = 'listing_media_sync' } = {}) {
  return enqueueListingBackgroundJob({
    listingId,
    jobType: LISTING_JOB_TYPES.MEDIA_RECONCILE,
    payload: { source, revision: normalizeText(revision) || 'current' },
    idempotencyKey: buildListingJobIdempotencyKey({
      listingId,
      jobType: LISTING_JOB_TYPES.MEDIA_RECONCILE,
      revision,
    }),
  })
}

export async function enqueueListingMediaVariantRefresh(listingId, { revision, source = 'listing_media_sync' } = {}) {
  return enqueueListingBackgroundJob({
    listingId,
    jobType: LISTING_JOB_TYPES.MEDIA_VARIANT_REFRESH,
    payload: { source, revision: normalizeText(revision) || 'current' },
    idempotencyKey: buildListingJobIdempotencyKey({
      listingId,
      jobType: LISTING_JOB_TYPES.MEDIA_VARIANT_REFRESH,
      revision,
    }),
  })
}

export async function enqueueListingMediaProcessing(listingId, options = {}) {
  const reconciliation = await enqueueListingMediaReconciliation(listingId, options)
  const variants = await enqueueListingMediaVariantRefresh(listingId, options)
  return { reconciliation, variants }
}

export function buildListingSyndicationConfirmation({ listingId, provider, environment = 'sandbox' } = {}) {
  return `${normalizeText(provider).toUpperCase()}_PUBLISH:${normalizeText(listingId)}:${normalizeText(environment).toLowerCase()}`
}

export async function enqueueListingSyndication({
  listingId,
  provider,
  environment = 'sandbox',
  confirmation,
  payload = {},
  revision = 'current',
} = {}) {
  if (!isSupabaseConfigured || !supabase) return { skipped: true, reason: 'supabase_not_configured' }
  const { data, error } = await supabase.rpc('bridge_enqueue_listing_syndication_job_v1', {
    p_listing_id: listingId,
    p_provider: provider,
    p_environment: environment,
    p_confirmation: confirmation,
    p_payload: payload,
    p_revision: revision,
  })
  if (error) throw error
  return data
}

export async function getListingSyndicationHealth(listingId) {
  if (!isSupabaseConfigured || !supabase) return { skipped: true, reason: 'supabase_not_configured' }
  if (!normalizeText(listingId)) throw new Error('Listing id is required.')
  const { data, error } = await supabase.rpc('bridge_listing_syndication_health_v1', {
    p_listing_id: listingId,
  })
  if (error) throw error
  return data || {}
}

export async function listListingBackgroundJobs(listingId, { limit = 25 } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('listing_background_jobs')
    .select('id,listing_id,job_type,status,attempt_count,max_attempts,available_at,last_error,last_error_code,created_at,updated_at,completed_at')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(Math.min(100, Math.max(1, Number(limit) || 25)))
  if (error) throw error
  return data || []
}

export function evaluateListingJobHealth(snapshot = {}) {
  const expiredLeases = Number(snapshot.expiredLeases || 0)
  const manualReview = Number(snapshot.manualReview || 0)
  const oldestReadyAgeSeconds = Number(snapshot.oldestReadyAgeSeconds || 0)
  const active = Number(snapshot.queued || 0) + Number(snapshot.processing || 0) + Number(snapshot.retryScheduled || 0)
  const severity = expiredLeases > 0 || oldestReadyAgeSeconds >= 900
    ? 'critical'
    : manualReview > 0 || oldestReadyAgeSeconds >= 300
      ? 'warning'
      : 'healthy'
  return {
    ...snapshot,
    active,
    severity,
    requiresAttention: severity !== 'healthy' || manualReview > 0,
  }
}

export async function getListingJobHealth(listingId = null) {
  if (!isSupabaseConfigured || !supabase) return evaluateListingJobHealth({ skipped: true, reason: 'supabase_not_configured' })
  const { data, error } = await supabase.rpc('bridge_listing_job_health_v1', {
    p_listing_id: normalizeText(listingId) || null,
  })
  if (error) throw error
  return evaluateListingJobHealth(data || {})
}

export async function listListingBackgroundJobEvents(listingId, { limit = 50 } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('listing_background_job_events')
    .select('id,job_id,listing_id,event_type,attempt_count,worker_id,error_code,metadata,created_at')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(Math.min(200, Math.max(1, Number(limit) || 50)))
  if (error) throw error
  return data || []
}

export async function retryListingBackgroundJob(jobId) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('bridge_retry_listing_job_v1', { p_job_id: jobId })
  if (error) throw error
  return data
}

export async function cancelListingBackgroundJob(jobId) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('bridge_cancel_listing_job_v1', { p_job_id: jobId })
  if (error) throw error
  return data
}
