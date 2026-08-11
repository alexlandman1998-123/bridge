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

assert.match(source, /BUYER_OTP_DOCUMENT_STORAGE_FOLDER = 'buyer-otp-documents'/)
assert.match(source, /BUYER_OTP_DOCUMENT_TYPE = 'uploaded_otp'/)
assert.match(source, /function uploadBuyerOfferDocumentFile/)

assert.match(source, /async function handleSendBuyerOnboardingFromAppointment/)
assert.match(source, /Buyer onboarding link sent\./)
assert.match(source, /toStage: nextStage/)
assert.match(source, /'Buyer onboarding sent'/)

assert.match(source, /async function handleUploadBuyerOfferDocument/)
assert.match(source, /agent_otp_upload/)
assert.match(source, /document_type: BUYER_OTP_DOCUMENT_TYPE/)
assert.match(source, /OTP uploaded and buyer moved to OTP transaction\./)
assert.match(source, /'OTP Transaction'/)

assert.match(source, /Buyer Onboarding \+ OTP Transaction/)
assert.match(source, /Send Buyer Onboarding/)
assert.match(source, /Upload OTP/)
assert.match(source, /Upload the OTP once it is available/)
assert.match(source, /Uploaded OTP/)

assert.doesNotMatch(source, /Send Offer Link/)
assert.doesNotMatch(source, /Offer CTA/)
assert.doesNotMatch(source, /OTP \/ offer documents/)
assert.doesNotMatch(source, /generate the buyer offer link/)

console.log('Buyer process Phase 4 onboarding + OTP upload contract passed.')
