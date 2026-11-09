import { readDomainApiSource } from './helpers/domainApiSource.mjs'
import assert from 'node:assert/strict'
import { resolveBuyerLeadDocumentTarget } from '../src/core/documents/buyerLeadDocumentContract.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const source = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const transactionDetailSource = readFileSync(resolve(appRoot, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const apiSource = readDomainApiSource()
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
assert.match(source, /if \(!onboardingEmail\?\.data\?\.manualHandoff\) \{/)
assert.match(source, /isEarlyStage && !selectedLeadBuyerOnboardingSubmitted/)
assert.match(source, /rawEnquiryPayload: \{ \.\.\.rawPayload, buyerOnboarding \}/)
const manualCaptureSource = source.slice(source.indexOf('  async function handleCaptureBuyerOnboardingManually()'), source.indexOf('  async function handleSendBuyerOnboardingFromLead('))
assert.match(manualCaptureSource, /ensureBuyerOnboardingTransactionForLead/)
assert.match(manualCaptureSource, /getOrCreateTransactionOnboarding/)
assert.match(manualCaptureSource, /navigate\(`\/client\/onboarding\/\$\{encodeURIComponent\(onboarding.token\)\}`\)/)
assert.doesNotMatch(manualCaptureSource, /invokeEdgeFunction|createAndSendBuyerOnboardingForLead|submitClientOnboarding/)
assert.match(source, /data-testid="buyer-profile-onboarding-actions"/)
assert.match(source, /deliveryMode: CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL/)
assert.match(source, /toStage: nextStage/)
assert.match(source, /'Transaction Setup'/)

assert.match(source, /async function handleUploadBuyerOfferDocument/)
assert.match(source, /agent_otp_upload/)
assert.match(source, /document_type: BUYER_OTP_DOCUMENT_TYPE/)
assert.match(source, /OTP uploaded and buyer moved to Offer\./)
assert.match(source, /'Offer'/)
assert.match(source, /selectedLeadHasKingstonsBuyerSignal/)
assert.match(source, /selectedKingstonsTermsContextIsBuyerOtp = selectedLeadHasKingstonsBuyerSignal/)
assert.match(source, /selectedLeadUsesKingstonsInPersonOtpFlow/)

assert.match(source, /Send buyer onboarding/)
assert.match(source, /Send Buyer Onboarding/)
assert.match(source, /Upload signed OTP/)
assert.match(source, /<BuyerSignedOtpDocuments/)
assert.match(source, /buyer-transaction-setup-checklist/)
assert.match(source, /Signed OTP uploaded/)
assert.match(source, /buyerTransactionSetupActionId/)
assert.match(source, /async function recordBuyerTransactionSetupAction/)
assert.match(source, /async function ensureBuyerTransactionSetupContext/)
assert.match(source, /async function handleBuyerTransactionSetupChecklistAction/)
assert.match(source, /async function handleBuyerCommandConvertToTransaction/)
assert.match(source, /creationMode: 'manual_capture'/)
assert.match(source, /transactionStage: 'Transaction Setup'/)
assert.match(source, /buyer_transaction_setup_bond_originator/)
assert.match(source, /buyer_transaction_setup_transfer_attorney/)
assert.match(source, /buyer_transaction_setup_finalize/)
assert.match(source, /Complete Transaction Setup before moving the buyer to Transaction/)
assert.match(source, /Upload the OTP signed by all required parties before creating the transaction/)
assert.match(source, /status: 'finalized'/)
assert.match(source, /Complete and submit buyer onboarding before creating the transaction/)
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
assert.match(transactionDetailSource, /<BuyerProcessHandoffPanel[\s\S]*?handoff=\{buyerProcessHandoff\}/)

assert.doesNotMatch(source, /Send Offer Link/)
assert.doesNotMatch(source, /Offer CTA/)
assert.doesNotMatch(source, /OTP \/ offer documents/)
assert.doesNotMatch(source, /generate the buyer offer link/)

console.log('Buyer process Phase 4 onboarding + OTP upload contract passed.')

// Exercise the actual page functions: a blank alias on a connected firm used
// to match a blank selection, and manual nominations inherited panel identities.
const attorneyFunctions = source.slice(source.indexOf('  function getSelectedBuyerOtpPromptAttorney('), source.indexOf('  function openOtpUploadWizard('))
const normalizeText = value => String(value || '').trim()
const isManual = draft => ['seller_selected', 'buyer_selected', 'manual'].includes(draft.transferAttorneyMode)
const firms = [{ id: 'connected-firm', companyName: 'Connected firm' }, { id: 'preferred-firm', preferredPartnerId: 'preferred-alias', companyName: 'Preferred firm' }]
const attorneyModel = new Function('sellerPreferredAttorneys', 'normalizeText', 'isManualKingstonsTransferAttorneyDraft', `
  const buyerOtpAttorneyPromptDraft = null, selectedKingstonsListingTerms = {}, currentAgent = { email: 'qa@example.invalid' }, selectedLeadUsesKingstonsInPersonOtpFlow = false;
  const asRecord = value => value || {};
  const buildKingstonsListingTermsDraft = () => ({});
  const buildKingstonsListingTermsPayload = (draft, selected) => ({ transferAttorney: { id: draft.transferAttorneyId, companyName: selected?.companyName || draft.transferAttorneyCompany, email: draft.transferAttorneyEmail } });
  const buildBuyerOtpTransferAttorneyRoleplayerSelection = ({ transferAttorney }) => transferAttorney;
  ${attorneyFunctions}
  return { resolve: getSelectedBuyerOtpPromptAttorney, context: buildBuyerOtpAttorneyInstructionContext };
`)(firms, normalizeText, isManual)
assert.equal(attorneyModel.resolve({}), null, 'empty selection cannot match a firm with a missing alias')
assert.equal(attorneyModel.resolve({ transferAttorneyId: 'unknown' }), null)
assert.equal(attorneyModel.resolve({ transferAttorneyId: 'connected-firm' }), firms[0])
assert.equal(attorneyModel.resolve({ transferAttorneyId: 'preferred-alias' }), firms[1])
for (const transferAttorneyMode of ['buyer_selected', 'seller_selected', 'manual']) {
  const draft = { transferAttorneyMode, transferAttorneyId: 'connected-firm', transferAttorneyCompany: 'Manually nominated firm', transferAttorneyEmail: 'manual@example.invalid', sendInstruction: false }
  assert.equal(attorneyModel.resolve(draft), null, 'manual mode must ignore an old panel selection')
  const context = attorneyModel.context(draft)
  assert.equal(context.transferAttorney.id, '', 'manual nomination must not retain a panel identity')
  assert.equal(context.transferAttorney.companyName, draft.transferAttorneyCompany)
  assert.equal(context.roleplayerSelection.companyName, draft.transferAttorneyCompany)
  assert.equal(context.sendInstruction, false)
  assert.equal(draft.transferAttorneyId, 'connected-firm', 'building the upload context must not mutate the saved draft')
}
assert.match(source, /const otpUploadWizardSelectedAttorney = getSelectedBuyerOtpPromptAttorney\(otpUploadWizardAttorneyDraft\)/)
const completionSource = source.slice(source.indexOf('  const otpUploadWizardSelectedAttorney ='), source.indexOf('  const selectedLeadAcceptedOffer ='))
const completeAttorney = new Function('otpUploadWizardAttorneyDraft','getSelectedBuyerOtpPromptAttorney','isManualKingstonsTransferAttorneyDraft','normalizeText', `${completionSource}; return otpUploadWizardAttorneyComplete;`)
assert.equal(completeAttorney({}, attorneyModel.resolve, isManual, normalizeText), false)
assert.equal(completeAttorney({ transferAttorneyMode: 'choose_later' }, attorneyModel.resolve, isManual, normalizeText), true)
assert.equal(completeAttorney({ transferAttorneyMode: 'buyer_selected', transferAttorneyCompany: 'Manual firm' }, attorneyModel.resolve, isManual, normalizeText), true)

console.log('OTP attorney regressions passed: explicit selection, missing aliases, manual firm identity and instruction-off capture.')

// Capture uses the canonical OTP stage; a receipt must never reset an advanced deal or dispatch instructions.
const otpSnapshot = source.slice(source.indexOf('  async function persistBuyerOtpTransactionSnapshot('), source.indexOf('  async function persistBuyerOtpTransactionAuditTrail('))
const otpUpload = source.slice(source.indexOf('  async function handleUploadBuyerOfferDocument('), source.indexOf('  async function openBuyerLeadDocument('))
assert.doesNotMatch(otpSnapshot, /(?:onboarding_status|stage|current_main_stage|current_sub_stage_summary|next_action):/)
assert.equal((otpUpload.match(/stage: 'OTP Signed'/g) || []).length, 1)
assert.doesNotMatch(otpUpload, /await finalizeCanonicalPhysicalSignedOtpWorkflow/)
assert.match(otpUpload, /signed_otp_saved_for_review/)
assert.match(otpUpload, /testMode: controlledOtpTest.isTestData === true/)
assert.match(otpUpload, /controlledTestRoleSet: normalizeText\(controlledOtpTest.controlledTestRoleSet\)/)
assert.match(otpUpload, /const savedLeadContext = await supabase\.from\('leads'\)\.select\('raw_enquiry_payload'\)/)
assert.match(otpUpload, /parseLeadRawEnquiryPayload\(savedLeadContext\.data\.raw_enquiry_payload\)\.testDataProtection/)
assert(otpUpload.indexOf('const savedLeadContext =') < otpUpload.indexOf('await uploadStagedBuyerLeadDocument('), 'saved lead context must be read before uploading; a cached browser lead may predate its controlled test flags')
let savedReceiptPayload = null
const saveReceipt = new Function('isSupabaseConfigured','supabase','normalizeText','isUuidLike','asRecord','updateSupabaseRowsWithOptionalColumnFallback', `${otpSnapshot}; return persistBuyerOtpTransactionSnapshot;`)(true, {}, normalizeText, value => /^[0-9a-f-]{36}$/.test(value), value => value || {}, async (table,payload) => { savedReceiptPayload=payload; return [{id:'saved-deal'}] })
const receipt = await saveReceipt({ transactionId:'11111111-1111-4111-8111-111111111111', persistedDocument:{id:'saved-otp'}, uploadedAt:'2026-10-31T10:00:00Z' })
assert.equal(receipt.evidenceStatus,'awaiting_review')
for (const field of ['stage','current_main_stage','onboarding_status','next_action']) assert.equal(field in savedReceiptPayload,false,`upload receipt must not change ${field}`)
assert.doesNotMatch(otpSnapshot + otpUpload, /stage: 'Finance In Progress'/)
console.log('OTP capture checks passed: canonical OTP stage, receipt preserves deal progress, review owns downstream handoff.')

const persistenceSource = source.slice(source.indexOf('  async function persistBuyerOfferDocumentRow('), source.indexOf('  async function updateSupabaseRowsWithOptionalColumnFallback('))
let capturedOtpPayload = null, insertAttempts = 0, saveError = null, existingOtp = null
const transactionId = '11111111-1111-4111-8111-111111111111'
const actorId = '22222222-2222-4222-8222-222222222222'
const fakeClient = { from(table) {
  assert.equal(table, 'documents')
  const read = { eq() { return read }, maybeSingle: async () => ({ data: existingOtp, error: null }) }
  return { select: () => read, insert(payload) {
    capturedOtpPayload = payload; insertAttempts++
    return { select: () => ({ maybeSingle: async () => ({ data: saveError ? null : { id: 'saved-otp' }, error: saveError }) }) }
  } }
} }
const accessChecks = []
const persistOtp = new Function('resolveBuyerLeadDocumentTarget', 'supabase', 'isSupabaseConfigured', 'normalizeText', 'isUuidLike', 'currentAgent', 'selectedLead', 'BUYER_OFFER_DOCUMENT_TYPE', 'BUYER_OFFER_DOCUMENT_LABEL', 'BUYER_OTP_DOCUMENT_TYPE', 'assertBuyerLeadTransactionDocumentContext', 'organisationId', 'selectedLeadRecordId', `${persistenceSource}; return persistBuyerOfferDocumentRow;`)(resolveBuyerLeadDocumentTarget, fakeClient, true, normalizeText, value => /^[0-9a-f-]{36}$/.test(value), { id: actorId }, { leadId: 'exact-lead' }, 'buyer_offer', 'Buyer Offer Document', 'uploaded_otp', async (client, scope) => { assert.equal(client, fakeClient); accessChecks.push(scope) }, 'exact-org', 'exact-lead')
assert.equal((await persistOtp({ storagePath: 'otp/file.pdf', storageBucket: 'documents', uploadedFileName: 'signed.pdf', documentType: 'uploaded_otp', metadata: { signedByAllPartiesConfirmed: true } }, { transactionId })).id, 'saved-otp')
assert.deepEqual(accessChecks[0], { transactionId, organisationId: 'exact-org', leadId: 'exact-lead' })
assert.equal(capturedOtpPayload.visibility_scope, 'shared')
assert.equal(capturedOtpPayload.is_client_visible, true)
assert.equal(capturedOtpPayload.client_recipient_role, null, 'the supported shared-agreement audience includes both client parties')
assert.equal(capturedOtpPayload.uploaded_by_user_id, actorId)
assert.equal(capturedOtpPayload.file_name, 'signed.pdf')
assert.equal(capturedOtpPayload.metadata.signedByAllPartiesConfirmed, true)
assert.equal(capturedOtpPayload.metadata.buyerLeadId, 'exact-lead')
for (const retired of ['organisation_id','lead_id','file_url','metadata_json']) assert.equal(retired in capturedOtpPayload, false)
existingOtp = { id: 'saved-otp', document_type: 'uploaded_otp', source: 'agent_otp_upload', visibility_scope: 'shared', is_client_visible: true, client_recipient_role: null, uploaded_by_party: 'buyer' }
assert.equal((await persistOtp({ storagePath: 'otp/file.pdf', storageBucket: 'documents' }, { transactionId })).id, 'saved-otp')
assert.equal(insertAttempts, 1, 'retrying a saved path must not insert a duplicate document')
existingOtp.is_client_visible = false
await assert.rejects(persistOtp({ storagePath: 'otp/file.pdf', storageBucket: 'documents' }, { transactionId }), /different document audience/)
assert.equal(insertAttempts, 1)
existingOtp = null
saveError = new Error('Document audience denied')
await assert.rejects(persistOtp({ storagePath: 'otp/file.pdf' }, { transactionId }), /Document audience denied/)
assert.equal(insertAttempts, 2, 'a failed save must not silently retry without its audience and metadata')
assert(otpUpload.indexOf('await updateAgencyCrmLeadRecord(organisationId, canonicalBuyerLeadId') < otpUpload.indexOf('await persistBuyerOfferDocumentRow('), 'the lead must retain the file before transaction linking')
assert.match(otpUpload, /The file remains saved on this buyer lead/)
console.log('OTP persistence checks passed: current fields, exact uploader, shared legal audience, retained metadata, confirmed saves and file retention before follow-up failures.')

const otpAudit = source.slice(source.indexOf('  async function persistBuyerOtpTransactionAuditTrail('), source.indexOf('  async function persistBuyerProfileOnboardingFormData('))
assert.doesNotMatch(otpAudit, /const actorRole = membershipRole/)
assert.match(otpAudit, /includes\(role\) \? role : 'agent'/)
console.log('OTP audit check passed: membership titles cannot enter the event application-role field.')

const captureSource = source.slice(source.indexOf('  async function persistBuyerOtpRequiredDocumentCapture('), source.indexOf('  async function persistBuyerOtpTransactionFeeControl('))
let linkResult = { ok: true, requirementInstanceId: actorId }, linkError = null, refreshed = 0
const captureOtp = new Function('supabase','isSupabaseConfigured','normalizeText','isUuidLike','role','currentAgent','setBuyerDocumentRefreshTick', `${captureSource}; return persistBuyerOtpRequiredDocumentCapture;`)({ rpc: async (name, args) => {
  assert.equal(name, 'bridge_link_document_to_canonical_requirement_by_key')
  assert.equal(args.p_document_key, 'signed_otp')
  assert.equal(args.p_transaction_id, transactionId)
  assert.equal(args.p_document_id, actorId)
  return { data: linkResult, error: linkError }
} }, true, normalizeText, value => /^[0-9a-f-]{36}$/.test(value), 'agent', { id: actorId }, () => { refreshed++ })
assert.equal((await captureOtp({ transactionId, documentRow: { id: actorId } })).requirementInstanceId, actorId)
assert.equal(refreshed, 1)
linkResult = { ok: false, reason: 'ambiguous_canonical_requirement' }
await assert.rejects(captureOtp({ transactionId, documentRow: { id: actorId } }), /could not be matched/)
linkError = new Error('Access denied')
await assert.rejects(captureOtp({ transactionId, documentRow: { id: actorId } }), /Access denied/)
assert.equal(refreshed, 1, 'unconfirmed checklist saves must not be shown as successful')
console.log('OTP checklist checks passed: exact server linking, canonical key, refresh after confirmation, and unmatched/denied saves reported.')

const deferredContext = attorneyModel.context({ transferAttorneyMode: 'choose_later', transferAttorneyId: 'old-panel', sendInstruction: true })
assert.equal(deferredContext.transferAttorney, null)
assert.equal(deferredContext.roleplayerSelection, null)
assert.equal(deferredContext.sendInstruction, false)
assert.equal(deferredContext.instruction.status, 'not_requested')
const wizardSteps = source.slice(source.indexOf('const OTP_UPLOAD_WIZARD_STEPS = ['), source.indexOf('const BUYER_AGENT_DOCUMENT_STORAGE_FOLDER'))
assert.equal((wizardSteps.match(/key:/g) || []).length, 4)
assert.match(wizardSteps, /key: 'confirm'/)
assert.match(otpUpload, /uploadStagedBuyerLeadDocument/)
assert.match(otpUpload, /bucketCandidates: \['documents'\]/)
assert.doesNotMatch(otpUpload, /transfer instruction needs attention:/)
console.log('OTP simplicity checks passed: four screens, optional later nomination, no instruction from deferred drafts and recoverable single-bucket storage.')

const resetStart = otpUpload.indexOf('      if (transactionId && !transactionWarning && !attorneyInstructionWarning && !transactionFeeControlWarning) setBuyerOfferUploadForm(')
assert(resetStart >= 0, 'incomplete handoffs must retain the entered OTP draft')
const resetDraft = new Function('state', 'setBuyerOfferUploadForm', 'selectedListingId', `
  const { transactionId, transactionWarning, attorneyInstructionWarning, transactionFeeControlWarning } = state;
  ${otpUpload.slice(resetStart, otpUpload.indexOf('      let offerStageLead', resetStart))}
`)
const enteredDraft = { offerAmount: '1000000', note: 'Keep this note', confirmedSignedByAllParties: true, confirmedArch9TermsIncluded: true, confirmedTransactionFeeConsentIncluded: true, transactionFeeBillingParty: 'agent', financeType: 'combination' }
for (const state of [{}, { transactionId: 'saved', transactionWarning: 'Document setup needs retry' }, { transactionId: 'saved', attorneyInstructionWarning: 'Link needs retry' }, { transactionId: 'saved', transactionFeeControlWarning: 'Receipt needs retry' }]) {
  let result = enteredDraft
  resetDraft(state, update => { result = update(result) }, 'property')
  assert.equal(result, enteredDraft, 'the original amount, note and confirmations survive any incomplete handoff')
}
let completedDraft = enteredDraft
resetDraft({ transactionId: 'saved' }, update => { completedDraft = update(completedDraft) }, 'property')
assert.equal(completedDraft.offerAmount, '')
assert.equal(completedDraft.confirmedSignedByAllParties, false, 'a new replacement must be confirmed separately')
assert.equal(completedDraft.financeType, 'combination')
