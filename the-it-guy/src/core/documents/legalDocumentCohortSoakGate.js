const SOAK_HOURS = 24
const WATCHDOG_FRESHNESS_MINUTES = 15

function timestamp(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}

export function assessLegalDocumentCohortSoak({ o1 = {}, record = null, metrics = {}, watchdogs = [], targetAligned = false, storeAvailable = true, now = Date.now(), soakHours = SOAK_HOURS, watchdogFreshnessMinutes = WATCHDOG_FRESHNESS_MINUTES } = {}) {
  const blockers = []
  const add = (code, kind, solution) => blockers.push({ code, kind, solution })
  if (o1.status !== 'READY_FOR_O2' || o1.ready !== true) add('O2_O1_NOT_READY', 'upstream', 'Record and verify O1 cohort continuation before starting the soak period.')
  if (!record || record.status !== 'continued') add('O2_CONTINUATION_RECORD_MISSING', 'upstream', 'Restore the exact O1 continuation record before observing cohort health.')
  let elapsedHours = null
  let remainingHours = soakHours
  if (o1.status === 'READY_FOR_O2' && record?.status === 'continued') {
    const recordedAt = timestamp(record.recordedAt)
    elapsedHours = recordedAt === null ? null : Math.max(0, (now - recordedAt) / 3_600_000)
    remainingHours = elapsedHours === null ? soakHours : Math.max(0, soakHours - elapsedHours)
    if (elapsedHours === null || elapsedHours < soakHours) add('O2_SOAK_PERIOD_INCOMPLETE', 'wait', `Continue the controlled cohort until the ${soakHours}-hour observation period is complete.`)
    if (!storeAvailable) add('O2_OBSERVABILITY_STORE_UNAVAILABLE', 'stop', 'Halt and deactivate until cohort events, packets, and watchdog evidence are readable.')
    if (Number(metrics.generationFailures || 0) > 0) add('O2_GENERATION_FAILURE_STOP', 'stop', 'Halt and deactivate; investigate every generation failure recorded during the soak period.')
    if (Number(metrics.staleSigningPackets || 0) > 0) add('O2_STALE_SIGNING_STOP', 'stop', 'Halt and deactivate; resolve every stale signing packet before a new release attempt.')
    if (Number(metrics.completedOtp || 0) < 1) add('O2_OTP_ACTIVITY_MISSING', 'wait', 'Complete at least one additional OTP through the controlled cohort during the soak period.')
    if (Number(metrics.completedMandate || 0) < 1) add('O2_MANDATE_ACTIVITY_MISSING', 'wait', 'Complete at least one additional mandate through the controlled cohort during the soak period.')
    if (targetAligned !== true) add('O2_TARGET_DRIFT_STOP', 'stop', 'Halt and deactivate; restore exact continuation/config/runtime target alignment.')
    const rows = Array.isArray(watchdogs) ? watchdogs : []
    const latestAt = rows.length ? Math.max(...rows.map((row) => timestamp(row.created_at) || 0)) : 0
    const watchdogHealthy = rows.length >= 2 && rows.every((row) => row.status === 'healthy' && !(row.summary?.blockers || []).length) && latestAt > 0 && now - latestAt <= watchdogFreshnessMinutes * 60_000
    if (!watchdogHealthy) add('O2_WATCHDOG_COVERAGE_STOP', 'stop', 'Halt and deactivate until at least two soak-window snapshots are healthy, blocker-free, and the latest is fresh.')
  }
  const stop = blockers.some((row) => row.kind === 'stop')
  const upstream = blockers.some((row) => row.kind === 'upstream')
  const ready = blockers.length === 0
  return {
    ready,
    status: ready ? 'READY_FOR_O3' : stop ? 'HALT_AND_DEACTIVATE' : upstream ? 'NO_GO' : 'SOAK_IN_PROGRESS',
    decision: ready ? 'SOAK_ACCEPTED' : stop ? 'HALT_AND_DEACTIVATE' : upstream ? 'HOLD_NOT_STARTED' : 'CONTINUE_OBSERVATION',
    blockers,
    elapsedHours: elapsedHours === null ? null : Number(elapsedHours.toFixed(2)),
    remainingHours: Number(remainingHours.toFixed(2)),
    soakHours,
    watchdogFreshnessMinutes,
  }
}

export { SOAK_HOURS as LEGAL_DOCUMENT_O2_SOAK_HOURS, WATCHDOG_FRESHNESS_MINUTES as LEGAL_DOCUMENT_O2_WATCHDOG_FRESHNESS_MINUTES }
