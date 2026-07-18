import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentJourneyProgress } from '../documentJourneyProgress.js'

test('maps the workspace lifecycle onto five stable stages', () => {
  const journey = buildDocumentJourneyProgress({ surface: 'workspace', state: 'ready_to_send' })
  assert.equal(journey.stages.length, 5)
  assert.equal(journey.stages[2].id, 'setup')
  assert.equal(journey.stages[2].isCurrent, true)
  assert.equal(journey.stages[0].status, 'complete')
})

test('keeps signer collection current while signatures are outstanding', () => {
  const journey = buildDocumentJourneyProgress({ surface: 'workspace', state: 'partially_signed' })
  assert.equal(journey.stages[3].id, 'signing')
  assert.equal(journey.progressPercent, 75)
})

test('marks signing attention without moving the journey backwards', () => {
  const journey = buildDocumentJourneyProgress({ surface: 'workspace', state: 'attention_required' })
  assert.equal(journey.stages[3].status, 'attention')
})

test('gives external signers a focused three-step journey', () => {
  const journey = buildDocumentJourneyProgress({ surface: 'signer_portal', signerStatus: 'viewed', requiredFields: 4, completedFields: 2 })
  assert.deepEqual(journey.stages.map((stage) => stage.id), ['review', 'fields', 'submit'])
  assert.equal(journey.stages[1].isCurrent, true)
})

test('reports one hundred percent only when the relevant journey is complete', () => {
  assert.equal(buildDocumentJourneyProgress({ surface: 'workspace', state: 'publishing' }).progressPercent, 90)
  assert.equal(buildDocumentJourneyProgress({ surface: 'workspace', state: 'publishing' }).completed, false)
  assert.equal(buildDocumentJourneyProgress({ surface: 'signer_portal', signerStatus: 'signed' }).progressPercent, 100)
})
