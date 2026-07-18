export function assessLegalDocumentLeastPrivilegeBoundary({ h1 = {}, targetCount = 0, targetOrganisationCount = 0, actorMembershipOrganisationCount = 0, actorAuthorizedTargetCount = 0, policyProbes = [], tableProbes = [], storageProbes = [], functionProbes = {} } = {}) {
  const reasons = []
  const hasTargets = Number(targetCount) >= 2 && Number(targetOrganisationCount) >= 1
  if (h1.status !== 'READY_FOR_H2') reasons.push('H2_H1_NOT_READY')
  if (!hasTargets) reasons.push('H2_CONTROLLED_TARGETS_MISSING')
  if (hasTargets && Number(actorMembershipOrganisationCount) !== Number(targetOrganisationCount)) reasons.push('H2_ACTOR_MEMBERSHIP_INVALID')
  if (hasTargets && Number(actorAuthorizedTargetCount) !== 0) reasons.push('H2_ACTOR_HAS_PACKET_AUTHORITY')
  if (hasTargets && (!Array.isArray(policyProbes) || policyProbes.length !== Number(targetCount) || policyProbes.some((probe) => probe.allowed !== false))) reasons.push('H2_POLICY_CONTRACT_INVALID')
  if (hasTargets && (!Array.isArray(tableProbes) || !tableProbes.length || tableProbes.some((probe) => probe.protected !== true))) reasons.push('H2_SAME_TENANT_ROW_ACCESS_EXPOSED')
  if (hasTargets && (!Array.isArray(storageProbes) || storageProbes.length < 2 || storageProbes.some((probe) => probe.protected !== true))) reasons.push('H2_SAME_TENANT_STORAGE_ACCESS_EXPOSED')
  const actorReady = hasTargets && Number(actorMembershipOrganisationCount) === Number(targetOrganisationCount) && Number(actorAuthorizedTargetCount) === 0
  if (actorReady && (!functionProbes.mandateFinalizerRejected || !functionProbes.otpFinalizerRejected || !functionProbes.dispatcherRejected)) reasons.push('H2_OPERATION_AUTHORITY_INVALID')
  return { ready: reasons.length === 0, reasons }
}
