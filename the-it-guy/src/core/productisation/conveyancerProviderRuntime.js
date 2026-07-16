import { CONVEYANCER_INTEGRATION_CAPABILITIES } from '../integrations/conveyancerIntegrationFramework.js'

export const CONVEYANCER_PROVIDER_RUNTIME_VERSION = 'conveyancer_provider_runtime_p6_v1'
export const CONVEYANCER_PROVIDER_RUNTIME_MODES = Object.freeze({ disabled: 'disabled', observe: 'observe', pilot: 'pilot', live: 'live' })
export const CONVEYANCER_PROVIDER_ADAPTERS = Object.freeze({ manual: 'manual', genericHttp: 'generic_http' })
export const CONVEYANCER_PROVIDER_CIRCUIT_STATES = Object.freeze({ closed: 'closed', open: 'open', halfOpen: 'half_open' })

const MODES = new Set(Object.values(CONVEYANCER_PROVIDER_RUNTIME_MODES))
const ADAPTERS = new Set(Object.values(CONVEYANCER_PROVIDER_ADAPTERS))
const CAPABILITIES = new Set(Object.values(CONVEYANCER_INTEGRATION_CAPABILITIES))
const CIRCUITS = new Set(Object.values(CONVEYANCER_PROVIDER_CIRCUIT_STATES))
const LANES = new Set(['transfer', 'bond', 'cancellation', 'external'])
const AUTHENTICATION_TYPES = new Set(['bearer', 'api_key_header'])
const SECRET_REFERENCE = /^(env:\/\/[A-Z][A-Z0-9_]{2,127}|vault:\/\/[a-zA-Z0-9._:/-]{8,256})$/
const HASH = /^(sha256:)?[a-f0-9]{64}$/i

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
function iso(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, itemKey) => { result[itemKey] = stable(value[itemKey]); return result }, {}) }
function fnv(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
function unique(values = []) { return [...new Set(values.map(key).filter(Boolean))].sort() }
function rawSecretPaths(value, path = '') {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([itemKey, itemValue]) => {
    const current = path ? `${path}.${itemKey}` : itemKey
    if (/(api.?key|access.?token|refresh.?token|password|private.?key|client.?secret|credential|secret)$/i.test(itemKey) && !/reference$/i.test(itemKey) && text(itemValue)) return [current]
    return rawSecretPaths(itemValue, current)
  })
}

export function buildConveyancerProviderRuntimeControl(input = {}) {
  const control = {
    version: CONVEYANCER_PROVIDER_RUNTIME_VERSION,
    organisationId: text(input.organisationId || input.organisation_id), attorneyFirmId: text(input.attorneyFirmId || input.attorney_firm_id),
    mode: key(input.mode) || 'disabled', allowedAdapters: unique(input.allowedAdapters || input.allowed_adapters || ['manual']),
    allowedCapabilities: unique(input.allowedCapabilities || input.allowed_capabilities || []),
    pilotTransactionIds: [...new Set((input.pilotTransactionIds || input.pilot_transaction_ids || []).map(text).filter(Boolean))].sort(),
    killSwitchEnabled: (input.killSwitchEnabled ?? input.kill_switch_enabled) !== false,
    failureThreshold: Math.max(1, Math.min(20, Number(input.failureThreshold || input.failure_threshold || 5))),
    cooldownSeconds: Math.max(30, Math.min(86400, Number(input.cooldownSeconds || input.cooldown_seconds || 900))),
    timeoutMs: Math.max(1000, Math.min(60000, Number(input.timeoutMs || input.timeout_ms || 15000))), reason: text(input.reason),
  }
  control.fingerprint = fnv(control)
  return freeze(control)
}

