import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const listingDetailPath = path.join(repoRoot, 'src/pages/AgentListingDetail.jsx')
const listingDetailSource = fs.readFileSync(listingDetailPath, 'utf8')

function assertIncludes(snippet, message) {
  assert.ok(listingDetailSource.includes(snippet), message)
}

assertIncludes(
  'buildKingstonsBuyerOtpReadiness',
  'Listing offer workspace must use the Kingston buyer OTP readiness rule.',
)
assertIncludes(
  'KINGSTONS_BUYER_OTP_REQUIREMENT',
  'Listing offer workspace must use the canonical Kingston Signed OTP requirement key.',
)
assertIncludes(
  'documentMatchesKingstonsBuyerOtpOffer',
  'Listing offer workspace must match signed OTP uploads back to the selected offer.',
)
assertIncludes(
  'const [buyerOtpUploadKey, setBuyerOtpUploadKey] = useState',
  'Listing offer workspace must track buyer OTP upload progress independently from Seller Pack uploads.',
)
assertIncludes(
  'async function handleKingstonsBuyerOtpUpload',
  'Listing offer workspace must expose a dedicated Kingston buyer OTP upload handler.',
)
assertIncludes(
  'documentType: KINGSTONS_BUYER_OTP_REQUIREMENT.key',
  'Kingston buyer OTP uploads must be stored with the signed_otp document type.',
)
assertIncludes(
  "documentCategory: 'buyer_offer'",
  'Kingston buyer OTP uploads must be grouped as buyer offer documents.',
)
assertIncludes(
  'kingstonsBuyerOtpReadiness: buildKingstonsBuyerOtpReadiness',
  'Offer rows must expose Kingston buyer OTP readiness for rendering and later gates.',
)
assertIncludes(
  'data-testid="kingstons-buyer-otp-upload"',
  'Offer table must render the Kingston Signed OTP upload control.',
)
assertIncludes(
  'data-testid="kingstons-buyer-otp-upload-card"',
  'Offer card workspace must render the Kingston Signed OTP upload control.',
)
assertIncludes(
  'onChange={(event) => void handleKingstonsBuyerOtpUpload(offer, event)}',
  'Kingston Signed OTP file inputs must call the dedicated upload handler.',
)
assertIncludes(
  'accept=".pdf,image/*"',
  'Kingston Signed OTP uploads must accept scanned PDFs and image captures.',
)
assertIncludes(
  'listingHasKingstonsSellerProcess ? (',
  'Kingston buyer OTP upload controls must remain scoped to Kingston listings.',
)

console.log('Kingstons buyer OTP upload phase 2 guard passed.')
