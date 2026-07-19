export const MVP_TRANSACTION_INTEGRITY_AUDIT_VERSION = 'arch9_mvp_transaction_integrity_audit_v1'

export function auditMvpTransactionIntegrity(result = {}) {
  const issues = []
  if (!result.routingProfile?.launchScope?.supported) issues.push('launch_scope_not_supported')
  if (!result.command?.idempotencyKey) issues.push('idempotency_key_missing')
  if (!result.command?.acceptedOfferId) issues.push('accepted_offer_missing')
  if ((result.participants?.participants || []).length < 2) issues.push('creation_participants_incomplete')
  if (!(result.documents?.requirements || []).length) issues.push('document_bootstrap_missing')
  const lanes = result.workflow?.lanes || []
  for (const lane of ['main', 'finance', 'transfer']) {
    if (!lanes.some((item) => item.laneType === lane)) issues.push(`workflow_lane_missing:${lane}`)
  }
  if (!result.truth?.satisfiesMvpTruthContract) issues.push('transaction_truth_incomplete')
  return {
    version: MVP_TRANSACTION_INTEGRITY_AUDIT_VERSION,
    passed: issues.length === 0,
    issues,
  }
}
