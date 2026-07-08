const PENDING_PARTNER_INVITE_PATH_STORAGE_KEY = 'itg:pending-partner-invite-path'

export function isPartnerInviteReturnPath(path = '') {
  const safePath = String(path || '').trim()
  return safePath.startsWith('/partners/invite/') || safePath.startsWith('/developer/partner-invite/')
}

export function rememberPendingPartnerInvitePath(path = '') {
  if (typeof window === 'undefined') return ''
  const safePath = String(path || '').trim()
  if (!isPartnerInviteReturnPath(safePath)) return ''
  window.sessionStorage.setItem(PENDING_PARTNER_INVITE_PATH_STORAGE_KEY, safePath)
  return safePath
}

export function readPendingPartnerInvitePath() {
  if (typeof window === 'undefined') return ''
  const path = String(window.sessionStorage.getItem(PENDING_PARTNER_INVITE_PATH_STORAGE_KEY) || '').trim()
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
    window.sessionStorage.removeItem(PENDING_PARTNER_INVITE_PATH_STORAGE_KEY)
  }
}
