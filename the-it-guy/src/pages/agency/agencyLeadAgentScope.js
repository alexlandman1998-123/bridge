const text = (value) => String(value || '').trim()
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function agencyLeadAgentScope(agent) {
  if (!agent) return null
  return {
    ids: [...new Set([agent.userId, agent.user_id, agent.id, agent.membershipId, agent.organisationUserId].map(text).filter((id) => uuid.test(id)))].sort(),
    email: text(agent.email).toLowerCase(),
  }
}

// Build the assignment predicate before range/count, using only columns present
// in this installation's compatible lead projection. Values remain quoted data.
export function agencyLeadAgentFilter(scope, fields) {
  if (!scope) return ''
  const columns = new Set(fields.split(',').map(text))
  const terms = []
  for (const column of ['assigned_user_id', 'assigned_agent_id']) {
    if (columns.has(column)) for (const id of scope.ids) terms.push(`${column}.eq.${JSON.stringify(id)}`)
  }
  if (scope.email && columns.has('assigned_agent_email')) terms.push(`assigned_agent_email.eq.${JSON.stringify(scope.email)}`)
  if (!terms.length) throw new Error('This agent needs a linked user account before their leads can be loaded.')
  return terms.join(',')
}

export function filterAgencyLeadsForAgent(leads, agent, organisationId) {
  if (!agent) return leads
  const scope = agencyLeadAgentScope(agent)
  return leads.filter((lead) => {
    const org = text(lead.organisationId || lead.organisation_id)
    if (org && org !== organisationId) return false
    const ids = [lead.assignedUserId, lead.assigned_user_id, lead.assignedAgentId, lead.assigned_agent_id].map(text)
    return ids.some((id) => scope.ids.includes(id)) || Boolean(scope.email && text(lead.assignedAgentEmail || lead.assigned_agent_email).toLowerCase() === scope.email)
  })
}
