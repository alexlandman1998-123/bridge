import { expect, it } from 'vitest'
import {
  campaignDemoMetrics,
  campaignDemoSummary,
} from '../campaignDemoAnalytics'
import { buildCampaignAnalytics } from '../marketingCampaignAnalytics'
const seller = {
  id: '2772ee16-2b06-47f3-afa7-322ebeefc303',
  organisation_id: '13c6b79f-1d8b-4886-aabf-42ea49565ef5',
  status: 'active',
}
const buyer = { ...seller, id: '8e4b687a-263d-429c-86c0-68ce6e299719' }
it('limits preview values to the exact mock campaigns, agency and development mode', () => {
  expect(campaignDemoMetrics(seller, true)).toMatchObject({
    budget: 15000,
    spend: 6250,
    remaining: 8750,
  })
  expect(campaignDemoMetrics(seller, false)).toBeNull()
  expect(
    campaignDemoMetrics({ ...seller, organisation_id: 'another-agency' }, true),
  ).toBeNull()
  expect(
    campaignDemoMetrics(
      { ...seller, id: 'another-campaign', name: 'Mock · Seller valuations' },
      true,
    ),
  ).toBeNull()
})
it('aggregates only visible demo campaigns and leaves recorded analytics unchanged', () => {
  const workspace = { campaigns: [seller, buyer], activities: [], channels: {} }
  const before = structuredClone(workspace)
  expect(campaignDemoSummary(workspace.campaigns, true)).toEqual({
    count: 2,
    delivered: 5540,
    clicks: 434,
  })
  expect(campaignDemoSummary([seller], true).delivered).toBe(2360)
  expect(campaignDemoSummary(workspace.campaigns, false)).toBeNull()
  expect(workspace).toEqual(before)
  expect(buildCampaignAnalytics(workspace).delivered).toBeNull()
})
