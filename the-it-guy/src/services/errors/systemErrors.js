import { BridgeValidationError } from './validationErrors'

export function createSystemConfigurationError(message, metadata = {}) {
  return new BridgeValidationError(message || 'System configuration is invalid.', {
    code: 'system_configuration_error',
    severity: 'critical',
    entityType: 'system',
    userMessage: 'Bridge is not configured safely. Contact support.',
    metadata,
  })
}
