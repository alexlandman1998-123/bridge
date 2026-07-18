export function assessLegalDocumentSupportTriageReadiness({ j4 = {}, scenarios = [], apiAdminGuarded = false, organisationScoped = false, uiCovered = false, readOnly = false } = {}) {
  const reasons = []
  if (j4?.status !== 'READY_FOR_K1') reasons.push('K1_J4_NOT_READY')
  if (!Array.isArray(scenarios) || scenarios.length < 5 || scenarios.some((row) => !row.passed)) reasons.push('K1_TRIAGE_READ_MODEL_INCOMPLETE')
  if (!apiAdminGuarded) reasons.push('K1_ADMIN_BOUNDARY_MISSING')
  if (!organisationScoped) reasons.push('K1_ORGANISATION_SCOPE_MISSING')
  if (!uiCovered) reasons.push('K1_OPERATOR_FEED_MISSING')
  if (!readOnly) reasons.push('K1_TRIAGE_FEED_MUTATING')
  return { ready: reasons.length === 0, reasons }
}
