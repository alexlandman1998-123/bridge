const BACKEND_DEGRADED_STORAGE_KEY = 'arch9:backend-degraded-until:v1'
const DEFAULT_BACKEND_DEGRADED_TTL_MS = 60_000

function nowMs() {
  return Date.now()
}

function getStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return null
  return window.localStorage
}

function normalizeUntil(value) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0
}

export function markBackendDegraded({ ttlMs = DEFAULT_BACKEND_DEGRADED_TTL_MS } = {}) {
  const degradedUntil = nowMs() + Math.max(1_000, Number(ttlMs) || DEFAULT_BACKEND_DEGRADED_TTL_MS)
  const runtime = typeof window !== 'undefined' ? window : null
  if (runtime) runtime.__ARCH9_BACKEND_DEGRADED_UNTIL__ = degradedUntil
  try {
    getStorage()?.setItem(BACKEND_DEGRADED_STORAGE_KEY, String(degradedUntil))
  } catch {
    // Best-effort only. The in-memory flag still protects the current tab.
  }
  return degradedUntil
}

export function clearBackendDegraded() {
  const runtime = typeof window !== 'undefined' ? window : null
  if (runtime) runtime.__ARCH9_BACKEND_DEGRADED_UNTIL__ = 0
  try {
    getStorage()?.removeItem(BACKEND_DEGRADED_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function isBackendDegraded() {
  const runtime = typeof window !== 'undefined' ? window : null
  const memoryUntil = normalizeUntil(runtime?.__ARCH9_BACKEND_DEGRADED_UNTIL__)
  if (memoryUntil > nowMs()) return true
  if (runtime && memoryUntil) runtime.__ARCH9_BACKEND_DEGRADED_UNTIL__ = 0

  try {
    const storageUntil = normalizeUntil(getStorage()?.getItem(BACKEND_DEGRADED_STORAGE_KEY))
    if (storageUntil > nowMs()) {
      if (runtime) runtime.__ARCH9_BACKEND_DEGRADED_UNTIL__ = storageUntil
      return true
    }
    if (storageUntil) getStorage()?.removeItem(BACKEND_DEGRADED_STORAGE_KEY)
  } catch {
    // Treat unreadable storage as no persisted degradation flag.
  }
  return false
}
