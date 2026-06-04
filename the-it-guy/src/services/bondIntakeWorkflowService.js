import { BOND_INTAKE_STATUSES, getBondIntakeSummary } from '../core/transactions/bondIntakeSelectors'
import {
  PARTNER_ROUTING_MODES,
  PARTNER_ROUTING_SOURCE_TYPES,
  PARTNER_ROUTING_TARGET_TYPES,
} from '../constants/bondRoutingContract'
import { ENTITLEMENT_KEYS } from '../constants/workspaceEntitlements'
import { WORKSPACE_TYPES } from '../constants/workspaceTypes'
import { supabase } from '../lib/supabaseClient'
import { listOrganisationPartnerRoutingRules } from '../lib/settingsApi'
import {
  BOND_NOTIFICATION_EVENTS,
  notifyBondIntakeEvent,
} from './bondIntakeNotificationService'
import { assertWorkspaceEntitlementLimit } from './workspaceEntitlementsService'

export const BOND_INTAKE_DECLINE_REASONS = Object.freeze([
  'Buyer not finance-ready',
  'Documents incomplete',
  'Outside mandate',
  'Duplicate application',
  'Incorrect originator',
  'Other',
])

const MANAGER_ROLE_KEYS = new Set([
  'owner',
  'principal',
  'director',
  'manager',
  'hq_manager',
  'regional_manager',
  'branch_manager',
  'team_lead',
  'admin',
  'admin_staff',
])

