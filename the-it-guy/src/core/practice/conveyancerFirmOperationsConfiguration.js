import {
  buildPracticeActor,
  PRACTICE_NON_DELEGABLE_CAPABILITIES,
  PRACTICE_OPERATION_CAPABILITIES,
  PRACTICE_OPERATION_ROLES,
  PRACTICE_ROLE_CAPABILITIES,
} from './conveyancerPracticeOperationsContract.js'

export const CONVEYANCER_FIRM_OPERATIONS_VERSION = 'conveyancer_firm_operations_g7_v1'

export const FIRM_CONFIGURATION_STATUSES = Object.freeze({ draft: 'draft', published: 'published', superseded: 'superseded', withdrawn: 'withdrawn' })
export const FIRM_CAPACITY_STATUSES = Object.freeze({ available: 'available', balanced: 'balanced', busy: 'busy', overloaded: 'overloaded', inactive: 'inactive' })
export const FIRM_CONFIGURATION_SECTIONS = Object.freeze(['structure', 'roleCapabilities', 'approvalThresholds', 'delegationLimits', 'playbooks', 'slaPolicies', 'contentAssignments', 'calendars', 'queuePriorities', 'capacityRules'])

export const FIRM_OPERATIONS_SIDE_EFFECT_BOUNDARY = Object.freeze({
  existingMatterRewritten: false,
  matterConfigurationAdopted: false,
  actionAssigned: false,
  actionCompleted: false,
  notificationSent: false,
  documentGenerated: false,
  providerCalled: false,
  registrationOutcomeChanged: false,
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FINGERPRINT = /^fnv1a_[a-f0-9]{8}$/i
const STATUS = new Set(Object.values(FIRM_CONFIGURATION_STATUSES))
const CAPABILITIES = new Set(Object.values(PRACTICE_OPERATION_CAPABILITIES))
const ROLES = new Set(Object.values(PRACTICE_OPERATION_ROLES))
const LANES = new Set(['transfer', 'bond', 'cancellation', 'shared'])
const TERMINAL = new Set(['registered', 'cancelled', 'closed', 'withdrawn'])

const text = (value = '') => String(value ?? '').trim()
const key = (value = '') => text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
const iso = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const integer = (value, fallback = 0) => Number.isSafeInteger(Number(value)) ? Number(value) : fallback
const unique = (values = []) => [...new Set(values.map(key).filter(Boolean))].sort()

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, name) => { result[name] = stable(value[name]); return result }, {})
}

