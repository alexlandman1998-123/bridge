const solutions = {
  I4_I3_NOT_READY: 'Complete I3 packet-scoped backpressure before certifying attempt visibility.',
  I4_CONTROLLED_TARGETS_MISSING: 'Complete the controlled mandate and OTP pair used by the generation status check.',
  I4_STATUS_CONTRACT_INVALID: 'Deploy migration 202607180033 and restore the authorised i4-generator-v1 status contract.',
  I4_ACTIVE_ATTEMPT_PRESENT: 'Allow the controlled generation to complete or its bounded lease to expire, then rerun I4.',
  I4_RETRY_SEMANTICS_INVALID: 'Return a non-negative retry delay and mark idle or expired attempts safe to retry.',
  I4_INTERNAL_IDENTIFIER_EXPOSED: 'Remove generation attempt IDs and lease-owner identifiers from the status response.',
  I4_AUTHORITY_INVALID: 'Restrict generation status to packet-authorised users and the service diagnostics role.',
  I4_RETRY_GUIDANCE_MISSING: 'Attach safe status, retry delay and expiry guidance to duplicate-generation errors.',
  I4_STATE_MUTATED: 'Keep I4 status inspection read-only across packet, version, event, document and lease state.',
  I4_LATENCY_EXCEEDED: 'Reduce status-query latency until p95 is within the configured limit.',
}
const blocker = (code, detail) => ({ code, ...(detail ? { detail } : {}), solution: solutions[code] })

export function assessDocumentGeneratorAttemptObservabilityBoundary({ i3 = {}, targets = [], probes = [], probesPerPacket = 0, unauthorizedRejected = false, retryGuidanceCovered = false, internalIdentifierExposed = false, beforeSnapshots = [], afterSnapshots = [], latencyP95Ms = null, latencyLimitMs = 2000 } = {}) {
  const blockers = []
  if (i3.status !== 'READY_FOR_I4' || i3.ready !== true) blockers.push(blocker('I4_I3_NOT_READY'))
  if (!Array.isArray(targets) || targets.length < 2 || !['mandate', 'otp'].every((type) => targets.some((row) => row.packetType === type))) blockers.push(blocker('I4_CONTROLLED_TARGETS_MISSING'))
  const expected = Number(targets?.length || 0) * Number(probesPerPacket)
  if (!Array.isArray(probes) || probes.length < expected || probes.some((row) => row.contract !== 'i4-generator-v1' || row.internalIdentifiersExcluded !== true || row.completionTriggerPresent !== true || row.mutatedData !== false || row.error)) blockers.push(blocker('I4_STATUS_CONTRACT_INVALID'))
  if ((probes || []).some((row) => row.active === true || row.generationStatus === 'active')) blockers.push(blocker('I4_ACTIVE_ATTEMPT_PRESENT'))
  if ((probes || []).some((row) => !['idle', 'expired'].includes(row.generationStatus) || row.safeToRetry !== true || Number(row.retryAfterSeconds) !== 0)) blockers.push(blocker('I4_RETRY_SEMANTICS_INVALID'))
  if (internalIdentifierExposed === true) blockers.push(blocker('I4_INTERNAL_IDENTIFIER_EXPOSED'))
  if (unauthorizedRejected !== true) blockers.push(blocker('I4_AUTHORITY_INVALID'))
  if (retryGuidanceCovered !== true) blockers.push(blocker('I4_RETRY_GUIDANCE_MISSING'))
  const before = new Map((beforeSnapshots || []).map((row) => [row.packetId, row.stateDigest]))
  if ((beforeSnapshots || []).length !== Number(targets?.length || 0) || (afterSnapshots || []).length !== Number(targets?.length || 0) || (afterSnapshots || []).some((row) => !before.has(row.packetId) || before.get(row.packetId) !== row.stateDigest)) blockers.push(blocker('I4_STATE_MUTATED'))
  if (!Number.isFinite(Number(latencyP95Ms)) || Number(latencyP95Ms) > Number(latencyLimitMs)) blockers.push(blocker('I4_LATENCY_EXCEEDED', `${latencyP95Ms}ms > ${latencyLimitMs}ms`))
  const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
  return { ready: unique.length === 0, blockers: unique }
}
