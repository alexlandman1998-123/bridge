import { cloneBondApplicationValue, isPlainObject } from '../bondApplicationState.js'
import {
  BOND_APPLICATION_FLOW_CONTRACT,
  BOND_APPLICATION_FLOW_STEPS,
  GUIDED_BOND_APPLICATION_PHASE6_FLOW_VERSION,
} from '../flow/bondApplicationFlowContract.js'
import { BOND_APPLICATION_DECLARATION_CONTRACT_VERSION } from '../submission/bondApplicationDeclarations.js'

export const GUIDED_BOND_APPLICATION_V2_META_KEY = 'guided_bond_application_v2'
export const GUIDED_BOND_APPLICATION_V2_FLOW_VERSION = GUIDED_BOND_APPLICATION_PHASE6_FLOW_VERSION
export const GUIDED_BOND_APPLICATION_PHASE2_HANDOFF_SECTION = 'income_deductions_expenses'

export const GUIDED_BOND_APPLICATION_PHASE2_STEPS = BOND_APPLICATION_FLOW_STEPS

export const GUIDED_BOND_APPLICATION_PHASE2_SCREENS = BOND_APPLICATION_FLOW_CONTRACT.screens.map((screen) => ({
  ...screen,
  screenKey: screen.key,
}))

export const GUIDED_BOND_APPLICATION_PHASE2_SCREEN_KEYS = new Set(
  GUIDED_BOND_APPLICATION_PHASE2_SCREENS.map((screen) => screen.screenKey),
)

const DEFAULT_SCREEN_KEY = 'application_confirmation'

export function getGuidedBondApplicationMetadata(legacyApplication = {}) {
  const metadata = legacyApplication?._meta?.[GUIDED_BOND_APPLICATION_V2_META_KEY]
  return isPlainObject(metadata) ? cloneBondApplicationValue(metadata) : null
}

export function getGuidedBondApplicationMetadataFromState(applicationState = {}) {
  return getGuidedBondApplicationMetadata(applicationState?.compatibility?.legacyBase || {})
}

function normalizeCompletedScreens(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item || '').trim()).filter((item) => GUIDED_BOND_APPLICATION_PHASE2_SCREEN_KEYS.has(item)))]
}

export function resolveGuidedBondApplicationScreenKey(metadata = null) {
  const requested = String(metadata?.current_screen_key || '').trim()
  if (requested && GUIDED_BOND_APPLICATION_PHASE2_SCREEN_KEYS.has(requested)) return requested
  return DEFAULT_SCREEN_KEY
}

export function getGuidedBondApplicationScreen(screenKey) {
  return GUIDED_BOND_APPLICATION_PHASE2_SCREENS.find((screen) => screen.screenKey === screenKey) ||
    GUIDED_BOND_APPLICATION_PHASE2_SCREENS[0]
}

export function getGuidedBondApplicationScreenIndex(screenKey) {
  return Math.max(GUIDED_BOND_APPLICATION_PHASE2_SCREENS.findIndex((screen) => screen.screenKey === screenKey), 0)
}

export function getNextGuidedBondApplicationScreenKey(currentScreenKey, options = {}) {
  if (currentScreenKey === 'about_you_confirmation' && options.enterAboutYouEdit) return 'about_you_edit'
  if (currentScreenKey === 'about_you_edit') return 'about_you_confirmation'

  const screens = GUIDED_BOND_APPLICATION_PHASE2_SCREENS.filter((screen) => !screen.editOnly)
  const index = screens.findIndex((screen) => screen.screenKey === currentScreenKey)
  return screens[Math.min(index + 1, screens.length - 1)]?.screenKey || DEFAULT_SCREEN_KEY
}

export function getPreviousGuidedBondApplicationScreenKey(currentScreenKey, completedScreenKeys = []) {
  if (currentScreenKey === 'about_you_edit') return 'about_you_confirmation'
  const screens = GUIDED_BOND_APPLICATION_PHASE2_SCREENS.filter((screen) => !screen.editOnly && !screen.transitionOnly)
  const index = screens.findIndex((screen) => screen.screenKey === currentScreenKey)
  if (index <= 0) return null
  const previous = screens[index - 1]
  if (previous?.screenKey === 'about_you_edit' && !completedScreenKeys.includes('about_you_edit')) {
    return 'about_you_confirmation'
  }
  return previous?.screenKey || null
}

