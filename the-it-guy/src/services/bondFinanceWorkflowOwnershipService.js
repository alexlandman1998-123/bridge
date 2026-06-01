import { ORG_ROLES, normalizeOrgRole } from '../constants/orgRoles'
import { BOND_SCOPE_LEVELS } from '../constants/workspaceUnits'
import { PERMISSIONS } from '../auth/permissions/permissionRegistry'
import {
  can,
  canAccessWorkspaceRecord,
  resolvePermissionContext,
} from '../auth/permissions/permissionResolver'
import {
  resolveEffectiveBondAssignment,
  resolveParticipantBondAssignment,
  resolveRolePlayerBondAssignment,
} from './bondAssignmentService'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function pickUserEmail(user = {}, resolved = {}) {
  return normalizeEmail(
    user.email ||
      user.profile?.email ||
      user.authState?.profile?.email ||
      resolved.profile?.email ||
      '',
  )
}

function isManagerialRole(role = '') {
  return [
    ORG_ROLES.owner,
    ORG_ROLES.director,
    ORG_ROLES.hqManager,
    ORG_ROLES.regionalManager,
    ORG_ROLES.branchManager,
    ORG_ROLES.teamLead,
    ORG_ROLES.manager,
  ].includes(role)
}

function isHqRole(role = '') {
  return [ORG_ROLES.owner, ORG_ROLES.director, ORG_ROLES.hqManager].includes(role)
}

function buildScopeRecord(transaction = {}, owners = {}) {
  return {
    organisation_id:
      owners.bondWorkspaceId ||
      normalizeText(transaction.assigned_organisation_id || transaction.assignedOrganisationId) ||
      normalizeText(transaction.bond_workspace_id || transaction.organisation_id || transaction.workspace_id),
    region_id:
      owners.bondRegionId ||
      normalizeText(transaction.assigned_region_id || transaction.assignedRegionId) ||
      normalizeText(transaction.bond_region_id || transaction.region_id),
    workspace_unit_id:
      owners.bondWorkspaceUnitId ||
      normalizeText(transaction.assigned_workspace_unit_id || transaction.assignedWorkspaceUnitId || transaction.assigned_branch_id || transaction.assignedBranchId || transaction.assigned_team_id || transaction.assignedTeamId) ||
      normalizeText(transaction.bond_workspace_unit_id || transaction.workspace_unit_id || transaction.branch_id || transaction.team_id),
    assigned_user_id:
      owners.primaryConsultantUserId ||
      owners.processorUserId ||
      owners.managerUserId ||
      owners.complianceUserId ||
      normalizeText(transaction.assigned_user_id || transaction.assignedUserId) ||
      null,
    owner_user_id:
      owners.primaryConsultantUserId ||
      owners.managerUserId ||
      null,
  }
}

function resolveStepOwnerBucket(stepKey = '') {
  const normalized = normalizeText(stepKey).toLowerCase()
  if (!normalized) return 'shared'
  if (normalized.includes('compliance')) return 'compliance'
  if (normalized.includes('bank_feedback')) return 'processor_manager'
  if (normalized.includes('submitted_to_banks') || normalized.includes('submission')) return 'processor_consultant_manager'
  if (normalized.includes('document') || normalized.includes('application_in_progress')) return 'processor_consultant_manager'
  if (normalized.includes('ready_for_transfer')) return 'manager_hq'
  if (normalized.includes('escalat') || normalized.includes('blocker')) return 'manager_hq'
  return 'processor_consultant_manager'
}

function canAccessByScope(user = {}, transaction = {}, owners = {}, permission = PERMISSIONS.viewApplications) {
  if (!can(permission, user)) return false
  return canAccessWorkspaceRecord(permission, user, buildScopeRecord(transaction, owners))
}

function hasDirectUnitScopeAccess(resolved = {}, owners = {}, transaction = {}) {
  const scopeLevel = normalizeText(resolved.scopeLevelRaw || resolved.scopeLevel)
  if (![BOND_SCOPE_LEVELS.team, BOND_SCOPE_LEVELS.branch].includes(scopeLevel)) return false
  const userUnitId = normalizeText(resolved.workspaceUnitId)
  const transactionUnitId = normalizeText(
    owners.bondWorkspaceUnitId ||
      transaction.bond_workspace_unit_id ||
      transaction.workspace_unit_id ||
      transaction.branch_id ||
      transaction.team_id,
  )
  return Boolean(userUnitId && transactionUnitId && userUnitId === transactionUnitId)
}

