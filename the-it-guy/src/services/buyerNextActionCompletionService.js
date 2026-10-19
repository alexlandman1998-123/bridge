import {
  hasBuyerOnboardingSentEvidence,
  hasBuyerOnboardingSubmittedEvidence,
  hasBuyerSignedOtpEvidence,
  hasBuyerTransactionCreatedEvidence,
  summarizeBuyerJourneyDocuments,
} from './buyerJourneyAlignmentService.js'
import { buildDevelopmentBuyerJourneyModel } from './developmentBuyerJourneyService.js'

export const BUYER_NEXT_ACTION_COMPLETION = Object.freeze({
  mark_contacted: { mode: 'contact', requirement: '' },
  qualify: { mode: 'qualification', requirement: 'Save the minimum qualification answers before completing this step.' },
  schedule_viewing: { mode: 'viewing', requirement: 'Record the completed viewing, including a reason if it was captured after the fact.' },
  progress_from_viewing: { mode: 'viewing', requirement: 'Record the viewing outcome, or manually confirm the viewing was completed.' },
  open_development: { mode: 'evidence', requirement: 'Select the development unit and record its reservation before completing this step.' },
  send_buyer_onboarding: { mode: 'evidence', requirement: 'Send or record delivery of the buyer onboarding invitation first.' },
  complete_buyer_onboarding: { mode: 'evidence', requirement: 'The buyer or agent must submit the shared onboarding form first.' },
  upload_signed_otp: { mode: 'evidence', requirement: 'Upload the OTP and confirm that all required parties signed it first.' },
  complete_transaction_setup: { mode: 'evidence', requirement: 'Complete transaction setup before creating the transaction.' },
  create_transaction: { mode: 'evidence', requirement: 'Create the transaction first; an onboarding draft does not complete this step.' },
  upload_buyer_documents: { mode: 'evidence', requirement: 'Upload every applicable required buyer document first.' },
  open_transaction: { mode: 'complete', requirement: '' },
})

export function getBuyerNextActionCompletion(actionKey) {
  return BUYER_NEXT_ACTION_COMPLETION[actionKey] || { mode: 'unavailable', requirement: 'Refresh this buyer journey to load its next action.' }
}

const ACTION_BUTTONS = Object.freeze({
  open_development: [['openDevelopment', 'Open development', 'viewing']],
  mark_contacted: [['logContact', 'Log contact', 'contact']],
  qualify: [['openQualification', 'Qualify lead', 'qualification']],
  schedule_viewing: [['scheduleViewing', 'Arrange a viewing', 'viewing']],
  progress_from_viewing: [['recordViewingOutcome', 'Record viewing outcome', 'viewing'], ['scheduleAnotherViewing', 'Set another viewing', 'viewing']],
  send_buyer_onboarding: [['sendOnboarding', 'Send buyer onboarding', 'onboarding']],
  complete_buyer_onboarding: [['captureOnboarding', 'Capture onboarding manually', 'form']],
  upload_signed_otp: [['uploadSignedOtp', 'Upload signed OTP', 'documents']],
  complete_transaction_setup: [['openTransactionSetup', 'Complete setup', 'setup']],
  create_transaction: [['createTransaction', 'Create transaction', 'transaction']],
  upload_buyer_documents: [['openDocuments', 'Upload buyer documents', 'documents']],
  open_transaction: [['openTransaction', 'Open transaction', 'transaction']],
})

export function buildBuyerNextBestActionButtons(actionKey, handlers) {
  return (ACTION_BUTTONS[actionKey] || []).map(([command, label, icon], index) => ({
    key: command, label, icon, primary: index === 0,
    onClick: () => {
      if (typeof handlers[command] !== 'function') throw new Error(`Buyer action is unavailable: ${command}`)
      return handlers[command]()
    },
  }))
}

// Manual confirmation refreshes the same evidence as the journey rail. It must
// never manufacture a submission, signature, transaction or uploaded file.
export function checkBuyerNextActionEvidence({ actionKey, lead = {}, rawPayload = {}, diagnostic = {}, activities = [], transactionId = '', documentRows = [], documentsReady = false, signedOtpUploaded = false } = {}) {
  const submitted = hasBuyerOnboardingSubmittedEvidence({
    status: diagnostic.onboarding?.status || diagnostic.transaction?.onboarding_status,
    onboarding: diagnostic.onboarding || {}, transaction: diagnostic.transaction || {},
  })
  switch (actionKey) {
    case 'open_development':
      return buildDevelopmentBuyerJourneyModel({ lead }).stages.some(stage => stage.key === 'development_selection' && stage.done)
    case 'send_buyer_onboarding':
      return hasBuyerOnboardingSentEvidence({ onboarding: { ...(rawPayload.buyerOnboarding || {}), ...(diagnostic.onboarding || {}) }, activities, submitted })
    case 'complete_buyer_onboarding': return submitted
    case 'upload_signed_otp':
      return hasBuyerSignedOtpEvidence({ lead, rawPayload, acceptedOffer: diagnostic.offer, documentUploaded: signedOtpUploaded })
    case 'create_transaction':
      return hasBuyerTransactionCreatedEvidence({ transactionId, transaction: diagnostic.transaction || {}, lead, rawPayload })
    case 'upload_buyer_documents':
      return summarizeBuyerJourneyDocuments(documentRows, { ready: documentsReady }).complete
    default: return false
  }
}