function fingerprint(value) {
  const source = JSON.stringify(stable(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

function normalizeStructure(input = {}) {
  return {
    branches: (input.branches || []).map((item) => ({ branchId: text(item.branchId || item.id), name: text(item.name), active: item.active !== false })),
    departments: (input.departments || []).map((item) => ({ departmentId: text(item.departmentId || item.id), branchId: text(item.branchId), name: text(item.name), active: item.active !== false })),
    teams: (input.teams || []).map((item) => ({ teamId: text(item.teamId || item.id), departmentId: text(item.departmentId), name: text(item.name), active: item.active !== false })),
  }
}

function normalizeRoleCapabilities(values = []) {
  return values.map((item) => ({ role: key(item.role), capabilities: unique(item.capabilities) })).sort((a, b) => a.role.localeCompare(b.role))
}

function normalizeApprovals(values = []) {
  return values.map((item) => ({
    approvalKey: key(item.approvalKey || item.key),
    minimumApprovals: Math.max(1, integer(item.minimumApprovals, 1)),
    requiredRoles: unique(item.requiredRoles),
    thresholdMinor: item.thresholdMinor == null ? null : Math.max(0, integer(item.thresholdMinor)),
    currency: text(item.currency || 'ZAR').toUpperCase(),
    prohibitSelfApproval: item.prohibitSelfApproval !== false,
  })).sort((a, b) => a.approvalKey.localeCompare(b.approvalKey))
}

function normalizeDelegations(values = []) {
  return values.map((item) => ({ role: key(item.role), capabilities: unique(item.capabilities), maximumHours: Math.max(1, Math.min(720, integer(item.maximumHours, 24))), matterScoped: item.matterScoped !== false })).sort((a, b) => a.role.localeCompare(b.role))
}

function normalizePlaybooks(values = []) {
  return values.map((item) => ({
    playbookId: text(item.playbookId), matterType: key(item.matterType), lane: key(item.lane), planDefinitionId: text(item.planDefinitionId),
    planDefinitionVersion: text(item.planDefinitionVersion), exceptionLibraryVersion: text(item.exceptionLibraryVersion), active: item.active !== false,
  })).sort((a, b) => `${a.matterType}:${a.lane}`.localeCompare(`${b.matterType}:${b.lane}`))
}

function normalizeSlas(values = []) {
  return values.map((item) => ({ slaKey: key(item.slaKey || item.key), matterType: key(item.matterType) || '*', acknowledgeHours: Math.max(1, integer(item.acknowledgeHours, 8)), targetHours: Math.max(1, integer(item.targetHours, 48)), escalateHours: Math.max(1, integer(item.escalateHours, 72)), calendarId: text(item.calendarId), escalationRole: key(item.escalationRole) })).sort((a, b) => a.slaKey.localeCompare(b.slaKey))
}

function normalizeAssignments(values = []) {
  return values.map((item) => ({ assignmentKey: key(item.assignmentKey || item.key), matterType: key(item.matterType), documentType: key(item.documentType), templateVersionId: text(item.templateVersionId), templateFingerprint: text(item.templateFingerprint), clausePackVersionId: text(item.clausePackVersionId) || null, clausePackFingerprint: text(item.clausePackFingerprint) || null })).sort((a, b) => a.assignmentKey.localeCompare(b.assignmentKey))
}

function normalizeCalendars(values = []) {
  return values.map((item) => ({ calendarId: text(item.calendarId), name: text(item.name), timezone: text(item.timezone || 'Africa/Johannesburg'), workingDays: [...new Set((item.workingDays || [1, 2, 3, 4, 5]).map(Number))].sort(), startsAt: text(item.startsAt || '08:00'), endsAt: text(item.endsAt || '17:00'), holidays: [...new Set((item.holidays || []).map((date) => text(date).slice(0, 10)).filter(Boolean))].sort() })).sort((a, b) => a.calendarId.localeCompare(b.calendarId))
}

function normalizeQueue(values = []) {
  return values.map((item) => ({ signal: key(item.signal), weight: Math.max(0, number(item.weight, 0)) })).sort((a, b) => a.signal.localeCompare(b.signal))
}

function normalizeCapacity(values = []) {
  return values.map((item) => ({ ruleId: text(item.ruleId), role: key(item.role) || '*', teamId: text(item.teamId) || null, maximumWeightedLoad: Math.max(1, number(item.maximumWeightedLoad, 10)), busyAtPercent: Math.max(1, Math.min(100, number(item.busyAtPercent, 80))), active: item.active !== false })).sort((a, b) => a.ruleId.localeCompare(b.ruleId))
}

function duplicate(values, selector) { return new Set(values.map(selector)).size !== values.length }

function validateConfig(config, actorResult) {
  const errors = [...actorResult.errors]
  if (!UUID.test(config.organisationId) || !UUID.test(config.attorneyFirmId) || !config.configurationId || config.revision < 1 || !STATUS.has(config.status) || !config.effectiveAt || !config.reason) errors.push('firm_configuration_identity_invalid')
  if (actorResult.actor.role !== PRACTICE_OPERATION_ROLES.firmManager || actorResult.actor.organisationId !== config.organisationId || actorResult.actor.attorneyFirmId !== config.attorneyFirmId) errors.push('firm_configuration_manager_authority_required')
  if (config.revision === 1 && (config.predecessorConfigurationId || config.predecessorFingerprint)) errors.push('firm_configuration_initial_revision_has_predecessor')
  if (config.revision > 1 && (!config.predecessorConfigurationId || !FINGERPRINT.test(config.predecessorFingerprint))) errors.push('firm_configuration_predecessor_required')
  const { branches, departments, teams } = config.structure
  if (!branches.length || duplicate(branches, (item) => item.branchId) || branches.some((item) => !UUID.test(item.branchId) || !item.name)) errors.push('firm_configuration_branches_invalid')
  if (duplicate(departments, (item) => item.departmentId) || departments.some((item) => !item.departmentId || !item.name || !branches.some((branch) => branch.branchId === item.branchId))) errors.push('firm_configuration_departments_invalid')
  if (duplicate(teams, (item) => item.teamId) || teams.some((item) => !UUID.test(item.teamId) || !item.name || !departments.some((department) => department.departmentId === item.departmentId))) errors.push('firm_configuration_teams_invalid')
  if (duplicate(config.roleCapabilities, (item) => item.role)) errors.push('firm_configuration_role_capabilities_duplicate')
  for (const item of config.roleCapabilities) if (!ROLES.has(item.role) || item.capabilities.some((capability) => !CAPABILITIES.has(capability) || !PRACTICE_ROLE_CAPABILITIES[item.role]?.includes(capability))) errors.push(`firm_configuration_role_capability_expands_baseline:${item.role || 'unknown'}`)
  if (duplicate(config.approvalThresholds, (item) => item.approvalKey) || config.approvalThresholds.some((item) => !item.approvalKey || item.requiredRoles.some((role) => !ROLES.has(role)) || item.minimumApprovals < item.requiredRoles.length || !item.currency)) errors.push('firm_configuration_approval_threshold_invalid')
  if (duplicate(config.delegationLimits, (item) => item.role) || config.delegationLimits.some((item) => !ROLES.has(item.role) || item.capabilities.some((capability) => !CAPABILITIES.has(capability) || PRACTICE_NON_DELEGABLE_CAPABILITIES.includes(capability)))) errors.push('firm_configuration_delegation_limit_invalid')
  if (!config.playbooks.length || duplicate(config.playbooks, (item) => `${item.matterType}:${item.lane}`) || config.playbooks.some((item) => !item.playbookId || !item.matterType || !LANES.has(item.lane) || !item.planDefinitionId || !item.planDefinitionVersion)) errors.push('firm_configuration_playbook_invalid')
  if (duplicate(config.calendars, (item) => item.calendarId) || config.calendars.some((item) => !item.calendarId || !item.name || !item.workingDays.length || item.workingDays.some((day) => day < 0 || day > 6) || !/^\d{2}:\d{2}$/.test(item.startsAt) || !/^\d{2}:\d{2}$/.test(item.endsAt) || item.startsAt >= item.endsAt)) errors.push('firm_configuration_calendar_invalid')
  if (duplicate(config.slaPolicies, (item) => item.slaKey) || config.slaPolicies.some((item) => !item.slaKey || item.acknowledgeHours > item.targetHours || item.targetHours > item.escalateHours || !config.calendars.some((calendar) => calendar.calendarId === item.calendarId) || !ROLES.has(item.escalationRole))) errors.push('firm_configuration_sla_invalid')
  if (duplicate(config.contentAssignments, (item) => item.assignmentKey) || config.contentAssignments.some((item) => !item.assignmentKey || !item.matterType || !item.documentType || !item.templateVersionId || !FINGERPRINT.test(item.templateFingerprint) || (item.clausePackVersionId && !FINGERPRINT.test(item.clausePackFingerprint)))) errors.push('firm_configuration_content_assignment_invalid')
  if (duplicate(config.queuePriorities, (item) => item.signal) || config.queuePriorities.some((item) => !item.signal)) errors.push('firm_configuration_queue_priority_invalid')
  if (!config.capacityRules.length || duplicate(config.capacityRules, (item) => item.ruleId) || config.capacityRules.some((item) => !item.ruleId || (item.role !== '*' && !ROLES.has(item.role)) || (item.teamId && !teams.some((team) => team.teamId === item.teamId)))) errors.push('firm_configuration_capacity_rule_invalid')
  return [...new Set(errors)]
}

export function buildFirmOperationsConfiguration(input = {}) {
  const actorResult = buildPracticeActor(input.configuredBy || {})
  const config = {
    version: CONVEYANCER_FIRM_OPERATIONS_VERSION,
    configurationId: text(input.configurationId), revision: Math.max(1, integer(input.revision, 1)),
    predecessorConfigurationId: text(input.predecessorConfigurationId) || null, predecessorFingerprint: text(input.predecessorFingerprint) || null,
    organisationId: text(input.organisationId), attorneyFirmId: text(input.attorneyFirmId), status: key(input.status) || FIRM_CONFIGURATION_STATUSES.draft,
    effectiveAt: iso(input.effectiveAt), reason: text(input.reason), configuredBy: actorResult.actor,
    structure: normalizeStructure(input.structure), roleCapabilities: normalizeRoleCapabilities(input.roleCapabilities), approvalThresholds: normalizeApprovals(input.approvalThresholds), delegationLimits: normalizeDelegations(input.delegationLimits), playbooks: normalizePlaybooks(input.playbooks), slaPolicies: normalizeSlas(input.slaPolicies), contentAssignments: normalizeAssignments(input.contentAssignments), calendars: normalizeCalendars(input.calendars), queuePriorities: normalizeQueue(input.queuePriorities), capacityRules: normalizeCapacity(input.capacityRules),
    controls: FIRM_OPERATIONS_SIDE_EFFECT_BOUNDARY,
  }
  config.fingerprint = fingerprint(config)
  const errors = validateConfig(config, actorResult)
  return freeze({ ok: errors.length === 0, errors, configuration: config })
}

export function compareFirmOperationsConfigurations({ previous = {}, next = {}, activeMatters = [] } = {}) {
  const errors = []
  if (previous.version !== CONVEYANCER_FIRM_OPERATIONS_VERSION || next.version !== CONVEYANCER_FIRM_OPERATIONS_VERSION || previous.organisationId !== next.organisationId || previous.attorneyFirmId !== next.attorneyFirmId) errors.push('firm_configuration_comparison_invalid')
  if (next.revision !== previous.revision + 1 || next.predecessorConfigurationId !== previous.configurationId || next.predecessorFingerprint !== previous.fingerprint) errors.push('firm_configuration_revision_lineage_invalid')
  const changedSections = FIRM_CONFIGURATION_SECTIONS.filter((section) => fingerprint(previous[section]) !== fingerprint(next[section]))
  const affectedMatters = activeMatters.filter((matter) => matter.configurationBinding?.fingerprint === previous.fingerprint).map((matter) => text(matter.transactionId)).filter(Boolean).sort()
  return freeze({ ok: errors.length === 0, errors, comparison: { previous: { configurationId: previous.configurationId, revision: previous.revision, fingerprint: previous.fingerprint }, next: { configurationId: next.configurationId, revision: next.revision, fingerprint: next.fingerprint }, changedSections, affectedMatterIds: affectedMatters, requiresExplicitAdoption: changedSections.length > 0 && affectedMatters.length > 0, existingMattersRewritten: false, automaticAdoptionAllowed: false, controls: FIRM_OPERATIONS_SIDE_EFFECT_BOUNDARY } })
}

export function bindMatterToFirmConfiguration({ matter = {}, configuration = {}, boundAt = '', boundBy = {}, mode = 'initial' } = {}) {
  const actorResult = buildPracticeActor(boundBy)
  const errors = [...actorResult.errors]
  const at = iso(boundAt)
  if (configuration.version !== CONVEYANCER_FIRM_OPERATIONS_VERSION || configuration.status !== FIRM_CONFIGURATION_STATUSES.published || !at || !text(matter.transactionId) || matter.organisationId !== configuration.organisationId || matter.attorneyFirmId !== configuration.attorneyFirmId) errors.push('firm_configuration_matter_binding_invalid')
  if (!PRACTICE_ROLE_CAPABILITIES[actorResult.actor.role]?.includes(PRACTICE_OPERATION_CAPABILITIES.allocateMatter)) errors.push('firm_configuration_binding_authority_required')
  if (matter.configurationBinding && key(mode) !== 'explicit_adoption') errors.push('firm_configuration_existing_binding_requires_explicit_adoption')
  const binding = { version: CONVEYANCER_FIRM_OPERATIONS_VERSION, bindingId: `firm-config-binding:${text(matter.transactionId)}:${configuration.revision}`, transactionId: text(matter.transactionId), configurationId: configuration.configurationId, revision: configuration.revision, fingerprint: configuration.fingerprint, previousFingerprint: matter.configurationBinding?.fingerprint || null, mode: key(mode), boundAt: at, boundBy: actorResult.actor.userId, matterRewritten: false }
  binding.bindingFingerprint = fingerprint(binding)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], binding, controls: FIRM_OPERATIONS_SIDE_EFFECT_BOUNDARY })
}

