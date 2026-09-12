import assert from 'node:assert/strict'
import { resolveTransactionRoutingProfile } from '../src/services/transactionRoutingProfileService.js'
import { buildMatterWorkflowPlan } from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'
import { buildLegalTaskWorkbenchModel } from '../src/core/transactions/legalTaskWorkbenchModel.js'
import { getCanonicalLegalWorkflowProgressPercent } from '../src/core/transactions/legalWorkflowProgress.js'
import { buildLegalWorkflowOperationalHealthModel } from '../src/core/transactions/legalWorkflowOperationalHealthModel.js'

// Local projections only. This test deliberately does not claim browser/RLS acceptance.
const scenarios = [
  { name: 'cash-individual-single', finance: 'cash', buyer: 'individual', marital: 'single', tenure: 'freehold', lanes: ['transfer'] },
  { name: 'cash-company', finance: 'cash', buyer: 'company', marital: 'unknown', tenure: 'sectional_title', lanes: ['transfer'] },
  { name: 'bond-individual-married', finance: 'bond', buyer: 'individual', marital: 'in_community', tenure: 'freehold', existingBond: true, lanes: ['transfer', 'bond', 'cancellation'] },
  { name: 'bond-company', finance: 'bond', buyer: 'company', marital: 'unknown', tenure: 'sectional_title', existingBond: true, lanes: ['transfer', 'bond', 'cancellation'] },
  { name: 'hybrid-individual-married', finance: 'hybrid', buyer: 'individual', marital: 'out_of_community', tenure: 'sectional_title', lanes: ['transfer', 'bond'] },
  { name: 'unknown-provisional', finance: 'unknown', buyer: 'unknown', marital: 'unknown', tenure: 'unknown', lanes: ['transfer'] },
]
let taskChecks = 0
let outcomeChecks = 0
for (const scenario of scenarios) {
  const profile = resolveTransactionRoutingProfile({ transaction: {
    finance_type: scenario.finance, purchaser_type: scenario.buyer, seller_type: 'individual',
    property_tenure: scenario.tenure, seller_has_existing_bond: Boolean(scenario.existingBond),
    routing_profile_json: { mvpProfile: { buyerMaritalRegime: scenario.marital } },
  } })
  const plan = buildMatterWorkflowPlan({ routingProfile: profile })
  assert.deepEqual(plan.laneKeys, scenario.lanes, scenario.name)
  for (const lane of plan.lanes) {
    const snapshot = lane.stepKeys.map((stepKey, index) => ({ id: `${lane.laneKey}-${index}`, stepKey, status: 'not_started' }))
    const make = (selectedTaskKey, steps, canUpdateStage = true) => buildTransferWorkspaceViewModel({
      workflowKey: lane.laneKey, selectedTaskKey, now: new Date('2026-09-08T12:00:00Z'),
      workflow: { workflowPlan: plan, facts: profile,
        lane: { laneKey: lane.laneKey, steps, permissions: { canUpdateStage }, dataRequirements: [], documentRequirements: [] } },
    })
    const baseline = make(lane.stepKeys[0], snapshot)
    assert.deepEqual(baseline.tasks.map(task => task.key), lane.stepKeys)
    assert.deepEqual(baseline.phases.flatMap(phase => phase.tasks).map(task => task.key).sort(), [...lane.stepKeys].sort(), 'every task appears once in a phase')
    for (const stepKey of lane.stepKeys) {
      const initial = make(stepKey, snapshot)
      const workbench = buildLegalTaskWorkbenchModel({ task: initial.selectedTask,
        taskContext: initial.selectedTaskContext, workActions: initial.selectedTaskContext.workActions,
        statusActions: initial.availableActions.primary })
      const isTransferTaxLodgementGate = lane.laneKey === 'transfer' && stepKey === 'lodgement_ready'
      // Attorneys can work ahead across the workflow. The sole deliberate
      // exception is lodging a transfer before the applicable SARS route is
      // confirmed: that is a statutory readiness gate, not a generic UI lock.
      assert.equal(workbench.canComplete, !isTransferTaxLodgementGate, `${scenario.name}/${stepKey}: completion availability must match the tax-lodgement rule`)
      if (isTransferTaxLodgementGate) {
        assert(workbench.outcomeActions.some(action => action.id === 'mark_not_applicable' && !action.disabled), `${scenario.name}/${stepKey}: attorney retains an explicit N/A route`)
      }
      assert(workbench.outcomeActions.some(action => action.id === 'complete_externally' && action.requiresReason))
      assert(workbench.outcomeActions.some(action => action.id === 'mark_not_applicable' && action.requiresReason))
      assert.equal(make(stepKey, snapshot, false).availableActions.primary.length, 0, 'read-only users have no mutation actions')
      taskChecks++
      for (const status of ['completed', 'completed_externally', 'not_applicable', 'not_started']) {
        // Reconstruct from a serialised snapshot to detect dependence on optimistic display state.
        const saved = JSON.parse(JSON.stringify(snapshot.map(step => step.stepKey === stepKey
          ? { ...step, status, comment: 'Acceptance fixture reason' } : step)))
        const view = make(stepKey, saved)
        const completed = ['completed', 'completed_externally'].includes(status) ? 1 : 0
        const total = snapshot.length - (status === 'not_applicable' ? 1 : 0)
        const expected = total ? Math.round(completed / total * 100) : 0
        assert.equal(view.selectedTask.status, status)
        assert.equal(view.progress.percent, expected)
        assert.equal(view.phases.reduce((sum, phase) => sum + phase.total, 0), total)
        assert.equal(getCanonicalLegalWorkflowProgressPercent({ steps: view.tasks, workflowPlan: plan }), expected)
        assert.equal(buildLegalWorkflowOperationalHealthModel({ tasks: view.tasks }).progressPercent, expected)
        assert(view.tasks.filter(task => task.key !== stepKey).every(task => task.status === 'not_started'), 'working ahead must not complete earlier tasks')
        if (status === 'completed_externally') {
          assert(view.selectedTaskContext.checklistItems.filter(item => item.type === 'evidence').every(item => !item.complete))
        }
        outcomeChecks++
      }
    }
  }
  for (const excluded of ['transfer', 'bond', 'cancellation'].filter(lane => !plan.laneKeys.includes(lane))) {
    const view = buildTransferWorkspaceViewModel({ workflowKey: excluded,
      workflow: { workflowPlan: plan, facts: profile, lane: { laneKey: excluded, steps: [{ stepKey: 'instruction_received', status: 'completed' }] } } })
    assert.equal(view.tasks.length, 0, 'stored history must not restore an excluded lane')
  }
}
console.log(JSON.stringify({ scope: 'local_projection_acceptance', scenarios: scenarios.length, taskChecks, outcomeChecks, status: 'PASS', liveRoleAcceptance: 'NOT_RUN' }))
