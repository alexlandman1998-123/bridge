import { beforeEach, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({ auth: { getUser: vi.fn() }, from: vi.fn(), choices: vi.fn(), source: vi.fn(), general: vi.fn(), email: vi.fn(), wa: vi.fn(), link: vi.fn(), calls: [], campaign: null, emails: [], whatsapps: [], links: [], failLink: false }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: runtime }))
vi.mock('../justListedCampaignService', () => ({ loadJustListedChoices: runtime.choices, loadJustListedSource: runtime.source }))
vi.mock('../generalCampaignService', () => ({loadGeneralCampaignContext:runtime.general}))
vi.mock('../emailCampaignService', () => ({ saveEmailCampaign: runtime.email }))
vi.mock('../whatsappCampaignService', () => ({ whatsappCampaignRequest: runtime.wa }))
vi.mock('../marketingCampaignService', () => ({ linkMarketingActivity: runtime.link }))
import { loadCampaignPack, handoffCampaignDraft } from '../campaignPackService'
const source = { title: 'Sunny home', price: 'R 1000000', location: 'Gardens', facts: '3 bedrooms', description: 'Family home', agencyName: 'Oak', agentName: 'Sarah', destination: 'sarah@example.test', language: 'en-ZA', imageId: 'photo' }
beforeEach(() => {
  vi.clearAllMocks(); runtime.calls = []; runtime.emails = []; runtime.whatsapps = []; runtime.links = []; runtime.failLink = false
  runtime.campaign = { id: 'plan', organisation_id: 'agency', created_by: 'owner', revision: 1, name: 'Just Listed', status: 'draft', listing_builder: { version: 1, template: 'new-listing', listingId: '11111111-1111-4111-8111-111111111111', agentId: '', source }, channel_content: Object.fromEntries(['email', 'social', 'whatsapp'].map((key) => [key, { title: 'Sunny home', body: 'Saved wording' }])) }
  runtime.auth.getUser.mockResolvedValue({ data: { user: { id: 'owner' } } })
  runtime.choices.mockResolvedValue({ listings: [{ id: runtime.campaign.listing_builder.listingId }] })
  runtime.source.mockResolvedValue({ source, agentId: '', images: [{ id: 'photo', url: 'https://example.test/home.jpg' }] })
  runtime.from.mockImplementation((table) => {
    const filters = {}; const q = { select: () => q, eq: (key, value) => { filters[key] = value; runtime.calls.push([table, key, value]); return q }, maybeSingle: async () => ({ data: (table === 'marketing_campaigns' ? [runtime.campaign] : table === 'email_campaigns' ? runtime.emails : runtime.links).find((row) => Object.entries(filters).every(([key, value]) => row[key] === value)) || null }) }
    return q
  })
  runtime.email.mockImplementation(async ({ campaign, organisationId }) => { const row = { id: campaign.clientId, organisation_id: organisationId, status: 'draft', content_json: campaign.contentJson }; runtime.emails.push(row); return row })
  runtime.wa.mockImplementation(async (org, action, input) => {
    if (action === 'workspace') return { campaigns: runtime.whatsapps }
    if (action !== 'save') throw new Error('Sending is not allowed in this test')
    const row = { ...input.campaign, id: input.campaign.client_id, organisation_id: org, status: 'draft' }; runtime.whatsapps.push(row); return { campaign: row }
  })
  runtime.link.mockImplementation(async (org, plan, channel, id) => { if (runtime.failLink) throw new Error('Interrupted'); runtime.links.push({ organisation_id: org, campaign_id: plan, [`${channel}_campaign_id`]: id }) })
})
it('requires the authenticated account, saved revision and current public source before any handoff', async () => {
  await expect(loadCampaignPack('agency', 'different', runtime.campaign)).rejects.toThrow(/account changed/)
  await expect(loadCampaignPack('agency', 'owner', { ...runtime.campaign, revision: 2 })).rejects.toThrow(/changed/)
  runtime.source.mockResolvedValue({ source: { ...source, price: 'Changed' }, agentId: '' })
  await expect(handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')).rejects.toThrow(/changed/)
  expect(runtime.email).not.toHaveBeenCalled()
  expect(runtime.wa).not.toHaveBeenCalled()
})
it('creates and links an email draft once and recovers an interrupted linking step', async () => {
  runtime.failLink = true
  await expect(handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')).rejects.toThrow(/draft is saved/)
  runtime.failLink = false
  const first = await handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')
  const second = await handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')
  expect(second.id).toBe(first.id)
  expect(runtime.email).toHaveBeenCalledTimes(1)
  expect(runtime.links).toHaveLength(1)
  expect(runtime.calls).toContainEqual(['email_campaigns', 'organisation_id', 'agency'])
})
it('preserves an already edited channel draft on repeated handoff', async () => {
  const first = await handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')
  runtime.emails[0].html = 'User edited this in the email editor'
  expect((await handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')).id).toBe(first.id)
  expect(runtime.emails[0].html).toContain('User edited')
  expect(runtime.email).toHaveBeenCalledTimes(1)
})
it('creates a WhatsApp draft with suggested wording but no recipients, sender or template', async () => {
  await handoffCampaignDraft('agency', 'owner', runtime.campaign, 'whatsapp')
  await handoffCampaignDraft('agency', 'owner', runtime.campaign, 'whatsapp')
  expect(runtime.wa.mock.calls.filter((call) => call[1] === 'save')).toHaveLength(1)
  expect(runtime.whatsapps[0]).toMatchObject({ sender_id: '', contact_ids: [], template: {}, parameter_values: { __arch9_campaign: { id: 'plan', wording: 'Saved wording' } } })
  expect(runtime.wa.mock.calls.every((call) => ['workspace', 'save'].includes(call[1]))).toBe(true)
})
it('retains the channel draft and refuses stale linking when the source plan changes mid-handoff', async () => {
  runtime.email.mockImplementation(async ({ campaign }) => { runtime.campaign = { ...runtime.campaign, revision: 2 }; return { id: campaign.clientId, content_json: campaign.contentJson } })
  const expected = { ...runtime.campaign }
  await expect(handoffCampaignDraft('agency', 'owner', expected, 'email')).rejects.toThrow(/channel draft is saved/)
  expect(runtime.link).not.toHaveBeenCalled()
})
it('rejects another agency before reading listing sources or creating a draft', async () => {
  await expect(handoffCampaignDraft('foreign', 'owner', runtime.campaign, 'email')).rejects.toThrow(/no longer available/)
  expect(runtime.source).not.toHaveBeenCalled()
  expect(runtime.email).not.toHaveBeenCalled()
})
it('rejects a changed account immediately before channel creation', async () => {
  runtime.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'owner' } } }).mockResolvedValue({ data: { user: { id: 'different' } } })
  await expect(handoffCampaignDraft('agency', 'owner', runtime.campaign, 'whatsapp')).rejects.toThrow(/account changed/)
  expect(runtime.wa).not.toHaveBeenCalled()
})
it('loads every collection member before a channel handoff and rejects a changed final property', async () => {
 const primary=runtime.campaign.listing_builder
 runtime.campaign.listing_builder={...primary,version:2,template:'property-collection',settings:{},additionalListings:[{...primary,listingId:'22222222-2222-4222-8222-222222222222'},{...primary,listingId:'33333333-3333-4333-8333-333333333333'}].map(({listingId,agentId,source})=>({listingId,agentId,source}))}
 runtime.source.mockImplementation(async(org,user,id)=>({source:id.startsWith('3333')?{...source,price:'Changed'}:source,agentId:'',images:[]}))
 await expect(handoffCampaignDraft('agency','owner',runtime.campaign,'email')).rejects.toThrow(/changed/)
 expect(runtime.source).toHaveBeenCalledTimes(3)
 expect(runtime.email).not.toHaveBeenCalled()
})

