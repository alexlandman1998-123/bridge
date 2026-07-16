import { createClient } from '@supabase/supabase-js'

const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const safeEqual = (left: string, right: string) => { if (!left || left.length !== right.length) return false; let mismatch = 0; for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index); return mismatch === 0 }
const bounded = (value: unknown) => Math.max(1, Math.min(100, Number(value || 25)))
const MAX_CONCURRENCY = 5

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { ok: false, code: 'method_not_allowed' })
  const url = Deno.env.get('SUPABASE_URL') || ''; const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''; const dispatchSecret = Deno.env.get('CONVEYANCER_PROVIDER_DISPATCH_SECRET') || ''; const workerSecret = Deno.env.get('CONVEYANCER_PROVIDER_WORKER_SECRET') || ''
  if (!url || !service || !workerSecret || !safeEqual(dispatchSecret, request.headers.get('x-p7-dispatch-secret') || '')) return reply(401, { ok: false, code: 'dispatcher_not_authorized' })
  let body: Record<string, unknown> = {}; try { body = await request.json() } catch { /* optional dispatcher controls */ }
  const client = createClient(url, service, { auth: { persistSession: false } })
  const claim = await client.rpc('bridge_claim_conveyancer_provider_commands', { p_limit: bounded(body.limit), p_now: new Date().toISOString() })
  if (claim.error) return reply(500, { ok: false, code: 'provider_command_claim_failed', error: claim.error.message })
  const commands = Array.isArray(claim.data?.commands) ? claim.data.commands : []
  const dispatchOne = async (command: Record<string, unknown>) => {
    let result: Record<string, unknown>
    try {
      const response = await fetch(`${url}/functions/v1/conveyancer-provider-runtime`, { method: 'POST', headers: { Authorization: `Bearer ${service}`, apikey: service, 'Content-Type': 'application/json', 'x-p7-worker-secret': workerSecret }, body: JSON.stringify(Object.fromEntries(Object.entries(command).filter(([name]) => !['id', 'leaseToken', 'attempt'].includes(name)))), signal: AbortSignal.timeout(70_000) })
      result = await response.json().catch(() => ({ ok: false, code: `provider_runtime_http_${response.status}` }))
      if (!(result.ok === true && result.decision === 'committed')) result = { ...result, ok: false, retrySafe: result.retrySafe !== false }
    } catch (error) { result = { ok: false, decision: 'manual_fallback', code: error instanceof DOMException && error.name === 'TimeoutError' ? 'provider_runtime_timeout' : 'provider_runtime_unreachable', retrySafe: true } }
    const complete = await client.rpc('bridge_complete_conveyancer_provider_command', { p_command_id: command.id, p_lease_token: command.leaseToken, payload: result })
    return { commandId: command.id, attempt: command.attempt, status: complete.data?.status || 'completion_failed', error: complete.error?.message || null }
  }
  const outcomes: Array<{ commandId: unknown; attempt: unknown; status: string; error: string | null }> = []
  for (let index = 0; index < commands.length; index += MAX_CONCURRENCY) outcomes.push(...await Promise.all(commands.slice(index, index + MAX_CONCURRENCY).map(dispatchOne)))
  await client.rpc('bridge_record_conveyancer_operational_signal', { payload: { signalType: 'provider_dispatch_run', severity: outcomes.some((item) => item.error || ['dead_letter', 'reconciliation_required'].includes(item.status)) ? 'warning' : 'info', numericValue: commands.length, detail: { claimed: commands.length, succeeded: outcomes.filter((item) => item.status === 'succeeded').length, retryScheduled: outcomes.filter((item) => item.status === 'retry_scheduled').length, deadLettered: outcomes.filter((item) => item.status === 'dead_letter').length, reconciliationRequired: outcomes.filter((item) => item.status === 'reconciliation_required').length } } })
  return reply(200, { ok: outcomes.every((item) => !item.error), claimed: commands.length, succeeded: outcomes.filter((item) => item.status === 'succeeded').length, retryScheduled: outcomes.filter((item) => item.status === 'retry_scheduled').length, deadLettered: outcomes.filter((item) => item.status === 'dead_letter').length, reconciliationRequired: outcomes.filter((item) => item.status === 'reconciliation_required').length, outcomes, dispatchedAt: new Date().toISOString() })
})
