import assert from 'node:assert/strict'
import { createRentalCrmLeadMetadata, getRentalCrmLeadMetadata, isRentalCrmLead, patchRentalCrmLeadMetadata } from '../rentalCrmLeadModel.js'

const created = createRentalCrmLeadMetadata({ organisationId: 'org-1', role: 'landlord', stage: 'new', relationships: { propertyId: 'property-1' }, consents: { privacy: true }, qualification: { expectedMonthlyRent: 18000 } })
assert.equal(created.leadType, 'rental')
assert.equal(created.role, 'landlord')
assert.equal(created.relationships.propertyId, 'property-1')
assert.equal(created.consents.privacy, 'granted')
assert.equal(created.qualification.expectedMonthlyRent, 18000)
assert.equal(created.relationships.listingId, null)
const patched = patchRentalCrmLeadMetadata(created, { stage: 'mandate_signed', relationships: { mandateId: 'mandate-1', listingId: 'listing-1' }, consents: { screening: 'granted' } })
assert.equal(patched.stage, 'mandate_signed')
assert.equal(patched.relationships.mandateId, 'mandate-1')
assert.equal(patched.relationships.listingId, 'listing-1')
assert.equal(patched.consents.screening, 'granted')
const legacy = getRentalCrmLeadMetadata({ rawEnquiryPayload: { arch9RentalLead: true, classification: 'rental', role: 'tenant', stage: 'viewing', desiredArea: 'Sea Point' } })
assert.equal(legacy.stage, 'viewing')
assert.equal(isRentalCrmLead({ rawEnquiryPayload: legacy }), true)
console.log('Rental CRM lead model tests passed.')
