const MIN_CLAIM_REMAINING_MINUTES = 2

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

export function assessLegalDocumentExpandedRolloutSafetyEnvelope({ s1 = {}, claim = null, activation = null, pilot = {}, controls = {}, now = Date.now(), minimumClaimRemainingMinutes = MIN_CLAIM_REMAINING_MINUTES } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  const targetIds = ids(s1.launchTarget?.organisationIds)
  const claimIds = ids(claim?.releaseTarget?.organisationIds)
  const activatedIds = ids(activation?.activatedOrganisationIds)
  const previousIds = ids(activation?.previousOrganisationIds)
  const added = normalize(activation?.addedOrganisationId)
  const maximumOrganisations = Number(pilot.limits?.maxOrganisations)
  const maxFailures = Number(pilot.limits?.maxGenerationFailures24h)
  const maxStale = Number(pilot.limits?.maxStaleSigningPackets)
  const staleHours = Number(pilot.limits?.staleSigningHours)
  const expiresAt = Date.parse(claim?.expiresAt || '')
  const remainingMinutes = Number.isFinite(expiresAt) ? Math.floor((expiresAt - now) / 60_000) : null

  if (s1.status !== 'READY_FOR_S2' || s1.ready !== true) push('S2_S1_NOT_READY', 'Implement and complete the S1 expanded launch-window preflight before constructing the safety envelope.')
  if (!claim || claim.status !== 'claimed') push('S2_RELEASE_CLAIM_MISSING', 'Restore the valid one-time R3 expanded-cohort claim before rollout.')
  if (!activation || activation.status !== 'activated' || !normalize(activation.activationDigest)) push('S2_ACTIVATION_RECORD_MISSING', 'Restore the exact Q2 expanded-cohort activation receipt.')
  if (!targetIds.length || targetIds.join(',') !== claimIds.join(',') || targetIds.join(',') !== activatedIds.join(',')) push('S2_CLAIM_TARGET_MISMATCH', 'Make the S1 launch target, R3 claim, and Q2 activated cohort identical and non-empty.')
  if (!added || previousIds.includes(added) || activatedIds.length !== previousIds.length + 1 || !activatedIds.includes(added) || previousIds.some((id) => !activatedIds.includes(id))) push('S2_EXPANSION_TRANCHE_INVALID', 'Limit this rollout envelope to the exact single organisation added by Q2.')
  if (!normalize(claim?.sourceActivationDigest) || claim.sourceActivationDigest !== activation?.activationDigest) push('S2_ACTIVATION_BINDING_INVALID', 'Bind the R3 claim and S2 envelope to the exact same Q2 activation digest.')
  if (!Number.isInteger(maximumOrganisations) || maximumOrganisations < 1 || maximumOrganisations > 5) push('S2_BLAST_RADIUS_LIMIT_INVALID', 'Set maxOrganisations to an explicit controlled value between one and five.')
  else if (targetIds.length > maximumOrganisations) push('S2_COHORT_EXCEEDS_BLAST_RADIUS', 'Reduce the activated cohort to the configured maximum before rollout.')
  if (maxFailures !== 0) push('S2_FAILURE_STOP_NOT_ZERO', 'Set maxGenerationFailures24h to zero for expanded-cohort canaries.')
  if (maxStale !== 0) push('S2_STALE_SIGNING_STOP_NOT_ZERO', 'Set maxStaleSigningPackets to zero for expanded-cohort canaries.')
  if (!Number.isFinite(staleHours) || staleHours <= 0 || staleHours > 2) push('S2_STALE_SIGNING_WINDOW_INVALID', 'Set staleSigningHours to a positive value no greater than two hours.')
  if (controls.monitoringReady !== true) push('S2_MONITORING_CONTROL_UNAVAILABLE', 'Restore the release monitor, watchdog, and reconciliation controls before expanded rollout.')
  if (controls.rollbackReady !== true || pilot.rollback?.requiresExplicitTemplateIds !== true) push('S2_ROLLBACK_CONTROL_UNAVAILABLE', 'Restore explicit-template rollback and guarded deactivation before expanded rollout.')
  if (!Number.isFinite(expiresAt) || remainingMinutes < minimumClaimRemainingMinutes) push('S2_CLAIM_WINDOW_TOO_SHORT', 'Rebuild and claim fresh expanded authority with at least two whole minutes remaining.')
  if (s1.mutatedData !== false) push('S2_NON_READ_ONLY_PREFLIGHT', 'Restore read-only S1 evidence before constructing the safety envelope.')

  const stopConditions = [
    { code: 'added_organisation_generation_failure', threshold: maxFailures, organisationId: added || null, action: 'halt_and_deactivate' },
    { code: 'stale_signing_packet', threshold: maxStale, windowHours: staleHours, action: 'halt_and_deactivate' },
    { code: 'target_drift', threshold: 0, action: 'halt_and_deactivate' },
    { code: 'monitor_unavailable', threshold: 0, action: 'halt_and_deactivate' },
  ]
  return {
    ready: blockers.length === 0,
    blockers,
    envelope: {
      target: { environment: normalize(s1.launchTarget?.environment).toLowerCase() || null, projectRef: normalize(s1.launchTarget?.projectRef) || null, organisationIds: targetIds },
      sourceActivationDigest: normalize(activation?.activationDigest) || null,
      previousOrganisationIds: previousIds,
      addedOrganisationId: added || null,
      maximumOrganisations: Number.isInteger(maximumOrganisations) ? maximumOrganisations : null,
      requiredCanaries: ['otp', 'mandate'],
      canaryOrganisationId: added || null,
      canaryPolicy: 'one_success_each_for_added_organisation_before_expanded_cohort_continuation',
      stopConditions,
      claimExpiresAt: claim?.expiresAt || null,
      claimRemainingMinutes: remainingMinutes,
    },
    minimumClaimRemainingMinutes,
  }
}

export { MIN_CLAIM_REMAINING_MINUTES as LEGAL_DOCUMENT_S2_MIN_CLAIM_REMAINING_MINUTES }
