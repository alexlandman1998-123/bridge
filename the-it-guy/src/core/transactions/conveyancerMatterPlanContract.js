export const CONVEYANCER_MATTER_PLAN_CONTRACT_VERSION = 'conveyancer_matter_plan_v1'

export const MATTER_PLAN_STATUSES = Object.freeze({
  draft: 'draft',
  active: 'active',
  superseded: 'superseded',
  completed: 'completed',
  cancelled: 'cancelled',
})

export const MATTER_PLAN_ACTION_STATES = Object.freeze({
  upcoming: 'upcoming',
  doNow: 'do_now',
  waiting: 'waiting',
  blocked: 'blocked',
  review: 'review',
  completed: 'completed',
  cancelled: 'cancelled',
})

export const MATTER_PLAN_ACTION_PRIORITIES = Object.freeze({
  critical: 'critical',
  urgent: 'urgent',
  high: 'high',
  normal: 'normal',
  low: 'low',
})

export const MATTER_PLAN_OWNER_ROLES = Object.freeze({
  conveyancer: 'conveyancer',
  secretary: 'secretary',
  firmManager: 'firm_manager',
  accounts: 'accounts',
  transferAttorney: 'transfer_attorney',
  bondAttorney: 'bond_attorney',
  cancellationAttorney: 'cancellation_attorney',
  client: 'client',
  externalParty: 'external_party',
  system: 'system',
})

export const MATTER_PLAN_CAPABILITIES = Object.freeze({
  view: 'view',
  executeOperational: 'execute_operational',
  executeLegal: 'execute_legal',
  manageFinancial: 'manage_financial',
  assign: 'assign',
  review: 'review',
  waive: 'waive',
  override: 'override',
  supersedePlan: 'supersede_plan',
})

export const MATTER_PLAN_DEPENDENCY_TYPES = Object.freeze({
  action: 'action',
  document: 'document',
  fact: 'fact',
  event: 'event',
  approval: 'approval',
  legalRole: 'legal_role',
  external: 'external',
})

export const MATTER_PLAN_EVIDENCE_TYPES = Object.freeze({
  document: 'document',
  data: 'data',
  confirmation: 'confirmation',
  decision: 'decision',
  signature: 'signature',
  payment: 'payment',
  externalReference: 'external_reference',
  note: 'note',
})

export const MATTER_PLAN_EVIDENCE_STATUSES = Object.freeze({
  provided: 'provided',
  approved: 'approved',
  waived: 'waived',
  rejected: 'rejected',
})

export const MATTER_PLAN_DUE_DATE_RULE_TYPES = Object.freeze({
  none: 'none',
  fixedDate: 'fixed_date',
  planActivationOffset: 'plan_activation_offset',
  actionCompletionOffset: 'action_completion_offset',
  eventOffset: 'event_offset',
  inherited: 'inherited',
})

export const CONVEYANCER_MATTER_PLAN_SCHEMA = Object.freeze({
  contractVersion: CONVEYANCER_MATTER_PLAN_CONTRACT_VERSION,
  immutableAfterActivation: true,
  versioning: 'append_only_supersession',
  requiredPlanFields: Object.freeze([
    'contractVersion',
    'transactionId',
    'organisationId',
    'version',
    'status',
    'generatedAt',
    'sourceFactsVersion',
    'actions',
  ]),
  requiredActionFields: Object.freeze([
    'key',
    'label',
    'state',
    'priority',
    'owner.role',
    'requiredCapability',
    'dependencies',
    'dueDateRule',
    'evidenceRequirements',
  ]),
})

