// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RecruitmentIntakeLinks from '../RecruitmentIntakeLinks'
import { createRecruitmentIntakeLink, listRecruitmentIntakeLinks, revokeRecruitmentIntakeLink } from '../../../services/recruitmentIntakeService'
vi.mock('../../../services/recruitmentIntakeService', () => ({ createRecruitmentIntakeLink: vi.fn(), listRecruitmentIntakeLinks: vi.fn().mockResolvedValue([]), revokeRecruitmentIntakeLink: vi.fn().mockResolvedValue(undefined) }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('creates distinct public and website links and shows the address for copying', async () => {
  vi.mocked(createRecruitmentIntakeLink).mockResolvedValue({ id:'link', url:'https://app.example.test/join-us/token', expires_at:'2027-10-05', channel:'website' })
  render(<RecruitmentIntakeLinks organisationId="org" />)
  fireEvent.click(screen.getByRole('button',{name:'Create website link'}))
  expect((await screen.findByLabelText('Generated Join Us link')).value).toBe('https://app.example.test/join-us/token')
  expect(createRecruitmentIntakeLink).toHaveBeenCalledWith('org','website',undefined)
  expect(screen.getByRole('button',{name:'Create public link'})).toBeTruthy()
})
it('limits private invitations to eligible saved leads and supports revocation', async () => {
  vi.mocked(listRecruitmentIntakeLinks).mockResolvedValue([{ id:'link',channel:'private_link',expires_at:'2027-10-05' }])
  render(<RecruitmentIntakeLinks organisationId="org" leadId="lead" eligible={false} />)
  expect(screen.getByRole('button',{name:'Create private link'}).disabled).toBe(true)
  fireEvent.click(await screen.findByRole('button',{name:'Revoke link'}))
  await waitFor(() => expect(revokeRecruitmentIntakeLink).toHaveBeenCalledWith('org','link'))
})
