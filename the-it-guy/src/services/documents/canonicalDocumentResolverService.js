import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

export const CANONICAL_RESOLVER_VERSION = 'canonical_document_resolver_v1'
export const CANONICAL_RESOLVER_SOURCE = 'canonical_document_resolver'

export const REQUIREMENT_LEVELS = Object.freeze({
  blocker: 'blocker',
  required: 'required',
  recommended: 'recommended',
  optional: 'optional',
  notApplicable: 'not_applicable',
})

export const REQUIREMENT_STATUSES = Object.freeze({
  pending: 'pending',
  requested: 'requested',
  uploaded: 'uploaded',
  underReview: 'under_review',
  approved: 'approved',
  rejected: 'rejected',
  waived: 'waived',
  expired: 'expired',
  completed: 'completed',
  notApplicable: 'not_applicable',
})

export const REQUIREMENT_EVENT_TYPES = Object.freeze({
  created: 'created',
  requested: 'requested',
  uploaded: 'uploaded',
  replaced: 'replaced',
  reviewStarted: 'review_started',
  approved: 'approved',
  rejected: 'rejected',
  needsReupload: 'needs_reupload',
  waived: 'waived',
  expired: 'expired',
  completed: 'completed',
  statusChanged: 'status_changed',
  reminderSent: 'reminder_sent',
  visibilityChanged: 'visibility_changed',
  regenerated: 'regenerated',
  markedNotApplicable: 'marked_not_applicable',
  reactivated: 'reactivated',
  ruleMatched: 'rule_matched',
  ruleUnmatched: 'rule_unmatched',
  legacySynced: 'legacy_synced',
  legacyUploadLinked: 'legacy_upload_linked',
  legacyStatusImported: 'legacy_status_imported',
  packetLinked: 'packet_linked',
  documentRequestCreated: 'document_request_created',
  mappingMissing: 'mapping_missing',
  syncSkipped: 'sync_skipped',
  statusConflict: 'status_conflict',
})

export const WORKFLOW_GATES = Object.freeze([
  'listing_ready',
  'mandate_ready',
  'otp_ready',
  'attorney_instruction_ready',
  'finance_ready',
  'lodgement_ready',
  'registration_ready',
  'handover_ready',
])

const SATISFIED_STATUSES = new Set([
  REQUIREMENT_STATUSES.approved,
  REQUIREMENT_STATUSES.completed,
  REQUIREMENT_STATUSES.waived,
  REQUIREMENT_STATUSES.notApplicable,
])

const PROVISIONALLY_SATISFIED_STATUSES = new Set([
  REQUIREMENT_STATUSES.uploaded,
  REQUIREMENT_STATUSES.underReview,
])

const BLOCKING_STATUSES = new Set([
  REQUIREMENT_STATUSES.pending,
  REQUIREMENT_STATUSES.requested,
  REQUIREMENT_STATUSES.rejected,
  REQUIREMENT_STATUSES.expired,
])

const CACHE_TTL_MS = 60_000
const ruleCache = new Map()
const definitionCache = new Map()

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined)
  return [value]
}

function normalizeStringArray(value) {
  return normalizeArray(value).map((item) => normalizeText(item)).filter(Boolean)
}

function uniqueSorted(values = []) {
  return [...new Set(normalizeStringArray(values))].sort()
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sameStringArray(left = [], right = []) {
  return stableJson(uniqueSorted(left)) === stableJson(uniqueSorted(right))
}

function sameNullableText(left, right) {
  return normalizeText(left) === normalizeText(right)
}

function assertResolverInput(input = {}) {
  if (!normalizeText(input.contextType)) throw new Error('contextType is required for canonical document resolution.')
  if (!normalizeText(input.contextId)) throw new Error('contextId is required for canonical document resolution.')
}

function requireClient(client = supabase) {
  if (!client || !isSupabaseConfigured) throw new Error('Supabase is required for canonical document requirement resolution.')
  return client
}

function getCached(cache, key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function setCached(cache, key, value) {
  cache.set(key, { value, cachedAt: Date.now() })
}

export function clearCanonicalDocumentResolverCache() {
  ruleCache.clear()
  definitionCache.clear()
}

export function getFactValue(facts = {}, path = '') {
  const normalizedPath = normalizeText(path)
  if (!normalizedPath) return undefined
  return normalizedPath.split('.').reduce((current, segment) => {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current) && /^\d+$/.test(segment)) return current[Number(segment)]
    if (typeof current !== 'object') return undefined
    return Object.prototype.hasOwnProperty.call(current, segment) ? current[segment] : undefined
  }, facts)
}

