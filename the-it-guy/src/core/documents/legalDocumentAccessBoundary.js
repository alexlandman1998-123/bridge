export function assessLegalDocumentAccessBoundary({ g4 = {}, targetCount = 0, unrelatedMembershipCount = 0, tableProbes = [], storageProbes = [], functionProbes = {} } = {}) {
  const reasons = []
  if (g4.status !== 'READY_FOR_H1') reasons.push('H1_G4_NOT_READY')
  const hasTargets = Number(targetCount) >= 2
  if (!hasTargets) reasons.push('H1_CONTROLLED_TARGETS_MISSING')
  if (hasTargets && Number(unrelatedMembershipCount) !== 0) reasons.push('H1_UNRELATED_ACTOR_NOT_ISOLATED')
  if (hasTargets && (!Array.isArray(tableProbes) || !tableProbes.length || tableProbes.some((probe) => probe.protected !== true))) reasons.push('H1_CROSS_TENANT_TABLE_ACCESS_EXPOSED')
  if (hasTargets && (!Array.isArray(storageProbes) || storageProbes.length < 2 || storageProbes.some((probe) => probe.protected !== true))) reasons.push('H1_CROSS_TENANT_STORAGE_ACCESS_EXPOSED')
  if (!functionProbes.mandateFinalizerContract || !functionProbes.otpFinalizerContract || !functionProbes.dispatcherRejected || !functionProbes.watchdogRejected) reasons.push('H1_EDGE_AUTHORITY_BOUNDARY_INVALID')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)] }
}
