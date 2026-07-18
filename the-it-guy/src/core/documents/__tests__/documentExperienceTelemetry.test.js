import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentExperienceTelemetryEvent } from '../documentExperienceTelemetry.js'

test('builds a coarse role and journey event', () => {
  const event = buildDocumentExperienceTelemetryEvent({ eventName: 'journey_viewed', surface: 'signer_portal', role: 'purchaser_1', packetType: 'otp', state: 'viewed', viewport: 'mobile' })
  assert.equal(event.eventName, 'document_experience_journey_viewed')
  assert.equal(event.audience, 'buyer')
  assert.equal(event.viewport, 'mobile')
})

test('accepts only the explicit document experience event catalog', () => {
  assert.equal(buildDocumentExperienceTelemetryEvent({ eventName: 'document_text_copied' }), null)
})

test('normalises action and outcome categories without arbitrary metadata', () => {
  const event = buildDocumentExperienceTelemetryEvent({ eventName: 'outcome_shown', actionId: 'Send Document!', category: 'Sent', role: 'attorney' })
  assert.equal(event.actionId, 'send_document')
  assert.equal(event.category, 'sent')
  assert.deepEqual(Object.keys(event).sort(), ['actionId', 'audience', 'category', 'contract', 'eventName', 'packetType', 'severity', 'state', 'surface', 'viewport'].sort())
})

test('does not carry names, emails, links, tokens, content or record ids', () => {
  const event = buildDocumentExperienceTelemetryEvent({ eventName: 'primary_action_selected', role: 'seller', packetType: 'mandate', state: 'token=secret', actionId: 'next_field', category: 'jane@example.test', name: 'Jane', email: 'jane@example.test', token: 'secret', documentText: 'private', packetId: 'record-id' })
  const evidence = JSON.stringify(event)
  assert.doesNotMatch(evidence, /Jane|jane@|secret|private|record-id|packetId|documentText/)
  assert.equal(event.state, 'unknown')
  assert.equal(event.category, null)
})
