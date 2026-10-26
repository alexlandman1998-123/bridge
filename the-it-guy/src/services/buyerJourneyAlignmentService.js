import { JOURNEY_ENTITY_TYPES } from '../core/journey/journeyStagePolicy.js'
import { applyJourneyStageOverrides } from '../core/journey/journeyStageOverrideState.js'
import {
  BUYER_PROCESS_STAGE_KEYS as STAGE,
  getBuyerProcessDefinition,
  normalizeBuyerProcessStageKey,
} from './buyerProcessDefinitionService.js'

// All agencies share this order; process profiles still own legal and document routing.
const DEFINITION = getBuyerProcessDefinition({})
const STAGE_ORDER = Object.freeze([...DEFINITION.activeStageKeys])
const STAGE_LABELS = Object.freeze(Object.fromEntries(DEFINITION.stages.map(stage => [stage.key, stage.label])))
const token = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

export function summarizeBuyerJourneyDocuments(rows = [], { ready = true } = {}) {
  const required = rows.filter(row => row.required !== false && row.applicable !== false && row.isEnabled !== false &&
    row.applicability_override !== 'removed' && !['not_applicable', 'waived'].includes(token(row.status)))
  const uploaded = required.filter(row => {
    const status = token(row.status)
    if (['rejected', 'declined', 'expired', 'invalid', 'uploaded_unmatched', 'handoff_pending', 'canonical_refresh_pending'].includes(status)) return false
    const document = row.uploadedDocument || row.original?.document || {}
    return Boolean(row.storagePath || row.storage_path || document.file_path || row.url || row.file_url)
  }).length
  return { total: required.length, uploaded, complete: ready && required.length > 0 && uploaded === required.length }
}

export function hasBuyerOnboardingSubmittedEvidence({ status = '', onboarding = {}, transaction = {} } = {}) {
  return ['submitted', 'complete', 'completed', 'client_onboarding_complete', 'buyer_onboarding_submitted', 'awaiting_signed_otp'].includes(token(status)) ||
    Boolean(onboarding.submitted_at || onboarding.submittedAt || transaction.onboarding_completed_at)
}

export function hasBuyerOnboardingSentEvidence({ onboarding = {}, activities = [], submitted = false } = {}) {
  if (submitted || onboarding.sent_at || onboarding.sentAt || onboarding.delivered_at || ['sent', 'delivered'].includes(token(onboarding.status))) return true
  return activities.some(activity => {
    const type = token(activity.activityType || activity.activity_type)
    const outcome = token(activity.outcome || activity.status)
    return ['buyer_onboarding_sent', 'buyer_onboarding_resent', 'buyer_onboarding_link_sent'].includes(type) &&
      ['sent', 'delivered', 'handoff_required', 'handed_to_buyer'].includes(outcome)
  })
}

export function hasBuyerSignedOtpEvidence({ lead = {}, rawPayload = {}, workflowItems = [], acceptedOffer = null, documentUploaded = false } = {}) {
  const documents = [lead.buyerOtpDocument, lead.buyer_otp_document, rawPayload.buyerOtpDocument, rawPayload.buyer_otp_document,
    lead.buyerOfferDocument, lead.buyer_offer_document, rawPayload.buyerOfferDocument, rawPayload.buyer_offer_document,
    ...(lead.buyerOtpDocuments || []), ...(rawPayload.buyerOtpDocuments || []),
    ...(lead.buyerOfferDocuments || []), ...(rawPayload.buyerOfferDocuments || [])].filter(Boolean)
  const signed = lead.buyerOtpSignedByAllPartiesConfirmed === true || rawPayload.buyerOtpSignedByAllPartiesConfirmed === true ||
    documents.some(document => document.metadata?.signedByAllPartiesConfirmed === true) ||
    workflowItems.some(item => item.key === 'otp_signed' && item.done)
  const acceptedSigned = acceptedOffer?.conditions?.signedByAllPartiesConfirmed === true || acceptedOffer?.signedByAllPartiesConfirmed === true
  return Boolean(documentUploaded && (signed || acceptedSigned))
}

export function hasBuyerTransactionCreatedEvidence({ transactionId = '', transaction = {}, lead = {}, rawPayload = {} } = {}) {
  if (!transactionId) return false
  const setup = lead.buyerTransactionSetup || lead.buyer_transaction_setup || rawPayload.buyerTransactionSetup || rawPayload.buyer_transaction_setup || {}
  const transactionStage = token(transaction.transaction?.stage || transaction.stage)
  return Boolean(setup.actions?.transaction?.status === 'finalized' ||
    ['transaction', 'transaction_created', 'converted', 'converted_to_transaction', 'deal_created', 'closed_won', 'closed_lost'].includes(token(lead.stage)) ||
    transactionStage && !['buyer_onboarding_pending', 'transaction_setup', 'onboarding', 'onboarding_pending'].includes(transactionStage))
}

