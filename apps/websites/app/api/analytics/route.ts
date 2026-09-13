import { NextResponse } from 'next/server'
import { normalizeHostname } from '@/lib/site-repository'
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
  if (Number(request.headers.get('content-length') || 0) > 1024) return new NextResponse(null, { status: 204 })

  let body: { eventType?: unknown, path?: unknown, listingId?: unknown }
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > 1024) return new NextResponse(null, { status: 204 })
    body = JSON.parse(raw) as typeof body
  } catch { return new NextResponse(null, { status: 204 }) }

  const eventType = text(body.eventType, 32)
  const path = text(body.path, 2048)
  const listingId = text(body.listingId, 64) || null
  if (!supportedEvents.has(eventType) || !/^\/[^\s]*$/.test(path)) return new NextResponse(null, { status: 204 })

  try {
    await getServerSupabase().rpc('website_record_analytics_event', {
      p_hostname: host,
      p_event_type: eventType,
      p_page_path: path,
      p_listing_id: listingId,
    })
  } catch {
    // Analytics must never interfere with a public page or form journey.
  }
  return new NextResponse(null, { status: 204 })
}
