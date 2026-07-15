import {
  MATTER_PLAN_EVIDENCE_STATUSES,
  MATTER_PLAN_EVIDENCE_TYPES,
  MATTER_PLAN_OWNER_ROLES as R,
  normalizeMatterPlanOwnerRole,
} from './conveyancerMatterPlanContract.js'

export const CONVEYANCER_MATTER_EXCEPTION_CONTRACT_VERSION = 'conveyancer_matter_exception_v1'

export const MATTER_EXCEPTION_CATEGORIES = Object.freeze({
  factGap: 'fact_gap',
  document: 'document',
  authority: 'authority',
  instruction: 'instruction',
  appointment: 'appointment',
  compliance: 'compliance',
  financial: 'financial',
  dependency: 'dependency',
  deadline: 'deadline',
  externalParty: 'external_party',
  registry: 'registry',
  dataIntegrity: 'data_integrity',
  workflow: 'workflow',
})

export const MATTER_EXCEPTION_SEVERITIES = Object.freeze({
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
})

export const MATTER_EXCEPTION_STATUSES = Object.freeze({
  open: 'open',
  acknowledged: 'acknowledged',
  investigating: 'investigating',
  waitingExternal: 'waiting_external',
  remediation: 'remediation',
  pendingReview: 'pending_review',
  resolved: 'resolved',
  waived: 'waived',
  cancelled: 'cancelled',
  superseded: 'superseded',
})

export const MATTER_EXCEPTION_SOURCE_TYPES = Object.freeze({
  systemRule: 'system_rule',
  userReport: 'user_report',
  externalEvent: 'external_event',
  audit: 'audit',
  import: 'import',
})

export const MATTER_EXCEPTION_RESOLUTION_OUTCOMES = Object.freeze({
  corrected: 'corrected',
  fulfilled: 'fulfilled',
  externalResolution: 'external_resolution',
  acceptedRisk: 'accepted_risk',
  duplicate: 'duplicate',
  notApplicable: 'not_applicable',
})

export const MATTER_EXCEPTION_CAPABILITIES = Object.freeze({
  view: 'view',
  raise: 'raise',
  acknowledge: 'acknowledge',
  investigate: 'investigate',
  remediate: 'remediate',
  resolve: 'resolve',
  waive: 'waive',
  escalate: 'escalate',
  assign: 'assign',
  reopen: 'reopen',
  override: 'override',
  supersede: 'supersede',
})

const C = MATTER_EXCEPTION_CAPABILITIES
const S = MATTER_EXCEPTION_STATUSES
const enumValues = (value) => Object.freeze(Object.values(value))
const CATEGORY_VALUES = enumValues(MATTER_EXCEPTION_CATEGORIES)
const SEVERITY_VALUES = enumValues(MATTER_EXCEPTION_SEVERITIES)
const STATUS_VALUES = enumValues(MATTER_EXCEPTION_STATUSES)
const SOURCE_VALUES = enumValues(MATTER_EXCEPTION_SOURCE_TYPES)
const OUTCOME_VALUES = enumValues(MATTER_EXCEPTION_RESOLUTION_OUTCOMES)
const CAPABILITY_VALUES = enumValues(MATTER_EXCEPTION_CAPABILITIES)
const EVIDENCE_TYPE_VALUES = Object.values(MATTER_PLAN_EVIDENCE_TYPES)
const EVIDENCE_STATUS_VALUES = Object.values(MATTER_PLAN_EVIDENCE_STATUSES)

