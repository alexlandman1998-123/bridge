import {
  MATTER_PLAN_OWNER_ROLES as R,
  MATTER_PLAN_STATUSES,
  normalizeMatterPlanOwnerRole,
  validateConveyancerMatterPlan,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_TEMPLATE_CAPABILITIES,
  CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES as RULES,
  CONVEYANCER_TEMPLATE_DATA_VALIDATION_SEVERITIES as SEVERITIES,
  CONVEYANCER_TEMPLATE_LANES,
  buildConveyancerTemplateGovernanceFingerprint,
  canConveyancerTemplateActor,
  normalizeConveyancerTemplateVersion,
  selectConveyancerTemplateVersion,
  validateConveyancerTemplateVersion,
} from '../../core/documents/legalTemplateGovernance.js'
import {
  CONVEYANCER_CORRESPONDENCE_GENERATOR_VERSION,
  buildConveyancerCorrespondenceContentFingerprint,
  resolveConveyancerCorrespondenceTemplateValues,
} from './conveyancerCorrespondenceGenerator.js'

export const CONVEYANCER_CORRESPONDENCE_DATA_VALIDATOR_VERSION = 'conveyancer_correspondence_data_validator_v1'

export const CONVEYANCER_CORRESPONDENCE_DATA_VALIDATION_OUTCOMES = Object.freeze({
  passed: 'passed',
  warning: 'warning',
  blocked: 'blocked',
})

const TRANSFER_ROLES = new Set([R.conveyancer, R.transferAttorney, R.secretary, R.firmManager, R.system])
const BOND_ROLES = new Set([R.bondAttorney, R.secretary, R.firmManager, R.system])
const CANCELLATION_ROLES = new Set([R.cancellationAttorney, R.secretary, R.firmManager, R.system])

function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '')
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function clone(value) {
  return typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value))
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

function fail(code, errors = []) {
  return { ok: false, duplicate: false, code, errors: unique(errors), validation: null, event: null }
}

function hash(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(value)
  let result = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    result ^= source.charCodeAt(index)
    result = Math.imul(result, 0x01000193)
  }
  return `fnv1a_${(result >>> 0).toString(16).padStart(8, '0')}`
}

function laneAuthorised(role, lane) {
  if (lane === CONVEYANCER_TEMPLATE_LANES.transfer) return TRANSFER_ROLES.has(role)
  if (lane === CONVEYANCER_TEMPLATE_LANES.bond) return BOND_ROLES.has(role)
  if (lane === CONVEYANCER_TEMPLATE_LANES.cancellation) return CANCELLATION_ROLES.has(role)
  return canConveyancerTemplateActor(role, CONVEYANCER_TEMPLATE_CAPABILITIES.view)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, itemKey) => ({ ...result, [itemKey]: stable(value[itemKey]) }), {})
  }
  return value
}

function equal(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right))
}

function normalizeEvidence(sourceEvidence = {}) {
  const records = Array.isArray(sourceEvidence)
    ? sourceEvidence
    : Object.entries(sourceEvidence || {}).map(([variableKey, evidence]) => ({ variableKey, ...(evidence || {}) }))
  return records.reduce((result, item) => {
    const variableKey = key(item.variableKey || item.variable_key || item.key)
    if (!variableKey) return result
    result[variableKey] = {
      sourceId: text(item.sourceId || item.source_id) || null,
      capturedAt: item.capturedAt || item.captured_at || null,
      verifiedAt: item.verifiedAt || item.verified_at || null,
      expiresAt: item.expiresAt || item.expires_at || null,
      verifiedBy: {
        role: normalizeMatterPlanOwnerRole(item.verifiedBy?.role || item.verified_by?.role || item.verified_by_role),
        userId: text(item.verifiedBy?.userId || item.verified_by?.user_id || item.verified_by) || null,
      },
    }
    return result
  }, {})
}

function southAfricanIdValid(value) {
  const digits = text(value).replace(/\D/g, '')
  if (!/^\d{13}$/.test(digits)) return false
  const month = Number(digits.slice(2, 4))
  const day = Number(digits.slice(4, 6))
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  let sum = 0
  let alternate = false
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index])
    if (alternate) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    alternate = !alternate
  }
  return sum % 10 === 0
}