export function previewMatterConfigurationAdoption({ matter = {}, currentConfiguration = {}, targetConfiguration = {}, actor = {}, reason = '', previewedAt = '' } = {}) {
  const actorResult = buildPracticeActor(actor)
  const comparison = compareFirmOperationsConfigurations({ previous: currentConfiguration, next: targetConfiguration, activeMatters: [matter] })
  const errors = [...actorResult.errors, ...comparison.errors]
  if (actorResult.actor.role !== PRACTICE_OPERATION_ROLES.firmManager || !text(reason) || !iso(previewedAt) || matter.configurationBinding?.fingerprint !== currentConfiguration.fingerprint || targetConfiguration.status !== FIRM_CONFIGURATION_STATUSES.published) errors.push('firm_configuration_adoption_preview_invalid')
  const preview = { version: CONVEYANCER_FIRM_OPERATIONS_VERSION, transactionId: text(matter.transactionId), fromFingerprint: currentConfiguration.fingerprint, toFingerprint: targetConfiguration.fingerprint, changedSections: comparison.comparison.changedSections, acknowledgementsRequired: comparison.comparison.changedSections.map((section) => `acknowledge:${section}`), reason: text(reason), previewedAt: iso(previewedAt), previewedBy: actorResult.actor.userId, adoptionExecuted: false, command: { type: 'adopt_firm_configuration', transactionId: text(matter.transactionId), expectedMatterConfigurationFingerprint: currentConfiguration.fingerprint, targetConfigurationId: targetConfiguration.configurationId, targetRevision: targetConfiguration.revision, targetFingerprint: targetConfiguration.fingerprint }, controls: FIRM_OPERATIONS_SIDE_EFFECT_BOUNDARY }
  preview.fingerprint = fingerprint(preview)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], preview })
}

