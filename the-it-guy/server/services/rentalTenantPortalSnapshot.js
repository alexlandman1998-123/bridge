import { loadRentalPortalDocuments, publicRentalPortalDocuments } from './rentalPortalDocuments.js'

export async function loadRentalTenantPortalSnapshot(db, tenancy) {
  const [leaseResult, propertyResult, unitResult, readinessResult, inspectionResult] = await Promise.all([
    db.from('rental_leases').select('id,status,terms_json').eq('tenancy_id', tenancy.id).eq('organisation_id', tenancy.organisation_id).maybeSingle(),
    db.from('rental_properties').select('name,address_line_1,suburb,city').eq('id', tenancy.property_id).eq('organisation_id', tenancy.organisation_id).maybeSingle(),
    db.from('rental_units').select('unit_label').eq('id', tenancy.unit_id).eq('property_id', tenancy.property_id).eq('organisation_id', tenancy.organisation_id).maybeSingle(),
    db.from('rental_move_in_readiness_items').select('id,obligation_type,required_amount,received_amount,status,evidence_link').eq('tenancy_id', tenancy.id).eq('organisation_id', tenancy.organisation_id).order('obligation_type'),
    db.from('rental_incoming_inspections').select('id,status,scheduled_for,completed_at,acknowledged_at').eq('tenancy_id', tenancy.id).eq('organisation_id', tenancy.organisation_id).maybeSingle(),
  ])
  const error = [leaseResult, propertyResult, unitResult, readinessResult, inspectionResult].find(result => result.error)?.error
  if (error) throw error
  if (!propertyResult.data || !unitResult.data) throw new Error('This rental relationship is unavailable.')
  const lease = leaseResult.data || {}, property = propertyResult.data, unit = unitResult.data, readiness = readinessResult.data || [], inspection = inspectionResult.data || {}
  let version = {}, signers = [], inspectionItems = [], media = []
  if (lease.id) {
    const result = await db.from('rental_lease_versions').select('id,version_number,effective_start_date,effective_end_date,occupation_date,monthly_rent,deposit_amount,terms_json').eq('lease_id', lease.id).eq('is_current', true).maybeSingle()
    if (result.error) throw result.error
    version = result.data || {}
  }
  const [signerResult, itemResult, mediaResult] = await Promise.all([
    version.id ? db.from('rental_lease_signers').select('id,signer_role,status,signed_at').eq('lease_version_id', version.id).eq('organisation_id', tenancy.organisation_id) : { data: [] },
    inspection.id ? db.from('rental_incoming_inspection_items').select('id,item_key,status,evidence_link').eq('inspection_id', inspection.id).eq('organisation_id', tenancy.organisation_id) : { data: [] },
    inspection.id ? db.from('rental_incoming_inspection_media').select('id,media_link').eq('inspection_id', inspection.id).eq('organisation_id', tenancy.organisation_id) : { data: [] },
  ])
  if (signerResult.error || itemResult.error || mediaResult.error) throw signerResult.error || itemResult.error || mediaResult.error
  signers = signerResult.data || []; inspectionItems = itemResult.data || []; media = mediaResult.data || []
  const documents = await loadRentalPortalDocuments(db, { version, lease, tenancy, readiness, inspection, inspectionItems, media, signers })
  const terms = version.terms_json || lease.terms_json || {}
  const identity = tenancy.tenant_snapshot_json?.identity || {}
  const nextStep = tenancy.status !== 'draft' ? null
    : !lease.id || lease.status === 'draft' ? { title: 'Lease preparation pending', detail: 'Your rental team is preparing the saved agreement.', section: 'lease' }
    : signers.some(signer => signer.status !== 'signed') ? { title: 'Signed copies still required', detail: 'Your rental team is waiting for the remaining signed agreement copies.', section: 'lease' }
    : readiness.some(item => !['verified', 'waived'].includes(item.status)) ? { title: 'Move-in payments awaiting verification', detail: 'Your rental team still needs to verify the required payment evidence.', section: 'payments' }
    : inspection.status !== 'completed' ? { title: 'Incoming inspection and handover pending', detail: 'The incoming handover must be completed before your tenancy is activated.', section: 'inspections' }
    : { title: 'Tenancy activation pending', detail: 'Your rental team will confirm activation after reviewing the saved move-in records.', section: 'lease' }
  const view = {
    tenancy: { id: tenancy.id, status: tenancy.status, occupationDate: tenancy.intended_occupation_date || null, tenantName: [identity.firstName, identity.lastName].filter(Boolean).join(' ') || 'Tenant' },
    property: { name: property.name, addressLine1: property.address_line_1, suburb: property.suburb, city: property.city, unitLabel: unit.unit_label },
    lease: { status: lease.status, versionNumber: version.version_number || null, monthlyRent: version.monthly_rent ?? terms.monthly_rent ?? null, depositAmount: version.deposit_amount ?? terms.deposit_amount ?? null, leaseTermMonths: terms.lease_term_months ?? null, occupationDate: version.occupation_date || terms.occupation_date || terms.intended_occupation_date || tenancy.intended_occupation_date || null, startsOn: version.effective_start_date || terms.lease_start_date || null, endsOn: version.effective_end_date || terms.lease_end_date || null },
    journey: { tenancyStatus: tenancy.status, leaseStatus: lease.status || 'not_prepared', signatures: signers.map(({ id, signer_role, status, signed_at }) => ({ id, role: signer_role, status, signedAt: signed_at })), payments: readiness.map(({ id, obligation_type, required_amount, received_amount, status }) => ({ id, type: obligation_type, requiredAmount: required_amount, receivedAmount: received_amount, status })), handover: { status: inspection.status || 'not_started', scheduledFor: inspection.scheduled_for || null, completedAt: inspection.completed_at || null, acknowledgedAt: inspection.acknowledged_at || null, completedItems: inspectionItems.filter(item => ['completed', 'waived'].includes(item.status)).length, totalItems: inspectionItems.length } },
    documents: publicRentalPortalDocuments(documents),
    attention: nextStep ? [{ id: 'move-in-progress', type: 'rental_progress', ...nextStep }] : [],
    inspections: inspection.id ? [{ id: inspection.id, title: 'Incoming inspection and handover', startsAt: inspection.scheduled_for, status: inspection.status, summary: `${inspectionItems.filter(item => ['completed', 'waived'].includes(item.status)).length} of ${inspectionItems.length} handover items complete.`, reportAvailable: documents.some(document => document.category === 'inspections') }] : [],
  }
  return { view, documents }
}
