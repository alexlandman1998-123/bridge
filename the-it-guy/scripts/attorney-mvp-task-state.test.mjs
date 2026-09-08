import assert from 'node:assert/strict'
import { isAttorneyTaskCompleted, isAttorneyTaskResolved } from '../src/core/transactions/attorneyTaskOutcomes.js'
import { readFileSync } from 'node:fs'
import { buildLegalTaskWorkbenchModel } from '../src/core/transactions/legalTaskWorkbenchModel.js'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'
import { getApplicableAttorneyTaskDefinitions } from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'
import { getCanonicalLegalWorkflowProgressPercent } from '../src/core/transactions/legalWorkflowProgress.js'

function model(laneKey, plan, steps = [], facts = {}) {
  return buildTransferWorkspaceViewModel({ workflowKey: laneKey, workflow: {
    workflowPlan: plan, facts,
    lane: { laneKey, currentStage: 'rates_clearance_received', steps,
      permissions: { canUpdateStage: true }, dataRequirements: [], documentRequirements: [] },
  } })
}
for (const laneKey of ['transfer', 'bond', 'cancellation']) {
  const keys = getApplicableAttorneyTaskDefinitions({ laneKey }).slice(0, 3).map(task => task.key)
  const plan = { status: 'active', lanes: [{ laneKey, stepKeys: keys }] }
  const empty = model(laneKey, plan)
  assert.equal(empty.tasks.filter(task => task.displayStatus === 'completed').length, 0, 'missing records must not imply completion')
  assert.deepEqual(empty.tasks.map(task => task.key), keys)
  assert.equal(empty.phases.reduce((sum, phase) => sum + phase.total, 0), keys.length)
  for (const status of ['completed', 'completed_externally', 'not_applicable', 'not_started']) {
    const work = model(laneKey, plan, [{ id: 'saved', stepKey: keys[0], status }])
    const progress = getCanonicalLegalWorkflowProgressPercent({ steps: work.tasks, workflowPlan: plan })
    assert.equal(progress, isAttorneyTaskCompleted(status) ? 33 : 0, 'completion and reopening use the same planned denominator')
    assert.equal(work.tasks[0].displayStatus, status)
  }
  assert.equal(model(laneKey, { status: 'active', lanes: [] }).tasks.length, 0, 'an excluded lane must not restore all tasks')
}
const plan = { status: 'active', lanes: [{ laneKey: 'transfer', stepKeys: ['guarantees_received'] }] }
assert.deepEqual(model('transfer', plan, [], { financeType: 'cash', isCashDeal: true }).tasks.map(t => t.key), ['guarantees_received'], 'confirmed plan wins over secondary scenario filters')
assert.equal(getCanonicalLegalWorkflowProgressPercent({ steps: [{ status: 'not_started', displayStatus: 'completed' }] }), 0)
assert.equal(getCanonicalLegalWorkflowProgressPercent({ lane: { summary: { completionPercent: 100 } }, steps: [{ status: 'not_started' }] }), 0)
console.log('Attorney MVP task-state regression tests passed: all three lanes, missing records, plan authority, counts, completion and reopening.')

// Execute the actual header projection, not a text-presence assertion.
const page = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const source = page.slice(page.indexOf('function buildLegalWorkflowProgressSteps('), page.indexOf('function getConditionalLegalWorkflowProgress('))
const header = new Function('normalizeAttorneyStageKey', 'getCurrentWorkflowStep', 'normalizeWorkspaceStatus', 'getLegalWorkflowStageDefinitions', 'isAttorneyTaskResolved', source + '; return buildLegalWorkflowProgressSteps;')(
  value => value, lane => lane.steps?.find(step => step.stepKey === lane.currentStage),
  value => value || 'not_started',
  (laneKey, facts, workflowPlan) => getApplicableAttorneyTaskDefinitions({ laneKey, facts, workflowPlan }), isAttorneyTaskResolved,
)
for (const workflowKey of ['transfer', 'bond', 'cancellation']) {
  const stepKeys = getApplicableAttorneyTaskDefinitions({ laneKey: workflowKey }).map(task => task.key)
  const workflowPlan = { status: 'active', lanes: [{ laneKey: workflowKey, stepKeys }] }
  for (const status of ['completed', 'completed_externally', 'not_applicable', 'not_started']) {
    const steps = [{ stepKey: stepKeys[0], status }]
    const projected = header({ workflowKey, workflowPlan, lane: { steps, currentStage: stepKeys.at(-1) } })
    const work = model(workflowKey, workflowPlan, steps)
    assert.deepEqual(projected.map(t => [t.key, t.status, t.displayStatus]), work.tasks.map(t => [t.key, t.status, t.displayStatus]))
  }
}
const task = { key: 'title_deed_checked', displayStatus: 'not_started', completionReadiness: {}, operationalContract: {} }
const workbench = buildLegalTaskWorkbenchModel({
  task,
  taskContext: { checklistItems: [
    { id: 'data:title_deed_number', label: 'Title deed identifier', type: 'data', complete: false },
    { id: 'document:title_deed', label: 'Title deed document', type: 'document', complete: false },
  ] },
  workActions: [{ id: 'upload_document' }, { id: 'capture_data' }],
})
assert.equal(workbench.requirementActions['data:title_deed_number'].id, 'capture_data')
assert.equal(workbench.requirementActions['document:title_deed'].id, 'upload_document')
console.log('Actual header projection matches Work; data/document action routing passed.')

const dashboardSource = readFileSync(new URL('../src/services/attorneyDashboard.js', import.meta.url), 'utf8')
const dashboardFunction = dashboardSource.slice(dashboardSource.indexOf('function resolveMatterCardWorkflowProgress('), dashboardSource.indexOf('function resolveMatterCardStatus('))
const dashboardProgress = new Function('normalizeAttorneyStageKey', 'getApplicableAttorneyTaskDefinitions', 'getCanonicalLegalWorkflowProgressPercent', dashboardFunction + '; return resolveMatterCardWorkflowProgress;')(
  value => value, getApplicableAttorneyTaskDefinitions, getCanonicalLegalWorkflowProgressPercent,
)
for (const laneKey of ['transfer', 'bond', 'cancellation']) {
  const stepKeys = getApplicableAttorneyTaskDefinitions({ laneKey }).slice(0, 3).map(task => task.key)
  const workflowPlan = { status: 'active', lanes: [{ laneKey, stepKeys }] }
  for (const status of ['completed', 'completed_externally', 'not_applicable', 'not_started']) {
    const transaction = { routing_profile_json: { workflowPlan }, attorney_stage: stepKeys.at(-1),
      attorneyWorkflowLanes: [{ process_type: laneKey, transaction_subprocess_steps: [{ step_key: stepKeys[0], status }] }] }
    const work = model(laneKey, workflowPlan, [{ stepKey: stepKeys[0], status }])
    assert.equal(dashboardProgress(transaction, laneKey), getCanonicalLegalWorkflowProgressPercent({ steps: work.tasks, workflowPlan }))
  }
}
console.log('Dashboard card progress matches Work across all lanes and reopening.')