const MUTATING_ROLE_KEYS = new Set([
  ...MANAGER_ROLE_KEYS,
  'bond_originator',
  'consultant',
  'bond_consultant',
  'bond_independent_consultant',
  'independent_consultant',
  'processor',
  'bond_processor',
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeRoleKey(value) {
  return normalizeLower(value).replace(/[\s-]+/g, '_')
}

function normalizeEmail(value) {
  return normalizeLower(value)
}

function isMissingColumnError(error, column = '') {
  const message = normalizeLower(error?.message || error?.details || error?.hint)
  const code = normalizeText(error?.code)
  if (!message) return false
  if (code === '42703') return !column || message.includes(normalizeLower(column))
  return Boolean(column && message.includes(normalizeLower(column)) && message.includes('column'))
}

function isMissingTableError(error, table = '') {
  const message = normalizeLower(error?.message || error?.details || error?.hint)
  const code = normalizeText(error?.code)
  if (code === '42P01') return true
  return Boolean(table && message.includes(normalizeLower(table)) && (message.includes('does not exist') || message.includes('not found')))
}

function isPermissionDeniedError(error) {
  const message = normalizeLower(error?.message || error?.details || error?.hint)
  const code = normalizeText(error?.code)
  return code === '42501' || message.includes('permission denied') || message.includes('row-level security')
}

function getClient(options = {}) {
  const client = options.client || supabase
  if (!client) {
    throw new Error('Supabase is not configured.')
  }
  return client
}

function compactObject(payload = {}) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

function resolveCurrentUser(user = {}) {
  const profile = user.profile || user.authState?.profile || user
  const currentWorkspace = user.currentWorkspace || user.workspace || user.authState?.currentWorkspace || null
  const currentMembership = user.currentMembership || user.authState?.currentMembership || null
  const workspaceRole =
    user.workspaceRole ||
    user.organisationRole ||
    user.membershipRole ||
    currentMembership?.workspaceRole ||
    currentMembership?.workspace_role ||
    profile?.workspaceRole ||
    profile?.workspace_role ||
    profile?.organisationRole ||
    profile?.organisation_role ||
    user.role ||
    profile?.role ||
    ''

  return {
    id: normalizeText(user.userId || user.id || profile?.id),
    email: normalizeEmail(user.email || profile?.email),
    name:
      normalizeText(user.name || user.fullName || user.full_name || profile?.fullName || profile?.full_name) ||
      normalizeText([profile?.first_name, profile?.last_name].filter(Boolean).join(' ')) ||
      normalizeEmail(user.email || profile?.email) ||
      'Bond consultant',
    workspaceId:
      normalizeText(user.workspaceId || currentWorkspace?.id || currentMembership?.organisationId || currentMembership?.organisation_id) ||
      null,
    workspaceName:
      normalizeText(user.workspaceName || currentWorkspace?.name || currentMembership?.workspace?.name) ||
      'Bond originator',
    workspaceKind: normalizeText(
      user.workspaceKind ||
        user.workspace_kind ||
        currentWorkspace?.workspaceKind ||
        currentWorkspace?.workspace_kind ||
        currentWorkspace?.raw?.workspace_kind,
    ),
    roleKey: normalizeRoleKey(workspaceRole),
    appRole: normalizeRoleKey(user.role || profile?.role),
    scopeLevel: normalizeRoleKey(currentMembership?.scopeLevel || currentMembership?.scope_level || user.scopeLevel || user.scope_level),
    regionId: normalizeText(currentMembership?.regionId || currentMembership?.region_id || user.regionId || user.region_id) || null,
    workspaceUnitId: normalizeText(currentMembership?.workspaceUnitId || currentMembership?.workspace_unit_id || user.workspaceUnitId || user.workspace_unit_id) || null,
    branchId:
      normalizeText(currentMembership?.branchId || currentMembership?.branch_id || currentMembership?.primaryBranchId || currentMembership?.primary_branch_id || user.branchId || user.branch_id) ||
      null,
    teamId: normalizeText(currentMembership?.teamId || currentMembership?.team_id || user.teamId || user.team_id) || null,
  }
}

function hasExplicitAssigneeInput(assignee = {}) {
  return Boolean(
    normalizeText(
      assignee.id ||
        assignee.userId ||
        assignee.user_id ||
        assignee.email ||
        assignee.name ||
        assignee.label ||
        assignee.organisationId ||
        assignee.organisation_id ||
        assignee.regionId ||
        assignee.region_id ||
        assignee.branchId ||
        assignee.branch_id ||
        assignee.teamId ||
        assignee.team_id ||
        assignee.workspaceUnitId ||
        assignee.workspace_unit_id ||
        assignee.organisationUnitId ||
        assignee.organisation_unit_id,
    ),
  )
}

function getBondIntakeRoutingContext(row = {}, actor = {}) {
  const transaction = row?.transaction || row || {}
  const onboardingFormData = transaction?.bondOnboardingFormData || row?.onboardingFormData || row?.onboarding_form_data || null
  const onboardingValues = onboardingFormData || {}
  return {
    organisationId:
      normalizeText(
        transaction.bond_workspace_id ||
          transaction.organisation_id ||
          transaction.organisationId ||
          transaction?.organisation?.id ||
          actor.workspaceId,
      ) || null,
    developmentId:
      normalizeText(
        transaction.development_id ||
          transaction.developmentId ||
          row.development?.id ||
          row.unit?.development_id ||
          transaction.unit_id ||
          row.unit?.developmentId,
      ) || null,
    agentId:
      normalizeText(
        transaction.assigned_agent_id ||
          transaction.assignedAgentId ||
          transaction.agent_id ||
          transaction.agentId ||
          transaction.created_by ||
          transaction.createdBy ||
          onboardingValues.assigned_agent_id ||
          onboardingValues.assignedAgentId ||
          onboardingValues.agent_id ||
          onboardingValues.agentId ||
          row.agent?.id ||
          row.assignedAgentId,
      ) || null,
    agentEmail:
      normalizeEmail(
        transaction.assigned_agent_email ||
          transaction.assignedAgentEmail ||
          onboardingValues.assigned_agent_email ||
          onboardingValues.assignedAgentEmail ||
          onboardingValues.assigned_agent ||
          onboardingValues.assignedAgent ||
          row.agent?.email,
      ) || null,
    branchId:
      normalizeText(
        transaction.assigned_branch_id ||
          transaction.assignedBranchId ||
          transaction.branch_id ||
          transaction.branchId ||
          transaction.assigned_workspace_unit_id ||
          transaction.assignedWorkspaceUnitId ||
          transaction.workspace_unit_id ||
          transaction.workspaceUnitId ||
          transaction.primary_branch_id ||
          transaction.primaryBranchId ||
          row.branch?.id,
      ) || null,
    teamId:
      normalizeText(
        transaction.assigned_team_id ||
          transaction.assignedTeamId ||
          transaction.team_id ||
          transaction.teamId ||
          transaction.workspace_unit_id ||
          transaction.workspaceUnitId,
      ) || null,
    regionId:
      normalizeText(
        transaction.bond_region_id ||
          transaction.region_id ||
          transaction.regionId ||
          onboardingValues.region_id ||
          onboardingValues.regionId ||
          row.region?.id,
      ) || null,
  }
}

function resolveRoutingScopeFromRule(rule = {}, actor = {}, context = {}) {
  const targetScopeType = normalizeText(rule.targetScopeType || rule.target_scope_type)
  const targetScopeId = normalizeText(rule.targetScopeId || rule.target_scope_id)
  const targetUserId = normalizeText(
    rule.targetConsultantUserId ||
      rule.target_user_id ||
      rule.targetUserId ||
      rule.assignedUserId ||
      rule.assigned_user_id,
  )

  const assignee = {
    id: targetScopeType === PARTNER_ROUTING_TARGET_TYPES.consultant ? (targetUserId || targetScopeId) : null,
    name: normalizeText(rule.targetScopeName || rule.targetName || ''),
    email: null,
    organisationId: normalizeText(context.organisationId || actor.workspaceId) || null,
    regionId: targetScopeType === PARTNER_ROUTING_TARGET_TYPES.region ? targetScopeId || null : null,
    branchId: targetScopeType === PARTNER_ROUTING_TARGET_TYPES.branch ? targetScopeId || null : null,
    workspaceUnitId: targetScopeType === PARTNER_ROUTING_TARGET_TYPES.branch || targetScopeType === PARTNER_ROUTING_TARGET_TYPES.team ? targetScopeId || null : null,
    teamId: targetScopeType === PARTNER_ROUTING_TARGET_TYPES.team ? targetScopeId || null : null,
  }

  if (![
    PARTNER_ROUTING_TARGET_TYPES.organisation_queue,
    PARTNER_ROUTING_TARGET_TYPES.region,
    PARTNER_ROUTING_TARGET_TYPES.branch,
    PARTNER_ROUTING_TARGET_TYPES.team,
    PARTNER_ROUTING_TARGET_TYPES.consultant,
  ].includes(targetScopeType)) {
    return null
  }

  if (
    targetScopeType !== PARTNER_ROUTING_TARGET_TYPES.organisation_queue &&
    targetScopeType !== PARTNER_ROUTING_TARGET_TYPES.consultant &&
    !targetScopeId
  ) {
    return null
  }

  if (targetScopeType === PARTNER_ROUTING_TARGET_TYPES.consultant && !assignee.id) {
    return null
  }

  return {
    assignee,
    method: normalizeText(
      rule.assignmentMode || rule.assignmentMethod || rule.assignment_method || rule.method || PARTNER_ROUTING_MODES.manual,
    ),
    ruleId: normalizeText(rule.id),
  }
}

function resolveRoutingSourceMatch(rule = {}, context = {}) {
  const sourceScopeType = normalizeText(rule.sourceScopeType || rule.source_scope_type)
  const sourceScopeId = normalizeText(rule.sourceScopeId || rule.source_scope_id || rule.source_context_id)
  const sourceUserId = normalizeText(rule.sourceUserId || rule.source_user_id || sourceScopeId)

  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.organisation) {
    return true
  }
  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.branch) {
    return Boolean(sourceScopeId && sourceScopeId === context.branchId)
  }
  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.team) {
    return Boolean(sourceScopeId && sourceScopeId === context.teamId)
  }
  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.development) {
    return Boolean(sourceScopeId && sourceScopeId === context.developmentId)
  }
  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.agent) {
    return Boolean(
      sourceUserId &&
        (sourceUserId === context.agentId ||
          (context.agentEmail && normalizeEmail(sourceUserId) === context.agentEmail)),
    )
  }
  return false
}

