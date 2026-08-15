import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = process.cwd()
const agencyPipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const privateListingSource = readFileSync(resolve(appRoot, 'src/services/privateListingService.js'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

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
  "isGenerated\n    ? ['seller_portal']",
  'Phase 9 should target generated supporting documents at the seller portal.',
)
assertAgencyIncludes(
  "requestedFromRole: isGenerated ? 'seller' : 'agent'",
  'Phase 9 should keep baseline Seller Pack documents agent-managed instead of seller-uploadable.',
)
assertAgencyIncludes(
  "isDisclosure\n      ? ['disclosure_link', 'agency_workspace']",
  'Phase 9 disclosure requests should route through disclosure link or agency workspace upload.',
)
assertAgencyIncludes(
  "isFicaDeclaration\n        ? ['seller_onboarding_link', 'agency_workspace']",
  'Phase 9 FICA declaration requests should route through seller onboarding or agency upload.',
)
assertAgencyIncludes(
  'requestDedupeKey: `kingstons_seller_pack:${key}`',
  'Phase 9 should dedupe seller portal requests by Seller Pack requirement key.',
)
assertAgencyIncludes(
  "requestAction: isMandate\n      ? 'agent_physical_upload'",
  'Phase 9 should mark signed mandate as an agent physical-upload action.',
)
assertAgencyIncludes(
  "'seller_onboarding_or_agent_physical_upload_with_context'",
  'Phase 9 should mark signed FICA declaration as onboarding or contextual physical-upload.',
)
assertAgencyIncludes(
  'function buildKingstonsSellerPackPortalRequestRows',
  'Phase 9 should expose normalized portal request rows for the handoff payload.',
)
assertAgencyIncludes(
  'agentManaged: portalRequest.agentManaged',
  'Phase 9 should expose agent-managed request state on normalized portal request rows.',
)
assertAgencyIncludes(
  'sellerUploadAllowed: portalRequest.sellerUploadAllowed',
  'Phase 9 should expose whether a row can be uploaded by the seller portal.',
)
assertAgencyIncludes(
  'allowedCompletionRoutes: portalRequest.allowedCompletionRoutes',
  'Phase 9 should carry canonical base-pack completion routes into request rows.',
)
assertAgencyIncludes(
  'portalRequests = buildKingstonsSellerPackPortalRequestRows(rows)',
  'Phase 9 listing handoff should include portal request rows in Seller Pack facts.',
)
assertAgencyIncludes(
  'completionRoute: normalizeText(documentRow.completionRoute || documentRow.completion_route)',
  'Phase 9 listing handoff documents should preserve Seller Pack completion routes.',
)
assertAgencyIncludes(
  'ficaDeclarationContext: documentRow.ficaDeclarationContext || documentRow.fica_declaration_context || null',
  'Phase 9 listing handoff documents should preserve physical FICA declaration context.',
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
  'physicalUploadContextRequired: portalRequest.physicalUploadContextRequired',
  'Phase 9 private-listing requirements should preserve whether FICA context is required.',
)
assertAgencyIncludes(
  'supportingFicaDocumentsDynamic: portalRequest.supportingFicaDocumentsDynamic',
  'Phase 9 private-listing requirements should preserve that supporting FICA documents are dynamic.',
)
assertAgencyIncludes(
  "previousSource: 'kingstons_seller_lead_pack_phase7_readiness_gate'",
  'Phase 9 should preserve the Phase 7 readiness-gate lineage in generated requirement metadata.',
)
assertPrivateListingIncludes(
  "authority_documents: 'seller_identity'",
  'Phase 9 should normalize authority document requirement rows into a supported private-listing requirement group.',
)
assert.equal(
  packageJson.scripts?.['test:kingstons-seller-documents-phase9-portal-requests'],
  'node scripts/kingstons-seller-documents-phase9-portal-requests.test.mjs',
  'Package scripts should expose the Phase 9 Seller Pack portal request guard.',
)

console.log('Kingstons seller documents Phase 9 portal request checks passed.')