export function buildConveyancerProviderProfile(input = {}) {
  const profile = {
    version: CONVEYANCER_PROVIDER_RUNTIME_VERSION, profileId: text(input.profileId || input.profile_id),
    organisationId: text(input.organisationId || input.organisation_id), attorneyFirmId: text(input.attorneyFirmId || input.attorney_firm_id),
    providerKey: key(input.providerKey || input.provider_key), adapterKey: key(input.adapterKey || input.adapter_key),
    environment: key(input.environment) || 'sandbox', status: key(input.status) || 'draft', secretReference: text(input.secretReference || input.secret_reference),
    allowedOrigin: text(input.allowedOrigin || input.allowed_origin), capabilities: unique(input.capabilities || []), allowedLanes: unique(input.allowedLanes || input.allowed_lanes || []),
    operationPaths: Object.fromEntries(Object.entries(input.operationPaths || input.operation_paths || {}).map(([name, path]) => [key(name), text(path)]).filter(([name, path]) => name && path.startsWith('/') && !path.startsWith('//'))),
    authentication: { type: key(input.authentication?.type || 'bearer'), headerName: text(input.authentication?.headerName || 'Authorization') },
  }
  profile.fingerprint = fnv(profile)
  const errors = []
  if (!profile.profileId || !profile.organisationId || !profile.attorneyFirmId || !profile.providerKey || !ADAPTERS.has(profile.adapterKey)) errors.push('provider_profile_identity_invalid')
  if (!['draft', 'manual', 'sandbox', 'active', 'paused', 'disabled'].includes(profile.status) || !['sandbox', 'production'].includes(profile.environment)) errors.push('provider_profile_state_invalid')
  if (profile.capabilities.some((value) => !CAPABILITIES.has(value)) || !profile.capabilities.length) errors.push('provider_profile_capabilities_invalid')
  if (profile.allowedLanes.some((value) => !LANES.has(value)) || !AUTHENTICATION_TYPES.has(profile.authentication.type) || !/^[A-Za-z0-9-]{1,64}$/.test(profile.authentication.headerName)) errors.push('provider_profile_runtime_config_invalid')
  if (profile.adapterKey === 'generic_http') {
    let origin = null
    try { origin = new URL(profile.allowedOrigin) } catch { /* validated below */ }
    if (!origin || origin.protocol !== 'https:' || origin.origin !== profile.allowedOrigin || !Object.keys(profile.operationPaths).length) errors.push('provider_profile_endpoint_invalid')
    if (!SECRET_REFERENCE.test(profile.secretReference)) errors.push('provider_secret_reference_invalid')
  }
  if (rawSecretPaths(input).length) errors.push('provider_profile_contains_raw_secret_material')
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], profile })
}

export function buildConveyancerProviderOperation(input = {}) {
  const operation = {
    version: CONVEYANCER_PROVIDER_RUNTIME_VERSION, operationId: text(input.operationId), profileId: text(input.profileId),
    organisationId: text(input.organisationId), attorneyFirmId: text(input.attorneyFirmId), transactionId: text(input.transactionId),
    capability: key(input.capability), operationType: key(input.operationType), lane: key(input.lane),
    payloadReference: text(input.payloadReference), payloadHash: text(input.payloadHash), idempotencyKey: text(input.idempotencyKey),
    authorityReference: text(input.authorityReference), requestedAt: iso(input.requestedAt), requestedBy: text(input.requestedBy),
  }
  operation.fingerprint = fnv(operation)
  const errors = []
  if (!operation.operationId || !operation.profileId || !operation.organisationId || !operation.attorneyFirmId || !operation.transactionId || !CAPABILITIES.has(operation.capability) || !operation.operationType || !LANES.has(operation.lane)) errors.push('provider_operation_identity_invalid')
  if (!operation.payloadReference || !HASH.test(operation.payloadHash) || !operation.idempotencyKey || !operation.authorityReference || !operation.requestedAt || !operation.requestedBy) errors.push('provider_operation_evidence_invalid')
  if (rawSecretPaths(input).length || Object.hasOwn(input, 'payload') || Object.hasOwn(input, 'body')) errors.push('provider_operation_must_be_reference_only')
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], operation })
}

