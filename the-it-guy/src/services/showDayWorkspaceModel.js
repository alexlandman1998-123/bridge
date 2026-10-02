export function buildShowDayMetrics(detail = {}, rows = null) {
  const count = (value) => Math.max(0, Number(value) || 0)
  const interested = (row) => ['high', 'medium'].includes(row.interest_level) || row.conversion_outcome === 'attended_interested'
  const registrations = rows ? rows.length : count(detail.registrations)
  const attendees = rows ? rows.filter((row) => row.checked_in_at).length : count(detail.attendees)
  return {
    registrations,
    confirmed: rows ? rows.filter((row) => row.status === 'confirmed').length : count(detail.confirmed),
    attendees,
    leads: rows ? rows.filter((row) => row.crm_lead_id || interested(row) || row.conversion_outcome === 'attended_follow_up').length : count(detail.interestedLeads),
    interestedLeads: rows ? rows.filter(interested).length : count(detail.interestedLeads),
    attendanceRate: registrations ? `${Math.round(attendees / registrations * 100)}%` : '0%',
    outstandingFollowUps: rows ? rows.filter((row) => (interested(row) || row.conversion_outcome === 'attended_follow_up') && !row.conversion_processed_at).length : null,
  }
}

export function getShowDayAction(detail = {}, now = Date.now()) {
  const status = String(detail.status || '').toLowerCase()
  if (status === 'cancelled') return { label: 'Review event', tab: 'overview' }
  if (status === 'completed' || (status !== 'draft' && detail.endsAt && new Date(detail.endsAt).getTime() < now)) return { label: 'Follow up leads', tab: 'leads' }
  if (status !== 'draft' && detail.startsAt && new Date(detail.startsAt).getTime() <= now && (!detail.endsAt || new Date(detail.endsAt).getTime() >= now)) return { label: 'Check in attendees', tab: 'attendees' }
  return { label: 'Promote', tab: 'promote' }
}
