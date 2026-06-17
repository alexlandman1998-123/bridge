import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const migrationPaths = [
  '../supabase/migrations/202606090011_harden_branch_invites.sql',
  '../supabase/migrations/202606090012_branch_invite_acceptance_metadata.sql',
  '../supabase/migrations/202606090013_invite_commission_profile_reconciliation.sql',
  '../supabase/migrations/202606090014_invite_branch_members_sync.sql',
]
const migrationSql = migrationPaths.map((item) => fs.readFileSync(path.join(root, item), 'utf8')).join('\n')
const branchWorkspacePage = fs.readFileSync(path.join(root, 'src/pages/agency/AgencyBranchWorkspacePage.jsx'), 'utf8')
const emailRouter = fs.readFileSync(path.join(root, '../supabase/functions/send-email/index.ts'), 'utf8')
const emailTypes = fs.readFileSync(path.join(root, '../supabase/functions/send-email/types.ts'), 'utf8')
const inviteResolver = fs.readFileSync(path.join(root, 'src/pages/InviteResolver.jsx'), 'utf8')

function roleGroup(role = '') {
  const normalized = String(role || '').trim().toLowerCase()
  if (['owner', 'super_admin'].includes(normalized)) return 'owner'
  if (['principal', 'director', 'partner', 'admin', 'admin_staff'].includes(normalized)) return 'principal'
  if (['branch_manager', 'branch_admin'].includes(normalized)) return 'branch_manager'
  if (['team_lead', 'manager'].includes(normalized)) return 'team_lead'
  if (['agent', 'senior_agent', 'sales_agent'].includes(normalized)) return 'agent'
  if (['assistant', 'transaction_coordinator', 'listing_coordinator', 'admin_coordinator'].includes(normalized)) return 'assistant'
  return 'viewer'
}

function roleLevel(role = '') {
  return {
    owner: 500,
    principal: 400,
    branch_manager: 300,
    team_lead: 200,
    agent: 100,
    assistant: 50,
    viewer: 0,
  }[roleGroup(role)] || 0
}

function branchMemberRole(role = '') {
  const normalized = String(role || '').trim().toLowerCase()
  if (['owner', 'principal', 'director', 'partner'].includes(normalized)) return 'principal'
  if (['super_admin', 'admin', 'admin_staff'].includes(normalized)) return 'admin'
  if (['branch_manager', 'branch_admin', 'team_lead', 'manager'].includes(normalized)) return 'manager'
  if (['assistant', 'transaction_coordinator', 'listing_coordinator', 'admin_coordinator'].includes(normalized)) return 'assistant'
  return 'agent'
}

function createFixtureState() {
  return {
    now: '2026-06-09T10:00:00.000Z',
    invites: [],
    organisations: [{ id: 'org-1', type: 'agency', name: 'Bridge Realty' }],
    branches: [
      { id: 'branch-north', organisationId: 'org-1', isActive: true },
      { id: 'branch-south', organisationId: 'org-1', isActive: true },
    ],
    memberships: [
      { id: 'member-principal', organisationId: 'org-1', userId: 'user-principal', email: 'principal@example.test', role: 'principal', branchId: 'branch-north', primaryBranchId: 'branch-north', status: 'active' },
      { id: 'member-branch-manager', organisationId: 'org-1', userId: 'user-manager', email: 'manager@example.test', role: 'branch_manager', branchId: 'branch-north', primaryBranchId: 'branch-north', status: 'active' },
    ],
    profiles: [
      { id: 'user-principal', email: 'principal@example.test' },
      { id: 'user-manager', email: 'manager@example.test' },
    ],
    commissionProfiles: [],
    branchMembers: [],
    events: [],
  }
}

function activeMembershipFor(state, workspaceId, userId) {
  return state.memberships.find((item) => item.organisationId === workspaceId && item.userId === userId && item.status === 'active') || null
}

function branchBelongsToWorkspace(state, branchId, workspaceId) {
  return state.branches.some((item) => item.id === branchId && item.organisationId === workspaceId && item.isActive)
}

