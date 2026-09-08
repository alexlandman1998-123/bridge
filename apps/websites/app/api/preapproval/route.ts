import { createHmac } from 'node:crypto'
import { NextResponse } from 'next/server'
import { parseApplication, stageErrors, steps } from '@/lib/preapproval'
import { normalizeHostname, resolveSite } from '@/lib/site-repository'
import { getServerSupabase } from '@/lib/supabase-server'
export const runtime = 'nodejs'
const respond = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } })
export async function POST(request: Request) {
  const host = normalizeHostname(request.headers.get('host'))
  const origin = request.headers.get('origin')
  try { if (!origin || normalizeHostname(new URL(origin).host) !== host) return respond({ error: 'Please submit from the agency website.' }, 403) } catch { return respond({ error: 'Invalid request origin.' }, 403) }
  if (!request.headers.get('content-type')?.startsWith('application/json')) return respond({ error: 'Expected a JSON application.' }, 415)
  if (Number(request.headers.get('content-length')) > 32768) return respond({ error: 'Application is too large.' }, 413)
  let body: Record<string, unknown>
  try {
    const text = await request.text()
    if (Buffer.byteLength(text) > 32768) return respond({ error: 'Application is too large.' }, 413)
    body = JSON.parse(text)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
  } catch { return respond({ error: 'Invalid application.' }, 400) }
  if (body.companyWebsite) return respond({ error: 'Unable to submit this application.' }, 400)
  const application = parseApplication(body.application)
  if (!application || typeof body.idempotencyKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotencyKey)) return respond({ error: 'Please complete a valid application.' }, 400)
  for (let step = 0; step < steps.length; step++) {
    const errors = stageErrors(application, step)
    if (errors.length) return respond({ error: `Please review ${steps[step].toLowerCase()}.`, step, errors }, 400)
  }
  // Explicit activation after the migration and allocated-originator inbox are verified.
  if (process.env.WEBSITES_PREAPPROVAL_ENABLED !== 'true') return respond({ error: 'Online application submission is not enabled yet. Your details are still on this page. Please contact the agency to arrange submission to its allocated bond originator.' }, 503)
  try {
    const site = await resolveSite(host)
    if (!site) return respond({ error: 'This website is unavailable.' }, 404)
    const secret = process.env.WEBSITES_LEAD_FINGERPRINT_SECRET
    const address = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip')
    if (!secret || secret.length < 32 || !address) return respond({ error: 'Submission is temporarily unavailable. Please try again later.' }, 503)
    const fingerprint = createHmac('sha256', secret).update(`${host}:${address}`).digest('hex')
    const result = await getServerSupabase().rpc('website_capture_preapproval', { p_site_id: site.id, p_payload: application, p_idempotency_key: body.idempotencyKey, p_fingerprint: fingerprint })
    if (result.error) return respond({ error: 'We could not record your application. Your details are still here; please try again later.' }, 503)
    if (result.data?.allocationRequired) return respond({ error: 'The agency needs to confirm its allocated bond originator before this application can be sent. Please contact the agency. Your details are still on this page.' }, 409)
    if (result.data?.rateLimited) return respond({ error: 'Please wait before submitting another application.' }, 429)
    if (result.data?.conflict) return respond({ error: 'This submission reference was already used. Please review your details and try again.' }, 409)
    if (!result.data?.accepted) return respond({ error: 'Your application was not recorded. Please try again.' }, 503)
    return respond({ accepted: true, reference: result.data.reference, duplicate: result.data.duplicate === true }, result.data.duplicate ? 200 : 201)
  } catch { return respond({ error: 'Submission is temporarily unavailable. Your details are still here.' }, 503) }
}
