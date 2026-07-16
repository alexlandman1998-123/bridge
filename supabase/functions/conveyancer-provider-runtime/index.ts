import { createClient } from '@supabase/supabase-js'

const VERSION = 'conveyancer_provider_runtime_p6_v1'
const H6_VERSION = 'conveyancer_provider_application_h6_v1'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const privateHost = (host: string) => /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(host)
const bytesToHex = (value: ArrayBuffer) => [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
const safeEqual = (left: string, right: string) => { if (!left || left.length !== right.length) return false; let mismatch = 0; for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index); return mismatch === 0 }
const credentialEvidenceFingerprint = async (value: Record<string, unknown>) => `sha256:${bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))}`

type CredentialCheckClient = { rpc: (name: string, args: { payload: Record<string, unknown> }) => Promise<{ error: unknown }> }

async function recordCredentialCheck(client: unknown, input: Record<string, unknown>) {
  const evidence = { version: H6_VERSION, ...input, checkedAt: new Date().toISOString(), metadata: { secretMaterialStored: false } }
  const fingerprint = await credentialEvidenceFingerprint(evidence)
  const result = await (client as CredentialCheckClient).rpc('bridge_record_conveyancer_provider_credential_check_h6', { payload: { ...evidence, fingerprint } })
  return !result.error
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return reply(405, { ok: false, code: 'method_not_allowed' })
  const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const workerSecret = Deno.env.get('CONVEYANCER_PROVIDER_WORKER_SECRET') || ''
  const authorization = request.headers.get('Authorization') || ''
  if (!url || !anon || !service || !authorization.startsWith('Bearer ')) return reply(401, { ok: false, code: 'runtime_not_authorized' })
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const serviceClient = createClient(url, service, { auth: { persistSession: false } })
  const internalWorker = safeEqual(workerSecret, request.headers.get('x-p7-worker-secret') || '')
  const userResult = internalWorker ? null : await userClient.auth.getUser()
  if (!internalWorker && (userResult?.error || !userResult?.data.user)) return reply(401, { ok: false, code: 'runtime_not_authorized' })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return reply(400, { ok: false, code: 'invalid_json' }) }
  if (body.version !== VERSION || !body.profileId || !body.organisationId || !body.attorneyFirmId || !body.transactionId || !body.operationId || !body.capability || !body.operationType || !body.lane || !body.payloadReference || !body.payloadHash || !body.idempotencyKey || !body.authorityReference) return reply(400, { ok: false, code: 'provider_operation_invalid' })
  if ('payload' in body || 'body' in body || JSON.stringify(body).match(/"(credential|secret|access.?token|api.?key)"\s*:/i)) return reply(400, { ok: false, code: 'provider_operation_must_be_reference_only' })

  const queryClient = internalWorker ? serviceClient : userClient
  const profileResult = await queryClient.from('conveyancer_integration_profiles').select('*').eq('id', body.profileId).eq('organisation_id', body.organisationId).eq('attorney_firm_id', body.attorneyFirmId).eq('source_phase', 'P6').maybeSingle()
  const controlResult = await queryClient.from('conveyancer_provider_runtime_controls').select('*').eq('organisation_id', body.organisationId).eq('attorney_firm_id', body.attorneyFirmId).order('revision', { ascending: false }).limit(1).maybeSingle()
  if (profileResult.error || controlResult.error || !profileResult.data || !controlResult.data) return reply(403, { ok: false, code: 'provider_scope_not_authorized' })
  const profile = profileResult.data; const control = controlResult.data; const config = profile.payload || {}
  const operationalGate = await serviceClient.rpc('bridge_conveyancer_provider_operation_allowed', { p_organisation_id: body.organisationId, p_attorney_firm_id: body.attorneyFirmId, p_profile_id: body.profileId, p_direction: 'outbound' })
  if ((operationalGate.error && !['PGRST202', '42883'].includes(operationalGate.error.code || '')) || operationalGate.data === false) return reply(202, { ok: false, decision: 'manual_fallback', code: 'provider_operational_kill_switch_active', retrySafe: false, humanReviewRequired: true })
  const denied = control.kill_switch_enabled || !['pilot', 'live'].includes(control.mode) || !['manual', 'sandbox', 'active'].includes(profile.profile_status) || !control.allowed_adapters.includes(profile.adapter_key) || !control.allowed_capabilities.includes(body.capability) || !(config.capabilities || []).includes(body.capability) || ((config.allowedLanes || []).length && !(config.allowedLanes || []).includes(body.lane)) || (control.mode === 'pilot' && !control.pilot_transaction_ids.includes(body.transactionId))
  if (denied || profile.adapter_key === 'manual') return reply(202, { ok: true, decision: 'manual_fallback', code: profile.adapter_key === 'manual' ? 'manual_provider_action_required' : 'provider_execution_disabled' })
  if (profile.adapter_key !== 'generic_http') return reply(422, { ok: false, code: 'provider_adapter_unavailable' })
  const circuit = await queryClient.from('conveyancer_provider_health_events').select('circuit_state,occurred_at').eq('integration_profile_id', profile.id).order('occurred_at', { ascending: false }).limit(1).maybeSingle()
  if (circuit.data?.circuit_state === 'open' && Date.now() - new Date(circuit.data.occurred_at).getTime() < control.cooldown_seconds * 1000) return reply(202, { ok: true, decision: 'manual_fallback', code: 'provider_circuit_open' })

  let origin: URL
  try { origin = new URL(config.allowedOrigin) } catch { return reply(422, { ok: false, code: 'provider_endpoint_invalid' }) }
  const operationPath = config.operationPaths?.[body.operationType as string]
  if (origin.protocol !== 'https:' || origin.origin !== config.allowedOrigin || privateHost(origin.hostname) || typeof operationPath !== 'string' || !operationPath.startsWith('/') || operationPath.startsWith('//') || !['bearer', 'api_key_header'].includes(config.authentication?.type || 'bearer') || !/^[A-Za-z0-9-]{1,64}$/.test(config.authentication?.headerName || 'Authorization')) return reply(422, { ok: false, code: 'provider_endpoint_invalid' })
  const credentialReference = String(profile.secret_reference || '')
  const credentialEvidence = { organisationId: body.organisationId, attorneyFirmId: body.attorneyFirmId, profileId: profile.id, operationId: body.operationId, providerKey: profile.provider_key, environment: config.environment || 'sandbox', referenceKind: credentialReference.startsWith('env://') ? 'env' : credentialReference.startsWith('vault://') ? 'vault' : 'none' }
  if (!credentialReference.startsWith('env://')) {
    await recordCredentialCheck(serviceClient, { ...credentialEvidence, status: credentialReference.startsWith('vault://') ? 'resolver_unavailable' : 'invalid' })
    return reply(202, { ok: true, decision: 'manual_fallback', code: 'provider_secret_resolver_unavailable', retrySafe: false, humanReviewRequired: true })
  }
  const credential = Deno.env.get(credentialReference.slice(6))
  if (!credential) {
    await recordCredentialCheck(serviceClient, { ...credentialEvidence, status: 'missing' })
    return reply(202, { ok: true, decision: 'manual_fallback', code: 'provider_credential_unavailable', retrySafe: false, humanReviewRequired: true })
  }
  const credentialRecorded = await recordCredentialCheck(serviceClient, { ...credentialEvidence, status: 'verified', expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() })
  if (!credentialRecorded) return reply(202, { ok: false, decision: 'reconciliation_required', code: 'provider_credential_evidence_unrecorded', retrySafe: false, humanReviewRequired: true })
  const payloadRef = String(body.payloadReference); const separator = payloadRef.indexOf('/')
  if (separator < 1) return reply(422, { ok: false, code: 'provider_payload_reference_invalid' })
  const payloadDownload = await queryClient.storage.from(payloadRef.slice(0, separator)).download(payloadRef.slice(separator + 1))
  if (payloadDownload.error || !payloadDownload.data) return reply(403, { ok: false, code: 'provider_payload_not_accessible' })
  const payloadBytes = await payloadDownload.data.arrayBuffer(); const hash = `sha256:${bytesToHex(await crypto.subtle.digest('SHA-256', payloadBytes))}`
  if (hash.toLowerCase() !== String(body.payloadHash).toLowerCase()) return reply(409, { ok: false, code: 'provider_payload_hash_mismatch' })
  let payload: unknown
  try { payload = JSON.parse(new TextDecoder().decode(payloadBytes)) } catch { return reply(422, { ok: false, code: 'provider_payload_not_json' }) }

  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Idempotency-Key': String(body.idempotencyKey) }
  if (config.authentication?.type === 'api_key_header') headers[String(config.authentication.headerName || 'X-Api-Key')] = credential
  else headers.Authorization = `Bearer ${credential}`
  const started = Date.now(); let outcome = 'failed'; let errorCode = ''; let providerReference = ''; let responseHash = ''
  try {
    const target = new URL(operationPath, origin); if (target.origin !== origin.origin) throw new Error('provider_endpoint_scope_invalid')
    const response = await fetch(target, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(control.timeout_ms) })
    outcome = response.ok ? 'succeeded' : 'failed'; errorCode = response.ok ? '' : `provider_http_${response.status}`
    providerReference = response.headers.get('x-provider-reference') || ''; responseHash = response.headers.get('x-content-sha256') || ''
  } catch (error) { errorCode = error instanceof DOMException && error.name === 'TimeoutError' ? 'provider_timeout' : (error instanceof Error ? error.message : 'provider_request_failed'); outcome = errorCode === 'provider_timeout' ? 'timed_out' : 'failed' }
  const latestHealth = await serviceClient.from('conveyancer_provider_health_events').select('consecutive_failures').eq('integration_profile_id', profile.id).order('occurred_at', { ascending: false }).limit(1).maybeSingle()
  const failures = outcome === 'succeeded' ? 0 : Number(latestHealth.data?.consecutive_failures || 0) + 1
  const circuitState = failures >= control.failure_threshold ? 'open' : 'closed'
  const requestedBy = internalWorker ? String(body.requestedBy || '') : String(userResult?.data.user?.id || '')
  const healthWrite = await serviceClient.rpc('bridge_record_conveyancer_provider_health', { payload: { version: VERSION, organisationId: body.organisationId, attorneyFirmId: body.attorneyFirmId, transactionId: body.transactionId, profileId: profile.id, operationId: body.operationId, providerKey: profile.provider_key, adapterKey: profile.adapter_key, outcome: circuitState === 'open' ? 'circuit_opened' : outcome, circuitState, consecutiveFailures: failures, errorCode, providerReference, responseHash, durationMs: Date.now() - started, metadata: { humanReviewRequired: true, requestedBy } } })
  if (healthWrite.error) return reply(202, { ok: false, decision: 'reconciliation_required', code: 'provider_result_unrecorded', providerReference, responseHash, humanReviewRequired: true, retrySafe: false })
  return reply(outcome === 'succeeded' ? 200 : 502, { ok: outcome === 'succeeded', decision: outcome === 'succeeded' ? 'committed' : 'manual_fallback', code: outcome === 'succeeded' ? 'provider_operation_completed' : errorCode, providerReference, responseHash, humanReviewRequired: true })
})
