import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { trackTelemetryEvent } from './telemetry'

const DEFAULT_LIMITS = Object.freeze({
  login_attempt: { limit: 8, windowMs: 10 * 60 * 1000 },
  signup_attempt: { limit: 5, windowMs: 10 * 60 * 1000 },
  invite_acceptance: { limit: 10, windowMs: 10 * 60 * 1000 },
  invite_creation: { limit: 30, windowMs: 60 * 60 * 1000 },
  export_generation: { limit: 10, windowMs: 60 * 60 * 1000 },
})

const memoryBuckets = new Map()

function normalizeText(value) {
  return String(value || '').trim()
}

function hashKey(value = '') {
  let hash = 0
  const text = normalizeText(value)
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index)
    hash |= 0
  }
  return String(Math.abs(hash))
}

export async function observeRateLimit(action, key, context = {}) {
  const config = DEFAULT_LIMITS[action] || { limit: 20, windowMs: 10 * 60 * 1000 }
  const now = Date.now()
  const bucketKey = `${action}:${hashKey(key || context.userId || 'anonymous')}`
  const bucket = (memoryBuckets.get(bucketKey) || []).filter((timestamp) => now - timestamp < config.windowMs)
  bucket.push(now)
  memoryBuckets.set(bucketKey, bucket)
  const blocked = bucket.length > config.limit
  const status = blocked ? 'blocked' : bucket.length > Math.ceil(config.limit * 0.75) ? 'warning' : 'allowed'

  if (isSupabaseConfigured && supabase && context.userId) {
    void supabase.from('rate_limit_events').insert({
      user_id: context.userId,
      workspace_id: context.workspaceId || null,
      action,
      key_hash: bucketKey,
      status,
      metadata: { count: bucket.length, limit: config.limit, windowMs: config.windowMs },
    })
  }

  if (blocked) {
    void trackTelemetryEvent({
      category: 'security',
      eventName: 'rate_limit_blocked',
      severity: 'warning',
      userId: context.userId,
      workspaceId: context.workspaceId,
      metadata: { action, count: bucket.length, limit: config.limit },
    })
  }

  return { ok: !blocked, status, count: bucket.length, limit: config.limit, windowMs: config.windowMs }
}
