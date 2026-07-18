export function assessLegalDocumentAuthorityContinuity({ h2 = {}, targetCount = 0, targetOrganisationCount = 0, authorisedActorAvailable = false, revokedActorAvailable = false, authorisedTargetCount = 0, authorisedPolicyProbes = [], authorisedTableProbes = [], authorisedFunctionProbes = {}, revokedMembershipOrganisationCount = 0, revokedActiveMembershipCount = 0, revokedPolicyProbes = [], revokedTableProbes = [], revokedFunctionProbes = {} } = {}) {
  const reasons = []
  const hasTargets = Number(targetCount) >= 2
  if (h2.status !== 'READY_FOR_H3') reasons.push('H3_H2_NOT_READY')
  if (!hasTargets) reasons.push('H3_CONTROLLED_TARGETS_MISSING')
  const authorisedReady = hasTargets && authorisedActorAvailable
  if (authorisedReady && Number(authorisedTargetCount) !== Number(targetCount)) reasons.push('H3_AUTHORISED_ACTOR_INVALID')
  if (authorisedReady && (!Array.isArray(authorisedPolicyProbes) || authorisedPolicyProbes.length !== Number(targetCount) || authorisedPolicyProbes.some((probe) => probe.allowed !== true))) reasons.push('H3_AUTHORISED_POLICY_PATH_BROKEN')
  if (authorisedReady && (!Array.isArray(authorisedTableProbes) || !authorisedTableProbes.length || authorisedTableProbes.some((probe) => probe.complete !== true))) reasons.push('H3_AUTHORISED_READ_PATH_BROKEN')
  if (authorisedReady && (!authorisedFunctionProbes.mandateAccepted || !authorisedFunctionProbes.otpAccepted)) reasons.push('H3_AUTHORISED_FINALISER_PATH_BROKEN')
  const revokedReady = hasTargets && revokedActorAvailable && Number(revokedMembershipOrganisationCount) === Number(targetOrganisationCount) && Number(revokedActiveMembershipCount) === 0
  if (hasTargets && revokedActorAvailable && Number(revokedMembershipOrganisationCount) !== Number(targetOrganisationCount)) reasons.push('H3_REVOKED_ACTOR_MEMBERSHIP_MISSING')
  if (hasTargets && revokedActorAvailable && Number(revokedActiveMembershipCount) !== 0) reasons.push('H3_REVOKED_ACTOR_STILL_ACTIVE')
  if (revokedReady && (!Array.isArray(revokedPolicyProbes) || revokedPolicyProbes.length !== Number(targetCount) || revokedPolicyProbes.some((probe) => probe.allowed !== false))) reasons.push('H3_REVOKED_POLICY_ACCESS_EXPOSED')
  if (revokedReady && (!Array.isArray(revokedTableProbes) || !revokedTableProbes.length || revokedTableProbes.some((probe) => probe.protected !== true))) reasons.push('H3_REVOKED_ROW_ACCESS_EXPOSED')
  if (revokedReady && (!revokedFunctionProbes.mandateRejected || !revokedFunctionProbes.otpRejected)) reasons.push('H3_REVOKED_FINALISER_ACCESS_EXPOSED')
  return { ready: reasons.length === 0, reasons }
}