function valueExists(value) {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function comparable(value) {
  if (typeof value === 'string') return value.trim().toLowerCase()
  return value
}

function compareValues(left, right) {
  return comparable(left) === comparable(right)
}

function evaluateOperator(condition = {}, facts = {}) {
  const operator = normalizeText(condition.operator || 'exists')
  const actual = getFactValue(facts, condition.fact)
  const expected = condition.value

  switch (operator) {
    case 'eq':
      return compareValues(actual, expected)
    case 'neq':
      return !compareValues(actual, expected)
    case 'in':
      return normalizeArray(expected).some((item) => compareValues(actual, item))
    case 'not_in':
      return !normalizeArray(expected).some((item) => compareValues(actual, item))
    case 'exists':
      return valueExists(actual)
    case 'not_exists':
      return !valueExists(actual)
    case 'gt':
      return Number(actual) > Number(expected)
    case 'gte':
      return Number(actual) >= Number(expected)
    case 'lt':
      return Number(actual) < Number(expected)
    case 'lte':
      return Number(actual) <= Number(expected)
    default:
      return false
  }
}

export function evaluateConditions(condition = {}, facts = {}, trace = null) {
  if (!condition || typeof condition !== 'object') {
    trace?.push({ matched: true, reason: 'empty_condition' })
    return true
  }

  if (Array.isArray(condition.all)) {
    const children = condition.all.map((child) => evaluateConditions(child, facts, trace))
    const matched = children.every(Boolean)
    trace?.push({ operator: 'all', matched, childResults: children })
    return matched
  }

  if (Array.isArray(condition.any)) {
    const children = condition.any.map((child) => evaluateConditions(child, facts, trace))
    const matched = children.some(Boolean)
    trace?.push({ operator: 'any', matched, childResults: children })
    return matched
  }

  const operator = normalizeText(condition.operator)
  if (operator === 'all' || operator === 'any') {
    const children = normalizeArray(condition.conditions || condition.value)
    const childResults = children.map((child) => evaluateConditions(child, facts, trace))
    const matched = operator === 'all' ? childResults.every(Boolean) : childResults.some(Boolean)
    trace?.push({ operator, matched, childResults })
    return matched
  }

  const actual = getFactValue(facts, condition.fact)
  const matched = evaluateOperator(condition, facts)
  trace?.push({
    fact: condition.fact || '',
    operator: operator || 'exists',
    expected: condition.value,
    actual,
    exists: valueExists(actual),
    matched,
  })
  return matched
}

export function evaluateRule(rule = {}, facts = {}) {
  const trace = []
  const matched = evaluateConditions(rule.condition_json || {}, facts, trace)
  return {
    ruleId: rule.id || null,
    documentDefinitionKey: rule.document_definition_key || '',
    contextType: rule.context_type || '',
    matched,
    trace,
  }
}

export function buildResolverFacts(input = {}) {
  const facts = input.facts && typeof input.facts === 'object' ? input.facts : {}
  return {
    seller: facts.seller || {},
    buyer: facts.buyer || {},
    property: facts.property || {},
    purchase: facts.purchase || {},
    occupancy: facts.occupancy || {},
    finance: facts.finance || {},
    compliance: facts.compliance || {},
    transaction: facts.transaction || {},
    context: {
      ...(facts.context || {}),
      type: input.contextType,
      id: input.contextId,
      transaction_id: input.transactionId || facts.context?.transaction_id || null,
      listing_id: input.listingId || facts.context?.listing_id || null,
    },
  }
}

export function normalizeRule(rule = {}, definitionsByKey = new Map()) {
  const definition = rule.definition || rule.document_definition || rule.document_definitions || definitionsByKey.get(rule.document_definition_key) || null
  return {
    ...rule,
    definition,
    condition_json: rule.condition_json || {},
    stage_gates: normalizeStringArray(rule.stage_gates),
    visible_to_roles: rule.visible_to_roles ? normalizeStringArray(rule.visible_to_roles) : null,
    uploadable_by_roles: rule.uploadable_by_roles ? normalizeStringArray(rule.uploadable_by_roles) : null,
  }
}

export function buildRequirementInstance(rule = {}, input = {}) {
  const definition = rule.definition || {}
  const sourceSystem = normalizeText(input.options?.sourceSystem) || CANONICAL_RESOLVER_SOURCE
  const resolverVersion = normalizeText(input.options?.resolverVersion) || CANONICAL_RESOLVER_VERSION
  const requirementLevel = normalizeText(rule.requirement_level) || normalizeText(definition.default_requirement_level) || REQUIREMENT_LEVELS.required
  const visibleToRoles = rule.visible_to_roles || normalizeStringArray(definition.default_visibility)
  const uploadableByRoles = rule.uploadable_by_roles || normalizeStringArray(definition.default_upload_roles)

  return {
    document_definition_key: rule.document_definition_key || definition.key,
    context_type: input.contextType,
    context_id: input.contextId,
    transaction_id: input.transactionId || null,
    listing_id: input.listingId || null,
    pack_key: rule.pack_key || definition.pack_key,
    requirement_level: requirementLevel,
    status: REQUIREMENT_STATUSES.pending,
    stage_gates: normalizeStringArray(rule.stage_gates),
    requested_from_role: rule.requested_from_role || null,
    requested_from_contact_id: input.requestedFromContactId || null,
    visible_to_roles: uniqueSorted(visibleToRoles),
    uploadable_by_roles: uniqueSorted(uploadableByRoles),
    reviewer_role: rule.reviewer_role || null,
    rule_id: rule.id || null,
    resolver_version: resolverVersion,
    source_system: sourceSystem,
  }
}

export function buildInstanceSignature(instance = {}) {
  return [
    instance.context_type || '',
    instance.context_id || '',
    instance.document_definition_key || '',
    instance.requested_from_role || '',
    instance.requested_from_contact_id || '',
  ].join('::')
}

function hasSafeFieldChanges(existing = {}, generated = {}) {
  return (
    !sameNullableText(existing.pack_key, generated.pack_key) ||
    !sameNullableText(existing.requirement_level, generated.requirement_level) ||
    !sameStringArray(existing.stage_gates, generated.stage_gates) ||
    !sameNullableText(existing.requested_from_role, generated.requested_from_role) ||
    !sameStringArray(existing.visible_to_roles, generated.visible_to_roles) ||
    !sameStringArray(existing.uploadable_by_roles, generated.uploadable_by_roles) ||
    !sameNullableText(existing.reviewer_role, generated.reviewer_role) ||
    !sameNullableText(existing.rule_id, generated.rule_id) ||
    !sameNullableText(existing.resolver_version, generated.resolver_version) ||
    !sameNullableText(existing.source_system, generated.source_system)
  )
}

function buildSafeUpdate(existing = {}, generated = {}, status = existing.status) {
  return {
    id: existing.id,
    pack_key: generated.pack_key,
    requirement_level: generated.requirement_level,
    status,
    stage_gates: generated.stage_gates,
    requested_from_role: generated.requested_from_role,
    requested_from_contact_id: generated.requested_from_contact_id || null,
    visible_to_roles: generated.visible_to_roles,
    uploadable_by_roles: generated.uploadable_by_roles,
    reviewer_role: generated.reviewer_role,
    rule_id: generated.rule_id,
    resolver_version: generated.resolver_version,
    source_system: generated.source_system,
  }
}

function shouldManageExisting(instance = {}, options = {}) {
  const sourceSystem = normalizeText(options.sourceSystem) || CANONICAL_RESOLVER_SOURCE
  if (normalizeText(instance.source_system) === sourceSystem) return true
  if (instance.rule_id) return true
  return false
}

function packMatches(instance = {}, packKeys = []) {
  if (!packKeys.length) return true
  return packKeys.includes(instance.pack_key)
}

export function reconcileRequirementInstances(existingInstances = [], generatedInstances = [], options = {}) {
  const packKeys = normalizeStringArray(options.packKeys)
  const existingBySignature = new Map()
  for (const instance of existingInstances) {
    const signature = buildInstanceSignature(instance)
    const bucket = existingBySignature.get(signature) || []
    bucket.push(instance)
    existingBySignature.set(signature, bucket)
  }

  const matchedExistingIds = new Set()
  const matchedSignatures = new Set()
  const toCreate = []
  const toUpdate = []
  const toMarkNotApplicable = []
  const unchanged = []
  const reactivated = []

  for (const generated of generatedInstances) {
    const signature = buildInstanceSignature(generated)
    matchedSignatures.add(signature)
    const candidates = existingBySignature.get(signature) || []
    const active = candidates.find((item) => item.status !== REQUIREMENT_STATUSES.notApplicable)
    const inactive = candidates.find((item) => item.status === REQUIREMENT_STATUSES.notApplicable)
    const existing = active || inactive

    if (!existing) {
      toCreate.push(generated)
      continue
    }

    matchedExistingIds.add(existing.id)
    if (existing.status === REQUIREMENT_STATUSES.notApplicable) {
      const update = buildSafeUpdate(existing, generated, REQUIREMENT_STATUSES.pending)
      toUpdate.push(update)
      reactivated.push({ existing, generated, update })
      continue
    }

    if (hasSafeFieldChanges(existing, generated)) {
      toUpdate.push(buildSafeUpdate(existing, generated, existing.status))
    } else {
      unchanged.push(existing)
    }
  }

  if (options.regenerate) {
    for (const existing of existingInstances) {
      if (matchedExistingIds.has(existing.id)) continue
      if (existing.status === REQUIREMENT_STATUSES.notApplicable) continue
      if (!packMatches(existing, packKeys)) continue
      if (!shouldManageExisting(existing, options)) continue
      if (matchedSignatures.has(buildInstanceSignature(existing))) continue
      toMarkNotApplicable.push({
        id: existing.id,
        status: REQUIREMENT_STATUSES.notApplicable,
        resolver_version: normalizeText(options.resolverVersion) || CANONICAL_RESOLVER_VERSION,
        source_system: normalizeText(options.sourceSystem) || CANONICAL_RESOLVER_SOURCE,
      })
    }
  }

  return {
    toCreate,
    toUpdate,
    toMarkNotApplicable,
    unchanged,
    reactivated,
    summary: {
      createCount: toCreate.length,
      updateCount: toUpdate.length,
      markNotApplicableCount: toMarkNotApplicable.length,
      unchangedCount: unchanged.length,
      reactivatedCount: reactivated.length,
    },
  }
}

export function isRequirementSatisfied(requirement = {}) {
  return SATISFIED_STATUSES.has(requirement.status)
}

export function isRequirementProvisionallySatisfied(requirement = {}) {
  return isRequirementSatisfied(requirement) || PROVISIONALLY_SATISFIED_STATUSES.has(requirement.status)
}

export function isRequirementBlocking(requirement = {}, gate = '') {
  return requirementBlocksWorkflow(requirement, gate)
}

export function getRequirementSatisfactionState(requirement = {}) {
  if (isRequirementSatisfied(requirement)) return 'satisfied'
  if (PROVISIONALLY_SATISFIED_STATUSES.has(requirement.status)) return 'provisional'
  if (BLOCKING_STATUSES.has(requirement.status)) return 'blocking'
  return 'unsatisfied'
}

export function getCurrentSatisfier(requirement = {}) {
  if (requirement.satisfied_by_document_id) {
    return {
      type: 'document',
      id: requirement.satisfied_by_document_id,
    }
  }
  if (requirement.satisfied_by_packet_version_id || requirement.satisfied_by_packet_id) {
    return {
      type: 'packet',
      packetId: requirement.satisfied_by_packet_id || null,
      packetVersionId: requirement.satisfied_by_packet_version_id || null,
    }
  }
  return null
}

export function requirementBlocksWorkflow(requirement = {}, gate = '') {
  if (requirement.requirement_level !== REQUIREMENT_LEVELS.blocker) return false
  if (gate && !normalizeStringArray(requirement.stage_gates).includes(gate)) return false
  return BLOCKING_STATUSES.has(requirement.status)
}

export function requirementCountsTowardReadiness(requirement = {}) {
  return requirement.requirement_level !== REQUIREMENT_LEVELS.optional
}

export function calculatePackCompletion(requirements = [], packKey = '') {
  const scoped = requirements
    .filter((item) => !packKey || item.pack_key === packKey)
    .filter((item) => item.status !== REQUIREMENT_STATUSES.notApplicable)
    .filter(requirementCountsTowardReadiness)

  const satisfied = scoped.filter(isRequirementSatisfied)
  const provisional = scoped.filter((item) => !isRequirementSatisfied(item) && isRequirementProvisionallySatisfied(item))
  const missing = scoped.filter((item) => !isRequirementProvisionallySatisfied(item))
  const blockers = scoped.filter((item) => item.requirement_level === REQUIREMENT_LEVELS.blocker)
  const missingBlockers = blockers.filter((item) => !isRequirementSatisfied(item))

  return {
    packKey: packKey || null,
    total: scoped.length,
    satisfiedCount: satisfied.length,
    provisionalCount: provisional.length,
    missingCount: missing.length,
    blockerCount: blockers.length,
    missingBlockerCount: missingBlockers.length,
    percentComplete: scoped.length ? Math.round(((satisfied.length + provisional.length) / scoped.length) * 100) : 100,
    complete: scoped.length === 0 || missing.length === 0,
    missing,
    missingBlockers,
  }
}

export function calculateGateReadiness(requirements = [], gate = '') {
  const scoped = requirements
    .filter((item) => normalizeStringArray(item.stage_gates).includes(gate))
    .filter((item) => item.status !== REQUIREMENT_STATUSES.notApplicable)
    .filter(requirementCountsTowardReadiness)
  const blocking = scoped.filter((item) => requirementBlocksWorkflow(item, gate))
  const missing = scoped.filter((item) => !isRequirementProvisionallySatisfied(item))
  const satisfied = scoped.filter(isRequirementProvisionallySatisfied)

  return {
    gate,
    total: scoped.length,
    satisfiedCount: satisfied.length,
    missingCount: missing.length,
    blockingCount: blocking.length,
    ready: blocking.length === 0,
    percentReady: scoped.length ? Math.round((satisfied.length / scoped.length) * 100) : 100,
    blocking,
    missing,
  }
}

export function calculateMissingBlockers(requirements = [], gate = '') {
  return requirements.filter((item) => requirementBlocksWorkflow(item, gate))
}

export function getRequirementReadiness(requirements = []) {
  const packKeys = [...new Set(requirements.map((item) => item.pack_key).filter(Boolean))].sort()
  const packs = packKeys.map((packKey) => calculatePackCompletion(requirements, packKey))
  const gates = WORKFLOW_GATES.map((gate) => calculateGateReadiness(requirements, gate))
  const overall = calculatePackCompletion(requirements)
  return {
    overall,
    packs,
    gates,
    missingBlockers: calculateMissingBlockers(requirements),
  }
}

export function explainGateFailure(requirements = [], gate = '') {
  const readiness = calculateGateReadiness(requirements, gate)
  return {
    gate,
    ready: readiness.ready,
    blockingCount: readiness.blockingCount,
    reasons: readiness.blocking.map((item) => ({
      requirementInstanceId: item.id || null,
      documentDefinitionKey: item.document_definition_key,
      status: item.status,
      requirementLevel: item.requirement_level,
      packKey: item.pack_key,
      ruleId: item.rule_id || null,
    })),
  }
}

function sortRules(left, right) {
  return (
    Number(left.priority || 100) - Number(right.priority || 100) ||
    normalizeText(left.pack_key).localeCompare(normalizeText(right.pack_key)) ||
    normalizeText(left.document_definition_key).localeCompare(normalizeText(right.document_definition_key)) ||
    normalizeText(left.id).localeCompare(normalizeText(right.id))
  )
}

export function resolveRequirementCandidates({ input = {}, rules = [], definitions = [] } = {}) {
  assertResolverInput(input)
  const facts = buildResolverFacts(input)
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]))
  const packKeys = normalizeStringArray(input.options?.packKeys || input.packKeys)
  const matchedRules = []
  const unmatchedRules = []
  const generatedInstances = []
  const generatedSignatures = new Set()

  for (const sourceRule of [...rules].map((rule) => normalizeRule(rule, definitionsByKey)).sort(sortRules)) {
    if (sourceRule.context_type && sourceRule.context_type !== input.contextType) continue
    if (packKeys.length && !packKeys.includes(sourceRule.pack_key)) continue
    if (!sourceRule.definition) {
      unmatchedRules.push({
        rule: sourceRule,
        matched: false,
        reason: 'missing_definition',
        trace: [],
      })
      continue
    }

    const evaluation = evaluateRule(sourceRule, facts)
    if (!evaluation.matched) {
      unmatchedRules.push({ rule: sourceRule, ...evaluation })
      continue
    }

    const generated = buildRequirementInstance(sourceRule, input)
    const signature = buildInstanceSignature(generated)
    if (generatedSignatures.has(signature)) {
      unmatchedRules.push({
        rule: sourceRule,
        ...evaluation,
        matched: false,
        reason: 'duplicate_requirement_signature_suppressed',
        suppressedSignature: signature,
      })
      continue
    }
    generatedSignatures.add(signature)
    matchedRules.push({ rule: sourceRule, ...evaluation, generated })
    generatedInstances.push(generated)
  }

  return {
    facts,
    matchedRules,
    unmatchedRules,
    generatedInstances,
    debug: {
      matchedRuleCount: matchedRules.length,
      unmatchedRuleCount: unmatchedRules.length,
      generatedCount: generatedInstances.length,
    },
  }
}

