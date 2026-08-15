import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildSellerDocumentRequestPlan } from '../src/services/sellerDocumentRequestOrchestrationService.js'

const appRoot = process.cwd()
const privateListingSource = readFileSync(resolve(appRoot, 'src/services/privateListingService.js'), 'utf8')
const requestOrchestratorSource = readFileSync(resolve(appRoot, 'src/services/sellerDocumentRequestOrchestrationService.js'), 'utf8')
const packageSource = readFileSync(resolve(appRoot, 'package.json'), 'utf8')

const phase10Source = 'kingstons_seller_pack_phase10_idempotent_portal_sync'

const supportingFicaPortalRequest = {
  requestStage: 'seller_pack',
  requestPriority: 'required',
  requestDeliveryChannels: ['seller_portal'],
  requestDedupeKey: 'kingstons_seller_pack:owner_fica_alexander_landman',
  requestSource: phase10Source,
  requestedFromRole: 'seller',
  agentManaged: false,
  sellerUploadAllowed: true,
  requestAction: 'seller_portal_upload',
  supportingFicaDocumentsDynamic: true,
}

const baseFicaDeclarationPortalRequest = {
  requestStage: 'seller_pack',
  requestPriority: 'blocker',
  requestDeliveryChannels: ['seller_onboarding_link', 'agency_workspace'],
  requestDedupeKey: 'kingstons_seller_pack:signed_fica_declaration',
  requestSource: phase10Source,
  requestedFromRole: 'agent',
  agentManaged: true,
  sellerUploadAllowed: false,
  requestAction: 'seller_onboarding_or_agent_physical_upload_with_context',
  allowedCompletionRoutes: ['seller_onboarding_link_completed', 'physical_upload_with_context'],
  physicalUploadContextRequired: true,
  supportingFicaDocumentsDynamic: true,
}

const plan = buildSellerDocumentRequestPlan({
  listing: {
    id: 'listing-kingstons-1',
    seller: { email: 'seller@example.com' },
  },
  requirements: [
    {
      id: 'req-owner-fica-alexander',
      private_listing_id: 'listing-kingstons-1',
      requirement_key: 'owner_fica_alexander_landman',
      requirement_name: 'Alexander Landman FICA supporting documents',
      requirement_group: 'fica',
      document_visibility: 'seller_visible',
      status: 'required',
      is_required: true,
      generated_from: {
        source: phase10Source,
        portalRequest: supportingFicaPortalRequest,
      },
    },
    {
      id: 'req-signed-fica-declaration',
      private_listing_id: 'listing-kingstons-1',
      requirement_key: 'signed_fica_declaration',
      requirement_name: 'Signed FICA declaration',
      requirement_group: 'fica',
      document_visibility: 'seller_visible',
      status: 'required',
      is_required: true,
      generated_from: {
        source: phase10Source,
        portalRequest: baseFicaDeclarationPortalRequest,
      },
    },
  ],
  now: new Date('2026-08-09T08:00:00.000Z'),
  reason: phase10Source,
})

assert.equal(plan.counts.issued, 1)
assert.equal(plan.counts.suppressed, 1)
assert.equal(plan.issued[0].requirementKey, 'owner_fica_alexander_landman')
assert.equal(plan.issued[0].requestedFromRole, 'seller')
assert.equal(plan.issued[0].requestStage, 'seller_pack')
assert.equal(plan.issued[0].requestPriority, 'required')
assert.deepEqual(plan.issued[0].requestDeliveryChannels, ['seller_portal'])
assert.equal(plan.issued[0].requestDedupeKey, 'kingstons_seller_pack:owner_fica_alexander_landman')
assert.equal(plan.issued[0].requestSource, phase10Source)
assert.deepEqual(plan.issued[0].portalRequest, supportingFicaPortalRequest)
assert.equal(plan.suppressed[0].key, 'signed_fica_declaration')
assert.equal(plan.suppressed[0].reason, 'agent_managed_portal_request')
assert.deepEqual(plan.suppressed[0].portalRequest, baseFicaDeclarationPortalRequest)

const rerun = buildSellerDocumentRequestPlan({
  listing: { id: 'listing-kingstons-1' },
  requirements: [
    {
      id: 'req-owner-fica-alexander',
      private_listing_id: 'listing-kingstons-1',
      requirement_key: 'owner_fica_alexander_landman',
      requirement_name: 'Alexander Landman FICA supporting documents',
      requirement_group: 'fica',
      document_visibility: 'seller_visible',
      status: 'requested',
      request_dedupe_key: 'kingstons_seller_pack:owner_fica_alexander_landman',
      generated_from: {
        portalRequest: supportingFicaPortalRequest,
      },
    },
    {
      id: 'req-signed-fica-declaration',
      private_listing_id: 'listing-kingstons-1',
      requirement_key: 'signed_fica_declaration',
      requirement_name: 'Signed FICA declaration',
      requirement_group: 'fica',
      document_visibility: 'seller_visible',
      status: 'required',
      generated_from: {
        portalRequest: baseFicaDeclarationPortalRequest,
      },
    },
  ],
})

assert.equal(rerun.counts.issued, 0, 'Phase 10 should not duplicate already-issued Kingstons seller portal requests.')
assert.equal(rerun.counts.existing, 1)
assert.equal(rerun.counts.suppressed, 1)
assert.equal(rerun.existing[0].requestDedupeKey, 'kingstons_seller_pack:owner_fica_alexander_landman')
assert.equal(rerun.suppressed[0].reason, 'agent_managed_portal_request')

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
assert.match(
  privateListingSource,
  /requested_from_role, request_stage, request_priority, request_due_date, request_delivery_channels, request_dedupe_key, request_source, requested_at, request_revision, last_request_reason, request_metadata/,
  'Phase 10 should persist request metadata through the canonical private listing requirement mutation variant.',
)
assert.match(
  privateListingSource,
  /request_metadata: requestMetadata/,
  'Phase 10 should preserve portal request metadata on ensured private listing requirement rows.',
)
assert.match(
  privateListingSource,
  /\.\.\.\(Object\.keys\(portalRequest\)\.length \? \{ portalRequest \} : \{\}\)/,
  'Phase 10 should retain portalRequest inside generated_from for fallback schemas.',
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
  /function portalRequestAllowsSellerDocumentRequest/,
  'Phase 10 should suppress agent-managed portal request rows before issuing seller document requests.',
)
assert.match(
  requestOrchestratorSource,
  /reason: 'agent_managed_portal_request'/,
  'Phase 10 should expose a specific suppression reason for agent-managed base pack rows.',
)
assert.match(
  requestOrchestratorSource,
  /sellerUploadAllowed/,
  'Phase 10 should respect seller upload eligibility in portal request metadata.',
)
assert.match(
  requestOrchestratorSource,
  /agentManaged/,
  'Phase 10 should respect agent-managed portal request metadata.',
)
assert.match(
  requestOrchestratorSource,
  /portalRequest: item\.portalRequest/,
  'Phase 10 should persist portal request metadata when issuing seller document requests.',
)
assert.match(
  packageSource,
  /"test:kingstons-seller-documents-phase10-idempotent-portal-sync": "node scripts\/kingstons-seller-documents-phase10-idempotent-portal-sync\.test\.mjs"/,
  'Phase 10 should be wired into package scripts.',
)

console.log('Kingstons seller documents Phase 10 idempotent portal sync checks passed.')
