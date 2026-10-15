import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requireRentalLeadHandoff } from '../rentalLeadHandoffModel.js'

const tenant = { id: 'lead-1', role: 'tenant' }
const landlord = { id: 'lead-2', role: 'landlord' }
const viewing = { id: 'view-1', tenantLeadId: 'lead-1', startsAt: '2026-09-27T10:00:00Z', outcome: '' }
const application = { id: 'app-1', leadId: 'lead-1', vacancyId: 'vacancy-1', unitId: 'unit-1', status: 'draft' }
const mandate = { id: 'mandate-1', organisationId: 'org-1', propertyId: 'property-1', mandateStatus: 'active', authorityStatus: 'confirmed', raw: { metadata_json: { leadId: 'lead-2', signedEvidenceReference: 'signed-1', signedAt: '2026-09-26T10:00:00Z' } } }

test('viewing stages require the linked appointment and an attended outcome', () => {
  assert.throws(() => requireRentalLeadHandoff(tenant, 'viewing_scheduled', { viewings: [] }), /Schedule a viewing/)
  assert.equal(requireRentalLeadHandoff(tenant, 'viewing_scheduled', { viewings: [viewing] }).evidence.viewingId, 'view-1')
  assert.throws(() => requireRentalLeadHandoff(tenant,'viewing_scheduled',{viewings:[{...viewing,outcome:'cancelled'}]}),/Schedule a viewing/)
  assert.throws(() => requireRentalLeadHandoff(tenant, 'viewing_completed', { viewings: [viewing] }), /attended viewing/)
  assert.equal(requireRentalLeadHandoff(tenant, 'viewing_completed', { viewings: [{ ...viewing, outcome: 'attended' }] }).evidence.viewingOutcome, 'attended')
})

test('an applicant link remains pending until its linked application is submitted', () => {
  assert.throws(() => requireRentalLeadHandoff(tenant, 'application_submitted', { applications: [application] }), /must submit/)
  assert.equal(requireRentalLeadHandoff(tenant, 'application_submitted', { applications: [{ ...application, status: 'submitted' }] }).relationships.applicationId, 'app-1')
  assert.throws(() => requireRentalLeadHandoff(tenant, 'application_submitted', { applications: [{ ...application, leadId: 'another', status: 'submitted' }] }), /must submit/)
})

test('mandate and listing readiness require this landlord lead signed mandate', () => {
  assert.throws(() => requireRentalLeadHandoff(landlord, 'mandate_signed', { propertyId: 'property-1', mandates: [{ ...mandate, mandateStatus: 'draft' }] }), /signed mandate/)
  assert.equal(requireRentalLeadHandoff(landlord, 'mandate_signed', { propertyId: 'property-1', mandates: [mandate] }).relationships.mandateId, 'mandate-1')
  assert.throws(() => requireRentalLeadHandoff(landlord, 'mandate_signed', { propertyId: 'property-1', organisationId: 'other', mandates: [mandate] }), /signed mandate/)
  assert.throws(() => requireRentalLeadHandoff(landlord, 'listing_ready', { propertyId: 'another', mandates: [mandate] }), /signed mandate/)
})

test('listing completion requires the saved listing linked to this lead and organisation', () => {
  const linked = { ...landlord, relationships: { listingId: 'listing-1' } }
  assert.throws(() => requireRentalLeadHandoff(linked, 'listing_created', { organisationId: 'org-1' }), /Create and link/)
  assert.throws(() => requireRentalLeadHandoff(linked, 'listing_created', { organisationId: 'org-1', listing: { id: 'listing-1', organisationId: 'other' } }), /Create and link/)
  assert.equal(requireRentalLeadHandoff(linked, 'listing_created', { organisationId: 'org-1', listing: { id: 'listing-1', organisationId: 'org-1' } }).evidence.listingId, 'listing-1')
})

test('qualification must be saved and complete before its confirmation can advance the lead', () => {
  assert.throws(() => requireRentalLeadHandoff(tenant,'qualified'),/complete tenant qualification/)
  const qualification={monthlyBudget:0,desiredArea:'Montana',occupationDate:'2026-11-01',employmentStatus:'Student',depositAvailable:'No',screeningConsent:'No',propertyNeed:'Apartment',occupants:1,pets:'No pets',additionalNotes:'Guarantor discussed'}
  assert.equal(requireRentalLeadHandoff({...tenant,qualification},'qualified').evidence.qualificationComplete,true)
})

test('declined, foreign and differently linked applications cannot advance a tenant', () => {
  for(const saved of [{...application,status:'declined'},{...application,status:'submitted',organisationId:'foreign'}]) {
    assert.throws(() => requireRentalLeadHandoff(tenant,'screening_pending',{applications:[saved],organisationId:'org-1'}),/must submit/)
  }
  assert.throws(() => requireRentalLeadHandoff({...tenant,relationships:{applicationId:'different'}},'screening_pending',{applications:[{...application,status:'submitted'}]}),/must submit/)
})

test('screening and FICA use current subject-specific application review evidence', () => {
  const submittedAt='2026-10-14T08:00:00Z'
  const saved={...application,status:'under_review',submittedAt,data:{entity:{type:'individual'},people:[{id:'guarantor',role:'guarantor'}]}}
  const result={status:'passed',reviewedBy:'agent',evidenceNote:'Reviewed uploaded evidence',submissionAt:submittedAt,expiresAt:'2099-01-01'}
  const checks=['identity','affordability','employment','reference','fica'].map(checkType=>({id:`check-${checkType}`,checkType,applicationId:saved.id,result:{subjects:{primary:{...result},guarantor:{...result}}}}))
  assert.throws(() => requireRentalLeadHandoff(tenant,'fica_pending',{applications:[saved]}),/current identity review/)
  assert.equal(requireRentalLeadHandoff(tenant,'fica_pending',{applications:[saved],checks}).relationships.applicationId,saved.id)
  checks[4].result.subjects.guarantor.expiresAt='2000-01-01'
  assert.throws(() => requireRentalLeadHandoff(tenant,'fica_complete',{applications:[saved],checks}),/current fica review/)
  checks[4].result.subjects.guarantor.expiresAt='2099-01-01'
  checks[4].result.subjects.guarantor.submissionAt='2020-01-01T00:00:00Z'
  assert.throws(() => requireRentalLeadHandoff(tenant,'fica_complete',{applications:[saved],checks}),/current fica review/)
})

test('placement requires an approved application rather than a stage or free-text reference', () => {
  assert.throws(() => requireRentalLeadHandoff(tenant,'placement_ready',{applications:[{...application,status:'submitted'}]}),/Approve the linked application/)
  assert.equal(requireRentalLeadHandoff(tenant,'placement_ready',{applications:[{...application,status:'approved'}]}).relationships.applicationId,application.id)
})
