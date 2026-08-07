import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const listingDetailPath = path.join(repoRoot, 'src/pages/AgentListingDetail.jsx')
const privateListingServicePath = path.join(repoRoot, 'src/services/privateListingService.js')
const listingDetail = fs.readFileSync(listingDetailPath, 'utf8')
const privateListingService = fs.readFileSync(privateListingServicePath, 'utf8')

function assertIncludes(source, snippet, message) {
  assert.ok(source.includes(snippet), message)
}

assertIncludes(
  listingDetail,
  'Seller Pack Transaction Handoff',
  'Listing documents tab must expose the Seller Pack transaction handoff panel.',
)
assertIncludes(
  listingDetail,
  'SELLER_PACK_TRANSACTION_REQUIREMENT_KEYS',
  'Phase 4 must use the explicit three-document Seller Pack key set.',
)
for (const requirementKey of ['signed_mandate', 'property_condition_disclosure', 'signed_fica_form']) {
  assertIncludes(
    listingDetail,
    `'${requirementKey}'`,
    `Phase 4 handoff panel must track ${requirementKey}.`,
  )
}
assertIncludes(
  listingDetail,
  'getSellerPackTransactionHandoffPresentation',
  'Phase 4 must present missing, queued, promoted, and attention states.',
)
assertIncludes(
  listingDetail,
  'handleRepairSellerPackTransactionHandoff',
  'Phase 4 must expose a scoped manual repair action.',
)
assertIncludes(
  listingDetail,
  "source: 'kingstons_seller_pack_phase4_manual_repair'",
  'Manual repair activity must identify the Kingston phase 4 path.',
)
assertIncludes(
  listingDetail,
  'repairSellerDocumentTransactionContinuity({ listingId: listingRecord.id })',
  'Manual repair must invoke the existing idempotent transaction continuity repair.',
)
assertIncludes(
  listingDetail,
  'pendingTransactionPromotion',
  'Phase 4 UI must read the listing document promotion queue flag.',
)
assertIncludes(
  listingDetail,
  'promotedDocumentId',
  'Phase 4 UI must read the promoted transaction document link.',
)
assertIncludes(
  privateListingService,
  'seller_pack_transaction_promotion_queued',
  'Queued handoff repair should leave an internal listing activity trail.',
)

console.log('Kingstons seller pack phase 4 operational handoff guard passed.')
