import {
  ATTORNEY_TRANSACTION_ROLES,
  normalizeAttorneyTransactionRole,
} from './attorneyRoleCatalog.js'

export { ATTORNEY_TRANSACTION_ROLES, normalizeAttorneyTransactionRole }

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

export function normalizeAttorneyVisibility(value, fallback = ATTORNEY_VISIBILITY_SCOPES.internal) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'client') return ATTORNEY_VISIBILITY_SCOPES.clientVisible
  if (normalized === 'shared' || normalized === 'professional') return ATTORNEY_VISIBILITY_SCOPES.professionalShared
  if (normalized === 'internal_only') return ATTORNEY_VISIBILITY_SCOPES.internal
  return Object.values(ATTORNEY_VISIBILITY_SCOPES).includes(normalized) ? normalized : fallback
}