function createInvite(state, actorUserId, payload = {}) {
  const email = String(payload.email || payload.invited_email || '').trim().toLowerCase()
  const inviteType = payload.invite_type || 'workspace_invite'
  const workspaceId = payload.target_workspace_id || ''
  const branchId = payload.target_branch_id || null
  const workspaceRole = payload.target_workspace_role || 'agent'
  const actorMembership = activeMembershipFor(state, workspaceId, actorUserId)

  if (!email) return { success: false, code: 'missing_email' }
  if (branchId && !workspaceId) return { success: false, code: 'target_workspace_required' }
  if (!actorMembership || roleLevel(actorMembership.role) < 200) return { success: false, code: 'permission_denied' }
  if (branchId && !branchBelongsToWorkspace(state, branchId, workspaceId)) return { success: false, code: 'branch_workspace_mismatch' }

  if (roleGroup(actorMembership.role) === 'branch_manager') {
    if (!branchId) return { success: false, code: 'branch_scope_required' }
    if ((actorMembership.primaryBranchId || actorMembership.branchId) !== branchId) return { success: false, code: 'branch_scope_denied' }
  }
  if (roleLevel(actorMembership.role) <= roleLevel(workspaceRole)) return { success: false, code: 'role_not_permitted' }

  const duplicate = state.invites.find((item) =>
    item.status === 'pending' &&
    item.targetWorkspaceId === workspaceId &&
    item.targetBranchId === branchId &&
    item.inviteType === inviteType &&
    item.email === email)

  if (duplicate) return { success: false, code: 'duplicate_pending_invite', invite_id: duplicate.id }

  const invite = {
    id: `invite-${state.invites.length + 1}`,
    token: `token-${state.invites.length + 1}`,
    inviteType,
    status: 'pending',
    inviterUserId: actorUserId,
    targetWorkspaceId: workspaceId,
    targetWorkspaceRole: workspaceRole,
    targetBranchId: branchId,
    email,
    phone: payload.phone || '',
    metadata: payload.metadata || {},
    createdAt: state.now,
  }
  state.invites.push(invite)
  return { success: true, invite }
}

function reconcileCommissionProfile(state, invite, membership, user) {
  const emailProfile = state.commissionProfiles.find((item) =>
    item.organisationId === invite.targetWorkspaceId &&
    item.isActive &&
    String(item.emailAddress || '').toLowerCase() === invite.email)
  if (!emailProfile) return null

  const linkedProfile = state.commissionProfiles.find((item) =>
    item.id !== emailProfile.id &&
    item.organisationId === invite.targetWorkspaceId &&
    item.isActive &&
    (item.organisationUserId === membership.id || item.userId === user.id))

  if (linkedProfile && !emailProfile.organisationUserId && !emailProfile.userId) {
    emailProfile.isActive = false
    state.events.push({ type: 'commission_profile_email_duplicate_deactivated', inviteId: invite.id })
    return linkedProfile
  }

  if (!emailProfile.organisationUserId || !emailProfile.userId) {
    emailProfile.organisationUserId = emailProfile.organisationUserId || membership.id
    emailProfile.userId = emailProfile.userId || user.id
    state.events.push({ type: 'commission_profile_linked_from_invite', inviteId: invite.id })
  }
  return emailProfile
}

function syncBranchMember(state, invite, membership, user) {
  if (!invite.targetBranchId) return null
  let branchMember = state.branchMembers.find((item) => item.branchId === invite.targetBranchId && item.userId === user.id)
  if (!branchMember) {
    branchMember = { id: `branch-member-${state.branchMembers.length + 1}`, branchId: invite.targetBranchId, userId: user.id }
    state.branchMembers.push(branchMember)
  }
  branchMember.organisationUserId = branchMember.organisationUserId || membership.id
  branchMember.role = branchMemberRole(membership.role)
  branchMember.status = 'active'
  state.events.push({ type: 'branch_member_synced_from_invite', inviteId: invite.id })
  return branchMember
}

