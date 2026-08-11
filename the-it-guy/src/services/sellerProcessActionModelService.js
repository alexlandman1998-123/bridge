import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
} from './sellerProcessProfileService.js'
import { evaluateSellerProcess } from './sellerProcessEvaluationService.js'
import { buildSellerProcessEvidenceContext } from './sellerProcessEvidenceMappingService.js'

const KINGSTONS_ACTION_BLUEPRINTS = Object.freeze([
  Object.freeze({
    key: 'contact_seller',
    label: 'Contact Seller',
    description: 'Log first seller contact before moving into the Kingston valuation process.',
    requiredEvidenceKey: 'seller_contacted',
    stageKey: 'first_contact',
    surface: 'activity',
  }),
  Object.freeze({
    key: 'schedule_valuation_appointment',
    label: 'Schedule Valuation Appointment',
    description: 'Book the seller valuation appointment with the seller, agent, and linked roleplayers.',
    requiredEvidenceKey: 'valuation_appointment_scheduled',
    stageKey: 'valuation_appointment_scheduled',
    surface: 'appointments',
    appointmentType: 'seller_valuation',
  }),
  Object.freeze({
    key: 'upload_valuation_document',
    label: 'Upload Valuation Document',
    description: 'Upload the formal valuation document into Property Documents.',
    requiredEvidenceKey: 'valuation_document_uploaded',
    stageKey: 'formal_valuation_completed',
    surface: 'documents',
    documentType: 'valuation_document',
    documentCategory: 'property',
  }),
  Object.freeze({
    key: 'schedule_valuation_presentation',
    label: 'Schedule Valuation Presentation',
    description: 'Book the in-person valuation presentation appointment.',
    requiredEvidenceKey: 'valuation_presentation_scheduled',
    stageKey: 'valuation_presentation_scheduled',
    surface: 'appointments',
    appointmentType: 'valuation_presentation',
  }),
  Object.freeze({
    key: 'resend_valuation_presentation',
    label: 'Resend Valuation Presentation',
    description: 'Resend the existing valuation presentation appointment instead of creating a duplicate.',
    requiredEvidenceKey: 'valuation_presented',
    stageKey: 'valuation_presented',
    surface: 'appointments',
    appointmentType: 'valuation_presentation',
    resend: true,
    createDuplicate: false,
  }),
  Object.freeze({
    key: 'complete_seller_pack',
    label: 'Seller Pack',
    description: 'Complete the Kingstons seller pack from the mandate and document workspace.',
    requiredEvidenceKey: 'seller_pack_signed',
    stageKey: 'seller_pack_signed',
    surface: 'mandate',
  }),
  Object.freeze({
    key: 'prepare_listing',
    label: 'Prepare Listing',
    description: 'Create or open the listing workspace once the Kingston seller pack is complete.',
    requiredEvidenceKey: 'listing_ready',
    stageKey: 'listing_ready',
    surface: 'listingWorkspace',
  }),
])

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function emptyActionModel(profile = DEFAULT_SELLER_PROCESS_PROFILE) {
  return Object.freeze({
    visible: false,
    profile,
    mode: 'default',
    canReplaceGlobalNextBestAction: false,
    currentAction: null,
    actions: [],
    completedActionKeys: [],
    pendingActionKeys: [],
    readOnly: true,
  })
}

function stageForAction(evaluation = {}, blueprint = {}) {
  return asArray(evaluation.stages).find((stage) => stage.key === blueprint.stageKey) || null
}

function evidenceSatisfied(evaluation = {}, blueprint = {}) {
  const evidenceKey = normalizeText(blueprint.requiredEvidenceKey)
  if (evidenceKey && evaluation.evidence?.[evidenceKey]) {
    return evaluation.evidence[evidenceKey].satisfied === true
  }
  return stageForAction(evaluation, blueprint)?.complete === true
}

function buildAction(blueprint = {}, evaluation = {}) {
  const complete = evidenceSatisfied(evaluation, blueprint)
  const stage = stageForAction(evaluation, blueprint)
  const enabled = blueprint.enabled === false ? false : true

  return Object.freeze({
    key: blueprint.key,
    label: blueprint.label,
    description: blueprint.description,
    stageKey: blueprint.stageKey,
    requiredEvidenceKey: blueprint.requiredEvidenceKey,
    complete,
    pending: !complete,
    current: false,
    enabled,
    deferred: blueprint.deferred === true,
    disabledReason: blueprint.disabledReason || '',
    surface: blueprint.surface || '',
    appointmentType: blueprint.appointmentType || '',
    documentType: blueprint.documentType || '',
    documentCategory: blueprint.documentCategory || '',
    resend: blueprint.resend === true,
    createDuplicate: blueprint.createDuplicate !== false,
    evidenceCount: Number(evaluation.evidence?.[blueprint.requiredEvidenceKey]?.evidenceCount || 0),
    missingEvidenceKeys: asArray(stage?.missingEvidenceKeys),
    readOnly: true,
  })
}

function selectCurrentAction(actions = []) {
  return actions.find((action) => action.pending && action.enabled) ||
    actions.find((action) => action.pending) ||
    actions[actions.length - 1] ||
    null
}

function markCurrentAction(actions = [], currentAction = null) {
  return Object.freeze(actions.map((action) => Object.freeze({
    ...action,
    current: Boolean(currentAction && action.key === currentAction.key),
  })))
}

export function buildKingstonsSellerProcessActionModel(source = {}) {
  const evaluation = evaluateSellerProcess(buildSellerProcessEvidenceContext(source))
  if (evaluation.profile !== KINGSTONS_SELLER_PROCESS_PROFILE) {
    return emptyActionModel(evaluation.profile)
  }

  const baseActions = KINGSTONS_ACTION_BLUEPRINTS.map((blueprint) => buildAction(blueprint, evaluation))
  const selected = selectCurrentAction(baseActions)
  const actions = markCurrentAction(baseActions, selected)
  const currentAction = actions.find((action) => action.current) || selected

  return Object.freeze({
    visible: true,
    profile: evaluation.profile,
    mode: evaluation.canApplyToRuntime ? 'runtime_candidate' : 'shadow',
    canReplaceGlobalNextBestAction: true,
    currentAction,
    actions,
    completedActionKeys: actions.filter((action) => action.complete).map((action) => action.key),
    pendingActionKeys: actions.filter((action) => action.pending).map((action) => action.key),
    currentStageKey: normalizeText(evaluation.currentStage?.key),
    currentStageLabel: normalizeText(evaluation.currentStage?.label),
    readOnly: true,
    evaluation,
  })
}

export function getKingstonsSellerProcessActionBlueprints() {
  return Object.freeze(KINGSTONS_ACTION_BLUEPRINTS.map((action) => ({ ...action })))
}
