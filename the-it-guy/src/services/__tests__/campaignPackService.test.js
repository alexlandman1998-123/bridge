import { createContactProvenance, GENERAL_CONTACT_FIELDS } from '../campaignContactProvenance'
import { beforeEach, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({ rpc: vi.fn(), agencyName: 'Oak', auth: { getUser: vi.fn() }, from: vi.fn(), choices: vi.fn(), source: vi.fn(), general: vi.fn(), email: vi.fn(), wa: vi.fn(), link: vi.fn(), calls: [], campaign: null, emails: [], whatsapps: [], links: [], failLink: false }))
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
  runtime.campaign = { id: 'plan', organisation_id: 'agency', created_by: 'owner', revision: 1, name: 'Just Listed', status: 'draft', listing_builder: { version: 1, template: 'new-listing', listingId: '11111111-1111-4111-8111-111111111111', agentId: '', source, contactProvenance: { ...createContactProvenance(source), confirmed: true } }, channel_content: Object.fromEntries(['email', 'social', 'whatsapp'].map((key) => [key, { title: 'Sunny home', body: 'Saved wording' }])) }
  runtime.auth.getUser.mockResolvedValue({ data: { user: { id: 'owner' } } }); runtime.rpc.mockResolvedValue({ data: false }); runtime.agencyName = 'Oak'
  runtime.choices.mockResolvedValue({ listings: [{ id: runtime.campaign.listing_builder.listingId }] })
  runtime.source.mockResolvedValue({ source, agentId: '', images: [{ id: 'photo', url: 'https://example.test/home.jpg' }] })
  runtime.from.mockImplementation((table) => {
    const filters = {}; const q = { select: () => q, eq: (key, value) => { filters[key] = value; runtime.calls.push([table, key, value]); return q }, maybeSingle: async () => ({ data: (table === 'marketing_campaigns' ? [runtime.campaign] : table === 'email_campaigns' ? runtime.emails : table === 'organisations' ? [{ id: 'agency', name: runtime.agencyName }] : runtime.links).find((row) => Object.entries(filters).every(([key, value]) => row[key] === value)) || null }) }
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
it('blocks removed public contacts and legacy ambiguity before any channel draft or activity write', async () => {
  for (const key of ['agentName', 'destination']) {
    runtime.source.mockResolvedValue({ source: { ...source, [key]: '' }, agentId: '' })
    await expect(handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')).rejects.toThrow(/removed/)
    await expect(handoffCampaignDraft('agency', 'owner', runtime.campaign, 'whatsapp')).rejects.toThrow(/removed/)
  }
  runtime.source.mockResolvedValue({ source, agentId: '' })
  delete runtime.campaign.listing_builder.contactProvenance
  await expect(handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')).rejects.toThrow(/Older drafts/)
  expect(runtime.email).not.toHaveBeenCalled()
  expect(runtime.wa).not.toHaveBeenCalled()
  expect(runtime.link).not.toHaveBeenCalled()
  expect(runtime.campaign.channel_content.email.body).toBe('Saved wording')
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
 runtime.campaign.listing_builder={...primary,version:2,template:'property-collection',settings:{},additionalListings:[{...primary,listingId:'22222222-2222-4222-8222-222222222222'},{...primary,listingId:'33333333-3333-4333-8333-333333333333'}].map(({listingId,agentId,source,contactProvenance})=>({listingId,agentId,source,contactProvenance}))}
 runtime.source.mockImplementation(async(org,user,id)=>({source:id.startsWith('3333')?{...source,price:'Changed'}:source,agentId:'',images:[]}))
 await expect(handoffCampaignDraft('agency','owner',runtime.campaign,'email')).rejects.toThrow(/changed/)
 expect(runtime.source).toHaveBeenCalledTimes(3)
 expect(runtime.email).not.toHaveBeenCalled()
})

it('hands off a general campaign using saved setup and blocks changed routing before any channel write',async()=>{
 const {cleanGeneralBuilder,generalCampaignCopy}=await import('../generalCampaignModel')
 const agentId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 const publicSource={agencyName:'Oak',agentName:'Sarah',destination:'sarah@example.test',language:'en-ZA',setupLanguage:'en-ZA'}
 const builder=cleanGeneralBuilder({version:1,template:'buyers',agentId,source:publicSource,contactProvenance:{...createContactProvenance(publicSource,GENERAL_CONTACT_FIELDS),confirmed:true},details:{area:'Gardens'},reviewed:true})
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
 const builder=cleanGeneralBuilder({version:1,template:'key-handover',agentId,source:publicSource,contactProvenance:{...createContactProvenance(publicSource,GENERAL_CONTACT_FIELDS),confirmed:true},details:{area:'Gardens',transactionId:'11111111-1111-4111-8111-111111111111',variant:'buyer'},reviewed:true,permission:true})
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
 const builder=cleanGeneralBuilder({version:1,template:'review-request',agentId,source:publicSource,contactProvenance:{...createContactProvenance(publicSource,GENERAL_CONTACT_FIELDS),confirmed:true},details:{area:'Gardens',reviewUrl:publicSource.reviewUrl},reviewed:true})
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

it('creates and links a generic campaign email once, preserving personalisation and safe audience defaults', async () => {
  runtime.campaign = { ...runtime.campaign, listing_builder: null, planned_channels: ['email'], channel_content: { email: { title: 'Gardens valuations', body: 'Hello {{first_name}}, book a valuation in Gardens.' } } }
  const first = await handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')
  await handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')
  expect(runtime.email).toHaveBeenCalledTimes(1)
  expect(runtime.links).toHaveLength(1)
  expect(runtime.links[0].email_campaign_id).toBe(first.id)
  expect(runtime.source).not.toHaveBeenCalled()
  expect(runtime.choices).not.toHaveBeenCalled()
  const draft = runtime.email.mock.calls[0][0].campaign
  expect(draft.subject).toBe('Gardens valuations')
  expect(draft.contentJson.blocks.find((block) => block.text?.includes('book a valuation')).text).toContain('Gardens')
  expect(draft.contentJson.arch9_campaign.id).toBe('plan')
  expect(draft.audienceFilter.contact_ids).toEqual(['00000000-0000-0000-0000-000000000000'])
  expect(runtime.wa).not.toHaveBeenCalled()
})

it('recovers a generic email after interrupted linking without creating a second draft or overwriting edits', async () => {
  runtime.campaign = { ...runtime.campaign, listing_builder: null, planned_channels: ['email'], channel_content: { email: { title: 'Subject', body: 'Message' } } }
  runtime.failLink = true
  await expect(handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')).rejects.toThrow('draft is saved')
  runtime.emails[0].html = 'Edited in Email'
  runtime.failLink = false
  await handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')
  expect(runtime.email).toHaveBeenCalledTimes(1)
  expect(runtime.emails[0].html).toBe('Edited in Email')
})

it('blocks generic handoff for a colleague without manager permission or when branding is unavailable', async () => {
  runtime.campaign = { ...runtime.campaign, created_by: 'colleague', listing_builder: null, planned_channels: ['email'], channel_content: { email: { title: 'Subject', body: 'Message' } } }
  await expect(handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')).rejects.toThrow('agency administrator')
  runtime.rpc.mockResolvedValue({ data: true })
  runtime.agencyName = ''
  await expect(handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')).rejects.toThrow('agency name')
  expect(runtime.email).not.toHaveBeenCalled()
})

it('keeps earlier linked emails when updated campaign copy is prepared as a new revision', async () => {
  runtime.campaign = { ...runtime.campaign, listing_builder: null, planned_channels: ['email'], channel_content: { email: { title: 'Subject', body: 'First version' } } }
  const first = await handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')
  runtime.campaign = { ...runtime.campaign, revision: 2, channel_content: { email: { title: 'Updated subject', body: 'Second version' } } }
  const second = await handoffCampaignDraft('agency', 'owner', runtime.campaign, 'email')
  expect(second.id).not.toBe(first.id)
  expect(runtime.links).toHaveLength(2)
  expect(runtime.email.mock.calls[0][0].campaign.subject).toBe('Subject')
  expect(runtime.email.mock.calls[1][0].campaign.subject).toBe('Updated subject')
})

it('hands off generic WhatsApp-only copy with no selected audience or sender, and recovers linking without overwriting edits', async () => {
  runtime.campaign = { ...runtime.campaign, listing_builder: null, planned_channels: ['whatsapp'], channel_content: { whatsapp: { body: 'Book your Gardens valuation.' } } }
  runtime.failLink = true
  await expect(handoffCampaignDraft('agency', 'owner', runtime.campaign, 'whatsapp')).rejects.toThrow('draft is saved')
  runtime.whatsapps[0].parameter_values['body.1'] = {source:'text',text:'Personal wording'}
  runtime.failLink = false
  const first = await handoffCampaignDraft('agency', 'owner', runtime.campaign, 'whatsapp')
  const second = await handoffCampaignDraft('agency', 'owner', runtime.campaign, 'whatsapp')
  expect(second.id).toBe(first.id)
  expect(runtime.wa.mock.calls.filter((call) => call[1] === 'save')).toHaveLength(1)
  expect(runtime.whatsapps[0]).toMatchObject({sender_id:'',contact_ids:[],template:{},parameter_values:{__arch9_campaign:{id:'plan',revision:1,wording:'Book your Gardens valuation.'},'body.1':{text:'Personal wording'}}})
  expect(runtime.links).toHaveLength(1)
  expect(runtime.email).not.toHaveBeenCalled()
  expect(runtime.calls.some(([table]) => table === 'organisations')).toBe(false)
})
it('rejects missing or unplanned generic WhatsApp copy before any channel request', async () => {
 runtime.campaign = {...runtime.campaign,listing_builder:null,planned_channels:['email'],channel_content:{whatsapp:{body:'Saved message'}}}
 await expect(handoffCampaignDraft('agency','owner',runtime.campaign,'whatsapp')).rejects.toThrow('Add WhatsApp')
 runtime.campaign.planned_channels=['whatsapp'];runtime.campaign.channel_content.whatsapp.body=''
 await expect(handoffCampaignDraft('agency','owner',runtime.campaign,'whatsapp')).rejects.toThrow('Add a WhatsApp message')
 expect(runtime.wa).not.toHaveBeenCalled()
})
it('keeps each WhatsApp revision linked without replacing earlier sends',async()=>{
 runtime.campaign={...runtime.campaign,listing_builder:null,planned_channels:['whatsapp'],channel_content:{whatsapp:{body:'First message'}}}
 const first=await handoffCampaignDraft('agency','owner',runtime.campaign,'whatsapp')
 runtime.campaign={...runtime.campaign,revision:2,channel_content:{whatsapp:{body:'New message'}}}
 const second=await handoffCampaignDraft('agency','owner',runtime.campaign,'whatsapp')
 expect(second.id).not.toBe(first.id);expect(runtime.links).toHaveLength(2)
 expect(runtime.whatsapps[0].parameter_values.__arch9_campaign.wording).toBe('First message')
})

it('loads manual publishing briefs with agency, actor and revision checks and performs no channel writes',async()=>{
 const {loadCampaignChannelBrief}=await import('../campaignPackService')
 runtime.campaign={...runtime.campaign,listing_builder:null,planned_channels:['meta','social'],campaign_setup:{metaObjective:'OUTCOME_LEADS'},channel_content:{meta:{title:'Valuations',body:'Book a local valuation'},social:{body:'Your local update'}}}
 expect(await loadCampaignChannelBrief('agency','owner',runtime.campaign,'meta')).toMatchObject({channel:'Meta ads',message:'Book a local valuation'})
 await expect(loadCampaignChannelBrief('foreign','owner',runtime.campaign,'social')).rejects.toThrow('no longer available')
 await expect(loadCampaignChannelBrief('agency','different',runtime.campaign,'meta')).rejects.toThrow('account changed')
 await expect(loadCampaignChannelBrief('agency','owner',{...runtime.campaign,revision:2},'meta')).rejects.toThrow('changed')
 runtime.campaign.created_by='colleague'
 await expect(loadCampaignChannelBrief('agency','owner',runtime.campaign,'meta')).rejects.toThrow('agency administrator')
 expect(runtime.email).not.toHaveBeenCalled();expect(runtime.wa).not.toHaveBeenCalled();expect(runtime.link).not.toHaveBeenCalled()
})

function savedPlaybook() {
  runtime.campaign = { ...runtime.campaign, listing_builder: null, planned_channels: ['email','whatsapp','social'] }
  const step = (id, channel, day, title) => ({ id, channel, day, title, body: `Reviewed ${title}. {response}` })
  runtime.campaign.playbook = { version: 1, sourceRevision: runtime.campaign.revision, response: { kind: 'url', value: 'https://example.test/valuation', label: 'Book a valuation' }, steps: [step('11111111-1111-4111-8111-111111111111','email',0,'First invitation'),step('22222222-2222-4222-8222-222222222222','email',7,'Follow-up invitation'),step('33333333-3333-4333-8333-333333333333','whatsapp',3,'Personal invitation'),step('44444444-4444-4444-8444-444444444444','social',0,'Local conversation')], followUp: [] }
  return runtime.campaign.playbook.steps
}
it('prepares separate drafts for repeated playbook steps and retries preserve each edited draft', async () => {
  const [first,second]=savedPlaybook()
  const a=await handoffCampaignDraft('agency','owner',runtime.campaign,'email',first.id)
  const b=await handoffCampaignDraft('agency','owner',runtime.campaign,'email',second.id)
  expect(a.id).not.toBe(b.id)
  expect(runtime.email.mock.calls[0][0].campaign.subject).toBe('First invitation')
  expect(runtime.email.mock.calls[1][0].campaign.subject).toBe('Follow-up invitation')
  expect(runtime.emails[0].content_json.arch9_campaign).toMatchObject({id:'plan',revision:1,playbook_step:first.id,audience_pending:true})
  runtime.emails[0].html='User edited this step in Email'
  expect((await handoffCampaignDraft('agency','owner',runtime.campaign,'email',first.id)).id).toBe(a.id)
  expect(runtime.email).toHaveBeenCalledTimes(2)
  expect(runtime.emails[0].html).toContain('User edited')
  expect(runtime.links).toHaveLength(2)
})
it('reads saved step copy rather than caller-supplied edits and carries response routing into WhatsApp suggestions',async()=>{
  const steps=savedPlaybook()
  const expected={...runtime.campaign,playbook:{...runtime.campaign.playbook,steps:[]}}
  await handoffCampaignDraft('agency','owner',expected,'whatsapp',steps[2].id)
  expect(runtime.whatsapps[0].parameter_values.__arch9_campaign).toMatchObject({playbook_step:steps[2].id,wording:'Reviewed Personal invitation. Book a valuation: https://example.test/valuation'})
  expect(runtime.whatsapps[0].contact_ids).toEqual([])
  expect(runtime.whatsapps[0].sender_id).toBe('')
  expect(runtime.whatsapps[0].template).toEqual({})
  expect(runtime.wa.mock.calls.every(call=>['workspace','save'].includes(call[1]))).toBe(true)
})
it('rejects unknown steps and mismatched channels before creating any draft',async()=>{
  const steps=savedPlaybook()
  await expect(handoffCampaignDraft('agency','owner',runtime.campaign,'email',steps[2].id)).rejects.toThrow('step changed')
  await expect(handoffCampaignDraft('agency','owner',runtime.campaign,'email','55555555-5555-4555-8555-555555555555')).rejects.toThrow('step changed')
  expect(runtime.email).not.toHaveBeenCalled()
  expect(runtime.wa).not.toHaveBeenCalled()
})
it('exports a specific saved social step as a manual publishing brief',async()=>{
  const steps=savedPlaybook()
  const {loadCampaignChannelBrief}=await import('../campaignPackService')
  const brief=await loadCampaignChannelBrief('agency','owner',runtime.campaign,'social',steps[3].id)
  expect(brief).toMatchObject({headline:'Local conversation',message:'Reviewed Local conversation. Book a valuation: https://example.test/valuation'})
  expect(brief.timing).toContain('Day 0')
  expect(runtime.email).not.toHaveBeenCalled(); expect(runtime.wa).not.toHaveBeenCalled()
})

it('blocks step handoff until the saved playbook is reviewed against the latest campaign brief',async()=>{
  const steps=savedPlaybook()
  runtime.campaign.revision=2
  await expect(handoffCampaignDraft('agency','owner',runtime.campaign,'email',steps[0].id)).rejects.toThrow('brief changed')
  expect(runtime.email).not.toHaveBeenCalled()
  runtime.campaign.playbook.sourceRevision=2
  await handoffCampaignDraft('agency','owner',runtime.campaign,'email',steps[0].id)
  expect(runtime.email).toHaveBeenCalledTimes(1)
})
