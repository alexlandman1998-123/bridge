const WATCHDOG_MAX_AGE_MINUTES = 5

function timestamp(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}

export function assessLegalDocumentCanaryContinuation({ n3 = {}, claim = null, metrics = {}, watchdog = null, targetAligned = false, storeAvailable = true, now = Date.now(), watchdogMaxAgeMinutes = WATCHDOG_MAX_AGE_MINUTES } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (n3.status !== 'READY_FOR_N4' || n3.ready !== true) push('N4_N3_NOT_READY', 'Resolve N3 and complete both authorised canaries before considering cohort continuation.')
  if (!claim || claim.status !== 'claimed') push('N4_RELEASE_CLAIM_MISSING', 'Restore the exact M3 claim used by the accepted canaries.')
  if (n3.status === 'READY_FOR_N4' && n3.ready === true) {
    if (!storeAvailable) push('N4_MONITOR_STORE_UNAVAILABLE', 'Restore read access to cohort events, packets, and watchdog health before continuation.')
    if (Number(metrics.generationFailures || 0) > 0) push('N4_GENERATION_FAILURE_STOP', 'Halt rollout, deactivate the pilot, and investigate every post-claim generation failure.')
    if (Number(metrics.staleSigningPackets || 0) > 0) push('N4_STALE_SIGNING_STOP', 'Halt rollout, deactivate the pilot, and resolve every stale signing packet.')
    if (targetAligned !== true) push('N4_TARGET_DRIFT_STOP', 'Halt rollout and restore exact claim/config/runtime target alignment before a new release attempt.')
    const watchdogAt = timestamp(watchdog?.created_at)
    const claimAt = timestamp(claim?.claimedAt)
    const watchdogFresh = watchdogAt !== null && claimAt !== null && watchdogAt >= claimAt && watchdogAt <= now + 60_000 && now - watchdogAt <= watchdogMaxAgeMinutes * 60_000
    if (watchdog?.status !== 'healthy' || !watchdogFresh || (watchdog?.summary?.blockers || []).length) push('N4_WATCHDOG_STOP', 'Halt rollout and obtain a post-claim healthy watchdog snapshot with no active blockers.')
    const expiresAt = timestamp(claim?.expiresAt)
    if (expiresAt === null || now >= expiresAt) push('N4_CLAIM_EXPIRED', 'Halt rollout and begin a new authorised release attempt with fresh M1-M3 authority.')
    if ((n3.acceptedCanaries || []).length !== 2) push('N4_CANARY_EVIDENCE_DRIFT', 'Restore the exact accepted OTP and mandate evidence before continuation.')
  }
  return {
    ready: blockers.length === 0,
    decision: blockers.length ? 'HALT_AND_DEACTIVATE' : 'CONTINUE_CONTROLLED_COHORT',
    blockers,
    watchdogMaxAgeMinutes,
    nextAction: blockers.length ? 'Run the guarded A3 deactivation operator for the exact project and record the incident/change reference.' : 'Continue only within the existing claimed cohort and N2 safety limits.',
  }
}

export { WATCHDOG_MAX_AGE_MINUTES as LEGAL_DOCUMENT_N4_WATCHDOG_MAX_AGE_MINUTES }
