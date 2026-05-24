import { BridgeValidationError } from './validationErrors'

export function createPermissionDeniedError(permission, metadata = {}) {
  return new BridgeValidationError(`Permission denied: ${permission}`, {
    code: 'permission_denied',
    severity: 'warning',
    entityType: 'permission',
    userMessage: 'You do not have permission to perform this action.',
    metadata: { permission, ...metadata },
  })
}
