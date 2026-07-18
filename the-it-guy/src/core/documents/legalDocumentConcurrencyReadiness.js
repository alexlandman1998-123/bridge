export function assessLegalDocumentConcurrencyReadiness({ h4 = {}, targetCount = 0, contractProbes = [], beforeCounts = [], afterCounts = [], latencyP95Ms = null, latencyLimitMs = 3000 } = {}) {
  const reasons = []
  const hasTargets = Number(targetCount) >= 2
  if (h4.status !== 'READY_FOR_I1') reasons.push('I1_H4_NOT_READY')
  if (!hasTargets) reasons.push('I1_CONTROLLED_TARGETS_MISSING')
  if (hasTargets && (!Array.isArray(contractProbes) || contractProbes.length < Number(targetCount) * 4 || contractProbes.some((probe) => probe.contract !== 'i1-v1' || probe.dryRun !== true || !Number.isInteger(probe.nextVersionNumber) || probe.nextVersionNumber < 1))) reasons.push('I1_ATOMIC_VERSION_CONTRACT_INVALID')
  if (hasTargets) {
    const nextByPacket = new Map()
    const expectedByPacket = new Map((beforeCounts || []).map((row) => [row.packetId, Number(row.maxVersionNumber || 0) + 1]))
    for (const probe of contractProbes) {
      const previous = nextByPacket.get(probe.packetId)
      if (previous !== undefined && previous !== probe.nextVersionNumber) reasons.push('I1_CONCURRENT_VERSION_RESERVATION_DRIFT')
      if (expectedByPacket.has(probe.packetId) && expectedByPacket.get(probe.packetId) !== probe.nextVersionNumber) reasons.push('I1_CONCURRENT_VERSION_RESERVATION_DRIFT')
      nextByPacket.set(probe.packetId, probe.nextVersionNumber)
    }
  }
  const beforeByPacket = new Map((beforeCounts || []).map((row) => [row.packetId, row]))
  if (hasTargets && ((beforeCounts || []).length !== Number(targetCount) || (afterCounts || []).length !== Number(targetCount))) reasons.push('I1_STATE_SNAPSHOT_INCOMPLETE')
  if (hasTargets && (afterCounts || []).some((row) => {
    const before = beforeByPacket.get(row.packetId)
    return !before || before.versionCount !== row.versionCount || before.eventCount !== row.eventCount || before.currentVersionNumber !== row.currentVersionNumber
  })) reasons.push('I1_DRY_RUN_MUTATED_DATA')
  if (hasTargets && (!Number.isFinite(Number(latencyP95Ms)) || Number(latencyP95Ms) > Number(latencyLimitMs))) reasons.push('I1_CONCURRENCY_LATENCY_EXCEEDED')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)] }
}
