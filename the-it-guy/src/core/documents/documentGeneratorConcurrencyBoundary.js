const solutions = {
  I1_H4_NOT_READY: 'Complete H4 public-surface certification before concurrency testing.',
  I1_CONTROLLED_TARGETS_MISSING: 'Complete the controlled mandate and OTP pair used by I1.',
  I1_ATOMIC_CONTRACT_INVALID: 'Deploy the atomic packet-version RPC and return one stable next version from every concurrent dry run.',
  I1_LINEAGE_CONTRACT_INVALID: 'Deploy migration 202607180028 with the unique index, insert guard and read-only lineage probe.',
  I1_CURRENT_POINTER_DRIFT: 'Reconcile the packet current-version pointer to the highest persisted version before rollout.',
  I1_VERSION_LINEAGE_CORRUPT: 'Remove duplicate version numbers and repair orphaned version events before enabling generation.',
  I1_CONCURRENT_RESERVATION_DRIFT: 'Keep next-version calculation under the packet row lock so concurrent callers receive one answer.',
  I1_STATE_MUTATED: 'Repair the dry-run path; packet, version, event and editable-state digests must remain unchanged.',
  I1_LATENCY_EXCEEDED: 'Reduce packet-lock contention until concurrent reservation p95 is within the configured limit.',
}
const blocker = (code, detail) => ({ code, ...(detail ? { detail } : {}), solution: solutions[code] })

export function assessDocumentGeneratorConcurrencyBoundary({ h4 = {}, targetCount = 0, concurrencyPerPacket = 0, atomicProbes = [], lineageProbes = [], beforeSnapshots = [], afterSnapshots = [], latencyP95Ms = null, latencyLimitMs = 3000 } = {}) {
  const blockers = []
  if (h4.status !== 'READY_FOR_I1' || h4.ready !== true) blockers.push(blocker('I1_H4_NOT_READY'))
  if (Number(targetCount) < 2) blockers.push(blocker('I1_CONTROLLED_TARGETS_MISSING'))
  const atomics = Array.isArray(atomicProbes) ? atomicProbes : []
  if (atomics.length < Number(targetCount) * Number(concurrencyPerPacket) || atomics.some((row) => row.contract !== 'i1-v1' || row.dryRun !== true || !Number.isInteger(Number(row.nextVersionNumber)) || Number(row.nextVersionNumber) < 1 || row.error)) blockers.push(blocker('I1_ATOMIC_CONTRACT_INVALID'))
  const lineage = Array.isArray(lineageProbes) ? lineageProbes : []
  if (lineage.length < Number(targetCount) * Number(concurrencyPerPacket) || lineage.some((row) => row.contract !== 'i1-generator-v1' || row.mutatedData !== false || row.uniqueIndexPresent !== true || row.insertGuardPresent !== true)) blockers.push(blocker('I1_LINEAGE_CONTRACT_INVALID'))
  if (lineage.some((row) => row.currentPointerMatchesMax !== true)) blockers.push(blocker('I1_CURRENT_POINTER_DRIFT'))
  if (lineage.some((row) => Number(row.duplicateVersionNumberCount) !== 0 || Number(row.versionCreatedEventMismatchCount) !== 0 || Number(row.orphanVersionEventCount) !== 0)) blockers.push(blocker('I1_VERSION_LINEAGE_CORRUPT'))
  const expected = new Map((beforeSnapshots || []).map((row) => [row.packetId, Number(row.maxVersionNumber) + 1]))
  for (const packetId of expected.keys()) {
    const values = [...atomics, ...lineage].filter((row) => row.packetId === packetId).map((row) => Number(row.nextVersionNumber))
    if (!values.length || values.some((value) => value !== expected.get(packetId))) blockers.push(blocker('I1_CONCURRENT_RESERVATION_DRIFT', packetId))
  }
  const before = new Map((beforeSnapshots || []).map((row) => [row.packetId, row.stateDigest]))
  if ((beforeSnapshots || []).length !== Number(targetCount) || (afterSnapshots || []).length !== Number(targetCount) || (afterSnapshots || []).some((row) => !before.has(row.packetId) || before.get(row.packetId) !== row.stateDigest)) blockers.push(blocker('I1_STATE_MUTATED'))
  if (!Number.isFinite(Number(latencyP95Ms)) || Number(latencyP95Ms) > Number(latencyLimitMs)) blockers.push(blocker('I1_LATENCY_EXCEEDED', `${latencyP95Ms}ms > ${latencyLimitMs}ms`))
  const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
  return { ready: unique.length === 0, blockers: unique }
}
