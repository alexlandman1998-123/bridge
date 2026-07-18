export function assessLegalDocumentGenerationReconciliationReadiness({ j1 = {}, scenarios = [], surfaces = [], feederSuppressionCovered = false } = {}) {
  const reasons = []
  if (j1?.status !== 'READY_FOR_J2') reasons.push('J2_J1_NOT_READY')
  if (!Array.isArray(scenarios) || scenarios.length < 5 || scenarios.some((row) => !row.passed)) reasons.push('J2_RECONCILIATION_CONTRACT_INCOMPLETE')
  for (const required of ['workspace', 'packet_panel', 'document_builder']) {
    if (!surfaces.includes(required)) reasons.push('J2_RECOVERY_SURFACE_UNCOVERED')
  }
  if (!feederSuppressionCovered) reasons.push('J2_PREMATURE_ERROR_SURFACE_PRESENT')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)] }
}
