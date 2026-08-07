import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const agencyPagePath = path.join(repoRoot, 'src/pages/agency/AgencyPipelinePage.jsx')
const privateListingServicePath = path.join(repoRoot, 'src/services/privateListingService.js')
const agencyPage = fs.readFileSync(agencyPagePath, 'utf8')
const privateListingService = fs.readFileSync(privateListingServicePath, 'utf8')

function assertIncludes(source, snippet, message) {
  assert.ok(source.includes(snippet), message)
}

assertIncludes(
  privateListingService,
  'export async function ensurePrivateListingDocumentRequirements',
  'Private listing service must expose a requirement ensure helper for Seller Pack handoff.',
)
assertIncludes(
  privateListingService,
  'await updatePrivateListingRequirementStatus(linkedRequirementId',
  'Linked existing Seller Pack files must move the matched listing requirement to uploaded.',
)
assertIncludes(
  privateListingService,
  "mandateStatus: 'signed_uploaded'",
  'Linked signed mandate evidence must update listing mandate status.',
)

assertIncludes(
  agencyPage,
  'ensurePrivateListingDocumentRequirements',
  'Seller lead workspace must ensure listing document requirements before handoff.',
)
assertIncludes(
  agencyPage,
  'linkPrivateListingDocument',
  'Seller lead workspace must link existing Seller Pack storage objects to listing documents.',
)
assertIncludes(
  agencyPage,
  'async function syncKingstonsSellerPackToListing',
  'Seller lead workspace must own a Kingston Seller Pack to listing handoff routine.',
)
assertIncludes(
  agencyPage,
  "requirementKey: 'property_condition_disclosure'",
  'Signed Defect Form must map to the canonical property condition disclosure requirement.',
)
assertIncludes(
  agencyPage,
  "requirementKey: 'signed_fica_form'",
  'Signed FICA Form must create/link a dedicated listing requirement.',
)
assertIncludes(
  agencyPage,
  'sellerPackSyncResult = await syncKingstonsSellerPackToListing(createdListingId, selectedLead, kingstonsListingHandoffPayload)',
  'Create listing must run Seller Pack handoff immediately after listing creation with the listing handoff payload.',
)
assertIncludes(
  agencyPage,
  'Listing created and Seller Pack linked to the listing documents.',
  'Successful handoff should tell the agent the listing documents were linked.',
)

console.log('Kingstons seller pack phase 2 handoff guard passed.')
