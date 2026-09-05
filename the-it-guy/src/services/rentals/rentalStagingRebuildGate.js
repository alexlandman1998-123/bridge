import { RENTAL_RECOVERY_ENVIRONMENTS } from './rentalRecoveryEvidence.js'

function text(value) {
  return String(value ?? '').trim()
}

function timestamp(value) {
  return Boolean(text(value)) && !Number.isNaN(Date.parse(value))
}

export function assessRentalStagingRebuildGate({ sourceBaseline = {}, localReceipt = {}, target = {}, evidence = {} } = {}) {
  const targetProject = text(target.projectRef)
  const targetMode = text(target.mode)
  const localVerified = localReceipt.confirmed === true
    && text(localReceipt.reference)
    && timestamp(localReceipt.recordedAt)
    && localReceipt.chainSha256 === sourceBaseline.chainSha256
  const targetIsSafe = target.approved === true
    && text(target.approvalReference)
    && timestamp(target.approvedAt)
    && target.outboundIntegrationsFrozen === true
    && targetProject !== RENTAL_RECOVERY_ENVIRONMENTS.production
    && ((targetMode === 'fresh' && targetProject && targetProject !== RENTAL_RECOVERY_ENVIRONMENTS.staging)
      || (targetMode === 'replace_disposable' && targetProject === RENTAL_RECOVERY_ENVIRONMENTS.staging && evidence?.stagingRecovery?.recoveryMode === 'disposable' && evidence?.stagingRecovery?.confirmed === true))
  const checks = [
    { code: 'SOURCE_BASELINE_LOCKED', pass: sourceBaseline.ready === true },
    { code: 'LOCAL_VERIFICATION_BOUND_TO_SOURCE_CHAIN', pass: localVerified },
    { code: 'SAFE_STAGING_REBUILD_TARGET_APPROVED', pass: targetIsSafe },
  ]
  return {
    version: 'arch9_rental_staging_rebuild_gate_phase8_v1',
    status: checks.every((check) => check.pass) ? 'READY_FOR_SEPARATE_STAGING_APPLY_DECISION' : 'BLOCKED_PENDING_STAGING_REBUILD_PREREQUISITES',
    ready: checks.every((check) => check.pass),
    checks,
    target: targetProject || null,
    applyAllowed: false,
    nextAction: checks.every((check) => check.pass)
      ? 'A separately approved staging apply may now be considered for this exact non-production target.'
      : 'Lock the source baseline, attach a matching local verification receipt, and approve a safe staging target.',
  }
}
