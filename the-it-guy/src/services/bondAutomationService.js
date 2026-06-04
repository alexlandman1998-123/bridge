import {
  BOND_ORGANISATION_LEVELS,
  resolveBondOrganisationScope,
} from './bondOrganisationScopeResolver'
import { getPartnerPortalOperationalRows } from './bondPartnerPortalService'
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_RULE_STATUSES,
  disableRule as disableAutomationRule,
  enableRule as enableAutomationRule,
  evaluateRule as evaluateAutomationRule,
  executeRule as executeAutomationRule,
  getRuleHistory as getAutomationRuleHistory,
  normalizeAutomationRule,
  simulateRule as simulateAutomationRule,
} from './bondAutomationEngine'

export const BOND_AUTOMATION_EVENTS = Object.freeze({
  automationCreated: 'AUTOMATION_CREATED',
  automationUpdated: 'AUTOMATION_UPDATED',
  automationEnabled: 'AUTOMATION_ENABLED',
  automationDisabled: 'AUTOMATION_DISABLED',
  automationTriggered: 'AUTOMATION_TRIGGERED',
  automationFailed: 'AUTOMATION_FAILED',
  automationRecommendationCreated: 'AUTOMATION_RECOMMENDATION_CREATED',
})

export const BOND_AUTOMATION_CATEGORIES = Object.freeze([
  'Applications',
  'Documents',
  'Partners',
  'Consultants',
  'Branches',
  'Regions',
  'Banks',
  'Revenue',
  'SLA',
  'Communications',
])

const LOCAL_RULE_STORE = new Map()
const LOCAL_RUN_STORE = new Map()
const LOCAL_HISTORY_STORE = new Map()
const LOCAL_TEMPLATE_STORE = new Map()
const LOCAL_RECOMMENDATION_STORE = new Map()
let localSequence = 0

const MANAGER_ROLES = new Set(['owner', 'principal', 'director', 'partner', 'hq_manager', 'bond_hq_manager', 'national_manager', 'bond_national_manager', 'operations_manager', 'bond_operations_manager', 'admin', 'admin_staff'])
const REGIONAL_ROLES = new Set(['regional_manager', 'bond_regional_manager'])

