const solutions = {
  I5_I4_NOT_READY: 'Complete I4 generation-attempt observability before renderer fencing.',
  I5_CONTROLLED_TARGETS_MISSING: 'Complete the controlled mandate and OTP pair used by the renderer fence check.',
  I5_FENCE_CONTRACT_INVALID: 'Deploy migration 202607180034 and restore its service-only renderer fence.',
  I5_FENCE_AUTHORITY_INVALID: 'Allow only the service renderer to assert an attempt fence.',
  I5_ACTIVE_ATTEMPT_PRESENT: 'Allow the controlled generation to complete or expire before certification.',
  I5_MISMATCH_NOT_REJECTED: 'Reject every missing, expired or mismatched attempt before rendering or persistence.',
  I5_RENDERER_CHECKPOINTS_MISSING: 'Assert the same attempt before rendering and immediately before storage upload.',
  I5_AMBIGUOUS_TIMEOUT_UNFENCED: 'Keep timeout results fenced until reconciliation or lease expiry; do not create a failed version immediately.',
  I5_STATE_MUTATED: 'Keep I5 certification read-only across packet, version, event, document and lease state.',
  I5_LATENCY_EXCEEDED: 'Reduce fence-query latency until p95 is within the configured limit.',
}
const blocker = (code, detail) => ({ code, ...(detail ? { detail } : {}), solution: solutions[code] })

export function assessDocumentGeneratorRendererFenceBoundary({ i4 = {}, targets = [], diagnostics = [], mismatchProbes = [], unauthorizedRejected = false, rendererCheckpointsCovered = false, ambiguousTimeoutFenced = false, beforeSnapshots = [], afterSnapshots = [], latencyP95Ms = null, latencyLimitMs = 2000 } = {}) {
  const blockers = []
  if (i4.status !== 'READY_FOR_I5' || i4.ready !== true) blockers.push(blocker('I5_I4_NOT_READY'))
  if (!Array.isArray(targets) || targets.length < 2 || !['mandate', 'otp'].every((type) => targets.some((row) => row.packetType === type))) blockers.push(blocker('I5_CONTROLLED_TARGETS_MISSING'))
  if (!Array.isArray(diagnostics) || diagnostics.length < Number(targets?.length || 0) || diagnostics.some((row) => row.contract !== 'i5-generator-diagnostic-v1' || row.mutatedData !== false || row.error)) blockers.push(blocker('I5_FENCE_CONTRACT_INVALID'))
  if ((diagnostics || []).some((row) => row.serviceExecute !== true || row.authenticatedExecute !== false) || unauthorizedRejected !== true) blockers.push(blocker('I5_FENCE_AUTHORITY_INVALID'))
  if ((diagnostics || []).some((row) => Number(row.activeLeaseCount) !== 0)) blockers.push(blocker('I5_ACTIVE_ATTEMPT_PRESENT'))
  if (!Array.isArray(mismatchProbes) || mismatchProbes.length < Number(targets?.length || 0) || mismatchProbes.some((row) => row.rejected !== true)) blockers.push(blocker('I5_MISMATCH_NOT_REJECTED'))
  if (rendererCheckpointsCovered !== true) blockers.push(blocker('I5_RENDERER_CHECKPOINTS_MISSING'))
  if (ambiguousTimeoutFenced !== true) blockers.push(blocker('I5_AMBIGUOUS_TIMEOUT_UNFENCED'))
  const before = new Map((beforeSnapshots || []).map((row) => [row.packetId, row.stateDigest]))
  if ((beforeSnapshots || []).length !== Number(targets?.length || 0) || (afterSnapshots || []).length !== Number(targets?.length || 0) || (afterSnapshots || []).some((row) => !before.has(row.packetId) || before.get(row.packetId) !== row.stateDigest)) blockers.push(blocker('I5_STATE_MUTATED'))
  if (!Number.isFinite(Number(latencyP95Ms)) || Number(latencyP95Ms) > Number(latencyLimitMs)) blockers.push(blocker('I5_LATENCY_EXCEEDED', `${latencyP95Ms}ms > ${latencyLimitMs}ms`))
  const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
  return { ready: unique.length === 0, blockers: unique }
}
