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
