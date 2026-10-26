export function campaignOutcomes({ entries = [], tasksAvailable = true, activitiesAvailable = true } = {}) {
  const people = new Map()
  for (const entry of entries) {
    if (!entry.lead_id) continue
    const previous = people.get(entry.lead_id)
    if (!previous || Date.parse(entry.responded_at) > Date.parse(previous.responded_at)) people.set(entry.lead_id, entry)
  }
  const rows = [...people.values()]
  const stages = new Map()
  for (const row of rows) {
    const stage = String(row.lead?.stage || row.lead?.status || 'Stage not recorded').trim()
    stages.set(stage, (stages.get(stage) || 0) + 1)
  }
  return {
    enquiries: rows.length,
    contacted: activitiesAvailable ? rows.filter((row) => row.lastContact && Date.parse(row.lastContact.activity_date) >= Date.parse(row.responded_at)).length : null,
    overdue: tasksAvailable ? rows.filter((row) => row.overdue).length : null,
    unassigned: rows.filter((row) => !row.ownerId).length,
    stages: [...stages].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  }
}
