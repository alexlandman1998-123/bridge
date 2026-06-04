export const AUTOMATION_RULE_STATUSES = Object.freeze({
  active: 'active',
  disabled: 'disabled',
  draft: 'draft',
})

export const AUTOMATION_ACTION_TYPES = Object.freeze({
  createEscalation: 'create_escalation',
  sendNotification: 'send_notification',
  createTask: 'create_task',
  createBankEscalation: 'create_bank_escalation',
  createExecutiveAlert: 'create_executive_alert',
  createCoachingFlag: 'create_coaching_flag',
  createReassignmentRecommendation: 'create_reassignment_recommendation',
  calculateCommission: 'calculate_commission',
  createPayoutItem: 'create_payout_item',
  updateDashboard: 'update_dashboard',
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function nowDate(options = {}) {
  const value = options.now ? new Date(options.now) : new Date()
  return Number.isNaN(value.getTime()) ? new Date() : value
}

function daysBetween(left, right) {
  const leftDate = new Date(left)
  const rightDate = new Date(right)
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return 0
  return Math.max(0, Math.floor((rightDate.getTime() - leftDate.getTime()) / (24 * 60 * 60 * 1000)))
}

function getPathValue(source = {}, path = '') {
  const keys = normalizeText(path).split('.').filter(Boolean)
  if (!keys.length) return undefined
  return keys.reduce((current, key) => (current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined), source)
}

function compareNumbers(left, right, operator = 'gte') {
  const leftNumber = Number(left || 0)
  const rightNumber = Number(right || 0)
  if (operator === 'gt') return leftNumber > rightNumber
  if (operator === 'gte') return leftNumber >= rightNumber
  if (operator === 'lt') return leftNumber < rightNumber
  if (operator === 'lte') return leftNumber <= rightNumber
  return leftNumber === rightNumber
}

export function normalizeAutomationRule(rule = {}) {
  const trigger = typeof rule.trigger === 'string' ? { event: rule.trigger } : { ...(rule.trigger || {}) }
  return {
    id: normalizeText(rule.id),
    name: normalizeText(rule.name || 'Automation rule'),
    category: normalizeText(rule.category || 'Applications'),
    trigger: {
      event: normalizeText(trigger.event || trigger.type || trigger.name),
      entityType: normalizeText(trigger.entityType || trigger.entity_type),
    },
    conditions: normalizeArray(rule.conditions).map((condition) => ({
      field: normalizeText(condition.field),
      operator: normalizeText(condition.operator || 'equals'),
      value: condition.value,
      threshold: condition.threshold,
      days: condition.days,
      description: normalizeText(condition.description),
    })),
    actions: normalizeArray(rule.actions).map((action) => ({
      type: normalizeText(action.type || action.action),
      target: normalizeText(action.target),
      template: normalizeText(action.template),
      payload: action.payload || {},
      description: normalizeText(action.description || action.label),
    })),
    status: normalizeText(rule.status || AUTOMATION_RULE_STATUSES.active),
    createdBy: normalizeText(rule.createdBy || rule.created_by),
    createdAt: normalizeText(rule.createdAt || rule.created_at),
  }
}

function triggerMatches(rule = {}, entity = {}) {
  const event = normalizeLower(rule.trigger?.event)
  const entityType = normalizeLower(rule.trigger?.entityType)
  const entityEvents = [
    entity.eventType,
    entity.event,
    ...normalizeArray(entity.events),
  ].map(normalizeLower).filter(Boolean)
  const entityTypes = [
    entity.entityType,
    entity.type,
    entity.category,
  ].map(normalizeLower).filter(Boolean)

  const eventMatches = !event || entityEvents.includes(event)
  const typeMatches = !entityType || entityTypes.includes(entityType)
  return eventMatches && typeMatches
}

function evaluateCondition(condition = {}, entity = {}, options = {}) {
  const operator = normalizeLower(condition.operator)
  const value = getPathValue(entity, condition.field)
  const expected = condition.value ?? condition.threshold
  const currentDate = nowDate(options)
  let passed = false

  if (operator === 'equals' || operator === 'eq') passed = normalizeLower(value) === normalizeLower(expected)
  else if (operator === 'not_equals' || operator === 'neq') passed = normalizeLower(value) !== normalizeLower(expected)
  else if (operator === 'includes') passed = normalizeLower(value).includes(normalizeLower(expected))
  else if (operator === 'not_includes') passed = !normalizeLower(value).includes(normalizeLower(expected))
  else if (['gt', 'gte', 'lt', 'lte'].includes(operator)) passed = compareNumbers(value, expected, operator)
  else if (operator === 'between') {
    const [min, max] = normalizeArray(expected)
    passed = Number(value || 0) >= Number(min || 0) && Number(value || 0) <= Number(max || 0)
  } else if (operator === 'older_than_days' || operator === 'inactive_for_days') {
    passed = daysBetween(value, currentDate) >= Number(condition.days ?? condition.threshold ?? expected ?? 0)
  } else if (operator === 'missing') {
    passed = value === undefined || value === null || normalizeText(value) === ''
  } else if (operator === 'present') {
    passed = !(value === undefined || value === null || normalizeText(value) === '')
  } else {
    passed = Boolean(value)
  }

  return {
    field: condition.field,
    operator: condition.operator,
    expected,
    actual: value,
    passed,
    description: condition.description,
  }
}

export function evaluateRule(rule = {}, entity = {}, options = {}) {
  const normalizedRule = normalizeAutomationRule(rule)
  if (normalizedRule.status === AUTOMATION_RULE_STATUSES.disabled) {
    return {
      matched: false,
      triggerMatched: false,
      conditionResults: [],
      reason: 'Rule disabled',
    }
  }

  const triggerMatched = triggerMatches(normalizedRule, entity)
  const conditionResults = normalizedRule.conditions.map((condition) => evaluateCondition(condition, entity, options))
  const conditionsMatched = conditionResults.every((result) => result.passed)
  return {
    matched: triggerMatched && conditionsMatched,
    triggerMatched,
    conditionResults,
    actions: normalizedRule.actions,
    reason: triggerMatched && conditionsMatched ? 'Matched' : 'Rule did not match',
  }
}

function actionResult(action = {}, entity = {}, options = {}) {
  const dryRun = Boolean(options.dryRun)
  const type = normalizeText(action.type)
  const result = {
    actionType: type,
    target: action.target,
    status: dryRun ? 'simulated' : 'success',
    message: action.description || `${dryRun ? 'Would execute' : 'Executed'} ${type}`,
    entityId: normalizeText(entity.id || entity.entityId),
    entityType: normalizeText(entity.entityType || entity.type),
  }
  if (type.includes('escalation') || type.includes('alert')) result.outputType = 'escalation'
  else if (type.includes('notification') || type.startsWith('notify')) result.outputType = 'notification'
  else if (type.includes('task')) result.outputType = 'task'
  else if (type.includes('payout') || type.includes('commission')) result.outputType = 'payout'
  else if (type.includes('recommendation')) result.outputType = 'recommendation'
  else result.outputType = 'activity'
  return result
}

export function executeRule(rule = {}, entity = {}, options = {}) {
  const evaluation = evaluateRule(rule, entity, options)
  if (!evaluation.matched) {
    return {
      executed: false,
      result: 'skipped',
      evaluation,
      actionResults: [],
    }
  }
  const actionResults = evaluation.actions.map((action) => actionResult(action, entity, options))
  return {
    executed: true,
    result: actionResults.some((result) => result.status === 'failed') ? 'failed' : 'success',
    evaluation,
    actionResults,
  }
}

export function simulateRule(rule = {}, entities = [], options = {}) {
  const actionResults = []
  const matchedEntities = []
  normalizeArray(entities).forEach((entity) => {
    const execution = executeRule(rule, entity, { ...options, dryRun: true })
    if (!execution.executed) return
    matchedEntities.push(entity)
    actionResults.push(...execution.actionResults)
  })
  return {
    rule: normalizeAutomationRule(rule),
    entityCount: normalizeArray(entities).length,
    triggerCount: matchedEntities.length,
    matchedEntities,
    created: {
      escalations: actionResults.filter((result) => result.outputType === 'escalation').length,
      notifications: actionResults.filter((result) => result.outputType === 'notification').length,
      tasks: actionResults.filter((result) => result.outputType === 'task').length,
      payouts: actionResults.filter((result) => result.outputType === 'payout').length,
      recommendations: actionResults.filter((result) => result.outputType === 'recommendation').length,
    },
    actionResults,
  }
}

export function getRuleHistory(ruleId = '', history = []) {
  const safeRuleId = normalizeText(ruleId)
  return normalizeArray(history).filter((row) => !safeRuleId || normalizeText(row.ruleId || row.rule_id) === safeRuleId)
}

export function disableRule(rule = {}) {
  return { ...normalizeAutomationRule(rule), status: AUTOMATION_RULE_STATUSES.disabled }
}

export function enableRule(rule = {}) {
  return { ...normalizeAutomationRule(rule), status: AUTOMATION_RULE_STATUSES.active }
}
