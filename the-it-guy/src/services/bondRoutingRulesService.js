import { isMissingTableError } from './attorneyFirmServiceShared'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { BOND_ORGANISATION_LEVELS, resolveBondOrganisationScope } from './bondOrganisationScopeResolver'

export const BOND_ROUTING_RULE_TYPES = Object.freeze({
  agency: 'agency',
  development: 'development',
  region: 'region',
  company: 'company',
  branch: 'branch',
})

export const BOND_ROUTING_METHODS = Object.freeze({
  manualOverride: 'MANUAL_OVERRIDE',
  developmentDefault: 'DEVELOPMENT_DEFAULT',
  agencyDefault: 'AGENCY_DEFAULT',
  agencyConsultantDefault: 'AGENCY_CONSULTANT_DEFAULT',
  regionalDefault: 'REGIONAL_DEFAULT',
  workloadBalanced: 'WORKLOAD_BALANCED',
  companyFallback: 'COMPANY_FALLBACK',
  overflow: 'OVERFLOW_BRANCH',
})

export const BOND_ROUTING_ACTIVITY_EVENTS = Object.freeze({
  created: 'ROUTING_RULE_CREATED',
  updated: 'ROUTING_RULE_UPDATED',
  disabled: 'ROUTING_RULE_DISABLED',
  used: 'ROUTING_RULE_USED',
})

