import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const source = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')

assert.equal(
  packageJson.scripts?.['test:buyer-process-onboarding-offer-upload-phase4'],
  'node scripts/buyer-process-onboarding-offer-upload-phase4.test.mjs',
  'package.json should expose the buyer process onboarding + offer upload Phase 4 contract.',
)

assert.match(source, /BUYER_OFFER_DOCUMENT_STORAGE_FOLDER = 'buyer-offer-documents'/)
assert.match(source, /BUYER_OFFER_DOCUMENT_TYPE = 'buyer_offer'/)
assert.match(source, /function uploadBuyerOfferDocumentFile/)

assert.match(source, /async function handleSendBuyerOnboardingFromAppointment/)
assert.match(source, /Buyer onboarding link sent\./)
assert.match(source, /toStage: nextStage/)
assert.match(source, /'Buyer onboarding sent'/)
assert.match(source, /title="Buyer Info"/)
assert.match(source, /selectedLeadBuyerInfoUnlocked/)
assert.match(source, /completedViewing \|\|/)
assert.match(source, /buyer\.person\.identity_number_or_passport_number/)
assert.match(source, /buyer\.person\.residential_address\.line_1/)
assert.match(source, /buyerOnboardingFormData/)
assert.match(source, /onboarding_form_data/)

assert.match(source, /async function handleUploadBuyerOfferDocument/)
assert.match(source, /agent_offer_document_upload/)
assert.match(source, /status: 'submitted'/)
assert.match(source, /document_type: BUYER_OFFER_DOCUMENT_TYPE/)
assert.match(source, /Offer document uploaded and buyer moved to Offer received\./)
assert.match(source, /'Offer received'/)

assert.match(source, /Buyer Onboarding \+ Offer Upload/)
assert.match(source, /Send Buyer Onboarding/)
assert.match(source, /Upload Offer Document/)
assert.match(source, /This creates the offer record from the uploaded evidence instead of generating an OTP\./)
assert.match(source, /Uploaded offer document/)

assert.doesNotMatch(source, /Send Offer Link/)
assert.doesNotMatch(source, /Offer CTA/)
assert.doesNotMatch(source, /OTP \/ offer documents/)
assert.doesNotMatch(source, /generate the buyer offer link/)

console.log('Buyer process Phase 4 onboarding + offer upload contract passed.')
