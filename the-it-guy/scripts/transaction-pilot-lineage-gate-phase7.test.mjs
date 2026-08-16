import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { auditMvpPilotBatch } from '../src/core/transactions/mvpPilotBatchAudit.js'

const auditSource = readFileSync(new URL('../src/core/transactions/mvpPilotBatchAudit.js', import.meta.url), 'utf8')
const exposureSource = readFileSync(new URL('../src/core/transactions/mvpExposureReadiness.js', import.meta.url), 'utf8')
const runbook = readFileSync(new URL('../docs/mvp-pilot-runbook.md', import.meta.url), 'utf8')
const contract = readFileSync(new URL('../docs/lead-listing-transaction-workflow-contract-phase0.md', import.meta.url), 'utf8')
const phaseDoc = readFileSync(new URL('../docs/controlled-pilot-lineage-gate-phase7.md', import.meta.url), 'utf8')

const acceptedOfferTransaction = {
  transactionId: 'tx-phase7-1',
  acceptedOfferId: 'offer-phase7-1',
  idempotencyKey: 'phase7-key-1',
  participantBootstrapComplete: true,
  documentBootstrapComplete: true,
  workflowBootstrapComplete: true,
  conversionConfirmed: true,
  healthAudited: true,
  notificationDeliveryReviewed: true,
}

const passed = auditMvpPilotBatch([acceptedOfferTransaction])
assert.equal(passed.passed, true)
assert.equal(passed.creationLineage[0].mode, 'accepted_offer')
assert.equal(passed.creationLineage[0].confirmed, true)

const missingAcceptedOffer = auditMvpPilotBatch([{ ...acceptedOfferTransaction, acceptedOfferId: '' }])
assert.equal(missingAcceptedOffer.passed, false)
assert.ok(missingAcceptedOffer.issues.includes('accepted_offer_id_missing:tx-phase7-1'))
assert.ok(missingAcceptedOffer.issues.includes('accepted_offer_lineage_required:tx-phase7-1'))
assert.ok(missingAcceptedOffer.issues.includes('creation_lineage_unconfirmed:tx-phase7-1'))

const forgedAcceptedOfferLineage = auditMvpPilotBatch([{
  ...acceptedOfferTransaction,
  acceptedOfferId: '',
  creationLineage: { mode: 'accepted_offer', confirmed: true, auditVisible: true },
}])
assert.equal(forgedAcceptedOfferLineage.passed, false)
assert.ok(forgedAcceptedOfferLineage.issues.includes('accepted_offer_id_missing:tx-phase7-1'))
assert.ok(forgedAcceptedOfferLineage.issues.includes('accepted_offer_lineage_required:tx-phase7-1'))

const manualOverride = auditMvpPilotBatch([{
  ...acceptedOfferTransaction,
  acceptedOfferId: '',
  transactionCreationOverride: {
    reason: 'Principal approved a legacy transaction override outside normal offer conversion.',
    actorId: 'principal-phase7',
    actorRole: 'principal',
    authorised: true,
  },
}])
assert.equal(manualOverride.passed, false)
assert.ok(manualOverride.issues.includes('manual_override_not_allowed_in_pilot:tx-phase7-1'))

assert.match(auditSource, /resolveMvpTransactionCreationLineage/, 'pilot batch audit must derive creation lineage, not trust a boolean only')
assert.match(auditSource, /manual_override_not_allowed_in_pilot/, 'pilot batch audit must reject manual override lineage by default')
assert.match(exposureSource, /acceptedOfferId \|\| batch\.accepted_offer_id/, 'exposure readiness must require accepted-offer linkage in staging evidence')
assert.match(runbook, /"acceptedOfferId": "<accepted-offer-uuid>"/, 'pilot runbook evidence example must include acceptedOfferId')
assert.match(contract, /Controlled Pilot Lineage Gate - Phase 7/, 'workflow contract must reference the Phase 7 pilot lineage gate')
assert.match(phaseDoc, /Manual override lineage is rejected in pilot batch evidence by default\./)

console.log('Transaction pilot lineage gate Phase 7 checks passed.')
