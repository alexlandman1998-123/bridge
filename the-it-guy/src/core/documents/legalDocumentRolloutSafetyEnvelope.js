const MIN_CLAIM_REMAINING_MINUTES = 2

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

export function assessLegalDocumentRolloutSafetyEnvelope({ n1 = {}, claim = null, pilot = {}, controls = {}, now = Date.now(), minimumClaimRemainingMinutes = MIN_CLAIM_REMAINING_MINUTES } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  const targetIds = ids(n1.launchTarget?.organisationIds)
  const claimIds = ids(claim?.releaseTarget?.organisationIds)
  const maximumOrganisations = Number(pilot.limits?.maxOrganisations)
  const maxFailures = Number(pilot.limits?.maxGenerationFailures24h)
  const maxStale = Number(pilot.limits?.maxStaleSigningPackets)
  const staleHours = Number(pilot.limits?.staleSigningHours)
  const expiresAt = Date.parse(claim?.expiresAt || '')
  const remainingMinutes = Number.isFinite(expiresAt) ? Math.floor((expiresAt - now) / 60_000) : null

  if (n1.status !== 'READY_FOR_N2' || n1.ready !== true) push('N2_N1_NOT_READY', 'Resolve the N1 launch-window preflight before constructing the rollout safety envelope.')
  if (!claim || claim.status !== 'claimed') push('N2_RELEASE_CLAIM_MISSING', 'Restore the valid one-time M3 claim before rollout.')
  if (!targetIds.length || targetIds.join(',') !== claimIds.join(',')) push('N2_CLAIM_TARGET_MISMATCH', 'Make the N1 launch target and M3 claim cohort identical and non-empty.')
  if (!Number.isInteger(maximumOrganisations) || maximumOrganisations < 1 || maximumOrganisations > 5) push('N2_BLAST_RADIUS_LIMIT_INVALID', 'Set maxOrganisations to an explicit controlled value between one and five.')
  else if (targetIds.length > maximumOrganisations) push('N2_COHORT_EXCEEDS_BLAST_RADIUS', 'Reduce the claimed cohort to the configured maximum before rollout.')
  if (maxFailures !== 0) push('N2_FAILURE_STOP_NOT_ZERO', 'Set maxGenerationFailures24h to zero for the initial controlled rollout.')
  if (maxStale !== 0) push('N2_STALE_SIGNING_STOP_NOT_ZERO', 'Set maxStaleSigningPackets to zero for the initial controlled rollout.')
  if (!Number.isFinite(staleHours) || staleHours <= 0 || staleHours > 2) push('N2_STALE_SIGNING_WINDOW_INVALID', 'Set staleSigningHours to a positive value no greater than two hours.')
  if (controls.monitoringReady !== true) push('N2_MONITORING_CONTROL_UNAVAILABLE', 'Restore the release monitor, watchdog, and reconciliation controls before rollout.')
  if (controls.rollbackReady !== true || pilot.rollback?.requiresExplicitTemplateIds !== true) push('N2_ROLLBACK_CONTROL_UNAVAILABLE', 'Restore explicit-template rollback and guarded deactivation before rollout.')
  if (!Number.isFinite(expiresAt) || remainingMinutes < minimumClaimRemainingMinutes) push('N2_CLAIM_WINDOW_TOO_SHORT', 'Rebuild and claim fresh authority with at least two whole minutes remaining.')
  if (n1.mutatedData !== false) push('N2_NON_READ_ONLY_PREFLIGHT', 'Restore read-only N1 evidence before constructing the safety envelope.')

  const stopConditions = [
    { code: 'generation_failure', threshold: maxFailures, action: 'halt_and_deactivate' },
    { code: 'stale_signing_packet', threshold: maxStale, windowHours: staleHours, action: 'halt_and_deactivate' },
    { code: 'target_drift', threshold: 0, action: 'halt_and_deactivate' },
    { code: 'monitor_unavailable', threshold: 0, action: 'halt_and_deactivate' },
  ]
  return {
    ready: blockers.length === 0,
    blockers,
    envelope: {
      target: { environment: normalize(n1.launchTarget?.environment).toLowerCase() || null, projectRef: normalize(n1.launchTarget?.projectRef) || null, organisationIds: targetIds },
      maximumOrganisations: Number.isInteger(maximumOrganisations) ? maximumOrganisations : null,
      requiredCanaries: ['otp', 'mandate'],
      canaryPolicy: 'one_success_each_before_cohort_continuation',
      stopConditions,
      claimExpiresAt: claim?.expiresAt || null,
      claimRemainingMinutes: remainingMinutes,
    },
    minimumClaimRemainingMinutes,
  }
}

export { MIN_CLAIM_REMAINING_MINUTES as LEGAL_DOCUMENT_N2_MIN_CLAIM_REMAINING_MINUTES }
