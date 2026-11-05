// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ClientMarketingTagsPanel from './ClientMarketingTagsPanel'
import { getClientSharedAudienceMemberships, getClientMarketingWorkspace, saveClientMarketingTags } from '../../services/emailCampaignService'
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true }))
vi.mock('../../services/emailCampaignService', () => ({ getClientSharedAudienceMemberships: vi.fn(), getClientMarketingWorkspace: vi.fn(), saveClientMarketingTags: vi.fn() }))
const client = { id: 'a', organisationId: 'agency', email: 'a@example.test', identityId: 'person-a', identityVersion: 1 }
beforeEach(() => { getClientSharedAudienceMemberships.mockResolvedValue([]); getClientMarketingWorkspace.mockResolvedValue({ tags: ['launch'], tagVersion: 1, marketingContact: { tags: ['launch'] } }); saveClientMarketingTags.mockImplementation(async ({ tags }) => ({ tags, tagVersion: 2 })) })
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
  expect(saveClientMarketingTags.mock.calls[1][0]).toEqual({ organisationId: 'agency', client, tags: ['launch','show-day'], tagVersion: 1 })
})
test('switching clients discards delayed tags from the old workspace', async () => {
  let resolveOld
  getClientMarketingWorkspace.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce({ tags: ['new-client'], tagVersion: 1, marketingContact: { tags: ['new-client'] } })
  const { rerender } = render(<ClientMarketingTagsPanel client={client} />)
  rerender(<ClientMarketingTagsPanel client={{ ...client, id: 'b', email: 'b@example.test' }} />)
  await screen.findByText('new-client')
  resolveOld({ tags: ['private-old-tag'], tagVersion: 1, marketingContact: { tags: ['private-old-tag'] } })
  await waitFor(() => expect(screen.queryByText('private-old-tag')).toBeNull())
  expect(screen.getByText('new-client')).toBeTruthy()
})
test('a phone-only client can load and save shared tags without an email', async () => {
  getClientMarketingWorkspace.mockResolvedValueOnce({ tags: ['phone-client'], tagVersion: 4, marketingContacts: [] })
  render(<ClientMarketingTagsPanel client={{ ...client, email: '' }} />)
  await screen.findByText('phone-client')
  expect(screen.getByRole('button', { name: 'Save tags' }).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Save tags' }))
  await screen.findByText('Client tags saved.')
  expect(saveClientMarketingTags).toHaveBeenCalledWith({ organisationId: 'agency', client: { ...client, email: '' }, tags: ['phone-client'], tagVersion: 4 })
  expect(getClientSharedAudienceMemberships).toHaveBeenCalledWith({ organisationId: 'agency', clientId: 'person-a' })
})

test('a client without a shared profile cannot fall back to address-only tag writes', async () => {
  render(<ClientMarketingTagsPanel client={{ ...client, identityId: null }} />)
  await screen.findByText('Refresh this client to load its shared profile before assigning tags.')
  expect(getClientMarketingWorkspace).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Save tags' }).disabled).toBe(true)
})

test('audience memberships update from confirmed saved tags, while draft edits keep the saved memberships', async () => {
  const audience = { id: 'audience', name: 'Show-day guests' }
  getClientMarketingWorkspace.mockResolvedValueOnce({ tags: ['launch'], tagVersion: 1, marketingContact: { tags: ['launch'] }, savedAudiences: [audience] })
  getClientSharedAudienceMemberships.mockResolvedValueOnce([]).mockResolvedValueOnce([audience])
  render(<ClientMarketingTagsPanel client={client} />)
  await screen.findByText('No audience memberships yet')
  fireEvent.change(screen.getByLabelText('Add a client tag'), { target: { value: 'show-day' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
  expect(screen.queryByText('Show-day guests')).toBeNull()
  expect(getClientSharedAudienceMemberships).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Save tags' }))
  await screen.findByText('Show-day guests')
  expect(getClientSharedAudienceMemberships).toHaveBeenLastCalledWith({ organisationId: 'agency', clientId: 'person-a' })
})

test('failed audience matching shows an error without claiming no membership or blocking tag edits', async () => {
  getClientSharedAudienceMemberships.mockRejectedValueOnce(new Error('Audience lookup failed'))
  render(<ClientMarketingTagsPanel client={client} />)
  await screen.findByText('Audience lookup failed')
  expect(screen.queryByText('No audience memberships yet')).toBeNull()
  expect(screen.getByRole('button', { name: 'Save tags' }).disabled).toBe(false)
})

test('combines audience memberships across aliases without duplicating them', async () => {
  const shared = { id: 'shared', name: 'Shared audience' }
  const alias = { id: 'alias', name: 'Alias audience' }
  getClientMarketingWorkspace.mockResolvedValueOnce({ tags: ['person-tag'], tagVersion: 1, marketingContacts: [{ id: 'primary', tags: ['person-tag'] }, { id: 'alias', tags: ['person-tag'] }], savedAudiences: [shared, alias] })
  getClientSharedAudienceMemberships.mockResolvedValueOnce([shared, alias])
  render(<ClientMarketingTagsPanel client={client} />)
  await screen.findByText('Alias audience')
  expect(screen.getAllByText('Shared audience')).toHaveLength(1)
})

test('a conflicting save keeps edits until an explicit refresh loads the newer version', async () => {
  saveClientMarketingTags.mockRejectedValueOnce(new Error('Client tags changed. Refresh before saving.'))
  render(<ClientMarketingTagsPanel client={client} />)
  await screen.findByText('launch')
  fireEvent.change(screen.getByLabelText('Add a client tag'), { target: { value: 'mine' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save tags' }))
  await screen.findByText('Client tags changed. Refresh before saving.')
  expect(screen.getByText('mine')).toBeTruthy()
  expect(saveClientMarketingTags).toHaveBeenCalledOnce()
  getClientMarketingWorkspace.mockResolvedValueOnce({ tags: ['colleague'], tagVersion: 8, marketingContacts: [] })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh tags' }))
  await screen.findByText('colleague')
  expect(screen.queryByText('mine')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save tags' }))
  await screen.findByText('Client tags saved.')
  expect(saveClientMarketingTags).toHaveBeenLastCalledWith(expect.objectContaining({ tags: ['colleague'], tagVersion: 8 }))
})
