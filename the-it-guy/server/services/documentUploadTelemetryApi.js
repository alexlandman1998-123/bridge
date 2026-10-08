import process from 'node:process'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { DOCUMENT_MONITOR_SURFACES, DOCUMENT_MONITOR_STAGES, DOCUMENT_MONITOR_OUTCOMES, DOCUMENT_MONITOR_ERROR_CATEGORIES } from '../../src/lib/documentUploadObservability.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const telemetryResponse = (status, body) => ({ status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body })
export function validateDocumentTelemetry(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 6 ||
      Object.keys(body).some(key => !['eventId', 'attemptId', 'surface', 'stage', 'outcome', 'errorCategory'].includes(key)) ||
      !uuid.test(body.eventId || '') || !uuid.test(body.attemptId || '') ||
      !DOCUMENT_MONITOR_SURFACES.includes(body.surface) || !DOCUMENT_MONITOR_STAGES.includes(body.stage) ||
      !DOCUMENT_MONITOR_OUTCOMES.includes(body.outcome) || !DOCUMENT_MONITOR_ERROR_CATEGORIES.includes(body.errorCategory)) throw new Error('Invalid telemetry')
  return body
}
export async function readDocumentTelemetryBody(request) {
  if (request.body !== undefined) {
    const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
    if (Buffer.byteLength(raw || '') > 2048) throw new Error('Invalid telemetry')
    return JSON.parse(raw)
  }
  const chunks = []; let size = 0
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk)
    if (size > 2048) throw new Error('Invalid telemetry')
    chunks.push(Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
export function documentMonitorClient(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Monitoring unavailable')
  const target = new URL(url)
  const project = target.hostname.split('.')[0]
  if (target.protocol !== 'https:' || target.hostname !== `${project}.supabase.co` || target.port || target.username || target.password || target.pathname !== '/' || !/^[a-z]{20}$/.test(project) || env.DOCUMENT_PERSISTENCE_MONITOR_PROJECT_REF !== project) throw new Error('Monitoring target unavailable')
  return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(35000) }) },
  })
}
export async function createDocumentTelemetryResponse({ method, headers = {}, body, env = process.env, client } = {}) {
  if (method !== 'POST') return telemetryResponse(405, { accepted: false })
  // Same-origin, bounded, anonymous signals allow token portals to report errors
  // without sending their access token or trusting user-supplied ownership IDs.
  if (env.DOCUMENT_PERSISTENCE_MONITOR_ENABLED !== 'true') return telemetryResponse(503, { accepted: false })
  try {
    const origin = new URL(headers.origin || '')
    const allowed = new URL(env.ARCH9_APP_URL || '')
    if (origin.origin !== allowed.origin || origin.protocol !== 'https:' || origin.username || origin.password) return telemetryResponse(403, { accepted: false })
  } catch { return telemetryResponse(403, { accepted: false }) }
  try { validateDocumentTelemetry(body) } catch { return telemetryResponse(400, { accepted: false }) }
  try {
    const secret = env.SUPABASE_SERVICE_ROLE_KEY
    if (!secret) return telemetryResponse(503, { accepted: false })
    const ip = String(headers['x-vercel-forwarded-for'] || 'unavailable').split(',')[0].trim().slice(0,128)
    const rateKey = createHmac('sha256', secret).update(ip).digest('hex')
    const result = await (client || documentMonitorClient(env)).rpc('record_document_upload_outcome', {
      p_event_id: body.eventId, p_attempt_id: body.attemptId, p_surface: body.surface,
      p_stage: body.stage, p_outcome: body.outcome, p_error_category: body.errorCategory, p_rate_key: rateKey,
    })
    if (result.error || !['recorded', 'duplicate', 'rate_limited'].includes(result.data)) return telemetryResponse(503, { accepted: false })
    return telemetryResponse(result.data === 'rate_limited' ? 429 : 202, { accepted: result.data !== 'rate_limited' })
  } catch { return telemetryResponse(503, { accepted: false }) }
}
