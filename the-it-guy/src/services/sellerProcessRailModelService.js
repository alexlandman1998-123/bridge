import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
} from './sellerProcessProfileService.js'
import { evaluateSellerProcess } from './sellerProcessEvaluationService.js'

const KINGSTONS_RAIL_BLUEPRINT = Object.freeze([
  Object.freeze({
    key: 'first_contact',
    label: 'First Contact',
    sourceStageKeys: Object.freeze(['first_contact']),
    actionKey: 'contact_seller',
    surface: 'activity',
  }),
  Object.freeze({
    key: 'valuation_appointment',
    label: 'Schedule Valuation Appointment',
    sourceStageKeys: Object.freeze(['valuation_appointment_scheduled']),
    actionKey: 'schedule_valuation_appointment',
    surface: 'appointments',
    appointmentType: 'seller_valuation',
  }),
  Object.freeze({
    key: 'formal_valuation',
    label: 'Formal Valuation',
    sourceStageKeys: Object.freeze(['formal_valuation_completed']),
    actionKey: 'upload_valuation_document',
    surface: 'documents',
    documentType: 'valuation_document',
  }),
  Object.freeze({
    key: 'valuation_presentation',
    label: 'Valuation Presentation',
    sourceStageKeys: Object.freeze([
      'valuation_presentation_scheduled',
      'valuation_presented',
    ]),
    actionKey: 'schedule_valuation_presentation',
    surface: 'appointments',
    appointmentType: 'valuation_presentation',
  }),
  Object.freeze({
    key: 'seller_pack',
    label: 'Seller Pack',
    sourceStageKeys: Object.freeze(['seller_pack_signed']),
    actionKey: 'complete_seller_pack',
    surface: 'mandate',
    deferred: true,
    disabledReason: 'seller_pack_deferred',
  }),
  Object.freeze({
    key: 'list_property',
    label: 'List Property',
    sourceStageKeys: Object.freeze(['listing_ready']),
    actionKey: 'prepare_listing',
    surface: 'listingWorkspace',
  }),
])

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function emptyRailModel(profile = DEFAULT_SELLER_PROCESS_PROFILE) {
  return Object.freeze({
    visible: false,
    profile,
    mode: 'default',
    title: '',
    stages: [],
    currentStageKey: '',
    currentStageLabel: '',
    percent: 0,
    canReplaceSellerJourney: false,
    readOnly: true,
    sellerPackDeferred: false,
  })
}

function buildSourceStageMap(evaluation = {}) {
  return new Map(asArray(evaluation.stages).map((stage) => [stage.key, stage]))
}

function isRailStageComplete(blueprint = {}, stageMap = new Map()) {
  const sourceStageKeys = asArray(blueprint.sourceStageKeys)
  return Boolean(sourceStageKeys.length && sourceStageKeys.every((key) => stageMap.get(key)?.complete === true))
}

function missingEvidenceKeysForRailStage(blueprint = {}, stageMap = new Map()) {
  return [
    ...new Set(
      asArray(blueprint.sourceStageKeys)
        .flatMap((key) => asArray(stageMap.get(key)?.missingEvidenceKeys)),
    ),
  ]
}

function buildRailStages(evaluation = {}) {
  const stageMap = buildSourceStageMap(evaluation)
  const currentProcessStageKey = normalizeText(evaluation.currentStage?.key)
  const firstIncompleteIndex = KINGSTONS_RAIL_BLUEPRINT.findIndex((blueprint) => !isRailStageComplete(blueprint, stageMap))

  return KINGSTONS_RAIL_BLUEPRINT.map((blueprint, index) => {
    const sourceStageKeys = asArray(blueprint.sourceStageKeys)
    const complete = isRailStageComplete(blueprint, stageMap)
    const containsCurrentProcessStage = sourceStageKeys.includes(currentProcessStageKey)
    const current = !complete && (containsCurrentProcessStage || index === firstIncompleteIndex)
    const deferred = blueprint.deferred === true
    const missingEvidenceKeys = missingEvidenceKeysForRailStage(blueprint, stageMap)
    return Object.freeze({
      key: blueprint.key,
      label: blueprint.label,
      sourceStageKeys,
      state: complete ? 'complete' : current ? 'current' : 'upcoming',
      complete,
      current,
      pending: !complete,
      missingEvidenceKeys,
      actionKey: blueprint.actionKey || '',
      surface: blueprint.surface || '',
      appointmentType: blueprint.appointmentType || '',
      documentType: blueprint.documentType || '',
      actionEnabled: !deferred && Boolean(blueprint.actionKey),
      deferred,
      disabledReason: blueprint.disabledReason || '',
      readOnly: true,
    })
  })
}

export function buildKingstonsSellerProcessRailModel(source = {}) {
  const evaluation = evaluateSellerProcess(source)
  if (evaluation.profile !== KINGSTONS_SELLER_PROCESS_PROFILE) {
    return emptyRailModel(evaluation.profile)
  }

  const stages = buildRailStages(evaluation)
  const currentStage = stages.find((stage) => stage.current) || stages[stages.length - 1] || null
  const completedCount = stages.filter((stage) => stage.complete).length

  return Object.freeze({
    visible: true,
    profile: evaluation.profile,
    mode: evaluation.canApplyToRuntime ? 'runtime_candidate' : 'shadow',
    title: 'Kingstons Seller Process',
    stages,
    currentStageKey: currentStage?.key || '',
    currentStageLabel: currentStage?.label || '',
    percent: stages.length ? Math.round((completedCount / stages.length) * 100) : 0,
    canReplaceSellerJourney: false,
    readOnly: true,
    sellerPackDeferred: true,
    evaluation,
  })
}

export function getKingstonsSellerProcessRailBlueprint() {
  return Object.freeze(KINGSTONS_RAIL_BLUEPRINT.map((stage) => ({ ...stage })))
}
