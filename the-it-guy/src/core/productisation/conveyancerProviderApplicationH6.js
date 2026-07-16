import {
  buildConveyancerProviderOperation,
  buildConveyancerProviderProfile,
  buildConveyancerProviderRuntimeControl,
  invokeConveyancerProviderOperation,
  loadConveyancerProviderRuntimeSummary,
} from './conveyancerProviderRuntime.js'

export const CONVEYANCER_PROVIDER_APPLICATION_H6_VERSION = 'conveyancer_provider_application_h6_v1'

const text = (value = '') => String(value ?? '').trim()
const key = (value = '') => text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
const freeze = (value) => { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
const missingH6 = (error) => ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code) || /conveyancer_provider_credential_checks|provider_application_h6/i.test(error?.message || '')

function latestByRecord(rows = []) {
  const latest = new Map()
  for (const row of rows) {
    const record = text(row.record_id || row.id)
    if (!latest.has(record) || Number(row.revision || 0) > Number(latest.get(record).revision || 0)) latest.set(record, row)
  }
  return [...latest.values()]
}

function profileFromRow(row = {}) {
  const payload = row.payload || {}
  return buildConveyancerProviderProfile({
    ...payload,
    profileId: row.id,
    organisationId: row.organisation_id,
    attorneyFirmId: row.attorney_firm_id,
    providerKey: row.provider_key,
    adapterKey: row.adapter_key,
    status: row.profile_status,
    secretReference: row.secret_reference,
  })
}

export function selectConveyancerProviderProfile({ profiles = [], credentialChecks = [], capability = '', lane = '', providerKey = '', environment = '' } = {}) {
  const checkByProfile = new Map()
  for (const check of credentialChecks) if (!checkByProfile.has(check.integration_profile_id)) checkByProfile.set(check.integration_profile_id, check)
  const candidates = latestByRecord(profiles).map((row) => ({ row, built: profileFromRow(row), credential: checkByProfile.get(row.id) || null })).filter(({ built }) => built.ok)
    .filter(({ built }) => built.profile.capabilities.includes(key(capability)))
    .filter(({ built }) => !lane || !built.profile.allowedLanes.length || built.profile.allowedLanes.includes(key(lane)))
    .filter(({ built }) => !providerKey || built.profile.providerKey === key(providerKey))
    .filter(({ built }) => !environment || built.profile.environment === key(environment))
    .sort((left, right) => {
      const rank = (entry) => entry.built.profile.adapterKey === 'manual' ? 0 : entry.credential?.status === 'verified' ? 3 : entry.built.profile.environment === 'sandbox' ? 2 : 1
      return rank(right) - rank(left) || new Date(right.row.created_at || 0).getTime() - new Date(left.row.created_at || 0).getTime()
    })
  const selected = candidates[0] || null
  if (!selected) return freeze({ selected: null, credential: null, reason: 'provider_profile_not_configured', canAttempt: false, manualFallbackRequired: true })
  const credentialUnexpired = !selected.credential?.expires_at || new Date(selected.credential.expires_at).getTime() > Date.now()
  const liveCredentialReady = selected.built.profile.adapterKey !== 'manual' && selected.credential?.status === 'verified' && credentialUnexpired
  const reason = selected.built.profile.adapterKey === 'manual' ? 'manual_provider_action_required' : liveCredentialReady ? 'provider_profile_ready' : 'provider_credential_not_verified'
  return freeze({ selected: selected.built.profile, credential: selected.credential, reason, canAttempt: selected.built.profile.adapterKey !== 'manual', manualFallbackRequired: !liveCredentialReady })
}

export async function loadConveyancerProviderApplicationContext(client, { organisationId = '', attorneyFirmId = '' } = {}) {
  if (!client?.from) return freeze({ available: false, reason: 'query_client_unavailable', control: null, profiles: [], credentialChecks: [], health: [] })
  try {
    const [runtime, profileResponse, credentialResponse] = await Promise.all([
      loadConveyancerProviderRuntimeSummary(client, { organisationId, attorneyFirmId }),
      client.from('conveyancer_integration_profiles').select('*').eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).eq('source_phase', 'P6').order('created_at', { ascending: false }).limit(100),
      client.from('conveyancer_provider_credential_checks').select('id, integration_profile_id, status, environment, reference_kind, operation_id, checked_at, expires_at, created_at').eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).order('checked_at', { ascending: false }).limit(100),
    ])
    if (!runtime.available) return freeze({ ...runtime, version: CONVEYANCER_PROVIDER_APPLICATION_H6_VERSION, profiles: [], credentialChecks: [] })
    if (profileResponse.error) throw profileResponse.error
    if (credentialResponse.error) throw credentialResponse.error
    return freeze({ ...runtime, version: CONVEYANCER_PROVIDER_APPLICATION_H6_VERSION, control: runtime.control ? buildConveyancerProviderRuntimeControl(runtime.control) : null, profiles: profileResponse.data || [], credentialChecks: credentialResponse.data || [] })
  } catch (error) {
    if (missingH6(error)) {
      const runtime = await loadConveyancerProviderRuntimeSummary(client, { organisationId, attorneyFirmId })
      return freeze({ ...runtime, version: CONVEYANCER_PROVIDER_APPLICATION_H6_VERSION, reason: 'h6_not_installed', profiles: [], credentialChecks: [] })
    }
    throw error
  }
}

export async function runConveyancerProviderApplicationCommand(client, input = {}) {
  const context = input.context || await loadConveyancerProviderApplicationContext(client, input)
  if (!context.available || !context.control) return freeze({ ok: true, decision: 'manual_fallback', code: context.reason || 'provider_runtime_unavailable', manualFallbackRequired: true })
  const selection = selectConveyancerProviderProfile({ profiles: context.profiles, credentialChecks: context.credentialChecks, capability: input.capability, lane: input.lane, providerKey: input.providerKey, environment: input.environment })
  if (!selection.selected || !selection.canAttempt) return freeze({ ok: true, decision: 'manual_fallback', code: selection.reason, manualFallbackRequired: true, selection })
  const built = buildConveyancerProviderOperation({ ...input, profileId: selection.selected.profileId })
  if (!built.ok) return freeze({ ok: false, decision: 'manual_fallback', code: 'provider_operation_invalid', errors: built.errors, manualFallbackRequired: true, selection })
  const result = await invokeConveyancerProviderOperation(client, built.operation)
  return freeze({ ...result, version: CONVEYANCER_PROVIDER_APPLICATION_H6_VERSION, selection, manualFallbackRequired: result.decision === 'manual_fallback' || result.ok === false })
}

export async function loadConveyancerProviderApplicationSummary(client, scope = {}) {
  const context = await loadConveyancerProviderApplicationContext(client, scope)
  const latestChecks = new Map()
  for (const check of context.credentialChecks || []) if (!latestChecks.has(check.integration_profile_id)) latestChecks.set(check.integration_profile_id, check)
  const counts = { verified: 0, missing: 0, invalid: 0, resolver_unavailable: 0, unchecked: 0 }
  for (const row of latestByRecord(context.profiles || [])) {
    if (row.adapter_key === 'manual') continue
    const check = latestChecks.get(row.id)
    const status = check?.status === 'verified' && check.expires_at && new Date(check.expires_at).getTime() <= Date.now() ? 'unchecked' : check?.status || 'unchecked'
    counts[status] = Number(counts[status] || 0) + 1
  }
  return freeze({ ...context, counts, providerReady: counts.verified > 0, manualFallbackAvailable: true })
}