async function resolveRoutingDecision({ row = {}, actor = {} } = {}) {
  const context = getBondIntakeRoutingContext(row, actor)
  const rules = await listOrganisationPartnerRoutingRules()
  if (!Array.isArray(rules) || !rules.length) return null

  const activeRules = rules.filter((rule) => rule?.isActive)
  if (!activeRules.length) return null

  const matchingRule = activeRules.find((rule) => resolveRoutingSourceMatch(rule, context))
  const chosenRule = matchingRule || activeRules.find((rule) => rule?.isDefault)
  if (!chosenRule) return null

  const mapped = resolveRoutingScopeFromRule(chosenRule, actor, context)
  if (!mapped) return null

  return {
    source: 'rule',
    method: mapped.method || PARTNER_ROUTING_MODES.manual,
    ruleId: mapped.ruleId || null,
    assignee: mapped.assignee,
    scope: resolveAssignmentScope({ actor, assignee: mapped.assignee }),
  }
}

async function resolveBondIntakeAssignmentDecision({ row = {}, actor = {}, assignee = {} } = {}) {
  const resolvedAssignee = resolveAssignee({ user: actor, assignee })
  if (hasExplicitAssigneeInput(assignee)) {
    return {
      source: 'manual',
      method: PARTNER_ROUTING_MODES.manual,
      ruleId: null,
      assignee: resolvedAssignee,
      scope: resolveAssignmentScope({ actor, assignee: resolvedAssignee }),
    }
  }

  try {
    const routed = await resolveRoutingDecision({ row, actor })
    if (routed?.assignee) {
      const mergedAssignee = {
        ...resolvedAssignee,
        ...routed.assignee,
      }
      return {
        ...routed,
        assignee: mergedAssignee,
        scope: resolveAssignmentScope({ actor, assignee: mergedAssignee }),
      }
    }
  } catch {
    // Keep legacy behaviour when routing configuration is unavailable.
  }

  return {
    source: 'manual',
    method: PARTNER_ROUTING_MODES.manual,
    ruleId: null,
    assignee: resolvedAssignee,
    scope: resolveAssignmentScope({ actor, assignee: resolvedAssignee }),
  }
}

