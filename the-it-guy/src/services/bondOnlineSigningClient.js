export function createBondOnlineSigningClient({ token, accessToken, fetchRequest = fetch } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(accessToken ? { 'x-bridge-bond-application-token': accessToken } : { 'x-bridge-client-portal-token': token || '' }) }
  async function request(action, args = {}) {
    const result = await fetchRequest('/api/public/bond-online-signing', action ? { method: 'POST', headers, body: JSON.stringify({ ...args, action }), cache: 'no-store' } : { cache: 'no-store' })
    if (action === 'download' && result.ok) return new Uint8Array(await result.arrayBuffer())
    const body = await result.json()
    if (!result.ok) { const error = new Error(body.message || body.error || 'Online signing is unavailable. Use download, sign and upload.'); error.code = body.code; throw error }
    return body
  }
  return { resume: () => request('resume'), availability: () => request(), prepare: (args) => request('prepare', args), start: (args) => request('start', args), verify: (args) => request('verify', args), status: (args) => request('status', args), download: (args) => request('download', args) }
}
