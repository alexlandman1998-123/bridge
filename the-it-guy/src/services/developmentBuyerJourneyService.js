import { buildBuyerJourneyAlignmentModel } from './buyerJourneyAlignmentService.js'
import { normalizeBuyerProcessStageKey } from './buyerProcessDefinitionService.js'
import { DEVELOPMENT_SELECTION_STAGE, getDevelopmentLeadStage, getDevelopmentBuyerReservationEvidence } from '../core/leads/developmentBuyerLead.js'

// Keep shared evidence and document handling, but own development sales guidance
// here so changes to this flow do not alter the open-market buyer journey.
const DEVELOPMENT_ACTIONS = Object.freeze({
  contacted: { key: 'mark_contacted', title: 'Contact development buyer', description: 'Confirm first contact and discuss the development the buyer enquired about.' },
  qualified: { key: 'qualify', title: 'Qualify development buyer', description: '' },
  buyer_onboarding_sent: { key: 'send_buyer_onboarding', title: 'Send buyer onboarding', description: 'The unit reservation is confirmed. Send the purchaser their buyer onboarding invitation.' },
  buyer_onboarding_submitted: { key: 'complete_buyer_onboarding', title: 'Complete buyer onboarding', description: 'Capture the purchaser, finance route and parties for this development purchase.' },
})

export function buildDevelopmentBuyerJourneyModel({ lead = {}, ...options } = {}) {
  const { unitSelected, reservationState, reserved, expired } = getDevelopmentBuyerReservationEvidence(lead, options.now)
  const evidence = { ...options.evidence }
  // A linked setup/onboarding context is not a completed development sale.
  evidence.transactionCreated = Boolean(evidence.transactionCreated && reserved && evidence.buyerOnboardingSubmitted && evidence.offerComplete)
  const persistedStageKey = getDevelopmentLeadStage(options.persistedStage, normalizeBuyerProcessStageKey(options.persistedStage)).key
  const selectionStage = persistedStageKey === DEVELOPMENT_SELECTION_STAGE
  const model = buildBuyerJourneyAlignmentModel({
    ...options,
    evidence,
    persistedStage: selectionStage ? 'Transaction Setup' : persistedStageKey,
  })
  const selection = {
    key: DEVELOPMENT_SELECTION_STAGE,
    label: 'Unit Selection & Reservation',
    detail: reserved ? 'Reservation confirmed' : expired ? 'Reservation expired' : unitSelected ? 'Unit selected · Reservation not confirmed' : 'Select a unit',
    done: reserved,
    started: unitSelected || selectionStage,
    state: reserved ? 'completed' : 'upcoming',
  }
  const stages = model.stages.flatMap((stage) => {
    const label = stage.key === 'viewing' ? 'Viewing / Presentation' : stage.label
    const detail = stage.key === 'transaction' && !evidence.transactionCreated
      ? !reserved ? 'Awaiting unit reservation' : !evidence.buyerOnboardingSubmitted || !evidence.offerComplete ? 'Awaiting completed onboarding and signed OTP' : 'Not created'
      : stage.detail
    return stage.key === 'buyer_onboarding_sent' ? [selection, { ...stage, label }] : [{ ...stage, label, detail }]
  })
  const currentIndex = stages.findIndex((stage) => !stage.done && stage.state !== 'completed')
  const resolvedIndex = currentIndex < 0 ? stages.length - 1 : currentIndex
  const journeyStages = stages.map((stage, index) => ({ ...stage, current: index === resolvedIndex, state: index === resolvedIndex ? 'current' : stage.done ? 'completed' : 'upcoming' }))
  const currentStage = journeyStages[resolvedIndex]
  const viewingAction = currentStage.key === 'viewing'
    ? options.evidence?.viewingScheduled || options.evidence?.viewingCompleted
      ? { key: 'progress_from_viewing', title: 'Record presentation outcome', description: 'Record the site visit, show-unit viewing or sales consultation before unit selection and reservation.' }
      : { key: 'schedule_viewing', title: 'Arrange viewing / presentation', description: 'Arrange a site visit, show-unit viewing or development sales consultation.' }
    : null
  const nextAction = currentStage.key === DEVELOPMENT_SELECTION_STAGE
    ? { key: 'open_development', title: unitSelected ? 'Confirm unit reservation' : 'Select a development unit', description: 'Use the development workspace to choose the unit and confirm the actual reservation.' }
    : viewingAction || DEVELOPMENT_ACTIONS[currentStage.key] || model.nextAction
  const tip = {
    mark_contacted: 'Record the first conversation about this development.',
    qualify: 'Capture the buyer’s needs while the conversation is still fresh.',
    schedule_viewing: 'Arrange a site visit, show-unit viewing or development presentation.',
    progress_from_viewing: 'Record the presentation outcome, then select a unit and confirm its reservation.',
    open_development: 'Confirm the unit and its reservation before buyer onboarding.',
    send_buyer_onboarding: 'Send onboarding for the purchaser and their reserved unit.',
    complete_buyer_onboarding: 'Submit the purchaser’s onboarding before recording the signed OTP.',
    upload_signed_otp: 'Confirm all required parties signed the OTP for the reserved unit.',
    create_transaction: 'Create the transaction after reservation, submitted onboarding and signed OTP are confirmed.',
    upload_buyer_documents: 'Upload every applicable required buyer document to complete the journey.',
    open_transaction: 'Continue the purchase in the linked transaction workspace.',
  }[nextAction.key]
  return { ...model, stages: journeyStages, currentStage, currentStageKey: currentStage.key, nextAction: { ...nextAction, tip },
    journeyType: 'development', journeyLabel: 'Development sales', stageOrder: journeyStages.map((stage) => stage.key) }
}
