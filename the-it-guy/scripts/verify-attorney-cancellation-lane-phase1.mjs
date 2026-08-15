import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CANCELLATION_LANE_PHASE1_JOURNEY_VERSION,
  buildCancellationLaneJourneyMap,
} from '../src/services/attorneyWorkflow/cancellationLaneJourneyMap.js'

const map = buildCancellationLaneJourneyMap()

assert.equal(map.version, CANCELLATION_LANE_PHASE1_JOURNEY_VERSION)
assert.equal(map.attorney.ownerRole, 'cancellation_attorney')
assert.equal(map.rolloutBaseline.activationCondition, 'seller_existing_bond_requires_cancellation')
assert.equal(map.rolloutBaseline.transferTriggerStage, 'existing_bond_confirmed')
assert.equal(map.rolloutBaseline.attorneyStartsAt, 'cancellation_existing_bond_confirmed')
assert.equal(map.rolloutBaseline.cashBuyerStillMayRequireCancellation, true)
assert.equal(map.rolloutBaseline.buyerBondNotRequiredForCancellation, true)
assert.equal(map.rolloutBaseline.concurrentWorkAllowed, true)

assert.deepEqual(map.attorney.missingStageKeys, [])
assert.deepEqual(map.attorney.unknownStageKeys, [])
assert.deepEqual(map.attorney.duplicateStageKeys, [])
assert.equal(map.attorney.stageKeys.length, 19)
assert.equal(map.attorney.mappedStageKeys.length, 19)
assert.equal(map.attorney.lanes.length, 5)

assert.ok(map.attorney.mappedStageKeys.includes('cancellation_existing_bond_confirmed'))
assert.ok(map.attorney.mappedStageKeys.includes('cancellation_figures_received'))
assert.ok(map.attorney.mappedStageKeys.includes('cancellation_guarantees_accepted'))
assert.ok(map.attorney.mappedStageKeys.includes('cancellation_lodgement_ready'))
assert.ok(map.attorney.mappedStageKeys.includes('cancellation_close_out_complete'))

const triggerHandoff = map.handoffs.find((handoff) => handoff.key === 'transfer_to_cancellation_attorney')
assert.equal(triggerHandoff?.fromOwnerRole, 'transfer_attorney')
assert.equal(triggerHandoff?.toOwnerRole, 'cancellation_attorney')
assert.equal(triggerHandoff?.toStageKey, 'cancellation_existing_bond_confirmed')
assert.ok(triggerHandoff.requiredEvidence.includes('seller_existing_bond_confirmation'))
assert.ok(triggerHandoff.requiredEvidence.includes('seller_bond_bank'))
assert.ok(triggerHandoff.requiredEvidence.includes('seller_bond_account_number'))

const guaranteeHandoff = map.handoffs.find((handoff) => handoff.key === 'cancellation_to_transfer_guarantee_alignment')
assert.equal(guaranteeHandoff?.toOwnerRole, 'transfer_attorney')
assert.equal(guaranteeHandoff?.toStageKey, 'transfer_guarantees_accepted')
assert.ok(guaranteeHandoff.requiredEvidence.includes('cancellation_figures'))
assert.ok(guaranteeHandoff.requiredEvidence.includes('guarantee_acceptance'))

const lodgementHandoff = map.handoffs.find((handoff) => handoff.key === 'cancellation_to_lodgement_coordination')
assert.equal(lodgementHandoff?.toStageKey, 'lodgement_ready')
assert.ok(lodgementHandoff.requiredEvidence.includes('valid_cancellation_figures'))
assert.ok(lodgementHandoff.requiredEvidence.includes('simultaneous_lodgement_confirmation'))

const closeOutHandoff = map.handoffs.find((handoff) => handoff.key === 'cancellation_registration_close_out')
assert.equal(closeOutHandoff?.toStageKey, 'registered')
assert.ok(closeOutHandoff.requiredEvidence.includes('settlement_payment_reference'))

const docSource = readFileSync(new URL('../docs/attorney-cancellation-lane-phase1-journey-map.md', import.meta.url), 'utf8')
assert.match(docSource, /Cancellation Lane Phase 1 Journey Map/)
assert.match(docSource, /transfer_attorney\.existing_bond_confirmed/)
assert.match(docSource, /cancellation_attorney\.cancellation_existing_bond_confirmed/)
assert.match(docSource, /cash buyer can still require cancellation/)
assert.match(docSource, /node scripts\/verify-attorney-cancellation-lane-phase1\.mjs/)

console.log('Attorney cancellation lane Phase 1 journey map verification passed.')