it('hands off a general campaign using saved setup and blocks changed routing before any channel write',async()=>{
 const {cleanGeneralBuilder,generalCampaignCopy}=await import('../generalCampaignModel')
 const agentId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 const publicSource={agencyName:'Oak',agentName:'Sarah',destination:'sarah@example.test',language:'en-ZA',setupLanguage:'en-ZA'}
 const builder=cleanGeneralBuilder({version:1,template:'buyers',agentId,source:publicSource,details:{area:'Gardens'},reviewed:true})
 runtime.campaign={...runtime.campaign,listing_builder:null,campaign_builder:builder,channel_content:generalCampaignCopy(builder)}
 runtime.general.mockResolvedValue({agentId,source:publicSource})
 await handoffCampaignDraft('agency','owner',runtime.campaign,'email')
 expect(runtime.source).not.toHaveBeenCalled()
 expect(runtime.email.mock.calls[0][0].campaign.audienceFilter.contact_ids).toEqual(['00000000-0000-0000-0000-000000000000'])
 runtime.general.mockResolvedValue({agentId,source:{...publicSource,destination:'changed@example.test'}})
 await expect(handoffCampaignDraft('agency','owner',runtime.campaign,'whatsapp')).rejects.toThrow(/changed/)
 expect(runtime.wa).not.toHaveBeenCalled()
})
it('passes saved handover selection into fresh access checks before any channel draft is created',async()=>{
 const {cleanGeneralBuilder,generalCampaignCopy}=await import('../generalCampaignModel')
 const agentId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 const publicSource={agencyName:'Oak',agentName:'Sarah',destination:'sarah@example.test',language:'en-ZA',setupLanguage:'en-ZA'}
 const builder=cleanGeneralBuilder({version:1,template:'key-handover',agentId,source:publicSource,details:{area:'Gardens',transactionId:'11111111-1111-4111-8111-111111111111',variant:'buyer'},reviewed:true,permission:true})
 runtime.campaign={...runtime.campaign,listing_builder:null,campaign_builder:builder,channel_content:generalCampaignCopy(builder)}
 runtime.general.mockResolvedValue({agentId,source:publicSource,transaction:null,images:[]})
 await expect(handoffCampaignDraft('agency','owner',runtime.campaign,'email')).rejects.toThrow(/completed transaction/)
 expect(runtime.general).toHaveBeenLastCalledWith('agency','owner','key-handover',agentId,builder.details)
 expect(runtime.email).not.toHaveBeenCalled()
 runtime.general.mockResolvedValue({agentId,source:publicSource,transaction:{id:builder.details.transactionId,area:'Gardens'},images:[]})
 await handoffCampaignDraft('agency','owner',runtime.campaign,'email')
 expect(runtime.email.mock.calls[0][0].campaign.audienceFilter.contact_ids).toEqual(['00000000-0000-0000-0000-000000000000'])
})
it('creates review requests as private drafts and blocks changed saved review routing before writing',async()=>{
 const {cleanGeneralBuilder,generalCampaignCopy}=await import('../generalCampaignModel')
 const agentId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 const publicSource={agencyName:'Oak',agentName:'Sarah',destination:'sarah@example.test',language:'en-ZA',setupLanguage:'en-ZA',reviewUrl:'https://example.test/review'}
 const builder=cleanGeneralBuilder({version:1,template:'review-request',agentId,source:publicSource,details:{area:'Gardens',reviewUrl:publicSource.reviewUrl},reviewed:true})
 runtime.campaign={...runtime.campaign,listing_builder:null,campaign_builder:builder,planned_channels:['email','whatsapp'],channel_content:generalCampaignCopy(builder)}
 runtime.general.mockResolvedValue({agentId,source:publicSource})
 await handoffCampaignDraft('agency','owner',runtime.campaign,'whatsapp')
 const saved=runtime.wa.mock.calls.find(call=>call[1]==='save')[2].campaign
 expect(saved.contact_ids).toEqual([])
 expect(saved.sender_id).toBe('')
 expect(saved.parameter_values.__arch9_campaign.wording).toContain(publicSource.reviewUrl)
 runtime.general.mockResolvedValue({agentId,source:{...publicSource,reviewUrl:'https://example.test/new'}})
 await expect(handoffCampaignDraft('agency','owner',runtime.campaign,'email')).rejects.toThrow(/details changed/)
 expect(runtime.email).not.toHaveBeenCalled()
})
