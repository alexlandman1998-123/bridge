import {
  JOURNEY_ENTITY_TYPES,
  JOURNEY_NOTIFICATION_MODES,
  JOURNEY_STAGE_ACTIONS,
  getJourneyStagePolicy,
  validateJourneyCatchUpAction,
} from './journeyStagePolicy.js'

export const JOURNEY_STAGE_OVERRIDE_CONTRACT_VERSION = 'journey_stage_overrides_phase2_v1'

export const JOURNEY_STAGE_OVERRIDE_ENTITY_TYPES = Object.freeze([
  JOURNEY_ENTITY_TYPES.buyerLead,
  JOURNEY_ENTITY_TYPES.sellerLead,
  JOURNEY_ENTITY_TYPES.developerLead,
  JOURNEY_ENTITY_TYPES.transaction,
])

export const JOURNEY_STAGE_OVERRIDE_ACTION_TYPES = Object.freeze([
  JOURNEY_STAGE_ACTIONS.markComplete,
  JOURNEY_STAGE_ACTIONS.jumpToStage,
  JOURNEY_STAGE_ACTIONS.clearOverride,
  JOURNEY_STAGE_ACTIONS.markPaid,
])

export const JOURNEY_STAGE_OVERRIDE_NOTIFICATION_MODES = Object.freeze([
  JOURNEY_NOTIFICATION_MODES.internalOnly,
  JOURNEY_NOTIFICATION_MODES.normal,
])

export const JOURNEY_STAGE_OVERRIDE_REASON_MIN_LENGTH = 8

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeUuid(value) {
  const text = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : ''
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function normalizeJourneyStageOverrideInput(input = {}) {
  const actionType = normalizeText(input.actionType || input.action_type)
  const notificationMode = normalizeText(input.notificationMode || input.notification_mode) || JOURNEY_NOTIFICATION_MODES.internalOnly
  return {
    organisationId: normalizeUuid(input.organisationId || input.organisation_id),
    entityType: normalizeText(input.entityType || input.entity_type),
    entityId: normalizeUuid(input.entityId || input.entity_id),
    stageKey: normalizeText(input.stageKey || input.stage_key),
    actionType,
    reason: normalizeText(input.reason),
    effectiveAt: normalizeText(input.effectiveAt || input.effective_at),
    actorUserId: normalizeUuid(input.actorUserId || input.actor_user_id),
    notificationMode,
    metadata: normalizeObject(input.metadata),
    supersedesOverrideId: normalizeUuid(input.supersedesOverrideId || input.supersedes_override_id),
    linkedActivityTable: normalizeText(input.linkedActivityTable || input.linked_activity_table),
    linkedActivityId: normalizeUuid(input.linkedActivityId || input.linked_activity_id),
  }
}

export function validateJourneyStageOverrideInput(input = {}) {
  const override = normalizeJourneyStageOverrideInput(input)
  const errors = []

  if (!override.organisationId) errors.push({ field: 'organisationId', code: 'required_uuid' })
  if (!JOURNEY_STAGE_OVERRIDE_ENTITY_TYPES.includes(override.entityType)) errors.push({ field: 'entityType', code: 'invalid_entity_type' })
  if (!override.entityId) errors.push({ field: 'entityId', code: 'required_uuid' })
  if (!override.stageKey) errors.push({ field: 'stageKey', code: 'required' })
  if (!JOURNEY_STAGE_OVERRIDE_ACTION_TYPES.includes(override.actionType)) errors.push({ field: 'actionType', code: 'invalid_action_type' })
  if (!JOURNEY_STAGE_OVERRIDE_NOTIFICATION_MODES.includes(override.notificationMode)) errors.push({ field: 'notificationMode', code: 'invalid_notification_mode' })

  const needsReason = [
    JOURNEY_STAGE_ACTIONS.markComplete,
    JOURNEY_STAGE_ACTIONS.jumpToStage,
    JOURNEY_STAGE_ACTIONS.markPaid,
  ].includes(override.actionType)
  if (needsReason && override.reason.length < JOURNEY_STAGE_OVERRIDE_REASON_MIN_LENGTH) {
    errors.push({ field: 'reason', code: 'reason_too_short' })
  }

  if (override.linkedActivityTable && !override.linkedActivityId) {
    errors.push({ field: 'linkedActivityId', code: 'required_with_linked_activity_table' })
  }
  if (!override.linkedActivityTable && override.linkedActivityId) {
    errors.push({ field: 'linkedActivityTable', code: 'required_with_linked_activity_id' })
  }

  const policy = getJourneyStagePolicy(override.entityType, override.stageKey)
  if (!policy) {
    errors.push({ field: 'stageKey', code: 'unknown_policy_stage' })
  } else if (override.actionType === JOURNEY_STAGE_ACTIONS.markComplete) {
    const policyValidation = validateJourneyCatchUpAction({
      entityType: override.entityType,
      stageKey: override.stageKey,
      actionType: override.actionType,
      reason: override.reason,
    })
    if (!policyValidation.valid) {
      errors.push({ field: 'stageKey', code: policyValidation.code })
    }
  } else if (!policy.actions.includes(override.actionType) && override.actionType !== JOURNEY_STAGE_ACTIONS.clearOverride) {
    errors.push({ field: 'actionType', code: 'policy_action_not_allowed' })
  }

  return {
    valid: errors.length === 0,
    errors,
    override,
  }
}

export function serializeJourneyStageOverrideForDatabase(input = {}) {
  const result = validateJourneyStageOverrideInput(input)
  if (!result.valid) return result
  const override = result.override
  return {
    valid: true,
    errors: [],
    row: {
      organisation_id: override.organisationId,
      entity_type: override.entityType,
      entity_id: override.entityId,
      stage_key: override.stageKey,
      action_type: override.actionType,
      reason: override.reason || null,
      ...(override.effectiveAt ? { effective_at: override.effectiveAt } : {}),
      ...(override.actorUserId ? { actor_user_id: override.actorUserId } : {}),
      notification_mode: override.notificationMode,
      metadata: override.metadata,
      supersedes_override_id: override.supersedesOverrideId || null,
      linked_activity_table: override.linkedActivityTable || null,
      linked_activity_id: override.linkedActivityId || null,
    },
  }
}