function numericValue(value) {
  const normalized = text(value).replace(/[^0-9,.-]/g, '').replace(/\s/g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function evaluateRule({ rule, value, values, evidence, validatedAt }) {
  const normalized = text(value)
  if (!normalized) return { passed: true, code: 'optional_value_absent' }
  const other = rule.otherKey ? text(values[rule.otherKey]) : ''
  const at = new Date(validatedAt)
  if (rule.type === RULES.email) return { passed: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized), code: 'invalid_email' }
  if (rule.type === RULES.phone) return { passed: /^\+?[0-9]{9,15}$/.test(normalized.replace(/[\s()-]/g, '')), code: 'invalid_phone' }
  if (rule.type === RULES.southAfricanId) return { passed: southAfricanIdValid(normalized), code: 'invalid_south_african_id' }
  if (rule.type === RULES.companyRegistration) return { passed: /^\d{4}\/\d{6}\/\d{2}$/.test(normalized), code: 'invalid_company_registration' }
  if (rule.type === RULES.trustReference) return { passed: /^(?:IT|MT|T)?\s*\d+\/\d{4}$/i.test(normalized), code: 'invalid_trust_reference' }
  if (rule.type === RULES.postalCode) return { passed: /^\d{4}$/.test(normalized), code: 'invalid_postal_code' }
  if (rule.type === RULES.minLength) return { passed: normalized.length >= rule.value, code: 'below_minimum_length' }
  if (rule.type === RULES.maxLength) return { passed: normalized.length <= rule.value, code: 'above_maximum_length' }
  if (rule.type === RULES.allowedValues) return { passed: rule.values.some((item) => item.toLowerCase() === normalized.toLowerCase()), code: 'value_not_allowed' }
  if (rule.type === RULES.numberMin) return { passed: numericValue(normalized) !== null && numericValue(normalized) >= rule.value, code: 'number_below_minimum' }
  if (rule.type === RULES.numberMax) return { passed: numericValue(normalized) !== null && numericValue(normalized) <= rule.value, code: 'number_above_maximum' }
  if (rule.type === RULES.dateNotFuture) return { passed: validDate(normalized) && new Date(normalized) <= at, code: 'date_in_future' }
  if (rule.type === RULES.dateNotPast) return { passed: validDate(normalized) && new Date(normalized) >= new Date(at.toISOString().slice(0, 10)), code: 'date_in_past' }
  if (rule.type === RULES.matchesVariable) return { passed: normalized === other, code: 'variable_value_mismatch' }
  if (rule.type === RULES.differsFromVariable) return { passed: normalized !== other, code: 'variable_values_must_differ' }
  if (rule.type === RULES.beforeVariable) return { passed: validDate(normalized) && validDate(other) && new Date(normalized) < new Date(other), code: 'date_must_precede_variable' }
  if (rule.type === RULES.afterVariable) return { passed: validDate(normalized) && validDate(other) && new Date(normalized) > new Date(other), code: 'date_must_follow_variable' }
  if (rule.type === RULES.sourceVerificationRequired) {
    const passed = Boolean(evidence && validDate(evidence.verifiedAt) && evidence.verifiedBy.userId && canConveyancerTemplateActor(evidence.verifiedBy.role, CONVEYANCER_TEMPLATE_CAPABILITIES.review) && new Date(evidence.verifiedAt) <= at && (!evidence.expiresAt || (validDate(evidence.expiresAt) && new Date(evidence.expiresAt) > at)))
    return { passed, code: 'source_verification_required' }
  }
  if (rule.type === RULES.sourceMaxAgeDays) {
    const observedAt = evidence?.verifiedAt || evidence?.capturedAt
    const age = validDate(observedAt) ? (at.getTime() - new Date(observedAt).getTime()) / 86400000 : Number.POSITIVE_INFINITY
    return { passed: age >= 0 && age <= rule.value, code: 'source_data_stale' }
  }
  return { passed: false, code: 'unsupported_validation_rule' }
}

function addCheck(checks, { category, code, passed, severity = SEVERITIES.blocking, fieldKey = null, ruleId = null, message = null }) {
  checks.push({
    checkId: `${category}:${fieldKey || 'document'}:${ruleId || code}`,
    category,
    fieldKey,
    ruleId,
    severity,
    status: passed ? 'passed' : 'failed',
    code,
    message,
  })
}

export function evaluateConveyancerGovernedTemplateData({ template = {}, resolution = {}, sourceEvidence = {}, sourceConflicts = [], validatedAt = '' } = {}) {
  if (!validDate(validatedAt)) return deepFreeze({ valid: false, errors: ['validated_at_required'], outcome: CONVEYANCER_CORRESPONDENCE_DATA_VALIDATION_OUTCOMES.blocked, checks: [], blockingCount: 0, warningCount: 0 })
  const governedTemplate = normalizeConveyancerTemplateVersion(template)
  const checks = []
  const evidence = normalizeEvidence(sourceEvidence)
  governedTemplate.variables.forEach((variable) => {
    const value = resolution.resolved?.[variable.key]
    variable.validationRules.forEach((rule) => {
      const result = evaluateRule({ rule, value, values: resolution.resolved || {}, evidence: evidence[variable.key], validatedAt })
      addCheck(checks, {
        category: rule.type.startsWith('source_') ? 'source' : 'semantic',
        fieldKey: variable.key,
        ruleId: rule.ruleId,
        code: result.code,
        passed: result.passed,
        severity: rule.severity,
        message: rule.message,
      })
    })
  })
  const variableKeys = new Set(governedTemplate.variables.map((item) => item.key))
  ;(Array.isArray(sourceConflicts) ? sourceConflicts : []).forEach((conflict, index) => {
    const fieldKey = key(conflict.variableKey || conflict.variable_key)
    addCheck(checks, {
      category: 'source',
      fieldKey: fieldKey || null,
      ruleId: `conflict_${index + 1}`,
      code: variableKeys.has(fieldKey) ? 'source_conflict_unresolved' : 'source_conflict_variable_unknown',
      passed: conflict.resolved === true && variableKeys.has(fieldKey),
      severity: SEVERITIES.blocking,
    })
  })
  const failed = checks.filter((item) => item.status === 'failed')
  const blockingCount = failed.filter((item) => item.severity === SEVERITIES.blocking).length
  const warningCount = failed.filter((item) => item.severity === SEVERITIES.warning).length
  const outcome = blockingCount
    ? CONVEYANCER_CORRESPONDENCE_DATA_VALIDATION_OUTCOMES.blocked
    : warningCount
      ? CONVEYANCER_CORRESPONDENCE_DATA_VALIDATION_OUTCOMES.warning
      : CONVEYANCER_CORRESPONDENCE_DATA_VALIDATION_OUTCOMES.passed
  return deepFreeze({ valid: true, errors: [], outcome, checks, blockingCount, warningCount })
}

export function validateConveyancerCorrespondenceData({
  plan = {},
  correspondence = {},
  template = {},
  actor = {},
  data = {},
  organisationSettings = {},
  signingPreset = {},
  manualValues = {},
  calculatedValues = {},
  clauses = [],
  sourceEvidence = {},
  sourceConflicts = [],
  validatedAt = '',
  commandId = '',
  expectedPlanId = '',
  expectedPlanVersion = null,
  existingValidations = [],
} = {}) {
  const planValidation = validateConveyancerMatterPlan(plan)
  if (!planValidation.valid) return fail('matter_plan_invalid', planValidation.errors)
  const currentPlan = planValidation.plan
  if (currentPlan.status !== MATTER_PLAN_STATUSES.active) return fail('active_matter_plan_required')
  const actorRole = normalizeMatterPlanOwnerRole(actor.role)
  const actorUserId = text(actor.userId || actor.user_id)
  if (!actorUserId) return fail('correspondence_validation_actor_user_required')
  if (!canConveyancerTemplateActor(actorRole, CONVEYANCER_TEMPLATE_CAPABILITIES.view)) return fail('correspondence_validation_not_authorised')
  const lane = key(correspondence.lane)
  if (!laneAuthorised(actorRole, lane)) return fail('correspondence_validation_lane_not_authorised')
  const resolvedCommandId = text(commandId)
  if (!resolvedCommandId) return fail('command_id_required')
  if (!text(expectedPlanId)) return fail('expected_plan_id_required')
  if (text(expectedPlanId) !== currentPlan.planId) return fail('stale_plan_id')
  if (!Number.isInteger(Number(expectedPlanVersion))) return fail('expected_plan_version_required')
  if (Number(expectedPlanVersion) !== Number(currentPlan.version)) return fail('stale_plan_version')
  const duplicate = (Array.isArray(existingValidations) ? existingValidations : []).find((item) =>
    text(item.commandId || item.command_id) === resolvedCommandId && text(item.planId || item.plan_id) === currentPlan.planId)
  if (duplicate) {
    const existing = duplicate.validation || duplicate
    if (text(existing.correspondenceId || existing.correspondence_id) !== text(correspondence.correspondenceId)) return fail('command_id_correspondence_conflict')
    return { ok: true, duplicate: true, code: 'idempotent_replay', errors: [], validation: clone(existing), event: clone(duplicate.event || null) }
  }
  if (!validDate(validatedAt)) return fail('validated_at_required')
  if (!text(correspondence.correspondenceId)) return fail('correspondence_id_required')

  const templateValidation = validateConveyancerTemplateVersion(template)
  if (!templateValidation.valid) return fail('correspondence_validation_template_invalid', templateValidation.errors)
  const governedTemplate = templateValidation.template
  const checks = []
  const expectedActor = { role: actorRole, userId: actorUserId }
  const resolvedValidatedAt = new Date(validatedAt).toISOString()

  addCheck(checks, { category: 'integrity', code: 'generator_contract_supported', passed: correspondence.version === CONVEYANCER_CORRESPONDENCE_GENERATOR_VERSION })
  addCheck(checks, { category: 'integrity', code: 'draft_state_required', passed: correspondence.status === 'draft' && correspondence.dispatchAllowed === false })
  addCheck(checks, { category: 'integrity', code: 'active_plan_binding_exact', passed: correspondence.planId === currentPlan.planId && Number(correspondence.planVersion) === Number(currentPlan.version) && correspondence.transactionId === currentPlan.transactionId && correspondence.organisationId === currentPlan.organisationId })
  addCheck(checks, { category: 'integrity', code: 'legal_lane_binding_exact', passed: lane === governedTemplate.lane })
  addCheck(checks, { category: 'integrity', code: 'generation_time_valid', passed: validDate(correspondence.generatedAt) && new Date(correspondence.generatedAt) <= new Date(resolvedValidatedAt) })
  const contentFingerprint = buildConveyancerCorrespondenceContentFingerprint({
    subject: correspondence.subject,
    body: correspondence.body,
    recipients: correspondence.recipients,
    templateVersionId: correspondence.template?.templateVersionId,
  })
  addCheck(checks, { category: 'integrity', code: 'generated_content_unchanged', passed: correspondence.contentFingerprint === contentFingerprint })

  const currentFingerprint = buildConveyancerTemplateGovernanceFingerprint(governedTemplate)
  addCheck(checks, { category: 'governance', code: 'template_version_binding_exact', passed: correspondence.template?.templateId === governedTemplate.templateId && correspondence.template?.templateVersionId === governedTemplate.templateVersionId && correspondence.template?.templateKey === governedTemplate.templateKey && Number(correspondence.template?.versionNumber) === governedTemplate.versionNumber })
  addCheck(checks, { category: 'governance', code: 'template_content_hash_exact', passed: correspondence.template?.contentHash === governedTemplate.content.contentHash })
  addCheck(checks, { category: 'governance', code: 'template_governance_fingerprint_exact', passed: correspondence.template?.governanceFingerprint === currentFingerprint && governedTemplate.approval.templateFingerprint === currentFingerprint })
  const selection = selectConveyancerTemplateVersion({
    templates: [governedTemplate],
    matterFacts: { ...currentPlan.factsSnapshot, legal_lane: lane },
    organisationId: currentPlan.organisationId,
    asOf: resolvedValidatedAt,
  })
  addCheck(checks, { category: 'governance', code: 'template_still_selectable', passed: !selection.conflict && selection.selected?.templateVersionId === governedTemplate.templateVersionId })

  const generatedAt = validDate(correspondence.generatedAt) ? new Date(correspondence.generatedAt).toISOString() : resolvedValidatedAt
  const sourceContext = {
    ...clone(data),
    matter: clone(currentPlan.factsSnapshot),
    plan: { planId: currentPlan.planId, version: currentPlan.version, transactionId: currentPlan.transactionId, organisationId: currentPlan.organisationId },
    organisation: clone(organisationSettings),
    signing: clone(signingPreset),
    generated: { date: generatedAt.slice(0, 10), dateTime: generatedAt },
    template: { versionTag: governedTemplate.versionTag, versionNumber: governedTemplate.versionNumber },
  }
  const resolution = resolveConveyancerCorrespondenceTemplateValues({ template: governedTemplate, sourceContext, manualValues, calculatedValues, clauses })
  addCheck(checks, { category: 'source', code: 'source_values_reproducible', passed: resolution.valid })
  resolution.errors.forEach((code) => addCheck(checks, { category: 'source', code, passed: false }))
  const generatedManifest = new Map((Array.isArray(correspondence.variableManifest) ? correspondence.variableManifest : []).map((item) => [key(item.key), item]))
  resolution.manifest.forEach((item) => {
    const generated = generatedManifest.get(item.key)
    const matches = Boolean(generated && generated.type === item.type && generated.coverage === item.coverage && generated.required === item.required && generated.resolved === item.resolved && generated.sensitive === item.sensitive && generated.source === item.source && generated.valueHash === item.valueHash)
    addCheck(checks, { category: 'source', fieldKey: item.key, code: 'generated_field_matches_current_source', passed: matches })
  })
  addCheck(checks, { category: 'source', code: 'generated_field_registry_exact', passed: generatedManifest.size === resolution.manifest.length })
  addCheck(checks, { category: 'source', code: 'approved_clause_manifest_exact', passed: equal(correspondence.clauseManifest || [], resolution.clauseManifest) })

  const governedData = evaluateConveyancerGovernedTemplateData({ template: governedTemplate, resolution, sourceEvidence, sourceConflicts, validatedAt: resolvedValidatedAt })
  checks.push(...governedData.checks)

  const failed = checks.filter((item) => item.status === 'failed')
  const blocking = failed.filter((item) => item.severity === SEVERITIES.blocking)
  const warnings = failed.filter((item) => item.severity === SEVERITIES.warning)
  const outcome = blocking.length
    ? CONVEYANCER_CORRESPONDENCE_DATA_VALIDATION_OUTCOMES.blocked
    : warnings.length
      ? CONVEYANCER_CORRESPONDENCE_DATA_VALIDATION_OUTCOMES.warning
      : CONVEYANCER_CORRESPONDENCE_DATA_VALIDATION_OUTCOMES.passed
  const validationId = `correspondence_validation:${correspondence.correspondenceId}:${hash(resolvedCommandId).replace('fnv1a_', '')}`
  const validation = deepFreeze({
    version: CONVEYANCER_CORRESPONDENCE_DATA_VALIDATOR_VERSION,
    validationId,
    commandId: resolvedCommandId,
    correspondenceId: correspondence.correspondenceId,
    planId: currentPlan.planId,
    planVersion: currentPlan.version,
    transactionId: currentPlan.transactionId,
    organisationId: currentPlan.organisationId,
    templateVersionId: governedTemplate.templateVersionId,
    templateGovernanceFingerprint: currentFingerprint,
    contentFingerprint,
    outcome,
    readyForReview: blocking.length === 0,
    dispatchAllowed: false,
    checkCount: checks.length,
    passedCount: checks.length - failed.length,
    blockingCount: blocking.length,
    warningCount: warnings.length,
    failedCodes: unique(failed.map((item) => item.code)),
    checks,
    fieldResults: resolution.manifest.map((item) => ({ key: item.key, resolved: item.resolved, sensitive: item.sensitive, source: item.source, valueHash: item.valueHash })),
    validatedAt: resolvedValidatedAt,
    validatedBy: expectedActor,
  })
  const event = deepFreeze({
    version: CONVEYANCER_CORRESPONDENCE_DATA_VALIDATOR_VERSION,
    eventId: `correspondence_data_validation:${validationId}`,
    eventType: 'correspondence_data_validated',
    commandId: resolvedCommandId,
    validationId,
    correspondenceId: correspondence.correspondenceId,
    planId: currentPlan.planId,
    planVersion: currentPlan.version,
    transactionId: currentPlan.transactionId,
    organisationId: currentPlan.organisationId,
    templateVersionId: governedTemplate.templateVersionId,
    contentFingerprint,
    outcome,
    readyForReview: validation.readyForReview,
    dispatchPerformed: false,
    checkCount: validation.checkCount,
    blockingCount: validation.blockingCount,
    warningCount: validation.warningCount,
    failedCodes: validation.failedCodes,
    sensitiveVariableKeys: resolution.manifest.filter((item) => item.sensitive).map((item) => item.key),
    occurredAt: resolvedValidatedAt,
    actor: expectedActor,
  })
  return { ok: true, duplicate: false, code: 'correspondence_data_validation_completed', errors: [], validation, event }
}
