const ACTIVE = new Set(['active', 'accepted', 'approved'])
const ROLES = new Set(['agent', 'estate_agent', 'sales_agent', 'listing_agent', 'owner', 'agency_owner', 'principal', 'agency_principal'])
const text = (value) => String(value || '').trim()
const key = (value) => text(value).toLowerCase().replace(/[\s-]+/g, '_')

export function additionalListingAgentIds(listing = {}) {
  const values = listing.additional_agent_ids ?? listing.additionalAgentIds ?? []
  if (!Array.isArray(values)) throw contactAgentError('Choose additional agents from the agency directory.')
  return [...new Set(values.map(text).filter(Boolean))].filter((id) => id !== text(listing.assigned_agent_id || listing.assignedAgentId))
}

export function contactAgentError(message, code = 'listing_contact_agent_invalid') {
  return Object.assign(new Error(message), { code, status: 409 })
}

export async function validateAdditionalListingAgents({ client, organisationId, agentIds = [] }) {
  if (!agentIds.length) return []
  const { data, error } = await client.from('organisation_users').select('*')
    .eq('organisation_id', organisationId).in('user_id', agentIds)
  if (error) throw error
  return agentIds.map((id) => {
    const member = (data || []).find((row) => text(row.user_id) === id)
    const role = key(member?.workspace_role || member?.organisation_role || member?.organization_role || member?.role)
    if (!member || !ACTIVE.has(key(member.membership_status || member.status)) || !(ROLES.has(role) || role.endsWith('_agent'))) {
      throw contactAgentError('Every additional agent must be an active listing agent in this agency.')
    }
    return member
  })
}
