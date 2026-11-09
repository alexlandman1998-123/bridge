export const OPENING_REQUEST_HISTORY_KEY = 'arch9:opening-request-history'
const MAX_REQUESTS = 150
const trackedRoute = path => /^\/(?:pipeline\/leads\/[^/]+|(?:agent\/)?documents|developments\/[^/]+)\/?$/.test(path)
const publicRoute = path => path.replace(/\/(leads|developments)\/[^/]+/, '/$1/:id')
const clock = () => globalThis.performance?.now?.() ?? Date.now()

export function databaseTiming(header = '') {
  const timings = new Map()
  for (const metric of header.split(',')) {
    const name = metric.trim().split(';')[0].toLowerCase()
    const duration = /;\s*dur\s*=\s*([\d.]+)/i.exec(metric)?.[1]
    if (duration !== undefined && Number.isFinite(Number(duration))) timings.set(name, Number(duration))
  }
  // PostgREST's transaction stage is database transaction time, not network time.
  return timings.get('transaction') ?? timings.get('db') ?? null
}

export function createOpeningRequestTrace({ now = clock, onReport = () => {} } = {}) {
  let active = null
  let sequence = 0
  const publish = trace => { if (trace.usableAt !== null || trace.requests.some(row => row.failed)) { try { onReport(report(trace)) } catch { /* Diagnostics are optional. */ } } }
  function begin(path, { startedAt, force = false, timingOrigin = 'request_start' } = {}) {
    const key = String(path || '').split('?')[0]
    if (!trackedRoute(key)) { active = null; return null }
    if (!force && active?.key === key) {
      if (startedAt !== undefined && active.usableAt === null) { active.startedAt = startedAt; active.timingOrigin = timingOrigin }
      return active
    }
    active = { key, openingId: `${Date.now()}-${++sequence}`, route: publicRoute(key), startedAt: startedAt ?? now(), timingOrigin, usableAt: null, requests: [], droppedRequestCount: 0, signatures: new Set(), cache: {} }
    return active
  }
  function report(trace = active) {
    if (!trace) return null
    const measured = trace.requests.filter(row => row.databaseTransactionMs !== null)
    return {
      contract: 'arch9-opening-requests-v1', openingId: trace.openingId, route: trace.route,
      timingOrigin: trace.timingOrigin,
      state: trace.usableAt !== null ? 'usable' : trace.requests.some(row => row.failed) ? 'failed' : 'loading',
      usableMs: trace.usableAt === null ? null : Math.max(0, trace.usableAt - trace.startedAt),
      requestCount: trace.requests.length + trace.droppedRequestCount,
      droppedRequestCount: trace.droppedRequestCount,
      duplicateRequestCount: trace.requests.filter(row => row.duplicate).length,
      responseBodyBytes: trace.requests.reduce((sum, row) => sum + (row.responseBodyBytes ?? 0), 0),
      responseSizeBasis: 'decoded_body_bytes',
      responseSizeMeasuredCount: trace.requests.filter(row => row.responseBodyBytes !== null).length,
      databaseTransactionMs: measured.length ? measured.reduce((sum, row) => sum + row.databaseTransactionMs, 0) : null,
      databaseTimingMeasuredCount: measured.length,
      cache: { ...trace.cache },
      requests: trace.requests.map(row => ({ ...row })),
    }
  }
  return {
    begin, report,
    usable(path) {
      if (!active || active.key !== path || active.usableAt !== null) return
      active.usableAt = now()
      // Raw filters and credentials are only used for equality during opening.
      active.signatures.clear()
      publish(active)
    },
    cache(group, outcome) {
      if (!active || active.usableAt !== null) return
      const key = `${group}:${outcome}`
      active.cache[key] = (active.cache[key] || 0) + 1
    },
    request(input, init = {}, path) {
      const trace = begin(path)
      if (!trace || trace.usableAt !== null) return null
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
      if (!/\/(rest|auth|storage|functions)\/v1\//.test(url.pathname) || /\/(telemetry_events|performance_metrics)$/.test(url.pathname)) return null
      if (trace.requests.length >= MAX_REQUESTS) { trace.droppedRequestCount += 1; return null }
      const method = String(init.method || input.method || 'GET').toUpperCase()
      const headers = new Headers(init.headers || input.headers)
      url.searchParams.sort()
      const signature = JSON.stringify([method, url.href, [...headers.entries()].sort(([left], [right]) => left.localeCompare(right))])
      const duplicate = ['GET', 'HEAD'].includes(method) && trace.signatures.has(signature)
      if (['GET', 'HEAD'].includes(method)) trace.signatures.add(signature)
      const startedAt = now()
      const endpoint = /^\/(storage|auth)\//.test(url.pathname) ? url.pathname.split('/').slice(0, 4).join('/') : url.pathname
      const row = { method, endpoint: endpoint.replace(/\/[0-9a-f-]{36}(?=\/|$)/gi, '/:id'), status: null, duplicate,
        headersMs: null, totalMs: null, responseBodyBytes: null, databaseTransactionMs: null, failed: false }
      trace.requests.push(row)
      let consumed = false
      return {
        headers(response) { row.status = response.status; row.failed = response.status >= 400; row.headersMs = now() - startedAt; row.databaseTransactionMs = databaseTiming(response.headers.get('server-timing') || ''); publish(trace) },
        body(size) { if (!consumed) { consumed = true; row.responseBodyBytes = size; row.totalMs = now() - startedAt; publish(trace) } },
        failed() { row.failed = true; row.totalMs = now() - startedAt; publish(trace) },
      }
    },
  }
}

const browserPath = () => typeof window === 'undefined' ? '' : window.location.pathname
export const openingRequestTrace = createOpeningRequestTrace({ onReport(sample) {
  if (typeof window === 'undefined') return
  const previous = JSON.parse(window.sessionStorage.getItem(OPENING_REQUEST_HISTORY_KEY) || '[]')
  // Late response sizes update this opening sample rather than creating new ones.
  const history = Array.isArray(previous) ? previous : []
  const index = history.findIndex(item => item.openingId === sample.openingId)
  if (index >= 0) history[index] = sample
  else history.push(sample)
  window.sessionStorage.setItem(OPENING_REQUEST_HISTORY_KEY, JSON.stringify(history.slice(-20)))
  window.dispatchEvent(new CustomEvent('arch9:opening-request-performance', { detail: sample }))
} })

export function createObservedSupabaseFetch({ fetchImpl = (...args) => globalThis.fetch(...args), collector = openingRequestTrace, getPath = browserPath } = {}) {
  return async (input, init) => {
    let observation
    try { observation = collector.request(input, init, getPath()) } catch { /* Never change transport on a diagnostics failure. */ }
    try {
      const response = await fetchImpl(input, init)
      if (!observation) return response
      observation.headers(response)
      const wrap = target => new Proxy(target, { get(object, property) {
        if (property === 'blob') return async () => {
          try { const blob = await object.blob(); observation.body(blob.size); return blob }
          catch (error) { observation.failed(); throw error }
        }
        if (property === 'text' || property === 'json' || property === 'arrayBuffer') return async () => {
          try {
            const bytes = await object.arrayBuffer()
            observation.body(bytes.byteLength)
            if (property === 'arrayBuffer') return bytes
            const text = new TextDecoder().decode(bytes)
            return property === 'json' ? JSON.parse(text) : text
          } catch (error) { observation.failed(); throw error }
        }
        if (property === 'clone') return () => wrap(object.clone())
        const value = Reflect.get(object, property, object)
        return typeof value === 'function' ? value.bind(object) : value
      } })
      return wrap(response)
    } catch (error) { observation?.failed(); throw error }
  }
}