function calendarMinutes(calendar) {
  const [startHour, startMinute] = calendar.startsAt.split(':').map(Number)
  const [endHour, endMinute] = calendar.endsAt.split(':').map(Number)
  return { start: startHour * 60 + startMinute, end: endHour * 60 + endMinute }
}

function isWorkingDate(date, calendar) { return calendar.workingDays.includes(date.getUTCDay()) && !calendar.holidays.includes(date.toISOString().slice(0, 10)) }

export function addFirmWorkingHours({ configuration = {}, calendarId = '', startsAt = '', hours = 0 } = {}) {
  const calendar = configuration.calendars?.find((item) => item.calendarId === text(calendarId))
  const start = iso(startsAt)
  const errors = []
  if (!calendar || !start || number(hours, -1) < 0) errors.push('firm_working_calendar_input_invalid')
  if (errors.length) return freeze({ ok: false, errors, dueAt: null })
  const limits = calendarMinutes(calendar)
  let remaining = Math.round(number(hours) * 60)
  let cursor = new Date(start)
  let guard = 0
  while (remaining > 0 && guard < 3660) {
    guard += 1
    const minute = cursor.getUTCHours() * 60 + cursor.getUTCMinutes()
    if (!isWorkingDate(cursor, calendar) || minute >= limits.end) { cursor.setUTCDate(cursor.getUTCDate() + 1); cursor.setUTCHours(Math.floor(limits.start / 60), limits.start % 60, 0, 0); continue }
    if (minute < limits.start) cursor.setUTCHours(Math.floor(limits.start / 60), limits.start % 60, 0, 0)
    const available = limits.end - (cursor.getUTCHours() * 60 + cursor.getUTCMinutes())
    const used = Math.min(remaining, available)
    cursor = new Date(cursor.getTime() + used * 60000)
    remaining -= used
  }
  return freeze({ ok: remaining === 0, errors: remaining === 0 ? [] : ['firm_working_calendar_horizon_exceeded'], dueAt: remaining === 0 ? cursor.toISOString() : null, calendarId: calendar.calendarId, timezone: calendar.timezone })
}

