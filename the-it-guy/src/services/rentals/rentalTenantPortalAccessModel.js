export const RENTAL_TENANT_PORTAL_ACCESS_VERSION = 'arch9_rental_tenant_portal_access_v1'
const text = (value) => String(value ?? '').trim()
const bytes = (value) => new TextEncoder().encode(value)
const hex = (buffer) => Array.from(new Uint8Array(buffer)).map((item) => item.toString(16).padStart(2, '0')).join('')
const randomToken = () => { const values = new Uint8Array(32); globalThis.crypto.getRandomValues(values); return btoa(String.fromCharCode(...values)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') }
const hash = async (value) => hex(await globalThis.crypto.subtle.digest('SHA-256', bytes(value)))

export async function createRentalTenantPortalAccess({ tenancyId = '', expiresInMinutes = 10080, now = new Date(), token = randomToken() } = {}) {
  if (!text(tenancyId)) throw new Error('Tenancy is required.')
  const issuedAt = new Date(now)
  return { tenancyId: text(tenancyId), token, tokenHash: await hash(token), issuedAt: issuedAt.toISOString(), expiresAt: new Date(issuedAt.getTime() + Math.max(1, Number(expiresInMinutes) || 1) * 60000).toISOString(), revokedAt: null }
}
