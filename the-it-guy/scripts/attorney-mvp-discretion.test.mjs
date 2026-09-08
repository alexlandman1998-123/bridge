import assert from 'node:assert/strict'
import { resolveTransactionRoutingProfile } from '../src/services/transactionRoutingProfileService.js'
import { buildMatterWorkflowPlan, resolveMatterWorkflowPlan } from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'
import { buildLegalTaskWorkbenchModel } from '../src/core/transactions/legalTaskWorkbenchModel.js'
import { getCanonicalLegalWorkflowProgressPercent } from '../src/core/transactions/legalWorkflowProgress.js'
import { buildLegalWorkflowOperationalHealthModel } from '../src/core/transactions/legalWorkflowOperationalHealthModel.js'

const unknown = resolveTransactionRoutingProfile({ transaction: {} })
assert.equal(unknown.financeType, 'unknown')
assert.equal(unknown.vatTreatment, 'unknown')
const provisional = buildMatterWorkflowPlan({ routingProfile: unknown })
assert.equal(provisional.status, 'active')
assert.equal(provisional.provisional, true)
assert(provisional.lanes[0].stepKeys.includes('rates_clearance_received'))

const profile = resolveTransactionRoutingProfile({ transaction: {
  finance_type: 'cash', purchaser_type: 'individual', seller_type: 'company', property_tenure: 'freehold',
  routing_profile_json: { mvpProfile: { buyerMaritalRegime: 'in_community', paymentSecurity: 'guarantee', bondWorkflow: 'include', cancellationWorkflow: 'exclude' } },
} })
assert.equal(profile.requiresBondAttorney, true)
assert.equal(profile.requiresCancellationAttorney, false)
assert.equal(profile.buyerMaritalRegime, 'in_community')
const plan = buildMatterWorkflowPlan({ routingProfile: profile })
assert(plan.laneKeys.includes('bond'))
assert(plan.lanes[0].stepKeys.includes('guarantees_received'), 'cash must retain security review')
assert(plan.lanes[0].stepKeys.includes('levy_clearance_received'), 'applicability is reviewed, not silently removed')
const existing = { version: 'attorney_matter_workflow_plan_v1', status: 'active', lanes: [] }
assert.equal(resolveMatterWorkflowPlan({ workflowPlan: existing }), existing, 'do not silently rewrite accepted plans')

for (const laneKey of ['transfer', 'bond', 'cancellation']) {
  const fullPlan = buildMatterWorkflowPlan({ routingProfile: { requiresBondAttorney: true, requiresCancellationAttorney: true } })
  const stepKeys = fullPlan.lanes.find(lane => lane.laneKey === laneKey).stepKeys.slice(0, 3)
  const workflowPlan = { ...fullPlan, lanes: [{ laneKey, stepKeys }] }
  const steps = stepKeys.map((stepKey, index) => ({ id: String(index), stepKey, status: ['completed_externally','not_applicable','not_started'][index], comment: index < 2 ? 'Attorney reason recorded' : '' }))
  const make = selectedTaskKey => buildTransferWorkspaceViewModel({
    workflowKey: laneKey, selectedTaskKey, workflow: { workflowPlan, facts: profile,
      lane: { laneKey, steps, permissions: { canUpdateStage: true }, dataRequirements: [], documentRequirements: [] } },
  })
  const view = make(stepKeys[2])
  assert.equal(view.progress.total, 2)
  assert.equal(view.progress.completed, 1)
  assert.equal(view.progress.percent, 50)
  assert.equal(getCanonicalLegalWorkflowProgressPercent({ steps: view.tasks, workflowPlan }), 50)
  assert.equal(buildLegalWorkflowOperationalHealthModel({ tasks: view.tasks }).progressPercent, 50)
  assert.equal(view.tasks[0].statusLabel, 'Completed externally')
  assert.equal(view.tasks[1].statusLabel, 'Not applicable')
  assert.equal(view.tasks[0].displayStatus, 'completed_externally')
  const workbench = workspace => buildLegalTaskWorkbenchModel({
    task: workspace.selectedTask, taskContext: workspace.selectedTaskContext,
    workActions: workspace.selectedTaskContext.workActions,
    statusActions: workspace.availableActions.primary,
  })
  const pending = workbench(view)
  assert.equal(pending.canComplete, true, 'missing evidence does not lock professional work')
  assert(pending.outcomeActions.some(action => action.id === 'complete_externally' && action.requiresReason))
  assert(pending.outcomeActions.some(action => action.id === 'mark_not_applicable' && action.requiresReason))
  const external = make(stepKeys[0])
  const externalChecklist = external.selectedTaskContext.checklistItems
  assert.equal(workbench(external).outcomeReason, 'Attorney reason recorded')
  assert(workbench(external).outcomeActions.some(action => action.id === 'reopen_task'))
  assert(externalChecklist.filter(item => item.type === 'evidence').every(item => !item.complete), 'external completion must not assert evidence checks')
  const reopened = structuredClone(steps); reopened[1].status = 'not_started'
  assert.equal(getCanonicalLegalWorkflowProgressPercent({ steps: reopened, workflowPlan }), 33)
}
console.log('Phase 2 profiles, provisional work, optional lanes, outcomes, evidence separation and reopening passed.')
