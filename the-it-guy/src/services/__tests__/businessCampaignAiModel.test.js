import { expect, it } from 'vitest'
import { applyBusinessCampaignCopy, businessCampaignPlan, businessOpening } from '../businessCampaignAiModel'
const content = { email: { title: 'My title', body: 'Hi there,\n\nA public introduction.\n\nConfirmed offer R200 and terms.\n\nhttps://agency.example.com', timing: 'Tomorrow' }, whatsapp: { title: 'Manual', body: 'Keep me', timing: 'Later' } }
const copy = { heading: 'A proposed title', intro: 'A clearer opening.' }
it('changes only the selected channel and field, preserving source material, destinations and manual timing', () => {
  const next = applyBusinessCampaignCopy(content, { channel: 'email', target: 'opening', copy })
  expect(next.email.title).toBe(content.email.title)
  expect(next.email.body).toBe('Hi there,\n\nA clearer opening.\n\nConfirmed offer R200 and terms.\n\nhttps://agency.example.com')
  expect(next.email.timing).toBe('Tomorrow'); expect(next.whatsapp).toEqual(content.whatsapp)
  expect(applyBusinessCampaignCopy(content, { channel: 'email', target: 'title', copy }).email.body).toBe(content.email.body)
  expect(businessOpening(content.email.body).text).toBe('A public introduction.')
})
it('free plans use supported goals and never select recipients or claim performance', () => {
  const plan = businessCampaignPlan({ template: 'client-check-in', details: { area: 'Brooklyn' } })
  expect(plan.steps).toHaveLength(4); expect(plan.boundary).toMatch(/sends or schedules nothing/)
  expect(plan).not.toHaveProperty('recipients'); expect(plan).not.toHaveProperty('predictedRevenue')
  expect(() => businessCampaignPlan({ template: 'unsupported' })).toThrow()
  expect(() => applyBusinessCampaignCopy(content, { channel: 'meta', copy })).toThrow()
})
it('adds an introduction before factual or approved source text instead of replacing it', () => {
  for (const opening of ['Confirmed valuation fee R200.', '“The approved testimonial.”', 'Our appointment-only valuation offer']) {
    const source = { email: { title: 'Source title', body: `${opening}\n\nReply to the agent.`, timing: '' } }
    const next = applyBusinessCampaignCopy(source, { channel: 'email', target: 'opening', copy, protectedText: ['appointment-only valuation offer'] })
    expect(next.email.body).toBe(`A clearer opening.\n\n${opening}\n\nReply to the agent.`)
  }
})
