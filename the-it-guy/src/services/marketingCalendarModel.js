export const MARKETING_CALENDAR_TIME_ZONE = 'Africa/Johannesburg'

export function validCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}
export function calendarDateKey(
  value,
  timeZone = MARKETING_CALENDAR_TIME_ZONE,
) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type).value)
    .join('-')
}
export function shiftCalendarDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export function shiftCalendarMonth(value, months) {
  const date = new Date(`${value}T12:00:00Z`)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate()
  date.setUTCDate(Math.min(day, last))
  return date.toISOString().slice(0, 10)
}
export function calendarMonthDays(value) {
  const first = `${value.slice(0, 7)}-01`
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay()
  const start = shiftCalendarDate(first, -(weekday + 6) % 7)
  return Array.from({ length: 42 }, (_, index) =>
    shiftCalendarDate(start, index),
  )
}
export function calendarItemsForDay(items, date) {
  return items.filter(
    (item) => item.startDate <= date && (!item.endDate || item.endDate >= date),
  )
}
// A campaign is date-range context; channel records are individual communications.
// Creation/update timestamps are never treated as delivery or publication dates.
export function buildMarketingCalendar(workspace, timeZone = MARKETING_CALENDAR_TIME_ZONE) {
  const items = [], undated = [], unscheduled = []
  const campaigns = new Map((workspace.campaigns || []).map((campaign) => [campaign.id, campaign]))
  const seen = new Set()
  function addCommunication(row, type, timestamp, extra = {}) {
    const id = `${type}:${row.id}`
    if (!row.id || seen.has(id)) return
    seen.add(id)
    const link = (workspace.activities || []).find((activity) =>
      activity.channel === type && activity[`${type}_campaign_id`] === row.id)
    const campaign = campaigns.get(link?.campaign_id)
    const item = {
      id, type, sourceId: row.id, title: row.name || row.title || `${type === 'post' ? 'Facebook post' : type === 'email' ? 'Email' : 'WhatsApp message'}`,
      status: row.display_status || row.status || 'draft',
      campaignId: campaign?.id, campaignName: campaign?.name, linked: Boolean(link),
      ...extra,
    }
    const date = timestamp ? calendarDateKey(timestamp, timeZone) : null
    if (!date) { unscheduled.push(item); return }
    items.push({ ...item, startDate: date, endDate: date, scheduledFor: timestamp })
  }
  for (const campaign of campaigns.values()) {
    const start = validCalendarDate(campaign.start_date) ? campaign.start_date : null
    const end = validCalendarDate(campaign.end_date) ? campaign.end_date : null
    if ((!start && !end) || (start && end && end < start)) { undated.push(campaign); continue }
    items.push({
      id: `campaign:${campaign.id}`, type: 'campaign', title: campaign.name,
      status: campaign.status, campaignId: campaign.id, campaignName: campaign.name,
      startDate: start || end, endDate: end, ongoing: Boolean(start && !end), endOnly: !start,
    })
  }
  for (const email of workspace.channels?.email?.data || []) {
    const timestamp = email.status === 'draft' ? null
      : email.sent_at || (['scheduled', 'sending', 'queued', 'cancelled', 'failed'].includes(email.status) ? email.scheduled_for : null)
    addCommunication(email, 'email', timestamp, { emailId: email.id })
  }
  for (const message of workspace.channels?.whatsapp?.data || []) {
    const status = message.display_status || message.status
    const timestamp = status === 'draft' ? null : message.sent_at || message.scheduled_at
    addCommunication(message, 'whatsapp', timestamp)
  }
  for (const post of workspace.channels?.posts?.data || []) {
    addCommunication(post, 'post', post.status === 'published' ? post.published_at : null, {
      channel: 'facebook', listingId: post.listing_id,
    })
  }
  return {
    items: items.sort((a, b) => a.startDate.localeCompare(b.startDate)
      || (a.type === 'campaign' ? 0 : 1) - (b.type === 'campaign' ? 0 : 1)
      || String(a.scheduledFor || '').localeCompare(String(b.scheduledFor || ''))
      || a.title.localeCompare(b.title)),
    undated, unscheduled,
  }
}

export function matchesCalendarFilters(item, { type = 'all', scope = 'all', campaignId = 'all', status = 'all', search = '' } = {}) {
  return (type === 'all' || item.type === type)
    && (scope === 'all' || (scope === 'linked' ? Boolean(item.campaignId || item.linked) : item.type !== 'campaign' && !item.campaignId && !item.linked))
    && (campaignId === 'all' || item.campaignId === campaignId)
    && (status === 'all' || item.status === status)
    && `${item.title} ${item.campaignName || ''}`.toLowerCase().includes(search.trim().toLowerCase())
}
