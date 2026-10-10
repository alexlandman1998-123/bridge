// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import HomeSeekersLogin from '../HomeSeekersLogin'
import { supabase } from '../../lib/supabaseClient'

vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  isUnsupportedJwtAlgorithmError: () => false,
  clearSupabaseLocalAuthState: vi.fn(), invokeEdgeFunction: vi.fn(),
  supabase: { auth: { getSession: vi.fn(), getUser: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn() }, rpc: vi.fn() },
}))
vi.mock('../../lib/devAuth', () => ({ isDevAuthBypassEnabled: () => false, setStoredDevAuthRole: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear()
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'verified-user', email: 'agent@example.test', email_confirmed_at: '2026-10-10' } } })
  supabase.auth.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null })
  supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  supabase.rpc.mockResolvedValue({ data: true, error: null })
})
afterEach(() => { cleanup(); vi.unstubAllEnvs() })
function open(path = '/homeseekers/login') {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/homeseekers/login" element={<HomeSeekersLogin />} />
    <Route path="/applicant/my-profile" element={<h1>Applicant profile destination</h1>} />
    <Route path="/dashboard" element={<h1>Agent workspace destination</h1>} />
  </Routes></MemoryRouter>)
}
function logIn() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'agent@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'FixturePassword123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in', exact: true }))
}
it.each([[true, 'Applicant profile destination'], [false, 'Agent workspace destination']])('routes after verified login using the database decision %s', async (required, destination) => {
  supabase.rpc.mockResolvedValue({ data: required, error: null })
  open(); logIn()
  await screen.findByRole('heading', { name: destination })
  expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'agent@example.test', password: 'FixturePassword123' })
  expect(supabase.auth.getUser).toHaveBeenCalledTimes(1)
  expect(supabase.rpc).toHaveBeenCalledWith('recruitment_applicant_portal_required')
})
it('keeps the Home Seekers login and blocks routing when account access cannot be checked', async () => {
  supabase.rpc.mockResolvedValue({ error: { code: '42501' } })
  open(); logIn()
  await screen.findByText('We could not check your account. Please try again.')
  expect(screen.queryByText(/destination/)).toBeNull()
  expect(screen.getByLabelText('Password').value).toBe('FixturePassword123')
})
it('never checks application status for failed credentials or an unverified identity', async () => {
  supabase.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
  open(); logIn(); await screen.findByText('Invalid login credentials')
  expect(supabase.rpc).not.toHaveBeenCalled()
  supabase.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'unverified' } } })
  logIn(); await screen.findByText('Please log in again to continue.')
  expect(supabase.rpc).not.toHaveBeenCalled()
})
it('routes an existing session through the same applicant decision', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'verified-user' } } } })
  open(); await screen.findByRole('heading', { name: 'Applicant profile destination' })
  expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled()
})
it('keeps signup and arbitrary next destinations outside the branded login', async () => {
  open('/homeseekers/login?mode=signup&next=//foreign.test')
  expect(document.title).toBe('Log in | Home Seekers')
  expect(screen.getByRole('link', { name: 'Join Home Seekers' }).getAttribute('href')).toBe('https://homeseeker.co.za/join')
  expect(screen.queryByRole('button', { name: 'Create one' })).toBeNull()
  expect(screen.queryByText(/Arch9/i)).toBeNull()
  logIn(); await screen.findByRole('heading', { name: 'Applicant profile destination' })
})
it('uses the existing password recovery flow without identifying whether an account exists', async () => {
  open(); fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'agent@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
  await screen.findByText('If an account exists for that email, a password reset link has been sent.')
  expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('agent@example.test', expect.objectContaining({ redirectTo: expect.stringContaining('/auth/callback') }))
  fireEvent.click(screen.getByRole('button', { name: 'Back to log in' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Log in', exact: true }).disabled).toBe(false))
})
