import { BOND_APPLICATION_FLOW_CONTRACT, getBondApplicationStep } from './bondApplicationFlowContract.js'
import {
  evaluateBondApplicationRule,
  getBondApplicationPathValue,
  isBondApplicationValuePresent,
} from './bondApplicationRuleEvaluator.js'

const DEFAULT_SCREEN_KEY = 'application_confirmation'
const PARTICIPANT_PATH_PREFIXES = {
  primary_applicant: 'participants.primaryApplicant',
  co_applicant: 'participants.coApplicant',
  surety: 'participants.sureties.0',
}

function normalizeCompletedScreenKeys(value, screenKeys) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item || '').trim()).filter((item) => screenKeys.has(item)))]
}

function isQuestionVisible(question, state) {
  return evaluateBondApplicationRule(question.visibleWhen, state)
}

function replaceRuleParticipantPath(rule, participantPath) {
  if (rule === true || rule === false || rule === null || rule === undefined) return rule
  if (Array.isArray(rule)) return rule.map((item) => replaceRuleParticipantPath(item, participantPath))
  if (!rule || typeof rule !== 'object') return rule
  return Object.entries(rule).reduce((accumulator, [key, value]) => {
    if (key === 'field' || key.endsWith('Path')) {
      accumulator[key] = String(value || '').replace(/^participants\.primaryApplicant/, participantPath)
    } else {
      accumulator[key] = replaceRuleParticipantPath(value, participantPath)
    }
    return accumulator
  }, {})
}

function adaptQuestionForParticipant(question, participantPath) {
  return {
    ...question,
    path: String(question.path || '').replace(/^participants\.primaryApplicant/, participantPath),
    visibleWhen: replaceRuleParticipantPath(question.visibleWhen, participantPath),
    requiredWhen: replaceRuleParticipantPath(question.requiredWhen, participantPath),
    validation: replaceRuleParticipantPath(question.validation, participantPath),
  }
}

function adaptGroupForParticipant(group, participantPath) {
  if (!group) return group
  return {
    ...group,
    path: String(group.path || '').replace(/^participants\.primaryApplicant/, participantPath),
  }
}

function resolveParticipantContract(contract, participantContext = {}) {
  const role = String(participantContext.participantRole || 'primary_applicant').trim()
  const participantPath = participantContext.participantPath || PARTICIPANT_PATH_PREFIXES[role] || PARTICIPANT_PATH_PREFIXES.primary_applicant
  const canManageParticipants = participantContext.canManageParticipants !== false && role === 'primary_applicant'
  const canEditShared = participantContext.canEditShared !== false && role === 'primary_applicant'
  const questions = contract.questions.map((question) => {
    const adapted = adaptQuestionForParticipant(question, participantPath)
    if (!canEditShared && adapted.path?.startsWith('application.finance')) {
      return { ...adapted, readOnly: true, requiredWhen: false }
    }
    return adapted
  })
  const repeatableGroups = Object.fromEntries(Object.entries(contract.repeatableGroups || {}).map(([key, group]) => [
    key,
    adaptGroupForParticipant(group, participantPath),
  ]))
  const screens = contract.screens
    .filter((screen) => canManageParticipants || screen.key !== 'applicant_structure')
    .filter((screen) => role !== 'surety' || !['application_confirmation', 'applicant_structure', 'bank_selection'].includes(screen.key))
    .map((screen) => ({
      ...screen,
      visibleWhen: replaceRuleParticipantPath(screen.visibleWhen, participantPath),
    }))
  const steps = role === 'surety'
    ? contract.steps
        .filter((step) => !['your_application', 'applicants'].includes(step.key))
        .map((step) => step.key === 'about_you' ? { ...step, label: 'Surety details' } : step)
    : role === 'co_applicant'
    ? contract.steps
        .filter((step) => step.key !== 'applicants')
        .map((step) => step.key === 'your_application' ? { ...step, label: 'Application summary' } : step)
    : contract.steps
  return { ...contract, questions, repeatableGroups, screens, steps }
}

function isQuestionRequired(question, state) {
  return Boolean(evaluateBondApplicationRule(question.requiredWhen, state))
}

function getVisibleQuestions(screen, state, contract) {
  return (screen.questionKeys || [])
    .map((questionKey) => contract.questions.find((question) => question.key === questionKey))
    .filter(Boolean)
    .filter((question) => isQuestionVisible(question, state))
    .map((question) => ({
      ...question,
      required: isQuestionRequired(question, state),
    }))
}

function isRepeatableQuestionComplete(question, state, contract) {
  const group = contract.repeatableGroups[question.groupKey]
  const records = getBondApplicationPathValue(state, question.path)
  if (!Array.isArray(records) || records.length === 0) return false
  const itemFields = group?.itemFields || []
  return records.some((record) => itemFields.every((field) => {
    if (!evaluateBondApplicationRule(field.requiredWhen, record)) return true
    return isBondApplicationValuePresent(getBondApplicationPathValue(record, field.path))
  }))
}

