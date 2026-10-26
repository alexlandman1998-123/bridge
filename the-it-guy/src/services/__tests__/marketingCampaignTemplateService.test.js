import { beforeEach, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: runtime,
}))
import {
  campaignTemplatePayload,
  loadCampaignTemplates,
  saveCampaignTemplate,
} from '../marketingCampaignTemplateService'
import {
  campaignTemplates,
  templateFromCampaign,
} from '../marketingCampaignTemplates'
import { campaignShopTemplates, CAMPAIGN_CATEGORIES } from '../marketingCampaignCatalogue'
const valid = {
  name: 'Reusable plan',
  goal: 'promote_listing',
  objective: 'More viewings',
  channels: ['email'],
  mode: 'bounded',
  duration_days: 14,
  visibility: 'personal',
}
it('preserves Meta objective intent in reusable templates without carrying a live audience', () => {
  const setup = { metaObjective: 'OUTCOME_LEADS', customGoal: '', target: '20 enquiries', audienceId: '00000000-0000-4000-8000-000000000001', placeId: 'region-id' }
  const payload = campaignTemplatePayload({ ...valid, campaign_setup: setup })
  expect(payload.campaign_setup).toMatchObject({ metaObjective: 'OUTCOME_LEADS', target: '20 enquiries', audienceId: '' })
  expect(payload.objective).toBe('Leads')
  expect(setup.audienceId).not.toBe('')
})
let calls, response
beforeEach(() => {
  calls = []
  response = { data: { id: 'saved' } }
  vi.clearAllMocks()
  runtime.from.mockImplementation((table) => {
    calls.push(['table', table])
    const query = {}
    for (const method of ['select', 'order', 'eq', 'insert', 'update'])
      query[method] = (...args) => {
        calls.push([method, ...args])
        return query
      }
    query.range = async () => response
    query.maybeSingle = async () => response
    return query
  })
})
it('strips recipient, schedule, result, campaign identity and sending state from templates', () => {
  const payload = campaignTemplatePayload({
    ...valid,
    id: 'source',
    created_by: 'someone',
    status: 'sent',
    recipients: ['private@example.com'],
    start_date: '2020-01-01',
    end_date: '2020-12-31',
    sent_at: 'yesterday',
    revision: 20,
    channel_content: { email: { body: 'Reusable copy' } },
  })
  expect(payload).toMatchObject({
    duration_days: 14,
    channel_content: { email: { body: 'Reusable copy' } },
  })
  for (const key of [
    'id',
    'created_by',
    'status',
    'recipients',
    'start_date',
    'end_date',
    'sent_at',
    'revision',
  ])
    expect(payload).not.toHaveProperty(key)
})
it('copies relative duration and content from a campaign, excluding its identity and dates', () => {
  const source = {
    ...valid,
    id: 'plan',
    planned_channels: ['email'],
    start_date: '2026-10-01',
    end_date: '2026-10-15',
    channel_content: { email: { body: 'Reusable' } },
  }
  const template = templateFromCampaign(source)
  expect(template.duration_days).toBe(14)
  expect(template).not.toHaveProperty('id')
  expect(template).not.toHaveProperty('start_date')
  template.channel_content.email.body = 'Changed'
  expect(source.channel_content.email.body).toBe('Reusable')
})
it('validates scope, relative duration and channel content before any write', async () => {
  for (const changes of [
    { visibility: 'public' },
    { duration_days: 0 },
    { duration_days: 367 },
    { mode: 'unknown' },
    { channel_content: { social: { body: 'Not a planned channel' } } },
    { channel_content: { email: { body: 'x'.repeat(12001) } } },
  ])
    expect(() => campaignTemplatePayload({ ...valid, ...changes })).toThrow()
  await expect(
    saveCampaignTemplate('agency', { ...valid, name: '' }),
  ).rejects.toThrow()
  expect(runtime.from).not.toHaveBeenCalled()
  expect(
    campaignTemplatePayload({ ...valid, mode: 'ongoing', duration_days: 100 }),
  ).toMatchObject({ run_mode: 'ongoing', duration_days: null })
})
it('scopes reads and concurrent edits to agency, template and revision', async () => {
  response = { data: [] }
  await loadCampaignTemplates('agency')
  expect(calls).toContainEqual(['eq', 'organisation_id', 'agency'])
  calls = []
  response = { data: null }
  await expect(
    saveCampaignTemplate('agency', valid, { id: 'template', revision: 2 }),
  ).rejects.toThrow('Reload')
  expect(calls).toContainEqual(['eq', 'organisation_id', 'agency'])
  expect(calls).toContainEqual(['eq', 'id', 'template'])
  expect(calls).toContainEqual(['eq', 'revision', 2])
  expect(calls.find(([method]) => method === 'update')[1].revision).toBe(3)
})
it('reports unavailable storage rather than silently saving in the browser', async () => {
  response = { error: { code: '42P01' } }
  await expect(loadCampaignTemplates('agency')).rejects.toThrow('not enabled')
})
it('includes a valid listing launch playbook with social, email and WhatsApp drafts', () => {
  const listing = campaignTemplates.find((item) => item.id === 'new-listing')
  expect(campaignTemplatePayload(listing).planned_channels).toEqual([
    'social',
    'email',
    'whatsapp',
  ])
  expect(Object.keys(listing.channel_content)).toEqual([
    'social',
    'email',
    'whatsapp',
  ])
})

it('offers 19 distinct launch campaigns that can each enter the existing draft/template workflow', () => {
  expect(campaignShopTemplates).toHaveLength(19)
  expect(new Set(campaignShopTemplates.map((item) => item.id)).size).toBe(19)
  expect(new Set(campaignShopTemplates.map((item) => item.category)).size).toBe(5)
  for (const template of campaignShopTemplates) {
    expect(CAMPAIGN_CATEGORIES.some((category) => category.id === template.category)).toBe(true)
    const routedTemplate = campaignTemplates.find((item) => item.id === template.id)
    expect(routedTemplate).toBeTruthy()
    const payload = campaignTemplatePayload(routedTemplate)
    expect(payload.name).toBe(template.name)
    expect(payload.planned_channels).toEqual(template.channels)
    expect(Object.keys(payload.channel_content)).toEqual(template.channels)
    expect(payload).not.toHaveProperty('plannedAssets')
    expect(payload).not.toHaveProperty('recipients')
  }
  expect(campaignTemplates.some((item) => item.id === 'relationships')).toBe(true)
  expect(campaignTemplates.some((item) => item.id === 'milestones')).toBe(true)
})

it('copies a complete playbook into reusable templates without a personal response destination',async()=>{
  const {createCampaignPlaybook}=await import('../campaignPlaybookModel')
  const source={...valid,name:'Valuation sequence',planned_channels:['email'],start_date:'2026-10-25',end_date:'2026-11-08',channel_content:{email:{title:'Let’s talk',body:'A local valuation.'}}}
  source.playbook=createCampaignPlaybook(source)
  source.playbook.response={kind:'email',label:'Arrange a valuation',value:'agent@example.test'}
  source.playbook.steps[0].body='Contact agent@example.test'
  const template=templateFromCampaign(source)
  const payload=campaignTemplatePayload({...template,visibility:'personal'})
  expect(payload.playbook.steps).toHaveLength(2)
  expect(payload.playbook.followUp).toHaveLength(2)
  expect(payload.playbook.response).toEqual({kind:'reply',label:'Arrange a valuation',value:''})
  expect(payload.playbook.steps[0].body).toBe('Contact {response}')
  expect(payload).not.toHaveProperty('start_date')
})
