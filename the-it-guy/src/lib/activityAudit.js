const AUDIT_STORAGE_KEY = 'itg:audit-events:v1'
const MAX_AUDIT_EVENTS = 250

function safeNowIso() {
  return new Date().toISOString()
}

function normalizePayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return {}
  return payload
}

export function recordAuditEvent(eventType = '', payload = {}) {
  const type = String(eventType || '').trim()
  if (!type) return

  const event = {
    type,
    at: safeNowIso(),
    payload: normalizePayload(payload),
  }

  console.debug('[AUDIT]', event)

  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }

  try {
    const raw = window.localStorage.getItem(AUDIT_STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    const nextList = [event, ...(Array.isArray(list) ? list : [])].slice(0, MAX_AUDIT_EVENTS)
    window.localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(nextList))
  } catch (error) {
    console.warn('[AUDIT] failed to persist audit event', error)
  }
}

export function readAuditEvents() {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(AUDIT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