export const MATTER_EXCEPTION_ROLE_CAPABILITIES = Object.freeze({
  [R.conveyancer]: Object.freeze([C.view, C.raise, C.acknowledge, C.investigate, C.remediate, C.resolve, C.waive, C.escalate, C.assign, C.reopen]),
  [R.transferAttorney]: Object.freeze([C.view, C.raise, C.acknowledge, C.investigate, C.remediate, C.resolve, C.waive, C.escalate, C.assign, C.reopen]),
  [R.secretary]: Object.freeze([C.view, C.raise, C.acknowledge, C.investigate, C.remediate, C.escalate]),
  [R.firmManager]: Object.freeze(Object.values(C)),
  [R.accounts]: Object.freeze([C.view, C.raise, C.acknowledge, C.investigate, C.remediate, C.resolve, C.escalate]),
  [R.bondAttorney]: Object.freeze([C.view, C.raise, C.acknowledge, C.investigate, C.remediate, C.resolve, C.escalate]),
  [R.cancellationAttorney]: Object.freeze([C.view, C.raise, C.acknowledge, C.investigate, C.remediate, C.resolve, C.escalate]),
  [R.client]: Object.freeze([C.view, C.raise]),
  [R.externalParty]: Object.freeze([C.view, C.raise]),
  [R.system]: Object.freeze([C.view, C.raise, C.escalate]),
})

export const MATTER_EXCEPTION_TRANSITIONS = Object.freeze({
  [S.open]: Object.freeze([S.acknowledged, S.investigating, S.waitingExternal, S.cancelled, S.superseded]),
  [S.acknowledged]: Object.freeze([S.investigating, S.waitingExternal, S.remediation, S.pendingReview, S.cancelled, S.superseded]),
  [S.investigating]: Object.freeze([S.waitingExternal, S.remediation, S.pendingReview, S.resolved, S.cancelled, S.superseded]),
  [S.waitingExternal]: Object.freeze([S.investigating, S.remediation, S.pendingReview, S.cancelled, S.superseded]),
  [S.remediation]: Object.freeze([S.waitingExternal, S.pendingReview, S.resolved, S.cancelled, S.superseded]),
  [S.pendingReview]: Object.freeze([S.waitingExternal, S.remediation, S.resolved, S.waived, S.cancelled, S.superseded]),
  [S.resolved]: Object.freeze([S.investigating]),
  [S.waived]: Object.freeze([S.investigating]),
  [S.cancelled]: Object.freeze([S.investigating]),
  [S.superseded]: Object.freeze([]),
})

export const MATTER_EXCEPTION_SEVERITY_POLICY = Object.freeze({
  [MATTER_EXCEPTION_SEVERITIES.low]: Object.freeze({ responseHours: 48, resolutionHours: 240, escalationRequired: false }),
  [MATTER_EXCEPTION_SEVERITIES.medium]: Object.freeze({ responseHours: 24, resolutionHours: 120, escalationRequired: false }),
  [MATTER_EXCEPTION_SEVERITIES.high]: Object.freeze({ responseHours: 8, resolutionHours: 48, escalationRequired: false }),
  [MATTER_EXCEPTION_SEVERITIES.critical]: Object.freeze({ responseHours: 2, resolutionHours: 12, escalationRequired: true }),
})

export const CONVEYANCER_MATTER_EXCEPTION_SCHEMA = Object.freeze({
  contractVersion: CONVEYANCER_MATTER_EXCEPTION_CONTRACT_VERSION,
  recordModel: 'first_class_append_only_events',
  planMutationAllowed: false,
  requiredFields: Object.freeze([
    'exceptionId',
    'planId',
    'planVersion',
    'transactionId',
    'organisationId',
    'code',
    'deduplicationKey',
    'title',
    'category',
    'severity',
    'status',
    'source',
    'impact',
    'owner.role',
    'createdAt',
  ]),
})

function key(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
}

function text(value = '') {
  return String(value || '').trim()
}

