import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { projectSharedMatterJourneyRead } from '../src/services/sharedMatterJourneyReader.js'
import { evaluateHighLevelJourney } from '../src/core/transactions/highLevelJourneyRules.js'
import { buildTransactionJourneyPresentation } from '../src/core/transactions/transactionJourneyPresentation.js'

const keys = { transfer: ['lodgement_ready', 'lodged_at_deeds_office', 'registered'],
  bond: ['bond_lodgement_ready', 'bond_lodged', 'bond_registered'],
  cancellation: ['cancellation_lodgement_ready', 'cancellation_lodged', 'cancellation_registered'] }
const source = { schemaVersion: 1, transactionId: 'matter', revision: 3, planRevision: 3,
  planStatus: 'active', requiredLaneKeys: Object.keys(keys),
  lanes: Object.entries(keys).map(([key, tasks]) => ({ key, phases: [{ key: 'legal',
    label: 'Legal work', clientLabel: 'Legal work', tasks: tasks.map(key => ({ key,
      label: key, clientLabel: key, status: 'completed', revision: 3, privateNote: 'SECRET' })) }] })) }
const commercial = evaluateHighLevelJourney({ financeType: 'cash', workflows: {
  sales_otp: { requiredSteps: [{ key: 'signed_otp_received', status: 'completed' }] },
  finance_cash: { requiredSteps: ['proof_of_funds_reviewed', 'cash_confirmation_approved'].map(key => ({ key, status: 'completed' })) },
} })
const modelFor = (input, highLevelJourney = commercial) => buildTransactionJourneyPresentation({ snapshot: {
  transactionId: 'matter', highLevelJourney,
  legalJourney: { status: 'ready', snapshot: projectSharedMatterJourneyRead(input) },
} })
const complete = modelFor(source)
assert.deepEqual(complete.steps.map(s => s.status), Array(5).fill('complete'))
assert.equal(complete.progressPercent, null)
const reopened = structuredClone(source)
reopened.lanes[1].phases[0].tasks[2].status = 'not_started'
const changed = modelFor(reopened)
assert.equal(changed.steps[4].isComplete, false)
assert.equal(changed.steps[4].status, 'in_progress')
for (const mutate of [s => { s.planStatus = 'draft' }, s => { delete s.requiredLaneKeys },
  s => { s.requiredLaneKeys.push('bond') }, s => { s.lanes.pop() },
  s => { s.transactionId = 'another-matter' }, s => { s.planRevision = 2 },
  s => { s.lanes[0].phases[0].tasks[0].revision = 2 }]) {
  const bad = structuredClone(source); mutate(bad)
  assert.deepEqual(modelFor(bad).steps.slice(2).map(s => s.status), Array(3).fill('unknown'))
}
const restricted = modelFor(source, null)
assert.deepEqual(restricted.steps.slice(0, 2).map(s => s.status), ['unknown', 'unknown'])
assert.deepEqual(restricted.steps.slice(2).map(s => s.status), Array(3).fill('complete'))
const sharedFacts = { ...structuredClone(source), commercialFacts: { version: 1, revision: 3, financeType: 'cash', steps: [
  { workflowKey: 'sales_otp', key: 'signed_otp_received', status: 'completed', privateNote: 'SECRET' },
  ...['proof_of_funds_reviewed','cash_confirmation_approved'].map(key => ({ workflowKey: 'finance_cash', key, status: 'completed' })),
] } }
assert.deepEqual(modelFor(sharedFacts, null).steps.map(s => s.status), Array(5).fill('complete'))
assert.doesNotMatch(JSON.stringify(projectSharedMatterJourneyRead(sharedFacts)), /SECRET/)
sharedFacts.commercialFacts.steps[0].status = 'not_started'
assert.equal(modelFor(sharedFacts).steps[0].status, 'pending', 'Shared facts override older completed rollup')
sharedFacts.commercialFacts.revision = 2
assert.deepEqual(modelFor(sharedFacts).steps.slice(0,2).map(s => s.status), ['unknown','unknown'])
const server = await createServer({ configFile: false, envFile: false, logLevel: 'silent', esbuild: { jsx: 'automatic' }, server: { middlewareMode: true } })
try {
  const { default: Tracker } = await server.ssrLoadModule('/src/components/transaction/TransactionJourneyTracker.jsx')
  for (const audience of ['attorney', 'agent', 'developer', 'buyer', 'seller']) {
    const html = renderToStaticMarkup(createElement(Tracker, { model: changed, audience }))
    assert.equal((html.match(/data-milestone=/g) || []).length, 5)
    assert.match(html, /data-milestone="registration" data-milestone-status="in_progress"/)
    assert.doesNotMatch(html, /data-task-id=|SECRET|<button|% complete/)
    const detail = renderToStaticMarkup(createElement(Tracker, { model: changed, audience, variant: 'detailed' }))
    assert.equal((detail.match(/data-task-id=/g) || []).length, 9)
    assert.match(detail, /bond_registered/)
    assert.doesNotMatch(detail, /SECRET/)
  }
  console.log('Five audiences: summary/detail parity, reopening, restricted facts, active-plan and revision guards PASS')
} finally { await server.close() }