function canMutateBondIntake(user = {}) {
  const actor = resolveCurrentUser(user)
  return Boolean(actor.id && (MUTATING_ROLE_KEYS.has(actor.roleKey) || actor.appRole === 'bond_originator'))
}

export function canAssignBondIntake(user = {}) {
  const actor = resolveCurrentUser(user)
  return Boolean(actor.id && MANAGER_ROLE_KEYS.has(actor.roleKey))
}

export function canDeclineBondIntake(user = {}) {
  return canMutateBondIntake(user)
}

export function canAcceptBondIntake(user = {}, row = {}) {
  if (!canMutateBondIntake(user)) return false
  const summary = getBondIntakeSummary(getBondIntakeInput(row, user))
  return summary.intakeStatus === BOND_INTAKE_STATUSES.READY_FOR_REVIEW
}

export async function fetchBondConsultantOptions({ user = {}, client = null } = {}) {
  const actor = resolveCurrentUser(user)
  const currentOption = {
    id: actor.id,
    name: actor.name,
    email: actor.email,
    label: `${actor.name}${actor.email ? ` · ${actor.email}` : ''}`,
  }
  if (!actor.workspaceId) return currentOption.id || currentOption.email ? [currentOption] : []

  try {
    const db = getClient({ client })
    let query = await db
      .from('organisation_users')
      .select('id, organisation_id, user_id, first_name, last_name, email, role, workspace_role, organisation_role, status, scope_level, region_id, workspace_unit_id, branch_id, primary_branch_id, team_id')
      .eq('organisation_id', actor.workspaceId)
      .in('status', ['active', 'approved'])

    if (
      query.error &&
      (isMissingColumnError(query.error, 'workspace_role') ||
        isMissingColumnError(query.error, 'organisation_role') ||
        isMissingColumnError(query.error, 'scope_level') ||
        isMissingColumnError(query.error, 'region_id') ||
        isMissingColumnError(query.error, 'workspace_unit_id') ||
        isMissingColumnError(query.error, 'branch_id') ||
        isMissingColumnError(query.error, 'primary_branch_id') ||
        isMissingColumnError(query.error, 'team_id') ||
        isMissingColumnError(query.error, 'status'))
    ) {
      query = await db
        .from('organisation_users')
        .select('id, organisation_id, user_id, first_name, last_name, email, role')
        .eq('organisation_id', actor.workspaceId)
    }

    if (query.error) {
      if (isMissingTableError(query.error, 'organisation_users') || isPermissionDeniedError(query.error)) {
        return currentOption.id || currentOption.email ? [currentOption] : []
      }
      throw query.error
    }

    const allowedRoles = new Set(['consultant', 'bond_consultant', 'bond_independent_consultant', 'processor', 'bond_processor', 'branch_manager', 'bond_branch_manager', 'team_lead', 'bond_team_lead', 'manager', 'bond_originator'])
    const options = (query.data || [])
      .filter((row) => {
        const roleKey = normalizeRoleKey(row.workspace_role || row.organisation_role || row.role)
        if (roleKey && !allowedRoles.has(roleKey)) return false

        if (actor.scopeLevel === 'region') {
          return !actor.regionId || normalizeText(row.region_id) === actor.regionId
        }
        if (['branch', 'team'].includes(actor.scopeLevel)) {
          const rowUnitId = normalizeText(row.team_id || row.workspace_unit_id || row.branch_id || row.primary_branch_id)
          const actorUnitId = normalizeText(actor.teamId || actor.workspaceUnitId || actor.branchId)
          return !actorUnitId || rowUnitId === actorUnitId
        }
        if (['assigned', 'user', 'independent'].includes(actor.scopeLevel)) {
          const rowUserId = normalizeText(row.user_id || row.id)
          return Boolean(actor.id && rowUserId === actor.id)
        }
        return true
      })
      .map((row) => {
        const name = normalizeText([row.first_name, row.last_name].filter(Boolean).join(' ')) || normalizeEmail(row.email) || 'Team member'
        return {
          id: normalizeText(row.user_id || row.id),
          name,
          email: normalizeEmail(row.email),
          label: `${name}${row.email ? ` · ${normalizeEmail(row.email)}` : ''}`,
        }
      })
      .filter((option) => option.id || option.email)

    const byKey = new Map()
    for (const option of [currentOption, ...options]) {
      const key = option.id || option.email
      if (key && !byKey.has(key)) byKey.set(key, option)
    }
    return [...byKey.values()]
  } catch {
    return currentOption.id || currentOption.email ? [currentOption] : []
  }
}

