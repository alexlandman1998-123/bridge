import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBuyerJourneyPresentationModel } from '../buyerJourneyPresentationModel.js'

test('normalizes workflow vocabulary into one complete/current/upcoming contract', () => {
  const model = buildBuyerJourneyPresentationModel({
    steps: [
      { id: 'offer', title: 'Offer', state: 'completed' },
      { id: 'finance', label: 'Finance', status: 'blocked', description: 'Upload a payslip.' },
      { id: 'transfer', label: 'Transfer', status: 'pending' },
    ],
    source: 'production',
  })

  assert.deepEqual(model.steps.map((step) => step.status), ['complete', 'current', 'upcoming'])
  assert.equal(model.currentStepId, 'finance')
  assert.equal(model.currentStep.isBlocked, true)
  assert.equal(model.nextStep.id, 'transfer')
  assert.equal(model.progressPercent, 33)
  assert.equal(model.source, 'production')
})
test('honours the workflow current step and prevents multiple current stages', () => {
  const model = buildBuyerJourneyPresentationModel({
    steps: [
      { id: 'one', label: 'One', status: 'active' },
      { id: 'two', label: 'Two', status: 'current' },
      { id: 'three', label: 'Three' },
    ],
    currentStepId: 'two',
    progressPercent: 140,
  })

  assert.deepEqual(model.steps.map((step) => step.status), ['upcoming', 'current', 'upcoming'])
  assert.equal(model.progressPercent, 100)
  assert.equal(model.statusLabel, '100% complete')
})

test('falls forward to the first incomplete step and handles completed journeys', () => {
  const fallback = buildBuyerJourneyPresentationModel({
    steps: [
      { id: 'one', label: 'One', status: 'complete' },
      { id: 'two', label: 'Two' },
    ],
  })
  const complete = buildBuyerJourneyPresentationModel({
    steps: [
      { id: 'one', label: 'One', status: 'done' },
      { id: 'two', label: 'Two', status: 'registered' },
    ],
  })

  assert.equal(fallback.currentStepId, 'two')
  assert.equal(complete.currentStepId, null)
  assert.equal(complete.progressPercent, 100)
  assert.equal(complete.isComplete, true)
})

test('is safe for absent or malformed step collections', () => {
  const model = buildBuyerJourneyPresentationModel({ steps: null, progressPercent: 'not-a-number' })

  assert.deepEqual(model.steps, [])
  assert.equal(model.progressPercent, 0)
  assert.equal(model.currentStageLabel, 'Current step')
})