export function createGuidedBondApplicationMetadataPatch({
  existingMetadata = null,
  currentScreenKey = DEFAULT_SCREEN_KEY,
  completedScreenKeys = [],
  handoffReason = null,
  handoffAt = null,
  documentRuleSetVersion = null,
  documentRequirementFingerprint = null,
  reviewSignHandoffAt = null,
  reviewSignHandoffReason = null,
  declarationContractVersion = BOND_APPLICATION_DECLARATION_CONTRACT_VERSION,
  activeSubmissionId = null,
  activeSubmissionVersion = null,
  submissionStatus = null,
  reviewCompletedAt = null,
  declarationsAcceptedAt = null,
  preparedAt = null,
  awaitingSignatureAt = null,
  submittedAt = null,
  normalizedApplicationId = null,
  normalizedStorageMode = null,
  participantRole = null,
  participantKey = null,
  reviewContextHash = null,
  now = new Date().toISOString(),
} = {}) {
  const existingCompleted = normalizeCompletedScreens(existingMetadata?.completed_screen_keys)
  const nextCompleted = normalizeCompletedScreens([...existingCompleted, ...completedScreenKeys])
  return {
    flow_version: GUIDED_BOND_APPLICATION_V2_FLOW_VERSION,
    current_step_key: getGuidedBondApplicationScreen(currentScreenKey).stepKey,
    current_screen_key: resolveGuidedBondApplicationScreenKey({ current_screen_key: currentScreenKey }),
    completed_screen_keys: nextCompleted,
    started_at: existingMetadata?.started_at || now,
    last_saved_at: now,
    legacy_handoff_at: handoffAt ?? existingMetadata?.legacy_handoff_at ?? null,
    legacy_handoff_reason: handoffReason ?? existingMetadata?.legacy_handoff_reason ?? null,
    document_rule_set_version: documentRuleSetVersion ?? existingMetadata?.document_rule_set_version ?? null,
    document_requirement_fingerprint: documentRequirementFingerprint ?? existingMetadata?.document_requirement_fingerprint ?? null,
    review_sign_handoff_at: reviewSignHandoffAt ?? existingMetadata?.review_sign_handoff_at ?? null,
    review_sign_handoff_reason: reviewSignHandoffReason ?? existingMetadata?.review_sign_handoff_reason ?? null,
    declaration_contract_version: declarationContractVersion ?? existingMetadata?.declaration_contract_version ?? null,
    active_submission_id: activeSubmissionId ?? existingMetadata?.active_submission_id ?? null,
    active_submission_version: activeSubmissionVersion ?? existingMetadata?.active_submission_version ?? null,
    submission_status: submissionStatus ?? existingMetadata?.submission_status ?? 'draft',
    review_completed_at: reviewCompletedAt ?? existingMetadata?.review_completed_at ?? null,
    declarations_accepted_at: declarationsAcceptedAt ?? existingMetadata?.declarations_accepted_at ?? null,
    prepared_at: preparedAt ?? existingMetadata?.prepared_at ?? null,
    awaiting_signature_at: awaitingSignatureAt ?? existingMetadata?.awaiting_signature_at ?? null,
    submitted_at: submittedAt ?? existingMetadata?.submitted_at ?? null,
    normalized_application_id: normalizedApplicationId ?? existingMetadata?.normalized_application_id ?? null,
    normalized_storage_mode: normalizedStorageMode ?? existingMetadata?.normalized_storage_mode ?? null,
    participant_role: participantRole ?? existingMetadata?.participant_role ?? null,
    participant_key: participantKey ?? existingMetadata?.participant_key ?? null,
    review_context_hash: reviewContextHash ?? existingMetadata?.review_context_hash ?? null,
  }
}

export function applyGuidedBondApplicationMetadata(legacyApplication = {}, metadataPatch = {}) {
  const legacy = cloneBondApplicationValue(legacyApplication) || {}
  const meta = isPlainObject(legacy._meta) ? cloneBondApplicationValue(legacy._meta) : {}
  legacy._meta = {
    ...meta,
    [GUIDED_BOND_APPLICATION_V2_META_KEY]: {
      ...(isPlainObject(meta[GUIDED_BOND_APPLICATION_V2_META_KEY]) ? meta[GUIDED_BOND_APPLICATION_V2_META_KEY] : {}),
      ...cloneBondApplicationValue(metadataPatch),
    },
  }
  return legacy
}

export function buildGuidedBondApplicationProgress(currentScreenKey, completedScreenKeys = []) {
  const currentScreen = getGuidedBondApplicationScreen(currentScreenKey)
  const currentStepIndex = Math.max(
    GUIDED_BOND_APPLICATION_PHASE2_STEPS.findIndex((step) => step.key === currentScreen.stepKey),
    0,
  )
  const completed = new Set(completedScreenKeys)
  const supportedScreens = GUIDED_BOND_APPLICATION_PHASE2_SCREENS.filter((screen) => !screen.editOnly && !screen.transitionOnly)
  const supportedCompleteCount = supportedScreens.filter((screen) => completed.has(screen.screenKey)).length
  const supportedProgress = supportedCompleteCount / Math.max(supportedScreens.length, 1)
  const percent = Math.max(
    1,
    Math.min(49, Math.round(((currentStepIndex + supportedProgress) / GUIDED_BOND_APPLICATION_PHASE2_STEPS.length) * 100)),
  )

  return {
    currentStep: GUIDED_BOND_APPLICATION_PHASE2_STEPS[currentStepIndex],
    currentStepIndex,
    stepCount: GUIDED_BOND_APPLICATION_PHASE2_STEPS.length,
    percent,
  }
}
