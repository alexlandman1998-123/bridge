import { JOURNEY_ENTITY_TYPES } from '../core/journey/journeyStagePolicy.js'
import { applyJourneyStageOverrides } from '../core/journey/journeyStageOverrideState.js'
import {
  BUYER_PROCESS_STAGE_KEYS,
  normalizeBuyerProcessStageKey,
} from './buyerProcessDefinitionService.js'

const DEFAULT_STAGE_ORDER = Object.freeze([
  BUYER_PROCESS_STAGE_KEYS.captured,
  BUYER_PROCESS_STAGE_KEYS.contacted,
  BUYER_PROCESS_STAGE_KEYS.qualified,
  BUYER_PROCESS_STAGE_KEYS.viewing,
  BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  BUYER_PROCESS_STAGE_KEYS.offer,
  BUYER_PROCESS_STAGE_KEYS.transaction,
])

const IN_PERSON_STAGE_ORDER = Object.freeze([
  BUYER_PROCESS_STAGE_KEYS.captured,
  BUYER_PROCESS_STAGE_KEYS.contacted,
  BUYER_PROCESS_STAGE_KEYS.qualified,
  BUYER_PROCESS_STAGE_KEYS.viewing,
  BUYER_PROCESS_STAGE_KEYS.offer,
  BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  BUYER_PROCESS_STAGE_KEYS.transaction,
])

const STAGE_LABELS = Object.freeze({
  [BUYER_PROCESS_STAGE_KEYS.captured]: 'Captured',
  [BUYER_PROCESS_STAGE_KEYS.contacted]: 'Contacted',
  [BUYER_PROCESS_STAGE_KEYS.qualified]: 'Qualified',
  [BUYER_PROCESS_STAGE_KEYS.viewing]: 'Viewing',
  [BUYER_PROCESS_STAGE_KEYS.transactionSetup]: 'Transaction Setup',
  [BUYER_PROCESS_STAGE_KEYS.offer]: 'Offer',
  [BUYER_PROCESS_STAGE_KEYS.transaction]: 'Transaction',
})

function nextActionForStage(stageKey, evidence, inPersonOtpFlow) {
  if (stageKey === BUYER_PROCESS_STAGE_KEYS.contacted) {
    return { key: 'mark_contacted', title: 'Mark as contacted', description: 'Confirm first contact and open the buyer qualification questions.' }
  }
  if (stageKey === BUYER_PROCESS_STAGE_KEYS.qualified) {
    return { key: 'qualify', title: 'Qualify lead', description: 'Capture buyer intent, budget, timing, preferred areas, and finance route.' }
  }
  if (stageKey === BUYER_PROCESS_STAGE_KEYS.viewing) {
    return evidence.viewingStarted
      ? {
          key: 'progress_from_viewing',
          title: evidence.viewingCompleted ? 'Record the viewing outcome' : 'Viewing scheduled',
          description: inPersonOtpFlow
            ? 'Keep the buyer in Viewing until the outcome is recorded or the signed OTP is uploaded.'
            : 'Keep the buyer in Viewing until the outcome is recorded or transaction setup begins.',
        }
      : { key: 'schedule_viewing', title: 'Schedule viewing', description: 'Select a property and confirm the viewing and RSVP path.' }
  }
  if (stageKey === BUYER_PROCESS_STAGE_KEYS.transactionSetup) {
    return { key: 'complete_transaction_setup', title: 'Complete transaction setup', description: 'Complete the buyer profile, finance route, roleplayers, and portal handoff.' }
  }
  if (stageKey === BUYER_PROCESS_STAGE_KEYS.offer) {
    return { key: 'upload_signed_otp', title: 'Upload signed OTP', description: 'Attach the signed offer to purchase before creating the transaction.' }
  }
  if (stageKey === BUYER_PROCESS_STAGE_KEYS.transaction) {
    return evidence.transactionCreated
      ? { key: 'open_transaction', title: 'Open transaction', description: 'The buyer lead has converted. Continue the workflow in the linked transaction.' }
      : { key: 'create_transaction', title: 'Create transaction', description: 'Convert the completed buyer process and signed OTP into a transaction.' }
  }
  return { key: 'mark_contacted', title: 'Contact buyer', description: 'Make first contact and record the outcome.' }
}

