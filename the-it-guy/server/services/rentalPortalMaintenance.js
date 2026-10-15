const text = value => String(value ?? '').trim()

export function rentalPortalMaintenanceInput(body = {}) {
  const request = body.maintenance || {}
  const category = text(request.category).toLowerCase(), priority = text(request.priority || 'routine').toLowerCase(), description = text(request.description)
  if (!['plumbing', 'electrical', 'appliance', 'security', 'structural', 'pest', 'cleaning', 'other'].includes(category) || !['emergency', 'urgent', 'routine'].includes(priority) || description.length < 10 || description.length > 4000) return null
  const title = text(request.title).slice(0, 160)
  return { category, priority, description: title ? `${title}\n\n${description}` : description, area: text(request.area).slice(0, 160) || null, access: text(request.accessPreference).slice(0, 500) || null, availability: text(request.availability).slice(0, 1000) || null }
}

export async function loadRentalPortalMaintenance(db, { tenancyId, propertyId, organisationId, audience = 'tenant' }) {
  let query = db.from('rental_maintenance_requests').select('id,unit_id,category,priority,description,status,tenant_area,tenant_access_preference,tenant_availability,reported_at,acknowledged_at').eq('organisation_id', organisationId)
  query = tenancyId ? query.eq('tenancy_id', tenancyId) : query.eq('property_id', propertyId)
  const requests = await query.order('reported_at', { ascending: false })
  if (requests.error) throw requests.error
  const ids = (requests.data || []).map(row => row.id)
  if (!ids.length) return []
  const [events, assignments] = await Promise.all([
    audience === 'tenant' ? db.from('rental_maintenance_tenant_events').select('id,request_id,event_type,tenant_visible_status,tenant_message,created_at').eq('organisation_id', organisationId).in('request_id', ids).order('created_at', { ascending: true }) : { data: [] },
    audience === 'tenant' ? db.from('rental_maintenance_assignments').select('request_id,assignee_name,status,assigned_at').eq('organisation_id', organisationId).in('request_id', ids) : { data: [] },
  ])
  if (events.error || assignments.error) throw events.error || assignments.error
  // Internal contractor costs, assignments, notes and tenant access arrangements
  // are not shared with landlords. Tenant-visible messages are explicitly saved.
  return (requests.data || []).map(request => {
    const visible = audience === 'landlord' ? { id: request.id, unit_id: request.unit_id, category: request.category, priority: request.priority, status: request.status, reported_at: request.reported_at } : request
    return { ...visible, ...(audience === 'tenant' ? { assignment: (assignments.data || []).find(assignment => assignment.request_id === request.id) || null } : {}), events: audience === 'landlord' ? [] : (events.data || []).filter(event => event.request_id === request.id) }
  })
}

export async function submitRentalPortalMaintenance(db, tenancy, details, { tokenId = null, membershipId = null, requestId }) {
  const result = await db.rpc('rental_portal_submit_maintenance', { p_tenancy_id: tenancy.id, p_token_id: tokenId, p_membership_id: membershipId, p_request_id: requestId, p_details: details })
  if (result.error) throw result.error
  return { status: result.data.idempotent ? 200 : 201, body: { maintenanceRequest: result.data.request, idempotent: result.data.idempotent } }
}
