import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  KINGSTONS_BUYER_OTP_OFFER_LINK_VERSION,
  buildKingstonsBuyerOtpOfferLink,
  buildKingstonsBuyerOtpReadiness,
} from '../src/core/transactions/kingstonsBuyerOtpReadiness.js'

const repoRoot = process.cwd()
const listingDetailSource = fs.readFileSync(path.join(repoRoot, 'src/pages/AgentListingDetail.jsx'), 'utf8')

function assertIncludes(snippet, message) {
  assert.ok(listingDetailSource.includes(snippet), message)
}

const link = buildKingstonsBuyerOtpOfferLink({
  offer: {
    canonicalOfferId: 'offer-1',
    buyerLeadId: 'buyer-lead-1',
    buyerContactId: 'buyer-contact-1',
    buyerName: 'Client Buyer',
  },
  document: {
    id: 'doc-1',
    document_name: 'Signed OTP - Client Buyer - offer-1.pdf',
    storage_path: 'private-listings/listing-1/documents/signed-otp.pdf',
    status: 'uploaded',
  },
  actor: {
    id: 'agent-1',
    name: 'Agent One',
    email: 'agent@kingstons.test',
  },
  now: '2026-08-07T10:00:00.000Z',
})

assert.equal(link.version, KINGSTONS_BUYER_OTP_OFFER_LINK_VERSION)
assert.equal(link.status, 'signed_otp_received')
assert.equal(link.document_type, 'signed_otp')
assert.equal(link.offerId, 'offer-1')
assert.equal(link.buyerLeadId, 'buyer-lead-1')
assert.equal(link.actorEmail, 'agent@kingstons.test')

const readiness = buildKingstonsBuyerOtpReadiness({ documents: [link] })
assert.equal(readiness.gate.offerConversionReady, true)
assert.equal(readiness.summary.ready, 1)

assertIncludes(
  'buildKingstonsBuyerOtpOfferLink',
  'Listing workspace must build a durable Kingston buyer OTP offer link after upload.',
)
assertIncludes(
  'kingstonsBuyerOtp: kingstonsBuyerOtpLink',
  'Signed OTP upload must write the link payload onto the canonical offer.',
)
assertIncludes(
  'signedOtpDocument: kingstonsBuyerOtpLink',
  'Signed OTP upload must preserve a generic signed OTP document pointer for later transaction handoff.',
)
assertIncludes(
  "kingstonsBuyerOtpStatus: 'signed_otp_received'",
  'Canonical offer conditions must expose signed_otp_received after upload.',
)
assertIncludes(
  'await updateCanonicalOfferStatus(offer.canonicalOfferId',
  'Signed OTP upload must persist the OTP link to the canonical offer.',
)
assertIncludes(
  'kingstonsBuyerOtpReadiness?.gate?.offerConversionReady !== true',
  'Kingston offer conversion must be blocked until Signed OTP readiness passes.',
)
assertIncludes(
  'Upload the manually signed OTP before converting this Kingston buyer offer.',
  'Blocked Kingston conversion must explain that the manual Signed OTP is required.',
)

console.log('Kingstons buyer OTP offer link phase 3 guard passed.')
