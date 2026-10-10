import { buildBuyerJourneyAlignmentModel } from './buyerJourneyAlignmentService.js'
import { normalizeBuyerProcessStageKey } from './buyerProcessDefinitionService.js'
import { DEVELOPMENT_SELECTION_STAGE, getDevelopmentLeadStage } from '../core/leads/developmentBuyerLead.js'

export function buildDevelopmentBuyerJourneyModel({ lead = {}, ...options } = {}) {
  const context = lead.developmentLeadContext || {}
  const persistedStageKey = getDevelopmentLeadStage(options.persistedStage, normalizeBuyerProcessStageKey(options.persistedStage)).key
  const selectionStage = persistedStageKey === DEVELOPMENT_SELECTION_STAGE
  const model = buildBuyerJourneyAlignmentModel({
    ...options,
    // Development buyers use onboarding before the signed OTP handoff.
    inPersonOtpFlow: false,
    persistedStage: selectionStage ? 'Transaction Setup' : persistedStageKey,
  })
  const unitSelected = Boolean(context.preferredUnitId || lead.preferredUnitId || lead.preferred_unit_id)
  const reservationState = String(context.reservationState || lead.reservationState || 'none').toLowerCase()
  const reserved = unitSelected && ['reserved', 'converted'].includes(reservationState)
  const selection = {
    key: DEVELOPMENT_SELECTION_STAGE,
    label: 'Unit Selection & Reservation',
    detail: reserved ? 'Reservation confirmed' : reservationState === 'expired' ? 'Reservation expired' : unitSelected ? 'Unit selected · Reservation not confirmed' : 'Select a unit',
    done: reserved,
    started: unitSelected || selectionStage,
    state: reserved ? 'completed' : 'upcoming',
  }
  const stages = model.stages.flatMap((stage) => {
    const label = stage.key === 'viewing' ? 'Viewing / Presentation' : stage.key === 'transaction_setup' ? 'Buyer Onboarding' : stage.key === 'offer' ? 'OTP' : stage.label
    return stage.key === 'transaction_setup' ? [selection, { ...stage, label }] : [{ ...stage, label }]
  })
  const currentIndex = options.evidence?.transactionCreated
    ? stages.findIndex((stage) => stage.key === 'transaction')
    : stages.findIndex((stage) => !stage.done && stage.state !== 'completed')
  const resolvedIndex = currentIndex < 0 ? stages.length - 1 : currentIndex
  const journeyStages = stages.map((stage, index) => ({ ...stage, current: index === resolvedIndex, state: index === resolvedIndex ? 'current' : stage.done ? 'completed' : 'upcoming' }))
  const currentStage = journeyStages[resolvedIndex]
  const nextAction = currentStage.key === DEVELOPMENT_SELECTION_STAGE
    ? { key: 'open_development', title: unitSelected ? 'Confirm unit reservation' : 'Select a development unit', description: 'Use the development workspace to choose the unit and confirm the actual reservation.' }
    : currentStage.key === 'transaction_setup'
      ? { ...model.nextAction, key: 'complete_transaction_setup', title: 'Complete buyer onboarding', description: 'Capture the purchaser, finance route and parties for this development purchase.' }
      : model.nextAction
  return { ...model, stages: journeyStages, currentStage, currentStageKey: currentStage.key, nextAction, stageOrder: journeyStages.map((stage) => stage.key) }
}
