import assert from 'node:assert/strict'
import { getCanonicalLegalWorkflowProgressPercent } from '../legalWorkflowProgress.js'

const steps = [
  { displayStatus: 'completed' },
  { displayStatus: 'in_progress' },
  { displayStatus: 'not_started' },
  { displayStatus: 'not_started' },
]

assert.equal(getCanonicalLegalWorkflowProgressPercent({ steps }), 25)
assert.equal(getCanonicalLegalWorkflowProgressPercent({ lane: { summary: { completionPercent: 50 } }, steps }), 50)
assert.equal(getCanonicalLegalWorkflowProgressPercent({ lane: { summary: { completionPercent: 150 } }, steps }), 100)
assert.equal(getCanonicalLegalWorkflowProgressPercent({ lane: { summary: { completionPercent: -1 } }, steps }), 0)
assert.equal(
  getCanonicalLegalWorkflowProgressPercent({
    lane: { summary: { completionPercent: 75 } },
    steps,
    workflowPlan: { status: 'active' },
  }),
  25,
)

console.log('Canonical legal workflow progress checks passed.')
