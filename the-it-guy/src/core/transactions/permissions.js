import {
  FINANCE_MANAGED_BY_OPTIONS,
  TRANSACTION_ROLE_TYPES,
} from './roleConfig'

export function normalizeRoleType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  return TRANSACTION_ROLE_TYPES.includes(normalized) ? normalized : 'developer'
}

export function normalizeFinanceManagedBy(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  return FINANCE_MANAGED_BY_OPTIONS.includes(normalized) ? normalized : 'bond_originator'
}

export function getRolePermissions({ role, financeManagedBy }) {
  const normalizedRole = normalizeRoleType(role)
  const managedBy = normalizeFinanceManagedBy(financeManagedBy)

  if (normalizedRole === 'developer' || normalizedRole === 'internal_admin') {
    return {
      canView: true,
      canComment: true,
      canUploadDocuments: true,
      canEditFinanceWorkflow: true,
      canEditAttorneyWorkflow: true,
      canEditCoreTransaction: true,
    }
  }

  if (normalizedRole === 'attorney') {
    return {
      canView: true,
      canComment: true,
      canUploadDocuments: true,
      canEditFinanceWorkflow: false,
      canEditAttorneyWorkflow: true,
      canEditCoreTransaction: false,
    }
  }

  if (normalizedRole === 'bond_originator') {
    return {
      canView: true,
      canComment: true,
      canUploadDocuments: true,
      canEditFinanceWorkflow: managedBy === 'bond_originator',
      canEditAttorneyWorkflow: false,
      canEditCoreTransaction: false,
    }
  }

  if (normalizedRole === 'agent') {
    return {
      canView: true,
      canComment: true,
      canUploadDocuments: true,
      canEditFinanceWorkflow: false,
      canEditAttorneyWorkflow: false,
      canEditCoreTransaction: true,
    }
  }

  if (normalizedRole === 'client' || normalizedRole === 'buyer' || normalizedRole === 'seller') {
    return {
      canView: true,
      canComment: true,
      canUploadDocuments: true,
      canEditFinanceWorkflow: false,
      canEditAttorneyWorkflow: false,
      canEditCoreTransaction: false,
    }
  }

  return {
    canView: true,
    canComment: true,
    canUploadDocuments: true,
    canEditFinanceWorkflow: false,
    canEditAttorneyWorkflow: false,
    canEditCoreTransaction: false,
  }
}
