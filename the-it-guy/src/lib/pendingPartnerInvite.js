const PENDING_PARTNER_INVITE_PATH_STORAGE_KEY = 'itg:pending-partner-invite-path'

function readStorage(storage, key) {
  try {
    return String(storage?.getItem(key) || '').trim()
  } catch {
    return ''
  }
}

function writeStorage(storage, key, value) {
  try {
    storage?.setItem(key, value)
  } catch {
    // Storage can be unavailable in private browsing or embedded contexts.
  }
}

function removeStorage(storage, key) {
  try {
    storage?.removeItem(key)
  } catch {
    // Storage can be unavailable in private browsing or embedded contexts.
  }
}

export function isPartnerInviteReturnPath(path = '') {
  const safePath = String(path || '').trim()
  return safePath.startsWith('/partners/invite/') || safePath.startsWith('/developer/partner-invite/')
}

export function rememberPendingPartnerInvitePath(path = '') {
  if (typeof window === 'undefined') return ''
  const safePath = String(path || '').trim()
  if (!isPartnerInviteReturnPath(safePath)) return ''
  writeStorage(window.sessionStorage, PENDING_PARTNER_INVITE_PATH_STORAGE_KEY, safePath)
  writeStorage(window.localStorage, PENDING_PARTNER_INVITE_PATH_STORAGE_KEY, safePath)
  return safePath
}

export function readPendingPartnerInvitePath() {
  if (typeof window === 'undefined') return ''
  const path =
    readStorage(window.sessionStorage, PENDING_PARTNER_INVITE_PATH_STORAGE_KEY) ||
    readStorage(window.localStorage, PENDING_PARTNER_INVITE_PATH_STORAGE_KEY)
  return isPartnerInviteReturnPath(path) ? path : ''
}

export function buildPartnerInviteAutoAcceptPath(path = '') {
  const safePath = String(path || '').trim()
  if (!isPartnerInviteReturnPath(safePath)) return ''
  try {
    const url = new URL(safePath, 'https://arch9.local')
    url.searchParams.set('accept', '1')
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return safePath.includes('?') ? `${safePath}&accept=1` : `${safePath}?accept=1`
  }
}

export function clearPendingPartnerInvitePath(path = '') {
  if (typeof window === 'undefined') return
  const currentPath = readPendingPartnerInvitePath()
  const safePath = String(path || '').trim()
  if (!safePath || safePath === currentPath) {
    removeStorage(window.sessionStorage, PENDING_PARTNER_INVITE_PATH_STORAGE_KEY)
    removeStorage(window.localStorage, PENDING_PARTNER_INVITE_PATH_STORAGE_KEY)
  }
}
