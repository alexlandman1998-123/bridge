const solutions = {
  I3_I2_NOT_READY: 'Complete I2 frozen-PDF renderer capacity certification before overload testing.',
  I3_CONTROLLED_TARGETS_MISSING: 'Complete the controlled mandate and OTP pair used for backpressure testing.',
  I3_CONTRACT_INVALID: 'Deploy migration 202607180032 with the packet-scoped diagnostic and lease invariants.',
  I3_SINGLE_HOLDER_INVALID: 'Use one packet-scoped lock so exactly one request proceeds and every duplicate is rejected.',
  I3_LEASE_SAFETY_INVALID: 'Restore the packet primary key, expiry index and version-completion cleanup trigger.',
  I3_ACTIVE_LEASE_PRESENT: 'Allow the active generation to finish or its bounded lease to expire before certification.',
  I3_AUTHORITY_INVALID: 'Restrict backpressure diagnostics and lease inspection to the service role.',
  I3_STATE_MUTATED: 'Keep certification transaction-scoped and ensure it cannot insert, renew or delete persistent leases.',
  I3_LATENCY_EXCEEDED: 'Reject duplicate work earlier or reduce lock contention until p95 is within the configured limit.',
}
const blocker = (code, detail) => ({ code, ...(detail ? { detail } : {}), solution: solutions[code] })

export function assessDocumentGeneratorBackpressureBoundary({ i2 = {}, targets = [], concurrencyPerPacket = 0, waves = [], unauthorizedRejected = false, beforeSnapshots = [], afterSnapshots = [], latencyP95Ms = null, latencyLimitMs = 5000 } = {}) {
  const blockers = []
  if (i2.status !== 'READY_FOR_I3' || i2.ready !== true) blockers.push(blocker('I3_I2_NOT_READY'))
  if (!Array.isArray(targets) || targets.length < 2 || !['mandate', 'otp'].every((type) => targets.some((row) => row.packetType === type))) blockers.push(blocker('I3_CONTROLLED_TARGETS_MISSING'))
  if (!Array.isArray(waves) || waves.length < 2 || waves.some((wave) => !Array.isArray(wave.probes) || wave.probes.length < Number(targets?.length || 0) * Number(concurrencyPerPacket) || wave.probes.some((row) => row.contract !== 'i3-generator-v1' || row.mutatedData !== false || row.error))) blockers.push(blocker('I3_CONTRACT_INVALID'))
  for (const wave of waves || []) {
    for (const target of targets || []) {
      const rows = (wave.probes || []).filter((row) => row.packetId === target.packetId)
      if (rows.filter((row) => row.claimed === true).length !== 1 || rows.filter((row) => row.claimed === false && !row.error).length !== Number(concurrencyPerPacket) - 1) blockers.push(blocker('I3_SINGLE_HOLDER_INVALID', `${target.packetType}:wave-${wave.waveNumber}`))
    }
  }
  const diagnostics = (waves || []).flatMap((wave) => wave.probes || [])
  if (diagnostics.some((row) => row.primaryKeyPresent !== true || row.completionTriggerPresent !== true || row.expiryIndexPresent !== true)) blockers.push(blocker('I3_LEASE_SAFETY_INVALID'))
  if (diagnostics.some((row) => Number(row.activeLeaseCount) !== 0)) blockers.push(blocker('I3_ACTIVE_LEASE_PRESENT'))
  if (unauthorizedRejected !== true) blockers.push(blocker('I3_AUTHORITY_INVALID'))
  const before = new Map((beforeSnapshots || []).map((row) => [row.packetId, row.stateDigest]))
  if ((beforeSnapshots || []).length !== Number(targets?.length || 0) || (afterSnapshots || []).length !== Number(targets?.length || 0) || (afterSnapshots || []).some((row) => !before.has(row.packetId) || before.get(row.packetId) !== row.stateDigest)) blockers.push(blocker('I3_STATE_MUTATED'))
  if (!Number.isFinite(Number(latencyP95Ms)) || Number(latencyP95Ms) > Number(latencyLimitMs)) blockers.push(blocker('I3_LATENCY_EXCEEDED', `${latencyP95Ms}ms > ${latencyLimitMs}ms`))
  const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
  return { ready: unique.length === 0, blockers: unique }
}