export const DEFAULT_BOND_AUTOMATION_RULES = Object.freeze([
  {
    id: 'auto-application-inactive',
    name: 'Application inactive for 7 days',
    category: 'Applications',
    trigger: { event: 'application_idle', entityType: 'application' },
    conditions: [{ field: 'inactiveDays', operator: 'gte', threshold: 7, description: 'No activity for at least 7 days' }],
    actions: [
      { type: AUTOMATION_ACTION_TYPES.sendNotification, target: 'consultant', description: 'Notify consultant' },
      { type: AUTOMATION_ACTION_TYPES.createTask, target: 'consultant', description: 'Create follow-up task' },
      { type: AUTOMATION_ACTION_TYPES.createEscalation, target: 'branch_manager', description: 'Escalate if ignored' },
    ],
    status: AUTOMATION_RULE_STATUSES.active,
  },
  {
    id: 'auto-no-bank-feedback',
    name: 'No bank feedback after 5 days',
    category: 'Applications',
    trigger: { event: 'no_bank_feedback', entityType: 'application' },
    conditions: [
      { field: 'daysSinceSubmitted', operator: 'gte', threshold: 5 },
      { field: 'bankFeedbackReceived', operator: 'equals', value: false },
    ],
    actions: [
      { type: AUTOMATION_ACTION_TYPES.createBankEscalation, target: 'bank_relationship_owner', description: 'Create bank escalation' },
      { type: AUTOMATION_ACTION_TYPES.sendNotification, target: 'consultant', description: 'Notify consultant' },
    ],
    status: AUTOMATION_RULE_STATUSES.active,
  },
  {
    id: 'auto-document-missing',
    name: 'Missing documents reminder',
    category: 'Documents',
    trigger: { event: 'missing_documents', entityType: 'document' },
    conditions: [{ field: 'daysSinceRequested', operator: 'gte', threshold: 3 }],
    actions: [
      { type: AUTOMATION_ACTION_TYPES.sendNotification, target: 'partner', description: 'Send reminder email' },
      { type: AUTOMATION_ACTION_TYPES.createTask, target: 'consultant', description: 'Create document follow-up item' },
    ],
    status: AUTOMATION_RULE_STATUSES.active,
  },
  {
    id: 'auto-partner-health-risk',
    name: 'Partner health risk',
    category: 'Partners',
    trigger: { event: 'partner_health_updated', entityType: 'partner' },
    conditions: [{ field: 'healthScore', operator: 'lt', threshold: 50 }],
    actions: [
      { type: AUTOMATION_ACTION_TYPES.createExecutiveAlert, target: 'relationship_owner', description: 'Create executive alert' },
      { type: AUTOMATION_ACTION_TYPES.sendNotification, target: 'relationship_owner', description: 'Notify relationship owner' },
    ],
    status: AUTOMATION_RULE_STATUSES.active,
  },
  {
    id: 'auto-consultant-overloaded',
    name: 'Consultant overloaded',
    category: 'Consultants',
    trigger: { event: 'consultant_capacity_changed', entityType: 'consultant' },
    conditions: [{ field: 'activeApplications', operator: 'gt', threshold: 40 }],
    actions: [
      { type: AUTOMATION_ACTION_TYPES.createReassignmentRecommendation, target: 'branch_manager', description: 'Generate reassignment recommendation' },
      { type: AUTOMATION_ACTION_TYPES.sendNotification, target: 'branch_manager', description: 'Notify branch manager' },
    ],
    status: AUTOMATION_RULE_STATUSES.active,
  },
  {
    id: 'auto-branch-critical',
    name: 'Branch health critical',
    category: 'Branches',
    trigger: { event: 'branch_health_updated', entityType: 'branch' },
    conditions: [{ field: 'healthScore', operator: 'lt', threshold: 40 }],
    actions: [
      { type: AUTOMATION_ACTION_TYPES.createExecutiveAlert, target: 'regional_manager', description: 'Create regional alert' },
      { type: AUTOMATION_ACTION_TYPES.createReassignmentRecommendation, target: 'regional_manager', description: 'Generate intervention recommendation' },
    ],
    status: AUTOMATION_RULE_STATUSES.active,
  },
  {
    id: 'auto-regional-capacity-risk',
    name: 'Regional capacity risk',
    category: 'Regions',
    trigger: { event: 'regional_forecast_updated', entityType: 'region' },
    conditions: [{ field: 'forecastCapacityRisk', operator: 'gte', threshold: 80 }],
    actions: [
      { type: AUTOMATION_ACTION_TYPES.sendNotification, target: 'hq', description: 'Notify HQ' },
      { type: AUTOMATION_ACTION_TYPES.createReassignmentRecommendation, target: 'hq', description: 'Generate hiring recommendation' },
    ],
    status: AUTOMATION_RULE_STATUSES.active,
  },
  {
    id: 'auto-sla-at-risk',
    name: 'SLA at risk',
    category: 'SLA',
    trigger: { event: 'sla_metric_recorded', entityType: 'sla_request' },
    conditions: [{ field: 'slaConsumedPercent', operator: 'gte', threshold: 80 }],
    actions: [
      { type: AUTOMATION_ACTION_TYPES.sendNotification, target: 'owner', description: 'Notify owner' },
      { type: AUTOMATION_ACTION_TYPES.sendNotification, target: 'manager', description: 'Notify manager' },
    ],
    status: AUTOMATION_RULE_STATUSES.active,
  },
  {
    id: 'auto-bank-response-delay',
    name: 'Bank response delay',
    category: 'Banks',
    trigger: { event: 'bank_response_delay', entityType: 'bank' },
    conditions: [{ field: 'responseDelayPercent', operator: 'gte', threshold: 30 }],
    actions: [
      { type: AUTOMATION_ACTION_TYPES.createBankEscalation, target: 'relationship_owner', description: 'Create escalation' },
      { type: AUTOMATION_ACTION_TYPES.sendNotification, target: 'relationship_owner', description: 'Notify relationship owner' },
    ],
    status: AUTOMATION_RULE_STATUSES.active,
  },
  {
    id: 'auto-commission-ready',
    name: 'Commission ready',
    category: 'Revenue',
    trigger: { event: 'instruction_issued', entityType: 'revenue' },
    conditions: [{ field: 'instructionIssued', operator: 'equals', value: true }],
    actions: [
      { type: AUTOMATION_ACTION_TYPES.calculateCommission, target: 'finance', description: 'Calculate commission' },
      { type: AUTOMATION_ACTION_TYPES.createPayoutItem, target: 'finance', description: 'Create payout item' },
    ],
    status: AUTOMATION_RULE_STATUSES.active,
  },
])

