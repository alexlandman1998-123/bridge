import { beforeEach, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({ from: vi.fn(), auth: { getUser: vi.fn() }, responses: {}, calls: [], intake: vi.fn(), card: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: runtime }))
vi.mock('../agencyPublicIntakeLinkService', () => ({ loadAgencyPublicIntakeLink: runtime.intake, loadAgencyAgentCardLink: runtime.card, buildAgencyPublicIntakeUrls: ({ slug }) => ({ buyerUrl: `https://example.com/${slug}?buy`, sellerUrl: `https://example.com/${slug}?sell` }) }))
import { loadCampaignSetup, saveCampaignSetup } from '../campaignSetupService'

beforeEach(() => {
  vi.clearAllMocks(); runtime.calls = []; runtime.responses = {}
  runtime.auth.getUser.mockResolvedValue({ data: { user: { id: 'user' } } })
  runtime.intake.mockResolvedValue({ link: null }); runtime.card.mockResolvedValue({ link: null })
  runtime.from.mockImplementation((table) => {
    runtime.calls.push(['table', table])
    const q = {}
    for (const method of ['select', 'eq', 'insert', 'update']) q[method] = (...args) => { runtime.calls.push([method, table, ...args]); return q }
    q.maybeSingle = async () => runtime.responses[table] || { data: null }
    return q
  })
})
it('scopes every setup read and source lookup to the agency and authenticated account', async () => {
  runtime.intake.mockResolvedValue({ link: { status: 'active', slug: 'oak', enabledIntents: ['buy'] } })
  const result = await loadCampaignSetup('agency', { userId: 'user' })
  expect(runtime.calls).toContainEqual(['eq', 'marketing_campaign_setup', 'organisation_id', 'agency'])
  expect(runtime.calls).toContainEqual(['eq', 'marketing_campaign_agent_setup', 'user_id', 'user'])
  expect(runtime.calls).toContainEqual(['eq', 'profiles', 'id', 'user'])
  expect(runtime.card).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 'agency', agentUserId: 'user' }))
  expect(result.sources.buyerUrl).toContain('oak')
  expect(result.sources.sellerUrl).toBe('')
})
it('fails clearly on missing setup storage without attempting a browser fallback or source mutation', async () => {
  runtime.responses.marketing_campaign_setup = { error: { code: '42P01' } }
  await expect(loadCampaignSetup('agency', { userId: 'user' })).rejects.toThrow('not enabled')
  expect(runtime.intake).not.toHaveBeenCalled()
  expect(runtime.calls.some(([method]) => ['insert', 'update'].includes(method))).toBe(false)
})
it('keeps saved preferences available when optional old profile fields cannot be read', async () => {
  runtime.responses.profiles = { error: { code: '42703' } }
  const result = await loadCampaignSetup('agency', { userId: 'user' })
  expect(result.warnings).toEqual(['Account details'])
})
it('uses a strict write allowlist, current actor and optimistic revision checks', async () => {
  runtime.responses.marketing_campaign_agent_setup = { data: { schema_version: 1, revision: 3 } }
  await saveCampaignSetup('agency', { kind: 'agent', userId: 'user', preferences: { name: 'Sarah', recipients: ['private@example.com'] }, source: { name: 'Sarah', identityNumber: 'private' }, record: { organisation_id: 'agency', user_id: 'user', revision: 2 } })
  const payload = runtime.calls.find(([method]) => method === 'update')[2]
  expect(payload.revision).toBe(3)
  expect(payload.preferences).not.toHaveProperty('recipients')
  expect(payload.source_snapshot).not.toHaveProperty('identityNumber')
  expect(payload).not.toHaveProperty('confirmed_preferences')
  expect(runtime.calls).toContainEqual(['eq', 'marketing_campaign_agent_setup', 'revision', 2])
  expect(runtime.calls).toContainEqual(['eq', 'marketing_campaign_agent_setup', 'user_id', 'user'])
})
it('retains edits on concurrent changes and rejects another agency or account before a write', async () => {
  await expect(saveCampaignSetup('agency', { preferences: {}, record: { organisation_id: 'other' } })).rejects.toThrow('current agency')
  expect(runtime.from).not.toHaveBeenCalled()
  await expect(saveCampaignSetup('agency', { preferences: {}, userId: 'old-user' })).rejects.toThrow('account changed')
  expect(runtime.from).not.toHaveBeenCalled()
  await expect(saveCampaignSetup('agency', { preferences: {}, record: { organisation_id: 'agency', revision: 1 } })).rejects.toThrow('another session')
})
it('rejects unsupported schema versions and incomplete confirmation before writing', async () => {
  runtime.responses.marketing_campaign_setup = { data: { schema_version: 2 } }
  await expect(loadCampaignSetup('agency')).rejects.toThrow('newer app version')
  runtime.calls = []
  await expect(saveCampaignSetup('agency', { complete: true, preferences: {} })).rejects.toThrow('public agency name')
  expect(runtime.calls).toEqual([])
})
