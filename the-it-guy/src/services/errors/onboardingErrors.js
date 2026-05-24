import { BridgeValidationError } from './validationErrors'

export function createOnboardingIntegrityError(reason, metadata = {}) {
  return new BridgeValidationError(`Onboarding integrity failed: ${reason}`, {
    code: reason || 'onboarding_corrupted',
    severity: 'error',
    entityType: 'onboarding',
    userMessage: 'Your setup needs to be repaired before Bridge can open the workspace.',
    metadata,
  })
}