function nextActionForStage(stageKey, evidence) {
  if (stageKey === STAGE.contacted) return { key: 'mark_contacted', title: 'Mark as contacted', description: 'Confirm first contact and open the buyer qualification questions.' }
  if (stageKey === STAGE.qualified) return { key: 'qualify', title: 'Qualify lead', description: 'Capture buyer intent, budget, timing, preferred areas, and finance route.' }
  if (stageKey === STAGE.viewing) return evidence.viewingScheduled || evidence.viewingCompleted
    ? { key: 'progress_from_viewing', title: 'Record the viewing outcome', description: 'Complete the viewing and send buyer onboarding.' }
    : { key: 'schedule_viewing', title: 'Schedule viewing', description: 'Select a property and confirm the viewing and RSVP path.' }
  if (stageKey === STAGE.buyerOnboardingSent) return { key: 'send_buyer_onboarding', title: 'Send buyer onboarding', description: 'Send the onboarding invitation or hand the onboarding pack to the buyer.' }
  if (stageKey === STAGE.buyerOnboardingSubmitted) return { key: 'complete_buyer_onboarding', title: 'Complete buyer onboarding', description: 'Follow up with the buyer or complete assisted capture and submit their onboarding.' }
  if (stageKey === STAGE.offer) return { key: 'upload_signed_otp', title: 'Upload signed OTP', description: 'Attach the offer to purchase signed by all required parties.' }
  if (stageKey === STAGE.transaction) return { key: 'create_transaction', title: 'Create transaction', description: 'Confirm the signed OTP and hand the buyer over to the transaction workspace.' }
  if (stageKey === STAGE.buyerDocumentsUploaded) return evidence.buyerDocumentsUploaded
    ? { key: 'open_transaction', title: 'Open transaction', description: 'All buyer journey milestones are complete. Continue in the transaction workspace.' }
    : { key: 'upload_buyer_documents', title: 'Upload buyer documents', description: 'Upload every applicable required buyer document. Earlier uploads also count.' }
  return { key: 'mark_contacted', title: 'Contact buyer', description: 'Make first contact and record the outcome.' }
}

export function buildBuyerJourneyAlignmentModel({ persistedStage = '', evidence: rawEvidence = {}, details = {}, overrides = [] } = {}) {
  const evidence = { ...rawEvidence, leadCaptured: rawEvidence.leadCaptured !== false }
  // Submission also proves that onboarding reached the buyer; a draft or link alone does not.
  evidence.buyerOnboardingSent = Boolean(evidence.buyerOnboardingSent || evidence.buyerOnboardingSubmitted)
  const stageOrder = [...STAGE_ORDER]
  const persistedStageKey = normalizeBuyerProcessStageKey(persistedStage)
  const persistedIndex = stageOrder.indexOf(persistedStageKey)
  const directDone = {
    [STAGE.captured]: evidence.leadCaptured,
    [STAGE.contacted]: evidence.contacted,
    [STAGE.qualified]: evidence.qualified,
    [STAGE.viewing]: evidence.viewingCompleted,
    [STAGE.buyerOnboardingSent]: evidence.buyerOnboardingSent,
    [STAGE.buyerOnboardingSubmitted]: evidence.buyerOnboardingSubmitted,
    [STAGE.offer]: evidence.offerComplete,
    [STAGE.transaction]: evidence.transactionCreated,
    [STAGE.buyerDocumentsUploaded]: evidence.buyerDocumentsUploaded,
  }
  const started = {
    [STAGE.qualified]: evidence.qualificationStarted,
    [STAGE.viewing]: evidence.viewingStarted || evidence.viewingScheduled,
    [STAGE.buyerOnboardingSubmitted]: evidence.buyerOnboardingSent,
    [STAGE.offer]: evidence.offerStarted,
  }
  const rawStages = stageOrder.map((stageKey, index) => ({
    key: stageKey,
    label: STAGE_LABELS[stageKey],
    detail: details[stageKey] || '',
    // Preserve historical catch-up for the early CRM steps only. Later milestones need their own evidence.
    done: Boolean(directDone[stageKey]) || (index < 4 && (persistedIndex > index || evidence.buyerOnboardingSent)),
    started: Boolean(started[stageKey] || directDone[stageKey]) || persistedIndex === index,
  }))
  const stages = applyJourneyStageOverrides({ entityType: JOURNEY_ENTITY_TYPES.buyerLead, stages: rawStages, overrides, stageOrder })
  const currentStage = stages.find(stage => stage.state === 'current') || stages[stages.length - 1] || null
  return { stages, currentStage, currentStageKey: currentStage?.key || STAGE.captured,
    nextAction: nextActionForStage(currentStage?.key, evidence), stageOrder, persistedStageKey }
}

// Use the same evidence and overrides as the journey rail, including a completed
// final step that may still be displayed as the current step.
export function summarizeBuyerJourneyReadiness(stages = []) {
  const total = stages.length
  const completed = stages.filter(stage => stage.done === true || stage.state === 'completed').length
  return { completed, total, percent: total ? Math.round(completed / total * 100) : 0 }
}
