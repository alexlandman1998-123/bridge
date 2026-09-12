// Only acknowledge a revision after its read succeeds. Signals received during
// a read always get a subsequent read of their own.
export function createLiveRefreshQueue({ refresh, onSuccess = () => {}, onError = () => {} }) {
  let active = true
  let running = null
  let pending = null
  let current = null
  let acknowledged = -1
  const request = ({ reason = 'refresh', version = null, idleOnly = false } = {}) => {
    if (!active) return Promise.resolve()
    const revision = Number.isSafeInteger(version) && version >= 0 ? version : null
    if (revision !== null && revision <= acknowledged) return running || Promise.resolve()
    // Polling is a safety net, not a mutation signal. A slow read must get a
    // quiet interval after it finishes rather than an endless queued poll.
    if (running && idleOnly) return running
    if (running && revision !== null && revision <= Math.max(current?.version ?? -1, pending?.version ?? -1)) return running
    pending = { reason, version: Math.max(pending?.version ?? -1, revision ?? -1) }
    if (running) return running
    running = Promise.resolve().then(async () => {
      while (active && pending) {
        const job = pending
        pending = null
        current = job
        try {
          const result = await refresh({ reason: job.reason })
          if (result === false || result?.ok === false) throw new Error('Background refresh did not complete.')
          if (!active) break
          acknowledged = Math.max(acknowledged, job.version)
          onSuccess(job)
        } catch (error) {
          if (active) onError(error)
          // No retry loop: the next poll/signal retries an unacknowledged revision.
        }
      }
    }).finally(() => { running = null; current = null })
    return running
  }
  return { request, stop() { active = false; pending = null }, get acknowledged() { return acknowledged }, get busy() { return Boolean(running) } }
}
