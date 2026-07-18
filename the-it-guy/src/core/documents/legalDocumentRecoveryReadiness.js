function text(value) { return typeof value === 'string' ? value.trim() : '' }
function sorted(values) { return [...new Set(Array.isArray(values) ? values.map(text).filter(Boolean) : [])].sort() }

export function assessLegalDocumentRecoveryReadiness({ g3 = {}, deactivation = {}, rollback = {}, expectedProjectRef = '', expectedTemplateIds = [], retryContract = {} } = {}) {
  const reasons = []
  if (g3.status !== 'READY_FOR_G4') reasons.push('G4_G3_NOT_READY')
  if (deactivation.action !== 'deactivate' || deactivation.mode !== 'dry-run' || deactivation.status !== 'DRY_RUN_READY' || deactivation.mutatedData !== false || text(deactivation.projectRef) !== text(expectedProjectRef) || (deactivation.blockers || []).length) reasons.push('G4_DEACTIVATION_REHEARSAL_FAILED')
  if (rollback.mode !== 'dry-run' || rollback.strategy !== 'revoke_template_approval' || rollback.mutatedData !== false || text(rollback.projectRef) !== text(expectedProjectRef) || !/fail closed/i.test(text(rollback.expectedEffect)) || sorted(rollback.templateIds).join(',') !== sorted(expectedTemplateIds).join(',')) reasons.push('G4_TEMPLATE_ROLLBACK_REHEARSAL_FAILED')
  if (!retryContract.mandateExistingArtifactRetry || !retryContract.otpExistingArtifactRetry || !retryContract.concurrentClaim || !retryContract.providerIdempotency || !retryContract.successfulRecipientSkip || !retryContract.signedArtifactUnchanged) reasons.push('G4_DELIVERY_RETRY_CONTRACT_INVALID')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], projectRef: text(expectedProjectRef) || null, templateIds: sorted(expectedTemplateIds) }
}