function getRolePlayers(row = {}) {
  if (Array.isArray(row.rolePlayers)) return row.rolePlayers
  if (Array.isArray(row.transactionRolePlayers)) return row.transactionRolePlayers
  if (Array.isArray(row.transaction_role_players)) return row.transaction_role_players
  if (Array.isArray(row?.transaction?.rolePlayers)) return row.transaction.rolePlayers
  if (Array.isArray(row?.transaction?.transactionRolePlayers)) return row.transaction.transactionRolePlayers
  if (Array.isArray(row?.transaction?.transaction_role_players)) return row.transaction.transaction_role_players
  return []
}

function getBondIntakeInput(row = {}, user = {}) {
  const actor = resolveCurrentUser(user)
  return {
    transaction: row?.transaction || row || {},
    onboardingFormData:
      row?.onboardingFormData ||
      row?.onboarding_form_data ||
      row?.onboarding?.formData ||
      row?.onboarding?.form_data ||
      null,
    documentRequests: row?.documentRequests || row?.document_requests || [],
    documents: row?.documents || [],
    rolePlayers: getRolePlayers(row),
    currentOrganisationId: actor.workspaceId || row?.transaction?.bond_workspace_id || row?.transaction?.organisation_id || null,
  }
}

function resolveAssignee({ user = {}, assignee = {} } = {}) {
  const actor = resolveCurrentUser(user)
  const currentMembership = user.currentMembership || user.authState?.currentMembership || {}
  return {
    id: normalizeText(assignee.id || assignee.userId) || actor.id || null,
    name: normalizeText(assignee.name || assignee.fullName || assignee.label) || actor.name,
    email: normalizeEmail(assignee.email) || actor.email || null,
    organisationId: normalizeText(assignee.organisationId || assignee.organisation_id || actor.workspaceId) || null,
    regionId: normalizeText(assignee.regionId || assignee.region_id || currentMembership.regionId || currentMembership.region_id) || null,
    branchId: normalizeText(assignee.branchId || assignee.branch_id || currentMembership.branchId || currentMembership.branch_id || currentMembership.primaryBranchId || currentMembership.primary_branch_id) || null,
    teamId: normalizeText(assignee.teamId || assignee.team_id || currentMembership.teamId || currentMembership.team_id) || null,
    workspaceUnitId: normalizeText(assignee.workspaceUnitId || assignee.workspace_unit_id || currentMembership.workspaceUnitId || currentMembership.workspace_unit_id) || null,
  }
}

function resolveAssignmentScope({ actor = {}, assignee = {} } = {}) {
  const organisationId = assignee.organisationId || actor.workspaceId || null
  const regionId = assignee.regionId || null
  const workspaceUnitId = assignee.teamId || assignee.workspaceUnitId || assignee.branchId || null
  const branchId = assignee.branchId || assignee.workspaceUnitId || null
  const teamId = assignee.teamId || null
  const hasAssigneeId = Object.prototype.hasOwnProperty.call(assignee, 'id')
  const resolvedAssigneeId = hasAssigneeId ? normalizeText(assignee.id) : null
  const userId = resolvedAssigneeId || (hasAssigneeId ? null : actor.id || null)
  const scopeLevel =
    userId && !regionId && !workspaceUnitId && !branchId && !teamId
      ? 'independent'
      : userId
        ? 'user'
        : teamId
          ? 'team'
          : branchId || workspaceUnitId
            ? 'branch'
            : regionId
              ? 'region'
              : organisationId
                ? 'organisation'
                : null

  return {
    organisationId,
    regionId,
    workspaceUnitId,
    branchId,
    teamId,
    userId,
    scopeLevel,
  }
}

