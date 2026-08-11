import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const source = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')

assert.equal(
  packageJson.scripts?.['test:buyer-process-onboarding-offer-upload-phase4'],
  'node scripts/buyer-process-onboarding-offer-upload-phase4.test.mjs',
  'package.json should expose the buyer process onboarding + OTP upload Phase 4 contract.',
)

assert.match(source, /BUYER_OFFER_DOCUMENT_STORAGE_FOLDER = 'buyer-offer-documents'/)
assert.match(source, /BUYER_OFFER_DOCUMENT_TYPE = 'buyer_offer'/)
assert.match(source, /BUYER_OFFER_DOCUMENT_LABEL = 'Signed OTP'/)
assert.match(source, /function uploadBuyerOfferDocumentFile/)

assert.match(source, /async function handleSendBuyerOnboardingFromAppointment/)
assert.match(source, /Buyer onboarding link sent\./)
assert.match(source, /toStage: nextStage/)
assert.match(source, /'Buyer onboarding sent'/)

assert.match(source, /async function handleUploadBuyerOfferDocument/)
assert.match(source, /agent_signed_otp_upload/)
assert.match(source, /document_type: BUYER_OFFER_DOCUMENT_TYPE/)
assert.match(source, /createCanonicalOffer\(\{/)
assert.match(source, /status: 'accepted'/)
assert.match(source, /Signed OTP uploaded and buyer moved to Signed OTP received\./)
assert.match(source, /'Signed OTP received'/)

assert.match(source, /<h3 className="text-2xl font-semibold text-\[#0c2440\]">Signed OTP<\/h3>/)
assert.match(source, /Send Buyer Onboarding/)
assert.match(source, /Upload Signed OTP/)
assert.match(source, /Upload the signed OTP once it is available/)

assert.doesNotMatch(source, /Send Offer Link/)
assert.doesNotMatch(source, /Offer CTA/)
assert.doesNotMatch(source, /OTP \/ offer documents/)
assert.doesNotMatch(source, /generate the buyer offer link/)

console.log('Buyer process Phase 4 onboarding + OTP upload contract passed.')
