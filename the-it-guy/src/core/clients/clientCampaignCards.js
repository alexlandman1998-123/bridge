export const CAMPAIGN_FILTERS = [['all', 'All campaigns'], ['queued', 'Queued'], ['sent', 'Sent'], ['engaged', 'Engagement'], ['responded', 'Confirmed responses'], ['issues', 'Delivery issues']]

export function matchesCampaignFilter(campaign, filter) {
  if (filter === 'queued') return ['queued', 'scheduled', 'pending'].includes(campaign.status) && !campaign.sent_at
  if (filter === 'sent') return Boolean(campaign.sent_at)
  if (filter === 'engaged') return Boolean(campaign.opened_at || campaign.clicked_at || campaign.open_count || campaign.click_count)
  if (filter === 'responded') return Number(campaign.response_count) > 0
  if (filter === 'issues') return ['failed', 'bounced', 'complained', 'suppressed', 'cancelled', 'unsubscribed'].includes(campaign.status)
  return true
}

export function filterClientCampaigns(campaigns, { filter = 'all', search = '', order = 'recent' } = {}) {
  const query = search.trim().toLowerCase()
  const latest = campaign => Math.max(0, ...[campaign.created_at, campaign.sent_at, campaign.delivered_at, campaign.opened_at, campaign.clicked_at, ...(campaign.responses || []).map(response => response.occurred_at)].map(value => Date.parse(value) || 0))
  return campaigns.filter(campaign => matchesCampaignFilter(campaign, filter) && (!query || [campaign.campaign_name, campaign.subject, campaign.preview_text, campaign.email, ...(campaign.responses || []).map(response => response.detail)].filter(Boolean).join(' ').toLowerCase().includes(query)))
    .sort((a, b) => (order === 'activity' ? latest(b) - latest(a) : (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)) || String(a.id).localeCompare(String(b.id)))
}

// Use authored image/property blocks, never HTML tracking pixels or provider URLs.
export function campaignArtwork(content) {
  const blocks = Array.isArray(content?.blocks) ? content.blocks : []
  const images = blocks.flatMap(block => block?.type === 'image' ? [block.src] : block?.type === 'property' && Array.isArray(block.listings) ? block.listings.map(listing => listing?.image) : [])
  return images.find(value => typeof value === 'string' && /^https:\/\//i.test(value.trim()))?.trim() || ''
}
