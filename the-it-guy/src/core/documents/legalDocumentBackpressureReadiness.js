export function assessLegalDocumentBackpressureReadiness({ i2 = {}, targetCount = 0, waves = [], unauthorizedRejected = false, beforeLeaseCounts = [], afterLeaseCounts = [], latencyP95Ms = null, latencyLimitMs = 5000 } = {}) {
  const reasons = []
  const hasTargets = Number(targetCount) >= 2
  if (i2.status !== 'READY_FOR_I3') reasons.push('I3_I2_NOT_READY')
  if (!hasTargets) reasons.push('I3_CONTROLLED_TARGETS_MISSING')
  if (hasTargets && (!Array.isArray(waves) || waves.length < 2 || waves.some((wave) => wave.contractValid !== true || wave.packetResults?.length !== Number(targetCount) || wave.packetResults.some((result) => result.claimedCount !== 1 || result.rejectedCount < 1)))) reasons.push('I3_BACKPRESSURE_CONTRACT_INVALID')
  if (hasTargets && unauthorizedRejected !== true) reasons.push('I3_BACKPRESSURE_AUTHORITY_INVALID')
  const before = new Map((beforeLeaseCounts || []).map((row) => [row.packetId, row.count]))
  if (hasTargets && ((beforeLeaseCounts || []).length !== Number(targetCount) || (afterLeaseCounts || []).length !== Number(targetCount))) reasons.push('I3_LEASE_SNAPSHOT_INCOMPLETE')
  if (hasTargets && (afterLeaseCounts || []).some((row) => before.get(row.packetId) !== row.count)) reasons.push('I3_PROBE_LEASE_STATE_MUTATED')
  if (hasTargets && (!Number.isFinite(Number(latencyP95Ms)) || Number(latencyP95Ms) > Number(latencyLimitMs))) reasons.push('I3_BACKPRESSURE_LATENCY_EXCEEDED')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)] }
}
