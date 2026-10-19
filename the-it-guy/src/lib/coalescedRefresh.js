function cancelled() {
  return new DOMException('Refresh cancelled.', 'AbortError')
}

// One active read and one trailing batch per screen. Scope changes discard
// queued work and abort the previous viewer's request; no results are cached.
export function createCoalescedRefresh({ minIntervalMs = 1000, errorDelayMs = 30000 } = {}) {
  let scope = null
  let active = null
  let pending = null
  let timer = null
  let nextStartAt = 0

  function schedule() {
    if (active || !pending || timer !== null) return
    const delay = pending.immediate ? 0 : Math.max(0, nextStartAt - Date.now())
    if (delay) {
      timer = setTimeout(() => { timer = null; schedule() }, delay)
      return
    }
    const batch = pending
    pending = null
    const controller = new AbortController()
    const request = { batch, controller }
    active = request
    nextStartAt = Date.now() + minIntervalMs
    Promise.resolve().then(() => {
      if (controller.signal.aborted) throw cancelled()
      return batch.read(controller.signal)
    }).then((value) => {
      batch.waiters.forEach(({ resolve }) => resolve(value))
    }, (error) => {
      if (active === request && error?.name !== 'AbortError') {
        nextStartAt = Math.max(nextStartAt, Date.now() + errorDelayMs)
      }
      batch.waiters.forEach(({ reject }) => reject(error))
    }).finally(() => {
      if (active !== request) return
      active = null
      schedule()
    })
  }

  function cancel() {
    if (timer !== null) clearTimeout(timer)
    timer = null
    const error = cancelled()
    pending?.waiters.forEach(({ reject }) => reject(error))
    pending = null
    active?.controller.abort()
    active?.batch.waiters.forEach(({ reject }) => reject(error))
    active = null
    scope = null
    nextStartAt = 0
  }

  return {
    cancel,
    run(key, read, { immediate = false } = {}) {
      if (scope !== key) { cancel(); scope = key }
      if (immediate) {
        nextStartAt = 0
        if (timer !== null) { clearTimeout(timer); timer = null }
      }
      if (!pending) pending = { read, waiters: [], immediate: false }
      pending.immediate ||= immediate
      pending.read = read
      const result = new Promise((resolve, reject) => pending.waiters.push({ resolve, reject }))
      schedule()
      return result
    },
  }
}
