import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { handleRentalTenantPortalRelationship } from './rentalTenantPortalRelationship.js'

const text = value => String(value ?? '').trim()
const admin = env => {
  const url = text(env.SUPABASE_URL || env.VITE_SUPABASE_URL), key = text(env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !key) throw new Error('Tenant portal access is not configured.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function handlePublicRentalTenantPortal({ method = 'GET', headers = {}, body = {}, token = '', env = process.env } = {}) {
  const header = text(headers.authorization || headers.Authorization), rawToken = header.startsWith('Bearer ') ? header.slice(7).trim() : text(token)
  if (!rawToken) return { status: 401, body: { error: 'This tenant portal link is invalid or has expired.' } }
  try {
    const db = admin(env)
    const access = await db.from('rental_tenant_portal_access_tokens').select('id,tenancy_id,expires_at,revoked_at').eq('token_hash', createHash('sha256').update(rawToken).digest('hex')).maybeSingle()
    const expiry = Date.parse(access.data?.expires_at)
    if (access.error || !access.data || access.data.revoked_at || !Number.isFinite(expiry) || expiry <= Date.now()) return { status: 401, body: { error: 'This tenant portal link is invalid or has expired.' } }
    const tenancy = await db.from('rental_tenancies').select('id,organisation_id,property_id,unit_id,status,intended_occupation_date,tenant_snapshot_json').eq('id', access.data.tenancy_id).maybeSingle()
    if (tenancy.error || !tenancy.data) return { status: 404, body: { error: 'This tenancy is unavailable.' } }
    const result = await handleRentalTenantPortalRelationship(db, tenancy.data, method, body, { tokenId: access.data.id })
    await db.from('rental_tenant_portal_access_tokens').update({ last_accessed_at: new Date().toISOString() }).eq('id', access.data.id)
    return result
  } catch (error) { return { status: 500, body: { error: error?.message || 'Unable to open tenant portal.' } } }
}
export function writePublicRentalTenantPortalResponse(response, result) { response.status(result.status).json(result.body) }
