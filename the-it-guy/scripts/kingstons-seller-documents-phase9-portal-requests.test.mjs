import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = process.cwd()
const agencyPipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const privateListingSource = readFileSync(resolve(appRoot, 'src/services/privateListingService.js'), 'utf8')

function assertAgencyIncludes(token, message) {
  assert.ok(agencyPipelineSource.includes(token), message)
}

function assertPrivateListingIncludes(token, message) {
  assert.ok(privateListingSource.includes(token), message)
}

assertAgencyIncludes(
  "const KINGSTONS_SELLER_PACK_PORTAL_REQUEST_SYNC_SOURCE = 'kingstons_seller_pack_phase9_portal_request_sync'",
  'Phase 9 should use a stable source marker for Seller Pack portal request sync.',
)
assertAgencyIncludes(
  'function getKingstonsSellerPackPortalRequestMeta',
  'Phase 9 should derive portal request metadata from every Seller Pack requirement row.',
)
assertAgencyIncludes(
  "requestDeliveryChannels: ['seller_portal']",
  'Phase 9 requests should be explicitly targeted at the seller portal.',
)
assertAgencyIncludes(
  'requestDedupeKey: `kingstons_seller_pack:${key}`',
  'Phase 9 should dedupe seller portal requests by Seller Pack requirement key.',
)
assertAgencyIncludes(
  'function buildKingstonsSellerPackPortalRequestRows',
  'Phase 9 should expose normalized portal request rows for the handoff payload.',
)
assertAgencyIncludes(
  'portalRequests = buildKingstonsSellerPackPortalRequestRows(rows)',
  'Phase 9 listing handoff should include portal request rows in Seller Pack facts.',
)
assertAgencyIncludes(
  'sellerPortalRequestSource: KINGSTONS_SELLER_PACK_PORTAL_REQUEST_SYNC_SOURCE',
  'Phase 9 should stamp Seller Pack facts and listing activity metadata with the portal request source.',
)
assertAgencyIncludes(
  'sellerPortalDocumentRequests: portalRequests',
  'Phase 9 listing activity should preserve the portal request list for downstream portal sync.',
)
assertAgencyIncludes(
  "{ reason: KINGSTONS_SELLER_PACK_PORTAL_REQUEST_SYNC_SOURCE }",
  'Phase 9 private-listing requirement sync should carry the portal request source reason.',
)
assertAgencyIncludes(
  "previousSource: 'kingstons_seller_lead_pack_phase7_readiness_gate'",
  'Phase 9 should preserve the Phase 7 readiness-gate lineage in generated requirement metadata.',
)
assertPrivateListingIncludes(
  "authority_documents: 'seller_identity'",
  'Phase 9 should normalize authority document requirement rows into a supported private-listing requirement group.',
)

console.log('Kingstons seller documents Phase 9 portal request checks passed.')