export const DEFAULT_BOND_AUTOMATION_TEMPLATES = Object.freeze([
  { id: 'template-partner-follow-up', name: 'Partner Follow-Up', category: 'Communications', channel: 'email', subject: 'Outstanding bond application follow-up' },
  { id: 'template-document-reminder', name: 'Document Reminder', category: 'Documents', channel: 'email', subject: 'Documents still required' },
  { id: 'template-approval-notification', name: 'Approval Notification', category: 'Applications', channel: 'portal', subject: 'Bond approval received' },
  { id: 'template-escalation-notification', name: 'Escalation Notification', category: 'SLA', channel: 'email', subject: 'Escalation requires attention' },
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function createId(prefix = 'bond-automation') {
  localSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${localSequence}`
}

function getWorkspaceKey(context = {}, options = {}) {
  return normalizeText(
    options.workspaceId ||
      context.workspaceId ||
      context.currentWorkspace?.id ||
      context.workspace?.id ||
      context.currentMembership?.workspaceId ||
      context.currentMembership?.organisation_id ||
      context.currentMembership?.organisationId ||
      'default',
  )
}

function getActorId(context = {}) {
  return normalizeText(context.userId || context.user?.id || context.profile?.id || context.currentMembership?.userId || context.currentMembership?.user_id)
}

function getMembershipRole(context = {}) {
  return normalizeLower(context.currentMembership?.workspaceRole || context.currentMembership?.workspace_role || context.currentMembership?.organisationRole || context.currentMembership?.organisation_role || context.workspaceRole || context.organisationRole)
}

function hasExplicitHqScope(context = {}) {
  return normalizeLower(context.currentMembership?.scopeLevel || context.currentMembership?.scope_level || context.currentMembership?.scope || context.scopeLevel || context.scope_level) === 'workspace_hq'
}

function getLocalRows(store, workspaceKey = '') {
  return [...(store.get(workspaceKey) || [])]
}

function setLocalRows(store, workspaceKey = '', rows = []) {
  store.set(workspaceKey, rows)
}

function percent(part = 0, total = 0) {
  return total ? Math.round((Number(part || 0) / Number(total || 0)) * 100) : 0
}

function dayDiff(value = '', now = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)))
}

function statusSignal(row = {}) {
  return normalizeLower(`${row.status || ''} ${row.stage || ''} ${row.financeStatus || ''} ${row.finance_status || ''} ${row.revenueStatus || ''} ${row.revenue_status || ''} ${row.nextAction || ''} ${row.next_action || ''}`)
}

function getRows(context = {}, options = {}) {
  const workspaceKey = getWorkspaceKey(context, options)
  const operationalRows = getPartnerPortalOperationalRows(context, { ...options, workspaceId: workspaceKey })
  const applications = normalizeArray(options.applications || operationalRows.applications)
  const documents = normalizeArray(options.documents || operationalRows.documents)
  const partners = normalizeArray(options.partners || operationalRows.partners)
  const branches = normalizeArray(options.branches || options.units || operationalRows.branches || operationalRows.units)
  const regions = normalizeArray(options.regions || operationalRows.regions)
  const consultants = normalizeArray(options.consultants || options.users || operationalRows.consultants || operationalRows.users)
  const banks = normalizeArray(options.banks)
  const slaRequests = normalizeArray(options.slaRequests || options.requests || operationalRows.partnerRequests)
  const resolvedScope = resolveBondOrganisationScope(context, {
    regions,
    branches,
    consultants,
    applications,
  })
  const scope = hasExplicitHqScope(context)
    ? {
        ...resolvedScope,
        scopeLevel: BOND_ORGANISATION_LEVELS.hq,
        organisationLevel: BOND_ORGANISATION_LEVELS.hq,
        regionIds: 'ALL',
        branchIds: 'ALL',
        consultantIds: 'ALL',
      }
    : resolvedScope
  return {
    workspaceKey,
    scope,
    applications,
    documents,
    partners,
    branches,
    regions,
    consultants,
    banks,
    slaRequests,
    rules: [
      ...DEFAULT_BOND_AUTOMATION_RULES,
      ...normalizeArray(options.rules),
      ...getLocalRows(LOCAL_RULE_STORE, workspaceKey),
    ].map(normalizeRuleWithDefaults),
    templates: [
      ...DEFAULT_BOND_AUTOMATION_TEMPLATES,
      ...normalizeArray(options.templates),
      ...getLocalRows(LOCAL_TEMPLATE_STORE, workspaceKey),
    ],
    runs: [...normalizeArray(options.runs), ...getLocalRows(LOCAL_RUN_STORE, workspaceKey)],
    history: [...normalizeArray(options.history), ...getLocalRows(LOCAL_HISTORY_STORE, workspaceKey)],
    recommendations: [...normalizeArray(options.recommendations), ...getLocalRows(LOCAL_RECOMMENDATION_STORE, workspaceKey)],
  }
}

function normalizeRuleWithDefaults(rule = {}) {
  const normalized = normalizeAutomationRule(rule)
  return {
    ...normalized,
    id: normalized.id || createId('automation-rule'),
    status: normalized.status || AUTOMATION_RULE_STATUSES.active,
  }
}

function canManageAutomation(context = {}, scope = {}) {
  const role = getMembershipRole(context) || normalizeLower(scope.role)
  return (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq || hasExplicitHqScope(context)) && MANAGER_ROLES.has(role)
}

function canViewAutomation(context = {}, scope = {}) {
  const role = getMembershipRole(context) || normalizeLower(scope.role)
  if (canManageAutomation(context, scope)) return true
  return (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region || normalizeLower(context.currentMembership?.scopeLevel || context.currentMembership?.scope_level) === 'region') && REGIONAL_ROLES.has(role)
}

function assertViewAccess(rows = {}, context = {}) {
  if (canViewAutomation(context, rows.scope)) return
  const error = new Error('Automation & Rules access is not permitted for this user.')
  error.code = 'permission_denied'
  throw error
}

function assertManageAccess(rows = {}, context = {}) {
  if (canManageAutomation(context, rows.scope)) return
  const error = new Error('Only HQ and operations managers can manage automation rules.')
  error.code = 'permission_denied'
  throw error
}

function getApplicationId(row = {}) {
  return normalizeText(row.id || row.applicationId || row.application_id || row.transactionId || row.transaction_id || row.key)
}

function getApplicationConsultantId(row = {}) {
  return normalizeText(row.assignedConsultantId || row.assigned_consultant_id || row.assignedUserId || row.assigned_user_id || row.primaryBondConsultantUserId || row.primary_bond_consultant_user_id)
}

function getApplicationBranchId(row = {}) {
  return normalizeText(row.assignedBranchId || row.assigned_branch_id || row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id)
}

function getApplicationRegionId(row = {}) {
  return normalizeText(row.assignedRegionId || row.assigned_region_id || row.regionId || row.region_id)
}

function scopeMatchesApplication(scope = {}, row = {}) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return normalizeArray(scope.regionIds).includes(getApplicationRegionId(row))
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return normalizeArray(scope.branchIds).includes(getApplicationBranchId(row))
  return normalizeArray(scope.consultantIds).includes(getApplicationConsultantId(row))
}

function toApplicationEntity(row = {}, now = new Date()) {
  const signal = statusSignal(row)
  const submittedAt = normalizeText(row.submittedAt || row.submitted_at || row.createdAt || row.created_at)
  const updatedAt = normalizeText(row.updatedAt || row.updated_at || row.createdAt || row.created_at)
  const hasFeedback = Boolean(row.bankFeedbackAt || row.bank_feedback_at || signal.includes('feedback') || signal.includes('approved') || signal.includes('declined'))
  const instructionIssued = Boolean(row.instructionIssued || row.instruction_issued || signal.includes('instruction'))
  const events = ['application_submitted', 'application_idle']
  if (!hasFeedback) events.push('no_bank_feedback')
  if (signal.includes('approved')) events.push('approval_received')
  if (instructionIssued) events.push('instruction_issued')
  return {
    id: getApplicationId(row),
    entityId: getApplicationId(row),
    entityType: 'application',
    category: 'Applications',
    eventType: events[0],
    events,
    inactiveDays: dayDiff(updatedAt, now),
    daysSinceSubmitted: dayDiff(submittedAt, now),
    bankFeedbackReceived: hasFeedback,
    instructionIssued,
    status: normalizeText(row.status || row.financeStatus || row.finance_status),
    branchId: getApplicationBranchId(row),
    regionId: getApplicationRegionId(row),
    consultantId: getApplicationConsultantId(row),
    raw: row,
  }
}

function toDocumentEntity(row = {}, now = new Date()) {
  const requestedAt = normalizeText(row.requestedAt || row.requested_at || row.createdAt || row.created_at)
  const uploadedAt = normalizeText(row.uploadedAt || row.uploaded_at)
  const rejected = normalizeLower(row.status).includes('reject')
  const events = ['missing_documents']
  if (uploadedAt) events.push('document_uploaded')
  if (rejected) events.push('document_rejected')
  return {
    id: normalizeText(row.id || row.documentId || row.document_id),
    entityType: 'document',
    category: 'Documents',
    eventType: events[0],
    events,
    daysSinceRequested: dayDiff(requestedAt, now),
    uploadedAt,
    status: row.status,
    raw: row,
  }
}

function toPartnerEntity(row = {}) {
  const healthScore = Number(row.healthScore || row.health_score || row.partnerHealth || row.partner_health || 0)
  return {
    id: normalizeText(row.id || row.partnerId || row.partner_id),
    entityType: 'partner',
    category: 'Partners',
    eventType: 'partner_health_updated',
    events: ['partner_health_updated'],
    healthScore,
    status: healthScore < 50 ? 'At Risk' : 'Healthy',
    raw: row,
  }
}

function toConsultantEntity(row = {}) {
  return {
    id: normalizeText(row.id || row.userId || row.user_id),
    entityType: 'consultant',
    category: 'Consultants',
    eventType: 'consultant_capacity_changed',
    events: ['consultant_capacity_changed'],
    activeApplications: Number(row.activeApplications || row.active_applications || row.capacityScore || row.capacity_score || 0),
    approvalRate: Number(row.approvalRate || row.approval_rate || 0),
    raw: row,
  }
}

function toBranchEntity(row = {}) {
  return {
    id: normalizeText(row.id || row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id),
    entityType: 'branch',
    category: 'Branches',
    eventType: 'branch_health_updated',
    events: ['branch_health_updated'],
    healthScore: Number(row.healthScore || row.health_score || row.branchHealth || row.branch_health || 0),
    raw: row,
  }
}

function toRegionEntity(row = {}) {
  return {
    id: normalizeText(row.id || row.regionId || row.region_id),
    entityType: 'region',
    category: 'Regions',
    eventType: 'regional_forecast_updated',
    events: ['regional_forecast_updated'],
    forecastCapacityRisk: Number(row.forecastCapacityRisk || row.forecast_capacity_risk || row.capacityRisk || row.capacity_risk || 0),
    raw: row,
  }
}

function toBankEntity(row = {}) {
  return {
    id: normalizeText(row.id || row.bankId || row.bank_id || row.name || row.bank),
    entityType: 'bank',
    category: 'Banks',
    eventType: 'bank_response_delay',
    events: ['bank_response_delay', 'bank_health_updated'],
    responseDelayPercent: Number(row.responseDelayPercent || row.response_delay_percent || 0),
    healthScore: Number(row.healthScore || row.health_score || 0),
    raw: row,
  }
}

function toSlaEntity(row = {}) {
  const breached = Boolean(row.breached || row.slaBreached || row.sla_breached || normalizeLower(row.status).includes('breach'))
  const events = ['sla_metric_recorded']
  if (breached) events.push('sla_breach')
  return {
    id: normalizeText(row.id || row.requestId || row.request_id),
    entityType: 'sla_request',
    category: 'SLA',
    eventType: 'sla_metric_recorded',
    events,
    slaConsumedPercent: Number(row.slaConsumedPercent || row.sla_consumed_percent || row.slaPercent || row.sla_percent || (breached ? 100 : 0)),
    breached,
    raw: row,
  }
}

function toRevenueEntity(row = {}) {
  const signal = statusSignal(row)
  const instructionIssued = Boolean(row.instructionIssued || row.instruction_issued || signal.includes('instruction'))
  return {
    id: getApplicationId(row),
    entityType: 'revenue',
    category: 'Revenue',
    eventType: instructionIssued ? 'instruction_issued' : 'revenue_status_updated',
    events: instructionIssued ? ['instruction_issued', 'revenue_status_updated'] : ['revenue_status_updated'],
    instructionIssued,
    revenueStatus: normalizeText(row.revenueStatus || row.revenue_status),
    raw: row,
  }
}

function getAutomationEntities(rows = {}, options = {}) {
  const now = options.now ? new Date(options.now) : new Date()
  const scopedApplications = rows.applications.filter((row) => scopeMatchesApplication(rows.scope, row))
  return [
    ...scopedApplications.map((row) => toApplicationEntity(row, now)),
    ...scopedApplications.map((row) => toRevenueEntity(row)),
    ...rows.documents.map((row) => toDocumentEntity(row, now)),
    ...rows.partners.map(toPartnerEntity),
    ...rows.consultants.map(toConsultantEntity),
    ...rows.branches.map(toBranchEntity),
    ...rows.regions.map(toRegionEntity),
    ...rows.banks.map(toBankEntity),
    ...rows.slaRequests.map(toSlaEntity),
  ].filter((entity) => entity.id)
}

function recordHistory(workspaceKey = '', event = {}) {
  const history = {
    id: event.id || createId('automation-history'),
    ruleId: normalizeText(event.ruleId),
    ruleName: normalizeText(event.ruleName),
    entityId: normalizeText(event.entityId),
    entityType: normalizeText(event.entityType),
    actionType: normalizeText(event.actionType),
    result: normalizeText(event.result || 'success'),
    eventType: normalizeText(event.eventType),
    createdAt: event.createdAt || new Date().toISOString(),
    details: event.details || {},
  }
  setLocalRows(LOCAL_HISTORY_STORE, workspaceKey, [history, ...getLocalRows(LOCAL_HISTORY_STORE, workspaceKey)])
  return history
}

function recordRun(workspaceKey = '', run = {}) {
  const row = {
    id: run.id || createId('automation-run'),
    ruleId: normalizeText(run.ruleId),
    entityId: normalizeText(run.entityId),
    entityType: normalizeText(run.entityType),
    result: normalizeText(run.result || 'success'),
    executedAt: run.executedAt || new Date().toISOString(),
    actionResults: normalizeArray(run.actionResults),
  }
  setLocalRows(LOCAL_RUN_STORE, workspaceKey, [row, ...getLocalRows(LOCAL_RUN_STORE, workspaceKey)])
  return row
}

function activityEvent(workspaceKey = '', eventType = '', details = {}) {
  return recordHistory(workspaceKey, {
    ruleId: details.ruleId || '',
    ruleName: details.ruleName || '',
    entityId: details.entityId || '',
    entityType: details.entityType || 'automation',
    actionType: eventType,
    eventType,
    result: details.result || 'success',
    details,
  })
}

function isToday(value = '', now = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)
}

function summarizeActionCounts(history = []) {
  return {
    escalationsCreated: history.filter((row) => row.actionType.includes('escalation')).length,
    notificationsSent: history.filter((row) => row.actionType.includes('notification') || row.actionType.startsWith('notify')).length,
    tasksGenerated: history.filter((row) => row.actionType.includes('task')).length,
  }
}

function analyticsFromRows(rows = {}, now = new Date()) {
  const runs = rows.runs
  const history = rows.history
  const successes = runs.filter((row) => row.result === 'success').length
  const failures = runs.filter((row) => row.result === 'failed').length
  const actionCounts = summarizeActionCounts(history)
  const byRule = new Map()
  history.forEach((row) => {
    const key = row.ruleId || row.ruleName || 'Automation'
    byRule.set(key, {
      ruleId: row.ruleId,
      ruleName: row.ruleName || key,
      count: (byRule.get(key)?.count || 0) + 1,
    })
  })
  return {
    rulesTriggered: runs.length,
    successRate: percent(successes, runs.length),
    failures,
    mostActiveRules: [...byRule.values()].sort((left, right) => right.count - left.count).slice(0, 5),
    timeSavedMinutes: history.length * 8,
    triggeredToday: runs.filter((row) => isToday(row.executedAt, now)).length,
    ...actionCounts,
  }
}

function generateRecommendations(rows = {}, options = {}) {
  const entities = getAutomationEntities(rows, options)
  const recommendations = []
  const delayedFeedback = entities.filter((entity) => entity.events?.includes('no_bank_feedback') && entity.daysSinceSubmitted >= 5)
  if (delayedFeedback.length >= 1) {
    recommendations.push({
      id: 'recommend-no-bank-feedback',
      title: 'Applications regularly wait more than 5 days for feedback.',
      description: 'Create an automatic bank escalation rule?',
      category: 'Applications',
      impact: delayedFeedback.length,
      status: 'open',
    })
  }
  const missingDocuments = entities.filter((entity) => entity.entityType === 'document' && entity.daysSinceRequested >= 3 && !entity.uploadedAt)
  if (missingDocuments.length >= 1) {
    recommendations.push({
      id: 'recommend-document-reminders',
      title: 'Partners often upload documents late.',
      description: 'Create a reminder sequence?',
      category: 'Documents',
      impact: missingDocuments.length,
      status: 'open',
    })
  }
  const overloaded = entities.filter((entity) => entity.entityType === 'consultant' && entity.activeApplications > 40)
  if (overloaded.length >= 1) {
    recommendations.push({
      id: 'recommend-capacity-rebalancing',
      title: 'Consultants are exceeding healthy workload levels.',
      description: 'Create an automatic reassignment recommendation rule?',
      category: 'Consultants',
      impact: overloaded.length,
      status: 'open',
    })
  }
  return recommendations
}

function getRuleById(rows = {}, ruleId = '') {
  return rows.rules.find((rule) => rule.id === ruleId)
}

export function getAutomationDashboard(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertViewAccess(rows, context)
  const now = options.now ? new Date(options.now) : new Date()
  const analytics = analyticsFromRows(rows, now)
  const generatedRecommendations = generateRecommendations(rows, options)
  return {
    scope: rows.scope,
    permissions: {
      canManageRules: canManageAutomation(context, rows.scope),
      canViewRules: true,
    },
    summary: {
      activeRules: rows.rules.filter((rule) => rule.status === AUTOMATION_RULE_STATUSES.active).length,
      automationsTriggeredToday: analytics.triggeredToday,
      escalationsCreated: analytics.escalationsCreated,
      notificationsSent: analytics.notificationsSent,
      tasksGenerated: analytics.tasksGenerated,
      automationSuccessRate: analytics.successRate,
    },
    categories: BOND_AUTOMATION_CATEGORIES,
    rules: rows.rules,
    templates: rows.templates,
    history: rows.history,
    analytics,
    recommendations: [...generatedRecommendations, ...rows.recommendations],
  }
}

export function createRule(payload = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertManageAccess(rows, context)
  const rule = normalizeRuleWithDefaults({
    ...payload,
    id: payload.id || createId('automation-rule'),
    createdBy: getActorId(context),
    createdAt: new Date().toISOString(),
  })
  setLocalRows(LOCAL_RULE_STORE, rows.workspaceKey, [rule, ...getLocalRows(LOCAL_RULE_STORE, rows.workspaceKey)])
  activityEvent(rows.workspaceKey, BOND_AUTOMATION_EVENTS.automationCreated, { ruleId: rule.id, ruleName: rule.name })
  return rule
}

export function updateRule(ruleId = '', payload = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertManageAccess(rows, context)
  const existing = getRuleById(rows, ruleId)
  if (!existing) throwNotFound('Automation rule not found.')
  const updated = normalizeRuleWithDefaults({ ...existing, ...payload, id: existing.id })
  const localRows = getLocalRows(LOCAL_RULE_STORE, rows.workspaceKey)
  const nextRows = localRows.some((rule) => rule.id === ruleId)
    ? localRows.map((rule) => (rule.id === ruleId ? updated : rule))
    : [updated, ...localRows]
  setLocalRows(LOCAL_RULE_STORE, rows.workspaceKey, nextRows)
  activityEvent(rows.workspaceKey, BOND_AUTOMATION_EVENTS.automationUpdated, { ruleId: updated.id, ruleName: updated.name })
  return updated
}

export function enableRule(ruleId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertManageAccess(rows, context)
  const existing = getRuleById(rows, ruleId)
  if (!existing) throwNotFound('Automation rule not found.')
  const updated = enableAutomationRule(existing)
  setLocalRows(LOCAL_RULE_STORE, rows.workspaceKey, [updated, ...getLocalRows(LOCAL_RULE_STORE, rows.workspaceKey).filter((rule) => rule.id !== ruleId)])
  activityEvent(rows.workspaceKey, BOND_AUTOMATION_EVENTS.automationEnabled, { ruleId: updated.id, ruleName: updated.name })
  return updated
}

export function disableRule(ruleId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertManageAccess(rows, context)
  const existing = getRuleById(rows, ruleId)
  if (!existing) throwNotFound('Automation rule not found.')
  const updated = disableAutomationRule(existing)
  setLocalRows(LOCAL_RULE_STORE, rows.workspaceKey, [updated, ...getLocalRows(LOCAL_RULE_STORE, rows.workspaceKey).filter((rule) => rule.id !== ruleId)])
  activityEvent(rows.workspaceKey, BOND_AUTOMATION_EVENTS.automationDisabled, { ruleId: updated.id, ruleName: updated.name })
  return updated
}

export function evaluateRule(rule = {}, entity = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertViewAccess(rows, context)
  return evaluateAutomationRule(rule, entity, options)
}

export function executeRule(rule = {}, entity = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertManageAccess(rows, context)
  const normalizedRule = normalizeRuleWithDefaults(rule)
  const execution = executeAutomationRule(normalizedRule, entity, options)
  const result = execution.result === 'failed' ? 'failed' : 'success'
  if (execution.executed) {
    recordRun(rows.workspaceKey, {
      ruleId: normalizedRule.id,
      entityId: entity.id,
      entityType: entity.entityType,
      result,
      actionResults: execution.actionResults,
    })
    execution.actionResults.forEach((action) => {
      recordHistory(rows.workspaceKey, {
        ruleId: normalizedRule.id,
        ruleName: normalizedRule.name,
        entityId: entity.id,
        entityType: entity.entityType,
        actionType: action.actionType,
        result: action.status === 'failed' ? 'failed' : 'success',
        eventType: action.status === 'failed' ? BOND_AUTOMATION_EVENTS.automationFailed : BOND_AUTOMATION_EVENTS.automationTriggered,
        details: action,
      })
    })
  }
  if (!execution.executed || result === 'failed') {
    activityEvent(rows.workspaceKey, BOND_AUTOMATION_EVENTS.automationFailed, { ruleId: normalizedRule.id, ruleName: normalizedRule.name, entityId: entity.id, entityType: entity.entityType, result: 'failed' })
  }
  return execution
}

export function simulateRule(rule = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertViewAccess(rows, context)
  const entities = normalizeArray(options.entities).length ? normalizeArray(options.entities) : getAutomationEntities(rows, options)
  return simulateAutomationRule(rule, entities, { ...options, dryRun: true })
}

export function getAutomationHistory(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertViewAccess(rows, context)
  return getAutomationRuleHistory(options.ruleId || '', rows.history)
}

export function getAutomationAnalytics(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertViewAccess(rows, context)
  const now = options.now ? new Date(options.now) : new Date()
  return analyticsFromRows(rows, now)
}

export function getAutomationRecommendations(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertViewAccess(rows, context)
  const recommendations = generateRecommendations(rows, options)
  recommendations.forEach((recommendation) => {
    if (rows.recommendations.some((row) => row.id === recommendation.id)) return
    activityEvent(rows.workspaceKey, BOND_AUTOMATION_EVENTS.automationRecommendationCreated, { entityType: 'recommendation', entityId: recommendation.id, result: 'success' })
  })
  return [...recommendations, ...rows.recommendations]
}

function throwNotFound(message = 'Record not found.') {
  const error = new Error(message)
  error.code = 'not_found'
  throw error
}

export const __bondAutomationServiceTestUtils = Object.freeze({
  clearStores() {
    LOCAL_RULE_STORE.clear()
    LOCAL_RUN_STORE.clear()
    LOCAL_HISTORY_STORE.clear()
    LOCAL_TEMPLATE_STORE.clear()
    LOCAL_RECOMMENDATION_STORE.clear()
    localSequence = 0
  },
  getRules(workspaceKey = '') {
    return getLocalRows(LOCAL_RULE_STORE, workspaceKey)
  },
  getRuns(workspaceKey = '') {
    return getLocalRows(LOCAL_RUN_STORE, workspaceKey)
  },
  getHistory(workspaceKey = '') {
    return getLocalRows(LOCAL_HISTORY_STORE, workspaceKey)
  },
})
