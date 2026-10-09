// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../../context/AuthSessionContext', () => ({ useAuthSession: vi.fn() }))
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: vi.fn() }))
vi.mock('../../lib/partnersRepository', () => ({
  previewPartnerInvitationAcceptance: vi.fn(),
  acceptPartnerInvitationByLink: vi.fn(),
  requestPartnerInvitationTraining: vi.fn(),
}))
import { useAuthSession } from '../../context/AuthSessionContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { acceptPartnerInvitationByLink, previewPartnerInvitationAcceptance } from '../../lib/partnersRepository'
import { readPendingPartnerInvitePath, rememberPendingPartnerInvitePath } from '../../lib/pendingPartnerInvite'
import { getPostLoginRedirect, storePostLoginRedirect } from '../../lib/resolveMobileAwareRedirect'
import PartnerInvitationAcceptPage from '../PartnerInvitationAcceptPage'

const path = '/partners/invite/old?arch9_release_refresh=123&bridge_app_reload=456'
const invitation = { id: 'old', fromOrganisationName: 'Inviting agency', toOrganisationName: 'Agent workspace', status: 'pending' }
const failure = code => Object.assign(new Error('Invitation lookup failed'), { code })
const mount = (entry = path) => render(<MemoryRouter initialEntries={[entry]}><Routes>
  <Route path="/partners/invite/:invitationId" element={<PartnerInvitationAcceptPage />} />
  <Route path="/dashboard" element={<p>Agent dashboard</p>} />
  <Route path="/attorney/dashboard" element={<p>Attorney dashboard</p>} />
  <Route path="/partners" element={<p>Workspace partners</p>} />
</Routes></MemoryRouter>)

beforeEach(() => {
  vi.resetAllMocks()
  useAuthSession.mockReturnValue({ authState: { status: 'ready', session: { user: { id: 'agent', email: 'agent@example.com' } } } })
  useWorkspace.mockReturnValue({ role: 'agent', currentWorkspace: { id: 'agency', name: 'Agent workspace' } })
  previewPartnerInvitationAcceptance.mockResolvedValue({ invitation })
  acceptPartnerInvitationByLink.mockResolvedValue({ invitation, alreadyAccepted: false })
  rememberPendingPartnerInvitePath('/partners/invite/old')
  storePostLoginRedirect('/partners/invite/old?accept=1')
})
afterEach(() => { cleanup(); window.sessionStorage.clear(); window.localStorage.clear() })

describe('organisation partner invitation recovery', () => {
  it.each(['not_found', 'expired', 'revoked', 'declined'])('forgets a %s invitation and lets an active agent return to their dashboard', async code => {
    previewPartnerInvitationAcceptance.mockRejectedValue(failure(code))
    mount()
    await screen.findByText('Invitation cannot be opened')
    expect(readPendingPartnerInvitePath()).toBe('')
    expect(getPostLoginRedirect()).toBe('/dashboard')
    window.sessionStorage.clear()
    expect(readPendingPartnerInvitePath()).toBe('')
    expect(acceptPartnerInvitationByLink).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('link', { name: 'Return to dashboard' }))
    expect(await screen.findByText('Agent dashboard')).toBeTruthy()
  })

  it.each(['network_error', 'wrong_workspace', 'email_mismatch'])('keeps the saved invitation after %s until the user chooses to leave', async code => {
    previewPartnerInvitationAcceptance.mockRejectedValue(failure(code))
    mount()
    await screen.findByText('Invitation cannot be opened')
    expect(readPendingPartnerInvitePath()).toBe(path)
    expect(screen.getByRole('link', { name: 'Use another account' }).getAttribute('href')).toBe(`/auth?next=${encodeURIComponent(path)}`)
    fireEvent.click(screen.getByRole('link', { name: 'Open Partners' }))
    expect(await screen.findByText('Workspace partners')).toBeTruthy()
    expect(readPendingPartnerInvitePath()).toBe('')
    expect(getPostLoginRedirect()).toBe('/dashboard')
  })

  it('clears a saved invitation when the user leaves a temporary error for their dashboard', async () => {
    previewPartnerInvitationAcceptance.mockRejectedValue(failure('network_error'))
    mount()
    fireEvent.click(await screen.findByRole('link', { name: 'Return to dashboard' }))
    await screen.findByText('Agent dashboard')
    expect(readPendingPartnerInvitePath()).toBe('')
    expect(getPostLoginRedirect()).toBe('/dashboard')
  })

  it('clears an invitation that becomes unavailable between preview and automatic acceptance', async () => {
    acceptPartnerInvitationByLink.mockRejectedValue(failure('revoked'))
    mount(`${path}&accept=1`)
    await screen.findByText('Invitation cannot be opened')
    expect(acceptPartnerInvitationByLink).toHaveBeenCalledTimes(1)
    expect(readPendingPartnerInvitePath()).toBe('')
    expect(getPostLoginRedirect()).toBe('/dashboard')
  })

  it('retains a valid invitation for review without automatically accepting it', async () => {
    mount()
    await screen.findByText('Invitation details ready')
    expect(readPendingPartnerInvitePath()).toBe(path)
    expect(acceptPartnerInvitationByLink).not.toHaveBeenCalled()
  })

  it.each([false, true])('still accepts once after setup (alreadyAccepted=%s) and clears saved variants before returning home', async alreadyAccepted => {
    previewPartnerInvitationAcceptance.mockResolvedValue({ invitation, alreadyAccepted })
    mount(`${path}&accept=1`)
    await screen.findByText('Agent dashboard')
    expect(acceptPartnerInvitationByLink).toHaveBeenCalledExactlyOnceWith({ invitationId: 'old', organisationId: 'agency' })
    expect(readPendingPartnerInvitePath()).toBe('')
    expect(getPostLoginRedirect()).toBe('/dashboard')
  })

  it('returns an attorney to the appropriate dashboard', async () => {
    useWorkspace.mockReturnValue({ role: 'attorney', currentWorkspace: { id: 'firm', name: 'Law firm' } })
    previewPartnerInvitationAcceptance.mockRejectedValue(failure('not_found'))
    mount()
    const link = await screen.findByRole('link', { name: 'Return to dashboard' })
    expect(link.getAttribute('href')).toBe('/attorney/dashboard')
    fireEvent.click(link)
    await screen.findByText('Attorney dashboard')
  })
})
