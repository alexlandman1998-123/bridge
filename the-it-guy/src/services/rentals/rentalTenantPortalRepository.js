import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { createRentalTenantPortalAccess } from './rentalTenantPortalAccessModel.js'

const text = (value) => String(value ?? '').trim()
const client = (value = supabase) => { if (!isSupabaseConfigured || !value) throw new Error('Tenant portal links require Supabase configuration.'); return value }

export async function createPersistedRentalTenantPortalAccess(tenancyId, { expiresInMinutes = 10080, createdBy = '', client: db = supabase } = {}) {
  const access = await createRentalTenantPortalAccess({ tenancyId, expiresInMinutes })
  const result = await client(db).from('rental_tenant_portal_access_tokens').insert({ tenancy_id: access.tenancyId, token_hash: access.tokenHash, expires_at: access.expiresAt, created_by: text(createdBy) || null }).select('id, expires_at').single()
  if (result.error) throw result.error
  return { ...access, id: result.data.id, expiresAt: result.data.expires_at }
}

export async function revokePersistedRentalTenantPortalAccess(accessId, { client: db = supabase } = {}) {
  const result = await client(db).from('rental_tenant_portal_access_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', text(accessId)).select('id, revoked_at').single()
  if (result.error) throw result.error
  return result.data
}