export async function loadActiveRequirementRules(client, { contextType = '', packKeys = [], bypassCache = false } = {}) {
  const normalizedPackKeys = normalizeStringArray(packKeys)
  const cacheKey = stableJson({ contextType, packKeys: normalizedPackKeys })
  if (!bypassCache) {
    const cached = getCached(ruleCache, cacheKey)
    if (cached) return cached
  }

  let query = client
    .from('document_requirement_rules')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true })

  if (contextType) query = query.eq('context_type', contextType)
  if (normalizedPackKeys.length) query = query.in('pack_key', normalizedPackKeys)

  const result = await query
  if (result.error) throw result.error
  const rules = result.data || []
  setCached(ruleCache, cacheKey, rules)
  return rules
}

export async function loadDocumentDefinitionsForRules(client, rules = [], { bypassCache = false } = {}) {
  const keys = [...new Set(rules.map((rule) => rule.document_definition_key).filter(Boolean))]
  if (!keys.length) return []
  const cacheKey = stableJson(keys.sort())
  if (!bypassCache) {
    const cached = getCached(definitionCache, cacheKey)
    if (cached) return cached
  }

  const result = await client
    .from('document_definitions')
    .select('*')
    .in('key', keys)
    .eq('is_active', true)

  if (result.error) throw result.error
  const definitions = result.data || []
  setCached(definitionCache, cacheKey, definitions)
  return definitions
}