const enumValues = (value) => Object.freeze(Object.values(value))
const PLAN_STATUS_VALUES = enumValues(MATTER_PLAN_STATUSES)
const ACTION_STATE_VALUES = enumValues(MATTER_PLAN_ACTION_STATES)
const PRIORITY_VALUES = enumValues(MATTER_PLAN_ACTION_PRIORITIES)
const OWNER_ROLE_VALUES = enumValues(MATTER_PLAN_OWNER_ROLES)
const CAPABILITY_VALUES = enumValues(MATTER_PLAN_CAPABILITIES)
const DEPENDENCY_TYPE_VALUES = enumValues(MATTER_PLAN_DEPENDENCY_TYPES)
const EVIDENCE_TYPE_VALUES = enumValues(MATTER_PLAN_EVIDENCE_TYPES)
const EVIDENCE_STATUS_VALUES = enumValues(MATTER_PLAN_EVIDENCE_STATUSES)
const DUE_DATE_RULE_VALUES = enumValues(MATTER_PLAN_DUE_DATE_RULE_TYPES)

const C = MATTER_PLAN_CAPABILITIES
const R = MATTER_PLAN_OWNER_ROLES
const S = MATTER_PLAN_ACTION_STATES

export const MATTER_PLAN_ROLE_CAPABILITIES = Object.freeze({
  [R.conveyancer]: Object.freeze([C.view, C.executeOperational, C.executeLegal, C.assign, C.review, C.waive]),
  [R.transferAttorney]: Object.freeze([C.view, C.executeOperational, C.executeLegal, C.assign, C.review, C.waive]),
  [R.secretary]: Object.freeze([C.view, C.executeOperational]),
  [R.firmManager]: Object.freeze(Object.values(C)),
  [R.accounts]: Object.freeze([C.view, C.executeOperational, C.manageFinancial]),
  [R.bondAttorney]: Object.freeze([C.view, C.executeOperational, C.executeLegal, C.review]),
  [R.cancellationAttorney]: Object.freeze([C.view, C.executeOperational, C.executeLegal, C.review]),
  [R.client]: Object.freeze([C.view, C.executeOperational]),
  [R.externalParty]: Object.freeze([C.view, C.executeOperational]),
  [R.system]: Object.freeze([C.view, C.executeOperational, C.assign]),
})

