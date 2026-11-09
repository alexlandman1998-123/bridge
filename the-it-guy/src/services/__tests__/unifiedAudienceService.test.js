import { beforeEach, expect, test, vi } from 'vitest'
import { archiveEmailAudience, getEmailCampaignWorkspace, saveEmailAudience } from '../emailCampaignService'
const api = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), calls: [] }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: api.from, rpc: api.rpc } }))
const org = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  vi.clearAllMocks(); api.calls.length = 0
  api.rpc.mockImplementation(async name => ({ data: name === 'marketing_audience_validate' ? true : { ready: false } }))
  api.from.mockImplementation(table => {
    const call = { table, filters: [] }; api.calls.push(call)
    const q = { insert(value) { call.insert = value; return q }, update(value) { call.update = value; return q }, eq(key, value) { call.filters.push([key, value]); return q }, is() { return q }, select() { return q }, single: async () => ({ data: { id: 'saved' } }), maybeSingle: async () => ({ data: { id: 'saved' } }) }
    return q
  })
})
test('email targeting saves once in the canonical catalogue with exact restrictions and personal visibility', async () => {
  const filter = { branch_id: 'branch', assigned_user_id: 'staff', contact_ids: ['selected'] }
  await saveEmailAudience({ organisationId: org, userId: 'cannot-spoof-creator', audience: { name: 'Precise targeting', filterJson: filter } })
  expect(api.calls).toEqual([{ table: 'marketing_audiences', filters: [], insert: { name: 'Precise targeting', description: '', organisation_id: org, visibility: 'personal', definition: { emailFilter: filter } } }])
})
test('legacy compatibility writes require a loaded revision and archive the same canonical row', async () => {
  await expect(saveEmailAudience({ organisationId: org, audience: { id: 'saved', name: 'Stale' } })).rejects.toThrow('Refresh')
  await expect(archiveEmailAudience({ organisationId: org, audienceId: 'saved' })).rejects.toThrow('Refresh')
  expect(api.from).not.toHaveBeenCalled()
  await archiveEmailAudience({ organisationId: org, audienceId: 'saved', revision: 4 })
  expect(api.calls[0]).toMatchObject({ table: 'marketing_audiences', filters: [['organisation_id', org], ['id', 'saved'], ['revision', 4]], update: { revision: 5 } })
})

test('new saved selections carry the loaded audience revision', async () => {
  api.rpc.mockImplementation(async name => ({ data: name === 'email_campaign_can_send' ? false : { ready: false } }))
  api.from.mockImplementation(table => {
    const q = { select() { return q }, eq() { return q }, is() { return q }, order() { return q }, limit() { return q }, range() { return q }, maybeSingle: async () => ({ data: null }), then(resolve) { return Promise.resolve({ data: table === 'email_saved_audiences' ? [{ id: 'saved', revision: 4, filter_json: {} }] : [] }).then(resolve) } }
    return q
  })
  const workspace = await getEmailCampaignWorkspace(org)
  expect(workspace.savedAudiences[0].filter_json).toEqual({ saved_audience_id: 'saved', audience_revision: 4 })
  expect(workspace.canSend).toBe(false)
})