function queueWeights(configuration) { return new Map((configuration.queuePriorities || []).map((item) => [item.signal, item.weight])) }
function ageDays(date, asOf) { return Math.max(0, Math.floor((new Date(asOf).getTime() - new Date(date).getTime()) / 86400000)) }

export function buildFirmSupervisoryQueue({ configuration = {}, matters = [], asOf = '' } = {}) {
  const at = iso(asOf)
  const weights = queueWeights(configuration)
  const errors = []
  if (configuration.version !== CONVEYANCER_FIRM_OPERATIONS_VERSION || !at) errors.push('firm_supervisory_queue_input_invalid')
  const items = matters.filter((matter) => !TERMINAL.has(key(matter.status))).map((matter) => {
    const blockers = (matter.blockers || []).filter((item) => item.active !== false)
    const overdue = (matter.actions || []).filter((item) => item.dueAt && !['completed', 'cancelled'].includes(key(item.state)) && new Date(item.dueAt) < new Date(at))
    const age = ageDays(matter.openedAt || at, at)
    const score = blockers.length * (weights.get('blocked') ?? 100) + overdue.length * (weights.get('overdue') ?? 50) + age * (weights.get('aging_day') ?? 1) + (matter.registrationReady === true ? (weights.get('registration_ready') ?? 10) : 0) + number(matter.manualPriorityBoost, 0)
    return { transactionId: text(matter.transactionId), matterReference: text(matter.matterReference), branchId: text(matter.branchId) || null, teamId: text(matter.teamId) || null, ownerUserId: text(matter.ownerUserId) || null, status: key(matter.status), ageDays: age, blockerCount: blockers.length, overdueActionCount: overdue.length, priorityScore: score, topReason: blockers.length ? 'blocked' : overdue.length ? 'overdue' : 'aging', readOnly: true }
  }).sort((a, b) => b.priorityScore - a.priorityScore || a.transactionId.localeCompare(b.transactionId))
  return freeze({ ok: errors.length === 0, errors, queue: { version: CONVEYANCER_FIRM_OPERATIONS_VERSION, asOf: at, configurationFingerprint: configuration.fingerprint, items, itemCount: items.length, assignmentsChanged: false, controls: FIRM_OPERATIONS_SIDE_EFFECT_BOUNDARY } })
}

