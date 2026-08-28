function getRequestMethod(input, init = {}) {
  return String(init?.method || input?.method || 'GET').toUpperCase()
}

function getRequestUrl(input) {
  return typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '')
}

function isCoalesciblePostgrestRead(input, init = {}) {
  const method = getRequestMethod(input, init)
  if (!['GET', 'HEAD'].includes(method) || init?.signal || input?.signal) return false
  try {
    return new URL(getRequestUrl(input), 'http://localhost').pathname.includes('/rest/v1/')
  } catch {
    return false
  }
}

function requestKey(input, init = {}) {
  const headers = new Headers(input?.headers || undefined)
  new Headers(init?.headers || undefined).forEach((value, key) => headers.set(key, value))
  const responseHeaders = [...headers.entries()].sort(([left], [right]) => left.localeCompare(right))
  return JSON.stringify([getRequestMethod(input, init), getRequestUrl(input), responseHeaders])
}

export function createSupabaseRequestCoordinator(fetchImpl = globalThis.fetch) {
  const inFlight = new Map()

  return async function coordinatedSupabaseFetch(input, init = {}) {
    if (!isCoalesciblePostgrestRead(input, init)) return fetchImpl(input, init)
    const key = requestKey(input, init)
    let pending = inFlight.get(key)
    if (!pending) {
      pending = Promise.resolve(fetchImpl(input, init)).finally(() => inFlight.delete(key))
      inFlight.set(key, pending)
    }
    const response = await pending
    return typeof response?.clone === 'function' ? response.clone() : response
  }
}

export const __supabaseRequestCoordinatorTestUtils = Object.freeze({
  isCoalesciblePostgrestRead,
  requestKey,
})
