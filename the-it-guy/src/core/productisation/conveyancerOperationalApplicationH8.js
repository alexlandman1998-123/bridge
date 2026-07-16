import {
  CONVEYANCER_OPERATIONAL_ASSURANCE_VERSION,
  authoriseConveyancerRelease,
  buildConveyancerKillSwitch,
  evaluateConveyancerReleaseGate,
  loadConveyancerOperationalSummary,
} from './conveyancerOperationalAssurance.js'

export const CONVEYANCER_OPERATIONAL_APPLICATION_H8_VERSION = 'conveyancer_operational_application_h8_v1'
export const CONVEYANCER_OPERATIONAL_COMPONENTS = Object.freeze({ all: 'all', orchestration: 'orchestration', notifications: 'notifications', documents: 'documents', providers: 'providers' })

const text = (value = '') => String(value ?? '').trim()
const key = (value = '') => text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
const freeze = (value) => { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
const stable = (value) => { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, itemKey) => { result[itemKey] = stable(value[itemKey]); return result }, {}) }
const fingerprint = (value) => { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
const missingH8 = (error) => ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code) || /application_health_h8|application_kill_switch_h8/i.test(error?.message || '')

export function buildConveyancerApplicationKillSwitchH8(input = {}) {
  const built = buildConveyancerKillSwitch({ ...input, direction: input.direction || 'all' })
  const killSwitch = { ...built.killSwitch, version: CONVEYANCER_OPERATIONAL_APPLICATION_H8_VERSION, component: key(input.component) || 'all', requestId: text(input.requestId) }
  killSwitch.fingerprint = fingerprint(killSwitch)
  const errors = [...built.errors]
  if (!Object.values(CONVEYANCER_OPERATIONAL_COMPONENTS).includes(killSwitch.component) || !killSwitch.requestId || killSwitch.requestId.length > 200) errors.push('application_kill_switch_component_invalid')
  if (killSwitch.component !== 'providers' && killSwitch.direction !== 'all') errors.push('application_kill_switch_direction_invalid')
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], killSwitch })
}

export async function persistConveyancerApplicationKillSwitchH8(client, input = {}) {
  const built = buildConveyancerApplicationKillSwitchH8(input)
  if (!built.ok) return freeze({ ok: false, skipped: true, code: 'application_kill_switch_invalid', errors: built.errors })
  const response = await client.rpc('bridge_set_conveyancer_application_kill_switch_h8', { payload: built.killSwitch })
  if (response?.error) { if (missingH8(response.error)) return freeze({ ok: false, skipped: true, code: 'h8_not_installed' }); throw response.error }
  return freeze({ ok: true, skipped: false, code: response.data?.duplicate ? 'application_kill_switch_replayed' : 'application_kill_switch_recorded', killSwitch: built.killSwitch, persistence: response.data || null })
}

export function evaluateConveyancerDeploymentReadinessH8({ candidate = {}, approvals = [], providerSnapshot = null, applicationSnapshot = null, activeGlobalKillSwitch = false, asOf = new Date().toISOString(), snapshotFreshnessSeconds = 300 } = {}) {
  const normalizedProviderSnapshot = providerSnapshot ? { ...providerSnapshot, capturedAt: providerSnapshot.capturedAt || providerSnapshot.captured_at } : null
  const providerGate = evaluateConveyancerReleaseGate({ candidate, approvals, snapshot: normalizedProviderSnapshot, activeGlobalKillSwitch, asOf, snapshotFreshnessSeconds })
  const blockers = [...providerGate.blockers]
  if (!applicationSnapshot || applicationSnapshot.health !== 'pass') blockers.push('release_application_health_not_passing')
  if (!applicationSnapshot?.captured_at || new Date(asOf).getTime() - new Date(applicationSnapshot.captured_at).getTime() > snapshotFreshnessSeconds * 1000) blockers.push('release_application_health_stale')
  return freeze({ allowed: blockers.length === 0, blockers: [...new Set(blockers)], candidate: providerGate.candidate, providerSnapshot, applicationSnapshot })
}

export async function authoriseConveyancerReleaseH8(client, { releaseCandidateId = '', reason = '' } = {}) {
  if (!text(releaseCandidateId) || !text(reason)) return freeze({ ok: false, blocked: true, reason: 'release_authorisation_invalid' })
  const response = await client.rpc('bridge_authorise_conveyancer_release_h8', { p_release_candidate_id: releaseCandidateId, p_reason: text(reason) })
  if (response?.error) { if (missingH8(response.error)) return freeze({ ok: false, blocked: true, reason: 'h8_not_installed' }); throw response.error }
  return freeze(response.data || { ok: false, blocked: true, reason: 'release_authorisation_empty' })
}

export async function loadConveyancerOperationalApplicationH8Summary(client, { organisationId = '', attorneyFirmId = '' } = {}) {
  const base = await loadConveyancerOperationalSummary(client, { organisationId, attorneyFirmId })
  if (!base.available || !client?.from) return freeze({ ...base, version: CONVEYANCER_OPERATIONAL_APPLICATION_H8_VERSION, applicationSnapshot: null, activeSwitches: [], componentStops: {}, releaseGateReady: false })
  try {
    const components = ['orchestration', 'notifications', 'documents', 'providers']
    const [snapshotResponse, switchesResponse, ...componentGates] = await Promise.all([
      client.from('conveyancer_application_health_snapshots').select('health, component_health, metrics, blockers, warnings, captured_at').eq('scope', 'firm').eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).order('captured_at', { ascending: false }).limit(1),
      client.from('conveyancer_provider_kill_switches').select('record_id, revision, component, enabled, direction, expires_at, reason, created_at').eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).order('revision', { ascending: false }).limit(200),
      ...components.map((component) => client.rpc('bridge_conveyancer_application_operation_allowed_h8', { p_organisation_id: organisationId, p_attorney_firm_id: attorneyFirmId, p_component: component })),
    ])
    if (snapshotResponse.error) throw snapshotResponse.error
    if (switchesResponse.error) throw switchesResponse.error
    const latest = new Map(); for (const row of switchesResponse.data || []) if (!latest.has(row.record_id)) latest.set(row.record_id, row)
    const activeSwitches = [...latest.values()].filter((row) => row.enabled && (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()))
    const componentStops = Object.fromEntries(components.map((component, index) => [component, componentGates[index]?.error ? activeSwitches.some((row) => ['all', component].includes(row.component || 'providers')) : componentGates[index]?.data === false]))
    const anyComponentStopped = Object.values(componentStops).some(Boolean)
    const applicationSnapshot = snapshotResponse.data?.[0] || null
    return freeze({ ...base, version: CONVEYANCER_OPERATIONAL_APPLICATION_H8_VERSION, applicationSnapshot, activeSwitches, componentStops, killSwitchActive: base.killSwitchActive || anyComponentStopped, releaseGateReady: base.snapshot?.health === 'pass' && applicationSnapshot?.health === 'pass' && !anyComponentStopped })
  } catch (error) {
    if (missingH8(error)) return freeze({ ...base, version: CONVEYANCER_OPERATIONAL_APPLICATION_H8_VERSION, reason: 'h8_not_installed', applicationSnapshot: null, activeSwitches: [], componentStops: {}, releaseGateReady: false })
    throw error
  }
}

// Kept as a named compatibility route for callers that only need the P8 provider gate.
export const authoriseConveyancerProviderRelease = authoriseConveyancerRelease
export const CONVEYANCER_OPERATIONAL_PROVIDER_VERSION = CONVEYANCER_OPERATIONAL_ASSURANCE_VERSION
