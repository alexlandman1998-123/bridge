// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ClientMarketingTagsPanel from './ClientMarketingTagsPanel'
import { getClientAudienceMemberships, getClientMarketingWorkspace, saveClientMarketingTags } from '../../services/emailCampaignService'
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true }))
vi.mock('../../services/emailCampaignService', () => ({ getClientAudienceMemberships: vi.fn(), getClientMarketingWorkspace: vi.fn(), saveClientMarketingTags: vi.fn() }))
const client = { id: 'a', organisationId: 'agency', email: 'a@example.test', identityVersion: 1 }
beforeEach(() => { getClientAudienceMemberships.mockResolvedValue([]); getClientMarketingWorkspace.mockResolvedValue({ marketingContact: { tags: ['launch'] } }); saveClientMarketingTags.mockImplementation(async ({ tags }) => ({ tags })) })
afterEach(() => { cleanup(); vi.clearAllMocks() })
test('failed reads block writes until a successful refresh loads the existing tags', async () => {
  getClientMarketingWorkspace.mockRejectedValueOnce(new Error('Access denied'))
  render(<ClientMarketingTagsPanel client={client} />)
  await screen.findByText('Access denied')
  expect(screen.getByRole('button', { name: 'Save tags' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh tags' }))
  await screen.findByText('launch')
  expect(screen.getByRole('button', { name: 'Save tags' }).disabled).toBe(false)
  expect(saveClientMarketingTags).not.toHaveBeenCalled()
})
test('an uncertain save keeps tag edits and allows retry without changing agency or contact', async () => {
  saveClientMarketingTags.mockRejectedValueOnce(new Error('Network timeout'))
  render(<ClientMarketingTagsPanel client={client} />)
  await screen.findByText('launch')
  fireEvent.change(screen.getByLabelText('Add a client tag'), { target: { value: 'SHOW-DAY' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save tags' }))
  await screen.findByText('Network timeout')
  expect(screen.getByText('show-day')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Save tags' }))
  await screen.findByText('Client tags saved.')
  expect(saveClientMarketingTags.mock.calls[0]).toEqual(saveClientMarketingTags.mock.calls[1])
  expect(saveClientMarketingTags.mock.calls[1][0]).toEqual({ organisationId: 'agency', client, tags: ['launch','show-day'] })
})
test('switching clients discards delayed tags from the old workspace', async () => {
  let resolveOld
  getClientMarketingWorkspace.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce({ marketingContact: { tags: ['new-client'] } })
  const { rerender } = render(<ClientMarketingTagsPanel client={client} />)
  rerender(<ClientMarketingTagsPanel client={{ ...client, id: 'b', email: 'b@example.test' }} />)
  await screen.findByText('new-client')
  resolveOld({ marketingContact: { tags: ['private-old-tag'] } })
  await waitFor(() => expect(screen.queryByText('private-old-tag')).toBeNull())
  expect(screen.getByText('new-client')).toBeTruthy()
})
test('a client without an email cannot fetch or save marketing tags', async () => {
  render(<ClientMarketingTagsPanel client={{ ...client, email: '' }} />)
  await screen.findByText('Add an email address to this client before assigning marketing tags.')
  expect(getClientMarketingWorkspace).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Save tags' }).disabled).toBe(true)
})

test('audience memberships update from confirmed saved tags, while draft edits keep the saved memberships', async () => {
  const audience = { id: 'audience', name: 'Show-day guests' }
  getClientMarketingWorkspace.mockResolvedValueOnce({ marketingContact: { tags: ['launch'] }, savedAudiences: [audience] })
  getClientAudienceMemberships.mockImplementation(async ({ marketingContact }) => marketingContact.tags.includes('show-day') ? [audience] : [])
  render(<ClientMarketingTagsPanel client={client} />)
  await screen.findByText('No audience memberships yet')
  fireEvent.change(screen.getByLabelText('Add a client tag'), { target: { value: 'show-day' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
  expect(screen.queryByText('Show-day guests')).toBeNull()
  expect(getClientAudienceMemberships).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Save tags' }))
  await screen.findByText('Show-day guests')
  expect(getClientAudienceMemberships).toHaveBeenLastCalledWith({ organisationId: 'agency', marketingContact: { tags: ['launch', 'show-day'] }, savedAudiences: [audience] })
})

test('failed audience matching shows an error without claiming no membership or blocking tag edits', async () => {
  getClientAudienceMemberships.mockRejectedValueOnce(new Error('Audience lookup failed'))
  render(<ClientMarketingTagsPanel client={client} />)
  await screen.findByText('Audience lookup failed')
  expect(screen.queryByText('No audience memberships yet')).toBeNull()
  expect(screen.getByRole('button', { name: 'Save tags' }).disabled).toBe(false)
})
