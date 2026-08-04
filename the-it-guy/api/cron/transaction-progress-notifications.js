const DEFAULT_UPSTREAM_TIMEOUT_MS = 25000
const MIN_UPSTREAM_TIMEOUT_MS = 1000
const MAX_UPSTREAM_TIMEOUT_MS = 55000

function json(response, status, body) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

function resolveUpstreamTimeoutMs() {
  const configured = Number(process.env.TRANSACTION_PROGRESS_CRON_UPSTREAM_TIMEOUT_MS)
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_UPSTREAM_TIMEOUT_MS
  return Math.min(Math.max(Math.round(configured), MIN_UPSTREAM_TIMEOUT_MS), MAX_UPSTREAM_TIMEOUT_MS)
}

async function fetchUpstreamJson(label, url, options, timeoutMs) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const upstreamResponse = await fetch(url, { ...options, signal: controller.signal })
    const body = await upstreamResponse
      .json()
      .catch(() => ({ error: `${label} returned HTTP ${upstreamResponse.status}.` }))
    return {
      ok: upstreamResponse.ok,
      status: upstreamResponse.status,
      timedOut: false,
      durationMs: Date.now() - startedAt,
      body,
    }
  } catch (error) {
    const timedOut = controller.signal.aborted
    return {
      ok: false,
      status: timedOut ? 504 : 0,
      timedOut,
      durationMs: Date.now() - startedAt,
      body: {
        error: timedOut
          ? `${label} timed out after ${timeoutMs}ms.`
          : error?.message || `${label} request failed.`,
      },
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

export default async function handler(request, response) {
  const startedAt = Date.now()
  const requestId = String(request.headers['x-vercel-id'] || request.headers['x-request-id'] || '').trim() || null
  const logContext = { route: '/api/cron/transaction-progress-notifications', requestId, phase: 'phase6' }
  console.log(JSON.stringify({ level: 'info', message: 'Transaction progress assurance run started.', ...logContext }))
  if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed.' })
  const cronSecret = String(process.env.CRON_SECRET || '').trim()
  const authorization = String(request.headers.authorization || '').trim()
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return json(response, 401, { error: 'Unauthorized.' })
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return json(response, 500, { error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.' })
  }

  const headers = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    'Content-Type': 'application/json',
  }
  const upstreamTimeoutMs = resolveUpstreamTimeoutMs()

  try {
    const [dispatcherResult, reconciliationResult] = await Promise.all([
      fetchUpstreamJson('Notification dispatcher', `${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'transaction_progress_dispatch',
          limit: 100,
          source: 'vercel_cron_phase7',
        }),
      }, upstreamTimeoutMs),
      fetchUpstreamJson('Propagation reconciler', `${supabaseUrl}/rest/v1/rpc/bridge_run_transaction_progress_assurance_phase7`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          p_environment: 'production',
          p_limit: 100,
          p_source: 'vercel_cron_phase7',
        }),
      }, upstreamTimeoutMs),
    ])
    const dispatcher = dispatcherResult.body
    const propagation = reconciliationResult.body
    const ok = dispatcherResult.ok && reconciliationResult.ok
    const timedOut = dispatcherResult.timedOut || reconciliationResult.timedOut
    const assuranceAlert = Boolean(propagation?.alertRequired)
    const result = {
      ok,
      upstreamTimeoutMs,
      dispatcherStatus: dispatcherResult.status,
      reconciliationStatus: reconciliationResult.status,
      dispatcherTimedOut: dispatcherResult.timedOut,
      reconciliationTimedOut: reconciliationResult.timedOut,
      dispatcher,
      propagation,
    }
    const log = {
      level: ok && !assuranceAlert ? 'info' : 'error',
      message: timedOut
        ? 'Transaction progress assurance run timed out upstream.'
        : !ok
        ? 'Transaction progress assurance run completed with failures.'
        : assuranceAlert
          ? 'Transaction progress assurance run completed with a rollout safety alert.'
          : 'Transaction progress assurance run completed.',
      ...logContext,
      durationMs: Date.now() - startedAt,
      upstreamTimeoutMs,
      dispatcherStatus: dispatcherResult.status,
      reconciliationStatus: reconciliationResult.status,
      dispatcherTimedOut: dispatcherResult.timedOut,
      reconciliationTimedOut: reconciliationResult.timedOut,
      dispatcherDurationMs: dispatcherResult.durationMs,
      reconciliationDurationMs: reconciliationResult.durationMs,
      rolloutMode: propagation?.rolloutMode || null,
      rolloutDecision: propagation?.decision || null,
      alertRequired: assuranceAlert,
      propagationStatus: propagation?.postHealth?.status || propagation?.preHealth?.status || null,
      gapCount: Number(propagation?.postHealth?.gapCount ?? propagation?.preHealth?.gapCount ?? 0),
      repairedCount: Number(propagation?.repairedCount || 0),
    }
    ;(ok && !assuranceAlert ? console.log : console.error)(JSON.stringify(log))
    return json(response, ok ? 200 : timedOut ? 504 : 502, result)
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Transaction progress assurance run failed.',
      ...logContext,
      durationMs: Date.now() - startedAt,
      error: error?.message || 'unknown_error',
    }))
    return json(response, 502, { ok: false, error: 'Transaction progress assurance failed.' })
  }
}
