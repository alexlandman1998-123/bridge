function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

const ASSIGNABLE_AGENT_ROLES = new Set([
  'agent',
  'sales_agent',
  'principal',
  'owner',
  'director',
  'partner',
  'branch_manager',
  'sales_manager',
  'team_lead',
  'manager',
])

const INACTIVE_AGENT_STATUSES = new Set([
  'inactive',
  'invited',
  'pending',
  'pending_approval',
  'pending_invite',
  'suspended',
  'disabled',
  'declined',
  'removed',
  'archived',
])

export function getAgentProfileAvatarUrl(source = {}) {
  return normalizeText(
    source.avatarUrl ||
      source.avatar_url ||
      source.profilePhotoUrl ||
      source.profile_photo_url ||
      source.photoUrl ||
      source.photo_url ||
      source.profile?.avatar_url ||
      source.user_metadata?.avatar_url,
  )
}

export function getAgentDisplayName(source = {}) {
  return (
    normalizeText(source.name || source.fullName || source.full_name) ||
    [source.firstName || source.first_name, source.lastName || source.last_name].map(normalizeText).filter(Boolean).join(' ') ||
    normalizeText(source.email) ||
    'Agent'
  )
}

function getAgentRoleLabel(source = {}) {
  const role = normalizeKey(source.workspaceRole || source.workspace_role || source.organisationRole || source.organisation_role || source.role)
  const labels = {
    agent: 'Agent',
    sales_agent: 'Agent',
    principal: 'Principal',
    owner: 'Owner',
    director: 'Director',
    partner: 'Partner',
    branch_manager: 'Branch Manager',
    sales_manager: 'Sales Manager',
    team_lead: 'Team Lead',
    manager: 'Manager',
  }
  return labels[role] || (role ? role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Agent')
}

function isAssignableAgent(source = {}) {
  const role = normalizeKey(source.workspaceRole || source.workspace_role || source.organisationRole || source.organisation_role || source.role)
  const status = normalizeKey(source.membershipStatus || source.membership_status || source.status)
  if (INACTIVE_AGENT_STATUSES.has(status)) return false
  return ASSIGNABLE_AGENT_ROLES.has(role) || role.includes('agent')
}

export function getAgentOptionKey(option = {}) {
  return normalizeText(option.id || option.userId || option.email || option.name)
}

export function buildActorAgentOption(actor = {}) {
  const id = normalizeText(actor.userId || actor.id)
  return {
    id,
    userId: id,
    name: normalizeText(actor.name || actor.fullName) || 'Current user',
    email: normalizeText(actor.email).toLowerCase(),
    avatarUrl: getAgentProfileAvatarUrl(actor),
    roleLabel: getAgentRoleLabel(actor),
    branchId: normalizeText(actor.branchId),
    isCurrentUser: true,
  }
}

function mapDirectoryUserToAgentOption(user = {}) {
  const userId = normalizeText(user.userId || user.user_id || user.profile?.id)
  const id = normalizeText(userId || user.id)
  return {
    id,
    userId: normalizeText(userId || id),
    membershipId: normalizeText(user.id),
    name: getAgentDisplayName(user),
    email: normalizeText(user.email).toLowerCase(),
    avatarUrl: getAgentProfileAvatarUrl(user),
    roleLabel: getAgentRoleLabel(user),
    branchId: normalizeText(user.branchId || user.branch_id),
    status: normalizeText(user.membershipStatus || user.membership_status || user.status),
  }
}

export function buildAgentOptions(users = [], actor = {}) {
  const actorOption = buildActorAgentOption(actor)
  const actorUserId = normalizeText(actorOption.userId || actorOption.id).toLowerCase()
  const actorEmail = normalizeText(actorOption.email).toLowerCase()
  const options = [
    ...users.filter(isAssignableAgent).map((user) => {
      const option = mapDirectoryUserToAgentOption(user)
      const optionUserId = normalizeText(option.userId || option.id).toLowerCase()
      const optionEmail = normalizeText(option.email).toLowerCase()
      return {
        ...option,
        isCurrentUser: Boolean(
          (actorUserId && optionUserId === actorUserId) ||
            (actorEmail && optionEmail === actorEmail),
        ),
      }
    }),
    actorOption,
  ].filter((option) => normalizeText(option.name || option.email || option.id))

  const seen = new Set()
  return options
    .filter((option) => {
      const key = normalizeText(option.userId || option.id || option.email || option.name).toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((left, right) => {
      if (left.isCurrentUser && !right.isCurrentUser) return -1
      if (!left.isCurrentUser && right.isCurrentUser) return 1
      return left.name.localeCompare(right.name)
    })
}

export function getSelectedAgentOption(form = {}, agentOptions = [], actor = {}) {
  const selectedKey = normalizeText(form.assignedAgentId || form.assignedAgentEmail || form.assignedAgent)
  const selectedKeyLower = selectedKey.toLowerCase()
  const selected =
    agentOptions.find((agent) => getAgentOptionKey(agent) === selectedKey) ||
    agentOptions.find((agent) => normalizeText(agent.email).toLowerCase() === selectedKeyLower) ||
    agentOptions.find((agent) => normalizeText(agent.name).toLowerCase() === selectedKeyLower)

  if (selected) return selected

  return {
    ...buildActorAgentOption(actor),
    name: normalizeText(form.assignedAgent) || normalizeText(actor.name || actor.fullName) || 'Current user',
    email: normalizeText(form.assignedAgentEmail || actor.email).toLowerCase(),
    avatarUrl: normalizeText(form.assignedAgentAvatarUrl) || getAgentProfileAvatarUrl(actor),
  }
}
