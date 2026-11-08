import { beforeEach, expect, test, vi } from 'vitest'
import { getClientMarketingWorkspace, saveClientMarketingTags } from '../emailCampaignService'
const api = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: api }))
beforeEach(() => vi.resetAllMocks())
const client = { identityId: 'person', email: '', phone: '0821234567' }

test('saves phone-only shared tags through a versioned client API without fabricating an email', async () => {
  api.rpc.mockResolvedValue({ data: { tags: ['investor'], tagVersion: 9 }, error: null })
  expect(await saveClientMarketingTags({ organisationId: 'developer', client, tagVersion: 8, tags: [' Investor ', 'investor'] })).toEqual({ tags: ['investor'], tagVersion: 9 })
  expect(api.rpc).toHaveBeenCalledWith('client_tags_save', { p_organisation_id: 'developer', p_client_id: 'person', p_expected_version: 8, p_tags: ['investor'] })
  expect(api.from).not.toHaveBeenCalled()
})

test('requires a shared profile, loaded revision and bounded tags before writing', async () => {
  await expect(saveClientMarketingTags({ organisationId: 'agency', client: {}, tags: [] })).rejects.toThrow('shared profile')
  await expect(saveClientMarketingTags({ organisationId: 'agency', client, tags: [] })).rejects.toThrow('Refresh client tags')
  await expect(saveClientMarketingTags({ organisationId: 'agency', client, tagVersion: 1, tags: ['x'.repeat(61)] })).rejects.toThrow('100 tags')
  expect(api.rpc).not.toHaveBeenCalled()
})

test('conflicting tag edits are surfaced without automatic overwrite or retry', async () => {
  api.rpc.mockResolvedValue({ error: { code: '40001', message: 'Client tags changed. Refresh before saving.' } })
  await expect(saveClientMarketingTags({ organisationId: 'agency', client, tagVersion: 1, tags: ['mine'] })).rejects.toMatchObject({ code: '40001' })
  expect(api.rpc).toHaveBeenCalledOnce()
})

test('reads every retained alias in bounded requests and uses shared tags for matching', async () => {
  const emails = Array.from({ length: 501 }, (_, i) => i ? `alias-${i}@example.test` : 'primary@example.test')
  api.rpc.mockResolvedValue({ data: { clientId: 'person', tagVersion: 3, tags: ['combined'], emails } })
  const rows = emails.map((email, i) => ({ id: `contact-${i}`, email, tags: ['legacy'] }))
  let selected = []
  const contactQuery = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn() }
  for (const key of ['select', 'eq', 'order']) contactQuery[key].mockReturnValue(contactQuery)
  contactQuery.in.mockImplementation((_key, values) => { selected = values; return contactQuery })
  contactQuery.limit.mockImplementation(() => Promise.resolve({ data: rows.filter(row => selected.includes(row.email)) }))
  const audienceQuery = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn().mockResolvedValue({ data: [] }) }
  for (const key of ['select', 'eq', 'is']) audienceQuery[key].mockReturnValue(audienceQuery)
  api.from.mockImplementation(name => name === 'email_marketing_contacts' ? contactQuery : audienceQuery)
  const result = await getClientMarketingWorkspace({ organisationId: 'agency', clientId: 'person', email: 'primary@example.test' })
  expect(result.marketingContacts).toHaveLength(501)
  expect(result.marketingContacts.every(contact => contact.tags.join() === 'combined')).toBe(true)
  expect(contactQuery.in.mock.calls.flatMap(call => call[1])).toEqual(emails)
  expect(contactQuery.in.mock.calls.every(call => call[1].length <= 100)).toBe(true)
  expect(contactQuery.eq).toHaveBeenCalledWith('organisation_id', 'agency')
})

test('failed shared-profile access never falls back to an email lookup', async () => {
  api.rpc.mockResolvedValue({ error: { code: '42501', message: 'Client access required.' } })
  await expect(getClientMarketingWorkspace({ organisationId: 'other', clientId: 'person', email: 'private@example.test' })).rejects.toMatchObject({ code: '42501' })
  expect(api.from).not.toHaveBeenCalled()
})

test('phone-only audience memberships use the shared person identity and never email sampling', async () => {
  const { getClientSharedAudienceMemberships } = await import('../emailCampaignService')
  api.rpc.mockResolvedValue({ data: [{ id: 'shared', name: 'Phone buyers' }] })
  expect(await getClientSharedAudienceMemberships({ organisationId: 'developer', clientId: 'person' })).toEqual([{ id: 'shared', name: 'Phone buyers' }])
  expect(api.rpc).toHaveBeenCalledWith('client_audience_memberships', { p_org: 'developer', p_client: 'person' })
  expect(api.from).not.toHaveBeenCalled()
})
