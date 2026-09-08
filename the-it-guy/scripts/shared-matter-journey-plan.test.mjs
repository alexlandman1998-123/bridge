import assert from 'node:assert/strict'
import { resolveTransactionRoutingProfile } from '../src/services/transactionRoutingProfileService.js'
import { buildMatterWorkflowPlan } from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'
import { buildPlannedSharedMatterJourney } from '../src/services/attorneyWorkflow/sharedMatterJourneyPlanAdapter.js'
import { presentSharedMatterJourney } from '../src/core/transactions/sharedMatterJourneyContract.js'

let count = 0
for (const finance of ['cash', 'bond', 'hybrid']) {
  for (const buyer of ['individual', 'company']) {
    const profile = resolveTransactionRoutingProfile({ transaction: { finance_type: finance,
      purchaser_type: buyer, seller_type: 'individual', seller_has_existing_bond: true,
      property_tenure: buyer === 'company' ? 'sectional_title' : 'freehold',
      routing_profile_json: { mvpProfile: { buyerMaritalRegime: buyer === 'individual' ? 'in_community' : 'unknown' } } } })
    const plan = buildMatterWorkflowPlan({ routingProfile: profile })
    const snapshots = Object.fromEntries(plan.lanes.map(lane => [lane.laneKey, { steps: lane.stepKeys.map((stepKey, i) => ({
      stepKey, id: `${lane.laneKey}-${i}`, status: i === 0 ? 'completed_externally' : i === 1 ? 'not_applicable' : 'not_started', revision: 2,
      comment: 'Private work history',
    })) }]))
    const input = { transactionId: 'matter', revision: 8, planRevision: 1, routingProfile: profile, laneSnapshots: snapshots }
    const result = buildPlannedSharedMatterJourney(input)
    assert.deepEqual(result.journey.lanes.map(lane => lane.key), plan.laneKeys)
    for (const lane of result.journey.lanes) {
      const work = buildTransferWorkspaceViewModel({ workflowKey: lane.key, workflow: { workflowPlan: plan, facts: profile, lane: snapshots[lane.key] } })
      assert.deepEqual(lane.phases.flatMap(phase => phase.tasks.map(task => [task.key, task.status, task.phaseKey])), work.phases.flatMap(phase => phase.tasks.map(task => [task.key, task.status, task.phaseKey])))
      assert.equal(lane.progress.percent, work.progress.percent)
      for (const task of work.tasks) {
        const mapped = lane.phases.flatMap(phase => phase.tasks).find(item => item.key === task.key)
        assert.equal(mapped.outstandingEvidenceCount, task.missingDocumentCount)
        assert.deepEqual(result.requirementsByTaskId[mapped.id].data, task.dataRequirements.map(item => ({
          key: item.id, complete: Boolean(item.complete), required: item.required !== false,
        })))
        assert.deepEqual(result.requirementsByTaskId[mapped.id].documents, task.relatedDocuments.map(item => ({
          key: item.key || item.sourceRequirementKey || item.id, ready: item.ready === true,
        })))
      }
    }
    for (const role of ['buyer', 'seller', 'agent', 'developer', 'attorney']) {
      assert.doesNotMatch(JSON.stringify(presentSharedMatterJourney(result.journey, role)), /Private work history/)
    }
    const unloaded = { ...snapshots }
    delete unloaded.transfer
    assert.throws(() => buildPlannedSharedMatterJourney({ ...input, laneSnapshots: unloaded }), /not loaded/)
    const reduced = { ...plan, laneKeys: ['transfer'], lanes: plan.lanes.filter(lane => lane.laneKey === 'transfer') }
    const retired = buildPlannedSharedMatterJourney({ ...input, previousPlan: plan, routingProfile: { ...profile, workflowPlan: reduced } })
    assert.equal(retired.journey.lanes.length, 1)
    if (plan.lanes.length > 1) {
      assert.ok(retired.retainedHistory.length)
      assert.ok(retired.review.excludedWorkedTasks.some(task => task.status === 'completed_externally'))
    }
    const a = plan.lanes[0]
    const links = buildPlannedSharedMatterJourney({ ...input, coordinationLinks: [{
      from: { laneKey: a.laneKey, taskKey: a.stepKeys[0] }, to: { laneKey: a.laneKey, taskKey: a.stepKeys[1] },
    }] })
    assert.equal(links.coordinationLinks[0].advisory, true)
    assert.throws(() => buildPlannedSharedMatterJourney({ ...input, laneSnapshots: { ...snapshots, transfer: { steps: [{ stepKey: a.stepKeys[0], status: 'mystery' }] } } }), /Unknown persisted/)
    assert.equal(snapshots.transfer.steps[0].comment, 'Private work history')
    count++
  }
}
console.log(`Shared journey plan: ${count} scenarios; Work parity, requirements, history, permissions boundary and missing-data checks passed`)
