import test from 'node:test'
import assert from 'node:assert/strict'
import { recordDocumentExperienceEvent } from '../documentExperienceTelemetryService.js'

test('persists an authenticated workspace event on a token-free route', async () => {
  let payload = null
  const result = await recordDocumentExperienceEvent({
    eventName: 'primary_action_selected',
    surface: 'workspace',
    role: 'agent',
    packetType: 'mandate',
    state: 'draft',
    actionId: 'edit_document',
    userId: 'user-id',
    workspaceId: 'workspace-id',
    transport: async (nextPayload) => {
      payload = nextPayload
      return { persisted: true }
    },
  })

  assert.equal(result.persisted, true)
  assert.equal(payload.route, '/document-experience')
  assert.equal(payload.category, 'document_experience')
  assert.deepEqual(Object.keys(payload.metadata).sort(), ['actionId', 'audience', 'category', 'contract', 'packetType', 'state', 'surface', 'viewport'].sort())
})

test('anonymous signer telemetry remains browser-only and never calls persistence', async () => {
  let persistenceCalls = 0
  const result = await recordDocumentExperienceEvent({
    eventName: 'journey_viewed',
    surface: 'signer_portal',
    role: 'seller',
    packetType: 'otp',
    state: 'viewed',
    transport: async () => {
      persistenceCalls += 1
      return { persisted: true }
    },
  })

  assert.equal(result.accepted, true)
  assert.equal(result.persisted, false)
  assert.equal(result.reason, 'anonymous_surface')
  assert.equal(persistenceCalls, 0)
})
