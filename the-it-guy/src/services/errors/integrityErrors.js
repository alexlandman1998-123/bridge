import { BridgeValidationError } from './validationErrors'

export function createIntegrityError(issue, metadata = {}) {
  return new BridgeValidationError(issue?.message || 'Integrity check failed.', {
    code: issue?.code || 'integrity_failed',
    severity: issue?.severity || 'error',
    entityType: issue?.entityType || 'unknown',
    entityId: issue?.entityId || '',
    userMessage: 'Arch9 found a data integrity issue. Please use diagnostics or contact support.',
    metadata: { issue, ...metadata },
  })
}
