const text = (value) => String(value ?? '').trim()

export function isRentalLeadVisibleInScope(lead = {}, options = {}) {
  if (options.scopeLevel === 'organisation' && options.includeAllOrganisationLeads === true) return true
  if (options.scopeLevel === 'branch' && text(options.branchId)) return text(lead.branchId) === text(options.branchId)
  const actorId = text(options.assignedAgentId)
  return Boolean(actorId) && [lead.assignedAgentId, lead.assignedUserId, lead.createdBy].map(text).includes(actorId)
}

export function assertRentalLeadAssignee(scope = {}, candidate = {}, organisationId = '') {
  if (!['organisation', 'branch'].includes(text(scope.scopeLevel))) throw new Error('Only organisation or branch managers can assign rental leads.')
  if (!text(candidate.userId) || !['active', 'accepted'].includes(text(candidate.status).toLowerCase())) throw new Error('Choose an active team member.')
  if (text(candidate.organisationId) !== text(organisationId)) throw new Error('The assignee must belong to this organisation.')
  if (scope.scopeLevel === 'branch' && (!text(scope.branchId) || text(candidate.branchId) !== text(scope.branchId))) throw new Error('Choose a team member in your branch.')
}
