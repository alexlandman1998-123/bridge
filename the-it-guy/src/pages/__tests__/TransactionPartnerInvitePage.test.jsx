// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
vi.mock('../../services/transactionPartnerInvitationService', () => ({
  getTransactionPartnerInvitationByToken: vi.fn(), acceptTransactionPartnerInvitation: vi.fn(),
  declineTransactionPartnerInvitation: vi.fn(), getTransactionPartnerRoleLabel: () => 'Bond Originator',
}))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { auth: { getSession: vi.fn(), signOut: vi.fn() } } }))
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentWorkspace: { id: 'unrelated-workspace' } }) }))
vi.mock('../../lib/signupIntent', async importOriginal => ({ ...await importOriginal(), persistSignupIntent: vi.fn().mockResolvedValue({}) }))
import { acceptTransactionPartnerInvitation, declineTransactionPartnerInvitation, getTransactionPartnerInvitationByToken } from '../../services/transactionPartnerInvitationService'
import { supabase } from '../../lib/supabaseClient'
import { readPendingPartnerInvitePath } from '../../lib/pendingPartnerInvite'
import { persistSignupIntent } from '../../lib/signupIntent'
import TransactionPartnerInvitePage from '../TransactionPartnerInvitePage'

const context = { ok: true, bindingState: 'pending', organisations: [{ id: 'org', name: 'Beta Bond' }], invitation: { id: 'invite', roleType: 'bond_originator', companyName: 'Beta Bond', invitedByOrganisation: 'Agency', email: 'contact@partner.co.za', status: 'pending' } }
const mount = () => render(<MemoryRouter initialEntries={['/transaction-invite/secure-token']}><Routes>
  <Route path="/transaction-invite/:token" element={<TransactionPartnerInvitePage />} />
  <Route path="/auth" element={<p>Account setup</p>} />
  <Route path="/onboarding/profile" element={<p>Organisation setup</p>} />
</Routes></MemoryRouter>)
beforeEach(() => {
  getTransactionPartnerInvitationByToken.mockResolvedValue(context)
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user', email: 'contact@partner.co.za' } } } })
  acceptTransactionPartnerInvitation.mockResolvedValue({ success: true, nextPath: '/transactions/matter' })
  persistSignupIntent.mockResolvedValue({})
})
afterEach(() => { cleanup(); vi.resetAllMocks(); window.localStorage.clear(); window.sessionStorage.clear() })
describe('external organisation matter connection', () => {
  it('connects to an eligible organisation only after an explicit decision', async () => {
    mount()
    const button = await screen.findByRole('button', { name: 'Connect matter to organisation' })
    expect(acceptTransactionPartnerInvitation).not.toHaveBeenCalled()
    fireEvent.click(button)
    await screen.findByText(/The matter is connected to your organisation/)
    expect(acceptTransactionPartnerInvitation).toHaveBeenCalledWith(expect.objectContaining({ token: 'secure-token', organisationId: 'org' }))
    expect(screen.getByText(/delivery and acceptance are tracked separately/)).toBeTruthy()
  })
  it('asks for a choice rather than using the current unrelated workspace', async () => {
    getTransactionPartnerInvitationByToken.mockResolvedValue({ ...context, organisations: [...context.organisations, { id: 'second', name: 'Other Bond' }] })
    mount()
    expect((await screen.findByRole('button', { name: 'Connect matter to organisation' })).disabled).toBe(true)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'second' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect matter to organisation' }))
    await waitFor(() => expect(acceptTransactionPartnerInvitation).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 'second' })))
  })
  it('keeps the invite return path through organisation setup', async () => {
    getTransactionPartnerInvitationByToken.mockResolvedValue({ ...context, organisations: [] })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Set up organisation' }))
    expect(await screen.findByText('Organisation setup')).toBeTruthy()
    expect(readPendingPartnerInvitePath()).toBe('/transaction-invite/secure-token')
    expect(JSON.parse(window.sessionStorage.getItem('itg:signup-intent:v1')).workspace_action).toBe('create_workspace')
    expect(persistSignupIntent).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ id: 'user' }), status: 'ready_for_onboarding' }))
  })
  it('offers sign in and signup with no matter access before authentication', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    mount()
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Connect matter to organisation' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create account and organisation' }))
    expect(await screen.findByText('Account setup')).toBeTruthy()
    expect(readPendingPartnerInvitePath()).toBe('/transaction-invite/secure-token')
  })
  it('requires switching the wrong account and can resume an accepted unbound invite', async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'other', email: 'wrong@partner.co.za' } } } })
    mount()
    expect(await screen.findByRole('button', { name: 'Switch account' })).toBeTruthy()
    expect(acceptTransactionPartnerInvitation).not.toHaveBeenCalled()
    cleanup()
    getTransactionPartnerInvitationByToken.mockResolvedValue({ ...context, bindingState: 'accepted_unbound', invitation: { ...context.invitation, status: 'accepted' } })
    mount()
    expect(await screen.findByRole('button', { name: 'Complete matter connection' })).toBeTruthy()
  })
  it('shows failures without confirming delivery and stops after decline', async () => {
    acceptTransactionPartnerInvitation.mockRejectedValue(new Error('The nominated partner has changed.'))
    declineTransactionPartnerInvitation.mockResolvedValue({ success: true })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Connect matter to organisation' }))
    expect((await screen.findByRole('alert')).textContent).toBe('The nominated partner has changed.')
    expect(screen.queryByRole('link', { name: 'Open matter' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Decline invitation' }))
    await screen.findByText(/This invitation has been declined/)
    expect(screen.queryByRole('button', { name: 'Connect matter to organisation' })).toBeNull()
  })
})
