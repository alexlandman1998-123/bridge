import assert from 'node:assert/strict'
import { getCanonicalLegalWorkflowProgressPercent } from '../legalWorkflowProgress.js'

const steps = [
  { status: 'completed' },
  { status: 'in_progress' },
  { status: 'not_started' },
  { status: 'not_started' },
]

assert.equal(getCanonicalLegalWorkflowProgressPercent({ steps }), 25)
assert.equal(getCanonicalLegalWorkflowProgressPercent({ lane: { summary: { completionPercent: 50 } }, steps }), 25)
assert.equal(getCanonicalLegalWorkflowProgressPercent({ lane: { summary: { completionPercent: 150 } } }), 100)
assert.equal(getCanonicalLegalWorkflowProgressPercent({ lane: { summary: { completionPercent: -1 } } }), 0)
assert.equal(getCanonicalLegalWorkflowProgressPercent({ steps: [{ displayStatus: 'completed' }] }), 0)
assert.equal(
  getCanonicalLegalWorkflowProgressPercent({
    lane: { summary: { completionPercent: 75 } },
    steps,
    workflowPlan: { status: 'active' },
  }),
  25,
)

console.log('Canonical legal workflow progress checks passed.')