export function evaluateConveyancerProviderRuntimeGate(controlInput = {}, profileInput = {}, operationInput = {}, health = {}) {
  const control = buildConveyancerProviderRuntimeControl(controlInput); const profileResult = buildConveyancerProviderProfile(profileInput); const profile = profileResult.profile
  if (!MODES.has(control.mode) || !control.organisationId || !control.attorneyFirmId || !control.reason) return freeze({ allowed: false, reason: 'provider_control_invalid' })
  if (control.killSwitchEnabled) return freeze({ allowed: false, reason: 'provider_kill_switch_enabled' })
  if (control.mode === 'disabled') return freeze({ allowed: false, reason: 'provider_runtime_disabled' })
  if (!profileResult.ok) return freeze({ allowed: false, reason: 'provider_profile_invalid' })
  if (profile.organisationId !== operationInput.organisationId || profile.attorneyFirmId !== operationInput.attorneyFirmId || profile.profileId !== operationInput.profileId) return freeze({ allowed: false, reason: 'provider_scope_mismatch' })
  if (!['manual', 'sandbox', 'active'].includes(profile.status)) return freeze({ allowed: false, reason: 'provider_profile_not_active' })
  if (!control.allowedAdapters.includes(profile.adapterKey) || !control.allowedCapabilities.includes(operationInput.capability) || !profile.capabilities.includes(operationInput.capability)) return freeze({ allowed: false, reason: 'provider_capability_not_enabled' })
  if (profile.allowedLanes.length && !profile.allowedLanes.includes(operationInput.lane)) return freeze({ allowed: false, reason: 'provider_lane_not_enabled' })
  if (control.mode === 'pilot' && !control.pilotTransactionIds.includes(operationInput.transactionId)) return freeze({ allowed: false, reason: 'matter_outside_provider_pilot' })
  if ((health.state || 'closed') === 'open' && (!iso(health.reopenAt) || new Date(health.reopenAt).getTime() > Date.now())) return freeze({ allowed: false, reason: 'provider_circuit_open' })
  return freeze({ allowed: true, observeOnly: control.mode === 'observe', reason: control.mode === 'observe' ? 'observe_only' : 'allowed' })
}

export async function executeConveyancerProviderOperation({ control = {}, profile: profileInput = {}, operation: operationInput = {}, health = {}, adapters = {}, runtime = {} } = {}) {
  const profileResult = buildConveyancerProviderProfile(profileInput); const operationResult = buildConveyancerProviderOperation(operationInput)
  if (!profileResult.ok || !operationResult.ok) return freeze({ ok: false, code: 'provider_request_invalid', errors: [...profileResult.errors, ...operationResult.errors], outcome: null })
  const gate = evaluateConveyancerProviderRuntimeGate(control, profileResult.profile, operationResult.operation, health)
  if (!gate.allowed) return freeze({ ok: true, code: gate.reason, decision: 'manual_fallback', outcome: null })
  if (gate.observeOnly) return freeze({ ok: true, code: 'provider_operation_observed', decision: 'observed', outcome: null })
  const adapter = adapters[profileResult.profile.adapterKey]
  if (!adapter?.execute) return freeze({ ok: false, code: 'provider_adapter_unavailable', errors: ['provider_adapter_unavailable'], outcome: null })
  try {
    const result = await adapter.execute(operationResult.operation, profileResult.profile, { ...runtime, timeoutMs: buildConveyancerProviderRuntimeControl(control).timeoutMs })
    const outcome = { operationId: operationResult.operation.operationId, providerKey: profileResult.profile.providerKey, adapterKey: profileResult.profile.adapterKey, status: result?.ok ? 'succeeded' : 'failed', providerReference: text(result?.providerReference), responseHash: text(result?.responseHash), completedAt: iso(result?.completedAt) || new Date().toISOString(), errorCode: result?.ok ? null : key(result?.code || 'provider_operation_failed'), humanReviewRequired: true }
    if (rawSecretPaths(result).length) return freeze({ ok: false, code: 'provider_adapter_secret_leak_blocked', errors: ['provider_adapter_secret_leak_blocked'], outcome: null })
    return freeze({ ok: result?.ok === true, code: result?.ok ? 'provider_operation_completed' : outcome.errorCode, decision: result?.ok ? 'committed' : 'manual_fallback', outcome, outcomeFingerprint: fnv(outcome) })
  } catch (error) {
    const outcome = { operationId: operationResult.operation.operationId, providerKey: profileResult.profile.providerKey, adapterKey: profileResult.profile.adapterKey, status: 'failed', providerReference: '', responseHash: '', completedAt: new Date().toISOString(), errorCode: key(error?.code || 'provider_adapter_exception'), humanReviewRequired: true }
    return freeze({ ok: false, code: outcome.errorCode, decision: 'manual_fallback', outcome, outcomeFingerprint: fnv(outcome) })
  }
}

export function createManualConveyancerProviderAdapter() {
  return freeze({ execute: async () => ({ ok: false, code: 'manual_provider_action_required', completedAt: new Date().toISOString() }) })
}

