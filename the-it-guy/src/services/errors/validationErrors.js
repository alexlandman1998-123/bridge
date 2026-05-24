export class BridgeValidationError extends Error {
  constructor(message, {
    code = 'validation_failed',
    severity = 'error',
    entityType = '',
    entityId = '',
    userMessage = '',
    metadata = {},
  } = {}) {
    super(message)
    this.name = 'BridgeValidationError'
    this.code = code
    this.severity = severity
    this.entityType = entityType
    this.entityId = entityId
    this.userMessage = userMessage || 'This action cannot continue until setup is repaired.'
    this.metadata = metadata
  }
}

export function normalizeValidationError(error, fallbackMessage = 'The requested operation could not be completed.') {
  if (error instanceof BridgeValidationError) return error
  return new BridgeValidationError(error?.message || fallbackMessage, {
    code: error?.code || 'operation_failed',
    severity: 'error',
    userMessage: fallbackMessage,
    metadata: {
      originalName: error?.name || '',
      details: error?.details || '',
      hint: error?.hint || '',
    },
  })
}
