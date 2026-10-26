import { beforeEach, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  auth: { getUser: vi.fn() },
}))
vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: runtime,
}))
import {
  campaignPayload,
  channelProgress,
  loadMarketingCampaigns,
  saveMarketingCampaign,
  unlinkMarketingActivity,
} from '../marketingCampaignService'
let reads, result, calls, selections
const valid = {
  name: 'Seller leads',
  goal: 'seller_leads',
  objective: 'More valuations',
  planned_channels: ['email'],
  status: 'draft',
}
beforeEach(() => {
  vi.clearAllMocks()
  reads = []
  selections = []
  calls = []
  result = null
  runtime.auth.getUser.mockResolvedValue({ data: { user: { id: 'owner' } } })
  runtime.rpc.mockResolvedValue({ data: true })
  runtime.from.mockImplementation((table) => {
    const query = {
      select: vi.fn((columns) => { selections.push({ table, columns }); return query }),
      order: vi.fn(() => query),
      eq: vi.fn((key, value) => {
        reads.push({ table, key, value })
        return query
      }),
      in: vi.fn(() => query),
      range: vi.fn(async () => ({
        data:
          table === 'email_campaigns'
            ? [{ id: 'email-1', status: 'sent' }]
            : [],
      })),
      insert: vi.fn((value) => {
        calls.push({ table, insert: value })
        return query
      }),
      update: vi.fn((value) => {
        calls.push({ table, update: value })
        return query
      }),
      delete: vi.fn(() => query),
      maybeSingle: vi.fn(async () => result || { data: { id: 'saved' } }),
      then(resolve, reject) {
        return Promise.resolve(result || { data: [] }).then(resolve, reject)
      },
    }
    return query
  })
})
it('validates dates, channels, objectives and safe image URLs before writing', async () => {
  for (const changes of [
    { planned_channels: [] },
    { start_date: '2026-02-30' },
    { status: 'scheduled' },
    { start_date: '2026-10-24', end_date: '2026-10-22' },
    { cover_url: 'javascript:alert(1)' },
    { cover_url: 'https://user:secret@host/image.jpg' },
  ])
    expect(() => campaignPayload({ ...valid, ...changes })).toThrow()
  await expect(
    saveMarketingCampaign('org', { ...valid, name: '' }),
  ).rejects.toThrow('name')
  expect(runtime.from).not.toHaveBeenCalled()
})
it('scopes every read and requests email metrics only for visible send IDs', async () => {
  const workspace = await loadMarketingCampaigns('agency')
  expect(workspace.canManage).toBe(true)
  expect(runtime.rpc).toHaveBeenCalledWith('email_campaign_can_send', {
    p_organisation_id: 'agency',
  })
  expect(
    reads
      .filter((row) => row.key === 'organisation_id')
      .every((row) => row.value === 'agency'),
  ).toBe(true)
  const tableCalls = runtime.from.mock.calls.map(([table]) => table)
  expect(tableCalls).toContain('marketing_campaign_activities')
  expect(tableCalls).toContain('email_campaign_performance')
  const emailSummary = selections.find((selection) => selection.table === 'email_campaigns').columns
  expect(emailSummary).toContain('updated_at')
  expect(emailSummary).toContain('ai_listing_id:content_json->ai_campaign->>listing_id')
  expect(emailSummary).toContain('ai_objective:content_json->ai_campaign->>objective')
  expect(emailSummary).toContain('ai_event_id:content_json->ai_campaign->event->>id')
  expect(emailSummary.split(',')).not.toContain('content_json')
})
it('uses revisions to reject concurrent edits and never invokes a sending workflow', async () => {
  result = { data: null }
  await expect(
    saveMarketingCampaign('org', valid, { id: 'plan', revision: 4 }),
  ).rejects.toThrow('Reload')
  expect(calls[0].update.revision).toBe(5)
  expect(reads).toContainEqual({
    table: 'marketing_campaigns',
    key: 'revision',
    value: 4,
  })
  expect(runtime.rpc).not.toHaveBeenCalled()
})
it('does not report unavailable linked activity as sent or as a verified zero', () => {
  const workspace = {
    activities: [
      { campaign_id: 'plan', channel: 'email', email_campaign_id: 'hidden' },
    ],
    channels: { email: { data: [] } },
  }
  expect(channelProgress(workspace, { id: 'plan' }, 'email')).toBe(
    'Unavailable',
  )
  expect(channelProgress(workspace, { id: 'plan' }, 'meta')).toBe('Planned')
})
it('unlinks only the association with both agency and campaign constraints', async () => {
  result = { data: [{ id: 'link' }] }
  await unlinkMarketingActivity('agency', 'plan', 'link')
  expect(runtime.from).toHaveBeenCalledWith('marketing_campaign_activities')
  expect(reads).toEqual(
    expect.arrayContaining([
      {
        table: 'marketing_campaign_activities',
        key: 'organisation_id',
        value: 'agency',
      },
      {
        table: 'marketing_campaign_activities',
        key: 'campaign_id',
        value: 'plan',
      },
    ]),
  )
})

