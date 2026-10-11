import { getOrganisationDisplayLogo } from '../organisation/organisationAvatarUtils.js'

const text = value => String(value || '').trim()
const key = value => text(value).toLowerCase()

export function getDevelopmentLeadAssignedAgent(lead = {}, users = []) {
  const assignedId = key(lead.assignedAgentId)
  const assignedEmail = key(lead.assignedAgentEmail)
  const sourceAgentId = assignedId || assignedEmail ? '' : key(lead.sourceAgentUserId)
  const matches = (user, target) => target && [user.id, user.userId, user.user_id, user.email].some(value => key(value) === target)
  const agent = users.find(user => matches(user, assignedId)) || users.find(user => matches(user, assignedEmail)) || users.find(user => matches(user, sourceAgentId))
  return {
    name: text(agent?.fullName || agent?.name || [agent?.firstName, agent?.lastName].filter(Boolean).join(' ') || agent?.email || lead.assignedAgentEmail) || (assignedId || sourceAgentId ? 'Assigned agent' : 'Unassigned'),
    avatarUrl: text(agent?.avatarUrl || agent?.avatar_url),
  }
}

export function getDevelopmentLeadUnitImage(lead = {}, unitRows = []) {
  const unitId = text(lead.preferredUnitId)
  if (!unitId) return ''
  const unit = unitRows.map(row => row.unit || row).find(item => text(item.id) === unitId)
  return text(unit?.image_url || unit?.imageUrl)
}

export function getDevelopmentLeadSourceBrand(lead = {}, workspace = {}) {
  const source = key(lead.leadSource).replace(/[\s-]+/g, '_')
  const sourceOrgId = source === 'developer_direct' ? text(lead.developerOrgId) : source === 'agency_introduced' ? text(lead.sourceAgencyOrgId) : ''
  const workspaceId = text(workspace.id || workspace.organisationId || workspace.organisation_id)
  if (!sourceOrgId || sourceOrgId !== workspaceId) return { logoUrl: '', name: '' }
  const organisation = { ...workspace.raw, ...workspace }
  return { logoUrl: getOrganisationDisplayLogo(organisation, { smallFormat: false }), name: text(organisation.displayName || organisation.name) }
}
