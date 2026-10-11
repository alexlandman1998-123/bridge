// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ClientCampaignPanel from './ClientCampaignPanel'
import { loadClientCampaigns, logClientCampaignResponse } from '../../services/clientCampaignService'
vi.mock('../../services/clientCampaignService', async original => ({ ...await original(), loadClientCampaigns: vi.fn(), logClientCampaignResponse: vi.fn() }))
const client = { identityId: 'a', organisationId: 'agency', identityVersion: 1 }
const campaign = { id: 'recipient-a', campaign_id: 'launch', campaign_name: 'Lyle launch', subject: 'Launch news', email: 'a@example.test', status: 'clicked', created_at: '2026-10-01', sent_at: '2026-10-02', opened_at: '2026-10-03', clicked_at: '2026-10-03', open_count: 2, click_count: 1, response_count: 0, responses: [] }
const result = { available: true, campaigns: [campaign], summary: { campaignCount: 1, sentCount: 1, clickedCount: 1, respondedCount: 0 }, nextCursor: null }
beforeEach(() => { loadClientCampaigns.mockResolvedValue(result); logClientCampaignResponse.mockResolvedValue('saved-response') })
afterEach(() => { cleanup(); vi.clearAllMocks() })
test('shows addressed campaign evidence and distinguishes tracking signals from confirmed responses', async () => {
  render(<ClientCampaignPanel client={client} />)
  await screen.findByText('Lyle launch')
  expect(screen.getByText('To a@example.test')).toBeTruthy()
  expect(screen.getByText('2 recorded opens · 1 recorded clicks')).toBeTruthy()
  expect(screen.getByText('No confirmed response recorded')).toBeTruthy()
  expect(screen.getByText(/They do not confirm a reply/)).toBeTruthy()
  expect(screen.getByText('Campaigns with a confirmed response')).toBeTruthy()
})
test('records a staff-confirmed reply then refreshes history and activity without sending email', async () => {
  const changed = vi.fn()
  render(<ClientCampaignPanel client={client} onChanged={changed} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Record response for Lyle launch' }))
  fireEvent.change(screen.getByLabelText('Response details'), { target: { value: 'Replied directly to the launch email.' } })
  fireEvent.change(screen.getByLabelText('Response time'), { target: { value: '2026-10-04T10:00' } })
  loadClientCampaigns.mockResolvedValue({ ...result, campaigns: [{ ...campaign, response_count: 1, responses: [{ id: 'response', response_kind: 'email_reply', detail: 'Replied directly to the launch email.', occurred_at: '2026-10-04T10:00:00Z' }] }] })
  fireEvent.click(screen.getByRole('button', { name: 'Save confirmed response' }))
  await screen.findByText('1 confirmed response')
  expect(screen.getByText('Email reply · Staff confirmed')).toBeTruthy()
  expect(logClientCampaignResponse).toHaveBeenCalledWith(client, expect.objectContaining({ recipientId: 'recipient-a', kind: 'email_reply', detail: 'Replied directly to the launch email.', requestId: expect.any(String) }))
  await waitFor(() => expect(changed).toHaveBeenCalledWith('a'))
})
test('retrying an uncertain save keeps the same request ID and entry', async () => {
  logClientCampaignResponse.mockRejectedValueOnce(new Error('Network unavailable'))
  render(<ClientCampaignPanel client={client} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Record response for Lyle launch' }))
  fireEvent.change(screen.getByLabelText('Response details'), { target: { value: 'Confirmed reply' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save confirmed response' }))
  await screen.findByText('Network unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Save confirmed response' }))
  await screen.findByText(/Confirmed response saved/)
  expect(logClientCampaignResponse.mock.calls[0]).toEqual(logClientCampaignResponse.mock.calls[1])
})
test('older pages deduplicate recipient records and retain summary totals', async () => {
  loadClientCampaigns.mockResolvedValueOnce({ ...result, nextCursor: { id: campaign.id, created_at: campaign.created_at } }).mockResolvedValueOnce({ ...result, campaigns: [campaign, { ...campaign, id: 'recipient-b', campaign_name: 'Harbour launch' }], summary: null })
  render(<ClientCampaignPanel client={client} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Load older campaigns' }))
  await screen.findByText('Harbour launch')
  expect(screen.getAllByText('Lyle launch')).toHaveLength(1)
  expect(screen.getByText('Emails sent')).toBeTruthy()
  expect(loadClientCampaigns).toHaveBeenLastCalledWith({ identityId: 'a', organisationId: 'agency' }, { cursor: { id: campaign.id, created_at: campaign.created_at }, includeSummary: false })
})
test('queued deliveries cannot be marked as responded and React escapes response content', async () => {
  loadClientCampaigns.mockResolvedValue({ ...result, campaigns: [{ ...campaign, sent_at: null, status: 'queued', response_count: 1, responses: [{ id: 'r', response_kind: 'enquiry', detail: '<img src=x onerror=alert(1)>', occurred_at: '2026-10-03' }] }] })
  const { container } = render(<ClientCampaignPanel client={client} />)
  await screen.findByText('<img src=x onerror=alert(1)>')
  expect(container.querySelector('img')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Record response for Lyle launch' })).toBeNull()
})
test('setup, empty history and denied reads remain distinct', async () => {
  loadClientCampaigns.mockResolvedValueOnce({ available: false, campaigns: [], summary: null })
  const { unmount } = render(<ClientCampaignPanel client={client} />)
  await screen.findByText(/awaiting database setup/)
  expect(screen.queryByText('No matching campaigns visible yet.')).toBeNull()
  unmount(); loadClientCampaigns.mockRejectedValueOnce(new Error('Access denied'))
  render(<ClientCampaignPanel client={client} />)
  await screen.findByText('Access denied')
  expect(screen.queryByText('No matching campaigns visible yet.')).toBeNull()
})
test('switching clients rejects delayed history from the old profile', async () => {
  let resolveOld
  loadClientCampaigns.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce({ ...result, campaigns: [] })
  const { rerender } = render(<ClientCampaignPanel client={client} />)
  rerender(<ClientCampaignPanel client={{ ...client, identityId: 'b' }} />)
  await screen.findByText('No matching campaigns visible yet.')
  resolveOld(result)
  await waitFor(() => expect(screen.queryByText('Lyle launch')).toBeNull())
})
test('a delayed save from the old client cannot update the newly selected profile', async () => {
  let finishSave
  logClientCampaignResponse.mockReturnValueOnce(new Promise(resolve => { finishSave = resolve }))
  const changed = vi.fn()
  const { rerender } = render(<ClientCampaignPanel client={client} onChanged={changed} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Record response for Lyle launch' }))
  fireEvent.change(screen.getByLabelText('Response details'), { target: { value: 'Confirmed reply' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save confirmed response' }))
  loadClientCampaigns.mockResolvedValueOnce({ ...result, campaigns: [] })
  rerender(<ClientCampaignPanel client={{ ...client, identityId: 'b' }} onChanged={changed} />)
  await screen.findByText('No matching campaigns visible yet.')
  finishSave('saved-response')
  await waitFor(() => expect(changed).not.toHaveBeenCalled())
  expect(screen.queryByText(/Confirmed response saved/)).toBeNull()
})
