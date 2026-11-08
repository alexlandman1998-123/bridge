import { NextResponse } from 'next/server'
import { normalizeHostname } from '@/lib/site-repository'
import { isAutomatedWebsiteTraffic, normaliseMeasurement } from '@/lib/measurement'
import { getServerSupabase } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const supportedEvents = new Set(['site_visit', 'page_view', 'listing_view'])

function text(value: unknown, maximum = 2048) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function sameOrigin(request: Request, host: string) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try { return normalizeHostname(new URL(origin).host) === host } catch { return false }
}

export async function POST(request: Request) {
  const host = normalizeHostname(request.headers.get('host'))
  if (!host || !sameOrigin(request, host)) return new NextResponse(null, { status: 204 })
  if (request.headers.get('dnt') === '1' || isAutomatedWebsiteTraffic(request.headers.get('user-agent') || '', [request.headers.get('purpose'), request.headers.get('sec-purpose')].filter(Boolean).join(' '))) return new NextResponse(null, { status: 204 })
  try { if (new URL(request.headers.get('referer') || '').searchParams.has('arch9_preview')) return new NextResponse(null, { status: 204 }) } catch { /* No referrer. */ }
  if (Number(request.headers.get('content-length') || 0) > 8192) return new NextResponse(null, { status: 204 })

  let body: { eventType?: unknown, path?: unknown, listingId?: unknown, eventId?: unknown, measurement?: unknown }
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > 8192) return new NextResponse(null, { status: 204 })
    body = JSON.parse(raw) as typeof body
  } catch { return new NextResponse(null, { status: 204 }) }

  const eventType = text(body.eventType, 32)
  const path = text(body.path, 2048)
  const listingId = text(body.listingId, 64) || null
  if (!supportedEvents.has(eventType) || !/^\/[^\s]*$/.test(path)) return new NextResponse(null, { status: 204 })

  const measurement = normaliseMeasurement(body.measurement)
  const eventId = text(body.eventId, 64)
  try {
    const measured = measurement?.sessionId && /^[0-9a-f-]{36}$/i.test(eventId)
    const result = await getServerSupabase().rpc(measured ? 'website_record_measurement_event' : 'website_record_analytics_event', {
      p_hostname: host, p_event_type: eventType, p_page_path: path, p_listing_id: listingId,
      ...(measured ? { p_event_id: eventId, p_session_id: measurement?.sessionId, p_context: measurement } : {}),
    })
    if (result.error) throw result.error
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code).slice(0, 40) : 'ingestion_unavailable'
    console.warn(JSON.stringify({ service: 'public-websites', event: 'analytics.write_failed', host, code }))
    // This background failure does not interrupt browsing and permits one safe retry.
    return new NextResponse(null, { status: 503 })
  }
  return new NextResponse(null, { status: 204 })
}
