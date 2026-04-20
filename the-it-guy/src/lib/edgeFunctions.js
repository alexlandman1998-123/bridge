export async function parseEdgeFunctionError(error, fallbackMessage = 'Edge function call failed.') {
  const baseMessage = String(error?.message || '').trim() || fallbackMessage
  const response = error?.context

  if (!response || typeof response.clone !== 'function') {
    return baseMessage
  }

  try {
    const payload = await response.clone().json()
    if (payload && typeof payload === 'object') {
      const details = [
        typeof payload.error === 'string' ? payload.error.trim() : '',
        typeof payload.details === 'string' ? payload.details.trim() : '',
      ].filter(Boolean)

      if (details.length) {
        return details.join(' • ')
      }
    }
  } catch {
    // Non-JSON response body; try text fallback next.
  }

  try {
    const textBody = String(await response.clone().text()).trim()
    if (textBody) {
      return textBody
    }
  } catch {
    // Ignore read errors and return base message.
  }

  return baseMessage
}
