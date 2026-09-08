import assert from 'node:assert/strict'
import { buildSharedMatterJourney, presentSharedMatterJourney, journeyTaskId, JOURNEY_AUDIENCES, JOURNEY_TASK_STATUSES } from '../src/core/transactions/sharedMatterJourneyContract.js'

const task = (key, status = 'not_started') => ({ key, status, label: `Attorney ${key}`, clientLabel: `Client ${key}`, revision: 1, outstandingEvidenceCount: 2, comment: 'PRIVATE NOTE', documentUrl: 'PRIVATE DOCUMENT' })
const lane = (key, tasks) => ({ key, phases: [{ key: 'instruction', label: 'Legal instruction', clientLabel: 'Getting started', tasks }] })
const input = { transactionId: 'matter:1', revision: 4, planRevision: 2,
  lanes: [lane('transfer', [task('instruction_received'), task('fica', 'completed')]), lane('bond', [task('instruction_received', 'not_applicable')])],
  overallJourney: { percent: 12, source: 'transaction-journey-snapshot', revision: 4 } }
const journey = buildSharedMatterJourney(input)
assert.equal(journey.legalProgress.percent, 50)
assert.equal(journey.overallJourney.percent, 12)
assert.equal(journey.lanes[1].progress.percent, null, 'all-N/A is not zero or 100 percent')
assert.equal(journey.lanes[0].phases[0].tasks[0].outstandingEvidenceCount, 2)
assert.notEqual(journeyTaskId('matter', 'transfer', 'instruction_received'), journeyTaskId('matter', 'bond', 'instruction_received'))
assert.notEqual(journeyTaskId('a:b', 'transfer', 'c'), journeyTaskId('a', 'transfer', 'b:c'))
const semantics = view => view.lanes.flatMap(l => l.phases.flatMap(p => p.tasks.map(t => [t.id, t.phaseKey, t.status, t.revision])))
for (const audience of JOURNEY_AUDIENCES) {
  const view = presentSharedMatterJourney(journey, audience)
  assert.deepEqual(semantics(view), semantics(journey))
  assert.deepEqual(view.legalProgress, journey.legalProgress)
  assert.equal(view.revision, 4)
  assert.doesNotMatch(JSON.stringify(view), /PRIVATE|outstandingEvidenceCount|clientLabel/)
  assert.equal(view.lanes[0].phases[0].tasks[0].label, ['buyer', 'seller'].includes(audience) ? 'Client instruction_received' : 'Attorney instruction_received')
}
for (const status of JOURNEY_TASK_STATUSES) {
  const next = buildSharedMatterJourney({ ...input, lanes: [lane('transfer', [task('instruction_received', status)])] })
  assert.equal(next.legalProgress.percent, status === 'not_applicable' ? null : ['completed', 'completed_externally'].includes(status) ? 100 : 0)
  assert.equal(next.lanes[0].phases[0].tasks[0].outstandingEvidenceCount, 2)
  assert.equal(next.lanes[0].phases[0].tasks[0].id, journey.lanes[0].phases[0].tasks[0].id)
}
assert.equal(buildSharedMatterJourney({ ...input, lanes: [] }).legalProgress.percent, null)
assert.throws(() => buildSharedMatterJourney({ ...input, lanes: [lane('transfer', [task('x'), task('x')])] }), /Duplicate/)
assert.throws(() => buildSharedMatterJourney({ ...input, lanes: [lane('unknown', [])] }), /Unknown/)
assert.throws(() => buildSharedMatterJourney({ ...input, lanes: [lane('transfer', [task('x', 'reopened')])] }), /Unknown task status/)
assert.throws(() => buildSharedMatterJourney({ ...input, revision: -1 }), /revision/)
assert.throws(() => presentSharedMatterJourney(journey, 'public'), /Unknown/)
assert.throws(() => presentSharedMatterJourney({ ...journey, schemaVersion: 2 }, 'buyer'), /Unsupported/)
assert.equal(Object.isFrozen(journey.lanes[0].phases[0].tasks[0]), true)
assert.equal(Object.isFrozen(input), false, 'caller input must not be frozen')
console.log('Shared matter journey v1: identity, statuses, progress scopes, audience parity, privacy and validation passed')