export const MATTER_PLAN_ACTION_TRANSITIONS = Object.freeze({
  [S.upcoming]: Object.freeze([S.doNow, S.waiting, S.blocked, S.cancelled]),
  [S.doNow]: Object.freeze([S.waiting, S.blocked, S.review, S.completed, S.cancelled]),
  [S.waiting]: Object.freeze([S.doNow, S.blocked, S.cancelled]),
  [S.blocked]: Object.freeze([S.doNow, S.waiting, S.cancelled]),
  [S.review]: Object.freeze([S.doNow, S.blocked, S.completed, S.cancelled]),
  [S.completed]: Object.freeze([]),
  [S.cancelled]: Object.freeze([]),
})

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEnum(value, allowed, fallback = '') {
  const normalized = normalizeKey(value)
  return allowed.includes(normalized) ? normalized : fallback
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

export function normalizeMatterPlanOwnerRole(value, fallback = '') {
  const aliases = {
    attorney: R.conveyancer,
    transferring_attorney: R.transferAttorney,
    transfer_conveyancer: R.transferAttorney,
    admin: R.secretary,
    administrator: R.secretary,
    manager: R.firmManager,
    firm_admin: R.firmManager,
    finance: R.accounts,
  }
  const normalized = normalizeKey(value)
  return OWNER_ROLE_VALUES.includes(normalized) ? normalized : aliases[normalized] || fallback
}

export function getMatterPlanRoleCapabilities(role) {
  return MATTER_PLAN_ROLE_CAPABILITIES[normalizeMatterPlanOwnerRole(role)] || Object.freeze([])
}

export function canMatterPlanActor(role, capability) {
  const normalizedCapability = normalizeEnum(capability, CAPABILITY_VALUES)
  return Boolean(normalizedCapability && getMatterPlanRoleCapabilities(role).includes(normalizedCapability))
}

export function normalizeMatterPlanAction(input = {}) {
  const owner = input.owner && typeof input.owner === 'object' ? input.owner : {}
  const dueDateRule = input.dueDateRule || input.due_date_rule || {}
  return {
    ...input,
    key: normalizeKey(input.key || input.actionKey || input.action_key),
    label: normalizeText(input.label || input.title),
    description: normalizeText(input.description),
    state: normalizeEnum(input.state || input.status, ACTION_STATE_VALUES, S.upcoming),
    priority: normalizeEnum(input.priority, PRIORITY_VALUES, MATTER_PLAN_ACTION_PRIORITIES.normal),
    owner: {
      role: normalizeMatterPlanOwnerRole(owner.role || input.ownerRole || input.owner_role),
      userId: normalizeText(owner.userId || owner.user_id || input.ownerUserId || input.owner_user_id) || null,
      teamId: normalizeText(owner.teamId || owner.team_id || input.ownerTeamId || input.owner_team_id) || null,
    },
    requiredCapability: normalizeEnum(
      input.requiredCapability || input.required_capability,
      CAPABILITY_VALUES,
      C.executeOperational,
    ),
    dependencies: (Array.isArray(input.dependencies) ? input.dependencies : []).map((dependency) => ({
      key: normalizeKey(dependency.key || dependency.id || dependency.targetKey || dependency.target_key),
      type: normalizeEnum(dependency.type, DEPENDENCY_TYPE_VALUES),
      required: dependency.required !== false,
    })),
    dueDateRule: {
      type: normalizeEnum(dueDateRule.type, DUE_DATE_RULE_VALUES, MATTER_PLAN_DUE_DATE_RULE_TYPES.none),
      offsetDays: dueDateRule.offsetDays ?? dueDateRule.offset_days ?? null,
      referenceKey: normalizeKey(dueDateRule.referenceKey || dueDateRule.reference_key),
      dueAt: dueDateRule.dueAt || dueDateRule.due_at || input.dueAt || input.due_at || null,
    },
    evidenceRequirements: (Array.isArray(input.evidenceRequirements || input.evidence_requirements)
      ? input.evidenceRequirements || input.evidence_requirements
      : []).map((requirement) => ({
      key: normalizeKey(requirement.key || requirement.id),
      label: normalizeText(requirement.label || requirement.title),
      type: normalizeEnum(requirement.type, EVIDENCE_TYPE_VALUES),
      required: requirement.required !== false,
      requiresApproval: requirement.requiresApproval === true || requirement.requires_approval === true,
    })),
    evidence: (Array.isArray(input.evidence) ? input.evidence : []).map((evidence) => ({
      requirementKey: normalizeKey(evidence.requirementKey || evidence.requirement_key),
      status: normalizeEnum(evidence.status, EVIDENCE_STATUS_VALUES),
      referenceId: normalizeText(evidence.referenceId || evidence.reference_id) || null,
      reason: normalizeText(evidence.reason) || null,
      capturedAt: evidence.capturedAt || evidence.captured_at || null,
    })),
    waitingOn: normalizeText(input.waitingOn || input.waiting_on),
    stateReason: normalizeText(input.stateReason || input.state_reason),
    completedAt: input.completedAt || input.completed_at || null,
  }
}

function requiredEvidenceSatisfied(action) {
  return action.evidenceRequirements
    .filter((requirement) => requirement.required)
    .every((requirement) => action.evidence.some((evidence) => {
      if (evidence.requirementKey !== requirement.key) return false
      if (evidence.status === MATTER_PLAN_EVIDENCE_STATUSES.waived) return Boolean(evidence.reason)
      if (requirement.requiresApproval) return evidence.status === MATTER_PLAN_EVIDENCE_STATUSES.approved
      return [MATTER_PLAN_EVIDENCE_STATUSES.provided, MATTER_PLAN_EVIDENCE_STATUSES.approved].includes(evidence.status)
    }))
}

export function validateMatterPlanAction(input = {}, { actionKeys = [] } = {}) {
  const action = normalizeMatterPlanAction(input)
  const errors = []
  const warnings = []
  const suppliedState = normalizeKey(input.state || input.status)
  const suppliedPriority = normalizeKey(input.priority)
  const suppliedCapability = normalizeKey(input.requiredCapability || input.required_capability)
  const suppliedDueDateRule = normalizeKey((input.dueDateRule || input.due_date_rule || {}).type)

  if (!action.key) errors.push('action_key_required')
  if (!action.label) errors.push('action_label_required')
  if (suppliedState && !ACTION_STATE_VALUES.includes(suppliedState)) errors.push('invalid_action_state')
  if (suppliedPriority && !PRIORITY_VALUES.includes(suppliedPriority)) errors.push('invalid_action_priority')
  if (suppliedCapability && !CAPABILITY_VALUES.includes(suppliedCapability)) errors.push('invalid_action_capability')
  if (!ACTION_STATE_VALUES.includes(action.state)) errors.push('invalid_action_state')
  if (!PRIORITY_VALUES.includes(action.priority)) errors.push('invalid_action_priority')
  if (!action.owner.role) errors.push('action_owner_role_required')
  if (!action.requiredCapability) errors.push('action_capability_required')
  if (action.owner.role && action.requiredCapability && !canMatterPlanActor(action.owner.role, action.requiredCapability)) {
    errors.push('owner_lacks_required_capability')
  }

  const dependencyKeys = action.dependencies.map((dependency) => dependency.key)
  if (dependencyKeys.some((key) => !key)) errors.push('dependency_key_required')
  if (action.dependencies.some((dependency) => !dependency.type)) errors.push('invalid_dependency_type')
  if (new Set(dependencyKeys).size !== dependencyKeys.length) errors.push('duplicate_dependency')
  if (action.dependencies.some((dependency) => dependency.type === MATTER_PLAN_DEPENDENCY_TYPES.action && dependency.key === action.key)) {
    errors.push('self_dependency_not_allowed')
  }
  if (actionKeys.length && action.dependencies.some((dependency) =>
    dependency.type === MATTER_PLAN_DEPENDENCY_TYPES.action && !actionKeys.includes(dependency.key))) {
    errors.push('unknown_action_dependency')
  }

  const rule = action.dueDateRule
  if (suppliedDueDateRule && !DUE_DATE_RULE_VALUES.includes(suppliedDueDateRule)) errors.push('invalid_due_date_rule')
  if (!DUE_DATE_RULE_VALUES.includes(rule.type)) errors.push('invalid_due_date_rule')
  if (rule.type === MATTER_PLAN_DUE_DATE_RULE_TYPES.fixedDate && !validDate(rule.dueAt)) errors.push('fixed_due_date_required')
  if ([MATTER_PLAN_DUE_DATE_RULE_TYPES.planActivationOffset, MATTER_PLAN_DUE_DATE_RULE_TYPES.actionCompletionOffset, MATTER_PLAN_DUE_DATE_RULE_TYPES.eventOffset].includes(rule.type)) {
    if (rule.offsetDays === null || !Number.isInteger(Number(rule.offsetDays))) errors.push('valid_due_date_offset_required')
  }
  if ([MATTER_PLAN_DUE_DATE_RULE_TYPES.actionCompletionOffset, MATTER_PLAN_DUE_DATE_RULE_TYPES.eventOffset, MATTER_PLAN_DUE_DATE_RULE_TYPES.inherited].includes(rule.type) && !rule.referenceKey) {
    errors.push('due_date_reference_required')
  }
  if (rule.type === MATTER_PLAN_DUE_DATE_RULE_TYPES.actionCompletionOffset && actionKeys.length && !actionKeys.includes(rule.referenceKey)) {
    errors.push('unknown_due_date_action_reference')
  }

  const evidenceKeys = action.evidenceRequirements.map((requirement) => requirement.key)
  if (evidenceKeys.some((key) => !key)) errors.push('evidence_requirement_key_required')
  if (action.evidenceRequirements.some((requirement) => !requirement.type)) errors.push('invalid_evidence_requirement_type')
  if (new Set(evidenceKeys).size !== evidenceKeys.length) errors.push('duplicate_evidence_requirement')
  if (action.evidence.some((evidence) => evidence.requirementKey && !evidenceKeys.includes(evidence.requirementKey))) {
    errors.push('unknown_evidence_requirement')
  }
  if (action.evidence.some((evidence) => !evidence.status)) errors.push('invalid_evidence_status')
  if (action.evidence.some((evidence) => !validDate(evidence.capturedAt))) errors.push('evidence_captured_at_required')
  if (action.evidence.some((evidence) => evidence.status === MATTER_PLAN_EVIDENCE_STATUSES.waived && !evidence.reason)) {
    errors.push('waived_evidence_reason_required')
  }

  if (action.state === S.waiting && !action.waitingOn) errors.push('waiting_on_required')
  if ([S.blocked, S.cancelled].includes(action.state) && !action.stateReason) errors.push('state_reason_required')
  if (action.state === S.completed) {
    if (!validDate(action.completedAt)) errors.push('completed_at_required')
    if (!requiredEvidenceSatisfied(action)) errors.push('required_evidence_not_satisfied')
  }
  if (!action.evidenceRequirements.length) warnings.push('action_has_no_evidence_contract')

  return { valid: errors.length === 0, errors: unique(errors), warnings: unique(warnings), action }
}

function findDependencyCycles(actions = []) {
  const actionKeys = new Set(actions.map((action) => action.key))
  const graph = new Map(actions.map((action) => [
    action.key,
    action.dependencies
      .filter((dependency) => dependency.type === MATTER_PLAN_DEPENDENCY_TYPES.action && actionKeys.has(dependency.key))
      .map((dependency) => dependency.key),
  ]))
  const visiting = new Set()
  const visited = new Set()
  const cyclic = new Set()

  function visit(key, path = []) {
    if (visiting.has(key)) {
      path.slice(path.indexOf(key)).forEach((item) => cyclic.add(item))
      cyclic.add(key)
      return
    }
    if (visited.has(key)) return
    visiting.add(key)
    for (const dependency of graph.get(key) || []) visit(dependency, [...path, key])
    visiting.delete(key)
    visited.add(key)
  }

  for (const key of graph.keys()) visit(key)
  return [...cyclic].sort()
}

export function validateConveyancerMatterPlan(input = {}) {
  const sourceActions = Array.isArray(input.actions) ? input.actions : []
  const actions = sourceActions.map(normalizeMatterPlanAction)
  const actionKeys = actions.map((action) => action.key)
  const plan = {
    ...input,
    contractVersion: normalizeText(input.contractVersion || input.contract_version) || CONVEYANCER_MATTER_PLAN_CONTRACT_VERSION,
    planId: normalizeText(input.planId || input.plan_id) || null,
    transactionId: normalizeText(input.transactionId || input.transaction_id),
    organisationId: normalizeText(input.organisationId || input.organisation_id),
    version: Number(input.version || 0),
    status: normalizeEnum(input.status, PLAN_STATUS_VALUES, MATTER_PLAN_STATUSES.draft),
    previousPlanId: normalizeText(input.previousPlanId || input.previous_plan_id) || null,
    changeReason: normalizeText(input.changeReason || input.change_reason),
    generatedAt: input.generatedAt || input.generated_at || null,
    activatedAt: input.activatedAt || input.activated_at || null,
    sourceFactsVersion: normalizeText(input.sourceFactsVersion || input.source_facts_version),
    actions,
  }
  const errors = []
  const warnings = []
  const suppliedStatus = normalizeKey(input.status)

  if (plan.contractVersion !== CONVEYANCER_MATTER_PLAN_CONTRACT_VERSION) errors.push('unsupported_contract_version')
  if (!plan.transactionId) errors.push('transaction_id_required')
  if (!plan.organisationId) errors.push('organisation_id_required')
  if (!Number.isInteger(plan.version) || plan.version < 1) errors.push('positive_plan_version_required')
  if (suppliedStatus && !PLAN_STATUS_VALUES.includes(suppliedStatus)) errors.push('invalid_plan_status')
  if (!PLAN_STATUS_VALUES.includes(plan.status)) errors.push('invalid_plan_status')
  if (!validDate(plan.generatedAt)) errors.push('generated_at_required')
  if (!plan.sourceFactsVersion) errors.push('source_facts_version_required')
  if (plan.version > 1 && !plan.previousPlanId) errors.push('previous_plan_id_required')
  if (plan.version > 1 && !plan.changeReason) errors.push('plan_change_reason_required')
  if (plan.status === MATTER_PLAN_STATUSES.active && !validDate(plan.activatedAt)) errors.push('activated_at_required')
  if (!actions.length) warnings.push('plan_has_no_actions')
  if (actionKeys.some((key) => !key)) errors.push('action_key_required')
  if (new Set(actionKeys).size !== actionKeys.length) errors.push('duplicate_action_key')

  for (const [index, action] of actions.entries()) {
    const result = validateMatterPlanAction(sourceActions[index], { actionKeys })
    result.errors.forEach((error) => errors.push(`${action.key || 'unknown_action'}:${error}`))
    result.warnings.forEach((warning) => warnings.push(`${action.key || 'unknown_action'}:${warning}`))
  }
  const cycles = findDependencyCycles(actions)
  if (cycles.length) errors.push(`cyclic_action_dependencies:${cycles.join(',')}`)

  return { valid: errors.length === 0, errors: unique(errors), warnings: unique(warnings), plan }
}

export function evaluateMatterPlanActionTransition({
  fromState,
  toState,
  actorRole,
  reason = '',
  requiredEvidenceSatisfied: evidenceSatisfied = false,
} = {}) {
  const from = normalizeEnum(fromState, ACTION_STATE_VALUES)
  const to = normalizeEnum(toState, ACTION_STATE_VALUES)
  const role = normalizeMatterPlanOwnerRole(actorRole)
  const normalizedReason = normalizeText(reason)
  if (!from || !to) return { allowed: false, reason: 'invalid_action_state' }
  if (from === to) return { allowed: true, reason: 'no_change' }

  if (from === S.completed && to === S.doNow) {
    if (!canMatterPlanActor(role, C.review) || !normalizedReason) return { allowed: false, reason: 'authorised_reopen_reason_required' }
    return { allowed: true, reason: 'authorised_reopen' }
  }
  if (!(MATTER_PLAN_ACTION_TRANSITIONS[from] || []).includes(to)) return { allowed: false, reason: 'transition_not_allowed' }
  if ([S.blocked, S.cancelled].includes(to) && !normalizedReason) return { allowed: false, reason: 'transition_reason_required' }
  if (to === S.completed && !evidenceSatisfied) return { allowed: false, reason: 'required_evidence_not_satisfied' }
  return { allowed: true, reason: 'allowed_transition' }
}

export function evaluateMatterPlanSupersession({ currentPlan = {}, nextPlan = {}, actorRole, reason = '' } = {}) {
  const role = normalizeMatterPlanOwnerRole(actorRole)
  const normalizedReason = normalizeText(reason || nextPlan.changeReason || nextPlan.change_reason)
  if (!canMatterPlanActor(role, C.supersedePlan)) return { allowed: false, reason: 'plan_supersession_not_authorised' }
  if (!currentPlan.planId && !currentPlan.plan_id) return { allowed: false, reason: 'current_plan_id_required' }
  if (normalizeText(currentPlan.transactionId || currentPlan.transaction_id) !== normalizeText(nextPlan.transactionId || nextPlan.transaction_id)) {
    return { allowed: false, reason: 'transaction_mismatch' }
  }
  if (Number(nextPlan.version || 0) !== Number(currentPlan.version || 0) + 1) return { allowed: false, reason: 'next_plan_version_required' }
  if (normalizeText(nextPlan.previousPlanId || nextPlan.previous_plan_id) !== normalizeText(currentPlan.planId || currentPlan.plan_id)) {
    return { allowed: false, reason: 'previous_plan_link_required' }
  }
  if (!normalizedReason) return { allowed: false, reason: 'plan_change_reason_required' }
  return { allowed: true, reason: 'authorised_supersession' }
}
