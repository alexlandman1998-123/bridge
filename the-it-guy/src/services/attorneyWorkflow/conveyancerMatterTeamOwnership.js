import {
  MATTER_PLAN_ACTION_PRIORITIES,
  MATTER_PLAN_ACTION_STATES,
  MATTER_PLAN_CAPABILITIES,
  MATTER_PLAN_OWNER_ROLES as R,
  canMatterPlanActor,
  normalizeMatterPlanOwnerRole,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import { buildConveyancerMatterActionQueue } from './conveyancerMatterActionQueue.js'
import {
  MATTER_ACTION_COMMAND_TYPES,
  executeConveyancerMatterAction,
} from './conveyancerMatterActionExecution.js'

export const CONVEYANCER_MATTER_TEAM_OWNERSHIP_VERSION = 'conveyancer_matter_team_ownership_v1'

export const MATTER_TEAM_CAPACITY_STATUSES = Object.freeze({
  available: 'available',
  balanced: 'balanced',
  busy: 'busy',
  overloaded: 'overloaded',
  inactive: 'inactive',
})

const ACTIVE_MEMBER_STATUSES = new Set(['active', 'accepted'])
const TERMINAL_STATES = new Set([MATTER_PLAN_ACTION_STATES.completed, MATTER_PLAN_ACTION_STATES.cancelled])
const TRANSFER_ROLES = new Set([R.transferAttorney, R.conveyancer])
const PRIORITY_WEIGHT = Object.freeze({
  [MATTER_PLAN_ACTION_PRIORITIES.critical]: 3,
  [MATTER_PLAN_ACTION_PRIORITIES.urgent]: 2.5,
  [MATTER_PLAN_ACTION_PRIORITIES.high]: 2,
  [MATTER_PLAN_ACTION_PRIORITIES.normal]: 1,
  [MATTER_PLAN_ACTION_PRIORITIES.low]: 0.5,
})

const FIRM_ROLE_TO_PLAN_ROLES = Object.freeze({
  firm_admin: Object.freeze([R.firmManager]),
  director_partner: Object.freeze([R.firmManager]),
  transfer_attorney: Object.freeze([R.transferAttorney]),
  bond_attorney: Object.freeze([R.bondAttorney]),
  cancellation_attorney: Object.freeze([R.cancellationAttorney]),
  conveyancing_secretary: Object.freeze([R.secretary]),
  admin_staff: Object.freeze([R.secretary]),
  reception_scheduling: Object.freeze([R.secretary]),
  candidate_attorney: Object.freeze([R.secretary]),
  accounts: Object.freeze([R.accounts]),
})

function text(value = '') {
  return String(value || '').trim()
}

function lower(value = '') {
  return text(value).toLowerCase()
}

function number(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function rolesMatch(left, right) {
  return left === right || (TRANSFER_ROLES.has(left) && TRANSFER_ROLES.has(right))
}

function memberPlanRoles(member = {}) {
  const supplied = Array.isArray(member.planRoles || member.plan_roles)
    ? member.planRoles || member.plan_roles
    : [member.planRole || member.plan_role].filter(Boolean)
  const roles = supplied.length
    ? supplied.map((role) => normalizeMatterPlanOwnerRole(role)).filter(Boolean)
    : FIRM_ROLE_TO_PLAN_ROLES[lower(member.role || member.firmRole || member.firm_role)] || []
  return [...new Set(roles)]
}

function normalizeMember(member = {}, defaultCapacity = 10) {
  const userId = text(member.userId || member.user_id || member.id)
  const teamId = text(member.teamId || member.team_id || member.departmentId || member.department_id) || null
  const planRoles = memberPlanRoles(member)
  const status = lower(member.status || member.membershipStatus || member.membership_status) || 'active'
  const active = ACTIVE_MEMBER_STATUSES.has(status) && member.onLeave !== true && member.on_leave !== true
  return {
    userId,
    name: text(member.name || member.fullName || member.full_name || member.email) || userId || 'Unnamed member',
    teamId,
    firmRole: lower(member.role || member.firmRole || member.firm_role),
    planRoles,
    status,
    active,
    deliveryEligible: member.deliveryEligible !== false && member.delivery_eligible !== false,
    maxWorkload: Math.max(1, number(member.maxWorkload || member.max_workload || member.capacity, defaultCapacity)),
  }
}

function normalizeTeam(team = {}) {
  const id = text(team.id || team.teamId || team.team_id || team.departmentId || team.department_id)
  return {
    id,
    name: text(team.name || team.label) || id || 'Unnamed team',
    status: lower(team.status) || 'active',
    active: !['inactive', 'removed', 'suspended'].includes(lower(team.status)),
    maxWorkload: Math.max(0, number(team.maxWorkload || team.max_workload || team.capacity, 0)),
  }
}

function actionWeight(item) {
  let weight = PRIORITY_WEIGHT[item.priority] || 1
  if (item.overdue) weight += 1
  if (item.bucket === 'blocked' || item.bucket === 'review') weight += 0.5
  return weight
}

function capacityStatus(load, capacity, active = true) {
  if (!active) return MATTER_TEAM_CAPACITY_STATUSES.inactive
  const utilisation = capacity > 0 ? load / capacity : load > 0 ? 2 : 0
  if (utilisation < 0.5) return MATTER_TEAM_CAPACITY_STATUSES.available
  if (utilisation < 0.8) return MATTER_TEAM_CAPACITY_STATUSES.balanced
  if (utilisation <= 1) return MATTER_TEAM_CAPACITY_STATUSES.busy
  return MATTER_TEAM_CAPACITY_STATUSES.overloaded
}

function memberCanOwn(member, action) {
  if (!member.active || !member.deliveryEligible || !member.userId) return false
  return member.planRoles.some((role) => rolesMatch(role, action.owner?.role) && canMatterPlanActor(role, action.requiredCapability))
}

function buildMemberRows(members, queueItems, existingWorkloadByUser) {
  return members.map((member) => {
    const planItems = queueItems.filter((item) => item.owner?.userId === member.userId)
    const planWorkload = planItems.reduce((sum, item) => sum + actionWeight(item), 0)
    const existingWorkload = number(existingWorkloadByUser?.[member.userId], 0)
    const totalWorkload = planWorkload + existingWorkload
    return {
      ...member,
      planActionCount: planItems.length,
      planWorkload,
      existingWorkload,
      totalWorkload,
      utilisation: member.maxWorkload ? totalWorkload / member.maxWorkload : 0,
      capacityStatus: capacityStatus(totalWorkload, member.maxWorkload, member.active),
    }
  })
}

function buildTeamRows(teams, memberRows, queueItems, existingWorkloadByTeam) {
  return teams.map((team) => {
    const teamMembers = memberRows.filter((member) => member.teamId === team.id)
    const inferredCapacity = teamMembers.reduce((sum, member) => sum + member.maxWorkload, 0)
    const maxWorkload = team.maxWorkload || inferredCapacity
    const assignedItems = queueItems.filter((item) => item.owner?.teamId === team.id)
    const planWorkload = assignedItems.reduce((sum, item) => sum + actionWeight(item), 0)
    const existingWorkload = number(existingWorkloadByTeam?.[team.id], 0)
    const totalWorkload = Math.max(planWorkload, teamMembers.reduce((sum, member) => sum + member.planWorkload, 0)) + existingWorkload
    return {
      ...team,
      memberCount: teamMembers.length,
      activeMemberCount: teamMembers.filter((member) => member.active).length,
      maxWorkload,
      planActionCount: assignedItems.length,
      planWorkload,
      existingWorkload,
      totalWorkload,
      utilisation: maxWorkload ? totalWorkload / maxWorkload : 0,
      capacityStatus: capacityStatus(totalWorkload, maxWorkload, team.active),
    }
  })
}

function candidateRows(action, members, preferredTeamId = null) {
  return members.filter((member) => memberCanOwn(member, action)).sort((left, right) => {
    const leftSameTeam = preferredTeamId && left.teamId === preferredTeamId ? 0 : 1
    const rightSameTeam = preferredTeamId && right.teamId === preferredTeamId ? 0 : 1
    if (leftSameTeam !== rightSameTeam) return leftSameTeam - rightSameTeam
    const leftOverloaded = left.capacityStatus === MATTER_TEAM_CAPACITY_STATUSES.overloaded ? 1 : 0
    const rightOverloaded = right.capacityStatus === MATTER_TEAM_CAPACITY_STATUSES.overloaded ? 1 : 0
    if (leftOverloaded !== rightOverloaded) return leftOverloaded - rightOverloaded
    if (left.utilisation !== right.utilisation) return left.utilisation - right.utilisation
    return left.userId.localeCompare(right.userId)
  })
}

function ownershipStatus(action, membersById, teamsById) {
  const assignedUser = action.owner?.userId ? membersById.get(action.owner.userId) : null
  const assignedTeam = action.owner?.teamId ? teamsById.get(action.owner.teamId) : null
  if (action.owner?.userId && (!assignedUser || !assignedUser.active || !memberCanOwn(assignedUser, action))) return 'stale_user_assignment'
  if (action.owner?.teamId && (!assignedTeam || !assignedTeam.active)) return 'stale_team_assignment'
  if (assignedUser?.capacityStatus === MATTER_TEAM_CAPACITY_STATUSES.overloaded) return 'overloaded_owner'
  if (assignedUser) return 'user_owned'
  if (assignedTeam) return 'team_pool'
  return 'unassigned'
}

function recommendationFor(action, status, candidates) {
  if (!['unassigned', 'stale_user_assignment', 'stale_team_assignment', 'overloaded_owner'].includes(status)) return null
  const candidate = candidates.find((item) => item.capacityStatus !== MATTER_TEAM_CAPACITY_STATUSES.overloaded)
  if (!candidate) return {
    actionKey: action.actionKey,
    type: candidates.length ? 'capacity_required' : 'coverage_required',
    priority: action.priority,
    targetUserId: null,
    targetTeamId: null,
    reason: candidates.length
      ? 'Every active capable team member is over capacity.'
      : 'No active, capable team member can own this action.',
  }
  return {
    actionKey: action.actionKey,
    type: status === 'unassigned' ? 'assign' : 'handover',
    priority: action.priority,
    targetUserId: candidate.userId,
    targetTeamId: candidate.teamId,
    targetCapacityStatus: candidate.capacityStatus,
    reason: status === 'overloaded_owner'
      ? `Move work to ${candidate.name} to reduce overload.`
      : `Assign to the lowest-load capable member, ${candidate.name}.`,
    command: {
      type: MATTER_ACTION_COMMAND_TYPES.assign,
      actionKey: action.actionKey,
      expectedActionRevision: Number(action.sourceAction?.runtimeRevision || action.runtimeRevision || 0),
      assignment: { userId: candidate.userId, teamId: candidate.teamId },
    },
  }
}

function emptyResult(queue, blockers) {
  return {
    version: CONVEYANCER_MATTER_TEAM_OWNERSHIP_VERSION,
    valid: false,
    planId: queue.planId,
    planVersion: queue.planVersion,
    actions: [],
    members: [],
    teams: [],
    recommendations: [],
    coverageRisks: [],
    metrics: { activeActions: 0, unassigned: 0, stale: 0, overloaded: 0, recommendations: 0, coverageRisks: 0 },
    blockers,
  }
}

export function buildConveyancerMatterTeamOwnership({
  plan = {},
  members = [],
  teams = [],
  actor = {},
  asOf = '',
  existingWorkloadByUser = {},
  existingWorkloadByTeam = {},
  defaultMemberCapacity = 10,
} = {}) {
  const queue = buildConveyancerMatterActionQueue({ plan, actor, asOf, includeCompleted: true })
  if (!queue.valid) return emptyResult(queue, queue.blockers)
  const activeItems = queue.items.filter((item) => !TERMINAL_STATES.has(item.sourceState))
  const normalizedMembers = (Array.isArray(members) ? members : []).map((member) => normalizeMember(member, defaultMemberCapacity))
  const normalizedTeams = (Array.isArray(teams) ? teams : []).map(normalizeTeam).filter((team) => team.id)
  const memberRows = buildMemberRows(normalizedMembers, activeItems, existingWorkloadByUser)
  const teamRows = buildTeamRows(normalizedTeams, memberRows, activeItems, existingWorkloadByTeam)
  const membersById = new Map(memberRows.map((member) => [member.userId, member]))
  const teamsById = new Map(teamRows.map((team) => [team.id, team]))

  const actions = activeItems.map((item) => {
    const action = plan.actions.find((candidate) => candidate.key === item.actionKey) || {}
    const candidates = candidateRows(action, memberRows, item.owner?.teamId)
    const status = ownershipStatus(action, membersById, teamsById)
    return {
      actionKey: item.actionKey,
      label: item.label,
      priority: item.priority,
      bucket: item.bucket,
      ownerRole: item.owner?.role,
      assignedUserId: item.owner?.userId || null,
      assignedTeamId: item.owner?.teamId || null,
      ownershipStatus: status,
      candidateUserIds: candidates.map((member) => member.userId),
      coverageDepth: candidates.length,
      handoverRequired: ['stale_user_assignment', 'stale_team_assignment', 'overloaded_owner'].includes(status),
      runtimeRevision: Number(action.runtimeRevision || 0),
      weight: actionWeight(item),
      recommendation: recommendationFor({ ...item, runtimeRevision: action.runtimeRevision }, status, candidates),
    }
  })
  const recommendations = actions.map((item) => item.recommendation).filter(Boolean)
  const coverageRisks = actions.filter((item) => item.priority === MATTER_PLAN_ACTION_PRIORITIES.critical && item.coverageDepth < 2).map((item) => ({
    actionKey: item.actionKey,
    type: item.coverageDepth === 0 ? 'no_capable_owner' : 'single_point_of_failure',
    severity: 'critical',
    coverageDepth: item.coverageDepth,
    message: item.coverageDepth === 0
      ? `No active capable member can own “${item.label}”.`
      : `Only one active capable member can own critical action “${item.label}”.`,
  }))
  const stale = actions.filter((item) => item.ownershipStatus.startsWith('stale_')).length

  return {
    version: CONVEYANCER_MATTER_TEAM_OWNERSHIP_VERSION,
    valid: true,
    planId: queue.planId,
    planVersion: queue.planVersion,
    actions,
    members: memberRows,
    teams: teamRows,
    recommendations,
    coverageRisks,
    metrics: {
      activeActions: actions.length,
      unassigned: actions.filter((item) => item.ownershipStatus === 'unassigned').length,
      teamPools: actions.filter((item) => item.ownershipStatus === 'team_pool').length,
      stale,
      overloaded: actions.filter((item) => item.ownershipStatus === 'overloaded_owner').length,
      recommendations: recommendations.length,
      coverageRisks: coverageRisks.length,
      overloadedMembers: memberRows.filter((item) => item.capacityStatus === MATTER_TEAM_CAPACITY_STATUSES.overloaded).length,
      overloadedTeams: teamRows.filter((item) => item.capacityStatus === MATTER_TEAM_CAPACITY_STATUSES.overloaded).length,
    },
    blockers: [],
  }
}

export function assignConveyancerMatterActionOwnership({
  plan = {},
  actionKey = '',
  targetUserId = '',
  targetTeamId = '',
  members = [],
  teams = [],
  actor = {},
  reason = '',
  commandId = '',
  occurredAt = '',
  allowOverCapacity = false,
  existingEvents = [],
  existingWorkloadByUser = {},
  existingWorkloadByTeam = {},
} = {}) {
  if (!text(reason)) return { ok: false, code: 'ownership_change_reason_required', plan: null, event: null }
  if (!text(commandId)) return { ok: false, code: 'command_id_required', plan: null, event: null }
  const action = (plan.actions || []).find((item) => item.key === text(actionKey))
  if (!action) return { ok: false, code: 'action_not_found', plan: null, event: null }
  const report = buildConveyancerMatterTeamOwnership({
    plan,
    members,
    teams,
    actor,
    asOf: occurredAt,
    existingWorkloadByUser,
    existingWorkloadByTeam,
  })
  if (!report.valid) return { ok: false, code: report.blockers[0] || 'team_ownership_invalid', plan: null, event: null }
  const member = text(targetUserId) ? report.members.find((item) => item.userId === text(targetUserId)) : null
  const team = text(targetTeamId) ? report.teams.find((item) => item.id === text(targetTeamId)) : null
  if (targetUserId && !member) return { ok: false, code: 'target_member_not_found', plan: null, event: null }
  if (targetTeamId && !team) return { ok: false, code: 'target_team_not_found', plan: null, event: null }
  if (!member && !team) return { ok: false, code: 'ownership_target_required', plan: null, event: null }
  if (member && !memberCanOwn(member, action)) return { ok: false, code: 'target_member_not_eligible', plan: null, event: null }
  if (member && team && member.teamId !== team.id) return { ok: false, code: 'target_member_team_mismatch', plan: null, event: null }
  if (team && !team.active) return { ok: false, code: 'target_team_inactive', plan: null, event: null }
  if (!member && team && !report.members.some((candidate) => candidate.teamId === team.id && memberCanOwn(candidate, action))) {
    return { ok: false, code: 'target_team_has_no_eligible_members', plan: null, event: null }
  }
  if (!allowOverCapacity && member?.capacityStatus === MATTER_TEAM_CAPACITY_STATUSES.overloaded) {
    return { ok: false, code: 'target_member_over_capacity', plan: null, event: null }
  }

  const execution = executeConveyancerMatterAction({
    plan,
    command: {
      commandId,
      type: MATTER_ACTION_COMMAND_TYPES.assign,
      actionKey: action.key,
      expectedPlanId: plan.planId || plan.plan_id,
      expectedPlanVersion: Number(plan.version || 0),
      expectedActionRevision: Number(action.runtimeRevision || 0),
      reason,
      assignment: {
        userId: member?.userId || null,
        teamId: team?.id || member?.teamId || null,
      },
    },
    actor,
    occurredAt,
    existingEvents,
  })
  return {
    ...execution,
    ownership: execution.ok ? {
      type: action.owner?.userId || action.owner?.teamId ? 'handover' : member ? 'assignment' : 'team_pool_assignment',
      previousUserId: action.owner?.userId || null,
      previousTeamId: action.owner?.teamId || null,
      targetUserId: member?.userId || null,
      targetTeamId: team?.id || member?.teamId || null,
      reason: text(reason),
    } : null,
  }
}