function isDirectAssignee(resolved = {}, owners = {}, transaction = {}) {
  const userId = normalizeText(resolved.userId)
  const userEmail = pickUserEmail({}, resolved)
  const legacyEmail = normalizeEmail(
    owners.legacyBondOriginatorEmail ||
      transaction.assigned_bond_originator_email ||
      '',
  )
  if (!userId && !userEmail) return false
  if (
    userId &&
    [
      owners.primaryConsultantUserId,
      owners.processorUserId,
      owners.managerUserId,
      owners.complianceUserId,
    ]
      .map((value) => normalizeText(value))
      .includes(userId)
  ) {
    return true
  }
  return Boolean(userEmail && legacyEmail && userEmail === legacyEmail)
}

function resolveEffectiveUserRole(resolved = {}, owners = {}) {
  const role = normalizeOrgRole(resolved.workspaceRole, {
    workspaceType: resolved.workspaceType,
  })
  const userId = normalizeText(resolved.userId)
  if (!userId) return role
  if (userId && normalizeText(owners.complianceUserId) === userId) return ORG_ROLES.compliance
  if (userId && normalizeText(owners.processorUserId) === userId) return ORG_ROLES.processor
  if (userId && normalizeText(owners.primaryConsultantUserId) === userId) return ORG_ROLES.consultant
  if (userId && normalizeText(owners.managerUserId) === userId) return ORG_ROLES.branchManager
  return role
}

export function resolveFinanceWorkflowOwners(transaction = {}) {
  const effective = resolveEffectiveBondAssignment(transaction || {})
  const participant = resolveParticipantBondAssignment(transaction || {})
  const rolePlayer = resolveRolePlayerBondAssignment(transaction || {})
  const warnings = [...(effective.warnings || [])]
  if (effective.source !== 'canonical' && effective.source !== 'none') {
    warnings.push(`finance_owner_resolution_fallback:${effective.source}`)
  }
  return {
    source: effective.source,
    confidence: effective.confidence || 0,
    warnings,
    bondWorkspaceId:
      effective.bondWorkspaceId ||
      normalizeText(transaction.assigned_organisation_id || transaction.assignedOrganisationId) ||
      normalizeText(transaction.bond_workspace_id || transaction.organisation_id || transaction.workspace_id) ||
      null,
    bondRegionId:
      effective.bondRegionId ||
      normalizeText(transaction.assigned_region_id || transaction.assignedRegionId) ||
      normalizeText(transaction.bond_region_id || transaction.region_id) ||
      null,
    bondWorkspaceUnitId:
      effective.bondWorkspaceUnitId ||
      normalizeText(transaction.assigned_workspace_unit_id || transaction.assignedWorkspaceUnitId || transaction.assigned_branch_id || transaction.assignedBranchId || transaction.assigned_team_id || transaction.assignedTeamId) ||
      normalizeText(transaction.bond_workspace_unit_id || transaction.workspace_unit_id || transaction.branch_id || transaction.team_id) ||
      null,
    primaryConsultantUserId:
      effective.primaryConsultantUserId ||
      normalizeText(transaction.assigned_user_id || transaction.assignedUserId) ||
      participant.primaryConsultantUserId ||
      rolePlayer.primaryConsultantUserId ||
      null,
    processorUserId:
      effective.processorUserId ||
      participant.processorUserId ||
      rolePlayer.processorUserId ||
      null,
    managerUserId:
      effective.managerUserId ||
      participant.managerUserId ||
      rolePlayer.managerUserId ||
      null,
    complianceUserId:
      effective.complianceUserId ||
      participant.complianceUserId ||
      rolePlayer.complianceUserId ||
      null,
    legacyBondOriginator:
      effective.legacyBondOriginator ||
      normalizeText(transaction.bond_originator) ||
      null,
    legacyBondOriginatorEmail:
      effective.legacyBondOriginatorEmail ||
      normalizeEmail(transaction.assigned_bond_originator_email) ||
      null,
  }
}

export function resolveFinanceWorkflowActors(transaction = {}) {
  const owners = resolveFinanceWorkflowOwners(transaction)
  return {
    ...owners,
    ownerUserIds: [
      owners.primaryConsultantUserId,
      owners.processorUserId,
      owners.managerUserId,
      owners.complianceUserId,
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean),
  }
}

export function canViewFinanceWorkflow(user = {}, transaction = {}) {
  const owners = resolveFinanceWorkflowOwners(transaction)
  const resolved = resolvePermissionContext(user || {})
  if (!resolved.userId && !pickUserEmail(user, resolved)) return false
  if (isDirectAssignee(resolved, owners, transaction)) return true
  if (hasDirectUnitScopeAccess(resolved, owners, transaction)) return true
  if (canAccessByScope(user, transaction, owners, PERMISSIONS.viewApplications)) return true
  if (canAccessByScope(user, transaction, owners, PERMISSIONS.viewAssignedApplications)) return true
  return false
}

