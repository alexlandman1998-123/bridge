import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  KINGSTONS_BUYER_OTP_TRANSACTION_HANDOFF_SOURCE,
} from '../src/core/transactions/kingstonsBuyerOtpReadiness.js'

const repoRoot = process.cwd()
const listingDetailPath = path.join(repoRoot, 'src/pages/AgentListingDetail.jsx')
const privateListingServicePath = path.join(repoRoot, 'src/services/privateListingService.js')
const listingDetailSource = fs.readFileSync(listingDetailPath, 'utf8')
const privateListingServiceSource = fs.readFileSync(privateListingServicePath, 'utf8')

function assertIncludes(source, snippet, message) {
  assert.ok(source.includes(snippet), message)
}

assert.equal(
  KINGSTONS_BUYER_OTP_TRANSACTION_HANDOFF_SOURCE,
  'kingstons_buyer_otp_phase4_transaction_handoff',
  'Buyer OTP transaction handoff must expose a stable phase 4 source marker.',
)

assertIncludes(
  listingDetailSource,
  'KINGSTONS_BUYER_OTP_TRANSACTION_HANDOFF_SOURCE',
  'Listing conversion must import the Kingston buyer OTP transaction handoff source.',
)
assertIncludes(
  listingDetailSource,
  'runKingstonsBuyerOtpTransactionHandoff',
  'Accepted-offer conversion must call a scoped Kingston buyer OTP transaction handoff helper.',
)
assertIncludes(
  listingDetailSource,
  'const buyerOtpHandoffResult = await runKingstonsBuyerOtpTransactionHandoff({',
  'Accepted-offer conversion must run buyer OTP handoff after the transaction exists.',
)
assertIncludes(
  listingDetailSource,
  'offer: { ...offerRow, kingstonsBuyerOtpReadiness }',
  'Buyer OTP handoff must use the accepted offer readiness calculated before conversion.',
)
assertIncludes(
  listingDetailSource,
  'readiness?.gate?.transactionHandoffReady !== true',
  'Buyer OTP handoff must honor the transaction handoff readiness gate.',
)
assertIncludes(
  listingDetailSource,
  'const buyerOtpDocumentIds = [...new Set(',
  'Buyer OTP handoff must derive the accepted offer document IDs before promotion.',
)
assertIncludes(
  listingDetailSource,
  'documentIds: buyerOtpDocumentIds',
  'Buyer OTP handoff must pass exact accepted offer document IDs into promotion.',
)
assertIncludes(
  listingDetailSource,
  '!queued?.updatedCount',
  'Buyer OTP handoff must warn if the exact signed OTP document cannot be queued.',
)
assertIncludes(
  listingDetailSource,
  'requirementKeys: [KINGSTONS_BUYER_OTP_REQUIREMENT.key]',
  'Buyer OTP handoff must still constrain promotion to the signed OTP requirement.',
)
assertIncludes(
  listingDetailSource,
  'repairSellerDocumentTransactionContinuity({ listingId })',
  'Buyer OTP handoff must invoke the continuity repair after queuing the signed OTP.',
)
assertIncludes(
  listingDetailSource,
  'Signed OTP handoff needs attention before transaction document readiness.',
  'Buyer OTP handoff failures must be visible without blocking transaction creation.',
)
assertIncludes(
  listingDetailSource,
  'Seller Pack documents were queued for transaction handoff. Signed OTP was queued for transaction handoff.',
  'Successful Kingston conversion must confirm both Seller Pack and Signed OTP transaction handoff.',
)

assertIncludes(
  privateListingServiceSource,
  'documentIds = []',
  'Private listing transaction promotion must accept an exact document ID filter.',
)
assertIncludes(
  privateListingServiceSource,
  'const requestedDocumentIds = Array.isArray(documentIds) ? documentIds : []',
  'Private listing transaction promotion must track whether document ID filtering was requested.',
)
assertIncludes(
  privateListingServiceSource,
  'if (requestedDocumentIds.length && !targetDocumentIds.has(normalizedDocumentId)) return false',
  'Private listing transaction promotion must avoid broad promotion when exact document IDs are supplied.',
)
assertIncludes(
  privateListingServiceSource,
  'targetDocumentIds: [...targetDocumentIds]',
  'Promotion activity metadata must record the requested exact document IDs.',
)

console.log('Kingstons buyer OTP transaction handoff phase 4 guard passed.')
