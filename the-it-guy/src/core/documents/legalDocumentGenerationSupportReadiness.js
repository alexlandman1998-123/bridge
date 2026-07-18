export function assessLegalDocumentGenerationSupportReadiness({ j3 = {}, scenarios = [], surfaces = [], payloadSafe = false, failureNonBlocking = false, dedupeCovered = false } = {}) {
  const reasons = []
  if (j3?.status !== 'READY_FOR_J4') reasons.push('J4_J3_NOT_READY')
  if (!Array.isArray(scenarios) || scenarios.length < 5 || scenarios.some((row) => !row.passed)) reasons.push('J4_HANDOFF_CONTRACT_INCOMPLETE')
  for (const required of ['workspace', 'packet_panel', 'document_builder']) {
    if (!surfaces.includes(required)) reasons.push('J4_HANDOFF_SURFACE_UNCOVERED')
  }
  if (!payloadSafe) reasons.push('J4_HANDOFF_PAYLOAD_UNSAFE')
  if (!failureNonBlocking) reasons.push('J4_DIAGNOSTIC_FAILURE_BLOCKING')
  if (!dedupeCovered) reasons.push('J4_HANDOFF_DEDUPLICATION_MISSING')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)] }
}
