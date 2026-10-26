import { beforeEach, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: runtime }))
import { channelTemplatePayload, campaignFromChannelTemplate, loadChannelTemplates, saveChannelTemplate } from '../marketingChannelTemplateService'

const valid = { name: 'Valuation email', channel: 'email', visibility: 'personal', title: 'What is your home worth?', body: 'Hello [first name], let’s talk about your property.', cta_label: 'Book a valuation', destination_url: 'https://example.test/valuation' }
it('prepares an independent ChatGPT ad campaign draft without a provider call', () => {
  const template = { ...valid, channel: 'chatgpt', image_url: 'https://example.test/listing.jpg' }
  expect(channelTemplatePayload(template).channel).toBe('chatgpt')
  const draft = campaignFromChannelTemplate(template)
  expect(draft.channels).toEqual(['chatgpt'])
  expect(draft.channel_content.chatgpt).toMatchObject({ title: valid.title })
  expect(draft.channel_content.chatgpt.body).toContain(valid.destination_url)
  expect(draft.cover_url).toBe(template.image_url)
  expect(runtime.from).not.toHaveBeenCalled()
})
let calls, result
beforeEach(() => {
  vi.clearAllMocks()
  calls = []
  result = { data: [] }
  runtime.from.mockImplementation((table) => {
    calls.push(['table', table])
    const query = {}
    for (const method of ['select', 'eq', 'order', 'insert', 'update']) query[method] = (...args) => { calls.push([method, ...args]); return query }
    query.range = vi.fn(async () => result)
    query.maybeSingle = vi.fn(async () => result)
    return query
  })
})
it('validates channel-specific content, sharing and safe links before writing', async () => {
  for (const change of [{ channel: 'sms' }, { visibility: 'public' }, { title: '' }, { body: '' }, { body: 'x'.repeat(9001) }, { image_url: 'javascript:alert(1)' }, { destination_url: 'https://user:secret@example.test' }, { title: {} }]) {
    await expect(saveChannelTemplate('agency', { ...valid, ...change })).rejects.toThrow()
  }
  expect(runtime.from).not.toHaveBeenCalled()
  expect(channelTemplatePayload({ ...valid, channel: 'whatsapp', title: '' }).title).toBe('')
})
it('excludes identity, recipients, delivery state, schedule and campaign IDs from saved templates', () => {
  const payload = channelTemplatePayload({ ...valid, id: 'old', organisation_id: 'foreign', created_by: 'other', recipients: ['private@test.invalid'], campaign_id: 'campaign', sent_at: 'yesterday', revision: 99, status: 'sent' })
  for (const key of ['id', 'organisation_id', 'created_by', 'recipients', 'campaign_id', 'sent_at', 'revision', 'status']) expect(payload).not.toHaveProperty(key)
})
it('scopes reads and revisions to the current organisation', async () => {
  await loadChannelTemplates('agency')
  expect(calls).toContainEqual(['eq', 'organisation_id', 'agency'])
  result = { data: null }
  await expect(saveChannelTemplate('agency', valid, { id: 'template', organisation_id: 'agency', revision: 3 })).rejects.toThrow('Reload')
  expect(calls).toContainEqual(['eq', 'revision', 3])
  expect(calls).toContainEqual(['eq', 'id', 'template'])
  expect(calls.find(([key]) => key === 'update')[1].revision).toBe(4)
})
it('blocks foreign-workspace updates and reports missing storage explicitly', async () => {
  await expect(saveChannelTemplate('agency', valid, { organisation_id: 'other' })).rejects.toThrow('different agency')
  expect(runtime.from).not.toHaveBeenCalled()
  result = { error: { code: 'PGRST205' } }
  await expect(loadChannelTemplates('agency')).rejects.toThrow('not enabled')
})
it('copies channel content into an independent campaign draft without sending', () => {
  const source = { ...valid, body: 'x'.repeat(9000), image_url: 'https://example.test/cover.jpg' }
  const copy = campaignFromChannelTemplate(source)
  source.body = 'Changed later'
  expect(copy.channels).toEqual(['email'])
  expect(copy.channel_content.email.title).toBe(valid.title)
  expect(copy.channel_content.email.body).toContain(valid.destination_url)
  expect(copy.channel_content.email.body).not.toContain('Changed later')
  expect(copy.channel_content.email.body.length).toBeLessThanOrEqual(12000)
  expect(copy.cover_url).toBe('https://example.test/cover.jpg')
  expect(runtime.from).not.toHaveBeenCalled()
})
