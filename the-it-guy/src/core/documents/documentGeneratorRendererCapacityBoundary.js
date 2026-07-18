const solutions = {
  I2_I1_NOT_READY: 'Complete I1 atomic concurrency certification before renderer-capacity testing.',
  I2_CONTROLLED_TARGETS_MISSING: 'Complete the controlled editable mandate and OTP pair with frozen render sources.',
  I2_FROZEN_TARGET_INVALID: 'Freeze one editable revision for each controlled packet and retain its C4 fingerprint.',
  I2_RENDERER_CONTRACT_INVALID: 'Deploy the i2-generator-v1 capacity response on the native PDF renderer.',
  I2_FROZEN_INPUT_DRIFT: 'Load capacity input from the persisted C4 freeze and reject caller-supplied content drift.',
  I2_PDF_OUTPUT_INVALID: 'Restore native PDF conversion so every capacity result is a valid non-empty PDF artifact.',
  I2_RENDER_ISOLATION_INVALID: 'Remove shared mutable renderer state so identical frozen inputs produce identical PDF bytes.',
  I2_CAPACITY_AUTHORITY_INVALID: 'Restrict capacity mode to the exact service-role diagnostics credential.',
  I2_STATE_MUTATED: 'Return from capacity mode before storage upload, document creation, version creation or event writes.',
  I2_LATENCY_EXCEEDED: 'Increase renderer capacity or lower parallelism until p95 is within the configured limit.',
}
const blocker = (code, detail) => ({ code, ...(detail ? { detail } : {}), solution: solutions[code] })

export function assessDocumentGeneratorRendererCapacityBoundary({ i1 = {}, targets = [], concurrencyPerPacket = 0, probes = [], unauthorizedProbes = [], beforeSnapshots = [], afterSnapshots = [], latencyP95Ms = null, latencyLimitMs = 30000 } = {}) {
  const blockers = []
  if (i1.status !== 'READY_FOR_I2' || i1.ready !== true) blockers.push(blocker('I2_I1_NOT_READY'))
  if (!Array.isArray(targets) || targets.length < 2 || !['mandate', 'otp'].every((type) => targets.some((row) => row.packetType === type))) blockers.push(blocker('I2_CONTROLLED_TARGETS_MISSING'))
  if ((targets || []).some((row) => !row.packetId || !row.freezeId || !row.sourceVersionId || !/^sha256:[0-9a-f]{64}$/.test(row.contentFingerprint || ''))) blockers.push(blocker('I2_FROZEN_TARGET_INVALID'))
  const expectedCount = Number(targets?.length || 0) * Number(concurrencyPerPacket)
  if (!Array.isArray(probes) || probes.length < expectedCount || probes.some((row) => row.contract !== 'i2-v1' || row.generatorContract !== 'i2-generator-v1' || row.capacityProbe !== true || row.mutatedData !== false || row.error)) blockers.push(blocker('I2_RENDERER_CONTRACT_INVALID'))
  const targetByPacket = new Map((targets || []).map((row) => [row.packetId, row]))
  if ((probes || []).some((row) => {
    const target = targetByPacket.get(row.packetId)
    return !target || row.inputAuthority !== 'database_frozen_revision' || row.freezeId !== target.freezeId || row.sourceVersionId !== target.sourceVersionId || row.contentFingerprint !== target.contentFingerprint
  })) blockers.push(blocker('I2_FROZEN_INPUT_DRIFT'))
  if ((probes || []).some((row) => row.mediaType !== 'application/pdf' || !/^sha256:[0-9a-f]{64}$/.test(row.sha256 || '') || Number(row.byteLength) < 100)) blockers.push(blocker('I2_PDF_OUTPUT_INVALID'))
  for (const target of targets || []) {
    const packetProbes = (probes || []).filter((row) => row.packetId === target.packetId)
    if (packetProbes.length < Number(concurrencyPerPacket) || new Set(packetProbes.map((row) => row.sha256)).size !== 1 || new Set(packetProbes.map((row) => row.byteLength)).size !== 1) blockers.push(blocker('I2_RENDER_ISOLATION_INVALID', target.packetType))
  }
  if (!Array.isArray(unauthorizedProbes) || unauthorizedProbes.length < Number(targets?.length || 0) || unauthorizedProbes.some((row) => row.rejected !== true)) blockers.push(blocker('I2_CAPACITY_AUTHORITY_INVALID'))
  const before = new Map((beforeSnapshots || []).map((row) => [row.packetId, row.stateDigest]))
  if ((beforeSnapshots || []).length !== Number(targets?.length || 0) || (afterSnapshots || []).length !== Number(targets?.length || 0) || (afterSnapshots || []).some((row) => !before.has(row.packetId) || before.get(row.packetId) !== row.stateDigest)) blockers.push(blocker('I2_STATE_MUTATED'))
  if (!Number.isFinite(Number(latencyP95Ms)) || Number(latencyP95Ms) > Number(latencyLimitMs)) blockers.push(blocker('I2_LATENCY_EXCEEDED', `${latencyP95Ms}ms > ${latencyLimitMs}ms`))
  const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
  return { ready: unique.length === 0, blockers: unique }
}
