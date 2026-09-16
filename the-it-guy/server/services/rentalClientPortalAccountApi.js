import { createClient } from '@supabase/supabase-js'

const text = (value) => String(value ?? '').trim()
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const bearer = (headers = {}) => { const header = text(headers.authorization || headers.Authorization); return header.startsWith('Bearer ') ? header.slice(7).trim() : '' }
const admin = (env = process.env) => { const url = text(env.SUPABASE_URL || env.VITE_SUPABASE_URL); const key = text(env.SUPABASE_SERVICE_ROLE_KEY); if (!url || !key) throw new Error('Client portal account access is not configured.'); return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) }

function tenantView(tenancy = {}, lease = {}, property = {}, unit = {}, version = {}, documents = []) {
  const snapshot = object(tenancy.tenant_snapshot_json); const identity = object(snapshot.identity); const terms = object(lease.terms_json)
  return {
    tenancy: { id: text(tenancy.id), status: text(tenancy.status), occupationDate: tenancy.intended_occupation_date || null, tenantName: [text(identity.firstName), text(identity.lastName)].filter(Boolean).join(' ') || 'Tenant' },
    property: { name: text(property.name), addressLine1: text(property.address_line_1), suburb: text(property.suburb), city: text(property.city), unitLabel: text(unit.unit_label) },
    lease: { status: text(lease.status), monthlyRent: version.monthly_rent ?? terms.monthly_rent ?? null, depositAmount: version.deposit_amount ?? terms.deposit_amount ?? null, leaseTermMonths: terms.lease_term_months ?? null, occupationDate: version.occupation_date || terms.intended_occupation_date || tenancy.intended_occupation_date || null, startsOn: version.effective_start_date || terms.lease_start_date || null, endsOn: version.effective_end_date || terms.lease_end_date || null },
    documents: documents.map((document) => ({ id: text(document.id), label: text(document.document_label), link: text(document.document_link), createdAt: document.created_at || null })),
  }
}

async function authenticatedMembership(db, headers, membershipId, expectedAudience) {
  const jwt = bearer(headers); if (!jwt) return { error: 'Sign in is required.', status: 401 }
  const auth = await db.auth.getUser(jwt); const user = auth.data?.user || null
  if (auth.error || !user) return { error: 'Your session has expired. Please sign in again.', status: 401 }
  const membership = await db.from('rental_client_portal_memberships').select('id, organisation_id, audience, tenancy_id, property_id, status').eq('id', text(membershipId)).eq('user_id', user.id).eq('audience', expectedAudience).eq('status', 'active').maybeSingle()
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
      const [leaseResult, propertyResult, unitResult] = await Promise.all([db.from('rental_leases').select('id, status, terms_json').eq('tenancy_id', membership.tenancy_id).maybeSingle(), db.from('rental_properties').select('name, address_line_1, suburb, city').eq('id', tenancyResult.data.property_id).maybeSingle(), db.from('rental_units').select('unit_label').eq('id', tenancyResult.data.unit_id).maybeSingle()])
      if (leaseResult.error || propertyResult.error || unitResult.error) throw leaseResult.error || propertyResult.error || unitResult.error
      let version = {}; let documents = []
      if (leaseResult.data?.id) { const versionResult = await db.from('rental_lease_versions').select('id, effective_start_date, effective_end_date, occupation_date, monthly_rent, deposit_amount').eq('lease_id', leaseResult.data.id).eq('is_current', true).maybeSingle(); if (versionResult.error) throw versionResult.error; version = versionResult.data || {}; if (version.id) { const documentResult = await db.from('rental_lease_version_documents').select('id, document_label, document_link, created_at').eq('lease_version_id', version.id).order('created_at', { ascending: false }); if (documentResult.error) throw documentResult.error; documents = documentResult.data || [] } }
      if (method === 'GET') { const requests = await db.from('rental_tenant_portal_requests').select('id, request_type, message, status, submitted_at').eq('tenancy_id', membership.tenancy_id).order('submitted_at', { ascending: false }); if (requests.error) throw requests.error; return { status: 200, body: { ...tenantView(tenancyResult.data, leaseResult.data || {}, propertyResult.data || {}, unitResult.data || {}, version, documents), requests: requests.data || [] } } }
      if (method !== 'POST') return { status: 405, body: { error: 'Method not allowed.' } }
      const requestType = text(body.requestType).toLowerCase(); const message = text(body.message); if (!['maintenance', 'access', 'general'].includes(requestType) || message.length < 10 || message.length > 4000) return { status: 400, body: { error: 'Choose a request type and enter 10 to 4,000 characters.' } }
      const created = await db.from('rental_tenant_portal_requests').insert({ tenancy_id: membership.tenancy_id, organisation_id: tenancyResult.data.organisation_id, request_type: requestType, message }).select('id, request_type, message, status, submitted_at').single(); if (created.error) throw created.error
      return { status: 201, body: { request: created.data } }
    }

    const property = await db.from('rental_properties').select('id, organisation_id, name, property_type, status, address_line_1, suburb, city').eq('id', membership.property_id).maybeSingle()
    if (property.error || !property.data) return { status: 404, body: { error: 'This rental property is unavailable.' } }
    const [mandates, units, documents] = await Promise.all([db.from('rental_property_mandates').select('id, mandate_status, authority_status, starts_on, ends_on, management_fee_type, management_fee_amount').eq('property_id', membership.property_id).order('created_at', { ascending: false }).limit(1), db.from('rental_units').select('id, unit_label, status, target_rent, bedrooms, bathrooms').eq('property_id', membership.property_id).order('unit_label'), db.from('rental_entity_documents').select('id, document_label, document_category, created_at').eq('property_id', membership.property_id).eq('link_state', 'linked').order('created_at', { ascending: false }).limit(20)])
    if (mandates.error || units.error || documents.error) throw mandates.error || units.error || documents.error
    if (method === 'GET') { const decisions = await db.from('rental_landlord_portal_decisions').select('id, decision_type, message, status, submitted_at').eq('property_id', membership.property_id).order('submitted_at', { ascending: false }); if (decisions.error) throw decisions.error; return { status: 200, body: { property: property.data, mandate: mandates.data?.[0] || null, units: units.data || [], documents: documents.data || [], decisions: decisions.data || [] } } }
    if (method !== 'POST') return { status: 405, body: { error: 'Method not allowed.' } }
    const decisionType = text(body.decisionType).toLowerCase(); const message = text(body.message); if (!['maintenance_approval', 'listing_instruction', 'general'].includes(decisionType) || message.length < 10 || message.length > 4000) return { status: 400, body: { error: 'Choose a decision type and enter 10 to 4,000 characters.' } }
    const created = await db.from('rental_landlord_portal_decisions').insert({ property_id: membership.property_id, organisation_id: property.data.organisation_id, decision_type: decisionType, message }).select('id, decision_type, message, status, submitted_at').single(); if (created.error) throw created.error
    return { status: 201, body: { decision: created.data } }
  } catch (error) { return { status: 500, body: { error: error?.message || 'Unable to open this client portal.' } } }
}

export function writeRentalClientPortalAccountResponse(response, result) { response.status(result.status).json(result.body) }
