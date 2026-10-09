// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { clearPendingPartnerInvitePath, readPendingPartnerInvitePath, rememberPendingPartnerInvitePath } from '../pendingPartnerInvite'
import { getPostLoginRedirect, storePostLoginRedirect } from '../resolveMobileAwareRedirect'

afterEach(() => { window.sessionStorage.clear(); window.localStorage.clear() })

describe('pending partner invitation cleanup', () => {
  it('clears both saved copies and the login return despite refresh and acceptance parameters', () => {
    rememberPendingPartnerInvitePath('/partners/invite/old?arch9_release_refresh=123#review')
    storePostLoginRedirect('/partners/invite/old?bridge_app_reload=456')
    clearPendingPartnerInvitePath('/partners/invite/old?accept=1')
    expect(readPendingPartnerInvitePath()).toBe('')
    expect(getPostLoginRedirect()).toBe('/dashboard')
    // Removing session storage must not reveal a stale durable copy.
    window.sessionStorage.clear()
    expect(readPendingPartnerInvitePath()).toBe('')
  })

  it.each(['sessionStorage', 'localStorage'])('clears the matching %s copy without deleting another tab’s invite', (storage) => {
    rememberPendingPartnerInvitePath('/partners/invite/new')
    window[storage].setItem('itg:pending-partner-invite-path', '/partners/invite/old?accept=1')
    clearPendingPartnerInvitePath('/partners/invite/old')
    expect(readPendingPartnerInvitePath()).toBe('/partners/invite/new')
    expect(window[storage].getItem('itg:pending-partner-invite-path')).toBeNull()
  })

  it('preserves a different invitation and an unrelated login destination', () => {
    rememberPendingPartnerInvitePath('/partners/invite/new')
    storePostLoginRedirect('/listings')
    clearPendingPartnerInvitePath('/partners/invite/old')
    expect(readPendingPartnerInvitePath()).toBe('/partners/invite/new')
    expect(getPostLoginRedirect()).toBe('/listings')
    clearPendingPartnerInvitePath('/partners/invite/new')
    expect(getPostLoginRedirect()).toBe('/listings')
  })

  it.each(['/transaction-invite/token', '/developer/partner-invite/token'])('still clears accepted %s handoffs', (path) => {
    rememberPendingPartnerInvitePath(path)
    clearPendingPartnerInvitePath(`${path}?accept=1`)
    expect(readPendingPartnerInvitePath()).toBe('')
  })
})
