import { randomUUID } from 'node:crypto'
import { loadRentalTenantPortalSnapshot } from './rentalTenantPortalSnapshot.js'
import { openRentalPortalDocument } from './rentalPortalDocuments.js'
import { loadRentalPortalMaintenance, rentalPortalMaintenanceInput, submitRentalPortalMaintenance } from './rentalPortalMaintenance.js'

export async function handleRentalTenantPortalRelationship(db, tenancy, method, body, access) {
  if (!['GET', 'POST'].includes(method)) return { status: 405, body: { error: 'Method not allowed.' } }
  if (method === 'POST' && body.action !== 'open_document') {
    if (body.requestType === 'maintenance' && body.maintenance) {
      const details = rentalPortalMaintenanceInput(body)
      if (!details) return { status: 400, body: { error: 'Choose a category and provide at least 10 characters describing the issue.' } }
      const requestId = body.requestId || randomUUID()
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) return { status: 400, body: { error: 'A valid maintenance receipt is required.' } }
      return submitRentalPortalMaintenance(db, tenancy, details, { ...access, requestId })
    }
    const requestType = String(body.requestType || '').trim().toLowerCase(), message = String(body.message || '').trim()
    if (!['maintenance', 'access', 'general'].includes(requestType) || message.length < 10 || message.length > 4000) return { status: 400, body: { error: 'Choose a request type and enter 10 to 4,000 characters.' } }
    const created = await db.from('rental_tenant_portal_requests').insert({ tenancy_id: tenancy.id, organisation_id: tenancy.organisation_id, request_type: requestType, message }).select('id,request_type,message,status,submitted_at').single()
    if (created.error) throw created.error
    return { status: 201, body: { request: created.data } }
  }
  const snapshot = await loadRentalTenantPortalSnapshot(db, tenancy)
  if (method === 'POST') return openRentalPortalDocument(db, snapshot.documents, body.documentId)
  const [requests, maintenanceRequests] = await Promise.all([
    db.from('rental_tenant_portal_requests').select('id,request_type,message,status,submitted_at').eq('tenancy_id', tenancy.id).eq('organisation_id', tenancy.organisation_id).order('submitted_at', { ascending: false }),
    loadRentalPortalMaintenance(db, { tenancyId: tenancy.id, organisationId: tenancy.organisation_id }),
  ])
  if (requests.error) throw requests.error
  return { status: 200, body: { ...snapshot.view, requests: requests.data || [], maintenanceRequests } }
}
