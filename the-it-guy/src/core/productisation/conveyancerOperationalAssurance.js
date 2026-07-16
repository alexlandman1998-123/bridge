export const CONVEYANCER_OPERATIONAL_ASSURANCE_VERSION = 'conveyancer_operational_assurance_p8_v1'
export const CONVEYANCER_OPERATIONAL_HEALTH = Object.freeze({ pass: 'pass', warning: 'warning', fail: 'fail' })
export const CONVEYANCER_KILL_SWITCH_SCOPES = Object.freeze({ global: 'global', organisation: 'organisation', firm: 'firm', profile: 'profile' })
export const CONVEYANCER_RELEASE_APPROVER_ROLES = Object.freeze({ operations: 'operations', security: 'security', legal: 'legal' })
const SCOPES = new Set(Object.values(CONVEYANCER_KILL_SWITCH_SCOPES)); const APPROVER_ROLES = new Set(Object.values(CONVEYANCER_RELEASE_APPROVER_ROLES)); const HASH = /^(sha256:)?[a-f0-9]{64}$/i
function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
function iso(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, itemKey) => { result[itemKey] = stable(value[itemKey]); return result }, {}) }
function fnv(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
function secretMaterial(value, path = '') { if (!value || typeof value !== 'object') return []; return Object.entries(value).flatMap(([name, item]) => { const current = path ? `${path}.${name}` : name; if (/(api.?key|access.?token|refresh.?token|password|private.?key|client.?secret|credential|secret)$/i.test(name) && !/reference$/i.test(name) && text(item)) return [current]; return secretMaterial(item, current) }) }

export function buildConveyancerOperationalPolicy(input = {}) {
  const policy = { version: CONVEYANCER_OPERATIONAL_ASSURANCE_VERSION, scope: key(input.scope) || 'firm', organisationId: text(input.organisationId), attorneyFirmId: text(input.attorneyFirmId), windowMinutes: Math.max(5, Math.min(1440, Number(input.windowMinutes || 60))), maxQueueDepth: Math.max(0, Number(input.maxQueueDepth ?? 100)), maxOldestQueueSeconds: Math.max(30, Number(input.maxOldestQueueSeconds || 900)), minSuccessRatePercent: Math.max(0, Math.min(100, Number(input.minSuccessRatePercent ?? 95))), maxDeadLetters: Math.max(0, Number(input.maxDeadLetters ?? 0)), maxReconciliationRequired: Math.max(0, Number(input.maxReconciliationRequired ?? 0)), maxInboundAwaitingReview: Math.max(0, Number(input.maxInboundAwaitingReview ?? 25)), maxInboundAgeSeconds: Math.max(60, Number(input.maxInboundAgeSeconds || 3600)), snapshotFreshnessSeconds: Math.max(60, Math.min(3600, Number(input.snapshotFreshnessSeconds || 300))), reason: text(input.reason) }
  policy.fingerprint = fnv(policy); const errors = []
  if (!['global', 'firm'].includes(policy.scope) || !policy.reason || (policy.scope === 'firm' && (!policy.organisationId || !policy.attorneyFirmId))) errors.push('operational_policy_identity_invalid')
  return freeze({ ok: errors.length === 0, errors, policy })
}

export function evaluateConveyancerOperationalMetrics(policyInput = {}, metrics = {}) {
  const built = buildConveyancerOperationalPolicy(policyInput); if (!built.ok) return freeze({ health: 'fail', blockers: built.errors, metrics: stable(metrics) })
  const p = built.policy; const blockers = []; const warnings = []
  if (Number(metrics.queueDepth || 0) > p.maxQueueDepth) blockers.push('queue_depth_exceeded')
  if (Number(metrics.oldestQueueSeconds || 0) > p.maxOldestQueueSeconds) blockers.push('oldest_queue_age_exceeded')
  if (Number(metrics.successRatePercent ?? 100) < p.minSuccessRatePercent) blockers.push('success_rate_below_minimum')
  if (Number(metrics.deadLetters || 0) > p.maxDeadLetters) blockers.push('dead_letters_present')
  if (Number(metrics.reconciliationRequired || 0) > p.maxReconciliationRequired) blockers.push('reconciliation_required_present')
  if (Number(metrics.inboundAwaitingReview || 0) > p.maxInboundAwaitingReview || Number(metrics.oldestInboundSeconds || 0) > p.maxInboundAgeSeconds) warnings.push('inbound_review_backlog')
  return freeze({ health: blockers.length ? 'fail' : warnings.length ? 'warning' : 'pass', blockers, warnings, metrics: stable(metrics), policy: p })
}

export function buildConveyancerKillSwitch(input = {}) {
  const value = { version: CONVEYANCER_OPERATIONAL_ASSURANCE_VERSION, scope: key(input.scope), organisationId: text(input.organisationId), attorneyFirmId: text(input.attorneyFirmId), profileId: text(input.profileId), direction: key(input.direction) || 'all', enabled: input.enabled === true, reason: text(input.reason), incidentId: text(input.incidentId), expiresAt: iso(input.expiresAt), requestedBy: text(input.requestedBy), requestedAt: iso(input.requestedAt) }
  value.fingerprint = fnv(value); const errors = []
  if (!SCOPES.has(value.scope) || !['all', 'inbound', 'outbound'].includes(value.direction) || !value.reason || !value.requestedBy || !value.requestedAt) errors.push('kill_switch_identity_invalid')
  if (value.scope === 'organisation' && !value.organisationId) errors.push('kill_switch_scope_binding_invalid')
  if (value.scope === 'firm' && (!value.organisationId || !value.attorneyFirmId)) errors.push('kill_switch_scope_binding_invalid')
  if (value.scope === 'profile' && (!value.organisationId || !value.attorneyFirmId || !value.profileId)) errors.push('kill_switch_scope_binding_invalid')
  if (secretMaterial(input).length) errors.push('kill_switch_contains_secret')
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], killSwitch: value })
}

