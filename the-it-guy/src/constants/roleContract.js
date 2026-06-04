import { APP_ROLES, normalizeCanonicalAppRole } from './appRoles'
import { ORG_ROLES, normalizeOrgRole } from './orgRoles'
import { SYSTEM_ROLES, normalizeSystemRole } from './systemRoles'
import { BOND_SCOPE_LEVELS, BRANCH_SCOPES, getDefaultBondScope, getDefaultBranchScope } from './workspaceUnits'
import {
  WORKSPACE_KINDS,
  WORKSPACE_TYPES,
  inferWorkspaceKindFromWorkspaceType,
  inferWorkspaceTypeFromAppRole,
  normalizeWorkspaceKind,
  normalizeWorkspaceType,
} from './workspaceTypes'

export const ROLE_CONTRACT_KEYS = Object.freeze({
  agencyOwner: 'agency_owner',
  developerOwner: 'developer_owner',
  attorneyOwner: 'attorney_owner',
  bondOwner: 'bond_owner',
  bondOperational: 'bond_operational',
  clientInvited: 'client_invited',
})

const PROFESSIONAL_OWNER = Object.freeze({
  systemRole: SYSTEM_ROLES.professional,
  membershipRole: ORG_ROLES.owner,
  workspaceRole: ORG_ROLES.owner,
  organisationRole: ORG_ROLES.owner,
  isPrimaryOwner: true,
})

export const ROLE_CONTRACTS = Object.freeze({
  [ROLE_CONTRACT_KEYS.agencyOwner]: Object.freeze({
    key: ROLE_CONTRACT_KEYS.agencyOwner,
    profileRole: APP_ROLES.agent,
    workspaceType: WORKSPACE_TYPES.agency,
    defaultWorkspaceKind: WORKSPACE_TYPES.agency,
    intendedOrgRole: ORG_ROLES.principal,
    systemRole: SYSTEM_ROLES.professional,
    membershipRole: ORG_ROLES.principal,
    workspaceRole: ORG_ROLES.principal,
    organisationRole: ORG_ROLES.principal,
    branchScope: BRANCH_SCOPES.allBranches,
    isPrimaryOwner: true,
  }),
  [ROLE_CONTRACT_KEYS.developerOwner]: Object.freeze({
    key: ROLE_CONTRACT_KEYS.developerOwner,
    profileRole: APP_ROLES.developer,
    workspaceType: WORKSPACE_TYPES.developerCompany,
    defaultWorkspaceKind: WORKSPACE_TYPES.developerCompany,
    intendedOrgRole: ORG_ROLES.owner,
    ...PROFESSIONAL_OWNER,
  }),
  [ROLE_CONTRACT_KEYS.attorneyOwner]: Object.freeze({
    key: ROLE_CONTRACT_KEYS.attorneyOwner,
    profileRole: APP_ROLES.attorney,
    workspaceType: WORKSPACE_TYPES.attorneyFirm,
    defaultWorkspaceKind: WORKSPACE_TYPES.attorneyFirm,
    intendedOrgRole: ORG_ROLES.owner,
    ...PROFESSIONAL_OWNER,
    branchScope: BRANCH_SCOPES.allBranches,
  }),
  [ROLE_CONTRACT_KEYS.bondOwner]: Object.freeze({
    key: ROLE_CONTRACT_KEYS.bondOwner,
    profileRole: APP_ROLES.bondOriginator,
    workspaceType: WORKSPACE_TYPES.bondOriginator,
    defaultWorkspaceKind: WORKSPACE_KINDS.bondCompany,
    allowedWorkspaceKinds: Object.freeze([
      WORKSPACE_KINDS.personalOriginator,
      WORKSPACE_KINDS.bondCompany,
    ]),
    intendedOrgRole: ORG_ROLES.owner,
    ...PROFESSIONAL_OWNER,
    scopeLevel: BOND_SCOPE_LEVELS.workspaceHq,
    branchScope: BRANCH_SCOPES.allBranches,
  }),
  [ROLE_CONTRACT_KEYS.bondOperational]: Object.freeze({
    key: ROLE_CONTRACT_KEYS.bondOperational,
    profileRole: APP_ROLES.bondOriginator,
    workspaceType: WORKSPACE_TYPES.bondOriginator,
    defaultWorkspaceKind: WORKSPACE_KINDS.bondCompany,
    allowedWorkspaceKinds: Object.freeze([
      WORKSPACE_KINDS.personalOriginator,
      WORKSPACE_KINDS.bondCompany,
    ]),
    intendedOrgRole: ORG_ROLES.consultant,
    systemRole: SYSTEM_ROLES.professional,
    membershipRole: ORG_ROLES.consultant,
    workspaceRole: ORG_ROLES.consultant,
    organisationRole: ORG_ROLES.consultant,
    scopeLevel: BOND_SCOPE_LEVELS.assigned,
    branchScope: BRANCH_SCOPES.own,
    isPrimaryOwner: false,
  }),
  [ROLE_CONTRACT_KEYS.clientInvited]: Object.freeze({
    key: ROLE_CONTRACT_KEYS.clientInvited,
    profileRole: APP_ROLES.client,
    systemRole: SYSTEM_ROLES.client,
    workspaceType: null,
    defaultWorkspaceKind: null,
    intendedOrgRole: 'client',
    membershipRole: 'client',
    workspaceRole: 'client',
    organisationRole: 'client',
    isPrimaryOwner: false,
  }),
})

