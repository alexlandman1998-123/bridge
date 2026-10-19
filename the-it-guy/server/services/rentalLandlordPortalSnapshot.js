import { loadRentalTenantPortalSnapshot } from './rentalTenantPortalSnapshot.js'
import { loadRentalPortalMaintenance } from './rentalPortalMaintenance.js'
import { loadRentalPortalBranding } from './rentalPortalBranding.js'
import { loadRentalLandlordOverview, loadRentalOverviewRows } from './rentalLandlordOverview.js'

// Both portal access paths expose the same saved property state. Supplier
// payloads, CRM notes and applicant information remain agent-only.
export async function loadRentalLandlordPortalSnapshot(db, propertyId, organisationId) {
  const [mandates, units, documents, listings, vacancies, tenancies, maintenanceRequests, branding] = await Promise.all([
    db.from('rental_property_mandates').select('id, mandate_status, authority_status, starts_on, ends_on, management_fee_type, management_fee_amount').eq('property_id', propertyId).eq('organisation_id', organisationId).order('created_at', { ascending: false }).limit(1),
    loadRentalOverviewRows(() => db.from('rental_units').select('id, unit_label, status, target_rent, bedrooms, bathrooms').eq('property_id', propertyId).eq('organisation_id', organisationId)).then(data => ({ data })),
    db.from('rental_entity_documents').select('id, document_label, document_category, created_at').eq('property_id', propertyId).eq('organisation_id', organisationId).eq('link_state', 'linked').order('created_at', { ascending: false }).limit(20),
    db.from('private_listings').select('id,title,listing_status,listing_visibility,rental_unit_id,rental_vacancy_id').eq('rental_property_id', propertyId).eq('organisation_id', organisationId).eq('listing_category', 'rental').order('updated_at', { ascending: false }).limit(50),
    db.from('rental_vacancies').select('id,unit_id,status,available_from,asking_rent').eq('property_id', propertyId).eq('organisation_id', organisationId).order('updated_at', { ascending: false }).limit(50),
    loadRentalOverviewRows(() => db.from('rental_tenancies').select('id,organisation_id,property_id,unit_id,status,intended_occupation_date').eq('property_id', propertyId).eq('organisation_id', organisationId)).then(data => ({ data })),
    loadRentalPortalMaintenance(db, { propertyId, organisationId, audience: 'landlord' }),
    loadRentalPortalBranding(db, organisationId),
  ])
  const error = [mandates, units, documents, listings, vacancies, tenancies].find(result => result.error)?.error
  if (error) throw error
  const saved = await Promise.all((tenancies.data || []).map(tenancy => loadRentalTenantPortalSnapshot(db, tenancy)))
  const fileAccess = saved.flatMap(snapshot => snapshot.documents)
  const leaseDocuments = saved.flatMap((snapshot, index) => snapshot.view.documents.map(document => ({ ...document, tenancyId: tenancies.data[index].id, unitLabel: snapshot.view.property.unitLabel })))
  const portalTenancies = saved.map((snapshot, index) => ({ id: tenancies.data[index].id, unitId: tenancies.data[index].unit_id, unitLabel: snapshot.view.property.unitLabel, status: snapshot.view.tenancy.status, lease: snapshot.view.lease, journey: snapshot.view.journey }))
  const portfolio = await loadRentalLandlordOverview(db, organisationId, units.data || [], portalTenancies)
  return {
    branding, portfolio,
    mandate: mandates.data?.[0] || null, units: units.data || [],
    documents: (documents.data || []).map(document => ({ ...document, label: document.document_label, category: 'property', available: false })),
    leaseDocuments, fileAccess, listings: listings.data || [], vacancies: vacancies.data || [], maintenanceRequests,
    tenancies: portalTenancies,
  }
}
