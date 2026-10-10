// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import RecruitmentRouteAccess from '../RecruitmentRouteAccess'
import useRecruitmentApplicantGate from '../useRecruitmentApplicantGate'

vi.mock('../useRecruitmentApplicantGate', () => ({ default: vi.fn() }))
vi.mock('../RecruitmentApplicantSetupPage', () => ({ default: () => <div>Applicant profile</div> }))
vi.mock('../../HomeSeekersLogin', () => ({ default: () => <div>Home Seekers login</div> }))
vi.mock('../../../components/AppErrorBoundary', () => ({ default: ({ children }) => children }))

const session = { user: { id: 'applicant-user' } }
const mounted = vi.fn()
const retry = vi.fn()
const logout = vi.fn()
function Workspace() {
  mounted()
  return <div>Agency workspace</div>
}
function Destination() {
  return <div>Destination: {useLocation().pathname}</div>
}
function open(path = '/start', props = {}) {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path={path} element={<RecruitmentRouteAccess session={session} logout={logout} pendingInvitePath="" {...props}><Workspace /></RecruitmentRouteAccess>} />
    <Route path="*" element={<Destination />} />
  </Routes></MemoryRouter>)
}
beforeEach(() => {
  vi.clearAllMocks()
  useRecruitmentApplicantGate.mockReturnValue({ checking: false, required: false, error: false, retry })
})
afterEach(cleanup)

it('waits for the applicant decision before mounting the workspace', () => {
  useRecruitmentApplicantGate.mockReturnValue({ checking: true })
  open()
  expect(screen.getByRole('status').textContent).toBe('Checking workspace access')
  expect(mounted).not.toHaveBeenCalled()
})
it('keeps failed checks closed and offers working retry and sign out actions', () => {
  useRecruitmentApplicantGate.mockReturnValue({ error: true, retry })
  open()
  expect(screen.getByRole('alert')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(retry).toHaveBeenCalledOnce()
  expect(logout).toHaveBeenCalledOnce()
  expect(mounted).not.toHaveBeenCalled()
})
it('redirects a pending applicant to their restricted profile without mounting the workspace', async () => {
  useRecruitmentApplicantGate.mockReturnValue({ required: true })
  open()
  expect(await screen.findByText('Destination: /applicant/my-profile')).toBeTruthy()
  expect(mounted).not.toHaveBeenCalled()
})
it.each(['/invite/token', '/agent/invite/token', '/auth/callback'])('preserves the required acceptance route %s', path => {
  useRecruitmentApplicantGate.mockReturnValue({ required: true })
  open(path)
  expect(screen.getByText('Agency workspace')).toBeTruthy()
})
it('opens the dedicated applicant profile without mounting workspace providers', async () => {
  useRecruitmentApplicantGate.mockReturnValue({ required: true })
  open('/applicant/my-profile')
  expect(await screen.findByText('Applicant profile')).toBeTruthy()
  expect(mounted).not.toHaveBeenCalled()
})
it('redirects activated staff from the applicant portal to the dashboard', async () => {
  open('/applicant/my-profile')
  expect(await screen.findByText('Destination: /dashboard')).toBeTruthy()
  expect(mounted).not.toHaveBeenCalled()
})
it('opens the branded login for signed out users without workspace providers', async () => {
  open('/homeseekers/login', { session: null })
  expect(await screen.findByText('Home Seekers login')).toBeTruthy()
  expect(mounted).not.toHaveBeenCalled()
})
it('resumes an existing invitation after the common login', async () => {
  open('/homeseekers/login', { pendingInvitePath: '/invite/existing' })
  expect(await screen.findByText('Destination: /invite/existing')).toBeTruthy()
  expect(mounted).not.toHaveBeenCalled()
})
it('mounts the workspace for a completed access check', () => {
  open()
  expect(screen.getByText('Agency workspace')).toBeTruthy()
  expect(useRecruitmentApplicantGate).toHaveBeenCalledWith(session)
})
