// Install on Revo's WEBSITE SERVER. Never ship this module or credential to a browser.
const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
})
const MAX_BODY_BYTES = 16 * 1024

async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) throw Object.assign(new Error('Enquiry is too large.'), { status: 413 })
  if (!request.body) throw new Error('Provide an enquiry.')
  const reader = request.body.getReader()
  const chunks = []
  let length = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw Object.assign(new Error('Enquiry is too large.'), { status: 413 }) }
      chunks.push(Buffer.from(value))
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function createRevoWebsiteProxy({ arch9BaseUrl, credential, websiteOrigin, proxyPath = '/api/arch9', approveEnquiry, fetchImpl = fetch }) {
  const upstream = new URL(arch9BaseUrl)
  const website = new URL(websiteOrigin)
  if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.search || upstream.hash || upstream.pathname !== '/') throw new Error('Use the HTTPS Arch9 origin.')
  if (website.protocol !== 'https:' || website.username || website.password || websiteOrigin !== website.origin) throw new Error('Use the exact HTTPS Revo website origin.')
  if (!credential || /[\r\n]/.test(credential)) throw new Error('Configure the private website credential.')
  if (!/^\/[a-z0-9/_-]+$/i.test(proxyPath) || proxyPath.startsWith('//') || proxyPath.endsWith('/')) throw new Error('Configure a same-origin proxy path without a trailing slash.')

  return async function handleRequest(request) {
    const url = new URL(request.url)
    const relativePath = url.pathname.startsWith(`${proxyPath}/`) ? url.pathname.slice(proxyPath.length + 1) : ''
    const isRead = request.method === 'GET' && (relativePath === 'listings' || /^listings\/[a-f0-9-]{36}$/i.test(relativePath))
    const isEnquiry = request.method === 'POST' && relativePath === 'leads'
    if (!isRead && !isEnquiry) return json(404, { message: 'Unknown property endpoint.' })
    let payload
    if (isEnquiry) {
      if (request.headers.get('Origin') !== website.origin) return json(403, { message: 'Please submit your enquiry from the Revo website.' })
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json(415, { message: 'Use a JSON enquiry.' })
      if (typeof approveEnquiry !== 'function') return json(503, { message: 'The website enquiry service is not configured yet.' })
      try {
        payload = await readBody(request)
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || new URL(payload.sourcePageUrl).origin !== website.origin) return json(400, { message: 'Provide the Revo property page address.' })
      } catch (error) { return json(error.status || 400, { message: error.status === 413 ? error.message : 'Provide a valid property enquiry.' }) }
      try {
        // Revo's server must enforce its public visitor rate limit and bot protection.
        // Return true when allowed, or a Response (e.g. 429) to reject the request.
        const approved = await approveEnquiry(request, payload)
        if (approved instanceof Response) return approved
        if (approved !== true) return json(403, { message: 'This enquiry could not be verified. Please try again.' })
      } catch { return json(503, { message: 'The enquiry service is temporarily unavailable. Please try again.' }) }
    }
    try {
      const target = new URL(`/api/integrations/v1/${relativePath}`, upstream)
      if (isRead) target.search = url.search
      const response = await fetchImpl(target, {
        method: request.method,
        headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
        ...(isEnquiry ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store',
      })
      const body = await response.json()
      return json(response.status, body)
    } catch { return json(502, { message: 'The property connection is temporarily unavailable. Please try again.' }) }
  }
}
