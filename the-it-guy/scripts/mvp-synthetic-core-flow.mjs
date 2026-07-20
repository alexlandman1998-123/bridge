import assert from 'node:assert/strict'
import {
  MVP_SYNTHETIC_CORE_SCENARIOS,
  runMvpSyntheticCoreFlow,
} from '../src/core/transactions/mvpSyntheticCoreFlow.js'

const report = MVP_SYNTHETIC_CORE_SCENARIOS.map((scenario) => {
  const result = runMvpSyntheticCoreFlow(scenario)
  const replay = runMvpSyntheticCoreFlow(scenario)

  assert.equal(result.testDataProtection.protected, true, `${scenario.id}: test protection`)
  assert.equal(result.testDataProtection.externalDeliveryAllowed, false, `${scenario.id}: external delivery suppressed`)
  assert.equal(result.listing.sellerLeadId, result.sellerLead.id, `${scenario.id}: seller lead linked to listing`)
  assert.equal(result.acceptedOffer.listingId, result.listing.id, `${scenario.id}: offer linked to listing`)
  assert.equal(result.acceptedOffer.buyerLeadId, result.buyerLead.id, `${scenario.id}: offer linked to buyer`)
  assert.equal(result.acceptedOffer.status, 'accepted', `${scenario.id}: offer accepted`)
  assert.equal(result.creationCommand.acceptedOfferId, result.acceptedOffer.id, `${scenario.id}: accepted offer used for conversion`)
  assert.equal(result.transaction.creationIdempotencyKey, result.creationCommand.idempotencyKey, `${scenario.id}: transaction uses creation key`)
  assert.equal(replay.creationCommand.idempotencyKey, result.creationCommand.idempotencyKey, `${scenario.id}: idempotent replay`)
  assert.equal(replay.transaction.id, result.transaction.id, `${scenario.id}: deterministic transaction candidate`)
  assert.ok(result.participantBootstrap.participants.length >= 3, `${scenario.id}: participants created`)
  assert.ok(result.participantBootstrap.participants.every((participant) => participant.mvpLaunchRoleKey), `${scenario.id}: participant roles preserved`)
  assert.ok(result.documentBootstrap.requirements.length >= 4, `${scenario.id}: document requirements created`)
  assert.ok(result.workflowBootstrap.lanes.some((lane) => lane.laneType === 'transfer'), `${scenario.id}: transfer lane created`)
  assert.equal(result.draftTruth.readiness.canProgress, false, `${scenario.id}: gates block incomplete data`)
  assert.equal(result.readyTruth.readiness.canProgress, true, `${scenario.id}: gates allow verified data`)
  assert.equal(result.readyTruth.readiness.status, 'ready', `${scenario.id}: truth agrees with verified gate state`)
  assert.ok(result.readyTruth.gates.every((gate) => gate.satisfied), `${scenario.id}: all gates agree`)

  return {
    id: scenario.id,
    idempotencyKey: result.creationCommand.idempotencyKey,
    participants: result.participantBootstrap.participants.length,
    documents: result.documentBootstrap.requirements.length,
    workflowLanes: result.workflowBootstrap.lanes.map((lane) => lane.laneType),
    draftReadiness: result.draftTruth.readiness.status,
    verifiedReadiness: result.readyTruth.readiness.status,
    externalDeliveryAllowed: result.testDataProtection.externalDeliveryAllowed,
  }
})

console.log(JSON.stringify({
  version: 'arch9_mvp_synthetic_core_flow_report_v1',
  passed: true,
  scenarioCount: report.length,
  scenarios: report,
}, null, 2))
