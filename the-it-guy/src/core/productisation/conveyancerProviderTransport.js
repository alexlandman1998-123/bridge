import { CONVEYANCER_INTEGRATION_CAPABILITIES } from '../integrations/conveyancerIntegrationFramework.js'

export const CONVEYANCER_PROVIDER_TRANSPORT_VERSION = 'conveyancer_provider_transport_p7_v1'
export const CONVEYANCER_PROVIDER_TRANSPORT_MODES = Object.freeze({ disabled: 'disabled', observe: 'observe', pilot: 'pilot', live: 'live' })
export const CONVEYANCER_PROVIDER_COMMAND_STATUSES = Object.freeze({ queued: 'queued', leased: 'leased', retryScheduled: 'retry_scheduled', succeeded: 'succeeded', deadLetter: 'dead_letter', cancelled: 'cancelled', reconciliationRequired: 'reconciliation_required' })
export const CONVEYANCER_PROVIDER_INBOUND_DECISIONS = Object.freeze({ acceptForReview: 'accept_for_review', quarantine: 'quarantine', ignore: 'ignore' })

const CAPABILITIES = new Set(Object.values(CONVEYANCER_INTEGRATION_CAPABILITIES)); const LANES = new Set(['transfer', 'bond', 'cancellation', 'external']); const MODES = new Set(Object.values(CONVEYANCER_PROVIDER_TRANSPORT_MODES)); const DECISIONS = new Set(Object.values(CONVEYANCER_PROVIDER_INBOUND_DECISIONS)); const HASH = /^(sha256:)?[a-f0-9]{64}$/i
function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
function iso(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, itemKey) => { result[itemKey] = stable(value[itemKey]); return result }, {}) }
function fnv(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
function hex(value) { return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('') }
function secretMaterial(value, path = '') { if (!value || typeof value !== 'object') return []; return Object.entries(value).flatMap(([name, item]) => { const current = path ? `${path}.${name}` : name; if (/(api.?key|access.?token|refresh.?token|password|private.?key|client.?secret|credential|secret)$/i.test(name) && !/reference$/i.test(name) && text(item)) return [current]; return secretMaterial(item, current) }) }

export function buildConveyancerProviderTransportControl(input = {}) {
  const control = {
    version: CONVEYANCER_PROVIDER_TRANSPORT_VERSION, organisationId: text(input.organisationId || input.organisation_id), attorneyFirmId: text(input.attorneyFirmId || input.attorney_firm_id), mode: key(input.mode) || 'disabled',
    outboundEnabled: (input.outboundEnabled ?? input.outbound_enabled) === true, inboundEnabled: (input.inboundEnabled ?? input.inbound_enabled) === true,
    pilotTransactionIds: [...new Set((input.pilotTransactionIds || input.pilot_transaction_ids || []).map(text).filter(Boolean))].sort(), killSwitchEnabled: (input.killSwitchEnabled ?? input.kill_switch_enabled) !== false,
    maxAttempts: Math.max(1, Math.min(20, Number(input.maxAttempts || input.max_attempts || 5))), leaseSeconds: Math.max(30, Math.min(900, Number(input.leaseSeconds || input.lease_seconds || 120))),
    initialRetrySeconds: Math.max(5, Math.min(3600, Number(input.initialRetrySeconds || input.initial_retry_seconds || 30))), maxRetrySeconds: Math.max(30, Math.min(86400, Number(input.maxRetrySeconds || input.max_retry_seconds || 3600))),
    replayWindowSeconds: Math.max(60, Math.min(900, Number(input.replayWindowSeconds || input.replay_window_seconds || 300))), maxInboundBytes: Math.max(1024, Math.min(1_048_576, Number(input.maxInboundBytes || input.max_inbound_bytes || 65_536))), reason: text(input.reason),
  }
  control.fingerprint = fnv(control); return freeze(control)
}

export function evaluateConveyancerProviderTransportGate(controlInput = {}, { direction = 'outbound', transactionId = '' } = {}) {
  const control = buildConveyancerProviderTransportControl(controlInput)
  if (!control.organisationId || !control.attorneyFirmId || !MODES.has(control.mode) || !control.reason) return freeze({ allowed: false, reason: 'provider_transport_control_invalid' })
  if (control.killSwitchEnabled) return freeze({ allowed: false, reason: 'provider_transport_kill_switch_enabled' })
  if (control.mode === 'disabled') return freeze({ allowed: false, reason: 'provider_transport_disabled' })
  if (direction === 'outbound' && !control.outboundEnabled) return freeze({ allowed: false, reason: 'provider_outbound_disabled' })
  if (direction === 'inbound' && !control.inboundEnabled) return freeze({ allowed: false, reason: 'provider_inbound_disabled' })
  if (control.mode === 'pilot' && !control.pilotTransactionIds.includes(text(transactionId))) return freeze({ allowed: false, reason: 'matter_outside_provider_transport_pilot' })
  return freeze({ allowed: true, observeOnly: control.mode === 'observe', reason: control.mode === 'observe' ? 'observe_only' : 'allowed' })
}

export function buildConveyancerProviderCommand(input = {}) {
  const command = {
    version: CONVEYANCER_PROVIDER_TRANSPORT_VERSION, commandId: text(input.commandId || input.operationId), profileId: text(input.profileId), organisationId: text(input.organisationId), attorneyFirmId: text(input.attorneyFirmId), transactionId: text(input.transactionId),
    capability: key(input.capability), operationType: key(input.operationType), lane: key(input.lane), payloadReference: text(input.payloadReference), payloadHash: text(input.payloadHash),
    idempotencyKey: text(input.idempotencyKey), authorityReference: text(input.authorityReference), requestedAt: iso(input.requestedAt), requestedBy: text(input.requestedBy),
  }
  command.fingerprint = fnv(command); const errors = []
  if (!command.commandId || !command.profileId || !command.organisationId || !command.attorneyFirmId || !command.transactionId || !CAPABILITIES.has(command.capability) || !command.operationType || !LANES.has(command.lane)) errors.push('provider_command_identity_invalid')
  const expectedPrefix = `conveyancer-provider-outbox/${command.organisationId}/${command.attorneyFirmId}/${command.transactionId}/`
  if (!command.payloadReference.startsWith(expectedPrefix) || !HASH.test(command.payloadHash) || !command.idempotencyKey || !command.authorityReference || !command.requestedAt || !command.requestedBy) errors.push('provider_command_evidence_invalid')
  if (Object.hasOwn(input, 'payload') || Object.hasOwn(input, 'body') || secretMaterial(input).length) errors.push('provider_command_must_be_reference_only')
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], command })
}

