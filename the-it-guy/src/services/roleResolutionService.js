import { APP_ROLES, normalizeCanonicalAppRole } from '../constants/appRoles'
import { normalizeOrgRole, ORG_ROLES } from '../constants/orgRoles'
import { inferWorkspaceTypeFromAppRole, normalizeWorkspaceType } from '../constants/workspaceTypes'

export const SYSTEM_ROLES = Object.freeze({
  professional: 'professional',
  client: 'client',
  admin: 'admin',
  superAdmin: 'super_admin',
})

export const SYSTEM_ROLE_VALUES = Object.freeze(Object.values(SYSTEM_ROLES))

export const TRANSACTION_ROLES = Object.freeze({
  listingAgent: 'listing_agent',
  sellingAgent: 'selling_agent',
  transferAttorney: 'transfer_attorney',
  bondAttorney: 'bond_attorney',
  cancellationAttorney: 'cancellation_attorney',
  bondOriginator: 'bond_originator',
  buyer: 'buyer',
  seller: 'seller',
  developerContact: 'developer_contact',
  externalCollaborator: 'external_collaborator',
})

export const TRANSACTION_ROLE_VALUES = Object.freeze(Object.values(TRANSACTION_ROLES))

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

export function normalizeSystemRole(value = '', fallback = '') {
  const normalized = normalizeKey(value)
  if (SYSTEM_ROLE_VALUES.includes(normalized)) return normalized
  if (normalized === 'platform_admin' || normalized === 'admin_user') return SYSTEM_ROLES.admin
  if (normalized === 'superadmin' || normalized === 'super_admin_user') return SYSTEM_ROLES.superAdmin
  if (normalized === 'buyer' || normalized === 'seller') return SYSTEM_ROLES.client
  if (['agent', 'developer', 'attorney', 'bond_originator', 'professional_user'].includes(normalized)) {
    return SYSTEM_ROLES.professional
  }
  return fallback
}

export function resolveSystemRole(profile = {}) {
  const explicit = normalizeSystemRole(profile?.system_role || profile?.systemRole, '')
  if (explicit) return explicit
  const appRole = normalizeCanonicalAppRole(profile?.role || profile?.app_role || profile?.appRole, '')
  if (appRole === APP_ROLES.client) return SYSTEM_ROLES.client
  if (appRole === APP_ROLES.platformAdmin) return SYSTEM_ROLES.admin
  if (appRole) return SYSTEM_ROLES.professional
  return normalizeSystemRole(profile?.role, SYSTEM_ROLES.professional)
}

export function resolveWorkspaceRole(membership = {}, options = {}) {
  const appRole = normalizeCanonicalAppRole(
    options.appRole ||
      options.app_role ||
      membership?.appRole ||
      membership?.app_role ||
      membership?.profile?.role,
    '',
  )
  const workspaceType = normalizeWorkspaceType(
    options.workspaceType ||
      options.workspace_type ||
      membership?.workspaceType ||
      membership?.workspace_type ||
      membership?.workspace?.type,
    inferWorkspaceTypeFromAppRole(appRole),
  )
  const rawRole =
    membership?.workspace_role ||
      membership?.workspaceRole ||
      membership?.organisation_role ||
      membership?.organisationRole ||
      membership?.role ||
      membership?.rawRole
  const normalizedRawRole = normalizeKey(rawRole)
  if (workspaceType === 'agency' && normalizedRawRole === 'sales_agent') return ORG_ROLES.agent
  return normalizeOrgRole(rawRole, { appRole, workspaceType })
}

export function normalizeTransactionRole(value = '', fallback = '') {
  const normalized = normalizeKey(value)
  if (TRANSACTION_ROLE_VALUES.includes(normalized)) return normalized
  if (normalized === 'agent' || normalized === 'sales_agent') return TRANSACTION_ROLES.listingAgent
  if (normalized === 'co_agent' || normalized === 'buyer_agent') return TRANSACTION_ROLES.sellingAgent
  if (normalized === 'attorney' || normalized === 'conveyancer') return TRANSACTION_ROLES.transferAttorney
  if (normalized === 'bond' || normalized === 'originator') return TRANSACTION_ROLES.bondOriginator
  if (normalized === 'developer' || normalized === 'developer_rep') return TRANSACTION_ROLES.developerContact
  if (normalized === 'client') return TRANSACTION_ROLES.buyer
  if (normalized === 'external' || normalized === 'stakeholder' || normalized === 'role_player') {
    return TRANSACTION_ROLES.externalCollaborator
  }
  return fallback
}

export function resolveTransactionRole(participant = {}) {
  const explicit = normalizeTransactionRole(participant?.transaction_role || participant?.transactionRole, '')
  if (explicit) return explicit

  const roleType = normalizeKey(participant?.role_type || participant?.roleType || participant?.participant_role || participant?.participantRole)
  const legalRole = normalizeKey(participant?.legal_role || participant?.legalRole)
  if (roleType === 'attorney') {
    if (legalRole === 'bond') return TRANSACTION_ROLES.bondAttorney
    if (legalRole === 'cancellation') return TRANSACTION_ROLES.cancellationAttorney
    return TRANSACTION_ROLES.transferAttorney
  }
  if (roleType === 'agent') return TRANSACTION_ROLES.listingAgent
  if (roleType === 'bond_originator') return TRANSACTION_ROLES.bondOriginator
  if (roleType === 'developer') return TRANSACTION_ROLES.developerContact
  if (roleType === 'buyer' || roleType === 'client') return TRANSACTION_ROLES.buyer
  if (roleType === 'seller') return TRANSACTION_ROLES.seller
  return normalizeTransactionRole(roleType, TRANSACTION_ROLES.externalCollaborator)
}

export function getLegacyAppRoleForWorkspace(workspaceType = '', workspaceRole = '') {
  const normalizedWorkspaceType = normalizeWorkspaceType(workspaceType)
  if (normalizedWorkspaceType === 'agency') return APP_ROLES.agent
  if (normalizedWorkspaceType === 'developer_company') return APP_ROLES.developer
  if (normalizedWorkspaceType === 'attorney_firm') return APP_ROLES.attorney
  if (normalizedWorkspaceType === 'bond_originator') return APP_ROLES.bondOriginator
  const normalizedRole = resolveWorkspaceRole({ workspace_role: workspaceRole })
  if ([ORG_ROLES.attorney, ORG_ROLES.conveyancer, ORG_ROLES.paralegal].includes(normalizedRole)) return APP_ROLES.attorney
  if (normalizedRole === ORG_ROLES.bondOriginator) return APP_ROLES.bondOriginator
  return APP_ROLES.agent
}
