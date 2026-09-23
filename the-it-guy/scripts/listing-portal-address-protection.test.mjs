import assert from 'node:assert/strict'
import {
  buildListingAddressFingerprint,
  evaluateListingPortalAddressProtection,
} from '../server/services/listingPortalAddressProtectionService.js'
import { buildSyndicationChannelPreflight } from '../server/services/syndicationChannelPreflightService.js'

const originalListing = {
  street_number: '395',
  street_name: 'Paul Kruger Street',
  suburb: 'Capital Park',
  city: 'Pretoria',
  province: 'Gauteng',
  country: 'South Africa',
  postal_code: '0084',
}
const originalFingerprint = buildListingAddressFingerprint({ listing: originalListing })

assert.equal(
  originalFingerprint,
  buildListingAddressFingerprint({ listing: { ...originalListing, suburb: ' capital  park ' } }),
  'Formatting-only edits must not invalidate a portal location mapping.',
)

const movedListing = { ...originalListing, suburb: 'Bartlett', city: 'Boksburg' }
const protection = evaluateListingPortalAddressProtection({
  listing: {
    ...movedListing,
    property24AddressFingerprint: originalFingerprint,
    private_property_status: 'published',
    private_property_reference: 'PP-12345',
  },
  existingPrivatePropertySync: {
    private_property_ref: 'PP-12345',
    external_status: 'active',
    last_payload_summary: { addressFingerprint: originalFingerprint },
  },
})

assert.equal(protection.property24.addressChanged, true)
assert.equal(protection.property24.requiresExactCurrentLookup, true)
assert.ok(protection.property24.warnings.includes('property24_address_changed_requires_fresh_suburb_resolution'))
assert.equal(protection.privateProperty.activated, true)
assert.equal(protection.privateProperty.addressChanged, true)
assert.ok(protection.privateProperty.blockers.includes('private_property_activated_address_change_requires_manual_correction'))

const preflight = buildSyndicationChannelPreflight({
  listing: {
    ...movedListing,
    id: 'address-protection-1',
    property_type: 'House',
    asking_price: 2050000,
    property24AddressFingerprint: originalFingerprint,
    private_property_status: 'published',
    private_property_reference: 'PP-12345',
    privatePropertySync: {
      private_property_ref: 'PP-12345',
      external_status: 'active',
      last_payload_summary: { addressFingerprint: originalFingerprint },
    },
  },
  publication: {
    title: 'Five bedroom home',
    description: 'A complete description for portal publication.',
    bedrooms: 5,
    bathrooms: 4,
  },
})

assert.equal(preflight.channels.privateProperty.status, 'blocked')
assert.ok(preflight.channels.privateProperty.blockers.includes('private_property_activated_address_change_requires_manual_correction'))
assert.ok(preflight.channels.property24.warnings.includes('property24_address_changed_requires_fresh_suburb_resolution'))
assert.equal(preflight.channels.property24.mappedOutcome.requiresExactCurrentSuburbLookup, true)

const legacyActivated = evaluateListingPortalAddressProtection({
  listing: { ...originalListing, private_property_status: 'published', private_property_reference: 'PP-OLD' },
  existingPrivatePropertySync: { private_property_ref: 'PP-OLD', external_status: 'active' },
})
assert.ok(legacyActivated.privateProperty.warnings.includes('private_property_activated_address_baseline_missing_manual_confirmation'))
assert.equal(legacyActivated.privateProperty.blockers.length, 0)

console.log('Listing portal address-protection contract passed')
