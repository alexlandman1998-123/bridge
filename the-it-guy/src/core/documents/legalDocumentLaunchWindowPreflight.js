const MAX_RUNTIME_EVIDENCE_AGE_MINUTES = 5

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

export function assessLegalDocumentLaunchWindowPreflight({ m3 = {}, claim = null, activation = {}, pilot = {}, rollbackReady = false, now = Date.now(), maxRuntimeEvidenceAgeMinutes = MAX_RUNTIME_EVIDENCE_AGE_MINUTES } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  const claimTarget = claim?.releaseTarget || {}
  const activationIds = ids(activation.organisationIds)
  const claimIds = ids(claimTarget.organisationIds)
  const pilotIds = ids(pilot.organisationIds)
  const activatedIds = ids(pilot.activation?.activatedOrganisationIds)

  if (m3.status !== 'READY_FOR_M4' || m3.ready !== true) push('N1_M3_NOT_READY', 'Resolve M3 and establish a valid one-time release claim before opening a launch window.')
  if (!claim || claim.status !== 'claimed') push('N1_RELEASE_CLAIM_MISSING', 'Create and verify the M3 claim for this exact rollout attempt.')
  if (activation.status !== 'HEALTHY') push('N1_RUNTIME_ACTIVATION_UNHEALTHY', 'Restore A3 runtime activation health before opening the launch window.')
  if (activation.secretDigestsVerified !== true) push('N1_RUNTIME_SECRET_MISMATCH', 'Make the runtime pilot enablement and organisation secret digests match the approved repository state.')
  if (activation.releaseStatus !== 'GO') push('N1_RELEASE_GATE_NOT_GO', 'Resolve the complete release gate until A3 reports releaseStatus GO.')
  if (!normalize(claimTarget.projectRef) || normalize(claimTarget.projectRef) !== normalize(activation.projectRef) || normalize(claimTarget.projectRef) !== normalize(pilot.activation?.targetProjectRef)) push('N1_PROJECT_TARGET_MISMATCH', 'Make the M3 claim, A3 runtime project, and governed activation project identical.')
  if (!claimIds.length || claimIds.join(',') !== activationIds.join(',') || claimIds.join(',') !== pilotIds.join(',') || claimIds.join(',') !== activatedIds.join(',')) push('N1_COHORT_TARGET_MISMATCH', 'Make the claimed, configured, activated, and runtime organisation cohorts identical and non-empty.')
  if (!normalize(claimTarget.environment) || normalize(claimTarget.environment).toLowerCase() !== normalize(pilot.environment).toLowerCase()) push('N1_ENVIRONMENT_TARGET_MISMATCH', 'Make the claimed release environment match the governed pilot environment.')
  if (pilot.enabled !== true || pilot.activation?.status !== 'active') push('N1_PILOT_STATE_INACTIVE', 'Complete guarded A3 activation before opening the launch window.')
  if (!rollbackReady || !pilot.rollback?.strategy) push('N1_ROLLBACK_CONTROL_UNAVAILABLE', 'Restore and verify the explicit rollback/deactivation control before rollout.')
  const checkedAt = Date.parse(activation.checkedAt || '')
  if (!Number.isFinite(checkedAt) || checkedAt > now + 60_000 || now - checkedAt > maxRuntimeEvidenceAgeMinutes * 60_000) push('N1_RUNTIME_EVIDENCE_STALE', 'Rerun N1 so runtime activation evidence is no older than five minutes.')
  if (m3.mutatedData !== false || activation.mutatedData !== false) push('N1_NON_READ_ONLY_EVIDENCE', 'Restore read-only M3 and A3 verification evidence before opening the launch window.')

  return {
    ready: blockers.length === 0,
    blockers,
    launchTarget: { environment: normalize(claimTarget.environment).toLowerCase() || null, projectRef: normalize(claimTarget.projectRef) || null, organisationIds: claimIds },
    runtimeEvidenceAgeLimitMinutes: maxRuntimeEvidenceAgeMinutes,
  }
}

export { MAX_RUNTIME_EVIDENCE_AGE_MINUTES as LEGAL_DOCUMENT_N1_MAX_RUNTIME_EVIDENCE_AGE_MINUTES }
