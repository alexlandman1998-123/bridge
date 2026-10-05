// Run this module on the website BACKEND. Persist credentials in server secrets.
import { createHmac, timingSafeEqual } from 'node:crypto'

export function createArch9WebsiteClient({ baseUrl, credential, fetchImpl = fetch }) {
  if (!baseUrl || !credential) throw new Error('Configure the Arch9 backend URL and website credential.')
  async function request(path, options = {}) {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/integrations/v1/${path}`, {
      ...options, headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(15000),
    })
    const data = await response.json()
    if (!response.ok) throw Object.assign(new Error(data.message || data.error), { status: response.status })
    return data
  }
  return {
    listings: (filters = {}) => request(`listings?${new URLSearchParams(filters)}`),
    property: async (id) => { try { return (await request(`listings/${encodeURIComponent(id)}`)).data } catch (error) { if (error.status === 404) return null; throw error } },
    enquiry: (enquiry) => request('leads', { method: 'POST', body: JSON.stringify(enquiry) }),
    changes: (cursor = '0') => request(`changes?${new URLSearchParams({ cursor, limit: '100' })}`),
  }
}

export function verifyArch9Webhook({ secret, timestamp, signature, rawBody, now = Date.now() }) {
  if (!secret || !/^\d{10}$/.test(String(timestamp)) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !/^sha256=[a-f0-9]{64}$/.test(String(signature))) return false
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

// Executable in-memory demonstration. Use a persistent cache and versions table
// plus a per-connection transaction/lock in your actual website backend.
export function createExampleListingCache(client, connectionId) {
  const properties = new Map(), versions = new Map()
  let cursor = '0'
  let pending = Promise.resolve()
  function applyEvent(event) {
    const work = pending.then(async () => {
      if (event.connectionId !== connectionId || event.schemaVersion !== 1 || !['listing.published','listing.updated','listing.withdrawn'].includes(event.type)) throw new Error('Unexpected Arch9 webhook event.')
      if (BigInt(event.version) <= BigInt(versions.get(event.listingId) || '0')) return
      // Fetch the current authorised state even for a withdrawal. A delayed
      // withdrawal may arrive after a newer republication that must be retained.
      const property = await client.property(event.listingId)
      if (property) {
        const version = BigInt(property.version) > BigInt(event.version) ? property.version : event.version
        properties.set(event.listingId, property); versions.set(event.listingId, version)
      } else {
        properties.delete(event.listingId); versions.set(event.listingId, event.version)
      }
    })
    pending = work.catch(() => {})
    return work
  }
  async function reconcile() {
    let page
    do {
      page = await client.changes(cursor)
      for (const event of page.data) await applyEvent(event)
      cursor = page.nextCursor // persist only after the whole page succeeds
    } while (page.hasMore)
    return cursor
  }
  return { properties, versions, applyEvent, reconcile }
}