function capacityStatus(load, maximum, active) {
  if (!active) return FIRM_CAPACITY_STATUSES.inactive
  const utilisation = maximum ? load / maximum : load > 0 ? 2 : 0
  if (utilisation < 0.5) return FIRM_CAPACITY_STATUSES.available
  if (utilisation < 0.8) return FIRM_CAPACITY_STATUSES.balanced
  if (utilisation <= 1) return FIRM_CAPACITY_STATUSES.busy
  return FIRM_CAPACITY_STATUSES.overloaded
}

export function buildFirmCapacityProjection({ configuration = {}, members = [], workItems = [] } = {}) {
  const rows = members.map((member) => {
    const role = key(member.role)
    const teamId = text(member.teamId) || null
    const rule = configuration.capacityRules?.find((item) => item.active && item.teamId === teamId && (item.role === role || item.role === '*')) || configuration.capacityRules?.find((item) => item.active && !item.teamId && (item.role === role || item.role === '*'))
    const maximum = rule?.maximumWeightedLoad || Math.max(1, number(member.maximumWeightedLoad, 10))
    const items = workItems.filter((item) => text(item.ownerUserId) === text(member.userId) && !['completed', 'cancelled'].includes(key(item.state)))
    const weightedLoad = items.reduce((sum, item) => sum + Math.max(0, number(item.weight, 1)), 0)
    return { userId: text(member.userId), name: text(member.name), role, teamId, active: member.active !== false, itemCount: items.length, weightedLoad, maximumWeightedLoad: maximum, utilisation: maximum ? weightedLoad / maximum : 0, capacityStatus: capacityStatus(weightedLoad, maximum, member.active !== false) }
  })
  const teams = (configuration.structure?.teams || []).map((team) => { const teamRows = rows.filter((row) => row.teamId === team.teamId); const weightedLoad = teamRows.reduce((sum, row) => sum + row.weightedLoad, 0); const maximum = teamRows.reduce((sum, row) => sum + row.maximumWeightedLoad, 0); return { teamId: team.teamId, name: team.name, memberCount: teamRows.length, weightedLoad, maximumWeightedLoad: maximum, utilisation: maximum ? weightedLoad / maximum : 0, capacityStatus: capacityStatus(weightedLoad, maximum, team.active) } })
  return freeze({ version: CONVEYANCER_FIRM_OPERATIONS_VERSION, configurationFingerprint: configuration.fingerprint, members: rows.sort((a, b) => b.utilisation - a.utilisation || a.userId.localeCompare(b.userId)), teams, overloadedMemberCount: rows.filter((row) => row.capacityStatus === FIRM_CAPACITY_STATUSES.overloaded).length, assignmentsChanged: false, controls: FIRM_OPERATIONS_SIDE_EFFECT_BOUNDARY })
}