async function updateByIdWithMissingColumnFallback(client, table, id, payload = {}, select = 'id') {
  let remainingPayload = compactObject(payload)
  while (Object.keys(remainingPayload).length) {
    const result = await client.from(table).update(remainingPayload).eq('id', id).select(select).maybeSingle()
    if (!result.error) return result.data || null

    const missingColumn = Object.keys(remainingPayload).find((key) => isMissingColumnError(result.error, key))
    if (!missingColumn) throw result.error
    remainingPayload = { ...remainingPayload }
    delete remainingPayload[missingColumn]
  }
  return null
}

async function upsertRolePlayerMarker(client, {
  transactionId,
  actor,
  assignee,
  action,
  reason = '',
  note = '',
  source = 'new_applications_queue',
}) {
  const now = new Date().toISOString()
  const intakeStatus = action === 'decline' ? 'DECLINED' : 'ACCEPTED'
  const snapshot = {
    accepted_at: action === 'decline' ? null : now,
    accepted_by: action === 'decline' ? null : actor.id,
    accepted_by_name: action === 'decline' ? null : actor.name,
    accepted_by_email: action === 'decline' ? null : actor.email,
    accepted_organisation_id: actor.workspaceId,
    accepted_organisation_name: actor.workspaceName,
    assigned_user_id: action === 'decline' ? null : assignee.id,
    assigned_user_name: action === 'decline' ? null : assignee.name,
    assigned_user_email: action === 'decline' ? null : assignee.email,
    declined_at: action === 'decline' ? now : null,
    declined_by: action === 'decline' ? actor.id : null,
    declined_by_name: action === 'decline' ? actor.name : null,
    declined_reason: action === 'decline' ? reason : null,
    declined_note: action === 'decline' ? note : null,
    intake_status: intakeStatus,
    source,
  }
  const payload = compactObject({
    transaction_id: transactionId,
    role_type: 'bond_originator',
    selection_source: 'manual',
    partner_name: actor.workspaceName || assignee.name || 'Bond originator',
    contact_person: assignee.name || actor.name,
    email_address: assignee.email || actor.email,
    notes: note || reason || null,
    snapshot_json: snapshot,
    updated_at: now,
    created_at: now,
  })

  let result = await client
    .from('transaction_role_players')
    .upsert(payload, { onConflict: 'transaction_id,role_type' })
    .select('id')
    .limit(1)
  if (!result.error) return result.data || null

  const fallbackShouldUpdate =
    normalizeLower(result.error?.message).includes('conflict') ||
    normalizeLower(result.error?.message).includes('constraint')

  if (fallbackShouldUpdate) {
    const lookup = await client
      .from('transaction_role_players')
      .select('id')
      .eq('transaction_id', transactionId)
      .eq('role_type', 'bond_originator')
      .limit(1)
    if (!lookup.error && lookup.data?.[0]?.id) {
      return updateByIdWithMissingColumnFallback(client, 'transaction_role_players', lookup.data[0].id, payload, 'id')
    }
    if (!lookup.error) {
      const insertResult = await client.from('transaction_role_players').insert(payload).select('id').limit(1)
      if (!insertResult.error) return insertResult.data || null
      result = insertResult
    }
  }

  if (
    result.error &&
    (isMissingColumnError(result.error, 'selection_source') ||
      isMissingColumnError(result.error, 'partner_name') ||
      isMissingColumnError(result.error, 'contact_person') ||
      isMissingColumnError(result.error, 'email_address') ||
      isMissingColumnError(result.error, 'snapshot_json') ||
      isMissingColumnError(result.error, 'notes'))
  ) {
    const fallbackPayload = {
      transaction_id: transactionId,
      role_type: 'bond_originator',
      updated_at: now,
      created_at: now,
    }
    result = await client.from('transaction_role_players').insert(fallbackPayload).select('id').limit(1)
    if (!result.error) return result.data || null
  }

  if (isMissingTableError(result.error, 'transaction_role_players') || isPermissionDeniedError(result.error)) {
    return null
  }

  throw result.error
}

