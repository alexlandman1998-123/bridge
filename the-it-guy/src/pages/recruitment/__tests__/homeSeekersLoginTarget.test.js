import { expect, it, vi } from 'vitest'
import { homeSeekersLoginTarget } from '../homeSeekersLoginTarget'
import { homeSeekersLoginUrl, recruitmentApplicantPortalUrl } from '../recruitmentApplicantPortalUrl'

it('uses the established app origin for both login and the document profile', () => {
  expect(homeSeekersLoginUrl()).toBe('https://app.arch9.co.za/homeseekers/login')
  expect(recruitmentApplicantPortalUrl()).toBe('https://app.arch9.co.za/applicant/my-profile')
  vi.stubEnv('VITE_ARCH9_APP_URL', 'https://preview.example.test/ignored/path?token=ignored')
  expect(homeSeekersLoginUrl()).toBe('https://preview.example.test/homeseekers/login')
  vi.stubEnv('VITE_ARCH9_APP_URL', 'javascript:alert(1)')
  expect(homeSeekersLoginUrl()).toBe('https://app.arch9.co.za/homeseekers/login')
  vi.unstubAllEnvs()
})
it.each([{ id: 'fake', email_confirmed_at: null }, { id: 'fake', email_confirmed_at: '2026-10-10', is_anonymous: true }, null])('does not resolve account status without a verified identity: %j', async user => {
  const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) }, rpc: vi.fn() }
  await expect(homeSeekersLoginTarget(client)).rejects.toThrow('Please log in again')
  expect(client.rpc).not.toHaveBeenCalled()
})
