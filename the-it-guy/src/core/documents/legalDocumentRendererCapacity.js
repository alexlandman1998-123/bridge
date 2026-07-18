export function assessLegalDocumentRendererCapacity({ i1 = {}, targetCount = 0, probes = [], unauthorizedProbes = [], beforeState = [], afterState = [], latencyP95Ms = null, latencyLimitMs = 30000, concurrencyPerType = 4 } = {}) {
  const reasons = []
  const hasTargets = Number(targetCount) >= 2
  if (i1.status !== 'READY_FOR_I2') reasons.push('I2_I1_NOT_READY')
  if (!hasTargets) reasons.push('I2_CONTROLLED_TARGETS_MISSING')
  if (hasTargets && (!Array.isArray(probes) || probes.length < Number(targetCount) * Number(concurrencyPerType) || probes.some((probe) => probe.contract !== 'i2-v1' || probe.capacityProbe !== true || probe.mutatedData !== false || !/^sha256:[0-9a-f]{64}$/.test(probe.sha256 || '') || Number(probe.byteLength) < 100))) reasons.push('I2_RENDERER_CAPACITY_CONTRACT_INVALID')
  if (hasTargets) {
    for (const packetType of ['otp', 'mandate']) {
      const typeProbes = probes.filter((probe) => probe.packetType === packetType)
      if (typeProbes.length < Number(concurrencyPerType) || new Set(typeProbes.map((probe) => probe.sha256)).size !== 1) reasons.push('I2_CONCURRENT_RENDER_ISOLATION_INVALID')
    }
  }
  if (hasTargets && (!Array.isArray(unauthorizedProbes) || unauthorizedProbes.length < 2 || unauthorizedProbes.some((probe) => probe.rejected !== true))) reasons.push('I2_CAPACITY_PROBE_AUTHORITY_INVALID')
  const beforeByPacket = new Map((beforeState || []).map((row) => [row.packetId, row]))
  if (hasTargets && ((beforeState || []).length !== Number(targetCount) || (afterState || []).length !== Number(targetCount))) reasons.push('I2_STATE_SNAPSHOT_INCOMPLETE')
  if (hasTargets && (afterState || []).some((after) => {
    const before = beforeByPacket.get(after.packetId)
    return !before || ['currentVersionNumber', 'versionCount', 'eventCount', 'documentCount', 'storageObjectCount'].some((key) => before[key] !== after[key])
  })) reasons.push('I2_CAPACITY_PROBE_MUTATED_DATA')
  if (hasTargets && (!Number.isFinite(Number(latencyP95Ms)) || Number(latencyP95Ms) > Number(latencyLimitMs))) reasons.push('I2_RENDER_LATENCY_EXCEEDED')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)] }
}
