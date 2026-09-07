const ORGANISATION_MEMBERSHIP_SOURCES = new Set(['organisation_users', 'organization_members'])
const ACTIVE_MEMBERSHIP_STATUSES = new Set(['active', 'accepted'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function getMembershipSource(membership = null) {
  return normalizeText(membership?.source || membership?.source_table).toLowerCase()
}

function getMembershipWorkspaceId(membership = null) {
  return normalizeText(
    membership?.workspaceId ||
      membership?.workspace_id ||
      membership?.organisationId ||
      membership?.organisation_id ||
      membership?.organizationId ||
      membership?.organization_id ||
      membership?.workspace?.id ||
      membership?.raw?.workspace_id ||
      membership?.raw?.organisation_id ||
      membership?.raw?.organization_id,
  )
}

function isOrganisationMembership(membership = null) {
  return ORGANISATION_MEMBERSHIP_SOURCES.has(getMembershipSource(membership))
}

function isActiveMembership(membership = null) {
  return ACTIVE_MEMBERSHIP_STATUSES.has(
    normalizeText(membership?.membershipStatus || membership?.membership_status || membership?.status).toLowerCase(),
  )
}

function membershipMatchesWorkspace(membership = null, workspaceId = '') {
  const expectedWorkspaceId = normalizeText(workspaceId)
  return !expectedWorkspaceId || getMembershipWorkspaceId(membership) === expectedWorkspaceId
}

function appendCandidate(candidates, seen, membership, priority) {
  if (!membership || !isOrganisationMembership(membership) || !isActiveMembership(membership)) return
  const key = [getMembershipSource(membership), normalizeText(membership.id), getMembershipWorkspaceId(membership)].join(':')
  if (seen.has(key)) return
  seen.add(key)
  candidates.push({ membership, priority })
}

export function resolveActiveOrganisationMembership({
  currentMembership = null,
  currentMemberships = [],
  membershipContexts = null,
  currentWorkspace = null,
} = {}) {
  const workspaceId = normalizeText(currentWorkspace?.id)
  const candidates = []
  const seen = new Set()

  appendCandidate(candidates, seen, membershipContexts?.organisation, 0)
  appendCandidate(candidates, seen, currentMembership, 1)
  for (const membership of Array.isArray(currentMemberships) ? currentMemberships : []) {
    appendCandidate(candidates, seen, membership, 2)
  }

  const workspaceCandidates = candidates.filter(({ membership }) => membershipMatchesWorkspace(membership, workspaceId))
  const selectedPool = workspaceCandidates.length ? workspaceCandidates : workspaceId ? [] : candidates
  return selectedPool.sort((left, right) => left.priority - right.priority)[0]?.membership || null
}

export function resolveOrganisationMembershipRole(membership = null, fallback = 'viewer') {
  return normalizeText(
    membership?.workspaceRole ||
      membership?.workspace_role ||
      membership?.organisationRole ||
      membership?.organisation_role ||
      membership?.organizationRole ||
      membership?.organization_role ||
      membership?.role ||
      fallback,
  ).toLowerCase() || fallback
}

export function isOrganisationOwnerMembership(membership = null) {
  return resolveOrganisationMembershipRole(membership) === 'owner'
}

export function isPrimaryOrganisationOwnerMembership(membership = null) {
  return isOrganisationOwnerMembership(membership) && Boolean(
    membership?.isPrimaryOwner ?? membership?.is_primary_owner,
  )
}

export function getOrganisationOwnershipHealth(memberships = []) {
  const rows = Array.isArray(memberships) ? memberships : []
  const activeMembers = rows.filter(isActiveMembership)
  const activeOwners = activeMembers.filter(isOrganisationOwnerMembership)
  const allPrimaryMembers = rows.filter((membership) => Boolean(
    membership?.isPrimaryOwner ?? membership?.is_primary_owner,
  ))
  const activePrimaryMembers = activeMembers.filter((membership) => Boolean(
    membership?.isPrimaryOwner ?? membership?.is_primary_owner,
  ))
  const activePrimaryOwners = activePrimaryMembers.filter(isOrganisationOwnerMembership)
  const issues = []

  if (!activeOwners.length) issues.push('no_active_owner')
  if (!activePrimaryMembers.length) {
    issues.push(allPrimaryMembers.length ? 'primary_owner_is_not_active' : 'no_primary_owner')
  }
  if (activePrimaryMembers.length > 1) issues.push('multiple_primary_owners')
  if (activePrimaryMembers.some((membership) => !isOrganisationOwnerMembership(membership))) {
    issues.push('primary_owner_role_mismatch')
  }
  if (activePrimaryOwners.length !== 1 && !issues.includes('multiple_primary_owners')) {
    issues.push('invalid_primary_owner')
  }

  return {
    status: issues.length ? 'recovery_required' : 'healthy',
    issues,
    activeOwnerCount: activeOwners.length,
    activePrimaryOwnerCount: activePrimaryOwners.length,
    primaryOwner: activePrimaryOwners[0] || null,
  }
}

export function getOrganisationMembershipWorkspaceId(membership = null) {
  return getMembershipWorkspaceId(membership)
}
