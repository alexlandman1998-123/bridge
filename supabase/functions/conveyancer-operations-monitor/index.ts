import { createClient } from '@supabase/supabase-js'

const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const safeEqual = (left: string, right: string) => {
  if (!left || left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return mismatch === 0
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { ok: false, code: 'method_not_allowed' })
  const url = Deno.env.get('SUPABASE_URL') || ''
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const monitorSecret = Deno.env.get('CONVEYANCER_OPERATIONS_MONITOR_SECRET') || ''
  if (!url || !service || !safeEqual(monitorSecret, request.headers.get('x-p8-monitor-secret') || '')) return reply(401, { ok: false, code: 'monitor_not_authorized' })

  const client = createClient(url, service, { auth: { persistSession: false } })
  const capturedAt = new Date().toISOString()
  const capture = await client.rpc('bridge_capture_conveyancer_operational_snapshots', { p_now: capturedAt })
  if (capture.error) return reply(500, { ok: false, code: 'snapshot_capture_failed', error: capture.error.message })
  const applicationHealth = await client.rpc('bridge_capture_conveyancer_application_health_h8', { p_now: capturedAt })
  if (applicationHealth.error) return reply(500, { ok: false, code: 'application_health_capture_failed', error: applicationHealth.error.message })

  const failingFirms = Math.max(Number(capture.data?.failingFirms || 0), Number(applicationHealth.data?.failingFirms || 0))
  const warningFirms = Math.max(Number(capture.data?.warningFirms || 0), Number(applicationHealth.data?.warningFirms || 0))
  await client.rpc('bridge_record_conveyancer_operational_signal', {
    payload: {
      signalType: 'operational_monitor_run',
      severity: failingFirms > 0 ? 'critical' : warningFirms > 0 ? 'warning' : 'info',
      numericValue: Number(applicationHealth.data?.firms || capture.data?.firms || 0),
      detail: {
        providerFailingFirms: Number(capture.data?.failingFirms || 0),
        providerWarningFirms: Number(capture.data?.warningFirms || 0),
        applicationFailingFirms: Number(applicationHealth.data?.failingFirms || 0),
        applicationWarningFirms: Number(applicationHealth.data?.warningFirms || 0),
      },
    },
  })
  return reply(200, { ok: true, providerHealth: capture.data, applicationHealth: applicationHealth.data, monitoredAt: capturedAt })
})
