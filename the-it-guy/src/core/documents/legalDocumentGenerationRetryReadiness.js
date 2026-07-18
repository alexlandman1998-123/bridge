export function assessLegalDocumentGenerationRetryReadiness({ j2 = {}, scenarios = [], surfaces = [], supportReferencesSafe = false } = {}) {
  const reasons = []
  if (j2?.status !== 'READY_FOR_J3') reasons.push('J3_J2_NOT_READY')
  if (!Array.isArray(scenarios) || scenarios.length < 7 || scenarios.some((row) => !row.passed)) reasons.push('J3_RETRY_POLICY_INCOMPLETE')
  for (const required of ['workspace', 'packet_panel', 'document_builder']) {
    if (!surfaces.includes(required)) reasons.push('J3_RECOVERY_ACTION_SURFACE_UNCOVERED')
  }
  if (!supportReferencesSafe) reasons.push('J3_SUPPORT_REFERENCE_UNSAFE')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)] }
}