function acceptInvite(state, token, user) {
  const invite = state.invites.find((item) => item.token === token)
  if (!invite) return { success: false, code: 'invite_not_found' }
  if (invite.status !== 'pending') return { success: false, code: `invite_${invite.status}` }
  if (invite.email && String(user.email || '').toLowerCase() !== invite.email) return { success: false, code: 'invite_email_mismatch' }

  const existing = state.memberships.find((item) =>
    item.organisationId === invite.targetWorkspaceId &&
    (item.userId === user.id || String(item.email || '').toLowerCase() === invite.email))

  const existingBranchId = existing?.primaryBranchId || existing?.branchId || null
  if (existing && invite.targetBranchId && existingBranchId && existingBranchId !== invite.targetBranchId) {
    state.events.push({ type: 'invite_branch_mismatch', inviteId: invite.id })
    return { success: false, code: 'existing_membership_branch_mismatch' }
  }

  const firstName = invite.metadata.first_name || invite.metadata.firstName || ''
  const lastName = invite.metadata.last_name || invite.metadata.surname || invite.metadata.lastName || ''
  const membership = existing || {
    id: `member-${state.memberships.length + 1}`,
    organisationId: invite.targetWorkspaceId,
    createdBy: invite.inviterUserId,
  }
  if (!existing) state.memberships.push(membership)

  membership.userId = user.id
  membership.email = user.email.toLowerCase()
  membership.firstName = membership.firstName || firstName
  membership.lastName = membership.lastName || lastName
  membership.role = membership.role || invite.targetWorkspaceRole || 'agent'
  membership.branchId = membership.branchId || invite.targetBranchId
  membership.primaryBranchId = membership.primaryBranchId || membership.branchId || invite.targetBranchId
  membership.status = 'active'

  let profile = state.profiles.find((item) => item.id === user.id)
  if (!profile) {
    profile = { id: user.id, email: user.email }
    state.profiles.push(profile)
  }
  profile.firstName = profile.firstName || firstName
  profile.lastName = profile.lastName || lastName
  profile.fullName = profile.fullName || [firstName, lastName].filter(Boolean).join(' ')
  profile.phoneNumber = profile.phoneNumber || invite.metadata.mobile || invite.phone || ''
  profile.onboardingCompleted = true

  invite.status = 'accepted'
  invite.acceptedByUserId = user.id
  invite.inviteeUserId = user.id

  reconcileCommissionProfile(state, invite, membership, user)
  syncBranchMember(state, invite, membership, user)
  state.events.push({ type: 'invite_accepted', inviteId: invite.id })

  return { success: true, invite, membership, profile }
}

assert.match(migrationSql, /branch_scope_denied/, 'Phase 1 branch-manager branch scope guard must exist')
assert.match(migrationSql, /existing_membership_branch_mismatch/, 'Phase 2 branch mismatch guard must exist')
assert.match(migrationSql, /commission_profile_linked_from_invite/, 'Phase 3 commission linking event must exist')
assert.match(migrationSql, /branch_member_synced_from_invite/, 'Phase 4 branch member sync event must exist')
assert.match(branchWorkspacePage, /BRANCH_AGENT_ROLE_VALUES/, 'Phase 5 branch-safe role menu must exist')
assert.match(inviteResolver, /InviteDetailList/, 'Phase 5 invite detail UI must exist')
assert.match(emailRouter, /\["workspace_invite", "team_invite", "branch_invite", "agent_invite"\]\.includes\(type\)/, 'send-email must route branch invites through the workspace invite email handler')
assert.match(emailTypes, /type:\s*"workspace_invite"\s*\|\s*"team_invite"\s*\|\s*"branch_invite"\s*\|\s*"agent_invite"/, 'workspace invite email payload type must include branch_invite')

const state = createFixtureState()
state.commissionProfiles.push({
  id: 'commission-profile-email-only',
  organisationId: 'org-1',
  emailAddress: 'new.agent@example.test',
  commissionStructureId: 'standard-split',
  isActive: true,
})

const principalInvite = createInvite(state, 'user-principal', {
  invite_type: 'branch_invite',
  target_workspace_id: 'org-1',
  target_workspace_role: 'agent',
  target_branch_id: 'branch-north',
  email: 'new.agent@example.test',
  phone: '0820000000',
  metadata: {
    first_name: 'New',
    last_name: 'Agent',
    mobile: '0820000000',
    branch_name: 'North Branch',
    role: 'agent',
  },
})
assert.equal(principalInvite.success, true, 'principal should invite an agent to a branch')