export function buildConveyancerReleaseCandidate(input = {}) {
  const evidence = input.evidence || {}; const candidate = { version: CONVEYANCER_OPERATIONAL_ASSURANCE_VERSION, releaseId: text(input.releaseId), releaseVersion: text(input.releaseVersion), targetEnvironment: key(input.targetEnvironment), rolloutMode: key(input.rolloutMode) || 'pilot', commitSha: text(input.commitSha), migrationFrom: text(input.migrationFrom), migrationTo: text(input.migrationTo), artifactReference: text(input.artifactReference), artifactHash: text(input.artifactHash), rollbackReference: text(input.rollbackReference), rollbackHash: text(input.rollbackHash), pilotTransactionIds: [...new Set((input.pilotTransactionIds || []).map(text).filter(Boolean))].sort(), evidence: { testsReference: text(evidence.testsReference), testsHash: text(evidence.testsHash), securityReference: text(evidence.securityReference), securityHash: text(evidence.securityHash), recoveryReference: text(evidence.recoveryReference), recoveryHash: text(evidence.recoveryHash) }, createdBy: text(input.createdBy), createdAt: iso(input.createdAt) }
  candidate.fingerprint = fnv(candidate); const errors = []
  if (!candidate.releaseId || !candidate.releaseVersion || !['staging', 'production'].includes(candidate.targetEnvironment) || !['pilot', 'live'].includes(candidate.rolloutMode) || !/^[a-f0-9]{7,64}$/i.test(candidate.commitSha) || !candidate.createdBy || !candidate.createdAt) errors.push('release_identity_invalid')
  if (!candidate.artifactReference || !HASH.test(candidate.artifactHash) || !candidate.rollbackReference || !HASH.test(candidate.rollbackHash) || Object.values(candidate.evidence).some((value, index) => index % 2 === 0 ? !value : !HASH.test(value))) errors.push('release_evidence_invalid')
  if (candidate.targetEnvironment === 'production' && candidate.rolloutMode === 'pilot' && !candidate.pilotTransactionIds.length) errors.push('release_pilot_cohort_required')
  if (secretMaterial(input).length) errors.push('release_contains_secret')
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], candidate })
}

