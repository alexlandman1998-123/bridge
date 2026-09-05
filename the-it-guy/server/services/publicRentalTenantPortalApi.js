import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const text = (value) => String(value ?? '').trim()
const hash = (value) => createHash('sha256').update(text(value)).digest('hex')
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const tokenFrom = (input = {}) => { const header = text(input.headers?.authorization || input.headers?.Authorization); return header.startsWith('Bearer ') ? header.slice(7).trim() : text(input.token) }
const admin = (env = process.env) => { const url = text(env.SUPABASE_URL || env.VITE_SUPABASE_URL); const key = text(env.SUPABASE_SERVICE_ROLE_KEY); if (!url || !key) throw new Error('Tenant portal access is not configured.'); return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) }

function tenantView(tenancy = {}, lease = {}) { const snapshot = object(tenancy.tenant_snapshot_json); const identity = object(snapshot.identity); const terms = object(lease.terms_json); return { tenancy: { id: text(tenancy.id), status: text(tenancy.status), occupationDate: tenancy.intended_occupation_date || null, tenantName: [text(identity.firstName), text(identity.lastName)].filter(Boolean).join(' ') || 'Tenant' }, lease: { status: text(lease.status), monthlyRent: terms.monthly_rent ?? null, depositAmount: terms.deposit_amount ?? null, leaseTermMonths: terms.lease_term_months ?? null, occupationDate: terms.intended_occupation_date || tenancy.intended_occupation_date || null } } }

export async function handlePublicRentalTenantPortal({ method = 'GET', headers = {}, body = {}, token = '', env = process.env } = {}) {
  const rawToken = tokenFrom({ headers, token }); if (!rawToken) return { status: 401, body: { error: 'This tenant portal link is invalid or has expired.' } }
  try {
    const db = admin(env); const now = new Date().toISOString(); const access = await db.from('rental_tenant_portal_access_tokens').select('id, tenancy_id, expires_at, revoked_at').eq('token_hash', hash(rawToken)).maybeSingle()
    if (access.error || !access.data || access.data.revoked_at || new Date(access.data.expires_at) <= new Date(now)) return { status: 401, body: { error: 'This tenant portal link is invalid or has expired.' } }
    const tenancyResult = await db.from('rental_tenancies').select('id, organisation_id, status, intended_occupation_date, tenant_snapshot_json').eq('id', access.data.tenancy_id).maybeSingle(); if (tenancyResult.error || !tenancyResult.data) return { status: 404, body: { error: 'This tenancy is unavailable.' } }
    const leaseResult = await db.from('rental_leases').select('status, terms_json').eq('tenancy_id', access.data.tenancy_id).maybeSingle(); if (leaseResult.error) throw leaseResult.error
    await db.from('rental_tenant_portal_access_tokens').update({ last_accessed_at: now }).eq('id', access.data.id)
    if (method === 'GET') { const requests = await db.from('rental_tenant_portal_requests').select('id, request_type, message, status, submitted_at').eq('tenancy_id', access.data.tenancy_id).order('submitted_at', { ascending: false }); if (requests.error) throw requests.error; return { status: 200, body: { ...tenantView(tenancyResult.data, leaseResult.data || {}), requests: requests.data || [] } } }
    if (method !== 'POST') return { status: 405, body: { error: 'Method not allowed.' } }
    const requestType = text(body.requestType).toLowerCase(); const message = text(body.message); if (!['maintenance', 'access', 'general'].includes(requestType) || message.length < 10 || message.length > 4000) return { status: 400, body: { error: 'Choose a request type and enter 10 to 4,000 characters.' } }
    const created = await db.from('rental_tenant_portal_requests').insert({ tenancy_id: access.data.tenancy_id, organisation_id: tenancyResult.data.organisation_id, request_type: requestType, message }).select('id, request_type, message, status, submitted_at').single(); if (created.error) throw created.error
    return { status: 201, body: { request: created.data } }
  } catch (error) { return { status: 500, body: { error: error?.message || 'Unable to open tenant portal.' } } }
}

export function writePublicRentalTenantPortalResponse(response, result) { response.status(result.status).json(result.body) }
