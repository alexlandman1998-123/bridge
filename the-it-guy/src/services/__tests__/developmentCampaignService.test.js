import { afterEach, expect, it, vi } from 'vitest'
import { buildTemplateMessage } from '../../../../supabase/functions/_shared/whatsappCampaign.js'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: mocks.from } }))
import { fetchDevelopmentCampaigns, normalizeDevelopmentCampaign } from '../developmentCampaignService'
import { saveEmailCampaign } from '../emailCampaignService'

afterEach(() => vi.clearAllMocks())
function query(result) {
  const builder = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) }
  for (const method of ['select', 'eq', 'order', 'in', 'insert', 'single']) builder[method] = vi.fn(() => builder)
  return builder
}

it('scopes both channels to the organisation and development and keeps unavailable results distinct from zero', async () => {
  const email = query({ data: [{ id: 'email-1', name: 'Launch', status: 'sent' }] })
  const metrics = query({ error: new Error('Performance unavailable') })
  const whatsapp = query({ data: [{ id: 'wa-1', name: 'Follow up', display_status: 'sent', recipients: 12, delivered: 9, read: 6 }] })
  mocks.from.mockImplementation(table => ({ email_campaigns: email, email_campaign_performance: metrics, whatsapp_campaign_performance: whatsapp })[table])
  const result = await fetchDevelopmentCampaigns({ organisationId: 'org-1', developmentId: 'development-1' })
  expect(email.eq).toHaveBeenCalledWith('organisation_id', 'org-1')
  expect(email.eq).toHaveBeenCalledWith('content_json->arch9_context->>development_id', 'development-1')
  expect(whatsapp.eq).toHaveBeenCalledWith('organisation_id', 'org-1')
  expect(whatsapp.eq).toHaveBeenCalledWith('parameter_values->__arch9_context->>development_id', 'development-1')
  expect(metrics.in).toHaveBeenCalledWith('campaign_id', ['email-1'])
  expect(result.campaigns[0]).toMatchObject({ delivered: null, engaged: null, leadsGenerated: null })
  expect(result.campaigns[1]).toMatchObject({ delivered: 9, engaged: 6, leadsGenerated: null })
})

it('keeps one channel available if the other channel cannot be read', async () => {
  mocks.from.mockImplementation(table => query(table === 'email_campaigns' ? { error: new Error('Denied') } : { data: [] }))
  expect(await fetchDevelopmentCampaigns({ organisationId: 'org', developmentId: 'dev' })).toEqual({ campaigns: [], errors: ['Email campaign history could not be loaded.'] })
  expect(normalizeDevelopmentCampaign({ id: 'x', recipients: 0, delivered: 0, read: 0 }, 'whatsapp')).toMatchObject({ recipients: 0, delivered: 0, engaged: 0, leadsGenerated: null })
})

it('persists email development context and excludes WhatsApp context from the outgoing message', async () => {
  const saved = query({ data: { id: 'draft' } })
  mocks.from.mockReturnValue(saved)
  const context = { development_id: 'dev', development_name: 'Harbour Heights' }
  await saveEmailCampaign({ organisationId: 'org', userId: 'user', campaign: { name: 'Launch', developmentContext: context, contentJson: { version: 1, rows: [] } } })
  expect(saved.insert.mock.calls[0][0].content_json).toEqual({ version: 1, rows: [], arch9_context: context })
  const template = { name: 'launch', language: 'en', category: 'MARKETING', status: 'APPROVED', components: [{ type: 'BODY', text: 'Hello {{1}}' }] }
  const values = { 'body.1': { source: 'text', text: 'Alex' } }
  const recipient = { phone: '+27821234567' }
  expect(buildTemplateMessage(template, { ...values, __arch9_context: context }, recipient)).toEqual(buildTemplateMessage(template, values, recipient))
})
