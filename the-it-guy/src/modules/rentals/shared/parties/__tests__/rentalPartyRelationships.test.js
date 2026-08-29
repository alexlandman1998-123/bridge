import assert from 'node:assert/strict'
import {
  RENTAL_PARTY_RELATIONSHIP_ENTITIES, RENTAL_PARTY_ROLES, assertNoDuplicateActiveRentalPartyRelationship,
  buildRentalPartyRlsContract, createRentalPartyRelationship, createRentalPartyWorkflowSnapshot,
} from '../rentalPartyRelationships.js'

const landlord = createRentalPartyRelationship({ organisationId: 'org-1', partyId: 'party-1', role: RENTAL_PARTY_ROLES.landlord, entityType: RENTAL_PARTY_RELATIONSHIP_ENTITIES.property, entityId: 'property-1' })
const tenant = createRentalPartyRelationship({ organisationId: 'org-1', partyId: 'party-1', role: RENTAL_PARTY_ROLES.tenant, entityType: RENTAL_PARTY_RELATIONSHIP_ENTITIES.tenancy, entityId: 'tenancy-1' })
assert.notEqual(landlord.relationshipKey, tenant.relationshipKey, 'one canonical party may safely hold multiple rental roles')
assert.throws(() => assertNoDuplicateActiveRentalPartyRelationship([landlord], landlord), /active relationship already exists/)
assert.equal(assertNoDuplicateActiveRentalPartyRelationship([landlord], tenant), true)

const party = { id: 'party-1', organisationId: 'org-1', displayName: 'Alex Tenant', email: 'alex@example.test', phone: '0820000000', updatedAt: 'v1' }
const snapshot = createRentalPartyWorkflowSnapshot({ relationship: tenant, party, capturedAt: '2026-08-29T12:00:00.000Z' })
party.displayName = 'Changed in CRM'
assert.equal(snapshot.identity.displayName, 'Alex Tenant', 'workflow snapshots must be immutable copies')
assert.equal(Object.isFrozen(snapshot), true)
assert.throws(() => createRentalPartyWorkflowSnapshot({ relationship: tenant, party: { ...party, organisationId: 'other-org' } }), /relationship organisation/)
assert.throws(() => createRentalPartyRelationship({ organisationId: 'org-1', partyId: 'party-1', role: RENTAL_PARTY_ROLES.applicant, entityType: RENTAL_PARTY_RELATIONSHIP_ENTITIES.property, entityId: 'property-1' }), /cannot be attached/)

const snapshotRls = buildRentalPartyRlsContract('rental_party_workflow_snapshots')
assert.match(snapshotRls.rules.join(' '), /insert-only/)
assert.equal(buildRentalPartyRlsContract('private_listings'), null)
console.log('Rental party relationship tests passed.')