export function canEditFinanceWorkflow(user = {}, transaction = {}) {
  const owners = resolveFinanceWorkflowOwners(transaction)
  const resolved = resolvePermissionContext(user || {})
  if (!canViewFinanceWorkflow(user, transaction)) return false
  if (can(PERMISSIONS.updateBondStatus, user)) return true
  if (can(PERMISSIONS.manageBondWorkspace, user)) return true
  const role = resolveEffectiveUserRole(resolved, owners)
  if (role === ORG_ROLES.compliance) return Boolean(normalizeText(owners.complianceUserId) === normalizeText(resolved.userId))
  if (role === ORG_ROLES.processor) return Boolean(normalizeText(owners.processorUserId) === normalizeText(resolved.userId) || canAccessByScope(user, transaction, owners, PERMISSIONS.viewTeamApplications))
  if (role === ORG_ROLES.consultant) return Boolean(normalizeText(owners.primaryConsultantUserId) === normalizeText(resolved.userId))
  if (isManagerialRole(role)) return true
  return false
}

export function canUpdateBankFeedback(user = {}, transaction = {}) {
  if (!canViewFinanceWorkflow(user, transaction)) return false
  if (!can(PERMISSIONS.manageBankFeedback, user)) return false
  const resolved = resolvePermissionContext(user || {})
  const owners = resolveFinanceWorkflowOwners(transaction)
  const role = resolveEffectiveUserRole(resolved, owners)
  if (role === ORG_ROLES.processor) {
    return Boolean(normalizeText(owners.processorUserId) === normalizeText(resolved.userId) || canAccessByScope(user, transaction, owners, PERMISSIONS.viewTeamApplications))
  }
  return isManagerialRole(role) || isHqRole(role)
}

export function canSubmitToBanks(user = {}, transaction = {}) {
  if (!canViewFinanceWorkflow(user, transaction)) return false
  if (!can(PERMISSIONS.submitToBanks, user)) return false
  const resolved = resolvePermissionContext(user || {})
  const owners = resolveFinanceWorkflowOwners(transaction)
  const role = resolveEffectiveUserRole(resolved, owners)
  if (role === ORG_ROLES.consultant) return normalizeText(owners.primaryConsultantUserId) === normalizeText(resolved.userId)
  if (role === ORG_ROLES.processor) return normalizeText(owners.processorUserId) === normalizeText(resolved.userId) || canAccessByScope(user, transaction, owners, PERMISSIONS.viewTeamApplications)
  if (isManagerialRole(role) || isHqRole(role)) return true
  return false
}

export function canRequestFinanceDocuments(user = {}, transaction = {}) {
  if (!canViewFinanceWorkflow(user, transaction)) return false
  const canRequest =
    can(PERMISSIONS.requestFinanceDocs, user) ||
    can(PERMISSIONS.requestDocuments, user)
  if (!canRequest) return false
  return true
}

export function canReviewFinanceCompliance(user = {}, transaction = {}) {
  if (!canViewFinanceWorkflow(user, transaction)) return false
  const resolved = resolvePermissionContext(user || {})
  const owners = resolveFinanceWorkflowOwners(transaction)
  const role = resolveEffectiveUserRole(resolved, owners)
  if (role === ORG_ROLES.compliance) {
    if (resolved.scopeLevel === BOND_SCOPE_LEVELS.workspaceHq) return true
    return normalizeText(owners.complianceUserId) === normalizeText(resolved.userId)
  }
  return isManagerialRole(role) && can(PERMISSIONS.manageBondReporting, user)
}

export function canCompleteFinanceStep(user = {}, transaction = {}, stepKey = '') {
  if (!canEditFinanceWorkflow(user, transaction)) return false
  const owners = resolveFinanceWorkflowOwners(transaction)
  const resolved = resolvePermissionContext(user || {})
  const role = resolveEffectiveUserRole(resolved, owners)
  const bucket = resolveStepOwnerBucket(stepKey)
  if (bucket === 'compliance') return canReviewFinanceCompliance(user, transaction)
  if (bucket === 'manager_hq') return isManagerialRole(role) || isHqRole(role)
  if (bucket === 'processor_manager') {
    return role === ORG_ROLES.processor || isManagerialRole(role) || isHqRole(role)
  }
  return role === ORG_ROLES.consultant || role === ORG_ROLES.processor || isManagerialRole(role) || isHqRole(role)
}

export function canEscalateFinanceApplication(user = {}, transaction = {}) {
  if (!canViewFinanceWorkflow(user, transaction)) return false
  const resolved = resolvePermissionContext(user || {})
  const role = normalizeOrgRole(resolved.workspaceRole, {
    workspaceType: resolved.workspaceType,
  })
  if (!isManagerialRole(role) && !isHqRole(role)) return false
  return (
    can(PERMISSIONS.manageBondTeam, user) ||
    can(PERMISSIONS.manageBondWorkspace, user) ||
    can(PERMISSIONS.assignBondApplications, user)
  )
}