export const SIGNUP_ROLE_CONTRACTS = ROLE_CONTRACTS

export function resolveSignupRoleContract(input = null) {
  if (!input || typeof input !== 'object') return null
  const key = String(input.role_contract_key || input.roleContractKey || input.onboarding_path || input.position || '').trim()
  if (ROLE_CONTRACTS[key]) return ROLE_CONTRACTS[key]

  const appRole = normalizeCanonicalAppRole(input.app_role || input.appRole || input.role, '')
  const workspaceType = normalizeWorkspaceType(
    input.workspace_type || input.workspaceType,
    inferWorkspaceTypeFromAppRole(appRole),
  )
  const intendedOrgRole = normalizeOrgRole(input.intended_org_role || input.intendedOrgRole || input.workspace_role, {
    appRole,
    workspaceType,
  })

  if (appRole === APP_ROLES.bondOriginator && workspaceType === WORKSPACE_TYPES.bondOriginator) {
    return intendedOrgRole === ORG_ROLES.consultant || intendedOrgRole === ORG_ROLES.processor
      ? ROLE_CONTRACTS[ROLE_CONTRACT_KEYS.bondOperational]
      : ROLE_CONTRACTS[ROLE_CONTRACT_KEYS.bondOwner]
  }
  if (appRole === APP_ROLES.agent && workspaceType === WORKSPACE_TYPES.agency) return ROLE_CONTRACTS[ROLE_CONTRACT_KEYS.agencyOwner]
  if (appRole === APP_ROLES.developer && workspaceType === WORKSPACE_TYPES.developerCompany) return ROLE_CONTRACTS[ROLE_CONTRACT_KEYS.developerOwner]
  if (appRole === APP_ROLES.attorney && workspaceType === WORKSPACE_TYPES.attorneyFirm) return ROLE_CONTRACTS[ROLE_CONTRACT_KEYS.attorneyOwner]
  if (appRole === APP_ROLES.client) return ROLE_CONTRACTS[ROLE_CONTRACT_KEYS.clientInvited]
  return null
}

export function resolveWorkspaceKindForContract(contract = null, value = '') {
  const fallback = contract?.defaultWorkspaceKind || inferWorkspaceKindFromWorkspaceType(contract?.workspaceType || '') || ''
  const normalized = normalizeWorkspaceKind(value, fallback)
  if (contract?.allowedWorkspaceKinds?.length && !contract.allowedWorkspaceKinds.includes(normalized)) {
    return fallback
  }
  return normalized || fallback
}

export function getRoleContractSnapshot(contract = null, overrides = {}) {
  if (!contract) return null
  const profileRole = normalizeCanonicalAppRole(overrides.profileRole || contract.profileRole, contract.profileRole)
  const workspaceType = normalizeWorkspaceType(overrides.workspaceType || contract.workspaceType, contract.workspaceType)
  const workspaceKind = resolveWorkspaceKindForContract(contract, overrides.workspaceKind || contract.defaultWorkspaceKind)
  const workspaceRole = normalizeOrgRole(overrides.workspaceRole || contract.workspaceRole, { appRole: profileRole, workspaceType })
  const organisationRole = normalizeOrgRole(overrides.organisationRole || contract.organisationRole, { appRole: profileRole, workspaceType })
  const membershipRole = normalizeOrgRole(overrides.membershipRole || contract.membershipRole, { appRole: profileRole, workspaceType })
  const scopeLevel = workspaceType === WORKSPACE_TYPES.bondOriginator
    ? overrides.scopeLevel || contract.scopeLevel || getDefaultBondScope(workspaceRole, { appRole: profileRole, workspaceType })
    : null

  return {
    key: contract.key,
    profile_role: profileRole,
    system_role: normalizeSystemRole(overrides.systemRole || contract.systemRole, contract.systemRole),
    workspace_type: workspaceType || null,
    workspace_kind: workspaceKind || null,
    intended_org_role: contract.intendedOrgRole,
    membership_role: membershipRole,
    workspace_role: workspaceRole,
    organisation_role: organisationRole,
    scope_level: scopeLevel,
    branch_scope: overrides.branchScope || contract.branchScope || getDefaultBranchScope(workspaceRole, { appRole: profileRole, workspaceType }),
    is_primary_owner: Boolean(overrides.isPrimaryOwner ?? contract.isPrimaryOwner),
  }
}