const LOCAL_RULE_STORE = new Map()
const LOCAL_ACTIVITY_STORE = new Map()
let localRuleSequence = 0
const INACTIVE_CONSULTANT_STATUSES = new Set(['inactive', 'leave', 'on_leave', 'suspended'])
const ACTIVE_APPLICATION_TERMS = ['active', 'new', 'intake', 'pre', 'document', 'submit', 'feedback', 'bank', 'quote', 'instruction', 'in_progress']
const APPROVED_APPLICATION_TERMS = ['approved', 'grant', 'buyer_approved', 'accepted']
const VALID_RULE_TYPES = new Set(Object.values(BOND_ROUTING_RULE_TYPES))

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function isUuidLike(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function getWorkspaceKey(workspaceId = '', context = {}, options = {}) {
  return normalizeText(workspaceId || context.workspaceId || context.currentWorkspace?.id || context.currentMembership?.organisation_id || options.workspaceId || 'default')
}

function getActorUserId(context = {}) {
  return normalizeText(context.userId || context.user_id || context.profile?.id || context.user?.id || context.currentMembership?.user_id)
}

function getApplicationId(row = {}) {
  return normalizeText(row.applicationId || row.application_id || row.transactionId || row.transaction_id || row.id || row.key)
}

function getApplicationSignal(row = {}) {
  return normalizeLower(`${row.status || ''} ${row.stage || ''} ${row.financeStageKey || ''} ${row.finance_stage_key || ''} ${row.financeStageLabel || ''} ${row.current_main_stage || ''}`)
}

function isActiveApplication(row = {}) {
  const signal = getApplicationSignal(row)
  if (row.active === false || row.is_active === false) return false
  if (['archived', 'cancelled', 'canceled', 'completed', 'registered', 'declined', 'lost'].some((term) => signal.includes(term))) return false
  if (!signal) return true
  return ACTIVE_APPLICATION_TERMS.some((term) => signal.includes(term)) || !['inactive', 'closed'].some((term) => signal.includes(term))
}

function isApprovedApplication(row = {}) {
  const signal = getApplicationSignal(row)
  return APPROVED_APPLICATION_TERMS.some((term) => signal.includes(term))
}

function getApplicationConsultantId(row = {}) {
  return normalizeText(row.assignedConsultantId || row.assigned_consultant_id || row.assignedUserId || row.assigned_user_id || row.owner_user_id)
}

function getApplicationBranchId(row = {}) {
  return normalizeText(row.assignedBranchId || row.assigned_branch_id || row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id)
}

function getApplicationRegionId(row = {}) {
  return normalizeText(row.assignedRegionId || row.assigned_region_id || row.regionId || row.region_id)
}

function getConsultantId(row = {}) {
  return normalizeText(row.id || row.user_id || row.userId || row.consultantId || row.consultant_id)
}

function getConsultantBranchId(row = {}) {
  return normalizeText(row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id || row.primaryBranchId || row.primary_branch_id)
}

function getConsultantRegionId(row = {}) {
  return normalizeText(row.regionId || row.region_id || row.assignedRegionId || row.assigned_region_id)
}

function getBranchId(row = {}) {
  return normalizeText(row.id || row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id)
}

function getBranchRegionId(row = {}) {
  return normalizeText(row.regionId || row.region_id || row.assignedRegionId || row.assigned_region_id)
}

function getName(row = {}, fallback = 'Unassigned') {
  return normalizeText(
    row.name ||
      row.consultant ||
      row.branch ||
      row.region ||
      [row.firstName || row.first_name, row.lastName || row.last_name].map(normalizeText).filter(Boolean).join(' ') ||
      row.email,
  ) || fallback
}

function getPartnerSourceId(application = {}) {
  return normalizeText(
    application.partnerId ||
      application.partner_id ||
      application.agencyId ||
      application.agency_id ||
      application.agencyOrganisationId ||
      application.agency_organisation_id ||
      application.partnerSlug,
  )
}

function getPartnerSourceName(application = {}) {
  return normalizeText(application.partnerName || application.partner_name || application.agencyName || application.agency_name || application.partner || application.agency)
}

function getDevelopmentSourceId(application = {}) {
  return normalizeText(application.developmentId || application.development_id || application.developmentSlug)
}

function getDevelopmentSourceName(application = {}) {
  return normalizeText(application.developmentName || application.development_name || application.development)
}

function getCapacityStatus(activeApplications = 0) {
  const count = Number(activeApplications || 0)
  if (count <= 10) return 'Light'
  if (count <= 25) return 'Normal'
  if (count <= 40) return 'Busy'
  return 'Overloaded'
}

function calculateCapacity(consultantId = '', applications = []) {
  const rows = normalizeArray(applications).filter((row) => getApplicationConsultantId(row) === normalizeText(consultantId))
  const activeApplications = rows.filter(isActiveApplication).length
  return {
    consultantId: normalizeText(consultantId),
    activeApplications,
    capacityStatus: getCapacityStatus(activeApplications),
  }
}

function isConsultantAssignable(consultant = {}) {
  const status = normalizeLower(consultant.status || (consultant.active === false || consultant.is_active === false ? 'inactive' : 'active')) || 'active'
  return !INACTIVE_CONSULTANT_STATUSES.has(status)
}

function normalizeConsultant(row = {}) {
  const id = getConsultantId(row)
  return {
    ...row,
    id,
    userId: normalizeText(row.userId || row.user_id || id),
    name: getName(row, 'Consultant'),
    branchId: getConsultantBranchId(row),
    regionId: getConsultantRegionId(row),
    status: normalizeLower(row.status || (row.active === false || row.is_active === false ? 'inactive' : 'active')) || 'active',
  }
}

function normalizeBranch(row = {}) {
  return {
    ...row,
    id: getBranchId(row),
    name: getName(row, 'Branch'),
    regionId: getBranchRegionId(row),
    acceptsOverflow: row.acceptsOverflow ?? row.accepts_overflow ?? true,
    maximumCapacity: Number(row.maximumCapacity ?? row.maximum_capacity ?? 0),
    overflowDestinationBranch: normalizeText(row.overflowDestinationBranch || row.overflow_destination_branch || row.overflowDestinationBranchId || row.overflow_destination_branch_id),
  }
}

function normalizeRegion(row = {}) {
  return {
    ...row,
    id: normalizeText(row.id || row.regionId || row.region_id),
    name: getName(row, 'Region'),
    defaultBranchId: normalizeText(row.defaultBranchId || row.default_branch_id),
  }
}

function normalizeRule(row = {}, workspaceKey = '') {
  const ruleType = normalizeLower(row.ruleType || row.rule_type || row.type)
  const status = normalizeLower(row.status) || 'active'
  return {
    ...row,
    id: normalizeText(row.id || row.routingRuleId || row.routing_rule_id),
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    ruleType: VALID_RULE_TYPES.has(ruleType) ? ruleType : BOND_ROUTING_RULE_TYPES.agency,
    sourceId: normalizeText(row.sourceId || row.source_id || row.partnerId || row.partner_id || row.developmentId || row.development_id || row.regionId || row.region_id),
    sourceName: normalizeText(row.sourceName || row.source_name || row.partnerName || row.partner_name || row.developmentName || row.development_name || row.name),
    regionId: normalizeText(row.regionId || row.region_id || row.defaultRegionId || row.default_region_id),
    branchId: normalizeText(row.branchId || row.branch_id || row.defaultBranchId || row.default_branch_id),
    consultantId: normalizeText(row.consultantId || row.consultant_id || row.defaultConsultantId || row.default_consultant_id),
    priority: Number(row.priority ?? 100),
    status: ['active', 'inactive', 'disabled'].includes(status) ? status : 'active',
    acceptsOverflow: row.acceptsOverflow ?? row.accepts_overflow ?? true,
    maximumCapacity: Number(row.maximumCapacity ?? row.maximum_capacity ?? 0),
    overflowDestinationBranch: normalizeText(row.overflowDestinationBranch || row.overflow_destination_branch || row.overflowDestinationBranchId || row.overflow_destination_branch_id),
    metadata: row.metadata || {},
    applicationsRouted: Number(row.applicationsRouted || row.applications_routed || 0),
    createdAt: normalizeText(row.createdAt || row.created_at),
    updatedAt: normalizeText(row.updatedAt || row.updated_at),
  }
}

function getLocalRules(workspaceKey = '') {
  return LOCAL_RULE_STORE.get(workspaceKey) || []
}

function setLocalRules(workspaceKey = '', rows = []) {
  LOCAL_RULE_STORE.set(workspaceKey, rows.map((row) => normalizeRule(row, workspaceKey)))
}

function getLocalActivity(workspaceKey = '') {
  return LOCAL_ACTIVITY_STORE.get(workspaceKey) || []
}

function setLocalActivity(workspaceKey = '', rows = []) {
  LOCAL_ACTIVITY_STORE.set(workspaceKey, rows)
}

function getData(options = {}, workspaceKey = '') {
  return {
    regions: normalizeArray(options.regions).map(normalizeRegion),
    branches: normalizeArray(options.branches || options.units).map(normalizeBranch),
    consultants: normalizeArray(options.consultants || options.users).map(normalizeConsultant),
    applications: normalizeArray(options.applications || options.rows),
    routingRules: (normalizeArray(options.routingRules).length ? normalizeArray(options.routingRules) : getLocalRules(workspaceKey)).map((row) => normalizeRule(row, workspaceKey)),
  }
}

function findBranch(branchId = '', branches = []) {
  const safeId = normalizeText(branchId)
  return branches.find((row) => row.id === safeId)
}

function findRegion(regionId = '', regions = []) {
  const safeId = normalizeText(regionId)
  return regions.find((row) => row.id === safeId)
}

function findConsultant(consultantId = '', consultants = []) {
  const safeId = normalizeText(consultantId)
  return consultants.find((row) => row.id === safeId || row.userId === safeId)
}

function branchActiveApplicationCount(branchId = '', applications = []) {
  const safeBranchId = normalizeText(branchId)
  return normalizeArray(applications).filter((row) => getApplicationBranchId(row) === safeBranchId && isActiveApplication(row)).length
}

function getBranchOverflowDestination(branch = {}, rules = []) {
  const rule = rules
    .filter((row) => row.ruleType === BOND_ROUTING_RULE_TYPES.branch && row.status === 'active')
    .find((row) => row.branchId === branch.id || row.sourceId === branch.id)
  return normalizeText(rule?.overflowDestinationBranch || branch.overflowDestinationBranch)
}

function maybeApplyBranchOverflow(branch = null, data = {}) {
  if (!branch) return branch
  const maximumCapacity = Number(branch.maximumCapacity || 0)
  if (!maximumCapacity) return branch
  const currentCapacity = branchActiveApplicationCount(branch.id, data.applications)
  if (currentCapacity < maximumCapacity) return branch
  const overflowBranchId = getBranchOverflowDestination(branch, data.routingRules)
  return findBranch(overflowBranchId, data.branches) || branch
}

function chooseConsultant(branchId = '', data = {}) {
  const candidates = data.consultants
    .filter((consultant) => consultant.branchId === normalizeText(branchId) && isConsultantAssignable(consultant))
    .map((consultant) => ({
      consultant,
      capacity: calculateCapacity(consultant.id, data.applications),
    }))
  if (!candidates.length) return { consultant: null, capacity: null }
  const nonOverloaded = candidates.filter((row) => row.capacity.capacityStatus !== 'Overloaded')
  const sortedRows = (nonOverloaded.length ? nonOverloaded : candidates).sort((a, b) => (
    a.capacity.activeApplications - b.capacity.activeApplications ||
    a.consultant.name.localeCompare(b.consultant.name)
  ))
  return sortedRows[0]
}

function activeRules(data = {}, ruleType = '') {
  return data.routingRules
    .filter((rule) => rule.status === 'active' && (!ruleType || rule.ruleType === ruleType))
    .sort((a, b) => a.priority - b.priority)
}

function matchRuleBySource(rules = [], id = '', name = '') {
  const safeId = normalizeText(id)
  const safeName = normalizeLower(name)
  return rules.find((rule) => (
    (safeId && rule.sourceId === safeId) ||
    (safeName && normalizeLower(rule.sourceName) === safeName)
  ))
}

function completeRoutingTarget({ application = {}, rule = null, branch = null, region = null, consultant = null, routingMethod = '', routingSource = '', reason = '', data = {} } = {}) {
  const routedBranch = maybeApplyBranchOverflow(branch, data)
  const routeRegion = region || findRegion(rule?.regionId || routedBranch?.regionId || getApplicationRegionId(application), data.regions)
  const routeConsultant = consultant || findConsultant(rule?.consultantId, data.consultants)
  const selected = routeConsultant ? { consultant: routeConsultant, capacity: calculateCapacity(routeConsultant.id, data.applications) } : chooseConsultant(routedBranch?.id, data)
  const finalMethod = routedBranch && branch && routedBranch.id !== branch.id ? BOND_ROUTING_METHODS.overflow : routingMethod
  const finalReason = finalMethod === BOND_ROUTING_METHODS.overflow
    ? `Routed to ${routedBranch.name} because ${branch.name} reached capacity.`
    : reason
  return {
    regionId: routeRegion?.id || routedBranch?.regionId || '',
    branchId: routedBranch?.id || '',
    consultantId: selected.consultant?.id || '',
    routingMethod: finalMethod,
    routingSource,
    routingRuleId: rule?.id || '',
    routingRule: rule || null,
    region: routeRegion || null,
    branch: routedBranch || null,
    consultant: selected.consultant || null,
    capacity: selected.capacity || null,
    explanation: finalReason,
  }
}

function assertCanManageRouting(context = {}, data = {}) {
  const scope = resolveBondOrganisationScope(context, data)
  if (scope.scopeLevel !== BOND_ORGANISATION_LEVELS.hq) {
    throw new Error('You do not have permission to manage routing rules.')
  }
  return scope
}

function getRulePayload(payload = {}, context = {}, workspaceKey = '', existing = null) {
  const now = new Date().toISOString()
  const ruleType = normalizeLower(payload.ruleType || payload.rule_type || existing?.ruleType)
  if (!VALID_RULE_TYPES.has(ruleType)) throw new Error('Routing rule type is invalid.')
  const branchId = normalizeText(payload.branchId ?? payload.defaultBranchId ?? existing?.branchId)
  const consultantId = normalizeText(payload.consultantId ?? payload.defaultConsultantId ?? existing?.consultantId)
  const regionId = normalizeText(payload.regionId ?? payload.defaultRegionId ?? existing?.regionId)
  if (ruleType !== BOND_ROUTING_RULE_TYPES.company && !normalizeText(payload.sourceId ?? payload.partnerId ?? payload.developmentId ?? payload.regionId ?? existing?.sourceId)) {
    throw new Error('Routing source is required.')
  }
  if ([BOND_ROUTING_RULE_TYPES.agency, BOND_ROUTING_RULE_TYPES.development, BOND_ROUTING_RULE_TYPES.company, BOND_ROUTING_RULE_TYPES.region].includes(ruleType) && !branchId && !consultantId) {
    throw new Error('Select a branch or consultant for this routing rule.')
  }
  return normalizeRule({
    ...existing,
    ...payload,
    id: existing?.id || payload.id || `routing-rule-${Date.now()}-${localRuleSequence += 1}`,
    organisationId: workspaceKey,
    ruleType,
    sourceId: payload.sourceId || payload.partnerId || payload.developmentId || payload.regionId || existing?.sourceId || (ruleType === BOND_ROUTING_RULE_TYPES.company ? 'company' : ''),
    sourceName: payload.sourceName || payload.partnerName || payload.developmentName || payload.name || existing?.sourceName || (ruleType === BOND_ROUTING_RULE_TYPES.company ? 'Company Fallback' : ''),
    branchId,
    consultantId,
    regionId,
    status: payload.status || existing?.status || 'active',
    priority: payload.priority ?? existing?.priority ?? 100,
    acceptsOverflow: payload.acceptsOverflow ?? existing?.acceptsOverflow ?? true,
    maximumCapacity: payload.maximumCapacity ?? existing?.maximumCapacity ?? 0,
    overflowDestinationBranch: payload.overflowDestinationBranch || payload.overflowDestinationBranchId || existing?.overflowDestinationBranch || '',
    createdBy: existing?.createdBy || getActorUserId(context),
    updatedBy: getActorUserId(context),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }, workspaceKey)
}

async function persistRemoteRule(rule = {}, workspaceKey = '', mode = 'upsert', options = {}) {
  if (!isSupabaseConfigured || !supabase || options.forceLocal || options.persistRemote === false || !isUuidLike(workspaceKey)) return null
  const payload = {
    organisation_id: workspaceKey,
    rule_type: rule.ruleType,
    source_id: rule.sourceId || null,
    source_name: rule.sourceName || null,
    region_id: isUuidLike(rule.regionId) ? rule.regionId : null,
    branch_id: isUuidLike(rule.branchId) ? rule.branchId : null,
    consultant_id: isUuidLike(rule.consultantId) ? rule.consultantId : null,
    priority: rule.priority,
    status: rule.status,
    accepts_overflow: Boolean(rule.acceptsOverflow),
    maximum_capacity: rule.maximumCapacity || null,
    overflow_destination_branch_id: isUuidLike(rule.overflowDestinationBranch) ? rule.overflowDestinationBranch : null,
    metadata: rule.metadata || {},
    updated_by: isUuidLike(rule.updatedBy) ? rule.updatedBy : null,
  }
  if (mode === 'insert') payload.created_by = isUuidLike(rule.createdBy) ? rule.createdBy : null
  const query = mode === 'insert'
    ? supabase.from('bond_routing_rules').insert(payload)
    : supabase.from('bond_routing_rules').update(payload).eq('id', rule.id).eq('organisation_id', workspaceKey)
  const { data, error } = await query
    .select('id, organisation_id, rule_type, source_id, source_name, region_id, branch_id, consultant_id, priority, status, accepts_overflow, maximum_capacity, overflow_destination_branch_id, metadata, created_at, updated_at')
    .maybeSingle()
  if (error && !isMissingTableError(error, 'bond_routing_rules')) throw error
  return data ? normalizeRule(data, workspaceKey) : null
}

function appendActivity(workspaceKey = '', event = {}) {
  const rows = getLocalActivity(workspaceKey)
  const now = event.createdAt || new Date().toISOString()
  const row = {
    id: event.id || `routing-activity-${now}-${rows.length + 1}`,
    organisationId: workspaceKey,
    eventType: event.eventType,
    routingRuleId: normalizeText(event.routingRuleId),
    applicationId: normalizeText(event.applicationId),
    actorUserId: normalizeText(event.actorUserId),
    source: normalizeText(event.source),
    previousValue: event.previousValue || null,
    newValue: event.newValue || null,
    createdAt: now,
  }
  setLocalActivity(workspaceKey, [row, ...rows])
  return row
}

async function persistRemoteActivity(workspaceKey = '', activity = {}, options = {}) {
  if (!isSupabaseConfigured || !supabase || options.forceLocal || options.persistRemote === false || !isUuidLike(workspaceKey)) return null
  const payload = {
    organisation_id: workspaceKey,
    routing_rule_id: isUuidLike(activity.routingRuleId) ? activity.routingRuleId : null,
    bond_application_id: isUuidLike(activity.applicationId) ? activity.applicationId : null,
    application_reference: activity.applicationId || null,
    event_type: activity.eventType,
    actor_user_id: isUuidLike(activity.actorUserId) ? activity.actorUserId : null,
    source: activity.source || null,
    previous_value: activity.previousValue || null,
    new_value: activity.newValue || null,
    created_at: activity.createdAt || new Date().toISOString(),
  }
  const { error } = await supabase.from('bond_routing_rule_activity').insert(payload)
  if (error && !isMissingTableError(error, 'bond_routing_rule_activity')) throw error
  return null
}

async function logRoutingActivity(workspaceKey = '', event = {}, options = {}) {
  const activity = appendActivity(workspaceKey, event)
  await persistRemoteActivity(workspaceKey, activity, options)
  return activity
}

export async function getRoutingRules(context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  if (normalizeArray(options.routingRules).length || options.forceLocal || !isSupabaseConfigured || !supabase) {
    return getData(options, workspaceKey).routingRules
  }
  const { data, error } = await supabase
    .from('bond_routing_rules')
    .select('id, organisation_id, rule_type, source_id, source_name, region_id, branch_id, consultant_id, priority, status, accepts_overflow, maximum_capacity, overflow_destination_branch_id, metadata, created_at, updated_at')
    .eq('organisation_id', workspaceKey)
    .order('priority', { ascending: true })
  if (error && !isMissingTableError(error, 'bond_routing_rules')) throw error
  return (data || getLocalRules(workspaceKey)).map((row) => normalizeRule(row, workspaceKey))
}

export async function createRoutingRule(payload = {}, context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  assertCanManageRouting({ ...context, workspaceId: workspaceKey }, data)
  const rule = getRulePayload(payload, context, workspaceKey)
  const persisted = await persistRemoteRule(rule, workspaceKey, 'insert', options)
  const finalRule = persisted || rule
  setLocalRules(workspaceKey, [...getLocalRules(workspaceKey).filter((row) => row.id !== finalRule.id), finalRule])
  await logRoutingActivity(workspaceKey, {
    eventType: BOND_ROUTING_ACTIVITY_EVENTS.created,
    routingRuleId: finalRule.id,
    actorUserId: getActorUserId(context),
    source: finalRule.sourceName,
    previousValue: null,
    newValue: finalRule,
  }, options)
  return finalRule
}

export async function updateRoutingRule(ruleId = '', payload = {}, context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const rows = await getRoutingRules(context, workspaceKey, options)
  const existing = rows.find((row) => row.id === normalizeText(ruleId))
  if (!existing) throw new Error('Routing rule could not be found.')
  assertCanManageRouting({ ...context, workspaceId: workspaceKey }, getData({ ...options, routingRules: rows }, workspaceKey))
  const rule = getRulePayload(payload, context, workspaceKey, existing)
  const persisted = await persistRemoteRule(rule, workspaceKey, 'update', options)
  const finalRule = persisted || rule
  setLocalRules(workspaceKey, rows.map((row) => (row.id === existing.id ? finalRule : row)))
  await logRoutingActivity(workspaceKey, {
    eventType: BOND_ROUTING_ACTIVITY_EVENTS.updated,
    routingRuleId: finalRule.id,
    actorUserId: getActorUserId(context),
    source: finalRule.sourceName,
    previousValue: existing,
    newValue: finalRule,
  }, options)
  return finalRule
}

export async function disableRoutingRule(ruleId = '', context = {}, workspaceId = '', options = {}) {
  const rule = await updateRoutingRule(ruleId, { status: 'disabled' }, context, workspaceId, options)
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  await logRoutingActivity(workspaceKey, {
    eventType: BOND_ROUTING_ACTIVITY_EVENTS.disabled,
    routingRuleId: rule.id,
    actorUserId: getActorUserId(context),
    source: rule.sourceName,
    previousValue: null,
    newValue: rule,
  }, options)
  return rule
}

export function resolveBondApplicationRouting(application = {}, context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  const manualConsultantId = normalizeText(options.consultantId || options.assignedConsultantId || application.manualConsultantId || application.selectedConsultantId)
  if (manualConsultantId) {
    const consultant = findConsultant(manualConsultantId, data.consultants)
    const branch = findBranch(consultant?.branchId || application.selectedBranchId || options.branchId, data.branches)
    return completeRoutingTarget({
      application,
      branch,
      region: findRegion(consultant?.regionId || branch?.regionId || options.regionId, data.regions),
      consultant,
      routingMethod: BOND_ROUTING_METHODS.manualOverride,
      routingSource: 'Manual Consultant Override',
      reason: 'A manager selected the consultant manually.',
      data,
    })
  }

  const developmentRule = matchRuleBySource(activeRules(data, BOND_ROUTING_RULE_TYPES.development), getDevelopmentSourceId(application), getDevelopmentSourceName(application))
  if (developmentRule) {
    const branch = findBranch(developmentRule.branchId, data.branches)
    return completeRoutingTarget({
      application,
      rule: developmentRule,
      branch,
      region: findRegion(developmentRule.regionId || branch?.regionId, data.regions),
      consultant: findConsultant(developmentRule.consultantId, data.consultants),
      routingMethod: BOND_ROUTING_METHODS.developmentDefault,
      routingSource: developmentRule.sourceName || getDevelopmentSourceName(application),
      reason: `Development default matched ${developmentRule.sourceName || getDevelopmentSourceName(application)}.`,
      data,
    })
  }

  const agencyRule = matchRuleBySource(activeRules(data, BOND_ROUTING_RULE_TYPES.agency), getPartnerSourceId(application), getPartnerSourceName(application))
  if (agencyRule) {
    const branch = findBranch(agencyRule.branchId, data.branches)
    return completeRoutingTarget({
      application,
      rule: agencyRule,
      branch,
      region: findRegion(agencyRule.regionId || branch?.regionId, data.regions),
      consultant: findConsultant(agencyRule.consultantId, data.consultants),
      routingMethod: agencyRule.branchId ? BOND_ROUTING_METHODS.agencyDefault : BOND_ROUTING_METHODS.agencyConsultantDefault,
      routingSource: agencyRule.sourceName || getPartnerSourceName(application),
      reason: `Agency default matched ${agencyRule.sourceName || getPartnerSourceName(application)}.`,
      data,
    })
  }

  const existingRegionId = getApplicationRegionId(application) || normalizeText(options.regionId)
  const regionalRule = activeRules(data, BOND_ROUTING_RULE_TYPES.region).find((rule) => rule.sourceId === existingRegionId || rule.regionId === existingRegionId)
  const regionDefaultBranchId = regionalRule?.branchId || findRegion(existingRegionId, data.regions)?.defaultBranchId
  if (regionDefaultBranchId) {
    const branch = findBranch(regionDefaultBranchId, data.branches)
    return completeRoutingTarget({
      application,
      rule: regionalRule || null,
      branch,
      region: findRegion(existingRegionId || branch?.regionId, data.regions),
      consultant: findConsultant(regionalRule?.consultantId, data.consultants),
      routingMethod: BOND_ROUTING_METHODS.regionalDefault,
      routingSource: findRegion(existingRegionId || branch?.regionId, data.regions)?.name || 'Regional Default',
      reason: 'Regional default branch selected the routing destination.',
      data,
    })
  }

  const existingBranch = findBranch(getApplicationBranchId(application) || normalizeText(options.branchId), data.branches)
  if (existingBranch) {
    return completeRoutingTarget({
      application,
      branch: existingBranch,
      region: findRegion(existingBranch.regionId, data.regions),
      routingMethod: BOND_ROUTING_METHODS.workloadBalanced,
      routingSource: 'Workload Balanced',
      reason: 'Selected the lowest workload consultant in the assigned branch.',
      data,
    })
  }

  const companyRule = activeRules(data, BOND_ROUTING_RULE_TYPES.company)[0]
  const companyBranch = findBranch(companyRule?.branchId, data.branches) || data.branches[0] || null
  return completeRoutingTarget({
    application,
    rule: companyRule || null,
    branch: companyBranch,
    region: findRegion(companyRule?.regionId || companyBranch?.regionId, data.regions),
    consultant: findConsultant(companyRule?.consultantId, data.consultants),
    routingMethod: companyRule ? BOND_ROUTING_METHODS.companyFallback : BOND_ROUTING_METHODS.workloadBalanced,
    routingSource: companyRule?.sourceName || 'Company Fallback Branch',
    reason: companyRule ? 'Company fallback branch prevented the application from becoming unassigned.' : 'Selected the first available branch and lowest workload consultant.',
    data,
  })
}

export function previewRouting(application = {}, context = {}, workspaceId = '', options = {}) {
  const route = resolveBondApplicationRouting(application, context, workspaceId, options)
  return {
    ...route,
    preview: {
      partner: getPartnerSourceName(application) || getDevelopmentSourceName(application) || route.routingSource,
      rule: route.routingSource,
      branch: route.branch?.name || route.branchId || 'Unassigned',
      consultant: route.consultant?.name || route.consultantId || 'Unassigned',
      currentCapacity: route.capacity?.activeApplications || 0,
      capacityStatus: route.capacity?.capacityStatus || 'Light',
      explanation: route.explanation,
    },
  }
}

export function explainRouting(application = {}, context = {}, workspaceId = '', options = {}) {
  const route = resolveBondApplicationRouting(application, context, workspaceId, options)
  return {
    routingMethod: route.routingMethod,
    routingSource: route.routingSource,
    routingRuleId: route.routingRuleId,
    partner: route.routingSource,
    branch: route.branch?.name || route.branchId || 'Unassigned',
    consultant: route.consultant?.name || route.consultantId || 'Unassigned',
    explanation: route.explanation,
  }
}

export async function recordRoutingRuleUsed(route = {}, application = {}, context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  return logRoutingActivity(workspaceKey, {
    eventType: BOND_ROUTING_ACTIVITY_EVENTS.used,
    routingRuleId: route.routingRuleId,
    applicationId: getApplicationId(application),
    actorUserId: getActorUserId(context),
    source: route.routingSource,
    previousValue: null,
    newValue: route,
  }, options)
}

export function getRoutingPerformance(context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  const rows = data.applications
  const byMethod = new Map()
  const byAgency = new Map()
  const byDevelopment = new Map()

  rows.forEach((row) => {
    const method = normalizeText(row.routingMethod || row.routing_method || row.routingSourceMethod || row.assignmentSource || row.assignment_source || row.scope_metadata?.routingMethod || row.scope_metadata?.routingMode) || 'Unassigned'
    const methodBucket = byMethod.get(method) || { method, volume: 0, approvals: 0, approvalRate: 0, averageTurnaround: 0 }
    methodBucket.volume += 1
    if (isApprovedApplication(row)) methodBucket.approvals += 1
    byMethod.set(method, methodBucket)

    const agency = getPartnerSourceName(row)
    if (agency) {
      const bucket = byAgency.get(agency) || { agency, applications: 0, approvals: 0, conversion: 0 }
      bucket.applications += 1
      if (isApprovedApplication(row)) bucket.approvals += 1
      byAgency.set(agency, bucket)
    }

    const development = getDevelopmentSourceName(row)
    if (development) {
      const bucket = byDevelopment.get(development) || { development, applications: 0, approvals: 0, conversion: 0 }
      bucket.applications += 1
      if (isApprovedApplication(row)) bucket.approvals += 1
      byDevelopment.set(development, bucket)
    }
  })

  const finalize = (bucket) => ({
    ...bucket,
    approvalRate: bucket.volume ? Math.round((bucket.approvals / bucket.volume) * 100) : bucket.approvalRate,
    conversion: bucket.applications ? Math.round((bucket.approvals / bucket.applications) * 100) : bucket.conversion,
  })

  return {
    agencyPerformance: [...byAgency.values()].map(finalize),
    developmentPerformance: [...byDevelopment.values()].map(finalize),
    routingEffectiveness: [...byMethod.values()].map(finalize),
  }
}

export function getRoutingRulesDashboard(context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  const branchById = new Map(data.branches.map((branch) => [branch.id, branch]))
  const consultantById = new Map(data.consultants.map((consultant) => [consultant.id, consultant]))
  const rules = data.routingRules
  const routedCount = (rule) => data.applications.filter((row) => normalizeText(row.routingRuleId || row.routing_rule_id || row.scope_metadata?.routingRuleId) === rule.id).length
  const mapRule = (rule) => ({
    ...rule,
    branch: branchById.get(rule.branchId)?.name || rule.branchId || 'Unassigned',
    consultant: consultantById.get(rule.consultantId)?.name || rule.consultantId || 'Workload balanced',
    applicationsRouted: routedCount(rule),
  })
  const companyFallback = rules.find((rule) => rule.ruleType === BOND_ROUTING_RULE_TYPES.company && rule.status === 'active') || null
  const fallbackBranch = branchById.get(companyFallback?.branchId)
  return {
    rules,
    agencyRules: rules.filter((rule) => rule.ruleType === BOND_ROUTING_RULE_TYPES.agency).map(mapRule),
    developmentRules: rules.filter((rule) => rule.ruleType === BOND_ROUTING_RULE_TYPES.development).map(mapRule),
    regionalRules: rules.filter((rule) => rule.ruleType === BOND_ROUTING_RULE_TYPES.region).map(mapRule),
    companyFallback: companyFallback ? {
      ...mapRule(companyFallback),
      fallbackBranch: fallbackBranch?.name || companyFallback.branchId || 'Unassigned',
      currentCapacity: fallbackBranch ? branchActiveApplicationCount(fallbackBranch.id, data.applications) : 0,
    } : null,
    performance: getRoutingPerformance(context, workspaceKey, { ...options, ...data }),
    activityEvents: getLocalActivity(workspaceKey),
  }
}

export const __bondRoutingRulesServiceTestUtils = Object.freeze({
  clearStores() {
    LOCAL_RULE_STORE.clear()
    LOCAL_ACTIVITY_STORE.clear()
    localRuleSequence = 0
  },
  seedRules(workspaceId = '', rows = []) {
    setLocalRules(normalizeText(workspaceId || 'default'), rows)
  },
  getRules(workspaceId = '') {
    return getLocalRules(normalizeText(workspaceId || 'default'))
  },
  getActivity(workspaceId = '') {
    return getLocalActivity(normalizeText(workspaceId || 'default'))
  },
})
