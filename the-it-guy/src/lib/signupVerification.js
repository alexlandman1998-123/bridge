const PENDING_SIGNUP_KEY = 'arch9:pending-signup-verification'

export function readPendingSignupVerification() {
  try {
    const pending = JSON.parse(window.sessionStorage.getItem(PENDING_SIGNUP_KEY) || 'null')
    if (typeof pending?.email !== 'string' || !pending.email.trim() || !Number.isFinite(pending.requestedAt) || Date.now() - pending.requestedAt > 3_600_000) return null
    return pending
  } catch {
    return null
  }
}

export function rememberSignupVerification(email, nextPath) {
  const safeNextPath = typeof nextPath === 'string' && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/setup'
  const pending = { email: email.trim().toLowerCase(), nextPath: safeNextPath, requestedAt: Date.now() }
  try { window.sessionStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(pending)) } catch { /* Continue without storage. */ }
  return pending
}

export function clearPendingSignupVerification() {
  try { window.sessionStorage.removeItem(PENDING_SIGNUP_KEY) } catch { /* Storage may be unavailable. */ }
}