async function persistAcceptedAssignment(client, {
  transactionId,
  actor,
  assignee,
  action,
  assignmentDecision = {},
}) {
  const now = new Date().toISOString()
  const source = action === 'assign' ? 'assigned_from_intake' : 'accepted_from_intake'
  const scope = resolveAssignmentScope({ actor, assignee })
  const decision = assignmentDecision || {}
  return updateByIdWithMissingColumnFallback(
    client,
    'transactions',
    transactionId,
    {
      assigned_bond_originator_email:
        decision.source === 'rule' && assignee.id && !assignee.email
          ? null
          : assignee.email || (decision.source === 'manual' ? actor.email : null) || null,
      bond_originator:
        decision.source === 'rule'
          ? assignee.name || null
          : assignee.name || actor.name || null,
      bond_workspace_id: scope.organisationId,
      bond_region_id: scope.regionId,
      bond_workspace_unit_id: scope.workspaceUnitId,
      primary_bond_consultant_user_id: scope.userId,
      bond_assignment_rule_id: decision.ruleId || null,
      bond_assignment_method: decision.source === 'rule' ? decision.method : null,
      finance_managed_by: 'bond_originator',
      bond_assignment_status: 'consultant_assigned',
      bond_assignment_source: source,
      finance_status: 'Accepted by bond originator',
      last_meaningful_activity_at: now,
      updated_at: now,
    },
    'id, assigned_bond_originator_email, bond_originator, primary_bond_consultant_user_id, bond_assignment_status, bond_assignment_source, bond_assignment_rule_id, bond_assignment_method, finance_status, updated_at',
  )
}

async function persistBondApplicationAssignment(client, {
  transactionId,
  actor,
  assignee,
  action,
  assignmentDecision = {},
}) {
  const now = new Date().toISOString()
  const source = action === 'assign' ? 'assigned_from_intake' : 'accepted_from_intake'
  const decision = assignmentDecision || {}
  const scope = decision.scope || resolveAssignmentScope({ actor, assignee })
  const lookup = await client
    .from('transaction_bond_applications')
    .select('id, assigned_organisation_id')
    .eq('transaction_id', transactionId)
    .limit(10)

  if (lookup.error) {
    if (isMissingTableError(lookup.error, 'transaction_bond_applications') || isPermissionDeniedError(lookup.error)) return []
    throw lookup.error
  }

  const updates = []
  for (const row of lookup.data || []) {
    if (scope.organisationId && normalizeText(row.assigned_organisation_id) !== normalizeText(scope.organisationId)) {
      await assertWorkspaceEntitlementLimit({
        workspaceId: scope.organisationId,
        workspaceType: WORKSPACE_TYPES.bondOriginator,
        workspaceKind: actor.workspaceKind || assignee.workspaceKind || assignee.workspace_kind,
        entitlementKey: ENTITLEMENT_KEYS.monthlyBondApplications,
      })
    }
    updates.push(await updateByIdWithMissingColumnFallback(
      client,
      'transaction_bond_applications',
      row.id,
      {
        assigned_organisation_id: scope.organisationId,
        assigned_region_id: scope.regionId,
        assigned_workspace_unit_id: scope.workspaceUnitId,
        assigned_branch_id: scope.branchId,
        assigned_team_id: scope.teamId,
        assigned_user_id: scope.userId,
        bond_assignment_rule_id: decision.ruleId || null,
        bond_assignment_method: decision.source === 'rule' ? decision.method : null,
        scope_level: scope.scopeLevel,
        scope_metadata: compactObject({
          source,
          action,
          sourceType: decision.source || null,
          ruleId: decision.ruleId || null,
          method: decision.source === 'rule' ? decision.method : null,
          assignedBy: actor.id || null,
          assignedAt: now,
        }),
        assignment_status: scope.userId ? 'consultant_assigned' : 'organisation_queue',
        assignment_source: source,
        updated_by: actor.id || null,
        updated_at: now,
      },
      'id',
    ))
  }
  return updates
}

async function persistDecline(client, { transactionId, reason }) {
  const now = new Date().toISOString()
  return updateByIdWithMissingColumnFallback(
    client,
    'transactions',
    transactionId,
    {
      bond_assignment_status: 'declined',
      bond_assignment_source: 'declined_from_intake',
      finance_status: `Bond intake declined: ${reason}`,
      last_meaningful_activity_at: now,
      updated_at: now,
    },
    'id, bond_assignment_status, bond_assignment_source, finance_status, updated_at',
  )
}

