import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, envFile: false, logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { scopeAttorneyWorkflowOperations, buildSharedAttorneyCoordinationLanes } = await server.ssrLoadModule('/src/services/attorneyWorkflow/attorneyWorkflowLaneService.js')
  const { projectSharedMatterJourneyRead } = await server.ssrLoadModule('/src/services/sharedMatterJourneyReader.js')
  const { buildAttorneyWorkflowCoordinationSummary, buildAttorneyWorkflowCoordinationCommand } = await server.ssrLoadModule('/src/constants/attorneyWorkflowUsability.js')
  const { resolveLegalRequirements } = await server.ssrLoadModule('/src/services/attorneyWorkflow/attorneyWorkflowResolver.js')
  const workflow = resolveLegalRequirements({ finance_type: 'bond', purchaser_type: 'individual', seller_has_existing_bond: true })
  assert.equal(Array.isArray(workflow.dataRequirements), false)
  const lanes = ['transfer', 'bond', 'cancellation'].map(laneKey => ({ laneKey, steps: [{ stepKey: 'instruction_received', status: 'completed' }] }))
  for (const visibleLaneKeys of [[], ['transfer'], ['bond'], ['transfer', 'bond', 'cancellation']]) {
    const result = scopeAttorneyWorkflowOperations({ workflow, lanes }, { scoped: true, visibleLaneKeys })
    assert.deepEqual(Object.keys(result.workflow.dataRequirements), Object.keys(workflow.dataRequirements).filter(key => visibleLaneKeys.includes(key)))
    assert.deepEqual(result.lanes.map(lane => lane.laneKey), visibleLaneKeys)
    for (const lane of result.lanes) assert.equal(lane.steps[0].status, 'completed', 'scoping must retain persisted state')
    for (const [key, requirements] of Object.entries(result.workflow.dataRequirements)) assert.deepEqual(requirements, workflow.dataRequirements[key])
  }
  const definitions = {
    transfer: { payment_security_review: 'completed', lodgement_ready: 'not_started' },
    bond: { guarantees_issued: 'completed', bond_lodgement_ready: 'waiting' },
    cancellation: { cancellation_guarantees_accepted: 'waiting', cancellation_lodgement_ready: 'not_started' },
  }
  const read = (outcomes = definitions, requiredLaneKeys = ['transfer', 'bond', 'cancellation'], revision = 21) => ({
    status: 'ready',
    snapshot: projectSharedMatterJourneyRead({ schemaVersion: 1, transactionId: 'matter-1', revision, planRevision: revision,
      planStatus: 'active', requiredLaneKeys, lanes: requiredLaneKeys.map(key => ({ key, phases: [{
        key: 'handoff', label: 'Coordination', clientLabel: 'Matter progress',
        tasks: Object.entries(outcomes[key] || {}).map(([taskKey,status]) => ({ key: taskKey, label: taskKey,
          clientLabel: 'Matter update', status, revision, comment: 'PRIVATE NOTE', documents: ['PRIVATE FILE'] })),
      }] })),
    }, { audience: 'attorney' }),
  })
  const assignments = ['transfer','bond','cancellation'].map(lane => ({ id: `${lane}-assignment`,
    attorneyRole: `${lane}_attorney`, assignmentStatus: 'active', firmName: 'PRIVATE FIRM DETAILS', notes: 'PRIVATE NOTE' }))
  const coordination = buildSharedAttorneyCoordinationLanes({ sharedJourney: read(), assignments,
    requiredLaneKeys: ['transfer'], laneRows: [{ process_type: 'bond', current_stage: 'bond_registered', lane_metadata: { notes: 'PRIVATE NOTE' } }] })
  const summarized = ownLane => buildAttorneyWorkflowCoordinationSummary({ laneKey: ownLane,
    lanes: coordination.lanes, requiredLaneKeys: coordination.requiredLaneKeys, sourceRevision: coordination.sourceRevision })
  assert.equal(summarized('transfer').counts.total, 4)
  assert.equal(summarized('transfer').counts.ready, 1)
  assert.equal(summarized('transfer').counts.waiting, 3)
  assert.equal(summarized('transfer').health, 'waiting', 'hidden lanes cannot make the matter look clear')
  assert.equal(summarized('bond').counts.total, 2)
  assert.equal(summarized('cancellation').counts.total, 2)
  for (const ownLane of ['transfer','bond','cancellation']) {
    const privateLanes = ['transfer','bond','cancellation'].map(laneKey => ({ laneKey,
      permissions: { canUpdateStage: laneKey === ownLane }, privateNote: `${laneKey} PRIVATE NOTE`,
      coordinationSummary: summarized(laneKey) }))
    const scoped = scopeAttorneyWorkflowOperations({ workflow, lanes: privateLanes }, { scoped: true, visibleLaneKeys: [ownLane] })
    assert.deepEqual(scoped.lanes.map(lane => lane.laneKey), [ownLane])
    assert.equal(scoped.lanes[0].permissions.canUpdateStage, true)
    assert.equal(scoped.lanes[0].coordinationSummary.sourceRevision, 21)
    assert.doesNotMatch(JSON.stringify(scoped.lanes[0].coordinationSummary), /PRIVATE|permissions|documents|firmName|assignmentId/)
  }
  assert.doesNotMatch(JSON.stringify(coordination), /PRIVATE|permissions|documents|firmName|assignmentId/)
  for (const requiredLaneKeys of [['transfer'],['transfer','bond'],['transfer','cancellation'],['transfer','bond','cancellation']]) {
    const snapshot = buildSharedAttorneyCoordinationLanes({ sharedJourney: read(definitions,requiredLaneKeys), assignments })
    const summary = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'transfer', ...snapshot })
    assert.equal(summary.counts.total,(requiredLaneKeys.length-1)*2,'non-required or retired lanes add no work')
  }
  const missing = read()
  missing.snapshot = { ...missing.snapshot, lanes: missing.snapshot.lanes.filter(lane => lane.key !== 'bond') }
  const missingProjection = buildSharedAttorneyCoordinationLanes({ sharedJourney: missing, assignments })
  const missingSummary = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'transfer', ...missingProjection })
  assert.equal(missingSummary.counts.total,4)
  assert.equal(missingSummary.health,'waiting')
  const missingItem = missingSummary.items.find(item => item.targetStage === 'bond_lodgement_ready')
  assert.equal(missingItem.statusLabel,'Progress unavailable')
  assert.equal(buildAttorneyWorkflowCoordinationCommand(missingItem),null,'missing progress must not create a false assignment request')
  const unassigned = buildSharedAttorneyCoordinationLanes({ sharedJourney: read(), assignmentLookupComplete: true, assignments: assignments.map(row =>
    row.attorneyRole === 'bond_attorney' ? { ...row, assignmentStatus: 'removed' } : row) })
  const blocked = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'transfer', ...unassigned }).items.find(item => item.targetStage === 'bond_lodgement_ready')
  assert.equal(blocked.status,'blocked')
  assert.equal(blocked.statusLabel,'Assignment Needed')
  const uncertain = buildSharedAttorneyCoordinationLanes({ sharedJourney: read(), assignments: [], assignmentLookupAvailable: false })
  const unknownAssignment = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'transfer', ...uncertain }).items.find(item => item.targetStage === 'bond_lodgement_ready')
  assert.equal(unknownAssignment.status,'waiting')
  assert.equal(unknownAssignment.statusLabel,'Assignment unconfirmed')
  const combined = buildSharedAttorneyCoordinationLanes({ sharedJourney: read(definitions,['transfer','bond']),
    assignments: [{ attorneyRole: 'transfer_attorney', assignmentType: 'transfer_and_bond', assignmentStatus: 'active' }] })
  assert.ok(combined.lanes.every(lane => lane.assigned === true),'one combined appointment covers transfer and bond')
  for (const ownLane of ['transfer','bond','cancellation']) {
    const partial = buildSharedAttorneyCoordinationLanes({ sharedJourney: read(),
      assignments: assignments.filter(row => row.attorneyRole === `${ownLane}_attorney`) })
    const ownSummary = buildAttorneyWorkflowCoordinationSummary({ laneKey: ownLane, ...partial })
    assert.equal(ownSummary.counts.blocked,0,'a hidden assignment is not an absent appointment')
    assert.equal(partial.lanes.find(lane => lane.laneKey === ownLane).assigned,true)
    assert.ok(ownSummary.items.every(item => item.assigned === null))
    assert.ok(ownSummary.items.filter(item => item.status !== 'ready').every(item => item.statusLabel === 'Assignment unconfirmed'))
  }
  const updated = read({ ...definitions, bond: { guarantees_issued: 'waiting', bond_lodgement_ready: 'completed_externally' },
    cancellation: { cancellation_guarantees_accepted: 'not_applicable', cancellation_lodgement_ready: 'not_applicable' } },['transfer','bond','cancellation'],22)
  const updatedProjection = buildSharedAttorneyCoordinationLanes({ sharedJourney: updated, assignments })
  const updatedSummary = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'transfer', ...updatedProjection })
  assert.equal(updatedSummary.sourceRevision,22)
  assert.equal(updatedSummary.counts.total,2,'explicitly not-applicable dependencies add no extra work')
  assert.equal(updatedSummary.counts.ready,1,'a saved external completion counts as completion')
  assert.equal(updatedSummary.items.find(item => item.targetStage === 'guarantees_issued').status,'waiting','reopening immediately withdraws readiness')
  const omitted = read({ ...definitions, bond: { guarantees_issued: 'completed' } },['transfer','bond'])
  const omittedProjection = buildSharedAttorneyCoordinationLanes({ sharedJourney: omitted, assignments })
  assert.equal(buildAttorneyWorkflowCoordinationSummary({ laneKey: 'transfer', ...omittedProjection }).counts.total,1,'the active plan controls applicable tasks')
  const absent = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'transfer', lanes: [], requiredLaneKeys: ['transfer','bond'] })
  assert.equal(absent.counts.total,2)
  assert.notEqual(absent.health,'clear')
  console.log('Scoped workflow load passed: real resolver shape, persisted completion, denied and multi-lane access.')
  console.log('Shared coordination passed: all three attorney roles, applicability, missing progress/assignments, reopen/reload, privacy and unchanged editing scope.')
} finally {
  await server.close()
}
