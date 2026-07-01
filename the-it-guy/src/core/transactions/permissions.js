import {
  FINANCE_MANAGED_BY_OPTIONS,
  TRANSACTION_ROLE_TYPES,
} from './roleConfig'

export function normalizeRoleType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (
    [
      'conveyancer',
      'transfer_conveyancer',
      'transfer_attorney',
      'bond_attorney',
      'cancellation_attorney',
      'conveyancing_secretary',
      'buyer_attorney',
      'seller_attorney',
      'tuckers',
    ].includes(normalized)
  ) {
    return 'attorney'
  }

  if (['bondoriginator', 'bond_originator'].includes(normalized)) {
    return 'bond_originator'
  }

  if (['listing_agent', 'selling_agent', 'estate_agent', 'sales_agent'].includes(normalized)) {
    return 'agent'
  }

  if (['developer_contact', 'developer_rep'].includes(normalized)) {
    return 'developer'
  }

  if (['internal_admin'].includes(normalized)) {
    return 'internal_admin'
  }

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
      canRequestAdditionalDocuments: true,
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
      canRequestAdditionalDocuments: true,
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
      canRequestAdditionalDocuments: true,
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
      canRequestAdditionalDocuments: true,
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
      canRequestAdditionalDocuments: false,
    }
  }

  return {
    canView: true,
    canComment: true,
    canUploadDocuments: true,
    canEditFinanceWorkflow: false,
    canEditAttorneyWorkflow: false,
    canEditCoreTransaction: false,
    canRequestAdditionalDocuments: false,
  }
}
