import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const source = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const transactionDetailSource = readFileSync(resolve(appRoot, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const apiSource = readFileSync(resolve(appRoot, 'src/lib/api.js'), 'utf8')
const agencyCrmRepositorySource = readFileSync(resolve(appRoot, 'src/lib/agencyCrmRepository.js'), 'utf8')

assert.equal(
  packageJson.scripts?.['test:buyer-process-onboarding-offer-upload-phase4'],
  'node scripts/buyer-process-onboarding-offer-upload-phase4.test.mjs',
  'package.json should expose the buyer process onboarding + OTP upload Phase 4 contract.',
)

assert.match(source, /BUYER_OTP_DOCUMENT_STORAGE_FOLDER = 'buyer-otp-documents'/)
assert.match(source, /BUYER_OTP_DOCUMENT_TYPE = 'uploaded_otp'/)
assert.match(source, /function uploadBuyerOfferDocumentFile/)

assert.match(source, /async function handleSendBuyerOnboardingFromAppointment/)
assert.match(source, /Buyer onboarding link sent from the buyer process/)
assert.match(source, /toStage: nextStage/)
assert.match(source, /'Transaction Setup'/)

assert.match(source, /async function handleUploadBuyerOfferDocument/)
assert.match(source, /agent_otp_upload/)
assert.match(source, /document_type: BUYER_OTP_DOCUMENT_TYPE/)
assert.match(source, /OTP uploaded and buyer moved to Transaction Setup\./)
assert.match(source, /handleUpdateLeadStage\(selectedLead\.leadId, 'Transaction Setup'/)
assert.match(source, /selectedLeadHasKingstonsBuyerSignal/)
assert.match(source, /selectedKingstonsTermsContextIsBuyerOtp = selectedLeadHasKingstonsBuyerSignal/)
assert.match(source, /selectedLeadUsesKingstonsInPersonOtpFlow/)

assert.match(source, /label: 'Transaction Setup'/)
assert.match(source, /Send Buyer Onboarding/)
assert.match(source, /Upload Signed OTP/)
assert.match(source, /'Upload Signed OTP'/)
assert.match(source, /buyer-transaction-setup-checklist/)
assert.match(source, /Signed OTP uploaded/)
assert.match(source, /buyerTransactionSetupActionId/)
assert.match(source, /async function recordBuyerTransactionSetupAction/)
assert.match(source, /async function ensureBuyerTransactionSetupContext/)
assert.match(source, /async function handleBuyerTransactionSetupChecklistAction/)
assert.match(source, /async function handleBuyerCommandConvertToTransaction/)
assert.match(source, /creationMode: 'buyer_onboarding_intake'/)
assert.match(source, /creationMode: 'signed_otp_intake'/)
assert.match(source, /async function promoteBuyerOnboardingDraftToTransaction/)
assert.match(source, /canonical transaction evidence could not be recorded/)
assert.match(source, /Complete signed OTP intake/)
assert.match(source, /transactionStage: 'Transaction Setup'/)
assert.match(source, /buyer_transaction_setup_bond_originator/)
assert.match(source, /buyer_transaction_setup_transfer_attorney/)
assert.match(source, /buyer_transaction_setup_finalize/)
assert.match(source, /Complete Transaction Setup before moving the buyer to Transaction/)
assert.match(source, /Upload the signed OTP before moving the buyer to Transaction/)
assert.match(source, /status: 'finalized'/)
assert.match(source, /moveToSetupStage: false/)
assert.match(source, /confirmedSignedByAllParties/)
assert.match(source, /confirmedArch9TermsIncluded/)
assert.match(source, /signedByAllPartiesConfirmed/)
assert.match(source, /arch9TermsIncludedConfirmed/)
assert.match(source, /Confirm the OTP is signed by all required parties\./)
assert.match(source, /Confirm the Arch9 terms and conditions are included in the OTP\./)
assert.match(source, /Uploaded OTP/)

assert.match(
  agencyCrmRepositorySource,
  /corePayload\.converted_transaction_id = normalizeNullableUuid\(patch\.convertedTransactionId \|\| patch\.convertedDealId\)/,
  'Lead conversion should persist convertedTransactionId/convertedDealId into converted_transaction_id for transaction handoff recovery.',
)

assert.match(apiSource, /async function fetchBuyerProcessLeadHandoffForTransaction/)
assert.match(apiSource, /\.from\('leads'\)/)
assert.match(apiSource, /\.eq\('converted_transaction_id', transactionId\)/)
assert.match(apiSource, /buyerProcessLeadHandoff/)

assert.match(transactionDetailSource, /function buildBuyerProcessHandoffModel/)
assert.match(transactionDetailSource, /function BuyerProcessHandoffPanel/)
assert.match(transactionDetailSource, /Buyer Process Handoff/)
assert.match(transactionDetailSource, /buyerProcessLeadHandoff/)
assert.match(transactionDetailSource, /buyerOtpSignedByAllPartiesConfirmed/)
assert.match(transactionDetailSource, /buyerOtpArch9TermsIncludedConfirmed/)
assert.match(transactionDetailSource, /Signed by all parties/)
assert.match(transactionDetailSource, /Arch9 terms/)
assert.match(transactionDetailSource, /bondOriginatorAction/)
assert.match(transactionDetailSource, /transferAttorneyAction/)
assert.match(transactionDetailSource, /buyerPortalAction/)
assert.match(transactionDetailSource, /buyerProcessHandoff=\{buyerProcessHandoff\}/)

assert.doesNotMatch(source, /Send Offer Link/)
assert.doesNotMatch(source, /Offer CTA/)
assert.doesNotMatch(source, /OTP \/ offer documents/)
assert.doesNotMatch(source, /generate the buyer offer link/)

console.log('Buyer process Phase 4 onboarding + OTP upload contract passed.')
