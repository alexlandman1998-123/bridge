import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LEGAL_WORKSPACE_UX_ACCEPTANCE_SCENARIOS,
  assessLegalWorkspaceUxAcceptance,
} from '../src/core/transactions/legalWorkspaceUxAcceptance.js'
import {
  buildLegalWorkspaceUxTelemetryEvent,
  resolveLegalWorkspaceViewport,
} from '../src/core/transactions/legalWorkspaceUxTelemetry.js'
import { recordLegalWorkspaceUxEvent } from '../src/services/legalWorkspaceUxTelemetryService.js'

const event = buildLegalWorkspaceUxTelemetryEvent({
  eventName: 'primary_action_clicked',
  lane: 'transfer',
  taskType: 'collect_documents',
  status: 'in_progress',
  actionId: 'request_document',
  placement: 'primary',
  elapsedMs: 8_400.4,
  viewport: 'short_laptop',
  outcome: 'started',
  taskLabel: 'Buyer FICA received',
  buyerName: 'Private Buyer',
  note: 'Private legal note',
})

assert.equal(event.eventName, 'primary_action_clicked')
assert.equal(event.metadata.elapsedMs, 8_400)
assert.deepEqual(Object.keys(event.metadata), [
  'contract',
  'lane',
  'taskType',
  'status',
  'actionId',
  'placement',
  'elapsedMs',
  'viewport',
  'targetWorkspace',
  'outcome',
])
assert.doesNotMatch(JSON.stringify(event), /Private Buyer|Private legal note|Buyer FICA received/)
assert.equal(buildLegalWorkspaceUxTelemetryEvent({ eventName: 'unapproved_event' }), null)
assert.equal(buildLegalWorkspaceUxTelemetryEvent({ eventName: 'task_viewed', actionId: 'private-filename.pdf' }).metadata.actionId, 'other')
assert.equal(resolveLegalWorkspaceViewport({ width: 1440, height: 700 }), 'short_laptop')
assert.equal(resolveLegalWorkspaceViewport({ width: 1024, height: 900 }), 'tablet')

let transported = null
const recorded = await recordLegalWorkspaceUxEvent({
  userId: 'attorney-user',
  workspaceId: 'firm-workspace',
  eventName: 'task_status_updated',
  lane: 'cancellation',
  taskType: 'confirm_milestone',
  status: 'waiting',
  actionId: 'mark_waiting',
  placement: 'status_modal',
  outcome: 'success',
  transport: async (payload) => {
    transported = payload
    return { persisted: true, id: 'telemetry-row' }
  },
})
assert.equal(recorded.accepted, true)
assert.equal(recorded.persisted, true)
assert.equal(transported.category, 'legal_workspace_ux')
assert.equal(transported.eventName, 'task_status_updated')
assert.equal(transported.metadata.lane, 'cancellation')

const passingObservations = LEGAL_WORKSPACE_UX_ACCEPTANCE_SCENARIOS.map((scenario) => ({
  id: scenario.id,
  passed: true,
  evidence: `Observed ${scenario.id}`,
}))
const passingMetrics = {
  timeToNextActionMs: 9_500,
  medianTaskClicks: 3,
  completionErrorCount: 0,
  abandonedTaskCount: 0,
  duplicateNavigationCount: 0,
  clientVisibilityErrorCount: 0,
}
const ready = assessLegalWorkspaceUxAcceptance({ observations: passingObservations, metrics: passingMetrics })
assert.equal(ready.ready, true)
assert.equal(ready.passedScenarioCount, 11)
assert.equal(ready.blockers.length, 0)

const blocked = assessLegalWorkspaceUxAcceptance({
  observations: passingObservations.filter((observation) => observation.id !== 'responsive_tablet'),
  metrics: { ...passingMetrics, timeToNextActionMs: 10_001 },
})
assert.equal(blocked.ready, false)
assert.ok(blocked.blockers.some((item) => item.key === 'responsive_tablet'))
assert.ok(blocked.blockers.some((item) => item.key === 'timeToNextActionMs'))

const componentSource = readFileSync(new URL('../src/components/attorney/workflow/LegalTaskWorkbench.jsx', import.meta.url), 'utf8')
assert.match(componentSource, /eventName: 'task_viewed'/)
assert.match(componentSource, /elapsedMs:/)
assert.match(componentSource, /runAction\(primaryAction, 'primary'\)/)
assert.match(componentSource, /xl:h-\[calc\(100dvh-120px\)\]/)

const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /eventName: 'task_status_updated'/)
assert.match(pageSource, /eventName: 'return_path_used'/)
assert.match(pageSource, /recordLegalWorkspaceUxEvent/)

console.log('Legal workspace UX Phase 5 acceptance and measurement checks passed.')
