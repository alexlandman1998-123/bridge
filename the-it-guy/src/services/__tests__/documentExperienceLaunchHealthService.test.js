import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateDocumentExperienceLaunchHealth, mapDocumentExperienceTelemetryRows } from '../documentExperienceLaunchHealthService.js'

test('maps only the privacy-safe launch evidence columns', () => {
  const rows = mapDocumentExperienceTelemetryRows([{ id: 'event-id', user_id: 'user-id', route: '/secret/token', event_name: 'document_experience_journey_viewed', severity: 'info', created_at: '2026-07-18T00:00:00Z', metadata: { surface: 'workspace' } }])
  assert.deepEqual(Object.keys(rows[0]).sort(), ['created_at', 'event_name', 'metadata', 'severity'].sort())
  assert.doesNotMatch(JSON.stringify(rows), /event-id|user-id|secret\/token/)
})

test('evaluates persisted and browser-only evidence through one operational gate', async () => {
  const persisted = [
    { event_name: 'document_experience_journey_viewed', metadata: { surface: 'workspace', audience: 'principal', packetType: 'mandate', viewport: 'desktop' } },
    { event_name: 'document_experience_journey_viewed', metadata: { surface: 'workspace', audience: 'agent', packetType: 'otp', viewport: 'mobile' } },
    { event_name: 'document_experience_journey_viewed', metadata: { surface: 'workspace', audience: 'attorney', packetType: 'mandate', viewport: 'desktop' } },
    { event_name: 'document_experience_primary_action_selected', metadata: { surface: 'workspace', audience: 'agent', packetType: 'mandate', viewport: 'desktop' } },
  ]
  const browserEvents = [
    { eventName: 'document_experience_journey_viewed', surface: 'signer_portal', audience: 'seller', packetType: 'mandate', viewport: 'mobile' },
    { eventName: 'document_experience_journey_viewed', surface: 'signer_portal', audience: 'buyer', packetType: 'otp', viewport: 'desktop' },
  ]
  const result = await evaluateDocumentExperienceLaunchHealth({
    n1: { ready: true, status: 'READY_FOR_N2' },
    n2: { ready: true, status: 'READY_FOR_N3' },
    browserEvents,
    evidenceLoader: async () => ({ available: true, events: persisted }),
  })
  assert.equal(result.status, 'READY_FOR_CONTROLLED_ROLLOUT')
})