export async function getActiveRequirementsForContext({ contextType, contextId, client = supabase } = {}) {
  assertResolverInput({ contextType, contextId })
  const db = requireClient(client)
  const result = await db
    .from('document_requirement_instances')
    .select('*')
    .eq('context_type', contextType)
    .eq('context_id', contextId)
    .neq('status', REQUIREMENT_STATUSES.notApplicable)
    .order('pack_key', { ascending: true })
    .order('document_definition_key', { ascending: true })

  if (result.error) throw result.error
  return result.data || []
}

async function getRequirementsForReconciliation(client, { contextType, contextId } = {}) {
  const result = await client
    .from('document_requirement_instances')
    .select('*')
    .eq('context_type', contextType)
    .eq('context_id', contextId)

  if (result.error) throw result.error
  return result.data || []
}

function eventForInstance(instance = {}, eventType, input = {}, extra = {}) {
  return {
    requirement_instance_id: instance.id,
    event_type: eventType,
    actor_role: 'system',
    actor_user_id: null,
    message: extra.message || null,
    metadata_json: {
      rule_id: instance.rule_id || extra.rule_id || null,
      resolver_version: normalizeText(input.options?.resolverVersion) || CANONICAL_RESOLVER_VERSION,
      source_system: normalizeText(input.options?.sourceSystem) || CANONICAL_RESOLVER_SOURCE,
      ...extra.metadata,
    },
  }
}

