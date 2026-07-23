export const MVP_PILOT_GO_NO_GO_VERSION = 'arch9_mvp_pilot_go_no_go_v1'

function text(value) {
  return String(value || '').trim()
}

/**
 * Final pilot decision. This is intentionally pure and fail-closed: it cannot
 * change environment configuration, create records, or open the pilot.
 */
export function evaluateMvpPilotGoNoGo({
  releaseCertification = {},
  pilotSession = {},
  batchDryRun = {},
  exposureReadiness = {},
  evidencePath = '',
} = {}) {
  const blockers = []
  if (releaseCertification.passed !== true) blockers.push('release_certification_failed')
  if (pilotSession.decision !== 'go_for_controlled_pilot') blockers.push('pilot_session_not_open')
  if (batchDryRun.passed !== true || Number(batchDryRun.batchSize) > Number(batchDryRun.batchLimit || 2)) {
    blockers.push('pilot_batch_control_not_green')
  }
  if (!text(evidencePath)) blockers.push('staging_evidence_required')
  if (exposureReadiness.decision !== 'ready_for_controlled_exposure') blockers.push('staging_exposure_not_ready')

  return {
    version: MVP_PILOT_GO_NO_GO_VERSION,
    decision: blockers.length ? 'do_not_expose' : 'ready_for_controlled_exposure',
    batchLimit: 2,
    blockers,
    nextStep: blockers.length
      ? 'Keep pilot creation paused. Resolve every blocker and collect fresh staging evidence before rerunning this gate.'
      : 'A named pilot operator may open one batch of at most two transactions and must run the session check again before another batch.',
  }
}
