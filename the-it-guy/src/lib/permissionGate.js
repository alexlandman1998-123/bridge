import { normalizeOrganisationMembershipRole } from './organisationAccess'
import { normalizeAppRole } from './roles'

const ORG_ADMIN_ROLES = new Set(['super_admin', 'principal', 'admin', 'branch_manager', 'owner', 'manager'])

function normalizeTransactionRole(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isOrgAdmin(role = '') {
  return ORG_ADMIN_ROLES.has(normalizeOrganisationMembershipRole(role))
}

function isAssignedUser(userId = '', assignedUserIds = []) {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) return false
  return (assignedUserIds || []).some((item) => String(item || '').trim() === normalizedUserId)
}

export function canUser({
  capability = '',
  appRole = '',
  organisationRole = '',
  transactionRole = '',
  assignedUserIds = [],
  userId = '',
  isSuperAdmin = false,
} = {}) {
  const normalizedCapability = String(capability || '').trim().toLowerCase()
  const role = normalizeAppRole(appRole)
  const orgRole = normalizeOrganisationMembershipRole(organisationRole)
  const txRole = normalizeTransactionRole(transactionRole)
  const orgAdmin = isOrgAdmin(orgRole) || isSuperAdmin
  const assigned = isAssignedUser(userId, assignedUserIds)

  if (!normalizedCapability) return false
  if (isSuperAdmin) return true

  const capabilityMatrix = {
    view_developments: role !== 'client',
    create_developments: role === 'developer' || orgAdmin,
    edit_developments: role === 'developer' || orgAdmin,
    view_transactions: role !== 'client',
    create_transactions: role === 'developer' || role === 'agent' || orgAdmin,
    edit_main_transaction_stage: role === 'developer' || role === 'attorney' || orgAdmin,
    edit_finance_lane: role === 'developer' || role === 'bond_originator' || orgAdmin,
    edit_attorney_lane: role === 'developer' || role === 'attorney' || orgAdmin,
    upload_documents: role !== 'client' && (orgAdmin || assigned || txRole === 'attorney' || txRole === 'bond_originator'),
    request_documents: role === 'developer' || role === 'agent' || role === 'attorney' || orgAdmin,
    approve_documents: role === 'developer' || role === 'attorney' || orgAdmin,
    comment_shared: role !== 'client' || txRole === 'buyer' || txRole === 'seller',
    comment_internal: role !== 'client',
    view_reports: role !== 'client' && role !== 'viewer',
    export_reports: role === 'developer' || orgAdmin,
    manage_users: orgAdmin || role === 'developer',
    manage_organisation_settings: orgAdmin || role === 'developer',
  }

  return Boolean(capabilityMatrix[normalizedCapability])
}

export function resolveCapabilityDenialMessage(capability = '') {
  const key = String(capability || '').trim().toLowerCase()
  const map = {
    manage_users: 'You do not have permission to manage users in this workspace.',
    manage_organisation_settings: 'You do not have permission to update organisation settings.',
    export_reports: 'You do not have permission to export reports.',
    view_reports: 'You do not have permission to view reports.',
  }
  return map[key] || 'You do not have permission to perform this action.'
}