export async function syncRequirementInstances({ input = {}, generatedInstances = [], client = supabase } = {}) {
  assertResolverInput(input)
  const options = {
    regenerate: Boolean(input.options?.regenerate),
    sourceSystem: normalizeText(input.options?.sourceSystem) || CANONICAL_RESOLVER_SOURCE,
    resolverVersion: normalizeText(input.options?.resolverVersion) || CANONICAL_RESOLVER_VERSION,
    packKeys: input.options?.packKeys || input.packKeys || [],
  }
  const dryRun = Boolean(input.options?.dryRun)
  const hasDryRunExisting = dryRun && Object.prototype.hasOwnProperty.call(input.options || {}, 'existingInstances')
  const db = dryRun && hasDryRunExisting ? null : requireClient(client)
  const existingInstances = dryRun && hasDryRunExisting
    ? normalizeArray(input.options?.existingInstances)
    : await getRequirementsForReconciliation(db, input)
  const reconciliation = reconcileRequirementInstances(existingInstances, generatedInstances, options)

  if (dryRun) {
    return {
      dryRun: true,
      existingInstances,
      reconciliation,
      instances: generatedInstances,
      events: [],
    }
  }

  const createdRows = reconciliation.toCreate.length
    ? await db.from('document_requirement_instances').insert(reconciliation.toCreate).select('*')
    : { data: [], error: null }
  if (createdRows.error) throw createdRows.error

  const updateRows = [...reconciliation.toUpdate, ...reconciliation.toMarkNotApplicable]
  const updatedRows = updateRows.length
    ? await db.from('document_requirement_instances').upsert(updateRows, { onConflict: 'id' }).select('*')
    : { data: [], error: null }
  if (updatedRows.error) throw updatedRows.error

  const created = createdRows.data || []
  const updated = updatedRows.data || []
  const reactivatedIds = new Set(reconciliation.reactivated.map((item) => item.existing.id))
  const notApplicableIds = new Set(reconciliation.toMarkNotApplicable.map((item) => item.id))
  const events = []

  for (const row of created) {
    events.push(eventForInstance(row, REQUIREMENT_EVENT_TYPES.created, input, { metadata: { signature: buildInstanceSignature(row) } }))
    events.push(eventForInstance(row, REQUIREMENT_EVENT_TYPES.ruleMatched, input))
  }
  for (const row of updated) {
    if (notApplicableIds.has(row.id)) {
      events.push(eventForInstance(row, REQUIREMENT_EVENT_TYPES.markedNotApplicable, input))
      events.push(eventForInstance(row, REQUIREMENT_EVENT_TYPES.ruleUnmatched, input))
    } else if (reactivatedIds.has(row.id)) {
      events.push(eventForInstance(row, REQUIREMENT_EVENT_TYPES.reactivated, input))
      events.push(eventForInstance(row, REQUIREMENT_EVENT_TYPES.ruleMatched, input))
    } else {
      events.push(eventForInstance(row, REQUIREMENT_EVENT_TYPES.regenerated, input))
      events.push(eventForInstance(row, REQUIREMENT_EVENT_TYPES.ruleMatched, input))
    }
  }

  if (events.length) {
    const eventWrite = await db.from('document_requirement_events').insert(events)
    if (eventWrite.error) throw eventWrite.error
  }

  const active = await getActiveRequirementsForContext({ contextType: input.contextType, contextId: input.contextId, client: db })
  return {
    dryRun: false,
    existingInstances,
    reconciliation,
    created,
    updated,
    events,
    instances: active,
  }
}

