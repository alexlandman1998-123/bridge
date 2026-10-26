import { calendarDateKey, shiftCalendarDate, validCalendarDate } from './marketingCalendarModel'

export const ATTENTION_FILTERS = { all: 'All work', enquiries: 'Enquiries', drafts: 'Drafts & plans', delivery: 'Delivery', upcoming: 'Upcoming' }
const channelNames = { email: 'Email', whatsapp: 'WhatsApp' }
const closed = (lead) => /^(lost|won|converted|closed|archived)$/i.test(lead?.status || '') || /^(lost|won|converted|closed|archived)$/i.test(lead?.stage || '')
export const campaignWorkUrl = (id, tab = 'overview', enquiry) => `/marketing?${new URLSearchParams({ section: 'campaigns', page: 'overview', view: 'detail', id, tab, ...(enquiry ? { enquiry } : {}) })}`

// Queue rows describe saved records, never inferred replies or assumed automation runs.
export function buildCampaignAttention(workspace, enquiryState = {}, { campaignId, now = new Date() } = {}) {
  const today = calendarDateKey(now), horizon = shiftCalendarDate(today, 7)
  const campaigns = new Map((workspace.campaigns || []).filter((row) => !campaignId || row.id === campaignId).map((row) => [row.id, row]))
  const items = [], enquiries = new Map(), warnings = [...(enquiryState.warnings || [])]
  const associated = (campaign, extra) => ({ campaignId: campaign.id, campaignName: campaign.name, ...extra })
  for (const entry of enquiryState.entries || []) {
    const campaign = campaigns.get(entry.campaign_id)
    if (!campaign || closed(entry.lead)) continue
    const overdue = enquiryState.tasksAvailable !== false && validCalendarDate(entry.nextTask?.due_date) && entry.nextTask.due_date < today
    const awaiting = enquiryState.activitiesAvailable !== false && entry.awaitingContact
    const noTask = enquiryState.tasksAvailable !== false && !entry.nextTask
    const dueToday = enquiryState.tasksAvailable !== false && entry.nextTask?.due_date === today
    if (!overdue && !awaiting && entry.ownerId && !noTask && !dueToday) continue
    // A shared CRM task or person linked to several campaigns is one piece of work.
    const existing = enquiries.get(entry.lead_id)
    if (existing) { if (!existing.campaignNames.includes(campaign.name)) existing.campaignNames.push(campaign.name); continue }
    const reason = overdue ? 'Overdue follow-up' : !entry.ownerId ? 'Assign an agent' : awaiting ? 'Awaiting first contact' : dueToday ? 'Follow-up due today' : 'Set the next step'
    const row = associated(campaign, {
      id: `enquiry:${entry.lead_id}`, category: 'enquiries', priority: overdue ? 0 : awaiting ? 1 : 2,
      title: entry.name, label: reason, campaignNames: [campaign.name],
      detail: entry.nextTask ? `${entry.nextTask.title}${awaiting ? ' · No contact logged since response' : ''}` : awaiting ? 'No contact logged since response' : enquiryState.tasksAvailable === false ? 'Follow-up tasks unavailable' : 'No open follow-up task',
      owner: entry.ownerName, date: entry.nextTask?.due_date || calendarDateKey(entry.responded_at),
      href: !entry.ownerId ? `/pipeline/leads/${encodeURIComponent(entry.lead_id)}` : campaignWorkUrl(campaign.id, 'enquiries', entry.lead_id),
      action: !entry.ownerId ? 'Assign in CRM' : 'Review enquiry',
    })
    enquiries.set(entry.lead_id, row)
    items.push(row)
  }
  const seen = new Set()
  for (const channel of ['email', 'whatsapp']) {
    const source = workspace.channels?.[channel]
    if (source?.error) { warnings.push(`${channelNames[channel]} activity is unavailable.`); continue }
    const records = new Map((source?.data || []).map((row) => [row.id, row]))
    for (const link of workspace.activities || []) {
      const campaign = campaigns.get(link.campaign_id)
      if (!campaign || link.channel !== channel) continue
      const record = records.get(link[`${channel}_campaign_id`])
      if (!record || seen.has(`${channel}:${record.id}`)) continue
      seen.add(`${channel}:${record.id}`)
      const status = record.display_status || record.status
      const failed = Number(record.failed) > 0 ? Number(record.failed) : 0
      const timestamp = channel === 'email' ? record.scheduled_for : record.scheduled_at
      const scheduled = ['scheduled', 'queued'].includes(status) && !record.sent_at && timestamp && Number.isFinite(Date.parse(timestamp))
      const late = scheduled && Date.parse(timestamp) < new Date(now).getTime() - 15 * 60000
      const date = scheduled ? calendarDateKey(timestamp) : null
      const base = associated(campaign, { id: `${channel}:${record.id}`, title: record.name || `${channelNames[channel]} communication`, channel, href: `/marketing?section=${channel}&view=${status === 'draft' ? 'create' : 'detail'}&id=${encodeURIComponent(record.id)}` })
      if (status === 'failed' || failed || late) {
        items.push({ ...base, category: 'delivery', priority: 0, label: late ? 'Schedule needs review' : status === 'failed' ? 'Send failed' : 'Delivery issues', detail: late ? 'Scheduled time has passed; check the channel status' : failed ? `${failed.toLocaleString()} failed recipient${failed === 1 ? '' : 's'}` : 'Open the send to review the failure', date, action: 'Review send' })
      } else if (status === 'draft' && campaign.status !== 'completed') {
        items.push({ ...base, category: 'drafts', priority: 3, label: `${channelNames[channel]} draft`, detail: 'Finish the content, recipients and schedule', action: 'Continue draft' })
      } else if (scheduled && date >= today && date <= horizon) {
        items.push({ ...base, category: 'upcoming', priority: 4, label: `${channelNames[channel]} scheduled`, detail: 'Scheduled in the channel', date, timestamp, action: 'Review send' })
      }
    }
  }
  for (const campaign of campaigns.values()) {
    if (campaign.status === 'completed') continue
    if (campaign.status === 'draft' || (campaign.playbook && campaign.playbook.sourceRevision !== campaign.revision)) {
      items.push(associated(campaign, { id: `plan:${campaign.id}`, category: 'drafts', priority: 3, title: campaign.name, label: campaign.status === 'draft' ? 'Campaign draft' : 'Playbook needs review', detail: campaign.status === 'draft' ? 'Review the brief and prepare your channel activity' : 'The campaign brief changed after the playbook was saved', href: campaignWorkUrl(campaign.id, 'playbook'), action: 'Review plan' }))
    }
    if (['scheduled', 'active'].includes(campaign.status) && validCalendarDate(campaign.start_date) && campaign.start_date >= today && campaign.start_date <= horizon) {
      items.push(associated(campaign, { id: `start:${campaign.id}`, category: 'upcoming', priority: 4, title: campaign.name, label: 'Campaign plan starts', detail: 'Planned start · channel sends have their own schedules', date: campaign.start_date, href: campaignWorkUrl(campaign.id, 'playbook'), action: 'Review plan' }))
    }
  }
  return {
    items: items.sort((a, b) => a.priority - b.priority || String(a.date || '9999').localeCompare(b.date || '9999') || String(a.timestamp || '').localeCompare(b.timestamp || '') || a.title.localeCompare(b.title)),
    warnings: [...new Set(warnings)],
    enquiriesAvailable: !enquiryState.error && !enquiryState.loading && enquiryState.tasksAvailable !== false && enquiryState.activitiesAvailable !== false,
  }
}
