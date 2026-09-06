// A small, dependency-free error shape for new domain APIs. Existing API
// behavior is deliberately unchanged until a function is extracted.
export function createDomainApiError(message, { code = 'domain_api_error', cause = null } = {}) {
  const error = new Error(message)
  error.code = code
  if (cause) error.cause = cause
  return error
}
