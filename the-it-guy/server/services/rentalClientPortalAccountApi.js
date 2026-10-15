import { createClient } from '@supabase/supabase-js'
import { loadRentalLandlordPortalSnapshot } from './rentalLandlordPortalSnapshot.js'
import { handleRentalTenantPortalRelationship } from './rentalTenantPortalRelationship.js'
import { openRentalPortalDocument } from './rentalPortalDocuments.js'

const text = (value) => String(value ?? '').trim()
const bearer = (headers = {}) => { const header = text(headers.authorization || headers.Authorization); return header.startsWith('Bearer ') ? header.slice(7).trim() : '' }
const admin = (env = process.env) => { const url = text(env.SUPABASE_URL || env.VITE_SUPABASE_URL); const key = text(env.SUPABASE_SERVICE_ROLE_KEY); if (!url || !key) throw new Error('Client portal account access is not configured.'); return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) }

async function authenticatedMembership(db, headers, membershipId, expectedAudience) {
  const jwt = bearer(headers); if (!jwt) return { error: 'Sign in is required.', status: 401 }
  const auth = await db.auth.getUser(jwt); const user = auth.data?.user || null
  if (auth.error || !user) return { error: 'Your session has expired. Please sign in again.', status: 401 }
  const membership = await db.from('rental_client_portal_memberships').select('id, organisation_id, audience, tenancy_id, property_id, status').eq('id', text(membershipId)).eq('user_id', user.id).eq('audience', expectedAudience).eq('status', 'active').is('revoked_at', null).maybeSingle()
  if (membership.error || !membership.data) return { error: 'This account does not have access to that rental relationship.', status: 403 }
  return { user, membership: membership.data }
}

export async function handleRentalClientPortalAccount({ method = 'GET', headers = {}, body = {}, query = {}, env = process.env } = {}) {
  try {
    const db = admin(env); const membershipId = text(query.membershipId || body.membershipId); const audience = text(query.audience || body.audience).toLowerCase()
    if (!membershipId || !['tenant', 'landlord'].includes(audience)) return { status: 400, body: { error: 'A portal relationship is required.' } }
    const access = await authenticatedMembership(db, headers, membershipId, audience)
    if (access.error) return { status: access.status, body: { error: access.error } }
    const membership = access.membership

    if (audience === 'tenant') {
      const tenancyResult = await db.from('rental_tenancies').select('id, organisation_id, property_id, unit_id, status, intended_occupation_date, tenant_snapshot_json').eq('id', membership.tenancy_id).maybeSingle()
      if (tenancyResult.error || !tenancyResult.data) return { status: 404, body: { error: 'This tenancy is unavailable.' } }
      if (tenancyResult.data.organisation_id !== membership.organisation_id) return { status: 403, body: { error: 'This account does not have access to that rental relationship.' } }
      return await handleRentalTenantPortalRelationship(db, tenancyResult.data, method, body, { membershipId: membership.id })
    }

    const property = await db.from('rental_properties').select('id, organisation_id, name, property_type, status, address_line_1, suburb, city').eq('id', membership.property_id).eq('organisation_id', membership.organisation_id).maybeSingle()
    if (property.error || !property.data) return { status: 404, body: { error: 'This rental property is unavailable.' } }
    const snapshot = await loadRentalLandlordPortalSnapshot(db, property.data.id, property.data.organisation_id)
    if (method === 'POST' && body.action === 'open_document') return await openRentalPortalDocument(db, snapshot.fileAccess, body.documentId)
    const { fileAccess: _fileAccess, ...view } = snapshot
    if (method === 'GET') { const decisions = await db.from('rental_landlord_portal_decisions').select('id, decision_type, message, status, submitted_at').eq('property_id', membership.property_id).order('submitted_at', { ascending: false }); if (decisions.error) throw decisions.error; return { status: 200, body: { property: property.data, ...view, decisions: decisions.data || [] } } }
    if (method !== 'POST') return { status: 405, body: { error: 'Method not allowed.' } }
    const decisionType = text(body.decisionType).toLowerCase(); const message = text(body.message); if (!['maintenance_approval', 'listing_instruction', 'general'].includes(decisionType) || message.length < 10 || message.length > 4000) return { status: 400, body: { error: 'Choose a decision type and enter 10 to 4,000 characters.' } }
    const created = await db.from('rental_landlord_portal_decisions').insert({ property_id: membership.property_id, organisation_id: property.data.organisation_id, decision_type: decisionType, message }).select('id, decision_type, message, status, submitted_at').single(); if (created.error) throw created.error
    return { status: 201, body: { decision: created.data } }
  } catch (error) { return { status: 500, body: { error: error?.message || 'Unable to open this client portal.' } } }
}

export function writeRentalClientPortalAccountResponse(response, result) { response.status(result.status).json(result.body) }