export function buildConveyancerProviderWebhookEndpoint(input = {}) {
  const endpoint = { version: CONVEYANCER_PROVIDER_TRANSPORT_VERSION, endpointKey: text(input.endpointKey), organisationId: text(input.organisationId), attorneyFirmId: text(input.attorneyFirmId), profileId: text(input.profileId), status: key(input.status) || 'draft', secretReference: text(input.secretReference), allowedEventTypes: [...new Set((input.allowedEventTypes || []).map(key).filter(Boolean))].sort(), allowedCapabilities: [...new Set((input.allowedCapabilities || []).map(key).filter(Boolean))].sort() }
  endpoint.fingerprint = fnv(endpoint); const errors = []
  if (!endpoint.organisationId || !endpoint.attorneyFirmId || !endpoint.profileId || !['draft', 'active', 'paused', 'disabled'].includes(endpoint.status)) errors.push('provider_webhook_endpoint_identity_invalid')
  if (!/^env:\/\/[A-Z][A-Z0-9_]{2,127}$/.test(endpoint.secretReference) || !endpoint.allowedEventTypes.length || endpoint.allowedEventTypes.some((value) => !/^[a-z0-9_.:-]{1,100}$/.test(value)) || !endpoint.allowedCapabilities.length || endpoint.allowedCapabilities.some((value) => !CAPABILITIES.has(value))) errors.push('provider_webhook_endpoint_config_invalid')
  if (secretMaterial(input).length) errors.push('provider_webhook_endpoint_contains_raw_secret')
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], endpoint })
}

export function buildConveyancerProviderInboundDecision(input = {}) {
  const decision = { version: CONVEYANCER_PROVIDER_TRANSPORT_VERSION, envelopeId: text(input.envelopeId), organisationId: text(input.organisationId), attorneyFirmId: text(input.attorneyFirmId), transactionId: text(input.transactionId), decision: key(input.decision), reason: text(input.reason), reviewedBy: text(input.reviewedBy), reviewedAt: iso(input.reviewedAt) }
  decision.fingerprint = fnv(decision); const errors = []
  if (!decision.envelopeId || !decision.organisationId || !decision.attorneyFirmId || !decision.transactionId || !DECISIONS.has(decision.decision) || !decision.reason || !decision.reviewedBy || !decision.reviewedAt) errors.push('provider_inbound_decision_invalid')
  if (secretMaterial(input).length) errors.push('provider_inbound_decision_contains_secret')
  return freeze({ ok: errors.length === 0, errors, decision })
}