export function buildBuyerJourneyAlignmentModel({
  persistedStage = '',
  inPersonOtpFlow = false,
  evidence: rawEvidence = {},
  details = {},
  overrides = [],
} = {}) {
  const evidence = {
    leadCaptured: rawEvidence.leadCaptured !== false,
    contacted: Boolean(rawEvidence.contacted),
    qualificationStarted: Boolean(rawEvidence.qualificationStarted),
    qualified: Boolean(rawEvidence.qualified),
    viewingStarted: Boolean(rawEvidence.viewingStarted),
    viewingCompleted: Boolean(rawEvidence.viewingCompleted),
    transactionSetupStarted: Boolean(rawEvidence.transactionSetupStarted),
    transactionSetupComplete: Boolean(rawEvidence.transactionSetupComplete),
    offerStarted: Boolean(rawEvidence.offerStarted),
    offerComplete: Boolean(rawEvidence.offerComplete),
    transactionCreated: Boolean(rawEvidence.transactionCreated),
  }
  const stageOrder = inPersonOtpFlow ? [...IN_PERSON_STAGE_ORDER] : [...DEFAULT_STAGE_ORDER]
  const persistedStageKey = normalizeBuyerProcessStageKey(persistedStage)
  const persistedIndex = stageOrder.indexOf(persistedStageKey)
  const directDone = {
    [BUYER_PROCESS_STAGE_KEYS.captured]: evidence.leadCaptured,
    [BUYER_PROCESS_STAGE_KEYS.contacted]: evidence.contacted,
    [BUYER_PROCESS_STAGE_KEYS.qualified]: evidence.qualified,
    [BUYER_PROCESS_STAGE_KEYS.viewing]: evidence.viewingCompleted,
    [BUYER_PROCESS_STAGE_KEYS.transactionSetup]: evidence.transactionSetupComplete,
    [BUYER_PROCESS_STAGE_KEYS.offer]: evidence.offerComplete,
    [BUYER_PROCESS_STAGE_KEYS.transaction]: evidence.transactionCreated,
  }
  const started = {
    [BUYER_PROCESS_STAGE_KEYS.captured]: evidence.leadCaptured,
    [BUYER_PROCESS_STAGE_KEYS.contacted]: evidence.contacted,
    [BUYER_PROCESS_STAGE_KEYS.qualified]: evidence.qualificationStarted || evidence.qualified,
    [BUYER_PROCESS_STAGE_KEYS.viewing]: evidence.viewingStarted || evidence.viewingCompleted,
    [BUYER_PROCESS_STAGE_KEYS.transactionSetup]: evidence.transactionSetupStarted || evidence.transactionSetupComplete,
    [BUYER_PROCESS_STAGE_KEYS.offer]: evidence.offerStarted || evidence.offerComplete,
    [BUYER_PROCESS_STAGE_KEYS.transaction]: evidence.transactionCreated,
  }

  stageOrder.forEach((stageKey, index) => {
    if (persistedIndex > index) directDone[stageKey] = true
    if (persistedIndex === index) started[stageKey] = true
  })
  const furthestCompletedIndex = stageOrder.reduce(
    (furthest, stageKey, index) => directDone[stageKey] ? Math.max(furthest, index) : furthest,
    -1,
  )
  const rawStages = stageOrder.map((stageKey, index) => ({
    key: stageKey,
    label: STAGE_LABELS[stageKey],
    detail: details[stageKey] || '',
    done: index <= furthestCompletedIndex,
    started: Boolean(started[stageKey]) || index <= furthestCompletedIndex,
  }))
  const stages = applyJourneyStageOverrides({
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    stages: rawStages,
    overrides,
    stageOrder,
  })
  const currentStage = stages.find((stage) => stage.state === 'current') || stages[stages.length - 1] || null
  return {
    stages,
    currentStage,
    currentStageKey: currentStage?.key || BUYER_PROCESS_STAGE_KEYS.captured,
    nextAction: nextActionForStage(currentStage?.key, evidence, inPersonOtpFlow),
    stageOrder,
    persistedStageKey,
  }
}
