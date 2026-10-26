// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ load: vi.fn(), create: vi.fn(), revoke: vi.fn(), apply: vi.fn() }))
vi.mock('../../../services/campaignResponseLinkService', () => ({ loadCampaignResponseLinks: mocks.load, createCampaignResponseLink: mocks.create, revokeCampaignResponseLink: mocks.revoke }))
vi.mock('../../../services/campaignResponsePlaybook', () => ({ applyCampaignResponseToPlaybook: mocks.apply }))
vi.mock('../MarketingNavigation', () => ({ MarketingLink: ({ to, children }) => <a href={to}>{children}</a> }))
import CampaignResponseLink from '../CampaignResponseLink'
const campaign = { id: 'campaign', organisation_id: 'org', revision: 2, goal: 'seller_leads' }
const link = { id: 'link', purpose: 'valuation', status: 'active', campaignRevision: 2, followUpDays: 1, url: 'https://app.example.test/intake/agent?campaignResponse=opaque' }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.load.mockResolvedValue({ intakeLinks: [{ id: 'buyer', label: 'Buyers only', enabledIntents: ['buy'] }, { id: 'seller', label: 'My seller form', enabledIntents: ['sell'] }], links: [], notice: '' })
  mocks.create.mockResolvedValue(link)
  mocks.apply.mockResolvedValue({ ...campaign, revision: 3 })
})
afterEach(cleanup)
it('offers only compatible public forms and creates the reviewed follow-up route without sending', async () => {
  render(<CampaignResponseLink campaign={campaign} userId="agent" canEdit />)
  const create = await screen.findByRole('button', { name: 'Create response link' })
  expect(screen.queryByRole('option', { name: 'Buyers only' })).toBeNull()
  fireEvent.change(screen.getByLabelText('Follow up after submission'), { target: { value: '0' } })
  fireEvent.click(create)
  await waitFor(() => expect(mocks.create).toHaveBeenCalledWith('org', 'agent', campaign, { intakeLinkId: 'seller', purpose: 'valuation', followUpDays: 0 }))
  expect(mocks.apply).not.toHaveBeenCalled()
})
it('adds the response link to the saved playbook only after an explicit action', async () => {
  const onSaved = vi.fn(), onPlaybook = vi.fn()
  mocks.load.mockResolvedValue({ intakeLinks: [], links: [link] })
  render(<CampaignResponseLink campaign={campaign} userId="agent" canEdit onSaved={onSaved} onPlaybook={onPlaybook} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Use in playbook' }))
  await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith(campaign, link))
  expect(onSaved).toHaveBeenCalled()
  expect(onPlaybook).toHaveBeenCalled()
})
it('keeps active previous-revision URLs reviewable and revocable without silently editing current copy', async () => {
  const old = { ...link, campaignRevision: 1 }
  mocks.load.mockResolvedValue({ intakeLinks: [], links: [old] })
  render(<CampaignResponseLink campaign={campaign} userId="agent" canEdit />)
  expect((await screen.findByRole('button', { name: 'Use in playbook' })).disabled).toBe(true)
  expect(screen.getByRole('link', { name: /Review form/ }).getAttribute('href')).toBe(link.url)
  fireEvent.click(screen.getByRole('button', { name: 'Disable link' }))
  await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith('org', 'agent', campaign, old))
  expect(mocks.apply).not.toHaveBeenCalled()
})
it('does not expose mutation controls to a campaign viewer', async () => {
  mocks.load.mockResolvedValue({ intakeLinks: [], links: [link] })
  render(<CampaignResponseLink campaign={campaign} userId="viewer" canEdit={false} />)
  await screen.findByRole('link', { name: /Review form/ })
  expect(screen.queryByRole('button', { name: 'Create response link' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Disable link' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Use in playbook' })).toBeNull()
})
it('shows a connection failure rather than a fabricated form or successful link', async () => {
  mocks.load.mockRejectedValue(new Error('Campaign response storage is unavailable.'))
  render(<CampaignResponseLink campaign={campaign} userId="agent" canEdit />)
  expect((await screen.findByRole('alert')).textContent).toContain('storage is unavailable')
  expect(screen.queryByRole('button', { name: 'Create response link' })).toBeNull()
})
it('does not navigate or refresh a different campaign when an old apply finishes', async () => {
  let finish
  mocks.load.mockResolvedValue({ intakeLinks: [], links: [link] })
  mocks.apply.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const onSaved = vi.fn(), onPlaybook = vi.fn()
  const { unmount } = render(<CampaignResponseLink campaign={campaign} userId="agent" canEdit onSaved={onSaved} onPlaybook={onPlaybook} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Use in playbook' }))
  await waitFor(() => expect(mocks.apply).toHaveBeenCalled())
  unmount()
  await act(async () => finish({ ...campaign, revision: 3 }))
  expect(onSaved).not.toHaveBeenCalled()
  expect(onPlaybook).not.toHaveBeenCalled()
})