function missingP7(error) { return ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code) || /conveyancer_provider_(transport|outbound|inbound)|bridge_.*conveyancer_provider_command/i.test(error?.message || '') }
export async function persistConveyancerProviderTransportControl(client, input = {}) { const control = buildConveyancerProviderTransportControl(input); const response = await client.rpc('bridge_set_conveyancer_provider_transport_control', { payload: control }); if (response?.error) throw response.error; return freeze({ ok: true, control, data: response?.data || null }) }
export async function persistConveyancerProviderWebhookEndpoint(client, input = {}) { const built = buildConveyancerProviderWebhookEndpoint(input); if (!built.ok) return freeze({ ok: false, errors: built.errors, endpoint: built.endpoint }); const response = await client.rpc('bridge_set_conveyancer_provider_webhook_endpoint', { payload: built.endpoint }); if (response?.error) throw response.error; return freeze({ ok: true, endpoint: built.endpoint, data: response?.data || null }) }
export async function stageConveyancerProviderCommandPayload(client, { organisationId = '', attorneyFirmId = '', transactionId = '', payload = null } = {}) {
  if (!client?.storage?.from || !organisationId || !attorneyFirmId || !transactionId || !payload || typeof payload !== 'object' || Array.isArray(payload) || secretMaterial(payload).length) return freeze({ ok: false, errors: ['provider_payload_staging_invalid'] })
  const bytes = new TextEncoder().encode(JSON.stringify(stable(payload))); const payloadHash = `sha256:${hex(await globalThis.crypto.subtle.digest('SHA-256', bytes))}`
  const path = `${organisationId}/${attorneyFirmId}/${transactionId}/${payloadHash.slice(7)}.json`; const response = await client.storage.from('conveyancer-provider-outbox').upload(path, bytes, { contentType: 'application/json', upsert: false })
  if (response?.error && !/already exists|duplicate/i.test(response.error.message || '')) throw response.error
  return freeze({ ok: true, payloadReference: `conveyancer-provider-outbox/${path}`, payloadHash, duplicate: Boolean(response?.error) })
}
export async function enqueueConveyancerProviderCommand(client, input = {}) { const built = buildConveyancerProviderCommand(input); if (!built.ok) return freeze({ ok: false, errors: built.errors, command: built.command }); const response = await client.rpc('bridge_enqueue_conveyancer_provider_command', { payload: built.command }); if (response?.error) throw response.error; return freeze({ ok: true, command: built.command, data: response?.data || null }) }
export async function reviewConveyancerProviderInboundEnvelope(client, input = {}) { const built = buildConveyancerProviderInboundDecision(input); if (!built.ok) return freeze({ ok: false, errors: built.errors, decision: built.decision }); const response = await client.rpc('bridge_review_conveyancer_provider_inbound', { payload: built.decision }); if (response?.error) throw response.error; return freeze({ ok: true, decision: built.decision, data: response?.data || null }) }
export async function retryConveyancerProviderCommand(client, { commandId = '', reason = '' } = {}) { if (!text(commandId) || !text(reason)) return freeze({ ok: false, errors: ['provider_retry_reason_required'] }); const response = await client.rpc('bridge_retry_conveyancer_provider_command', { p_command_id: commandId, p_reason: text(reason) }); if (response?.error) throw response.error; return freeze({ ok: true, data: response?.data || null }) }
export async function loadConveyancerProviderTransportSummary(client, { organisationId = '', attorneyFirmId = '', transactionId = '' } = {}) {
  try {
    const [controls, outbound, inbound] = await Promise.all([
      client.from('conveyancer_provider_transport_controls').select('*').eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).order('revision', { ascending: false }).limit(1),
      client.from('conveyancer_provider_outbound_commands').select('status').eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).eq('transaction_id', transactionId).limit(200),
      client.from('conveyancer_provider_inbound_envelopes').select('status').eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).eq('transaction_id', transactionId).limit(200),
    ]); const error = controls.error || outbound.error || inbound.error; if (error) throw error
    const counts = (rows = []) => rows.reduce((result, row) => { result[row.status] = (result[row.status] || 0) + 1; return result }, {})
    return freeze({ available: true, control: controls.data?.[0] ? buildConveyancerProviderTransportControl(controls.data[0]) : null, outbound: counts(outbound.data), inbound: counts(inbound.data) })
  } catch (error) { if (missingP7(error)) return freeze({ available: false, reason: 'p7_not_installed', control: null, outbound: {}, inbound: {} }); throw error }
}