function searchableMatter(matter) {
  return [matter.matterReference, matter.propertyDescription, matter.erfNumber, matter.schemeName, matter.bondAccountReference, matter.deedsReference, ...(matter.partyNames || []), ...(matter.externalReferences || [])].map(text).join(' ').toLowerCase()
}

export function searchFirmMatters({ configuration = {}, query = '', matters = [], accessDecisions = [], limit = 50 } = {}) {
  const term = text(query).toLowerCase()
  const access = new Map(accessDecisions.map((item) => [text(item.transactionId), item.allowed === true]))
  const errors = []
  if (configuration.version !== CONVEYANCER_FIRM_OPERATIONS_VERSION || term.length < 2) errors.push('firm_matter_search_input_invalid')
  const results = errors.length ? [] : matters.filter((matter) => matter.organisationId === configuration.organisationId && matter.attorneyFirmId === configuration.attorneyFirmId && access.get(text(matter.transactionId)) === true && searchableMatter(matter).includes(term)).slice(0, Math.max(1, Math.min(200, integer(limit, 50)))).map((matter) => ({ transactionId: text(matter.transactionId), matterReference: text(matter.matterReference), matterType: key(matter.matterType), status: key(matter.status), branchId: text(matter.branchId) || null, teamId: text(matter.teamId) || null, propertySummary: text(matter.propertyDescription), matched: true }))
  return freeze({ ok: errors.length === 0, errors, search: { version: CONVEYANCER_FIRM_OPERATIONS_VERSION, query: term, resultCount: results.length, results, restrictedMattersExcluded: true, rawPersonalDataIncluded: false } })
}