assert.equal(
  createInvite(state, 'user-principal', {
    invite_type: 'branch_invite',
    target_workspace_id: 'org-1',
    target_workspace_role: 'agent',
    target_branch_id: 'branch-north',
    email: 'new.agent@example.test',
  }).code,
  'duplicate_pending_invite',
  'duplicate pending branch invite should be blocked',
)

assert.equal(
  createInvite(state, 'user-manager', {
    invite_type: 'branch_invite',
    target_workspace_id: 'org-1',
    target_workspace_role: 'assistant',
    target_branch_id: 'branch-north',
    email: 'assistant@example.test',
  }).success,
  true,
  'branch manager should invite support roles into their own branch',
)

assert.equal(
  createInvite(state, 'user-manager', {
    invite_type: 'branch_invite',
    target_workspace_id: 'org-1',
    target_workspace_role: 'agent',
    target_branch_id: 'branch-south',
    email: 'south.agent@example.test',
  }).code,
  'branch_scope_denied',
  'branch manager should not invite into another branch',
)

assert.equal(
  createInvite(state, 'user-manager', {
    invite_type: 'branch_invite',
    target_workspace_id: 'org-1',
    target_workspace_role: 'principal',
    target_branch_id: 'branch-north',
    email: 'principal-two@example.test',
  }).code,
  'role_not_permitted',
  'branch manager should not invite elevated roles',
)

assert.equal(
  createInvite(state, 'user-principal', {
    invite_type: 'branch_invite',
    target_workspace_id: 'org-1',
    target_workspace_role: 'agent',
    target_branch_id: 'branch-missing',
    email: 'wrong-branch@example.test',
  }).code,
  'branch_workspace_mismatch',
  'target branch must belong to target workspace',
)

assert.equal(
  acceptInvite(state, principalInvite.invite.token, { id: 'user-wrong', email: 'wrong@example.test' }).code,
  'invite_email_mismatch',
  'wrong email should not accept branch invite',
)

const accepted = acceptInvite(state, principalInvite.invite.token, { id: 'user-new-agent', email: 'new.agent@example.test' })
assert.equal(accepted.success, true, 'invited agent should accept branch invite')
assert.equal(accepted.membership.branchId, 'branch-north', 'accepted membership should be branch scoped')
assert.equal(accepted.membership.firstName, 'New', 'membership first name should be filled from invite metadata')
assert.equal(accepted.profile.phoneNumber, '0820000000', 'profile phone should be filled from invite metadata')
assert.equal(state.commissionProfiles[0].organisationUserId, accepted.membership.id, 'email-only commission profile should link to organisation membership')
assert.equal(state.commissionProfiles[0].userId, 'user-new-agent', 'email-only commission profile should link to accepted user')
assert.equal(state.branchMembers.some((item) => item.branchId === 'branch-north' && item.userId === 'user-new-agent' && item.role === 'agent'), true, 'accepted branch invite should sync branch_members')

state.memberships.push({
  id: 'member-existing-south',
  organisationId: 'org-1',
  userId: 'user-existing-south',
  email: 'existing.south@example.test',
  role: 'agent',
  branchId: 'branch-south',
  primaryBranchId: 'branch-south',
  status: 'active',
})
const mismatchInvite = createInvite(state, 'user-principal', {
  invite_type: 'branch_invite',
  target_workspace_id: 'org-1',
  target_workspace_role: 'agent',
  target_branch_id: 'branch-north',
  email: 'existing.south@example.test',
})
assert.equal(mismatchInvite.success, true)
assert.equal(
  acceptInvite(state, mismatchInvite.invite.token, { id: 'user-existing-south', email: 'existing.south@example.test' }).code,
  'existing_membership_branch_mismatch',
  'existing member in another branch should need explicit transfer',
)
assert.equal(mismatchInvite.invite.status, 'pending', 'branch mismatch should leave invite pending')

assert.equal(state.events.some((item) => item.type === 'commission_profile_linked_from_invite'), true)
assert.equal(state.events.some((item) => item.type === 'branch_member_synced_from_invite'), true)
assert.equal(state.events.some((item) => item.type === 'invite_branch_mismatch'), true)

console.log('branch invite flow tests passed')
