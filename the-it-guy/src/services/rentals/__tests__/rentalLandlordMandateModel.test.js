import assert from 'node:assert/strict'
import { createRentalPropertyLandlordPayload, createRentalPropertyMandatePayload, mapRentalPropertyMarketingReadiness, validateRentalPropertyLandlord, validateRentalPropertyMandate } from '../rentalLandlordMandateModel.js'
const landlord = createRentalPropertyLandlordPayload({ organisationId: 'org-1', propertyId: 'property-1', partyId: 'party-1', ownershipShare: 50, primaryContact: true })
assert.equal(landlord.ownership_share, 50); assert.equal(landlord.is_primary_contact, true)
assert.equal(validateRentalPropertyLandlord({ organisationId: 'org-1', propertyId: 'property-1', partyId: 'party-1', ownershipShare: 101 }).valid, false)
const mandate = createRentalPropertyMandatePayload({ organisationId: 'org-1', propertyId: 'property-1', mandateStatus: 'active', authorityStatus: 'confirmed', startsOn: '2026-01-01', managementFeeType: 'percentage', managementFeeAmount: 8 })
assert.equal(mandate.authority_status, 'confirmed'); assert.equal(validateRentalPropertyMandate({ organisationId: 'org-1', propertyId: 'property-1', managementFeeType: 'percentage', managementFeeAmount: 101 }).valid, false)
assert.equal(mapRentalPropertyMarketingReadiness({ property_id: 'property-1', active_landlord_count: '2', has_primary_contact: true, active_ownership_share: '100', has_active_mandate: true, marketing_ready: true }).marketingReady, true)
console.log('Rental landlord and mandate model tests passed.')
