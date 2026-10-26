import { expect, it, vi } from 'vitest'
vi.mock('../marketingCampaignService', () => ({ saveMarketingCampaign: vi.fn() }))
import { campaignResponsePlaybook } from '../campaignResponsePlaybook'
import { cleanCampaignPlaybook, playbookStepCopy } from '../campaignPlaybookModel'
const campaign = { id: 'campaign', revision: 4, name: 'Seller valuations', goal: 'seller_leads', objective: 'Invite local valuation enquiries', planned_channels: ['email', 'whatsapp'], channel_content: { email: { title: 'My manually written subject', body: 'My promise: a personal conversation.' }, whatsapp: { title: 'A quick check-in', body: 'Let us know your plans.' } } }
const link = { status: 'active', purpose: 'valuation', url: 'https://app.example.test/intake/agent?campaignResponse=opaque', campaignRevision: 4 }
it('turns a reviewed response URL into a versioned playbook while retaining original copy and all channels', () => {
  const result = campaignResponsePlaybook(campaign, link)
  expect(cleanCampaignPlaybook(result, campaign.planned_channels)).toEqual(result)
  expect(result.sourceRevision).toBe(5)
  expect(result.response).toEqual({ kind: 'url', value: link.url, label: 'Request a valuation' })
  expect(result.steps.map((step) => step.channel)).toContain('whatsapp')
  const opening = result.steps.find((step) => step.channel === 'email')
  expect(opening.title).toBe('My manually written subject')
  expect(opening.body).toContain('My promise: a personal conversation.')
  expect(playbookStepCopy(result, opening).body).toContain(link.url)
  expect(campaign.playbook).toBeUndefined()
})
it('keeps saved action identifiers and due days while replacing the previous response route', () => {
  const original = campaignResponsePlaybook(campaign, link)
  original.response.value = 'https://previous.example.test/form'
  original.steps[0].body = 'Manual wording. https://previous.example.test/form'
  const result = campaignResponsePlaybook({ ...campaign, playbook: original }, link)
  expect(result.steps.map((step) => [step.id, step.day])).toEqual(original.steps.map((step) => [step.id, step.day]))
  expect(result.followUp).toEqual(original.followUp)
  expect(result.steps[0].body).toBe('Manual wording. {response}')
})
it('requires an active current-revision HTTPS link before changing any playbook', () => {
  for (const patch of [{ status: 'disabled' }, { campaignRevision: 3 }, { url: 'javascript:alert(1)' }, { url: 'https://user:pass@example.test/form' }])
    expect(() => campaignResponsePlaybook(campaign, { ...link, ...patch })).toThrow()
})
it('does not duplicate the call-to-action label when replacing a full existing enquiry line', () => {
  const source = { ...campaign, campaign_builder: { template: 'sellers', source: { destination: 'agent@example.test' } }, channel_content: { email: { title: 'Valuations', body: 'My personal invitation.\n\nRequest a valuation: agent@example.test' } }, planned_channels: ['email'] }
  const result = campaignResponsePlaybook(source, link)
  const copy = playbookStepCopy(result, result.steps[0])
  expect(copy.body).toBe(`My personal invitation.\n\nRequest a valuation: ${link.url}`)
  expect(copy.body).not.toContain('Request a valuation: Request a valuation:')
})
it('preserves evidence URLs that share a response URL prefix', () => {
  const first = campaignResponsePlaybook(campaign, link)
  first.response.value = 'https://agency.test/contact'
  first.steps[0].body = 'Source: https://agency.test/contact-report\n\nRequest a valuation: https://agency.test/contact'
  const result = campaignResponsePlaybook({ ...campaign, playbook: first }, link)
  expect(result.steps[0].body).toBe('Source: https://agency.test/contact-report\n\n{response}')
})
