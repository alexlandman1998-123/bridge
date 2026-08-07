import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const agencyPagePath = path.join(repoRoot, 'src/pages/agency/AgencyPipelinePage.jsx')
const listingDetailPath = path.join(repoRoot, 'src/pages/AgentListingDetail.jsx')
const agencyPage = fs.readFileSync(agencyPagePath, 'utf8')
const listingDetail = fs.readFileSync(listingDetailPath, 'utf8')

function assertIncludes(source, snippet, message) {
  assert.ok(source.includes(snippet), message)
}

for (const source of [agencyPage, listingDetail]) {
  assertIncludes(
    source,
    "kingstons_seller_pack_phase5_transaction_handoff",
    'Phase 5 transaction handoff must use a stable Kingston handoff source marker.',
  )
  assertIncludes(
    source,
    'runKingstonsSellerPackTransactionHandoff',
    'Accepted-offer conversion must call a scoped Kingston Seller Pack transaction handoff helper.',
  )
  assertIncludes(
    source,
    'markPrivateListingDocumentsPendingTransactionPromotion',
    'Phase 5 must queue listing Seller Pack documents for transaction promotion.',
  )
  assertIncludes(
    source,
    'repairSellerDocumentTransactionContinuity',
    'Phase 5 must invoke the idempotent continuity repair after queuing Seller Pack documents.',
  )
}

assertIncludes(
  agencyPage,
  'KINGSTONS_SELLER_PACK_TRANSACTION_REQUIREMENT_KEYS',
  'Lead workspace conversion must use the explicit three-document transaction handoff key set.',
)
for (const requirementKey of ['signed_mandate', 'property_condition_disclosure', 'signed_fica_form']) {
  assertIncludes(
    agencyPage,
    `'${requirementKey}'`,
    `Lead workspace handoff must include ${requirementKey}.`,
  )
}
assertIncludes(
  agencyPage,
  'listingFacts.kingstonsSellerPack || listingFacts.sellerPackHandoff',
  'Buyer lead conversion must recognize listings that already carry Kingston Seller Pack handoff facts.',
)
assertIncludes(
  agencyPage,
  'const handoffResult = await runKingstonsSellerPackTransactionHandoff({',
  'Lead workspace accepted-offer conversion must run Seller Pack transaction handoff after transaction creation.',
)
assertIncludes(
  agencyPage,
  'const transactionHandoffWarning = sellerPackPromotionError || onboardingSendWarning',
  'Lead workspace conversion must surface Seller Pack handoff failure without blocking transaction creation.',
)

assertIncludes(
  listingDetail,
  'if (transactionId && listingRecord?.id && listingHasKingstonsSellerProcess)',
  'Listing detail accepted-offer conversion must scope Seller Pack handoff to Kingston listings only.',
)
assertIncludes(
  listingDetail,
  'Transaction ready. Confirm the preferred bond originator before sending buyer onboarding.',
  'Non-Kingston listing conversion must keep the normal transaction-ready message.',
)
assertIncludes(
  listingDetail,
  'Transaction ready. Seller Pack documents were queued for transaction handoff.',
  'Kingston listing conversion must confirm Seller Pack transaction handoff queuing.',
)

console.log('Kingstons transaction handoff phase 5 guard passed.')
