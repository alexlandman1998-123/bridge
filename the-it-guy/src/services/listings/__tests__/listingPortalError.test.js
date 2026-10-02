import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeListingPortalError } from '../listingChannelUpdateState.js'
import { deriveListingPublicationStates } from '../listingPublicationState.js'

test('SOAP feature rejection has a short explanation without exposing the stack trace', () => {
  const error = `<soap:Text>System.InvalidOperationException: Instance validation error: 'Jacuzzi' is not a valid value for AttributeType. at Microsoft.Xml.Serialization.GeneratedAssembly</soap:Text>`
  assert.match(summarizeListingPortalError(error), /feature code “Jacuzzi”/)
  assert.doesNotMatch(summarizeListingPortalError(error), /soap|Microsoft|System\./)
  assert.match(summarizeListingPortalError(error), /latest saved listing/)
})

test('useful field errors stay readable and long errors stay bounded', () => {
  const error = 'Property24 rejected this request: Agent does not belong to the agency.'
  assert.equal(summarizeListingPortalError(error), error)
  assert.ok(summarizeListingPortalError('x'.repeat(1000)).length <= 240)
  assert.equal(summarizeListingPortalError(''), '')
})

test('failed submission retains its timestamp and a subsequent acceptance clears the failure', () => {
  const failure = { activity_type: 'listing_channel_publication_failed', created_at: '2026-10-01T08:00:00Z', metadata: { channel: 'Private Property', error: 'Rejected feature' } }
  const state = deriveListingPublicationStates([failure]).private_property
  assert.equal(state.stage, 'failed')
  assert.equal(state.failedAt, failure.created_at)
  const acceptance = { activity_type: 'listing_channel_publication_accepted', created_at: '2026-10-01T08:05:00Z', metadata: { channel: 'Private Property' } }
  const recovered = deriveListingPublicationStates([failure, acceptance]).private_property
  assert.equal(recovered.stage, 'accepted')
  assert.equal(recovered.failedAt, '')
})
