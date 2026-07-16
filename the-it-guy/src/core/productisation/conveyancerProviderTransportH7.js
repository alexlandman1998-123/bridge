import {
  loadConveyancerProviderApplicationContext,
  selectConveyancerProviderProfile,
} from './conveyancerProviderApplicationH6.js'
import {
  buildConveyancerProviderInboundDecision,
  buildConveyancerProviderTransportControl,
  enqueueConveyancerProviderCommand,
  evaluateConveyancerProviderTransportGate,
  loadConveyancerProviderTransportSummary,
  stageConveyancerProviderCommandPayload,
} from './conveyancerProviderTransport.js'

export const CONVEYANCER_PROVIDER_TRANSPORT_H7_VERSION = 'conveyancer_provider_transport_h7_v1'

const text = (value = '') => String(value ?? '').trim()
const freeze = (value) => { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
const missingH7 = (error) => ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code) || /provider_transport_h7|bridge_.*conveyancer_provider.*_h7/i.test(error?.message || '')

export async function runConveyancerProviderOutboundH7(client, input = {}) {
  const providerContext = input.providerContext || await loadConveyancerProviderApplicationContext(client, input)
  const transportSummary = input.transportSummary || await loadConveyancerProviderTransportSummary(client, input)
  if (!providerContext.available || !providerContext.control || !transportSummary.available || !transportSummary.control) return freeze({ ok: true, skipped: true, decision: 'manual_fallback', code: providerContext.reason || transportSummary.reason || 'provider_transport_unavailable' })
  const gate = evaluateConveyancerProviderTransportGate(buildConveyancerProviderTransportControl(transportSummary.control), { direction: 'outbound', transactionId: input.transactionId })
  if (!gate.allowed || gate.observeOnly) return freeze({ ok: true, skipped: true, decision: gate.observeOnly ? 'observed' : 'manual_fallback', code: gate.reason })
  const selection = selectConveyancerProviderProfile({ profiles: providerContext.profiles, credentialChecks: providerContext.credentialChecks, capability: input.capability, lane: input.lane, providerKey: input.providerKey, environment: input.environment })
  if (!selection.selected || !selection.canAttempt) return freeze({ ok: true, skipped: true, decision: 'manual_fallback', code: selection.reason, selection })
  const staged = await stageConveyancerProviderCommandPayload(client, input)
  if (!staged.ok) return freeze({ ok: false, skipped: true, decision: 'manual_fallback', code: 'provider_payload_staging_invalid', errors: staged.errors || [] })
  const enqueued = await enqueueConveyancerProviderCommand(client, {
    commandId: input.commandId, profileId: selection.selected.profileId,
    organisationId: input.organisationId, attorneyFirmId: input.attorneyFirmId, transactionId: input.transactionId,
    capability: input.capability, operationType: input.operationType, lane: input.lane,
    payloadReference: staged.payloadReference, payloadHash: staged.payloadHash,
    idempotencyKey: input.idempotencyKey, authorityReference: input.authorityReference,
    requestedAt: input.requestedAt, requestedBy: input.requestedBy,
  })
  if (!enqueued.ok) return freeze({ ...enqueued, skipped: true, decision: 'manual_fallback', code: 'provider_command_invalid' })
  return freeze({ ok: true, skipped: false, decision: 'queued', code: 'provider_command_queued', version: CONVEYANCER_PROVIDER_TRANSPORT_H7_VERSION, selection, staged: { payloadReference: staged.payloadReference, payloadHash: staged.payloadHash, duplicate: staged.duplicate }, command: enqueued.command, persistence: enqueued.data })
}

export function buildConveyancerProviderInboundReviewH7(input = {}) {
  const p7 = buildConveyancerProviderInboundDecision(input)
  const request = { ...p7.decision, version: CONVEYANCER_PROVIDER_TRANSPORT_H7_VERSION, decisionId: text(input.decisionId || input.idempotencyKey) }
  const errors = [...p7.errors]
  if (!request.decisionId || request.decisionId.length > 200) errors.push('provider_inbound_review_idempotency_invalid')
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], request })
}