export function buildFirmOperationalIntelligence({ configuration = {}, matters = [], members = [], asOf = '' } = {}) {
  const at = iso(asOf)
  const errors = []
  if (configuration.version !== CONVEYANCER_FIRM_OPERATIONS_VERSION || !at) errors.push('firm_operational_intelligence_input_invalid')
  const active = matters.filter((matter) => !TERMINAL.has(key(matter.status)))
  const matterRows = active.map((matter) => {
    const blockers = (matter.blockers || []).filter((item) => item.active !== false)
    const explicitForecast = iso(matter.expectedRegistrationAt)
    const projected = explicitForecast || (matter.openedAt && number(matter.expectedDurationDays) > 0 ? new Date(new Date(matter.openedAt).getTime() + number(matter.expectedDurationDays) * 86400000).toISOString() : null)
    const confidence = projected ? Math.max(0, Math.min(1, number(matter.forecastConfidence, blockers.length ? 0.4 : 0.7))) : 0
    const fee = integer(matter.projectedFeeMinor, 0)
    const costs = integer(matter.projectedDirectCostMinor, 0)
    return { transactionId: text(matter.transactionId), matterReference: text(matter.matterReference), branchId: text(matter.branchId) || null, teamId: text(matter.teamId) || null, ownerUserId: text(matter.ownerUserId) || null, ageDays: ageDays(matter.openedAt || at, at), blocked: blockers.length > 0, blockerCount: blockers.length, expectedRegistrationAt: projected, forecastConfidence: confidence, forecastBasis: explicitForecast ? 'matter_estimate' : projected ? 'configured_duration' : 'insufficient_data', projectedFeeMinor: fee, projectedDirectCostMinor: costs, projectedProfitMinor: fee - costs, currency: text(matter.currency || 'ZAR').toUpperCase() }
  })
  const performance = members.map((member) => { const owned = matters.filter((matter) => text(matter.ownerUserId) === text(member.userId)); const completed = owned.filter((matter) => TERMINAL.has(key(matter.status))); const onTime = completed.filter((matter) => matter.completedAt && matter.targetCompletionAt && new Date(matter.completedAt) <= new Date(matter.targetCompletionAt)); return { userId: text(member.userId), name: text(member.name), teamId: text(member.teamId) || null, activeMatterCount: owned.length - completed.length, completedMatterCount: completed.length, onTimeCompletedCount: onTime.length, onTimeRate: completed.length ? onTime.length / completed.length : null, blockedMatterCount: matterRows.filter((row) => row.ownerUserId === text(member.userId) && row.blocked).length } })
  const totals = matterRows.reduce((sum, row) => ({ projectedFeeMinor: sum.projectedFeeMinor + row.projectedFeeMinor, projectedDirectCostMinor: sum.projectedDirectCostMinor + row.projectedDirectCostMinor, projectedProfitMinor: sum.projectedProfitMinor + row.projectedProfitMinor }), { projectedFeeMinor: 0, projectedDirectCostMinor: 0, projectedProfitMinor: 0 })
  const moneyFields = new Set(['projectedFeeMinor', 'projectedDirectCostMinor', 'projectedProfitMinor'])
  const agingRows = matterRows.map((row) => Object.fromEntries(Object.entries(row).filter(([name]) => !moneyFields.has(name))))
  const report = { version: CONVEYANCER_FIRM_OPERATIONS_VERSION, asOf: at, configurationFingerprint: configuration.fingerprint, aging: { activeMatterCount: matterRows.length, blockedMatterCount: matterRows.filter((row) => row.blocked).length, over30Days: matterRows.filter((row) => row.ageDays > 30).length, over60Days: matterRows.filter((row) => row.ageDays > 60).length, over90Days: matterRows.filter((row) => row.ageDays > 90).length, matters: agingRows }, registrationForecast: matterRows.filter((row) => row.expectedRegistrationAt).map((row) => ({ transactionId: row.transactionId, expectedRegistrationAt: row.expectedRegistrationAt, confidence: row.forecastConfidence, basis: row.forecastBasis, blockerCount: row.blockerCount })).sort((a, b) => a.expectedRegistrationAt.localeCompare(b.expectedRegistrationAt)), performance, profitability: { currency: matterRows[0]?.currency || 'ZAR', ...totals, marginPercent: totals.projectedFeeMinor ? (totals.projectedProfitMinor / totals.projectedFeeMinor) * 100 : null, basis: 'non_trust_projection' }, methodology: { aging: 'calendar_days_since_opened', forecast: 'explicit_matter_estimate_else_expected_duration', performance: 'matter_counts_and_target_dates', profitability: 'projected_fee_less_projected_direct_costs_in_minor_units' }, readOnly: true, legalOutcomePredicted: false, controls: FIRM_OPERATIONS_SIDE_EFFECT_BOUNDARY }
  return freeze({ ok: errors.length === 0, errors, report })
}
