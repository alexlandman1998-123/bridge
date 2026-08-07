import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const agencyPagePath = path.join(repoRoot, 'src/pages/agency/AgencyPipelinePage.jsx')
const agencyPage = fs.readFileSync(agencyPagePath, 'utf8')

function assertIncludes(snippet, message) {
  assert.ok(agencyPage.includes(snippet), message)
}

assertIncludes(
  "const KINGSTONS_SELLER_PACK_LISTING_HANDOFF_SOURCE = 'kingstons_seller_pack_phase4_listing_handoff'",
  'Phase 4 listing handoff must use a stable Kingston source marker.',
)
assertIncludes(
  'function buildKingstonsSellerPackListingHandoffPayload',
  'Phase 4 must build an explicit Seller Pack listing handoff payload.',
)
assertIncludes(
  'kingstonsSellerPack: sellerPackFacts',
  'Listing canonical seller facts must retain the Seller Pack evidence bundle.',
)
assertIncludes(
  'sellerCanonicalFactReadiness',
  'Listing handoff must carry readiness flags for downstream listing checks.',
)
assertIncludes(
  "mandateStatus: packSummary.complete ? 'signed_uploaded' : 'not_started'",
  'Completed Kingston Seller Pack must mark the listing mandate as physically uploaded.',
)
assertIncludes(
  'const hasKingstonsSellerPackListingHandoff = kingstonsListingHandoffPayload?.complete === true',
  'Listing creation must treat completed Kingston Seller Pack as handoff evidence.',
)
assertIncludes(
  "const listingStatusForCreation = listingMandateSigned ? 'mandate_signed' : 'seller_lead'",
  'Completed Kingston Seller Pack must create the listing in the mandate-signed lifecycle state.',
)
assertIncludes(
  '...(kingstonsListingHandoffPayload?.listingPayload || {})',
  'Create listing payload must include Kingston seller type and canonical handoff facts.',
)
assertIncludes(
  'await updatePrivateListing(createdListingId, {',
  'Existing listing shells must be patched with Kingston listing handoff facts.',
)
assertIncludes(
  'syncKingstonsSellerPackToListing(createdListingId, selectedLead, kingstonsListingHandoffPayload)',
  'Seller Pack document linking must receive the Phase 4 handoff payload.',
)
assertIncludes(
  'kingstonsSellerPackListingHandoff: kingstonsListingHandoffPayload',
  'Runtime listing drafts must also retain the Kingston handoff bundle.',
)
assertIncludes(
  'activityNote: selectedLeadHasKingstonsPipelineSignal',
  'Lead activity must record the Kingston listing handoff path.',
)

console.log('Kingstons listing handoff phase 4 guard passed.')