export async function reviewConveyancerProviderInboundH7(client, input = {}) {
  const built = buildConveyancerProviderInboundReviewH7(input)
  if (!built.ok) return freeze({ ok: false, skipped: true, code: 'provider_inbound_review_invalid', errors: built.errors })
  const response = await client.rpc('bridge_review_conveyancer_provider_inbound_h7', { payload: built.request })
  if (response?.error) { if (missingH7(response.error)) return freeze({ ok: false, skipped: true, code: 'h7_not_installed' }); throw response.error }
  return freeze({ ok: true, skipped: false, code: response.data?.duplicate ? 'provider_inbound_review_replayed' : 'provider_inbound_review_committed', request: built.request, persistence: response.data || null })
}

export async function retryConveyancerProviderOutboundH7(client, { commandId = '', requestId = '', reason = '' } = {}) {
  if (!text(commandId) || !text(requestId) || !text(reason)) return freeze({ ok: false, skipped: true, code: 'provider_retry_request_invalid' })
  const response = await client.rpc('bridge_retry_conveyancer_provider_command_h7', { payload: { version: CONVEYANCER_PROVIDER_TRANSPORT_H7_VERSION, commandId: text(commandId), requestId: text(requestId), reason: text(reason) } })
  if (response?.error) { if (missingH7(response.error)) return freeze({ ok: false, skipped: true, code: 'h7_not_installed' }); throw response.error }
  return freeze({ ok: true, skipped: false, code: response.data?.duplicate ? 'provider_retry_replayed' : 'provider_retry_queued', persistence: response.data || null })
}

export async function loadConveyancerProviderTransportH7Summary(client, scope = {}) {
  const base = await loadConveyancerProviderTransportSummary(client, scope)
  if (!base.available || !client?.from) return freeze({ ...base, version: CONVEYANCER_PROVIDER_TRANSPORT_H7_VERSION, commands: [], envelopes: [], recoverable: 0, attention: 0 })
  try {
    const applyScope = (table, columns) => client.from(table).select(columns).eq('organisation_id', scope.organisationId).eq('attorney_firm_id', scope.attorneyFirmId).eq('transaction_id', scope.transactionId).order('created_at', { ascending: false }).limit(100)
    const [commandsResponse, envelopesResponse] = await Promise.all([
      applyScope('conveyancer_provider_outbound_commands', 'id, command_id, capability, operation_type, status, attempt_count, max_attempts, available_at, lease_expires_at, last_error_code, provider_reference, created_at, updated_at'),
      applyScope('conveyancer_provider_inbound_envelopes', 'id, provider_event_id, event_type, capability, status, received_at, reviewed_at, created_at'),
    ])
    if (commandsResponse.error) throw commandsResponse.error
    if (envelopesResponse.error) throw envelopesResponse.error
    const commands = commandsResponse.data || []; const envelopes = envelopesResponse.data || []
    const now = Date.now()
    const staleLeases = commands.filter((row) => row.status === 'leased' && new Date(row.lease_expires_at || 0).getTime() <= now).length
    const recoverable = commands.filter((row) => ['queued', 'retry_scheduled'].includes(row.status)).length + staleLeases
    const attention = commands.filter((row) => ['dead_letter', 'reconciliation_required'].includes(row.status)).length + envelopes.filter((row) => row.status === 'awaiting_review').length
    return freeze({ ...base, version: CONVEYANCER_PROVIDER_TRANSPORT_H7_VERSION, commands, envelopes, staleLeases, recoverable, attention, manualFallbackAvailable: true })
  } catch (error) {
    if (missingH7(error)) return freeze({ ...base, version: CONVEYANCER_PROVIDER_TRANSPORT_H7_VERSION, reason: 'h7_not_installed', commands: [], envelopes: [], recoverable: 0, attention: 0 })
    throw error
  }
}
