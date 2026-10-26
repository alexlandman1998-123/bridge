import { expect, it, vi } from 'vitest'
vi.mock('../../lib/supabaseClient', () => ({ supabase: null }))
import { cleanCampaignPlaybook, createCampaignPlaybook, orderedPlaybookSteps, playbookFollowUpSuggestion, playbookStepCopy, playbookStepDate, responseDestination, reusablePlaybook } from '../campaignPlaybookModel'
import { saveCampaignPlaybook } from '../campaignPlaybookService'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const campaign = { id: id(1), organisation_id: id(2), revision: 1, name: 'Seller valuations', goal: 'seller_leads', objective: 'Book valuations', offer: 'A complimentary valuation', planned_channels: ['email','whatsapp','social'], start_date: '2026-10-25', channel_content: { email: { title: 'What is your home worth?', body: 'Get a valuation.' }, whatsapp: { title: 'A local valuation', body: 'Let’s talk.' }, social: { title: 'Your next move', body: 'Know your options.' } } }
it('builds a coordinated editable starter from saved copy without recipients or delivery state', () => {
  const book = cleanCampaignPlaybook(createCampaignPlaybook(campaign),campaign.planned_channels)
  expect(book.steps.filter(step=>step.channel==='email')).toHaveLength(2)
  expect(book.steps[0].body).toBe('Get a valuation.')
  expect(orderedPlaybookSteps(book).map(step=>step.day)).toEqual([0,0,3,7])
  expect(book.followUp[0].title).toBe('Arrange a valuation with {contact}')
  expect(JSON.stringify(book)).not.toMatch(/recipient|sender_id|scheduled_for|contact_ids/)
})
it('uses relative calendar dates without implying scheduled delivery', () => {
  const book=createCampaignPlaybook(campaign)
  expect(playbookStepDate(campaign,book.steps.find(step=>step.day===7))).toBe('2026-11-01')
  expect(playbookStepDate({...campaign,start_date:null},book.steps[0])).toBeNull()
  expect(playbookStepCopy(book,book.steps[0]).timing).toContain('Planned')
})
it('renders the shared response destination once, using international WhatsApp digits', () => {
  const book=createCampaignPlaybook(campaign)
  book.response={kind:'whatsapp',value:'+447700900123',label:'Ask about a valuation'}
  expect(playbookStepCopy(book,{...book.steps[0],body:'Hello\n\n{response}'}).body).toBe('Hello\n\nAsk about a valuation: https://wa.me/447700900123')
  expect(()=>responseDestination({...book.response,value:'07700900123'})).toThrow('international')
  for (const value of ['http://example.test','javascript:alert(1)','https://user:pass@example.test','https://example.test\\@bad.test']) expect(()=>responseDestination({kind:'url',value})).toThrow()
})
it('rejects empty messages, duplicate IDs, unsupported channels and out-of-range timing', () => {
  const book=createCampaignPlaybook(campaign)
  for (const invalid of [{...book,steps:[]},{...book,steps:[{...book.steps[0],body:''}]},{...book,steps:[book.steps[0],book.steps[0]]},{...book,steps:[{...book.steps[0],channel:'sms'}]},{...book,steps:[{...book.steps[0],day:366}]}]) expect(()=>cleanCampaignPlaybook(invalid,campaign.planned_channels)).toThrow()
})
it('reuses playbooks without carrying a personal response address or CRM recipient selection', () => {
  const book=createCampaignPlaybook(campaign)
  book.response={kind:'email',value:'agent@example.test',label:'Book a valuation'}
  book.steps[0].body='Write to agent@example.test'
  book.recipientIds=[id(99)]
  const template=reusablePlaybook(book,campaign.planned_channels)
  expect(template.response).toEqual({kind:'reply',value:'',label:'Book a valuation'})
  expect(template.steps[0].body).toBe('Write to {response}')
  expect(template.recipientIds).toBeUndefined()
})
it('suggests CRM tasks relative to the recorded response, including a SAST midnight boundary', () => {
  const suggestion=playbookFollowUpSuggestion({title:'Call {contact}',days:1},{name:'Jane Doe',responded_at:'2026-10-24T23:30:00Z'})
  expect(suggestion).toEqual({title:'Call Jane Doe',dueDate:'2026-10-26'})
})
it('updates only the scoped campaign playbook and revision and requires a confirmed receipt', async () => {
  const calls=[]
  const book=createCampaignPlaybook(campaign)
  let receipt={data:{...campaign,revision:2,playbook:book}}
  const query={update(value){calls.push(['update',value]);return query},eq(key,value){calls.push([key,value]);return query},select(){return query},maybeSingle:async()=>receipt}
  const client={from:vi.fn(()=>query)}
  await saveCampaignPlaybook(campaign.organisation_id,campaign,book,{client})
  expect(calls[0]).toEqual(['update',{playbook:{...cleanCampaignPlaybook(book,campaign.planned_channels),sourceRevision:2},revision:2}])
  expect(calls.slice(1)).toEqual([['organisation_id',campaign.organisation_id],['id',campaign.id],['revision',1]])
  receipt={data:null}
  await expect(saveCampaignPlaybook(campaign.organisation_id,campaign,book,{client})).rejects.toThrow('changed')
  receipt={error:{code:'PGRST204'}}
  await expect(saveCampaignPlaybook(campaign.organisation_id,campaign,book,{client})).rejects.toThrow('not enabled')
  await expect(saveCampaignPlaybook(id(99),campaign,book,{client})).rejects.toThrow('workspace')
})

it('uses a gentler same-day relationship starter without an extra sales follow-up email',()=>{
  const book=createCampaignPlaybook({...campaign,goal:'reengage',campaign_builder:{template:'key-handover',source:{}}})
  expect(book.steps.filter(step=>step.channel==='email')).toHaveLength(1)
  expect(book.steps.every(step=>step.day===0)).toBe(true)
  expect(book.response.label).toBe('Let’s stay in touch')
})
it('routes review requests to their reviewed public review URL',()=>{
  const book=createCampaignPlaybook({...campaign,goal:'reengage',campaign_builder:{template:'review-request',source:{destination:'agent@example.test'},details:{reviewUrl:'https://example.test/review'}}})
  expect(book.response).toEqual({kind:'url',value:'https://example.test/review',label:'Share your experience'})
})
it('keeps saved Afrikaans copy and supplies Afrikaans follow-up suggestions',()=>{
  const book=createCampaignPlaybook({...campaign,campaign_builder:{template:'sellers',source:{language:'af-ZA',destination:'agent@example.test'}},channel_content:{...campaign.channel_content,email:{title:'Jou volgende stap',body:'Ontdek jou eiendom se waarde.'}}})
  expect(book.steps[0].body).toBe('Ontdek jou eiendom se waarde.')
  expect(book.steps.find(step=>step.day===7).title).toBe('Ons volg op: Jou volgende stap')
  expect(book.followUp[0].title).toBe('Reël ’n waardasie met {contact}')
})

it('omits deselected template channels without destroying the editable source sequence',async()=>{
  const {playbookForChannels}=await import('../campaignPlaybookModel')
  const book=createCampaignPlaybook(campaign)
  const selected=playbookForChannels(book,['email'])
  expect(selected.steps).toHaveLength(2)
  expect(selected.steps.every(step=>step.channel==='email')).toBe(true)
  expect(book.steps).toHaveLength(4)
  expect(playbookForChannels(book,['meta'])).toBeNull()
})
