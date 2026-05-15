export const ATTORNEY_TRANSACTION_ROLES = [
  'transfer_attorney',
  'bond_attorney',
  'cancellation_attorney',
]

export const ATTORNEY_MANAGEMENT_ROLES = [
  'firm_admin',
  'director_partner',
  'attorney_admin',
  'attorney_manager',
]

export const ATTORNEY_VISIBILITY_SCOPES = {
  internal: 'internal',
  professionalShared: 'professional_shared',
  clientVisible: 'client_visible',
}

export const ATTORNEY_PERMISSION_ACTIONS = {
  viewLegalWorkspace: 'viewLegalWorkspace',
  viewLane: 'viewLane',
  updateLane: 'updateLane',
  requestDocuments: 'requestDocuments',
  uploadDocuments: 'uploadDocuments',
  reviewDocuments: 'reviewDocuments',
  manageSigning: 'manageSigning',
  addInternalNote: 'addInternalNote',
  addSharedUpdate: 'addSharedUpdate',
  publishClientVisibleUpdate: 'publishClientVisibleUpdate',
  assignAttorney: 'assignAttorney',
  reassignAttorney: 'reassignAttorney',
  viewFirmMatters: 'viewFirmMatters',
}

export const ATTORNEY_ROLE_PERMISSION_MATRIX = {
  transfer_attorney: {
    canViewAssignedTransaction: true,
    canViewLaneRoles: ['transfer_attorney'],
    canUpdateLaneRoles: ['transfer_attorney'],
    canRequestDocumentRoles: ['transfer_attorney'],
    canUploadDocumentRoles: ['transfer_attorney'],
    canReviewDocumentRoles: ['transfer_attorney'],
    canManageSigningRoles: ['transfer_attorney'],
    canAddInternalNoteRoles: ['transfer_attorney'],
    canAddSharedUpdateRoles: ['transfer_attorney'],
    canPublishClientVisibleUpdateRoles: ['transfer_attorney'],
    cannotByDefault: ['bond_attorney', 'cancellation_attorney', 'sales_pipeline', 'developer_financials'],
  },
  bond_attorney: {
    canViewAssignedTransaction: true,
    canViewLaneRoles: ['bond_attorney'],
    canUpdateLaneRoles: ['bond_attorney'],
    canRequestDocumentRoles: ['bond_attorney'],
    canUploadDocumentRoles: ['bond_attorney'],
    canReviewDocumentRoles: ['bond_attorney'],
    canManageSigningRoles: ['bond_attorney'],
    canAddInternalNoteRoles: ['bond_attorney'],
    canAddSharedUpdateRoles: ['bond_attorney'],
    canPublishClientVisibleUpdateRoles: ['bond_attorney'],
    cannotByDefault: ['transfer_attorney', 'cancellation_attorney', 'sales_pipeline', 'seller_transfer_fields'],
  },
  cancellation_attorney: {
    canViewAssignedTransaction: true,
    canViewLaneRoles: ['cancellation_attorney'],
    canUpdateLaneRoles: ['cancellation_attorney'],
    canRequestDocumentRoles: ['cancellation_attorney'],
    canUploadDocumentRoles: ['cancellation_attorney'],
    canReviewDocumentRoles: ['cancellation_attorney'],
    canManageSigningRoles: ['cancellation_attorney'],
    canAddInternalNoteRoles: ['cancellation_attorney'],
    canAddSharedUpdateRoles: ['cancellation_attorney'],
    canPublishClientVisibleUpdateRoles: ['cancellation_attorney'],
    cannotByDefault: ['transfer_attorney', 'bond_attorney', 'sales_pipeline', 'buyer_finance_lane'],
  },
  attorney_manager: {
    canViewFirmMatters: true,
    canViewAllFirmLanes: true,
    canAssignAttorney: true,
    canReassignAttorney: true,
    canViewInternalFirmNotes: true,
    canAddInternalManagementNotes: true,
    laneEditingRequiresAssignmentByDefault: true,
  },
  attorney_admin: {
    canViewFirmMatters: true,
    canViewAllFirmLanes: true,
    canAssignAttorney: true,
    canReassignAttorney: true,
    canViewInternalFirmNotes: true,
    canAddInternalManagementNotes: true,
    canManageFirmUsers: true,
    canManageDepartments: true,
    canManageFirmSettings: true,
    canManageRolePermissions: true,
    laneEditingRequiresAssignmentByDefault: true,
  },
}

export function normalizeAttorneyTransactionRole(value, fallback = 'transfer_attorney') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'transfer') return 'transfer_attorney'
  if (normalized === 'bond') return 'bond_attorney'
  if (normalized === 'cancellation') return 'cancellation_attorney'
  return ATTORNEY_TRANSACTION_ROLES.includes(normalized) ? normalized : fallback
}

export function normalizeAttorneyVisibility(value, fallback = ATTORNEY_VISIBILITY_SCOPES.internal) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'client') return ATTORNEY_VISIBILITY_SCOPES.clientVisible
  if (normalized === 'shared' || normalized === 'professional') return ATTORNEY_VISIBILITY_SCOPES.professionalShared
  if (normalized === 'internal_only') return ATTORNEY_VISIBILITY_SCOPES.internal
  return Object.values(ATTORNEY_VISIBILITY_SCOPES).includes(normalized) ? normalized : fallback
}
