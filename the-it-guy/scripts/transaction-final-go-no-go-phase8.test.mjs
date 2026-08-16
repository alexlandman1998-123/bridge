import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluateMvpPilotGoNoGo } from '../src/core/transactions/mvpPilotGoNoGo.js'

const goNoGoSource = readFileSync(new URL('../src/core/transactions/mvpPilotGoNoGo.js', import.meta.url), 'utf8')
const releaseCertification = readFileSync(new URL('./mvp-release-certification.mjs', import.meta.url), 'utf8')
const runbook = readFileSync(new URL('../docs/mvp-pilot-runbook.md', import.meta.url), 'utf8')
const phase8Doc = readFileSync(new URL('../docs/final-controlled-exposure-go-no-go-phase8.md', import.meta.url), 'utf8')
const phase0Contract = readFileSync(new URL('../docs/lead-listing-transaction-workflow-contract-phase0.md', import.meta.url), 'utf8')

const acceptedOfferLineage = [
  {
    transactionId: 'tx-phase8-1',
    mode: 'accepted_offer',
    acceptedOfferId: 'offer-phase8-1',
    confirmed: true,
    auditVisible: true,
    issues: [],
  },
  {
    transactionId: 'tx-phase8-2',
    mode: 'accepted_offer',
    acceptedOfferId: 'offer-phase8-2',
    confirmed: true,
    auditVisible: true,
    issues: [],
  },
]

const ready = evaluateMvpPilotGoNoGo({
  releaseCertification: { passed: true },
  pilotSession: { decision: 'go_for_controlled_pilot' },
  batchDryRun: { passed: true, batchSize: 2, batchLimit: 2, creationLineage: acceptedOfferLineage },
  exposureReadiness: { decision: 'ready_for_controlled_exposure' },
  evidencePath: 'evidence/staging-exposure.json',
})
assert.equal(ready.decision, 'ready_for_controlled_exposure')
assert.deepEqual(ready.blockers, [])
assert.equal(ready.lineageSummary.acceptedOffer, 2)
assert.equal(ready.lineageSummary.acceptedOfferLinked, 2)

const missingLineage = evaluateMvpPilotGoNoGo({
  releaseCertification: { passed: true },
  pilotSession: { decision: 'go_for_controlled_pilot' },
  batchDryRun: { passed: true, batchSize: 2, batchLimit: 2 },
  exposureReadiness: { decision: 'ready_for_controlled_exposure' },
  evidencePath: 'evidence/staging-exposure.json',
})
assert.equal(missingLineage.decision, 'do_not_expose')
assert.ok(missingLineage.blockers.includes('pilot_batch_lineage_missing'))

const manualOverride = evaluateMvpPilotGoNoGo({
  releaseCertification: { passed: true },
  pilotSession: { decision: 'go_for_controlled_pilot' },
  batchDryRun: {
    passed: true,
    batchSize: 1,
    batchLimit: 2,
    creationLineage: [{
      transactionId: 'tx-phase8-override',
      mode: 'manual_override',
      acceptedOfferId: '',
      confirmed: true,
      auditVisible: true,
      issues: [],
    }],
  },
  exposureReadiness: { decision: 'ready_for_controlled_exposure' },
  evidencePath: 'evidence/staging-exposure.json',
})
assert.equal(manualOverride.decision, 'do_not_expose')
assert.ok(manualOverride.blockers.includes('pilot_batch_manual_override_lineage'))
assert.ok(manualOverride.blockers.includes('pilot_batch_accepted_offer_id_missing'))

const unconfirmed = evaluateMvpPilotGoNoGo({
  releaseCertification: { passed: true },
  pilotSession: { decision: 'go_for_controlled_pilot' },
  batchDryRun: {
    passed: true,
    batchSize: 1,
    batchLimit: 2,
    creationLineage: [{
      transactionId: 'tx-phase8-unconfirmed',
      mode: 'accepted_offer',
      acceptedOfferId: 'offer-phase8-unconfirmed',
      confirmed: false,
      auditVisible: false,
      issues: ['creation_lineage_unconfirmed:tx-phase8-unconfirmed'],
    }],
  },
  exposureReadiness: { decision: 'ready_for_controlled_exposure' },
  evidencePath: 'evidence/staging-exposure.json',
})
assert.equal(unconfirmed.decision, 'do_not_expose')
assert.ok(unconfirmed.blockers.includes('pilot_batch_lineage_unconfirmed'))
assert.ok(unconfirmed.blockers.includes('pilot_batch_lineage_not_audit_visible'))
assert.ok(unconfirmed.blockers.includes('pilot_batch_lineage_issues_present'))

assert.match(goNoGoSource, /pilot_batch_manual_override_lineage/, 'Phase 8 must reject manual override lineage')
assert.match(goNoGoSource, /pilot_batch_lineage_missing/, 'Phase 8 must fail closed without dry-run lineage')
assert.match(releaseCertification, /transaction-final-go-no-go-phase8\.test\.mjs/, 'release certification must include the Phase 8 final gate contract')
assert.match(runbook, /accepted-offer creation lineage/i, 'pilot runbook must tell operators the Phase 8 gate checks accepted-offer lineage')
assert.match(phase8Doc, /does not deploy, unpause creation, or create\s+transactions/i, 'Phase 8 docs must keep the gate non-mutating')
assert.match(phase0Contract, /Final Controlled Exposure Go\/No-Go - Phase 8/, 'Phase 0 contract must reference the Phase 8 final gate')

console.log('Transaction final go/no-go Phase 8 checks passed.')