export function isBondApplicationQuestionComplete(question, state, contract = BOND_APPLICATION_FLOW_CONTRACT) {
  if (!question.required) return true
  if (question.type === 'repeatable_group') return isRepeatableQuestionComplete(question, state, contract)
  return isBondApplicationValuePresent(getBondApplicationPathValue(state, question.path))
}

function resolveVisibleScreens(contract, state, currentScreenKey = '') {
  return contract.screens
    .filter((screen) => !screen.editOnly || screen.key === currentScreenKey)
    .filter((screen) => evaluateBondApplicationRule(screen.visibleWhen, state))
    .map((screen) => ({
      ...screen,
      questions: getVisibleQuestions(screen, state, contract),
    }))
    .filter((screen) => screen.transitionOnly || screen.custom || screen.questions.length > 0)
}

function resolveStepStatus(step, visibleScreens, completedScreenKeys, state, contract) {
  if (step.future) return 'not_started'
  const stepScreens = visibleScreens.filter((screen) => screen.stepKey === step.key && !screen.transitionOnly)
  if (!stepScreens.length) return 'not_applicable'
  const requiredQuestions = stepScreens.flatMap((screen) => screen.questions.filter((question) => question.required))
  const completedRequired = requiredQuestions.filter((question) => isBondApplicationQuestionComplete(question, state, contract))
  if (requiredQuestions.length > 0 && completedRequired.length === requiredQuestions.length) return 'complete'
  if (stepScreens.some((screen) => completedScreenKeys.includes(screen.key))) return 'in_progress'
  if (requiredQuestions.some((question) => isBondApplicationValuePresent(getBondApplicationPathValue(state, question.path)))) return 'in_progress'
  return 'not_started'
}

function resolveProgress(visibleScreens, state, contract) {
  const guidedScreens = visibleScreens.filter((screen) => !screen.transitionOnly && !['documents', 'review_sign'].includes(screen.stepKey))
  const requiredQuestions = guidedScreens.flatMap((screen) => screen.questions.filter((question) => question.required))
  const completedRequired = requiredQuestions.filter((question) => isBondApplicationQuestionComplete(question, state, contract))
  const guidedRatio = requiredQuestions.length ? completedRequired.length / requiredQuestions.length : 0
  const guidedStageWeight = 6 / Math.max(contract.steps.length, 1)
  const percent = Math.max(1, Math.min(75, Math.round(guidedRatio * guidedStageWeight * 100)))
  return {
    completedRequired: completedRequired.length,
    totalRequired: requiredQuestions.length,
    guidedRatio,
    percent,
  }
}

export function resolveBondApplicationFlow({
  contract = BOND_APPLICATION_FLOW_CONTRACT,
  applicationState = {},
  currentScreenKey = DEFAULT_SCREEN_KEY,
  completedScreenKeys = [],
  participantContext = null,
} = {}) {
  const resolvedContract = participantContext ? resolveParticipantContract(contract, participantContext) : contract
  const visibleScreens = resolveVisibleScreens(resolvedContract, applicationState, currentScreenKey)
  const screenKeys = new Set(visibleScreens.map((screen) => screen.key))
  const completed = normalizeCompletedScreenKeys(completedScreenKeys, screenKeys)
  const requestedScreenKey = String(currentScreenKey || '').trim()
  const effectiveScreenKey = screenKeys.has(requestedScreenKey)
    ? requestedScreenKey
    : screenKeys.has(DEFAULT_SCREEN_KEY)
      ? DEFAULT_SCREEN_KEY
      : visibleScreens[0]?.key || DEFAULT_SCREEN_KEY
  const currentIndex = Math.max(visibleScreens.findIndex((screen) => screen.key === effectiveScreenKey), 0)
  const currentScreen = visibleScreens[currentIndex] || visibleScreens[0] || contract.screens[0]
  const currentStep = getBondApplicationStep(currentScreen.stepKey, resolvedContract)
  const stepStatuses = resolvedContract.steps.map((step) => ({
    ...step,
    status: resolveStepStatus(step, visibleScreens, completed, applicationState, resolvedContract),
    active: step.key === currentStep.key,
  }))
  const progress = resolveProgress(visibleScreens, applicationState, resolvedContract)

  return {
    contractVersion: resolvedContract.version,
    steps: stepStatuses,
    screens: visibleScreens,
    currentScreen,
    currentScreenKey: currentScreen.key,
    currentStep,
    currentStepIndex: Math.max(resolvedContract.steps.findIndex((step) => step.key === currentStep.key), 0),
    previousScreenKey: currentIndex > 0 ? visibleScreens[currentIndex - 1]?.key || null : null,
    nextScreenKey: visibleScreens[Math.min(currentIndex + 1, visibleScreens.length - 1)]?.key || currentScreen.key,
    completedScreenKeys: completed,
    progress,
    diagnostics: [],
    participantContext,
  }
}

export { DEFAULT_SCREEN_KEY as DEFAULT_BOND_APPLICATION_SCREEN_KEY }
