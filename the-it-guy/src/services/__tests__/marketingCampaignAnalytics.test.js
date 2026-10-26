import { expect, it } from 'vitest'
import { buildCampaignAnalytics } from '../marketingCampaignAnalytics'
function workspace() {
  return {
    campaigns: [
      { id: 'one', name: 'Seller drive' },
      { id: 'two', name: 'Buyer drive' },
    ],
    activities: [
      { campaign_id: 'one', channel: 'email', email_campaign_id: 'a' },
      { campaign_id: 'one', channel: 'email', email_campaign_id: 'b' },
      { campaign_id: 'two', channel: 'email', email_campaign_id: 'c' },
      { campaign_id: 'one', channel: 'whatsapp', whatsapp_campaign_id: 'w' },
    ],
    channels: {
      email: {
        data: [
          { id: 'a', delivered: 100, clicked: 50, status: 'sent' },
          { id: 'b', delivered: 900, clicked: 9, status: 'sent' },
          { id: 'c', delivered: 10, clicked: 2, status: 'sent' },
        ],
      },
      whatsapp: {
        data: [{ id: 'w', delivered: 100, read: 30, status: 'sent' }],
      },
    },
  }
}
it('aggregates linked deliveries and computes weighted campaign rates within each channel', () => {
  const result = buildCampaignAnalytics(workspace())
  expect(result.delivered).toBe(1110)
  const email = result.channels[0]
  expect(email.rankings.map((row) => row.id)).toEqual(['two', 'one'])
  expect(email.rankings[1].rate).toBeCloseTo(5.9)
  expect(email.rankings[1].delivered).toBe(1000)
  expect(result.channels[1].rate).toBe(30)
  expect(result.recommendation.title).toContain('Seller drive')
  expect(result.recommendation.reason).toContain('at least 20 deliveries')
})
it('excludes unlinked sends and links to plans outside this workspace', () => {
  const input = workspace()
  input.channels.email.data.push({
    id: 'foreign',
    delivered: 10000,
    clicked: 10000,
  })
  input.activities.push({
    campaign_id: 'outside',
    channel: 'email',
    email_campaign_id: 'foreign',
  })
  expect(buildCampaignAnalytics(input).delivered).toBe(1110)
})
it('does not turn missing or permission-restricted results into zero or a valid ranking', () => {
  const input = workspace()
  input.channels.email.data = input.channels.email.data.filter(
    (item) => item.id !== 'b',
  )
  const result = buildCampaignAnalytics(input)
  expect(result.delivered).toBeNull()
  expect(result.channels[0].engaged).toBeNull()
  expect(result.channels[0].rankings.map((item) => item.id)).toEqual(['two'])
  expect(result.recommendation.signal).toBe('Results coverage')
  input.channels.email.metricsError = 'Forbidden'
  expect(buildCampaignAnalytics(input).channels[0].rankings).toEqual([])
})
it('avoids invalid rates and flags inconsistent or negative metrics', () => {
  for (const invalid of [
    { delivered: 0, clicked: 1 },
    { delivered: -1, clicked: 0 },
    { delivered: 10, clicked: 11 },
    { delivered: 10, clicked: NaN },
  ]) {
    const input = workspace()
    Object.assign(input.channels.email.data[0], invalid)
    expect(
      buildCampaignAnalytics(input).channels[0].rankings.some(
        (item) => item.id === 'one',
      ),
    ).toBe(false)
  }
  const input = workspace()
  input.channels.email.data.forEach((item) => {
    item.delivered = 0
    item.clicked = 0
  })
  expect(buildCampaignAnalytics(input).channels[0].rate).toBeNull()
})
it('prioritises a recorded delivery issue and directs the user to the affected plan', () => {
  const input = workspace()
  input.channels.email.data[0].status = 'partially_failed'
  const recommendation = buildCampaignAnalytics(input).recommendation
  expect(recommendation.signal).toBe('Delivery review')
  expect(recommendation.url).toContain('id=one&tab=activity')
})
it('handles a new workspace, unlinked plans and zero deliveries with useful next actions', () => {
  const empty = buildCampaignAnalytics({
    campaigns: [],
    activities: [],
    channels: {},
  })
  expect(empty.delivered).toBeNull()
  expect(empty.recommendation.url).toContain('view=templates')
  const input = workspace()
  input.activities = []
  expect(buildCampaignAnalytics(input).recommendation.action).toBe(
    'Link campaign activity',
  )
  input.activities = [
    { campaign_id: 'one', channel: 'email', email_campaign_id: 'a' },
  ]
  input.channels.email.data = [
    { id: 'a', delivered: 0, clicked: 0, status: 'scheduled' },
  ]
  expect(buildCampaignAnalytics(input).recommendation.signal).toBe(
    'Awaiting results',
  )
})
it('shows early results without presenting a small sample as a proven strategy', () => {
  const input = workspace()
  input.activities = [
    { campaign_id: 'two', channel: 'email', email_campaign_id: 'c' },
  ]
  const recommendation = buildCampaignAnalytics(input).recommendation
  expect(recommendation.signal).toBe('Early results')
  expect(recommendation.reason).toContain('20 deliveries')
})

it('sends a coverage recommendation to the plan with missing results', () => {
  const input = workspace()
  input.channels.email.data[2].clicked = null
  expect(buildCampaignAnalytics(input).recommendation.url).toContain(
    'id=two&tab=activity',
  )
})
it('reviews a substantial campaign with no engagement without calling it a promising performer', () => {
  const input = workspace()
  input.activities = [
    { campaign_id: 'one', channel: 'email', email_campaign_id: 'a' },
  ]
  input.channels.email.data[0].clicked = 0
  const result = buildCampaignAnalytics(input)
  expect(result.recommendation.signal).toBe('Engagement review')
  expect(result.recommendation.url).toContain('id=one')
})