export function createGenericHttpConveyancerProviderAdapter({ fetchImpl = globalThis.fetch } = {}) {
  return freeze({
    async execute(operation, profile, runtime = {}) {
      if (typeof fetchImpl !== 'function' || typeof runtime.resolveCredential !== 'function' || typeof runtime.resolvePayload !== 'function') return { ok: false, code: 'provider_runtime_dependency_missing' }
      const path = profile.operationPaths[operation.operationType]
      if (!path) return { ok: false, code: 'provider_operation_path_missing' }
      const target = new URL(path, profile.allowedOrigin)
      if (target.origin !== profile.allowedOrigin || target.protocol !== 'https:') return { ok: false, code: 'provider_endpoint_scope_invalid' }
      const credential = await runtime.resolveCredential(profile.secretReference)
      const payload = await runtime.resolvePayload(operation.payloadReference, operation.payloadHash)
      if (!credential || payload == null) return { ok: false, code: 'provider_reference_resolution_failed' }
      const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': operation.idempotencyKey }
      if (profile.authentication.type === 'api_key_header') headers[profile.authentication.headerName] = typeof credential === 'string' ? credential : credential.value
      else headers.Authorization = `Bearer ${typeof credential === 'string' ? credential : credential.value}`
      const response = await fetchImpl(target, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(runtime.timeoutMs || 15000) })
      const providerReference = text(response.headers?.get?.('x-provider-reference'))
      return { ok: response.ok, code: response.ok ? 'provider_http_succeeded' : `provider_http_${response.status}`, providerReference, responseHash: text(response.headers?.get?.('x-content-sha256')), completedAt: new Date().toISOString() }
    },
  })
}

function missingP6(error) { return ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code) || /conveyancer_provider_runtime|bridge_set_conveyancer_provider/i.test(error?.message || '') }
export async function persistConveyancerProviderRuntimeControl(client, input = {}) { const control = buildConveyancerProviderRuntimeControl(input); const response = await client.rpc('bridge_set_conveyancer_provider_runtime_control', { payload: control }); if (response?.error) throw response.error; return freeze({ ok: true, control, data: response?.data || null }) }
export async function persistConveyancerProviderProfile(client, input = {}) { const built = buildConveyancerProviderProfile(input); if (!built.ok) return freeze({ ok: false, errors: built.errors, profile: built.profile }); const response = await client.rpc('bridge_set_conveyancer_provider_profile', { payload: built.profile }); if (response?.error) throw response.error; return freeze({ ok: true, profile: built.profile, data: response?.data || null }) }
export async function invokeConveyancerProviderOperation(client, input = {}) {
  const built = buildConveyancerProviderOperation(input)
  if (!built.ok) return freeze({ ok: false, code: 'provider_operation_invalid', errors: built.errors })
  if (!client?.functions?.invoke) throw new Error('A Supabase Functions client is required.')
  const response = await client.functions.invoke('conveyancer-provider-runtime', { body: built.operation })
  if (response?.error) throw response.error
  return freeze(response?.data || { ok: false, code: 'provider_runtime_empty_response' })
}
export async function loadConveyancerProviderRuntimeSummary(client, { organisationId = '', attorneyFirmId = '' } = {}) {
  try {
    const [controls, profiles, health] = await Promise.all([
      client.from('conveyancer_provider_runtime_controls').select('*').eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).order('revision', { ascending: false }).limit(1),
      client.from('conveyancer_integration_profiles').select('id, provider_key, adapter_key, profile_status, created_at').eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).eq('source_phase', 'P6').order('created_at', { ascending: false }).limit(50),
      client.from('conveyancer_provider_health_events').select('provider_key, adapter_key, outcome, circuit_state, occurred_at').eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).order('occurred_at', { ascending: false }).limit(50),
    ])
    const error = controls.error || profiles.error || health.error; if (error) throw error
    const latestByProvider = new Map(); for (const row of health.data || []) if (!latestByProvider.has(row.provider_key)) latestByProvider.set(row.provider_key, row)
    return freeze({ available: true, control: controls.data?.[0] ? buildConveyancerProviderRuntimeControl(controls.data[0]) : null, profiles: profiles.data || [], health: [...latestByProvider.values()] })
  } catch (error) { if (missingP6(error)) return freeze({ available: false, reason: 'p6_not_installed', control: null, profiles: [], health: [] }); throw error }
}
