const SOAK_HOURS = 24
const WATCHDOG_FRESHNESS_MINUTES = 15

function timestamp(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}

export function assessLegalDocumentExpandedCohortSoak({ t1 = {}, record = null, metrics = {}, watchdogs = [], targetAligned = false, activationAligned = false, storeAvailable = true, now = Date.now(), soakHours = SOAK_HOURS, watchdogFreshnessMinutes = WATCHDOG_FRESHNESS_MINUTES } = {}) {
  const blockers = []
  const add = (code, kind, solution) => blockers.push({ code, kind, solution })
  if (t1.status !== 'READY_FOR_T2' || t1.ready !== true) add('T2_T1_NOT_READY', 'upstream', 'Record and verify T1 expanded-cohort continuation before starting the soak period.')
  if (!record || record.status !== 'continued') add('T2_CONTINUATION_RECORD_MISSING', 'upstream', 'Restore the exact T1 continuation record before observing expanded-cohort health.')
  let elapsedHours = null
  let remainingHours = soakHours
  if (t1.status === 'READY_FOR_T2' && record?.status === 'continued') {
    const recordedAt = timestamp(record.recordedAt)
    elapsedHours = recordedAt === null ? null : Math.max(0, (now - recordedAt) / 3_600_000)
    remainingHours = elapsedHours === null ? soakHours : Math.max(0, soakHours - elapsedHours)
    if (elapsedHours === null || elapsedHours < soakHours) add('T2_SOAK_PERIOD_INCOMPLETE', 'wait', `Continue the expanded cohort until the ${soakHours}-hour observation period is complete.`)
    if (!storeAvailable) add('T2_OBSERVABILITY_STORE_UNAVAILABLE', 'stop', 'Halt and deactivate until cohort events, packets, and watchdog evidence are readable.')
    if (Number(metrics.generationFailures || 0) > 0) add('T2_GENERATION_FAILURE_STOP', 'stop', 'Halt and deactivate; investigate every generation failure across the expanded cohort.')
    if (Number(metrics.staleSigningPackets || 0) > 0) add('T2_STALE_SIGNING_STOP', 'stop', 'Halt and deactivate; resolve every stale signing packet across the expanded cohort.')
    if (Number(metrics.addedOrganisationCompletedOtp || 0) < 1) add('T2_ADDED_ORGANISATION_OTP_ACTIVITY_MISSING', 'wait', 'Complete at least one additional OTP for the added organisation during the soak period.')
    if (Number(metrics.addedOrganisationCompletedMandate || 0) < 1) add('T2_ADDED_ORGANISATION_MANDATE_ACTIVITY_MISSING', 'wait', 'Complete at least one additional mandate for the added organisation during the soak period.')
    if (targetAligned !== true) add('T2_TARGET_DRIFT_STOP', 'stop', 'Halt and deactivate; restore exact continuation/config/runtime target alignment.')
    if (activationAligned !== true) add('T2_ACTIVATION_BINDING_STOP', 'stop', 'Halt and restore the exact Q2 activation digest and added organisation bound by T1.')
    const rows = Array.isArray(watchdogs) ? watchdogs : []
    const latestAt = rows.length ? Math.max(...rows.map((row) => timestamp(row.created_at) || 0)) : 0
    const watchdogHealthy = rows.length >= 2 && rows.every((row) => row.status === 'healthy' && !(row.summary?.blockers || []).length) && latestAt > 0 && now - latestAt <= watchdogFreshnessMinutes * 60_000
    if (!watchdogHealthy) add('T2_WATCHDOG_COVERAGE_STOP', 'stop', 'Halt and deactivate until at least two soak-window snapshots are healthy, blocker-free, and the latest is fresh.')
  }
  const stop = blockers.some((row) => row.kind === 'stop')
  const upstream = blockers.some((row) => row.kind === 'upstream')
  const ready = blockers.length === 0
  return {
    ready,
    status: ready ? 'READY_FOR_T3' : stop ? 'HALT_AND_DEACTIVATE' : upstream ? 'NO_GO' : 'SOAK_IN_PROGRESS',
    decision: ready ? 'EXPANDED_SOAK_ACCEPTED' : stop ? 'HALT_AND_DEACTIVATE' : upstream ? 'HOLD_NOT_STARTED' : 'CONTINUE_OBSERVATION',
    blockers,
    elapsedHours: elapsedHours === null ? null : Number(elapsedHours.toFixed(2)),
    remainingHours: Number(remainingHours.toFixed(2)),
    soakHours,
    watchdogFreshnessMinutes,
  }
}

export { SOAK_HOURS as LEGAL_DOCUMENT_T2_SOAK_HOURS, WATCHDOG_FRESHNESS_MINUTES as LEGAL_DOCUMENT_T2_WATCHDOG_FRESHNESS_MINUTES }
