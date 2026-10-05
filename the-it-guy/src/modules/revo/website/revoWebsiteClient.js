// Browser client for the website's own server proxy. No Arch9 credential belongs here.
export function createRevoWebsiteClient({ basePath = '/api/arch9', fetchImpl = fetch } = {}) {
  if (!basePath.startsWith('/') || basePath.startsWith('//') || /[?#]/.test(basePath)) throw new Error('Use a same-origin website proxy path.')
  async function request(path, options = {}) {
    const response = await fetchImpl(`${basePath.replace(/\/$/, '')}/${path}`, {
      ...options, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    })
    const body = await response.json()
    if (!response.ok) throw Object.assign(new Error(body.message || 'The property information could not be loaded. Please try again.'), { status: response.status })
    return body
  }
  return {
    listings: (filters = {}, options = {}) => request(`listings?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null))}`, options),
    property: async (id, options = {}) => { try { return (await request(`listings/${encodeURIComponent(id)}`, options)).data } catch (error) { if (error.status === 404) return null; throw error } },
    enquiry: (payload) => request('leads', { method: 'POST', body: JSON.stringify(payload) }),
  }
}
