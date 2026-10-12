export const ACTIVITY_VIEWS = [
  ['all', 'All activity'], ['incoming', 'Incoming'], ['outgoing', 'Outgoing'],
  ['work', 'In progress'], ['campaigns', 'Campaigns'],
]

export function isCampaignActivity(event) {
  return String(event.event_type || '').startsWith('campaign.')
}

// Direction comes from recorded event semantics, never from an assumed sender.
export function activityDirection(event) {
  if (event.event_type === 'campaign.response') return 'incoming'
  if (isCampaignActivity(event)) return 'outgoing'
  if (event.actor_kind === 'client' || (event.category === 'enquiry' && /received|recorded|created/i.test(event.title))) return 'incoming'
  if (event.origin_table === 'client_portal_notifications') return 'outgoing'
  return 'internal'
}

export function matchesActivityView(event, view) {
  if (view === 'campaigns') return isCampaignActivity(event)
  if (view === 'work') return ['task', 'appointment', 'transaction', 'document', 'offer'].includes(event.category)
  return view === 'all' || activityDirection(event) === view
}

export function filterActivity(events, { view = 'all', search = '', from = '', to = '' } = {}) {
  const query = search.trim().toLowerCase()
  return events.filter(event => {
    const date = new Date(event.occurred_at)
    const day = Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : ''
    return matchesActivityView(event, view)
      && (!query || [event.title, event.detail, event.actor_name, event.event_type].filter(Boolean).join(' ').toLowerCase().includes(query))
      && (!from || day >= from) && (!to || day <= to)
  })
}

export function groupActivity(events) {
  const groups = new Map()
  for (const event of events) {
    // Only group provider milestones sharing an exact recipient identity.
    // Staff responses remain independent because their journal rows lack that ID.
    const key = isCampaignActivity(event) && event.origin_table === 'email_campaign_recipients' && event.origin_id
      ? `campaign:${event.origin_id}` : event.id
    if (!groups.has(key)) groups.set(key, { id: key, campaign: isCampaignActivity(event), events: [] })
    groups.get(key).events.push(event)
  }
  return [...groups.values()].map(group => ({ ...group, events: group.events.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)) }))
    .sort((a, b) => Date.parse(b.events[0].occurred_at) - Date.parse(a.events[0].occurred_at))
}
