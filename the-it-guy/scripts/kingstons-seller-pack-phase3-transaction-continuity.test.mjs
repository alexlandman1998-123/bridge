import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const agencyPagePath = path.join(repoRoot, 'src/pages/agency/AgencyPipelinePage.jsx')
const listingDetailPath = path.join(repoRoot, 'src/pages/AgentListingDetail.jsx')
const privateListingServicePath = path.join(repoRoot, 'src/services/privateListingService.js')
const sellerBasePackContractPath = path.join(repoRoot, 'src/lib/sellerBasePackContract.js')
const agencyPage = fs.readFileSync(agencyPagePath, 'utf8')
const listingDetail = fs.readFileSync(listingDetailPath, 'utf8')
const privateListingService = fs.readFileSync(privateListingServicePath, 'utf8')
const sellerBasePackContract = fs.readFileSync(sellerBasePackContractPath, 'utf8')

function assertIncludes(source, snippet, message) {
  assert.ok(source.includes(snippet), message)
}

assertIncludes(
  privateListingService,
  'export async function markPrivateListingDocumentsPendingTransactionPromotion',
  'Private listing service must expose a helper for queuing Seller Pack documents for transaction promotion.',
)
assertIncludes(
  privateListingService,
  "pending_transaction_promotion: true",
  'Listing document rows must be markable as pending transaction promotion.',
)
assertIncludes(
  privateListingService,
  "promotion_status: 'pending_transaction'",
  'Queued Seller Pack documents must use the pending transaction promotion status.',
)
assertIncludes(
  sellerBasePackContract,
  "'signed_fica_form'",
  'Signed FICA Form must be a Seller Base Pack alias for the FICA declaration slot.',
)
assertIncludes(
  sellerBasePackContract,
  "'signed_defect_form'",
  'Signed Defect Form must be a Seller Base Pack alias for the mandatory disclosure slot.',
)
assertIncludes(
  privateListingService,
  'sellerBasePackKeysOverlap',
  'Private listing requirement matching must use the Seller Base Pack alias contract.',
)

assertIncludes(
  agencyPage,
  'pendingTransactionPromotion: true',
  'Seller lead to listing handoff must queue linked Seller Pack documents for transaction promotion.',
)
assertIncludes(
  agencyPage,
  "promotionStatus: 'pending_transaction'",
  'Seller lead to listing handoff must set the transaction promotion status explicitly.',
)
assertIncludes(
  agencyPage,
  "source: 'kingstons_seller_pack_transaction_continuity_phase3'",
  'Seller Pack handoff metadata must identify the phase 3 continuity path.',
)

assertIncludes(
  listingDetail,
  'repairSellerDocumentTransactionContinuity',
  'Accepted-offer conversion must invoke the transaction continuity repair service.',
)
assertIncludes(
  listingDetail,
  'markPrivateListingDocumentsPendingTransactionPromotion(listingRecord.id',
  'Accepted-offer conversion must queue Seller Pack listing documents before repair.',
)
assertIncludes(
  listingDetail,
  'SELLER_PACK_TRANSACTION_REQUIREMENT_KEYS',
  'Accepted-offer conversion must use an explicit Seller Pack requirement key set.',
)
for (const requirementKey of ['SIGNED_MANDATE', 'SIGNED_DISCLOSURE_FORM', 'SIGNED_FICA_DECLARATION']) {
  assertIncludes(
    listingDetail,
    `SELLER_BASE_PACK_KEYS.${requirementKey}`,
    `Accepted-offer conversion must include ${requirementKey} in the Seller Pack transaction key set.`,
  )
}
assertIncludes(
  listingDetail,
  'Seller Pack document handoff needs attention before attorney handoff.',
  'Promotion failures must be visible without blocking transaction creation.',
)

console.log('Kingstons seller pack phase 3 transaction continuity guard passed.')
