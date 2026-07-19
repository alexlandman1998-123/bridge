function json(response, status, body) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
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

  try {
    const [dispatcherResponse, reconciliationResponse] = await Promise.all([
      fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'transaction_progress_dispatch',
          limit: 100,
          source: 'vercel_cron_phase7',
        }),
      }),
      fetch(`${supabaseUrl}/rest/v1/rpc/bridge_run_transaction_progress_assurance_phase7`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          p_environment: 'production',
          p_limit: 100,
          p_source: 'vercel_cron_phase7',
        }),
      }),
    ])
    const [dispatcher, propagation] = await Promise.all([
      dispatcherResponse.json().catch(() => ({ error: `Notification dispatcher returned HTTP ${dispatcherResponse.status}.` })),
      reconciliationResponse.json().catch(() => ({ error: `Propagation reconciler returned HTTP ${reconciliationResponse.status}.` })),
    ])
    const ok = dispatcherResponse.ok && reconciliationResponse.ok
    const assuranceAlert = Boolean(propagation?.alertRequired)
    const result = {
      ok,
      dispatcherStatus: dispatcherResponse.status,
      reconciliationStatus: reconciliationResponse.status,
      dispatcher,
      propagation,
    }
    const log = {
      level: ok && !assuranceAlert ? 'info' : 'error',
      message: !ok
        ? 'Transaction progress assurance run completed with failures.'
        : assuranceAlert
          ? 'Transaction progress assurance run completed with a rollout safety alert.'
          : 'Transaction progress assurance run completed.',
      ...logContext,
      durationMs: Date.now() - startedAt,
      dispatcherStatus: dispatcherResponse.status,
      reconciliationStatus: reconciliationResponse.status,
      rolloutMode: propagation?.rolloutMode || null,
      rolloutDecision: propagation?.decision || null,
      alertRequired: assuranceAlert,
      propagationStatus: propagation?.postHealth?.status || propagation?.preHealth?.status || null,
      gapCount: Number(propagation?.postHealth?.gapCount ?? propagation?.preHealth?.gapCount ?? 0),
      repairedCount: Number(propagation?.repairedCount || 0),
    }
    ;(ok && !assuranceAlert ? console.log : console.error)(JSON.stringify(log))
    return json(response, ok ? 200 : 502, result)
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
