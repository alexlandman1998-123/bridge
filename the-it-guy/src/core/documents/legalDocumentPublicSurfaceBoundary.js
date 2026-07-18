export function assessLegalDocumentPublicSurfaceBoundary({ h3 = {}, targetCount = 0, tableProbes = [], storageProbes = [], publicUrlProbes = [], functionProbes = {} } = {}) {
  const reasons = []
  const hasTargets = Number(targetCount) >= 2
  if (h3.status !== 'READY_FOR_H4') reasons.push('H4_H3_NOT_READY')
  if (!hasTargets) reasons.push('H4_CONTROLLED_TARGETS_MISSING')
  if (hasTargets && (!Array.isArray(tableProbes) || !tableProbes.length || tableProbes.some((probe) => probe.protected !== true))) reasons.push('H4_ANONYMOUS_ROW_ACCESS_EXPOSED')
  if (hasTargets && (!Array.isArray(storageProbes) || storageProbes.length < 2 || storageProbes.some((probe) => probe.protected !== true))) reasons.push('H4_ANONYMOUS_STORAGE_ACCESS_EXPOSED')
  if (hasTargets && (!Array.isArray(publicUrlProbes) || publicUrlProbes.length !== Number(targetCount) || publicUrlProbes.some((probe) => probe.protected !== true))) reasons.push('H4_PERSISTED_PUBLIC_URL_EXPOSED')
  if (hasTargets && (!functionProbes.mandateFinalizerRejected || !functionProbes.otpFinalizerRejected || !functionProbes.dispatcherRejected || !functionProbes.watchdogRejected)) reasons.push('H4_ANONYMOUS_OPERATION_ACCESS_EXPOSED')
  if (hasTargets && (!functionProbes.fakeTokenResolveRejected || !functionProbes.fakeTokenActionRejected || !functionProbes.fakeTokenResponsesSanitised)) reasons.push('H4_PUBLIC_SIGNER_TOKEN_BOUNDARY_INVALID')
  return { ready: reasons.length === 0, reasons }
}
