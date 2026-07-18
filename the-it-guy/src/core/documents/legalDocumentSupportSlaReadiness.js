export function assessLegalDocumentSupportSlaReadiness({ k2 = {}, scenarios = [], queuePrioritized = false, uiCovered = false, nonMutating = false } = {}) {
  const reasons = []
  if (k2?.status !== 'READY_FOR_K3') reasons.push('K3_K2_NOT_READY')
  if (!Array.isArray(scenarios) || scenarios.length < 6 || scenarios.some((row) => !row.passed)) reasons.push('K3_SLA_CONTRACT_INCOMPLETE')
  if (!queuePrioritized) reasons.push('K3_QUEUE_PRIORITY_INVALID')
  if (!uiCovered) reasons.push('K3_SLA_VISIBILITY_MISSING')
  if (!nonMutating) reasons.push('K3_SLA_EVALUATION_MUTATING')
  return { ready: reasons.length === 0, reasons }
}