export function evaluateConveyancerReleaseGate({ candidate = {}, approvals = [], snapshot = null, activeGlobalKillSwitch = false, asOf = new Date().toISOString(), snapshotFreshnessSeconds = 300 } = {}) {
  const built = buildConveyancerReleaseCandidate(candidate); const blockers = [...built.errors]; const approved = approvals.filter((item) => item.decision === 'approved' && APPROVER_ROLES.has(key(item.role)))
  for (const role of APPROVER_ROLES) if (!approved.some((item) => key(item.role) === role)) blockers.push(`release_${role}_approval_missing`)
  if (new Set(approved.map((item) => text(item.approvedBy))).size < APPROVER_ROLES.size) blockers.push('release_approver_separation_required')
  if (!snapshot || snapshot.health !== 'pass') blockers.push('release_health_snapshot_not_passing')
  if (!snapshot?.capturedAt || new Date(asOf).getTime() - new Date(snapshot.capturedAt).getTime() > snapshotFreshnessSeconds * 1000) blockers.push('release_health_snapshot_stale')
  if (activeGlobalKillSwitch) blockers.push('release_global_kill_switch_active')
  return freeze({ allowed: blockers.length === 0, blockers: [...new Set(blockers)], candidate: built.candidate })
}

function missingP8(error) { return ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code) || /conveyancer_(operational|release|kill_switch|incident)/i.test(error?.message || '') }
export async function persistConveyancerOperationalPolicy(client, input = {}) { const built = buildConveyancerOperationalPolicy(input); if (!built.ok) return freeze({ ok: false, errors: built.errors }); const response = await client.rpc('bridge_set_conveyancer_operational_policy', { payload: built.policy }); if (response?.error) throw response.error; return freeze({ ok: true, data: response.data, policy: built.policy }) }
export async function persistConveyancerKillSwitch(client, input = {}) { const built = buildConveyancerKillSwitch(input); if (!built.ok) return freeze({ ok: false, errors: built.errors }); const response = await client.rpc('bridge_set_conveyancer_provider_kill_switch', { payload: built.killSwitch }); if (response?.error) throw response.error; return freeze({ ok: true, data: response.data, killSwitch: built.killSwitch }) }
export async function createConveyancerReleaseCandidate(client, input = {}) { const built=buildConveyancerReleaseCandidate(input);if(!built.ok)return freeze({ok:false,errors:built.errors});const response=await client.rpc('bridge_create_conveyancer_release_candidate',{payload:built.candidate});if(response?.error)throw response.error;return freeze({ok:true,data:response.data,candidate:built.candidate}) }
export async function approveConveyancerRelease(client,{releaseCandidateId='',role='',decision='',reason=''}={}){if(!releaseCandidateId||!APPROVER_ROLES.has(key(role))||!['approved','rejected'].includes(key(decision))||!text(reason))return freeze({ok:false,errors:['release_approval_invalid']});const response=await client.rpc('bridge_approve_conveyancer_release',{p_release_candidate_id:releaseCandidateId,p_role:key(role),p_decision:key(decision),p_reason:text(reason)});if(response?.error)throw response.error;return freeze({ok:true,data:response.data})}
export async function authoriseConveyancerRelease(client,{releaseCandidateId='',reason=''}={}){if(!releaseCandidateId||!text(reason))return freeze({ok:false,errors:['release_authorisation_invalid']});const response=await client.rpc('bridge_authorise_conveyancer_release',{p_release_candidate_id:releaseCandidateId,p_reason:text(reason)});if(response?.error)throw response.error;return freeze(response?.data||{ok:false})}
export async function recordConveyancerReleaseActivation(client,{authorisationEventId='',deploymentReference='',artifactHash=''}={}){if(!authorisationEventId||!text(deploymentReference)||!HASH.test(text(artifactHash)))return freeze({ok:false,errors:['release_activation_invalid']});const response=await client.rpc('bridge_record_conveyancer_release_activation',{p_authorisation_event_id:authorisationEventId,p_deployment_reference:text(deploymentReference),p_artifact_hash:text(artifactHash)});if(response?.error)throw response.error;return freeze(response?.data||{ok:false})}
export async function rollbackConveyancerRelease(client,{releaseCandidateId='',reason=''}={}){if(!releaseCandidateId||!text(reason))return freeze({ok:false,errors:['release_rollback_invalid']});const response=await client.rpc('bridge_rollback_conveyancer_release',{p_release_candidate_id:releaseCandidateId,p_reason:text(reason)});if(response?.error)throw response.error;return freeze(response?.data||{ok:false})}
export async function persistConveyancerProviderIncident(client,input={}){const payload={version:CONVEYANCER_OPERATIONAL_ASSURANCE_VERSION,incidentId:text(input.incidentId),scope:key(input.scope),organisationId:text(input.organisationId),attorneyFirmId:text(input.attorneyFirmId),profileId:text(input.profileId),severity:key(input.severity),status:key(input.status),title:text(input.title),summary:text(input.summary),ownerUserId:text(input.ownerUserId),startedAt:iso(input.startedAt),resolvedAt:iso(input.resolvedAt),fingerprint:''};payload.fingerprint=fnv(payload);if(!['global','organisation','firm','profile'].includes(payload.scope)||!['sev1','sev2','sev3','sev4'].includes(payload.severity)||!['open','mitigating','monitoring','resolved'].includes(payload.status)||!payload.title||!payload.summary||!payload.ownerUserId||!payload.startedAt)return freeze({ok:false,errors:['provider_incident_invalid']});const response=await client.rpc('bridge_set_conveyancer_provider_incident',{payload});if(response?.error)throw response.error;return freeze({ok:true,data:response.data,incident:payload})}
export async function loadConveyancerOperationalSummary(client, { organisationId = '', attorneyFirmId = '' } = {}) {
  try {
    const [snapshots, alerts, incidents, switches, effectiveGate] = await Promise.all([
      client.from('conveyancer_operational_snapshots').select('health,metrics,captured_at').eq('scope','firm').eq('organisation_id',organisationId).eq('attorney_firm_id',attorneyFirmId).order('captured_at',{ascending:false}).limit(1),
      client.from('conveyancer_operational_alerts').select('status,severity,alert_key').eq('organisation_id',organisationId).eq('attorney_firm_id',attorneyFirmId).eq('status','open').limit(100),
      client.from('conveyancer_provider_incidents').select('status,severity,title,created_at').eq('organisation_id',organisationId).eq('attorney_firm_id',attorneyFirmId).in('status',['open','mitigating','monitoring']).limit(100),
      client.from('conveyancer_provider_kill_switches').select('record_id,revision,enabled,direction,expires_at').eq('organisation_id',organisationId).eq('attorney_firm_id',attorneyFirmId).order('revision',{ascending:false}).limit(100),
      client.rpc('bridge_conveyancer_provider_operation_allowed',{p_organisation_id:organisationId,p_attorney_firm_id:attorneyFirmId,p_profile_id:null,p_direction:'outbound'}),
    ]); const error=snapshots.error||alerts.error||incidents.error||switches.error; if(error) throw error
    const latestSwitches=new Map(); for(const row of switches.data||[]) if(!latestSwitches.has(row.record_id)) latestSwitches.set(row.record_id,row)
    return freeze({available:true,snapshot:snapshots.data?.[0]||null,openAlerts:alerts.data||[],openIncidents:incidents.data||[],killSwitchActive:effectiveGate.error?([...latestSwitches.values()].some((row)=>row.enabled&&(!row.expires_at||new Date(row.expires_at)>new Date()))):effectiveGate.data===false})
  } catch(error){if(missingP8(error)) return freeze({available:false,reason:'p8_not_installed',snapshot:null,openAlerts:[],openIncidents:[],killSwitchActive:false}); throw error}
}
