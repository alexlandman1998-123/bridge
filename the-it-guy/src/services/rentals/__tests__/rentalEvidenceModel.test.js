import assert from 'node:assert/strict'
import { RENTAL_ACTIVITY_PAYLOAD_MAX_BYTES, createRentalActivityProjection, createRentalDocumentLinkPayload } from '../rentalEvidenceModel.js'
const link = createRentalDocumentLinkPayload({ organisationId: 'org-1', propertyId: 'property-1', entityType: 'rental_property', entityId: 'property-1', documentId: 'document-1', documentLabel: 'Mandate' })
assert.equal(link.link_state, 'linked')
const projection = createRentalActivityProjection({ sourceEventId: 'event-1', organisationId: 'org-1', propertyId: 'property-1', entityType: 'rental_property', entityId: 'property-1', activityType: 'mandate_linked', title: 'Mandate linked' })
assert.equal(projection.title, 'Mandate linked')
assert.throws(() => createRentalActivityProjection({ sourceEventId: 'event-2', organisationId: 'org-1', propertyId: 'property-1', entityType: 'rental_property', entityId: 'property-1', activityType: 'oversized', title: 'Oversized', payload: { data: 'x'.repeat(RENTAL_ACTIVITY_PAYLOAD_MAX_BYTES) } }))
console.log('Rental evidence model tests passed.')
