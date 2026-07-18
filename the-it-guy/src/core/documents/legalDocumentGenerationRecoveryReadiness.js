export function assessLegalDocumentGenerationRecoveryReadiness({ i3 = {}, cases = [], surfaces = [], busyReleaseCovered = false } = {}) {
  const reasons = []
  if (i3?.status !== 'READY_FOR_J1') reasons.push('J1_I3_NOT_READY')
  if (!Array.isArray(cases) || cases.length < 8 || cases.some((row) => !row.safe || !row.actionable || !row.packetSpecific)) reasons.push('J1_RECOVERY_CONTRACT_INCOMPLETE')
  const requiredSurfaces = ['workspace', 'packet_panel', 'agency_pipeline', 'unit_detail', 'document_builder']
  if (requiredSurfaces.some((name) => !surfaces.includes(name))) reasons.push('J1_GENERATION_SURFACE_UNCOVERED')
  if (!busyReleaseCovered) reasons.push('J1_BUSY_STATE_RELEASE_UNPROVEN')
  return { ready: reasons.length === 0, reasons }
}
