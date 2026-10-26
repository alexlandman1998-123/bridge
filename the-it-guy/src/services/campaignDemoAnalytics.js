// Local design-preview figures for the two explicitly created Kingdom mock plans.
// Never write these values into delivery, advertising or attribution records.
const kingdomId = '13c6b79f-1d8b-4886-aabf-42ea49565ef5'
const samples = {
  '2772ee16-2b06-47f3-afa7-322ebeefc303': {
    budget: 15000,
    spend: 6250,
    leads: 18,
    views: 12480,
    clicks: 186,
    delivered: 2360,
    reads: 412,
  },
  '8e4b687a-263d-429c-86c0-68ce6e299719': {
    budget: 12000,
    spend: 4380,
    leads: 27,
    views: 18940,
    clicks: 248,
    delivered: 3180,
    reads: 526,
  },
}
export function campaignDemoMetrics(campaign, enabled = import.meta.env.DEV) {
  if (
    !enabled ||
    campaign.organisation_id !== kingdomId ||
    !samples[campaign.id]
  )
    return null
  const sample = samples[campaign.id]
  return { ...sample, remaining: sample.budget - sample.spend }
}
export function campaignDemoSummary(campaigns, enabled = import.meta.env.DEV) {
  const samples = campaigns
    .map((campaign) => campaignDemoMetrics(campaign, enabled))
    .filter(Boolean)
  if (!samples.length) return null
  return {
    count: samples.length,
    delivered: samples.reduce((sum, item) => sum + item.delivered, 0),
    clicks: samples.reduce((sum, item) => sum + item.clicks, 0),
  }
}
