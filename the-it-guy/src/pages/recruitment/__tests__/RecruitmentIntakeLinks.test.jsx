// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import RecruitmentIntakeLinks from '../RecruitmentIntakeLinks'
import { createRecruitmentIntakeLink, listRecruitmentIntakeLinks } from '../../../services/recruitmentIntakeService'

vi.mock('../../../services/recruitmentIntakeService', () => ({
  createRecruitmentIntakeLink: vi.fn(), listRecruitmentIntakeLinks: vi.fn(), revokeRecruitmentIntakeLink: vi.fn(),
}))
vi.mock('../RecruitmentInvitationDelivery', () => ({ default: () => null }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('keeps a failed link action visible when an older invitation list finishes loading', async () => {
  let resolveList
  vi.mocked(listRecruitmentIntakeLinks).mockReturnValueOnce(new Promise(resolve => { resolveList = resolve })).mockResolvedValue([])
  vi.mocked(createRecruitmentIntakeLink).mockRejectedValue(new Error('The application link could not be prepared.'))
  render(<RecruitmentIntakeLinks organisationId="org" leadId="lead" />)
  fireEvent.click(screen.getByRole('button', { name: 'Create private link' }))
  expect((await screen.findByRole('alert')).textContent).toContain('The application link could not be prepared.')
  await act(async () => { resolveList([]) })
  expect(screen.getByRole('alert').textContent).toContain('The application link could not be prepared.')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(createRecruitmentIntakeLink).toHaveBeenCalledOnce()
})
