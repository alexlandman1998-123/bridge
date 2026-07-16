import { createClient } from '@supabase/supabase-js'

const encoder = new TextEncoder()
const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const text = (value: unknown) => String(value ?? '').trim()
const hex = (value: ArrayBuffer) => [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
const safeEqual = (left: string, right: string) => { if (!left || left.length !== right.length) return false; let mismatch = 0; for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index); return mismatch === 0 }

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { ok: false, code: 'method_not_allowed' })
  const url = Deno.env.get('SUPABASE_URL') || ''; const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''; const endpointKey = text(new URL(request.url).searchParams.get('endpoint'))
  if (!url || !service || !/^[0-9a-f-]{36}$/i.test(endpointKey)) return reply(404, { ok: false, code: 'webhook_endpoint_not_found' })
  const client = createClient(url, service, { auth: { persistSession: false } })
  const endpoints = await client.from('conveyancer_provider_webhook_endpoints').select('*').eq('endpoint_key', endpointKey).order('revision', { ascending: false }).limit(1)
  const endpoint = endpoints.data?.[0]
  if (endpoints.error || !endpoint || endpoint.status !== 'active') return reply(404, { ok: false, code: 'webhook_endpoint_not_found' })
  const controls = await client.from('conveyancer_provider_transport_controls').select('*').eq('organisation_id', endpoint.organisation_id).eq('attorney_firm_id', endpoint.attorney_firm_id).order('revision', { ascending: false }).limit(1)
  const control = controls.data?.[0]
  const signal = async (signalType: string, severity: 'info' | 'warning' | 'critical', detail: Record<string, unknown> = {}) => { await client.rpc('bridge_record_conveyancer_operational_signal', { payload: { organisationId: endpoint.organisation_id, attorneyFirmId: endpoint.attorney_firm_id, profileId: endpoint.integration_profile_id, signalType, severity, numericValue: 1, detail } }) }
  if (controls.error || !control || control.kill_switch_enabled || !control.inbound_enabled || !['pilot', 'live'].includes(control.mode)) return reply(503, { ok: false, code: 'provider_inbound_disabled' })
  const operationalGate = await client.rpc('bridge_conveyancer_provider_operation_allowed', { p_organisation_id: endpoint.organisation_id, p_attorney_firm_id: endpoint.attorney_firm_id, p_profile_id: endpoint.integration_profile_id, p_direction: 'inbound' })
  if ((operationalGate.error && !['PGRST202', '42883'].includes(operationalGate.error.code || '')) || operationalGate.data === false) return reply(503, { ok: false, code: 'provider_operational_kill_switch_active' })
  const declaredSize = Number(request.headers.get('content-length') || 0)
  if (declaredSize > control.max_inbound_bytes) return reply(413, { ok: false, code: 'provider_payload_too_large' })
  const timestamp = text(request.headers.get('x-provider-timestamp')); const timestampMs = Date.parse(timestamp)
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > control.replay_window_seconds * 1000) { await signal('provider_webhook_rejected','warning',{code:'stale'}); return reply(401, { ok: false, code: 'provider_webhook_stale' }) }
  const rawBody = await request.text()
  if (encoder.encode(rawBody).byteLength > control.max_inbound_bytes) return reply(413, { ok: false, code: 'provider_payload_too_large' })
  const secretReference = text(endpoint.secret_reference)
  if (!secretReference.startsWith('env://')) return reply(503, { ok: false, code: 'provider_webhook_secret_unavailable' })
  const secret = Deno.env.get(secretReference.slice(6)) || ''; const supplied = text(request.headers.get('x-provider-signature')).replace(/^sha256=/i, '').toLowerCase()
  if (!secret) return reply(503, { ok: false, code: 'provider_webhook_secret_unavailable' })
  const hmacKey = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = hex(await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(`${timestamp}.${rawBody}`)))
  if (!safeEqual(expected, supplied)) { await signal('provider_webhook_rejected','critical',{code:'signature_invalid'}); return reply(401, { ok: false, code: 'provider_webhook_signature_invalid' }) }
  let body: Record<string, unknown>; try { body = JSON.parse(rawBody) } catch { return reply(400, { ok: false, code: 'provider_webhook_json_invalid' }) }
  const providerEventId = text(body.providerEventId); const transactionId = text(body.transactionId); const eventType = text(body.eventType).toLowerCase(); const capability = text(body.capability).toLowerCase(); const lane = text(body.lane).toLowerCase()
  if (!providerEventId || !transactionId || !eventType || !capability || !lane) return reply(400, { ok: false, code: 'provider_webhook_routing_invalid' })
  const contentHash = `sha256:${hex(await crypto.subtle.digest('SHA-256', encoder.encode(rawBody)))}`; const objectPath = `${endpoint.organisation_id}/${endpoint.attorney_firm_id}/${endpoint.integration_profile_id}/${contentHash.slice(7)}.json`
  const upload = await client.storage.from('conveyancer-provider-inbox').upload(objectPath, new Blob([rawBody], { type: 'application/json' }), { contentType: 'application/json', upsert: true })
  if (upload.error) { await signal('provider_webhook_failed','critical',{code:'storage_failed'}); return reply(503, { ok: false, code: 'provider_webhook_storage_failed' }) }
  const recorded = await client.rpc('bridge_record_conveyancer_provider_inbound', { payload: { endpointKey, transactionId, providerEventId, eventType, capability, lane, signatureVerified: true, providerTimestamp: new Date(timestampMs).toISOString(), objectBucket: 'conveyancer-provider-inbox', objectPath, contentHash, metadata: { providerStatus: text(body.status), occurredAt: text(body.occurredAt), correlationReference: text(body.correlationReference), humanReviewRequired: true, legalTruthCreated: false } } })
  if (recorded.error) { await signal('provider_webhook_failed','critical',{code:'record_failed'}); return reply(400, { ok: false, code: 'provider_webhook_record_failed', error: recorded.error.message }) }
  await signal('provider_webhook_accepted','info',{duplicate:Boolean(recorded.data?.duplicate)})
  return reply(202, { ok: true, envelopeId: recorded.data?.envelopeId || null, duplicate: Boolean(recorded.data?.duplicate), reviewRequired: true, legalTruthCreated: false })
})
