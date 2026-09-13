import { NextResponse } from 'next/server'
import { normalizeHostname, resolveSite } from '@/lib/site-repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Deliberately minimal so an external uptime service can verify that this
// hostname resolves to a currently published website without receiving tenant
// identity, visitor, listing, or submission data.
export async function GET(request: Request) {
  const host = normalizeHostname(request.headers.get('host'))
  if (!host) return NextResponse.json({ status: 'unavailable' }, { status: 503 })
  try {
    const site = await resolveSite(host)
    if (!site || site.status !== 'published') return NextResponse.json({ status: 'unavailable' }, { status: 503 })
    return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503 })
  }
}
