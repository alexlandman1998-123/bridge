import { isMissingTableError } from './attorneyFirmServiceShared'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import {
  BOND_SCOPE_LEVELS,
  getDefaultBondScope,
  mapLegacyScopeToBondScope,
  normalizeScopeLevel,
} from '../constants/workspaceUnits'
import { normalizeOrgRole } from '../constants/orgRoles'
import { WORKSPACE_TYPES } from '../constants/workspaceTypes'

const BOND_WORKSPACE_TYPE = WORKSPACE_TYPES.bondOriginator
const HQ_MANAGER_ROLES = new Set(['owner', 'director', 'hq_manager', 'manager', 'partner', 'principal', 'admin_staff'])
const REGIONAL_MANAGER_ROLES = new Set(['regional_manager', 'director', 'hq_manager', 'owner'])
const BRANCH_MANAGER_ROLES = new Set(['branch_manager', 'team_lead', 'manager', 'owner', 'hq_manager'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeId(value) {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeBool(value) {
  return Boolean(value)
}

function isMissingWorkspaceColumns(error) {
  return (
    isMissingTableError(error, 'organisation_users') ||
    isMissingTableError(error, 'workspace_regions') ||
    isMissingTableError(error, 'workspace_units')
  )
}

function resolveMembershipRole(membership = {}) {
  return normalizeOrgRole(
    membership?.workspaceRole ||
      membership?.workspace_role ||
      membership?.organisationRole ||
      membership?.organisation_role ||
      membership?.role ||
      '',
    { workspaceType: BOND_WORKSPACE_TYPE },
  )
}

function resolveMembershipScopeLevel(membership = {}) {
  const role = resolveMembershipRole(membership)
  const explicitScope = normalizeScopeLevel(
    mapLegacyScopeToBondScope(normalizeText(membership?.scope_level || membership?.scopeLevel || membership?.scope)) ||
      normalizeText(membership?.scope_level || membership?.scopeLevel || membership?.scope),
    getDefaultBondScope(role, { workspaceType: BOND_WORKSPACE_TYPE }),
  )
  if (explicitScope) return explicitScope
  return getDefaultBondScope(role, { workspaceType: BOND_WORKSPACE_TYPE })
}

function pickMembershipFromContext(context = {}) {
  const candidate =
    context.currentMembership ||
    context.membership ||
    context.organizationMembership ||
    context.organisationMembership ||
    null

  if (!candidate) return null
  if (candidate.scopeLevel || candidate.scope_level || candidate.role || candidate.workspace_role || candidate.region_id || candidate.workspace_unit_id) {
    return candidate
  }
  return null
}

function toMemberScopeRecord(member = null, workspaceId = '') {
  if (!member?.id) return null
  return {
    membershipId: normalizeText(member.id),
    workspaceId: normalizeText(workspaceId || member.workspaceId || member.organisation_id || member.organisationId),
    status: normalizeText(member.status),
    userId: normalizeText(member.userId || member.user_id),
    workspaceRole: resolveMembershipRole(member),
    scopeLevel: resolveMembershipScopeLevel(member),
    branchScope: normalizeText(member.branch_scope || member.branchScope || null),
    regionId: normalizeId(member.region_id || member.regionId || null),
    workspaceUnitId: normalizeId(member.workspace_unit_id || member.workspaceUnitId || null),
    scopeMetadata: member.scope_metadata || member.scopeMetadata || {},
    isPrimaryOwner: normalizeBool(member.is_primary_owner || member.isPrimaryOwner),
  }
}

function matchesRegionScope(record = {}, candidate = {}) {
  const targetRegionId = normalizeId(record.assigned_region_id || record.assignedRegionId || record.region_id || record.regionId || record.regionIdLegacy)
  const memberRegionId = normalizeId(candidate.regionId)
  if (!targetRegionId || !memberRegionId) return false
  return targetRegionId === memberRegionId
}

function matchesUnitScope(record = {}, candidate = {}) {
  const targetUnitId = normalizeId(
    record.assigned_workspace_unit_id ||
      record.assignedWorkspaceUnitId ||
      record.assigned_branch_id ||
      record.assignedBranchId ||
      record.assigned_team_id ||
      record.assignedTeamId ||
      record.workspace_unit_id ||
      record.workspaceUnitId ||
      record.branch_id ||
      record.branchId ||
      record.assignedBranchId ||
      record.assigned_branch_id ||
      record.team_id ||
      record.teamId,
  )
  if (!targetUnitId || !normalizeId(candidate.workspaceUnitId)) return false
  return targetUnitId === normalizeId(candidate.workspaceUnitId)
}

function matchesAssignedScope(record = {}, candidate = {}, fallbackUserId = null) {
  const resolvedUserId = normalizeText(candidate.userId || fallbackUserId)
  if (!resolvedUserId) return false
  const assignedUserIds = [
    record.assigned_user_id,
    record.assignedUserId,
    record.primary_bond_consultant_user_id,
    record.primaryBondConsultantUserId,
    record.assigned_bond_processor_user_id,
    record.assignedBondProcessorUserId,
    record.assigned_bond_manager_user_id,
    record.assignedBondManagerUserId,
    record.assigned_bond_compliance_user_id,
    record.assignedBondComplianceUserId,
  ].map(normalizeText)
  const ownerUserId = normalizeText(record.owner_user_id || record.ownerUserId || '')
  return assignedUserIds.includes(resolvedUserId) || ownerUserId === resolvedUserId
}

export function getWorkspaceHierarchy(workspaceId = '') {
  const safeWorkspaceId = normalizeText(workspaceId)
  if (!isSupabaseConfigured || !supabase || !safeWorkspaceId) {
    return Promise.resolve({ workspaceId: safeWorkspaceId || '', regions: [], units: [] })
  }
  const client = supabase
  const regionQuery = client
    .from('workspace_regions')
    .select('id, workspace_id, name, code, description, manager_user_id, active, created_at, updated_at')
    .eq('workspace_id', safeWorkspaceId)
  const unitQuery = client
    .from('workspace_units')
    .select('id, workspace_id, region_id, parent_unit_id, unit_type, name, code, description, manager_user_id, active, created_at, updated_at')
    .eq('workspace_id', safeWorkspaceId)

  return Promise.all([regionQuery, unitQuery])
    .then(([regionsResult, unitsResult]) => {
      if (
        (regionsResult.error && !isMissingWorkspaceColumns(regionsResult.error)) ||
        (unitsResult.error && !isMissingWorkspaceColumns(unitsResult.error))
      ) {
        throw regionsResult.error || unitsResult.error
      }
      if (regionsResult.error || unitsResult.error) {
        return { workspaceId: safeWorkspaceId, regions: [], units: [] }
      }
      return {
        workspaceId: safeWorkspaceId,
        regions: regionsResult.data || [],
        units: unitsResult.data || [],
      }
    })
}

export async function getUserBondScope(user = {}, workspaceId = '') {
  const safeUserId = normalizeText(user.userId || user.id || user.user_id)
  const safeWorkspaceId = normalizeText(workspaceId || user.workspaceId || user.workspace_id)
  const direct = pickMembershipFromContext(user)
  if (direct) {
    return toMemberScopeRecord(direct, safeWorkspaceId)
  }

  if (!supabase || !isSupabaseConfigured || !safeUserId || !safeWorkspaceId) return null
  const client = supabase
  const membershipQuery = await client
    .from('organisation_users')
    .select(
      'id, organisation_id, user_id, status, workspace_role, role, organisation_role, branch_scope, branch_id, primary_branch_id, scope_level, region_id, workspace_unit_id, scope_metadata, is_primary_owner, created_at, updated_at',
    )
    .eq('organisation_id', safeWorkspaceId)
    .eq('user_id', safeUserId)
    .eq('status', 'active')
    .order('is_primary_owner', { ascending: false })
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)

  if (membershipQuery.error) {
    if (isMissingWorkspaceColumns(membershipQuery.error)) return null
    throw membershipQuery.error
  }

  const membership = membershipQuery.data?.[0]
  return toMemberScopeRecord(membership, safeWorkspaceId)
}

export function resolveBondScopeForMembership(membership = {}) {
  return resolveMembershipScopeLevel(membership)
}

export function canUserAccessBondScope(user = {}, targetScope = {}) {
  const scopeRecord = toMemberScopeRecord(pickMembershipFromContext(user), normalizeText(user.workspaceId || user.workspace_id || targetScope.workspaceId))
  if (!scopeRecord) return false
  const resolvedTargetScope = mapLegacyScopeToBondScope(
    normalizeText(targetScope.scopeLevel || targetScope.scope_level || targetScope.scope || targetScope.scopeType || targetScope.level),
  ) || normalizeScopeLevel(normalizeText(targetScope.scopeLevel || targetScope.scope_level || targetScope.scope || ''), BOND_SCOPE_LEVELS.assigned)
  if (resolvedTargetScope === BOND_SCOPE_LEVELS.workspaceHq) {
    return scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.workspaceHq
  }
  if (scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.workspaceHq) return true

  if (resolvedTargetScope === BOND_SCOPE_LEVELS.region) {
    return matchesRegionScope(targetScope, scopeRecord)
  }
  if (scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.region) {
    return resolvedTargetScope === BOND_SCOPE_LEVELS.region ? matchesRegionScope(targetScope, scopeRecord) : false
  }

  if ([BOND_SCOPE_LEVELS.branch, BOND_SCOPE_LEVELS.team].includes(scopeRecord.scopeLevel)) {
    return resolvedTargetScope === BOND_SCOPE_LEVELS.assigned
      ? matchesAssignedScope(targetScope, scopeRecord, scopeRecord.userId)
      : matchesUnitScope(targetScope, scopeRecord)
  }

  if (scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.assigned) {
    return resolvedTargetScope === BOND_SCOPE_LEVELS.assigned ? matchesAssignedScope(targetScope, scopeRecord, scopeRecord.userId) : false
  }

  return false
}

export function getAccessibleBondRegions(user = {}, workspaceId = '') {
  const scopeRecord = toMemberScopeRecord(pickMembershipFromContext(user), normalizeText(workspaceId))
  if (!scopeRecord) return []
  if (scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.workspaceHq) return []
  if (scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.region) {
    return scopeRecord.regionId ? [scopeRecord.regionId] : []
  }
  if ([BOND_SCOPE_LEVELS.branch, BOND_SCOPE_LEVELS.team].includes(scopeRecord.scopeLevel)) {
    return []
  }
  return []
}

export function getAccessibleBondUnits(user = {}, workspaceId = '') {
  const scopeRecord = toMemberScopeRecord(pickMembershipFromContext(user), normalizeText(workspaceId))
  if (!scopeRecord) return []
  if (scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.workspaceHq) return []
  if (scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.region) return []
  if ([BOND_SCOPE_LEVELS.branch, BOND_SCOPE_LEVELS.team].includes(scopeRecord.scopeLevel)) {
    return scopeRecord.workspaceUnitId ? [scopeRecord.workspaceUnitId] : []
  }
  return []
}

export function isWorkspaceHqUser(user = {}, workspaceId = '') {
  const scopeRecord = toMemberScopeRecord(pickMembershipFromContext(user), normalizeText(workspaceId))
  if (!scopeRecord) return false
  return scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.workspaceHq
}

export function isRegionalBondManager(user = {}, workspaceId = '', regionId = '') {
  const scopeRecord = toMemberScopeRecord(pickMembershipFromContext(user), normalizeText(workspaceId))
  if (!scopeRecord) return false
  if (!REGIONAL_MANAGER_ROLES.has(scopeRecord.workspaceRole)) return false
  const target = normalizeId(regionId)
  if (!target) return scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.region
  return target === scopeRecord.regionId
}

export function isBranchBondManager(user = {}, workspaceId = '', unitId = '') {
  const scopeRecord = toMemberScopeRecord(pickMembershipFromContext(user), normalizeText(workspaceId))
  if (!scopeRecord) return false
  if (scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.workspaceHq) return true
  if (!BRANCH_MANAGER_ROLES.has(scopeRecord.workspaceRole)) return false
  const target = normalizeId(unitId)
  if (!target) return scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.branch || scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.team
  return target === scopeRecord.workspaceUnitId
}

export function isAssignedOnlyBondUser(user = {}, workspaceId = '') {
  const scopeRecord = toMemberScopeRecord(pickMembershipFromContext(user), normalizeText(workspaceId))
  if (!scopeRecord) return false
  return scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.assigned
}

export function getRegionAwareUnitAccess(user = {}, workspaceId = '', record = {}) {
  const scopeRecord = toMemberScopeRecord(pickMembershipFromContext(user), normalizeText(workspaceId))
  if (!scopeRecord) return false
  if (scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.workspaceHq) return true
  if (scopeRecord.scopeLevel === BOND_SCOPE_LEVELS.region) return matchesRegionScope(record, scopeRecord)
  if ([BOND_SCOPE_LEVELS.branch, BOND_SCOPE_LEVELS.team].includes(scopeRecord.scopeLevel)) return matchesUnitScope(record, scopeRecord)
  return matchesAssignedScope(record, scopeRecord, scopeRecord.userId)
}

export const __bondHierarchyTestUtils = Object.freeze({
  resolveMembershipScopeLevel,
  resolveMembershipRole,
  matchesRegionScope,
  matchesUnitScope,
  matchesAssignedScope,
})
