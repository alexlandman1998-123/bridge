import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { getMissingSellerPackListingDocuments } from '../src/services/sellerPackHandoffContinuity.js'

const repoRoot = process.cwd()
const agencyPagePath = path.join(repoRoot, 'src/pages/agency/AgencyPipelinePage.jsx')
const privateListingServicePath = path.join(repoRoot, 'src/services/privateListingService.js')
const sellerPortalActivationPath = path.join(repoRoot, 'src/services/sellerPortalActivationService.js')
const emailRouterPath = path.join(repoRoot, '../supabase/functions/send-email/index.ts')
const agencyPage = fs.readFileSync(agencyPagePath, 'utf8')
const privateListingService = fs.readFileSync(privateListingServicePath, 'utf8')
const sellerPortalActivation = fs.readFileSync(sellerPortalActivationPath, 'utf8')
const emailRouter = fs.readFileSync(emailRouterPath, 'utf8')

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
  'requirementKey: SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM',
  'Signed Defect Form must map to the canonical signed disclosure requirement.',
)
assertIncludes(
  agencyPage,
  "documentCategory: 'property_condition_disclosure'",
  'Signed Defect Form must preserve the property condition disclosure category for listing requirements.',
)
assertIncludes(
  agencyPage,
  "requirementKey: 'seller_fica_declaration'",
  'Signed FICA Declaration must create/link a dedicated listing requirement.',
)
assertIncludes(
  agencyPage,
  "documentCategory: 'fica'",
  'Signed FICA Declaration must preserve the FICA category for listing requirements.',
)
assertIncludes(
  agencyPage,
  'sellerPackSyncResult = await syncKingstonsSellerPackToListing(createdListingId, selectedLead, kingstonsListingHandoffPayload)',
  'Create listing must run Seller Pack handoff immediately after listing creation with the listing handoff payload.',
)
assertIncludes(
  agencyPage,
  "const failures = results.filter((row) => row.status === 'failed')",
  'Seller Pack handoff must allow generated seller portal request rows that do not have uploaded files yet.',
)
assertIncludes(
  agencyPage,
  'selectedLeadValuationAddress',
  'Seller lead listing creation should be able to fall back to the valuation appointment address.',
)
assertIncludes(
  agencyPage,
  'Listing created, Seller Pack linked, and Seller Portal link sent.',
  'Kingstons listing creation should send the seller portal link after the Seller Pack handoff.',
)
assertIncludes(
  agencyPage,
  'if (!sellerPackSyncError && isValidEmail(sellerEmail))',
  'Seller Portal auto-send must wait until Seller Pack handoff succeeds.',
)
assertIncludes(
  agencyPage,
  'retryKingstonsSellerPackListingHandoff',
  'A partial Seller Pack listing handoff must be retryable from the lead workspace.',
)
assertIncludes(
  agencyPage,
  'getMissingSellerPackListingDocuments(selectedKingstonsSellerPackRows, listing.documents)',
  'A retry must reload the canonical listing and confirm each uploaded file was linked.',
)
assert.ok(
  !privateListingService.slice(privateListingService.indexOf('export async function linkPrivateListingDocument'), privateListingService.indexOf('export async function linkPrivateListingDocument') + 1500).includes('.limit(25)'),
  'Link retries must check all existing listing documents before inserting a duplicate.',
)
assert.deepEqual(
  getMissingSellerPackListingDocuments(
    [{ key: 'signed_mandate', storagePath: 'seller/a.pdf' }, { key: 'fica', fileUrl: 'https://example.test/b.pdf' }, { key: 'future_request' }],
    [{ storage_path: 'seller/a.pdf' }],
  ).map((row) => row.key),
  ['fica'],
  'Only uploaded files missing from the listing should be reported; future portal requests are not failures.',
)
assert.deepEqual(
  getMissingSellerPackListingDocuments([{ key: 'signed_mandate', storagePath: 'seller/a.pdf' }], [{ storage_path: 'seller/a.pdf' }]),
  [],
  'A successful retry must clear the handoff warning.',
)
assertIncludes(sellerPortalActivation, "invokeEdgeFunction('send-email'", 'Seller Portal activation must call the email function.')
assertIncludes(sellerPortalActivation, "? 'seller_lead'", 'Seller lead invitations must identify the seller lead email template.')
assertIncludes(sellerPortalActivation, 'to: sellerEmail', 'Seller Portal invitations must be addressed to the resolved seller email.')
assertIncludes(emailRouter, '"seller_portal_link"', 'The email function must route Seller Portal invitations.')
assertIncludes(
  agencyPage,
  'Listing created and Seller Pack linked to the listing documents.',
  'Successful handoff should tell the agent the listing documents were linked.',
)

console.log('Kingstons seller pack phase 2 handoff guard passed.')
