import { buildCampaignAttention, campaignWorkUrl } from './campaignAttentionModel'
import { buildCampaignAnalytics } from './marketingCampaignAnalytics'
import { calendarDateKey, validCalendarDate } from './marketingCalendarModel'

export const activeCampaignMember = (member) => Boolean(member.userId && ['active', 'accepted'].includes(String(member.membershipStatus || member.status || 'active').trim().toLowerCase()))
const terminal = (entry) => /^(lost|won|converted|closed|archived)$/i.test(entry.lead?.status || '') || /^(lost|won|converted|closed|archived)$/i.test(entry.lead?.stage || '')

export function buildCampaignAgentOversight(workspace, directory = [], enquiryState = {}, now = new Date()) {
  const campaigns = workspace.campaigns || [], campaignMap = new Map(campaigns.map((row) => [row.id, row]))
  const today = calendarDateKey(now)
  const members = new Map(directory.filter((row) => row.userId).map((row) => [row.userId, row]))
  const owner = (id) => members.get(id)?.fullName || (id === workspace.userId ? 'You' : id === 'unassigned' ? 'Unassigned' : `Agent · ${id.slice(0, 8)}`)
  const validEntries = (enquiryState.entries || []).filter((entry) => campaignMap.has(entry.campaign_id))
  const entryMap = new Map()
  for (const entry of validEntries) if (!entryMap.has(entry.lead_id) || entry.responded_at > entryMap.get(entry.lead_id).responded_at) entryMap.set(entry.lead_id, entry)
  const attention = buildCampaignAttention(workspace, enquiryState, { now })
  const ids = [...new Set([...directory.filter(activeCampaignMember).map((row) => row.userId), ...campaigns.map((row) => row.created_by || 'unassigned'), ...validEntries.filter((row) => !terminal(row)).map((row) => row.ownerId || 'unassigned')])]
  const agents = ids.map((id) => {
    const plans = campaigns.filter((row) => (row.created_by || 'unassigned') === id)
    const entries = [...entryMap.values()].filter((row) => !terminal(row) && (row.ownerId || 'unassigned') === id)
    const work = attention.items.filter((item) => item.category !== 'upcoming' && (item.category === 'enquiries' ? (entryMap.get(item.id.slice('enquiry:'.length))?.ownerId || 'unassigned') === id : (campaignMap.get(item.campaignId)?.created_by || 'unassigned') === id))
    return { id, name: owner(id), member: members.get(id), plans, entries, work,
      canReceive: activeCampaignMember(members.get(id) || {}),
      counts: Object.fromEntries(['active', 'scheduled', 'draft', 'completed'].map((key) => [key, plans.filter((row) => row.status === key).length])),
      untouched: enquiryState.activitiesAvailable === false || enquiryState.error || enquiryState.loading ? null : entries.filter((row) => row.awaitingContact).length,
      overdue: enquiryState.tasksAvailable === false || enquiryState.error || enquiryState.loading ? null : entries.filter((row) => validCalendarDate(row.nextTask?.due_date) && row.nextTask.due_date < today).length,
      supportCount: work.length,
      channels: [...new Set(plans.flatMap((row) => row.planned_channels || []))],
    }
  }).sort((a, b) => b.supportCount - a.supportCount || b.counts.active - a.counts.active || b.plans.length - a.plans.length || a.name.localeCompare(b.name))
  const campaignEnquiries = new Map()
  for (const entry of validEntries) {
    if (!campaignEnquiries.has(entry.campaign_id)) campaignEnquiries.set(entry.campaign_id, new Set())
    campaignEnquiries.get(entry.campaign_id).add(entry.lead_id)
  }
  const analytics = buildCampaignAnalytics(workspace)
  const reuse = {
    enquiries: enquiryState.error || enquiryState.loading ? [] : campaigns.map((campaign) => ({ campaign, count: campaignEnquiries.get(campaign.id)?.size || 0 })).filter((row) => row.count > 0).sort((a, b) => b.count - a.count || a.campaign.name.localeCompare(b.campaign.name)),
    ...Object.fromEntries(analytics.channels.map((channel) => [channel.key, channel.rankings.filter((row) => row.delivered >= 20 && row.engaged > 0).map((row) => ({ campaign: campaignMap.get(row.id), count: row.engaged, delivered: row.delivered, rate: row.rate }))])),
  }
  return { agents, reuse, attention, ownerName: owner,
    enquiriesAvailable: !enquiryState.error && !enquiryState.loading,
    totalUntouched: enquiryState.activitiesAvailable === false || enquiryState.error || enquiryState.loading ? null : [...entryMap.values()].filter((row) => !terminal(row) && row.awaitingContact).length,
    supportAgents: agents.filter((row) => row.supportCount > 0).length,
    workUrl: campaignWorkUrl,
  }
}
