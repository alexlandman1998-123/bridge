import { normalizeValidationError } from './validationErrors'

export function toUserFacingError(error, fallback = 'We could not complete that action. Please try again or contact support.') {
  const normalized = normalizeValidationError(error, fallback)
  return {
    message: normalized.userMessage || fallback,
    code: normalized.code,
  }
}
