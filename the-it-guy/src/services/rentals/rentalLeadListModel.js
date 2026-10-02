export const rentalLeadIsClosed = (lead) => lead.outcome?.status && lead.outcome.status !== 'open'
export function rentalLeadListSummary(leads, now = new Date()) {
  const active = leads.filter((lead) => !rentalLeadIsClosed(lead))
  const sources = new Map()
  for (const lead of leads) sources.set(lead.source || 'Manual', (sources.get(lead.source || 'Manual') || 0) + 1)
  const [topSource = 'No source data', topSourceCount = 0] = [...sources].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || []
  const converted = leads.filter((lead) => {
    const date = new Date(lead.outcome?.recordedAt)
    return lead.outcome?.status === 'won' && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  })
  const lost = leads.filter((lead) => ['lost', 'withdrawn'].includes(lead.outcome?.status)).length
  return { newLeads: active.filter((lead) => lead.stage === 'new').length, active: active.length, landlord: active.filter((lead) => lead.role === 'landlord').length, tenant: active.filter((lead) => lead.role === 'tenant').length, closed: leads.length - active.length, converted: converted.length, convertedLandlords: converted.filter((lead) => lead.role === 'landlord').length, convertedTenants: converted.filter((lead) => lead.role === 'tenant').length, topSource, topSourceCount, lost, lostRate: leads.length ? Math.round(lost / leads.length * 100) : 0, total: leads.length }
}
export function filterRentalLeadList(leads, { role, query = '', owner = 'all', source = 'all', stage = 'all', sort = 'newest', assignedAgentId }) {
  const rows = leads.filter((lead) => (role === 'closed' ? rentalLeadIsClosed(lead) : !rentalLeadIsClosed(lead) && lead.role === role)
    && (owner === 'all' || (owner === 'unassigned' ? !lead.assignedAgentId : lead.assignedAgentId === (owner === 'mine' ? assignedAgentId : owner)))
    && (source === 'all' || lead.source === source) && (stage === 'all' || lead.stage === stage)
    && [lead.name, lead.focus, lead.phone, lead.email, lead.source, lead.assignedAgentName].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
  const time = (value) => Date.parse(value) || 0
  return rows.sort((a, b) => sort === 'stage' ? (a.stageLabel || a.stage).localeCompare(b.stageLabel || b.stage) : sort === 'oldest' ? time(a.createdAt) - time(b.createdAt) : time(b.createdAt) - time(a.createdAt))
}
