const READ_RPC_NAMES = new Set([
  'bridge_client_portal_canonical_document_projection',
  'bridge_client_portal_unmatched_buyer_documents_projection',
  'bridge_read_shared_matter_journey',
])
const TRANSIENT_STATUSES = new Set([408, 502, 503, 504, 520, 521, 522, 523, 524])
const TRANSIENT_CODES = new Set(['57014', '08006', '08001', '53300', 'client_portal_read_timeout', 'client_portal_load_timeout'])

export function isTransientBuyerPortalReadError(error) {
  const code = String(error?.code || '')
  if (code) return TRANSIENT_CODES.has(code)
  if (error?.status) return TRANSIENT_STATUSES.has(Number(error.status))
  return /failed to fetch|fetch failed|network(?:error| request failed)?|connection (?:reset|closed)|socket|timed? out/i.test(error?.message || '')
}

function retryDelay(ms, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

// Only the buyer token client installs this transport. Writes, Storage and
// non-allowlisted RPCs retain their original single-request behavior.
export function createClientPortalReadFetch(fetchImpl = (...args) => globalThis.fetch(...args), {
  timeoutMs = 8000,
  retryDelayMs = 300,
} = {}) {
  return async (input, init) => {
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const pathname = new URL(input instanceof Request ? input.url : String(input)).pathname
    const readOnly = pathname.startsWith('/rest/v1/') && (
      ['GET', 'HEAD'].includes(method) || (
        method === 'POST' && pathname.startsWith('/rest/v1/rpc/') &&
        READ_RPC_NAMES.has(pathname.slice('/rest/v1/rpc/'.length))
      )
    )
    if (!readOnly) return fetchImpl(input, init)
    const request = new Request(input instanceof Request ? input.clone() : input, init)

    for (let attempt = 0; attempt < 2; attempt += 1) {
      request.signal.throwIfAborted()
      const controller = new AbortController()
      const forwardAbort = () => controller.abort(request.signal.reason)
      request.signal.addEventListener('abort', forwardAbort, { once: true })
      let rejectAbort
      const aborted = new Promise((_, reject) => { rejectAbort = reject })
      const onAbort = () => rejectAbort(controller.signal.reason)
      controller.signal.addEventListener('abort', onAbort, { once: true })
      const timer = setTimeout(() => controller.abort(Object.assign(
        new Error('The secure portal read timed out.'), { code: 'client_portal_read_timeout' },
      )), timeoutMs)
      try {
        const result = await Promise.race([
          (async () => {
            const response = await fetchImpl(request.clone(), { signal: controller.signal })
            // Keep the deadline through body arrival; receiving headers alone
            // must not leave the SDK waiting indefinitely for its JSON body.
            const bytes = await response.clone().arrayBuffer()
            let transient = TRANSIENT_STATUSES.has(response.status)
            if (response.status === 500) {
              try { transient = TRANSIENT_CODES.has(JSON.parse(new TextDecoder().decode(bytes)).code) } catch { /* Non-JSON failures are not database timeouts. */ }
            }
            return { response, transient }
          })(),
          aborted,
        ])
        if (!result.transient || attempt === 1) return result.response
        void result.response.body?.cancel().catch(() => {})
      } catch (error) {
        if (request.signal.aborted || !isTransientBuyerPortalReadError(error) || attempt === 1) throw error
      } finally {
        clearTimeout(timer)
        request.signal.removeEventListener('abort', forwardAbort)
        controller.signal.removeEventListener('abort', onAbort)
      }
      await retryDelay(retryDelayMs, request.signal)
    }
  }
}

// A cold workspace comprises multiple reads. Recover its initial read once
// if their combined deadline expires, retaining the loading screen throughout.
export async function recoverBuyerPortalLoad(load, { isCurrent = () => true, retryDelayMs = 600 } = {}) {
  try {
    return await load()
  } catch (error) {
    if (!isCurrent() || !isTransientBuyerPortalReadError(error)) throw error
    await retryDelay(retryDelayMs)
    if (!isCurrent()) throw error
    return load()
  }
}
