import { beforeEach, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), auth: { getUser: vi.fn() } }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: runtime }))
import { ensureEmailCampaignPlan } from '../emailCampaignPlanService'
const saved = { id: 'email', organisation_id: 'org', created_by: 'agent', status: 'draft', updated_at: '2026-10-25T20:00:00Z', name: 'Home', subject: 'Manual subject', content_json: { version: 1, blocks: [{ text: 'My manual text' }], ai_campaign: { objective: 'new_listing' } } }
const reference = { id: 'plan', revision: 1 }
beforeEach(() => {
  vi.clearAllMocks()
  runtime.auth.getUser.mockResolvedValue({ data: { user: { id: 'agent' } } })
  runtime.rpc.mockResolvedValue({ data: { campaign_id: 'plan', revision: 1, reference, email_updated_at: '2026-10-25T20:00:01Z' } })
})
it('links the exact saved email without replacing document blocks or copy', async () => {
  const result = await ensureEmailCampaignPlan('org', 'agent', saved)
  expect(runtime.rpc).toHaveBeenCalledWith('marketing_campaign_ensure_email_plan', { p_email: 'email', p_expected_updated_at: saved.updated_at })
  expect(result.content_json.blocks).toEqual(saved.content_json.blocks)
  expect(result.subject).toBe('Manual subject')
  expect(result.content_json.arch9_campaign).toEqual(reference)
  expect(result.updated_at).toBe('2026-10-25T20:00:01Z')
  expect(saved.content_json.arch9_campaign).toBeUndefined()
})
it('leaves existing parent links and ordinary manual drafts alone', async () => {
  for (const row of [{ ...saved, content_json: { version: 1 } }, { ...saved, content_json: { ...saved.content_json, arch9_campaign: reference } }])
    expect(await ensureEmailCampaignPlan('org', 'agent', row)).toBe(row)
  expect(runtime.rpc).not.toHaveBeenCalled()
})
it('rejects a changed actor or agency before invoking the link', async () => {
  await expect(ensureEmailCampaignPlan('different', 'agent', saved)).rejects.toThrow('current agency')
  runtime.auth.getUser.mockResolvedValue({ data: { user: { id: 'different' } } })
  await expect(ensureEmailCampaignPlan('org', 'agent', saved)).rejects.toThrow('account changed')
  expect(runtime.rpc).not.toHaveBeenCalled()
})
it('explains activation failures without claiming a lost email draft', async () => {
  runtime.rpc.mockResolvedValue({ error: { code: 'PGRST202' } })
  await expect(ensureEmailCampaignPlan('org', 'agent', saved)).rejects.toThrow('The email is saved. Campaign linking needs its database update')
  expect(runtime.from).not.toHaveBeenCalled()
})
it('recovers an interrupted link only when both the exact email intent and database association match', async () => {
  runtime.rpc.mockResolvedValue({ error: { message: 'Lost response' } })
  let changed = false
  runtime.from.mockImplementation((table) => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === 'email_campaigns' ? { ...saved, ...(changed ? { subject: 'Concurrent change' } : {}), content_json: { ...saved.content_json, arch9_campaign: reference } } : { campaign_id: 'plan' } }) }
    return query
  })
  expect((await ensureEmailCampaignPlan('org', 'agent', saved)).content_json.arch9_campaign).toEqual(reference)
  changed = true
  await expect(ensureEmailCampaignPlan('org', 'agent', saved)).rejects.toThrow('Lost response')
})
