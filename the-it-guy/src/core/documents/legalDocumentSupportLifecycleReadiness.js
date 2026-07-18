export function assessLegalDocumentSupportLifecycleReadiness({ k1 = {}, scenarios = [], adminGuarded = false, transitionGuarded = false, databaseUnique = false, uiCovered = false } = {}) {
  const reasons = []
  if (k1?.status !== 'READY_FOR_K2') reasons.push('K2_K1_NOT_READY')
  if (!Array.isArray(scenarios) || scenarios.length < 6 || scenarios.some((row) => !row.passed)) reasons.push('K2_LIFECYCLE_CONTRACT_INCOMPLETE')
  if (!adminGuarded) reasons.push('K2_ADMIN_BOUNDARY_MISSING')
  if (!transitionGuarded) reasons.push('K2_STATE_TRANSITION_UNSAFE')
  if (!databaseUnique) reasons.push('K2_DUPLICATE_LIFECYCLE_UNGUARDED')
  if (!uiCovered) reasons.push('K2_OPERATOR_ACTIONS_MISSING')
  return { ready: reasons.length === 0, reasons }
}
