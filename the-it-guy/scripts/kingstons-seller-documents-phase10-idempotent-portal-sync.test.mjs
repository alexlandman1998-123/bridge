import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildSellerDocumentRequestPlan } from '../src/services/sellerDocumentRequestOrchestrationService.js'

const appRoot = process.cwd()
const privateListingSource = readFileSync(resolve(appRoot, 'src/services/privateListingService.js'), 'utf8')
const requestOrchestratorSource = readFileSync(resolve(appRoot, 'src/services/sellerDocumentRequestOrchestrationService.js'), 'utf8')

const kingstonsPortalRequest = {
  requestStage: 'seller_pack',
  requestPriority: 'high',
  requestDeliveryChannels: ['seller_portal'],
  requestDedupeKey: 'kingstons_seller_pack:signed_fica_form',
  requestSource: 'kingstons_seller_pack_phase9_portal_request_sync',
}

const plan = buildSellerDocumentRequestPlan({
  listing: {
    id: 'listing-kingstons-1',
    seller: { email: 'seller@example.com' },
  },
  requirements: [
    {
      id: 'req-signed-fica',
      private_listing_id: 'listing-kingstons-1',
      requirement_key: 'signed_fica_form',
      requirement_name: 'Signed FICA Form',
      requirement_group: 'fica',
      document_visibility: 'seller_visible',
      status: 'required',
      is_required: true,
      generated_from: {
        source: 'kingstons_seller_pack_phase9_portal_request_sync',
        previousSource: 'kingstons_seller_lead_pack_phase7_readiness_gate',
        portalRequest: kingstonsPortalRequest,
      },
    },
  ],
  now: new Date('2026-08-09T08:00:00.000Z'),
  reason: 'kingstons_seller_pack_phase9_portal_request_sync',
})

assert.equal(plan.counts.issued, 1)
assert.equal(plan.issued[0].requestStage, 'seller_pack')
assert.equal(plan.issued[0].requestPriority, 'high')
assert.deepEqual(plan.issued[0].requestDeliveryChannels, ['seller_portal'])
assert.equal(plan.issued[0].requestDedupeKey, 'kingstons_seller_pack:signed_fica_form')
assert.equal(plan.issued[0].requestSource, 'kingstons_seller_pack_phase9_portal_request_sync')
assert.deepEqual(plan.issued[0].portalRequest, kingstonsPortalRequest)

const rerun = buildSellerDocumentRequestPlan({
  listing: { id: 'listing-kingstons-1' },
  requirements: [
    {
      id: 'req-signed-fica',
      private_listing_id: 'listing-kingstons-1',
      requirement_key: 'signed_fica_form',
      requirement_name: 'Signed FICA Form',
      requirement_group: 'fica',
      document_visibility: 'seller_visible',
      status: 'requested',
      request_dedupe_key: 'kingstons_seller_pack:signed_fica_form',
      generated_from: {
        portalRequest: kingstonsPortalRequest,
      },
    },
  ],
})

assert.equal(rerun.counts.issued, 0, 'Phase 10 should not duplicate already-issued Kingstons portal requests.')
assert.equal(rerun.counts.existing, 1)

assert.match(
  privateListingSource,
  /const ensuredRows = sourceRows/,
  'Phase 10 should run ensure sync across all source rows, not only missing rows.',
)
assert.match(
  privateListingSource,
  /\.\.\.\(existing\?\.id \? \{ id: existing\.id \} : \{\}\)/,
  'Phase 10 should upsert existing requirement rows by id when enriching stale listing requirements.',
)
assert.match(
  privateListingSource,
  /source: generatedFrom\.source \|\| 'manual_seller_pack'/,
  'Phase 10 should preserve the Kingstons portal request sync source in generated_from.',
)
assert.doesNotMatch(
  privateListingSource,
  /if \(existing\) return null/,
  'Phase 10 should not skip existing requirements because that leaves older listings without portal request metadata.',
)
assert.match(
  requestOrchestratorSource,
  /function resolveRequirementPortalRequest/,
  'Phase 10 should let the request orchestrator read portal request metadata from requirement rows.',
)
assert.match(
  requestOrchestratorSource,
  /portalRequest: item\.portalRequest/,
  'Phase 10 should persist portal request metadata when issuing seller document requests.',
)

console.log('Kingstons seller documents Phase 10 idempotent portal sync checks passed.')