function enumValue(value, allowed, fallback = '') {
  const normalized = key(value)
  return allowed.includes(normalized) ? normalized : fallback
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function actor(input = {}) {
  return {
    role: normalizeMatterPlanOwnerRole(input.role),
    userId: text(input.userId || input.user_id) || null,
  }
}

export function getMatterExceptionRoleCapabilities(role) {
  return MATTER_EXCEPTION_ROLE_CAPABILITIES[normalizeMatterPlanOwnerRole(role)] || Object.freeze([])
}

export function canMatterExceptionActor(role, capability) {
  const normalizedCapability = enumValue(capability, CAPABILITY_VALUES)
  return Boolean(normalizedCapability && getMatterExceptionRoleCapabilities(role).includes(normalizedCapability))
}

export function normalizeConveyancerMatterException(input = {}) {
  const source = input.source || {}
  const impact = input.impact || {}
  const owner = input.owner || {}
  const sla = input.sla || {}
  const escalation = input.escalation || {}
  const resolution = input.resolution || {}
  const evidenceRequirements = Array.isArray(input.evidenceRequirements || input.evidence_requirements)
    ? input.evidenceRequirements || input.evidence_requirements
    : []
  return {
    ...input,
    contractVersion: text(input.contractVersion || input.contract_version) || CONVEYANCER_MATTER_EXCEPTION_CONTRACT_VERSION,
    exceptionId: text(input.exceptionId || input.exception_id) || null,
    planId: text(input.planId || input.plan_id) || null,
    planVersion: Number(input.planVersion || input.plan_version || 0),
    transactionId: text(input.transactionId || input.transaction_id),
    organisationId: text(input.organisationId || input.organisation_id),
    actionKey: key(input.actionKey || input.action_key) || null,
    code: key(input.code),
    deduplicationKey: key(input.deduplicationKey || input.deduplication_key),
    title: text(input.title),
    description: text(input.description),
    category: enumValue(input.category, CATEGORY_VALUES),
    severity: enumValue(input.severity, SEVERITY_VALUES),
    status: enumValue(input.status, STATUS_VALUES, S.open),
    source: {
      type: enumValue(source.type, SOURCE_VALUES),
      sourceId: text(source.sourceId || source.source_id) || null,
      ruleId: text(source.ruleId || source.rule_id) || null,
      detectedAt: source.detectedAt || source.detected_at || null,
      detectedBy: actor(source.detectedBy || source.detected_by),
    },
    impact: {
      blocksMatter: impact.blocksMatter === true || impact.blocks_matter === true,
      blockedActionKeys: unique((impact.blockedActionKeys || impact.blocked_action_keys || []).map(key)),
      affectedRoles: unique((impact.affectedRoles || impact.affected_roles || []).map((role) => normalizeMatterPlanOwnerRole(role))),
      customerVisible: impact.customerVisible === true || impact.customer_visible === true,
    },
    owner: {
      role: normalizeMatterPlanOwnerRole(owner.role),
      userId: text(owner.userId || owner.user_id) || null,
      teamId: text(owner.teamId || owner.team_id) || null,
    },
    sla: {
      respondBy: sla.respondBy || sla.respond_by || null,
      resolveBy: sla.resolveBy || sla.resolve_by || null,
    },
    evidenceRequirements: evidenceRequirements.map((requirement) => ({
      key: key(requirement.key || requirement.id),
      label: text(requirement.label || requirement.title),
      type: enumValue(requirement.type, EVIDENCE_TYPE_VALUES),
      required: requirement.required !== false,
      requiresApproval: requirement.requiresApproval === true || requirement.requires_approval === true,
    })),
    evidence: (Array.isArray(input.evidence) ? input.evidence : []).map((item) => ({
      requirementKey: key(item.requirementKey || item.requirement_key),
      status: enumValue(item.status, EVIDENCE_STATUS_VALUES),
      referenceId: text(item.referenceId || item.reference_id) || null,
      reason: text(item.reason) || null,
      capturedAt: item.capturedAt || item.captured_at || null,
      capturedBy: actor(item.capturedBy || item.captured_by),
    })),
    waitingOn: text(input.waitingOn || input.waiting_on),
    followUpAt: input.followUpAt || input.follow_up_at || null,
    stateReason: text(input.stateReason || input.state_reason),
    escalation: {
      level: Number(escalation.level || 0),
      reason: text(escalation.reason),
      escalatedAt: escalation.escalatedAt || escalation.escalated_at || null,
      escalatedBy: actor(escalation.escalatedBy || escalation.escalated_by),
    },
    resolution: {
      outcome: enumValue(resolution.outcome, OUTCOME_VALUES),
      summary: text(resolution.summary),
      reason: text(resolution.reason),
      resolvedAt: resolution.resolvedAt || resolution.resolved_at || null,
      resolvedBy: actor(resolution.resolvedBy || resolution.resolved_by),
    },
    relatedExceptionIds: unique((input.relatedExceptionIds || input.related_exception_ids || []).map(text)),
    supersededByExceptionId: text(input.supersededByExceptionId || input.superseded_by_exception_id) || null,
    createdAt: input.createdAt || input.created_at || null,
    updatedAt: input.updatedAt || input.updated_at || null,
    runtimeRevision: Number(input.runtimeRevision || input.runtime_revision || 0),
    lastEventId: text(input.lastEventId || input.last_event_id) || null,
  }
}

function evidenceSatisfied(exception) {
  return exception.evidenceRequirements.filter((item) => item.required).every((requirement) =>
    exception.evidence.some((item) => {
      if (item.requirementKey !== requirement.key) return false
      if (item.status === MATTER_PLAN_EVIDENCE_STATUSES.waived) return Boolean(item.reason)
      if (requirement.requiresApproval) return item.status === MATTER_PLAN_EVIDENCE_STATUSES.approved
      return [MATTER_PLAN_EVIDENCE_STATUSES.provided, MATTER_PLAN_EVIDENCE_STATUSES.approved].includes(item.status)
    }))
}

export function validateConveyancerMatterException(input = {}, { actionKeys = [] } = {}) {
  const exception = normalizeConveyancerMatterException(input)
  const errors = []
  const warnings = []
  const suppliedCategory = key(input.category)
  const suppliedSeverity = key(input.severity)
  const suppliedStatus = key(input.status)
  const suppliedSource = key(input.source?.type)

  if (exception.contractVersion !== CONVEYANCER_MATTER_EXCEPTION_CONTRACT_VERSION) errors.push('unsupported_contract_version')
  if (!exception.exceptionId) errors.push('exception_id_required')
  if (!exception.planId) errors.push('plan_id_required')
  if (!Number.isInteger(exception.planVersion) || exception.planVersion < 1) errors.push('positive_plan_version_required')
  if (!exception.transactionId) errors.push('transaction_id_required')
  if (!exception.organisationId) errors.push('organisation_id_required')
  if (!exception.code) errors.push('exception_code_required')
  if (!exception.deduplicationKey) errors.push('exception_deduplication_key_required')
  if (!exception.title) errors.push('exception_title_required')
  if (!exception.description) warnings.push('exception_description_recommended')
  if (suppliedCategory && !CATEGORY_VALUES.includes(suppliedCategory)) errors.push('invalid_exception_category')
  if (suppliedSeverity && !SEVERITY_VALUES.includes(suppliedSeverity)) errors.push('invalid_exception_severity')
  if (suppliedStatus && !STATUS_VALUES.includes(suppliedStatus)) errors.push('invalid_exception_status')
  if (!suppliedStatus) errors.push('exception_status_required')
  if (!exception.category) errors.push('exception_category_required')
  if (!exception.severity) errors.push('exception_severity_required')
  if (!STATUS_VALUES.includes(exception.status)) errors.push('invalid_exception_status')
  if (suppliedSource && !SOURCE_VALUES.includes(suppliedSource)) errors.push('invalid_exception_source')
  if (!exception.source.type) errors.push('exception_source_required')
  if (!validDate(exception.source.detectedAt)) errors.push('detected_at_required')
  if (!exception.source.detectedBy.role) errors.push('detected_by_role_required')
  if (!canMatterExceptionActor(exception.source.detectedBy.role, C.raise)) errors.push('detector_cannot_raise_exception')
  if (exception.source.type === MATTER_EXCEPTION_SOURCE_TYPES.systemRule && !exception.source.ruleId) errors.push('system_rule_id_required')
  if (!exception.owner.role) errors.push('exception_owner_role_required')
  if (exception.owner.role && !canMatterExceptionActor(exception.owner.role, C.acknowledge)) errors.push('owner_cannot_manage_exception')
  if (!validDate(exception.createdAt)) errors.push('created_at_required')
  if (exception.updatedAt && !validDate(exception.updatedAt)) errors.push('invalid_updated_at')
  if (validDate(exception.createdAt) && validDate(exception.source.detectedAt) && new Date(exception.createdAt) < new Date(exception.source.detectedAt)) errors.push('created_at_precedes_detection')
  if (validDate(exception.createdAt) && validDate(exception.updatedAt) && new Date(exception.updatedAt) < new Date(exception.createdAt)) errors.push('updated_at_precedes_creation')
  if (!Number.isInteger(exception.runtimeRevision) || exception.runtimeRevision < 0) errors.push('invalid_runtime_revision')
  if (exception.runtimeRevision > 0 && !exception.lastEventId) errors.push('last_event_id_required')

  if (exception.actionKey && actionKeys.length && !actionKeys.includes(exception.actionKey)) errors.push('unknown_exception_action')
  if (actionKeys.length && exception.impact.blockedActionKeys.some((item) => !actionKeys.includes(item))) errors.push('unknown_blocked_action')
  if (exception.impact.affectedRoles.some((role) => !role)) errors.push('invalid_affected_role')
  if ([MATTER_EXCEPTION_SEVERITIES.high, MATTER_EXCEPTION_SEVERITIES.critical].includes(exception.severity)) {
    if (!validDate(exception.sla.respondBy)) errors.push('response_sla_required')
    if (!validDate(exception.sla.resolveBy)) errors.push('resolution_sla_required')
  }
  if (exception.sla.respondBy && !validDate(exception.sla.respondBy)) errors.push('invalid_response_sla')
  if (exception.sla.resolveBy && !validDate(exception.sla.resolveBy)) errors.push('invalid_resolution_sla')
  if (validDate(exception.createdAt) && validDate(exception.sla.respondBy) && new Date(exception.sla.respondBy) < new Date(exception.createdAt)) errors.push('response_sla_precedes_creation')
  if (validDate(exception.createdAt) && validDate(exception.sla.resolveBy) && new Date(exception.sla.resolveBy) < new Date(exception.createdAt)) errors.push('resolution_sla_precedes_creation')
  if (validDate(exception.sla.respondBy) && validDate(exception.sla.resolveBy) && new Date(exception.sla.resolveBy) < new Date(exception.sla.respondBy)) errors.push('resolution_sla_precedes_response_sla')
  if (exception.severity === MATTER_EXCEPTION_SEVERITIES.critical) {
    if (!exception.impact.blocksMatter && !exception.impact.blockedActionKeys.length) errors.push('critical_exception_must_block_work')
    if (exception.escalation.level < 1) errors.push('critical_exception_escalation_required')
  }
  if (exception.escalation.level < 0 || !Number.isInteger(exception.escalation.level)) errors.push('invalid_escalation_level')
  if (exception.escalation.level > 0) {
    if (!exception.escalation.reason) errors.push('escalation_reason_required')
    if (!validDate(exception.escalation.escalatedAt)) errors.push('escalated_at_required')
    if (validDate(exception.createdAt) && validDate(exception.escalation.escalatedAt) && new Date(exception.escalation.escalatedAt) < new Date(exception.createdAt)) errors.push('escalation_precedes_creation')
    if (!exception.escalation.escalatedBy.role || !canMatterExceptionActor(exception.escalation.escalatedBy.role, C.escalate)) errors.push('authorised_escalator_required')
  }

  const requirementKeys = exception.evidenceRequirements.map((item) => item.key)
  if (requirementKeys.some((item) => !item)) errors.push('evidence_requirement_key_required')
  if (new Set(requirementKeys).size !== requirementKeys.length) errors.push('duplicate_evidence_requirement')
  if (exception.evidenceRequirements.some((item) => !item.type)) errors.push('invalid_evidence_requirement_type')
  if (exception.evidence.some((item) => !requirementKeys.includes(item.requirementKey))) errors.push('unknown_evidence_requirement')
  if (exception.evidence.some((item) => !item.status)) errors.push('invalid_evidence_status')
  if (exception.evidence.some((item) => !validDate(item.capturedAt))) errors.push('evidence_captured_at_required')
  if (exception.evidence.some((item) => !item.capturedBy.role)) errors.push('evidence_captured_by_required')
  if (exception.evidence.some((item) => item.status === MATTER_PLAN_EVIDENCE_STATUSES.waived && !item.reason)) errors.push('waived_evidence_reason_required')

  if (exception.status === S.waitingExternal) {
    if (!exception.waitingOn) errors.push('waiting_on_required')
    if (!validDate(exception.followUpAt)) errors.push('follow_up_at_required')
    if (validDate(exception.createdAt) && validDate(exception.followUpAt) && new Date(exception.followUpAt) < new Date(exception.createdAt)) errors.push('follow_up_precedes_creation')
  }
  if ([S.cancelled, S.superseded].includes(exception.status) && !exception.stateReason) errors.push('state_reason_required')
  if (exception.status === S.superseded && !exception.supersededByExceptionId) errors.push('superseding_exception_id_required')
  if (exception.supersededByExceptionId === exception.exceptionId) errors.push('exception_cannot_supersede_itself')
  if (exception.relatedExceptionIds.includes(exception.exceptionId)) errors.push('exception_cannot_relate_to_itself')

  if ([S.resolved, S.waived].includes(exception.status)) {
    if (!exception.resolution.outcome) errors.push('resolution_outcome_required')
    if (!exception.resolution.summary) errors.push('resolution_summary_required')
    if (!validDate(exception.resolution.resolvedAt)) errors.push('resolved_at_required')
    if (validDate(exception.createdAt) && validDate(exception.resolution.resolvedAt) && new Date(exception.resolution.resolvedAt) < new Date(exception.createdAt)) errors.push('resolution_precedes_creation')
    if (!exception.resolution.resolvedBy.role) errors.push('resolved_by_role_required')
    if (!evidenceSatisfied(exception)) errors.push('required_resolution_evidence_not_satisfied')
    const capability = exception.status === S.waived ? C.waive : C.resolve
    if (exception.resolution.resolvedBy.role && !canMatterExceptionActor(exception.resolution.resolvedBy.role, capability)) errors.push('resolver_lacks_required_capability')
  }
  if (exception.status === S.waived) {
    if (exception.resolution.outcome !== MATTER_EXCEPTION_RESOLUTION_OUTCOMES.acceptedRisk) errors.push('waiver_requires_accepted_risk_outcome')
    if (!exception.resolution.reason) errors.push('waiver_reason_required')
    if (exception.severity === MATTER_EXCEPTION_SEVERITIES.critical && exception.resolution.resolvedBy.role !== R.firmManager) errors.push('critical_waiver_requires_firm_manager')
  }
  if (![S.resolved, S.waived].includes(exception.status) && exception.resolution.resolvedAt) warnings.push('resolution_record_before_terminal_status')

  return { valid: errors.length === 0, errors: unique(errors), warnings: unique(warnings), exception }
}

function capabilityForTransition(from, to) {
  if ([S.resolved, S.waived, S.cancelled].includes(from) && to === S.investigating) return C.reopen
  if (to === S.acknowledged) return C.acknowledge
  if ([S.investigating, S.waitingExternal].includes(to)) return C.investigate
  if ([S.remediation, S.pendingReview].includes(to)) return C.remediate
  if (to === S.resolved || to === S.cancelled) return C.resolve
  if (to === S.waived) return C.waive
  if (to === S.superseded) return C.supersede
  return ''
}

export function evaluateMatterExceptionTransition({
  fromStatus,
  toStatus,
  actorRole,
  reason = '',
  requiredEvidenceSatisfied = false,
  severity = MATTER_EXCEPTION_SEVERITIES.medium,
} = {}) {
  const from = enumValue(fromStatus, STATUS_VALUES)
  const to = enumValue(toStatus, STATUS_VALUES)
  const role = normalizeMatterPlanOwnerRole(actorRole)
  if (!from || !to) return { allowed: false, reason: 'invalid_exception_status' }
  if (from === to) return { allowed: true, reason: 'no_change' }
  if (!(MATTER_EXCEPTION_TRANSITIONS[from] || []).includes(to)) return { allowed: false, reason: 'exception_transition_not_allowed' }
  const capability = capabilityForTransition(from, to)
  if (!canMatterExceptionActor(role, capability)) return { allowed: false, reason: 'actor_lacks_exception_capability' }
  const reopening = [S.resolved, S.waived, S.cancelled].includes(from) && to === S.investigating
  const reasonRequired = reopening || [S.waitingExternal, S.waived, S.cancelled, S.superseded].includes(to)
  if (reasonRequired && !text(reason)) return { allowed: false, reason: 'exception_transition_reason_required' }
  if ([S.resolved, S.waived].includes(to) && !requiredEvidenceSatisfied) return { allowed: false, reason: 'required_resolution_evidence_not_satisfied' }
  if (to === S.waived && severity === MATTER_EXCEPTION_SEVERITIES.critical && role !== R.firmManager) return { allowed: false, reason: 'critical_waiver_requires_firm_manager' }
  return { allowed: true, reason: 'allowed_transition', requiredCapability: capability }
}

export function evaluateMatterExceptionEscalation({ exception = {}, actorRole, nextLevel, reason = '' } = {}) {
  const currentLevel = Number(exception.escalation?.level || 0)
  const targetLevel = Number(nextLevel)
  if (!canMatterExceptionActor(actorRole, C.escalate)) return { allowed: false, reason: 'exception_escalation_not_authorised' }
  if (!Number.isInteger(targetLevel) || targetLevel !== currentLevel + 1) return { allowed: false, reason: 'next_escalation_level_required' }
  if (!text(reason)) return { allowed: false, reason: 'escalation_reason_required' }
  if ([S.resolved, S.waived, S.cancelled, S.superseded].includes(exception.status)) return { allowed: false, reason: 'terminal_exception_cannot_escalate' }
  return { allowed: true, reason: 'authorised_escalation' }
}

export function evaluateMatterExceptionSupersession({ currentException = {}, nextException = {}, actorRole, reason = '' } = {}) {
  if (!canMatterExceptionActor(actorRole, C.supersede)) return { allowed: false, reason: 'exception_supersession_not_authorised' }
  if (!currentException.exceptionId && !currentException.exception_id) return { allowed: false, reason: 'current_exception_id_required' }
  if (currentException.status === S.superseded) return { allowed: false, reason: 'exception_already_superseded' }
  if (!nextException.exceptionId && !nextException.exception_id) return { allowed: false, reason: 'new_exception_id_required' }
  if (text(currentException.transactionId || currentException.transaction_id) !== text(nextException.transactionId || nextException.transaction_id)) return { allowed: false, reason: 'transaction_mismatch' }
  if (text(currentException.organisationId || currentException.organisation_id) !== text(nextException.organisationId || nextException.organisation_id)) return { allowed: false, reason: 'organisation_mismatch' }
  if (text(currentException.planId || currentException.plan_id) !== text(nextException.planId || nextException.plan_id)) return { allowed: false, reason: 'plan_mismatch' }
  if (Number(currentException.planVersion || currentException.plan_version || 0) !== Number(nextException.planVersion || nextException.plan_version || 0)) return { allowed: false, reason: 'plan_version_mismatch' }
  if (text(currentException.exceptionId || currentException.exception_id) === text(nextException.exceptionId || nextException.exception_id)) return { allowed: false, reason: 'new_exception_id_required' }
  if (!text(reason)) return { allowed: false, reason: 'exception_supersession_reason_required' }
  return { allowed: true, reason: 'authorised_supersession' }
}
