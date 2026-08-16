import assert from 'node:assert/strict'
import { evaluateMvpPilotGoNoGo } from '../src/core/transactions/mvpPilotGoNoGo.js'

const acceptedOfferLineage = [
  {
    transactionId: 'tx-go-no-go-1',
    mode: 'accepted_offer',
    acceptedOfferId: 'offer-go-no-go-1',
    confirmed: true,
    auditVisible: true,
    issues: [],
  },
  {
    transactionId: 'tx-go-no-go-2',
    mode: 'accepted_offer',
    acceptedOfferId: 'offer-go-no-go-2',
    confirmed: true,
    auditVisible: true,
    issues: [],
  },
]

const green = evaluateMvpPilotGoNoGo({
  releaseCertification: { passed: true },
  pilotSession: { decision: 'go_for_controlled_pilot' },
  batchDryRun: { passed: true, batchSize: 2, batchLimit: 2, creationLineage: acceptedOfferLineage },
  exposureReadiness: { decision: 'ready_for_controlled_exposure' },
  evidencePath: 'evidence/staging.json',
})
assert.equal(green.decision, 'ready_for_controlled_exposure')
assert.equal(green.batchLimit, 2)
assert.equal(green.lineageSummary.acceptedOffer, 2)
assert.equal(green.lineageSummary.manualOverride, 0)

const held = evaluateMvpPilotGoNoGo({
  releaseCertification: { passed: true },
  pilotSession: { decision: 'no_go' },
  batchDryRun: { passed: true, batchSize: 2, batchLimit: 2 },
  exposureReadiness: { decision: 'ready_for_controlled_exposure' },
})
assert.equal(held.decision, 'do_not_expose')
assert.ok(held.blockers.includes('pilot_session_not_open'))
assert.ok(held.blockers.includes('pilot_batch_lineage_missing'))
assert.ok(held.blockers.includes('staging_evidence_required'))

const overrideLineage = evaluateMvpPilotGoNoGo({
  releaseCertification: { passed: true },
  pilotSession: { decision: 'go_for_controlled_pilot' },
  batchDryRun: {
    passed: true,
    batchSize: 1,
    batchLimit: 2,
    creationLineage: [{
      transactionId: 'tx-go-no-go-override',
      mode: 'manual_override',
      acceptedOfferId: '',
      confirmed: true,
      auditVisible: true,
      issues: [],
    }],
  },
  exposureReadiness: { decision: 'ready_for_controlled_exposure' },
  evidencePath: 'evidence/staging.json',
})
assert.equal(overrideLineage.decision, 'do_not_expose')
assert.ok(overrideLineage.blockers.includes('pilot_batch_manual_override_lineage'))
assert.ok(overrideLineage.blockers.includes('pilot_batch_lineage_not_accepted_offer'))
assert.ok(overrideLineage.blockers.includes('pilot_batch_accepted_offer_id_missing'))

console.log('mvp-pilot-go-no-go: passed')
