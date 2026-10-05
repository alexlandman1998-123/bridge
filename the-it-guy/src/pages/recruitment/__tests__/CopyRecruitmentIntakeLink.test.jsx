// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CopyRecruitmentIntakeLink from '../CopyRecruitmentIntakeLink'
import { createRecruitmentIntakeLink } from '../../../services/recruitmentIntakeService'
vi.mock('../../../services/recruitmentIntakeService', () => ({ createRecruitmentIntakeLink: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })
const link = { url: 'https://app.example.test/join-us/sample', expires_at: '2099-10-05' }

it('copies a public intake link and reuses it on subsequent clicks', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  vi.mocked(createRecruitmentIntakeLink).mockResolvedValue(link)
  render(<CopyRecruitmentIntakeLink organisationId="org" />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy Intake Link' }))
  await screen.findByText('Link Copied')
  expect(createRecruitmentIntakeLink).toHaveBeenCalledWith('org', 'public_link')
  expect(writeText).toHaveBeenCalledWith(link.url)
  fireEvent.click(screen.getByRole('button', { name: 'Copy Intake Link' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
  expect(createRecruitmentIntakeLink).toHaveBeenCalledTimes(1)
})

it('retains the prepared link for manual copying if clipboard access fails', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } })
  vi.mocked(createRecruitmentIntakeLink).mockResolvedValue(link)
  render(<CopyRecruitmentIntakeLink organisationId="org" />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy Intake Link' }))
  expect((await screen.findByLabelText('Intake link to copy')).value).toBe(link.url)
  expect(screen.queryByText('Link Copied')).toBeNull()
  expect(screen.getByRole('alert').textContent).toContain('Select and copy')
})

it('shows creation errors without reporting that a link was copied', async () => {
  vi.mocked(createRecruitmentIntakeLink).mockRejectedValue(new Error('Check your organisation access.'))
  render(<CopyRecruitmentIntakeLink organisationId="org" />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy Intake Link' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Check your organisation access.')
  expect(screen.queryByText('Link Copied')).toBeNull()
  expect(screen.queryByLabelText('Intake link to copy')).toBeNull()
})