export async function resolveRequirements(input = {}, { client = supabase, rules = null, definitions = null } = {}) {
  assertResolverInput(input)
  const db = client || supabase
  const options = {
    ...input.options,
    sourceSystem: normalizeText(input.options?.sourceSystem) || CANONICAL_RESOLVER_SOURCE,
    resolverVersion: normalizeText(input.options?.resolverVersion) || CANONICAL_RESOLVER_VERSION,
  }
  const resolverInput = { ...input, options }

  const loadedRules = rules || await loadActiveRequirementRules(requireClient(db), {
    contextType: resolverInput.contextType,
    packKeys: resolverInput.options?.packKeys || resolverInput.packKeys || [],
    bypassCache: resolverInput.options?.bypassCache,
  })
  const loadedDefinitions = definitions || await loadDocumentDefinitionsForRules(requireClient(db), loadedRules, {
    bypassCache: resolverInput.options?.bypassCache,
  })
  const candidates = resolveRequirementCandidates({ input: resolverInput, rules: loadedRules, definitions: loadedDefinitions })
  const sync = await syncRequirementInstances({
    input: resolverInput,
    generatedInstances: candidates.generatedInstances,
    client: db,
  })

  return {
    ...sync,
    ...candidates,
    readiness: getRequirementReadiness(sync.instances || candidates.generatedInstances),
  }
}

export async function markRequirementNotApplicable(requirementInstanceId, { reason = '', client = supabase, sourceSystem = CANONICAL_RESOLVER_SOURCE, resolverVersion = CANONICAL_RESOLVER_VERSION } = {}) {
  const id = normalizeText(requirementInstanceId)
  if (!id) throw new Error('requirementInstanceId is required.')
  const db = requireClient(client)
  const result = await db
    .from('document_requirement_instances')
    .update({
      status: REQUIREMENT_STATUSES.notApplicable,
      waiver_reason: reason || null,
      source_system: sourceSystem,
      resolver_version: resolverVersion,
    })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (result.error) throw result.error
  if (result.data?.id) {
    const event = eventForInstance(result.data, REQUIREMENT_EVENT_TYPES.markedNotApplicable, {
      options: { sourceSystem, resolverVersion },
    }, { metadata: { reason } })
    const eventWrite = await db.from('document_requirement_events').insert(event)
    if (eventWrite.error) throw eventWrite.error
  }
  return result.data || null
}