function assertReady(row = {}, user = {}) {
  const summary = getBondIntakeSummary(getBondIntakeInput(row, user))
  if (summary.intakeStatus !== BOND_INTAKE_STATUSES.READY_FOR_REVIEW) {
    throw new Error('Buyer application and documents must be complete before acceptance.')
  }
}

function getTransactionId(row = {}, explicitTransactionId = '') {
  const transactionId = normalizeText(explicitTransactionId || row?.transaction?.id || row?.id)
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }
  return transactionId
}

export async function acceptBondIntakeApplication({ row = {}, transactionId = '', user = {}, assignee = {}, note = '', client = null } = {}) {
  if (!canMutateBondIntake(user)) {
    throw new Error('You do not have permission to accept this application.')
  }
  assertReady(row, user)

  const db = getClient({ client })
  const actor = resolveCurrentUser(user)
  const assignmentDecision = await resolveBondIntakeAssignmentDecision({ row, actor, assignee })
  const resolvedAssignee = assignmentDecision.assignee
  const id = getTransactionId(row, transactionId)

  await upsertRolePlayerMarker(db, { transactionId: id, actor, assignee: resolvedAssignee, action: 'accept', note })
  const transaction = await persistAcceptedAssignment(db, {
    transactionId: id,
    actor,
    assignee: resolvedAssignee,
    action: 'accept',
    assignmentDecision,
  })
  await persistBondApplicationAssignment(db, {
    transactionId: id,
    actor,
    assignee: resolvedAssignee,
    action: 'accept',
    assignmentDecision,
  })
  const notification = await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_ACCEPTED,
    transaction: { ...(row?.transaction || row || {}), ...(transaction || {}), id },
    actor,
    metadata: {
      assignee: resolvedAssignee,
      note,
      source: 'new_applications_queue',
    },
    client: db,
  })
  const activity = notification.activity || null

  return { transaction, activity, notification, message: 'Application accepted and moved to My Applications.' }
}

export async function assignBondIntakeApplication({ row = {}, transactionId = '', user = {}, assignee = {}, note = '', client = null } = {}) {
  if (!canAssignBondIntake(user)) {
    throw new Error('You do not have permission to assign this application.')
  }
  assertReady(row, user)

  const db = getClient({ client })
  const actor = resolveCurrentUser(user)
  const assignmentDecision = await resolveBondIntakeAssignmentDecision({ row, actor, assignee })
  const resolvedAssignee = assignmentDecision.assignee
  const id = getTransactionId(row, transactionId)

  await upsertRolePlayerMarker(db, { transactionId: id, actor, assignee: resolvedAssignee, action: 'assign', note })
  const transaction = await persistAcceptedAssignment(db, {
    transactionId: id,
    actor,
    assignee: resolvedAssignee,
    action: 'assign',
    assignmentDecision,
  })
  await persistBondApplicationAssignment(db, {
    transactionId: id,
    actor,
    assignee: resolvedAssignee,
    action: 'assign',
    assignmentDecision,
  })
  const notification = await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_ASSIGNED,
    transaction: { ...(row?.transaction || row || {}), ...(transaction || {}), id },
    actor,
    metadata: {
      assignee: resolvedAssignee,
      assigneeId: resolvedAssignee.id,
      routingRuleId: assignmentDecision.ruleId || null,
      note,
      source: 'new_applications_queue',
    },
    client: db,
  })
  const activity = notification.activity || null

  return { transaction, activity, notification, message: 'Application assigned and moved to My Applications.' }
}

export async function declineBondIntakeApplication({ row = {}, transactionId = '', user = {}, reason = '', note = '', client = null } = {}) {
  if (!canDeclineBondIntake(user)) {
    throw new Error('You do not have permission to decline this application.')
  }
  const declineReason = normalizeText(reason)
  if (!declineReason) {
    throw new Error('Decline reason is required.')
  }

  const db = getClient({ client })
  const actor = resolveCurrentUser(user)
  const id = getTransactionId(row, transactionId)
  const assignee = resolveAssignee({ user })

  await upsertRolePlayerMarker(db, { transactionId: id, actor, assignee, action: 'decline', reason: declineReason, note })
  const transaction = await persistDecline(db, { transactionId: id, actor, reason: declineReason, note })
  const notification = await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_DECLINED,
    transaction: { ...(row?.transaction || row || {}), ...(transaction || {}), id },
    actor,
    metadata: {
      reason: declineReason,
      note,
      source: 'new_applications_queue',
    },
    client: db,
  })
  const activity = notification.activity || null

  return { transaction, activity, notification, message: 'Bond application declined.' }
}