it('recovers an already-created plan after an uncertain create response', async () => {
  let request = 0
  runtime.from.mockImplementation(() => {
    const query = {
      insert: () => query,
      select: () => query,
      eq: () => query,
      maybeSingle: async () =>
        ++request === 1
          ? { error: { code: '23505' } }
          : { data: { id: 'stable-draft', name: valid.name } },
    }
    return query
  })
  await expect(
    saveMarketingCampaign('agency', { ...valid, id: 'stable-draft' }),
  ).resolves.toMatchObject({ id: 'stable-draft' })
})

it('validates optional manual budgets, preserves zero and leaves old campaigns compatible', () => {
  expect(campaignPayload(valid)).not.toHaveProperty('planned_budget')
  expect(campaignPayload({ ...valid, planned_budget: '0' })).toMatchObject({
    planned_budget: 0,
    budget_currency: 'ZAR',
  })
  expect(
    campaignPayload({ ...valid, planned_budget: '1250.50' }).planned_budget,
  ).toBe(1250.5)
  expect(
    campaignPayload({ ...valid, planned_budget: '' }).planned_budget,
  ).toBeNull()
  for (const amount of [
    '-1',
    'NaN',
    'Infinity',
    '1.234',
    '10000000000',
    '1e3',
  ]) {
    expect(() => campaignPayload({ ...valid, planned_budget: amount })).toThrow(
      /planned budget/,
    )
  }
  expect(() =>
    campaignPayload({ ...valid, planned_budget: '10', budget_currency: 'USD' }),
  ).toThrow(/ZAR/)
})

it('omits absent draft content when selecting channels before template storage is enabled', () => {
  expect(campaignPayload({ ...valid, planned_channels: ['email', 'whatsapp', 'meta'], channel_content: undefined })).not.toHaveProperty('channel_content')
  expect(campaignPayload({ ...valid, channel_content: {} })).toHaveProperty('channel_content', {})
})
it('persists only validated Just Listed metadata and gives a clear unreleased-storage error', async () => {
  const listing_builder = { version: 1, template: 'new-listing', listingId: '11111111-1111-4111-8111-111111111111', agentId: '', source: { title: 'Sunny home', sellerEmail: 'private@example.test' } }
  const input = { ...valid, goal: 'promote_listing', listing_builder }
  expect(campaignPayload(input).listing_builder.source.sellerEmail).toBeUndefined()
  expect(() => campaignPayload({ ...input, status: 'active' })).toThrow(/drafts/)
  result = { error: { code: 'PGRST204', message: 'listing_builder column missing' } }
  await expect(saveMarketingCampaign('org', input)).rejects.toThrow(/Just Listed builder is not enabled/)
})

it('keeps nullable builder columns compatible with older campaign rows',()=>{
 const payload=campaignPayload({...valid,listing_builder:null,campaign_builder:null})
 expect(payload).not.toHaveProperty('listing_builder')
 expect(payload).not.toHaveProperty('campaign_builder')
})
it('saves cleaned general snapshots only as drafts with matching goals',async()=>{
 const {cleanGeneralBuilder,generalCampaignCopy,generalCampaignPayload}=await import('../generalCampaignModel')
 const {createContactProvenance,GENERAL_CONTACT_FIELDS}=await import('../campaignContactProvenance')
 const source={agencyName:'Oak',agentName:'Sarah',destination:'sarah@example.test',language:'en-ZA'}
 const builder=cleanGeneralBuilder({version:1,template:'buyers',agentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',source,contactProvenance:{...createContactProvenance(source,GENERAL_CONTACT_FIELDS),confirmed:true},details:{area:'Gardens'},reviewed:true})
 const input=generalCampaignPayload(builder,generalCampaignCopy(builder))
 expect(campaignPayload(input).campaign_builder).toEqual(builder)
 expect(()=>campaignPayload({...input,status:'active'})).toThrow(/draft/)
 expect(()=>campaignPayload({...input,goal:'custom'})).toThrow(/objective/)
 let request=0
 runtime.from.mockImplementation(()=>{const q={insert:()=>q,select:()=>q,eq:()=>q,maybeSingle:async()=>++request===1?{error:{code:'23505'}}:{data:{...input,campaign_builder:{...builder,details:{area:'Different area'}}}}};return q})
 await expect(saveMarketingCampaign('agency',{...input,id:'stable-draft'})).rejects.toThrow(/already saved/)
})
