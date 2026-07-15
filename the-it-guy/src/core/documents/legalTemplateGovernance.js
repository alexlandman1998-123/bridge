import {
  MATTER_PLAN_OWNER_ROLES as R,
  normalizeMatterPlanOwnerRole,
} from '../transactions/conveyancerMatterPlanContract.js'
import {
  getLegalInstrumentFamilyDefinition,
  normalizeLegalInstrumentFamily,
} from './legalInstrumentFamilyRouter.js'

export const LEGAL_TEMPLATE_LIFECYCLE_STATUSES = Object.freeze([
  'draft',
  'attorney_review',
  'approved',
  'published',
  'superseded',
  'withdrawn',
])

const LEGACY_STATUS_ALIASES = Object.freeze({
  active: 'published',
  live: 'published',
  review: 'attorney_review',
  in_review: 'attorney_review',
  under_review: 'attorney_review',
  awaiting_approval: 'attorney_review',
  archived: 'withdrawn',
  deprecated: 'superseded',
})

export const LEGAL_TEMPLATE_STATUS_TRANSITIONS = Object.freeze({
  draft: ['attorney_review', 'withdrawn'],
  attorney_review: ['draft', 'approved', 'withdrawn'],
  approved: ['draft', 'published', 'withdrawn'],
  published: ['superseded', 'withdrawn'],
  superseded: [],
  withdrawn: [],
})

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function normalizeLegalTemplateLifecycleStatus(value = '', fallback = 'draft') {
  const normalized = normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
  const resolved = LEGACY_STATUS_ALIASES[normalized] || normalized
  return LEGAL_TEMPLATE_LIFECYCLE_STATUSES.includes(resolved) ? resolved : fallback
}

export function canTransitionLegalTemplateStatus(fromStatus = '', toStatus = '') {
  const from = normalizeLegalTemplateLifecycleStatus(fromStatus)
  const to = normalizeLegalTemplateLifecycleStatus(toStatus)
  return from === to || (LEGAL_TEMPLATE_STATUS_TRANSITIONS[from] || []).includes(to)
}

function parseDate(value) {
  const timestamp = Date.parse(normalizeText(value))
  return Number.isFinite(timestamp) ? timestamp : null
}

export function resolveLegalTemplateGovernance(template = {}, { at = new Date(), allowLegacy = true } = {}) {
  const metadata = asRecord(template.metadata_json || template.metadataJson)
  const rawStatus = normalizeText(template.status || metadata.lifecycle_status)
  const status = normalizeLegalTemplateLifecycleStatus(rawStatus || (template.is_active === false ? 'draft' : 'published'))
  const governanceVersion = Number(template.governance_version ?? metadata.governance_version ?? 0) || 0
  const effectiveFrom = template.effective_from || metadata.effective_from || null
  const effectiveUntil = template.effective_until || metadata.effective_until || null
  const now = at instanceof Date ? at.getTime() : parseDate(at) ?? Date.now()
  const effectiveFromTime = parseDate(effectiveFrom)
  const effectiveUntilTime = parseDate(effectiveUntil)
  const hasStarted = effectiveFromTime === null || effectiveFromTime <= now
  const hasEnded = effectiveUntilTime !== null && effectiveUntilTime < now
  const legacyCompatible = allowLegacy && governanceVersion === 0
  const approvalRecorded = Boolean(
    template.approved_at || metadata.approved_at || template.approved_by || metadata.approved_by || legacyCompatible,
  )
  const published = status === 'published'
  const active = template.is_active !== false
  const selectableForSigning = published && active && approvalRecorded && hasStarted && !hasEnded

  return {
    status,
    governanceVersion,
    jurisdictionCode: normalizeText(template.jurisdiction_code || metadata.jurisdiction_code || 'ZA') || 'ZA',
    languageCode: normalizeText(template.language_code || metadata.language_code || 'en-ZA') || 'en-ZA',
    effectiveFrom,
    effectiveUntil,
    hasStarted,
    hasEnded,
    legacyCompatible,
    approvalRecorded,
    published,
    active,
    selectableForSigning,
    immutable: ['published', 'superseded', 'withdrawn'].includes(status),
    blockingReasons: [
      !published ? 'not_published' : '',
      !active ? 'inactive' : '',
      !approvalRecorded ? 'approval_not_recorded' : '',
      !hasStarted ? 'not_yet_effective' : '',
      hasEnded ? 'expired' : '',
    ].filter(Boolean),
  }
}

export function isLegalTemplateSelectableForSigning(template = {}, options = {}) {
  return resolveLegalTemplateGovernance(template, options).selectableForSigning
}

export const CONVEYANCER_TEMPLATE_GOVERNANCE_VERSION = 'conveyancer_template_governance_v1'

export const CONVEYANCER_TEMPLATE_DOCUMENT_MODELS = Object.freeze({
  legacySectioned: 'legacy_sectioned',
  singleMasterDocument: 'single_master_document',
})

export const CONVEYANCER_TEMPLATE_FORMATS = Object.freeze({
  docx: 'docx',
  pdf: 'pdf',
  html: 'html',
  structured: 'structured',
  json: 'json',
})

export const CONVEYANCER_TEMPLATE_DOCUMENT_KINDS = Object.freeze({
  agreement: 'agreement',
  instruction: 'instruction',
  correspondence: 'correspondence',
  application: 'application',
  declaration: 'declaration',
  consent: 'consent',
  resolution: 'resolution',
  certificate: 'certificate',
  checklist: 'checklist',
  annexure: 'annexure',
})

export const CONVEYANCER_TEMPLATE_LANES = Object.freeze({
  transfer: 'transfer',
  bond: 'bond',
  cancellation: 'cancellation',
  shared: 'shared',
})

export const CONVEYANCER_TEMPLATE_CHANGE_TYPES = Object.freeze({
  initial: 'initial',
  patch: 'patch',
  minor: 'minor',
  major: 'major',
  emergency: 'emergency',
})

export const CONVEYANCER_TEMPLATE_VARIABLE_TYPES = Object.freeze({
  text: 'text',
  date: 'date',
  money: 'money',
  number: 'number',
  boolean: 'boolean',
  party: 'party',
  address: 'address',
  signature: 'signature',
  table: 'table',
})

export const CONVEYANCER_TEMPLATE_VARIABLE_COVERAGE = Object.freeze({
  mapped: 'mapped',
  calculated: 'calculated',
  agencySetting: 'agency_setting',
  signingPreset: 'signing_preset',
  approvedClause: 'approved_clause',
  manual: 'manual',
  gap: 'gap',
})

export const CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES = Object.freeze({
  email: 'email',
  phone: 'phone',
  southAfricanId: 'south_african_id',
  companyRegistration: 'company_registration',
  trustReference: 'trust_reference',
  postalCode: 'postal_code',
  minLength: 'min_length',
  maxLength: 'max_length',
  allowedValues: 'allowed_values',
  numberMin: 'number_min',
  numberMax: 'number_max',
  dateNotFuture: 'date_not_future',
  dateNotPast: 'date_not_past',
  sourceMaxAgeDays: 'source_max_age_days',
  sourceVerificationRequired: 'source_verification_required',
  matchesVariable: 'matches_variable',
  differsFromVariable: 'differs_from_variable',
  beforeVariable: 'before_variable',
  afterVariable: 'after_variable',
})

export const CONVEYANCER_TEMPLATE_DATA_VALIDATION_SEVERITIES = Object.freeze({
  blocking: 'blocking',
  warning: 'warning',
})

export const CONVEYANCER_TEMPLATE_CAPABILITIES = Object.freeze({
  view: 'view',
  create: 'create',
  edit: 'edit',
  submit: 'submit',
  review: 'review',
  approve: 'approve',
  publish: 'publish',
  withdraw: 'withdraw',
  supersede: 'supersede',
})

const TC = CONVEYANCER_TEMPLATE_CAPABILITIES

export const CONVEYANCER_TEMPLATE_ROLE_CAPABILITIES = Object.freeze({
  [R.conveyancer]: Object.freeze([TC.view, TC.create, TC.edit, TC.submit, TC.review, TC.approve]),
  [R.transferAttorney]: Object.freeze([TC.view, TC.create, TC.edit, TC.submit, TC.review, TC.approve]),
  [R.firmManager]: Object.freeze(Object.values(TC)),
  [R.secretary]: Object.freeze([TC.view, TC.create, TC.edit, TC.submit]),
  [R.bondAttorney]: Object.freeze([TC.view, TC.create, TC.edit, TC.submit, TC.review]),
  [R.cancellationAttorney]: Object.freeze([TC.view, TC.create, TC.edit, TC.submit, TC.review]),
  [R.accounts]: Object.freeze([TC.view]),
  [R.client]: Object.freeze([]),
  [R.externalParty]: Object.freeze([]),
  [R.system]: Object.freeze([TC.view]),
})

export const CONVEYANCER_TEMPLATE_GOVERNANCE_SCHEMA = Object.freeze({
  contractVersion: CONVEYANCER_TEMPLATE_GOVERNANCE_VERSION,
  recordModel: 'immutable_version_with_governed_live_pointer',
  publicationMutationAllowed: false,
  requiredFields: Object.freeze([
    'templateId',
    'templateVersionId',
    'templateKey',
    'templateLabel',
    'versionNumber',
    'status',
    'moduleType',
    'packetType',
    'documentKind',
    'lane',
    'content.contentHash',
    'authoredBy',
    'createdAt',
  ]),
})

const TEMPLATE_STATUS_VALUES = new Set(LEGAL_TEMPLATE_LIFECYCLE_STATUSES)
const TEMPLATE_MODEL_VALUES = new Set(Object.values(CONVEYANCER_TEMPLATE_DOCUMENT_MODELS))
const TEMPLATE_FORMAT_VALUES = new Set(Object.values(CONVEYANCER_TEMPLATE_FORMATS))
const TEMPLATE_KIND_VALUES = new Set(Object.values(CONVEYANCER_TEMPLATE_DOCUMENT_KINDS))
const TEMPLATE_LANE_VALUES = new Set(Object.values(CONVEYANCER_TEMPLATE_LANES))
const TEMPLATE_CHANGE_VALUES = new Set(Object.values(CONVEYANCER_TEMPLATE_CHANGE_TYPES))
const TEMPLATE_VARIABLE_TYPE_VALUES = new Set(Object.values(CONVEYANCER_TEMPLATE_VARIABLE_TYPES))
const TEMPLATE_COVERAGE_VALUES = new Set(Object.values(CONVEYANCER_TEMPLATE_VARIABLE_COVERAGE))
const TEMPLATE_DATA_VALIDATION_RULE_VALUES = new Set(Object.values(CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES))
const TEMPLATE_DATA_VALIDATION_SEVERITY_VALUES = new Set(Object.values(CONVEYANCER_TEMPLATE_DATA_VALIDATION_SEVERITIES))
const TEMPLATE_CAPABILITY_VALUES = new Set(Object.values(CONVEYANCER_TEMPLATE_CAPABILITIES))
const IMMUTABLE_TEMPLATE_STATUSES = new Set(['published', 'superseded', 'withdrawn'])

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '')
}

function normalizeEnum(value, allowed, fallback = '') {
  const normalized = normalizeKey(value)
  return allowed.has(normalized) ? normalized : fallback
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeActor(input = {}) {
  return {
    role: normalizeMatterPlanOwnerRole(input.role),
    userId: normalizeText(input.userId || input.user_id) || null,
  }
}

function readArray(value) {
  if (Array.isArray(value)) return value
  return normalizeText(value) ? normalizeText(value).split(',') : []
}

function normalizeStringArray(value) {
  return unique(readArray(value).map(normalizeKey))
}

function parseVersionNumber(input = {}) {
  const explicit = Number(input.versionNumber || input.version_number || 0)
  if (Number.isInteger(explicit) && explicit > 0) return explicit
  const matched = normalizeText(input.versionTag || input.version_tag).match(/^(?:v|version\s*)?(\d+)$/i)
  return matched ? Number(matched[1]) : 0
}

function normalizeTriState(value) {
  if (value === true || normalizeKey(value) === 'true') return true
  if (value === false || normalizeKey(value) === 'false') return false
  return null
}

function normalizeDataValidationRule(input = {}, index = 0) {
  const source = typeof input === 'string' ? { type: input } : asRecord(input)
  const type = normalizeEnum(source.type || source.rule, TEMPLATE_DATA_VALIDATION_RULE_VALUES)
  const severitySignal = normalizeText(source.severity)
  const rawValues = readArray(source.values || source.allowedValues || source.allowed_values)
  const numericValue = Number(source.value ?? source.limit)
  return {
    ruleId: normalizeKey(source.ruleId || source.rule_id) || `${type || 'invalid'}_${index + 1}`,
    type,
    severity: severitySignal
      ? normalizeEnum(severitySignal, TEMPLATE_DATA_VALIDATION_SEVERITY_VALUES)
      : CONVEYANCER_TEMPLATE_DATA_VALIDATION_SEVERITIES.blocking,
    value: Number.isFinite(numericValue) ? numericValue : null,
    values: unique(rawValues.map(normalizeText).filter(Boolean)),
    otherKey: normalizeKey(source.otherKey || source.other_key || source.variableKey || source.variable_key) || null,
    message: normalizeText(source.message) || null,
  }
}

function normalizeVariable(input = {}) {
  const locator = asRecord(input.documentLocator || input.document_locator_json)
  const validationRules = readArray(input.validationRules || input.validation_rules)
  return {
    key: normalizeKey(input.key || input.fieldKey || input.field_key),
    label: normalizeText(input.label || input.fieldLabel || input.field_label),
    type: normalizeEnum(input.type || input.variableType || input.variable_type, TEMPLATE_VARIABLE_TYPE_VALUES),
    coverage: normalizeEnum(input.coverage || input.coverageType || input.coverage_type, TEMPLATE_COVERAGE_VALUES),
    sourcePaths: unique(readArray(input.sourcePaths || input.source_paths).map(normalizeText)),
    required: input.required === true || input.isRequired === true || input.is_required === true,
    sensitive: input.sensitive === true || input.isSensitive === true || input.is_sensitive === true,
    manualEntryAllowed: input.manualEntryAllowed === true || input.manual_entry_allowed === true,
    clauseKey: normalizeKey(input.clauseKey || input.clause_key) || null,
    sectionKey: normalizeKey(input.sectionKey || input.section_key) || null,
    documentLocator: { ...locator },
    outputFormat: normalizeText(input.outputFormat || input.output_format) || null,
    validationRules: validationRules.map(normalizeDataValidationRule),
  }
}

function normalizeClause(input = {}) {
  return {
    key: normalizeKey(input.key || input.clauseKey || input.clause_key),
    version: Number(input.version || input.clauseVersion || input.clause_version || 0),
    required: input.required !== false,
    contentHash: normalizeText(input.contentHash || input.content_hash).toLowerCase(),
    approvedAt: input.approvedAt || input.approved_at || null,
    approvedBy: normalizeActor(input.approvedBy || input.approved_by),
    conditionKey: normalizeKey(input.conditionKey || input.condition_key) || null,
  }
}

export function getConveyancerTemplateRoleCapabilities(role) {
  return CONVEYANCER_TEMPLATE_ROLE_CAPABILITIES[normalizeMatterPlanOwnerRole(role)] || Object.freeze([])
}

export function canConveyancerTemplateActor(role, capability) {
  const normalized = normalizeEnum(capability, TEMPLATE_CAPABILITY_VALUES)
  return Boolean(normalized && getConveyancerTemplateRoleCapabilities(role).includes(normalized))
}

export function normalizeConveyancerTemplateVersion(input = {}) {
  const metadata = asRecord(input.metadata_json || input.metadataJson)
  const applicability = asRecord(input.applicability || metadata.applicability)
  const content = asRecord(input.content)
  const change = asRecord(input.change)
  const approval = asRecord(input.approval)
  const publication = asRecord(input.publication)
  const withdrawal = asRecord(input.withdrawal)
  const variables = readArray(input.variables || input.fieldMappings || input.field_mappings)
  const clauses = readArray(input.clauses || input.approvedClauses || input.approved_clauses)
  const versionNumber = parseVersionNumber(input)
  const statusValue = LEGACY_STATUS_ALIASES[normalizeKey(input.status)] || normalizeKey(input.status)
  const instrumentFamilySignal = input.instrumentFamily || input.instrument_family || metadata.instrument_family
  return {
    ...input,
    contractVersion: normalizeText(input.contractVersion || input.contract_version) || CONVEYANCER_TEMPLATE_GOVERNANCE_VERSION,
    governanceVersion: Number(input.governanceVersion || input.governance_version || 1),
    templateId: normalizeText(input.templateId || input.template_id),
    templateVersionId: normalizeText(input.templateVersionId || input.template_version_id || input.id),
    organisationId: normalizeText(input.organisationId || input.organisation_id) || null,
    moduleType: normalizeKey(input.moduleType || input.module_type),
    packetType: normalizeKey(input.packetType || input.packet_type),
    templateKey: normalizeKey(input.templateKey || input.template_key),
    templateLabel: normalizeText(input.templateLabel || input.template_label),
    description: normalizeText(input.description),
    documentKind: normalizeEnum(input.documentKind || input.document_kind || metadata.document_kind, TEMPLATE_KIND_VALUES),
    documentModel: normalizeEnum(input.documentModel || input.document_model || metadata.document_model, TEMPLATE_MODEL_VALUES),
    templateFormat: normalizeEnum(input.templateFormat || input.template_format, TEMPLATE_FORMAT_VALUES),
    lane: normalizeEnum(input.lane || metadata.legal_lane, TEMPLATE_LANE_VALUES),
    status: TEMPLATE_STATUS_VALUES.has(statusValue) ? statusValue : '',
    versionNumber,
    versionTag: normalizeText(input.versionTag || input.version_tag) || (versionNumber ? `v${versionNumber}` : ''),
    previousVersionId: normalizeText(input.previousVersionId || input.previous_version_id) || null,
    basedOnLiveVersionId: normalizeText(input.basedOnLiveVersionId || input.based_on_live_version_id) || null,
    jurisdictionCode: normalizeText(input.jurisdictionCode || input.jurisdiction_code || metadata.jurisdiction_code || 'ZA').toUpperCase(),
    languageCode: normalizeText(input.languageCode || input.language_code || metadata.language_code || 'en-ZA'),
    instrumentFamilyInput: normalizeKey(instrumentFamilySignal) || null,
    instrumentFamily: normalizeLegalInstrumentFamily(instrumentFamilySignal) || null,
    applicability: {
      transactionTypes: normalizeStringArray(applicability.transactionTypes || applicability.transaction_types),
      financeTypes: normalizeStringArray(applicability.financeTypes || applicability.finance_types),
      buyerEntityTypes: normalizeStringArray(applicability.buyerEntityTypes || applicability.buyer_entity_types),
      sellerEntityTypes: normalizeStringArray(applicability.sellerEntityTypes || applicability.seller_entity_types),
      propertyTenures: normalizeStringArray(applicability.propertyTenures || applicability.property_tenures),
      sellerHasExistingBond: normalizeTriState(applicability.sellerHasExistingBond ?? applicability.seller_has_existing_bond),
    },
    content: {
      contentHash: normalizeText(content.contentHash || content.content_hash || input.contentHash || input.content_hash).toLowerCase(),
      storageBucket: normalizeText(content.storageBucket || content.storage_bucket || input.storageBucket || input.storage_bucket) || null,
      storagePath: normalizeText(content.storagePath || content.storage_path || input.storagePath || input.storage_path) || null,
      fileName: normalizeText(content.fileName || content.file_name || input.fileName || input.file_name) || null,
      sectionCount: Number(content.sectionCount ?? content.section_count ?? input.sectionCount ?? input.section_count ?? (Array.isArray(input.sections_snapshot_json) ? input.sections_snapshot_json.length : 0)),
      placeholderKeys: normalizeStringArray(content.placeholderKeys || content.placeholder_keys || input.placeholderKeys || input.placeholder_keys),
    },
    variables: variables.map(normalizeVariable),
    clauses: clauses.map(normalizeClause),
    change: {
      type: normalizeEnum(change.type || input.changeType || input.change_type || (versionNumber === 1 ? 'initial' : ''), TEMPLATE_CHANGE_VALUES),
      summary: normalizeText(change.summary || input.changeSummary || input.change_summary),
    },
    authoredBy: normalizeActor(input.authoredBy || input.authored_by || { role: input.author_role, userId: input.created_by }),
    approval: {
      approvedAt: approval.approvedAt || approval.approved_at || input.approvedAt || input.approved_at || null,
      approvedBy: normalizeActor(approval.approvedBy || approval.approved_by || { role: approval.reviewerRole || approval.reviewer_role || input.approved_by_role, userId: approval.reviewerUserId || approval.reviewer_user_id || input.approved_by }),
      templateFingerprint: normalizeText(approval.templateFingerprint || approval.template_fingerprint || input.templateFingerprint || input.template_fingerprint).toLowerCase(),
      notes: normalizeText(approval.notes),
    },
    publication: {
      publishedAt: publication.publishedAt || publication.published_at || input.publishedAt || input.published_at || null,
      publishedBy: normalizeActor(publication.publishedBy || publication.published_by || { role: input.published_by_role, userId: input.published_by }),
      effectiveFrom: publication.effectiveFrom || publication.effective_from || input.effectiveFrom || input.effective_from || null,
      effectiveUntil: publication.effectiveUntil || publication.effective_until || input.effectiveUntil || input.effective_until || null,
    },
    withdrawal: {
      withdrawnAt: withdrawal.withdrawnAt || withdrawal.withdrawn_at || input.withdrawnAt || input.withdrawn_at || input.archived_at || null,
      withdrawnBy: normalizeActor(withdrawal.withdrawnBy || withdrawal.withdrawn_by || { role: input.archived_by_role, userId: input.archived_by }),
      reason: normalizeText(withdrawal.reason || input.withdrawalReason || input.withdrawal_reason),
    },
    isDefault: input.isDefault === true || input.is_default === true,
    createdAt: input.createdAt || input.created_at || null,
    updatedAt: input.updatedAt || input.updated_at || null,
  }
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function validContentHash(value) {
  return /^(?:sha256:)?[a-f0-9]{64}$/i.test(normalizeText(value))
}

function duplicateKeys(items = []) {
  const keys = items.map((item) => item.key).filter(Boolean)
  return unique(keys.filter((key, index) => keys.indexOf(key) !== index))
}

export function validateConveyancerTemplateVersion(input = {}) {
  const template = normalizeConveyancerTemplateVersion(input)
  const errors = []
  if (template.contractVersion !== CONVEYANCER_TEMPLATE_GOVERNANCE_VERSION) errors.push('unsupported_template_governance_contract')
  if (!Number.isInteger(template.governanceVersion) || template.governanceVersion < 1) errors.push('governance_version_required')
  if (!template.templateId) errors.push('template_id_required')
  if (!template.templateVersionId) errors.push('template_version_id_required')
  if (!template.moduleType) errors.push('module_type_required')
  if (!template.packetType) errors.push('packet_type_required')
  if (!template.templateKey) errors.push('template_key_required')
  if (!template.templateLabel) errors.push('template_label_required')
  if (!TEMPLATE_KIND_VALUES.has(template.documentKind)) errors.push('invalid_document_kind')
  if (!TEMPLATE_MODEL_VALUES.has(template.documentModel)) errors.push('invalid_document_model')
  if (!TEMPLATE_FORMAT_VALUES.has(template.templateFormat)) errors.push('invalid_template_format')
  if (!TEMPLATE_LANE_VALUES.has(template.lane)) errors.push('invalid_legal_lane')
  if (!TEMPLATE_STATUS_VALUES.has(template.status)) errors.push('invalid_template_status')
  if (!Number.isInteger(template.versionNumber) || template.versionNumber < 1) errors.push('version_number_required')
  if (!template.versionTag) errors.push('version_tag_required')
  if (template.versionNumber === 1 && template.previousVersionId) errors.push('initial_version_cannot_have_predecessor')
  if (template.versionNumber > 1 && !template.previousVersionId) errors.push('previous_version_required')
  if (template.versionNumber === 1 && template.change.type !== CONVEYANCER_TEMPLATE_CHANGE_TYPES.initial) errors.push('initial_change_type_required')
  if (template.versionNumber > 1 && ![CONVEYANCER_TEMPLATE_CHANGE_TYPES.patch, CONVEYANCER_TEMPLATE_CHANGE_TYPES.minor, CONVEYANCER_TEMPLATE_CHANGE_TYPES.major, CONVEYANCER_TEMPLATE_CHANGE_TYPES.emergency].includes(template.change.type)) errors.push('version_change_type_required')
  if (template.versionNumber > 1 && !template.change.summary) errors.push('version_change_summary_required')
  if (!template.jurisdictionCode) errors.push('jurisdiction_code_required')
  if (!template.languageCode) errors.push('language_code_required')
  if (template.documentKind === CONVEYANCER_TEMPLATE_DOCUMENT_KINDS.agreement && !template.instrumentFamily) errors.push('agreement_instrument_family_required')
  if (template.instrumentFamilyInput && !template.instrumentFamily) errors.push('invalid_instrument_family')
  if (template.instrumentFamily && !getLegalInstrumentFamilyDefinition(template.instrumentFamily)) errors.push('invalid_instrument_family')
  if (!validContentHash(template.content.contentHash)) errors.push('valid_content_hash_required')
  if (!template.content.storagePath && !(Number.isInteger(template.content.sectionCount) && template.content.sectionCount > 0)) errors.push('template_content_source_required')
  if (!Number.isInteger(template.content.sectionCount) || template.content.sectionCount < 0) errors.push('invalid_section_count')
  if (!template.authoredBy.userId) errors.push('template_author_user_required')
  if (!canConveyancerTemplateActor(template.authoredBy.role, TC.create)) errors.push('template_author_not_authorised')
  if (!validDate(template.createdAt)) errors.push('template_created_at_required')

  const duplicateVariables = duplicateKeys(template.variables)
  if (duplicateVariables.length) errors.push(...duplicateVariables.map((key) => `duplicate_variable:${key}`))
  const duplicateClauses = duplicateKeys(template.clauses)
  if (duplicateClauses.length) errors.push(...duplicateClauses.map((key) => `duplicate_clause:${key}`))
  const variableKeys = new Set(template.variables.map((item) => item.key))
  template.variables.forEach((variable, index) => {
    const prefix = `variable_${index}`
    if (!variable.key) errors.push(`${prefix}:key_required`)
    if (!variable.label) errors.push(`${prefix}:label_required`)
    if (!TEMPLATE_VARIABLE_TYPE_VALUES.has(variable.type)) errors.push(`${prefix}:invalid_type`)
    if (!TEMPLATE_COVERAGE_VALUES.has(variable.coverage)) errors.push(`${prefix}:invalid_coverage`)
    if (variable.coverage !== CONVEYANCER_TEMPLATE_VARIABLE_COVERAGE.gap && !variable.sourcePaths.length && variable.coverage !== CONVEYANCER_TEMPLATE_VARIABLE_COVERAGE.manual && variable.coverage !== CONVEYANCER_TEMPLATE_VARIABLE_COVERAGE.approvedClause) errors.push(`${prefix}:source_path_required`)
    if (variable.coverage === CONVEYANCER_TEMPLATE_VARIABLE_COVERAGE.manual && !variable.manualEntryAllowed) errors.push(`${prefix}:manual_entry_authority_required`)
    if (variable.coverage === CONVEYANCER_TEMPLATE_VARIABLE_COVERAGE.approvedClause && !variable.clauseKey) errors.push(`${prefix}:clause_key_required`)
    const ruleIds = variable.validationRules.map((rule) => rule.ruleId)
    unique(ruleIds.filter((ruleId, ruleIndex) => ruleIds.indexOf(ruleId) !== ruleIndex)).forEach((ruleId) => errors.push(`${prefix}:duplicate_validation_rule:${ruleId}`))
    variable.validationRules.forEach((rule, ruleIndex) => {
      const rulePrefix = `${prefix}:validation_rule_${ruleIndex}`
      if (!rule.ruleId) errors.push(`${rulePrefix}:rule_id_required`)
      if (!TEMPLATE_DATA_VALIDATION_RULE_VALUES.has(rule.type)) errors.push(`${rulePrefix}:invalid_type`)
      if (!TEMPLATE_DATA_VALIDATION_SEVERITY_VALUES.has(rule.severity)) errors.push(`${rulePrefix}:invalid_severity`)
      if ([CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES.minLength, CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES.maxLength, CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES.numberMin, CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES.numberMax, CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES.sourceMaxAgeDays].includes(rule.type) && rule.value === null) errors.push(`${rulePrefix}:numeric_value_required`)
      if ([CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES.minLength, CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES.maxLength, CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES.sourceMaxAgeDays].includes(rule.type) && rule.value < 0) errors.push(`${rulePrefix}:non_negative_value_required`)
      if (rule.type === CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES.allowedValues && !rule.values.length) errors.push(`${rulePrefix}:allowed_values_required`)
      if ([CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES.matchesVariable, CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES.differsFromVariable, CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES.beforeVariable, CONVEYANCER_TEMPLATE_DATA_VALIDATION_RULES.afterVariable].includes(rule.type)) {
        if (!rule.otherKey) errors.push(`${rulePrefix}:other_variable_required`)
        else if (rule.otherKey === variable.key) errors.push(`${rulePrefix}:other_variable_must_differ`)
        else if (!variableKeys.has(rule.otherKey)) errors.push(`${rulePrefix}:other_variable_unknown`)
      }
    })
  })
  template.content.placeholderKeys.forEach((key) => {
    if (!variableKeys.has(key)) errors.push(`unmapped_placeholder:${key}`)
  })
  template.variables.filter((item) => item.required).forEach((item) => {
    if (!template.content.placeholderKeys.includes(item.key)) errors.push(`required_variable_not_in_template:${item.key}`)
  })
  template.clauses.forEach((clause, index) => {
    const prefix = `clause_${index}`
    if (!clause.key) errors.push(`${prefix}:key_required`)
    if (!Number.isInteger(clause.version) || clause.version < 1) errors.push(`${prefix}:version_required`)
    if (!validContentHash(clause.contentHash)) errors.push(`${prefix}:valid_content_hash_required`)
  })

  if (['approved', 'published', 'superseded'].includes(template.status)) {
    if (!validDate(template.approval.approvedAt)) errors.push('template_approval_date_required')
    if (!template.approval.approvedBy.userId) errors.push('template_approver_user_required')
    if (!canConveyancerTemplateActor(template.approval.approvedBy.role, TC.approve)) errors.push('template_approver_not_authorised')
    if (template.approval.approvedBy.userId === template.authoredBy.userId) errors.push('independent_template_approval_required')
    if (template.approval.templateFingerprint !== buildConveyancerTemplateGovernanceFingerprint(template)) errors.push('approved_fingerprint_mismatch')
  }
  if (['published', 'superseded'].includes(template.status)) {
    if (!validDate(template.publication.publishedAt)) errors.push('template_publication_date_required')
    if (!template.publication.publishedBy.userId) errors.push('template_publisher_user_required')
    if (!canConveyancerTemplateActor(template.publication.publishedBy.role, TC.publish)) errors.push('template_publisher_not_authorised')
    if (!validDate(template.publication.effectiveFrom)) errors.push('template_effective_from_required')
  }
  if (validDate(template.publication.effectiveFrom) && validDate(template.publication.effectiveUntil) && new Date(template.publication.effectiveUntil) <= new Date(template.publication.effectiveFrom)) errors.push('template_effective_until_must_follow_start')
  if (template.status === 'withdrawn') {
    if (!validDate(template.withdrawal.withdrawnAt)) errors.push('template_withdrawal_date_required')
    if (!template.withdrawal.withdrawnBy.userId || !canConveyancerTemplateActor(template.withdrawal.withdrawnBy.role, TC.withdraw)) errors.push('template_withdrawal_authority_required')
    if (!template.withdrawal.reason) errors.push('template_withdrawal_reason_required')
  }
  return { valid: errors.length === 0, errors: unique(errors), template }
}

export function evaluateConveyancerTemplatePublicationReadiness(input = {}) {
  const validation = validateConveyancerTemplateVersion(input)
  const template = validation.template
  const blockers = [...validation.errors]
  if (!['approved', 'published'].includes(template.status)) blockers.push('approved_template_required')
  if (template.variables.some((item) => item.coverage === CONVEYANCER_TEMPLATE_VARIABLE_COVERAGE.gap)) blockers.push('template_variable_gap')
  if (template.clauses.some((item) => item.required && (!validDate(item.approvedAt) || !item.approvedBy.userId || !canConveyancerTemplateActor(item.approvedBy.role, TC.approve)))) blockers.push('required_clause_not_approved')
  return {
    ready: unique(blockers).length === 0,
    blockers: unique(blockers),
    template,
  }
}

function transitionCapability(fromStatus, toStatus) {
  if (fromStatus === 'draft' && toStatus === 'attorney_review') return TC.submit
  if (fromStatus === 'attorney_review' && toStatus === 'draft') return TC.review
  if (fromStatus === 'attorney_review' && toStatus === 'approved') return TC.approve
  if (fromStatus === 'approved' && toStatus === 'draft') return TC.edit
  if (fromStatus === 'approved' && toStatus === 'published') return TC.publish
  if (toStatus === 'withdrawn') return TC.withdraw
  if (fromStatus === 'published' && toStatus === 'superseded') return TC.supersede
  return ''
}

export function evaluateConveyancerTemplateLifecycleTransition({ template: input = {}, toStatus = '', actor = {}, occurredAt = '', reason = '' } = {}) {
  const validation = validateConveyancerTemplateVersion(input)
  const template = validation.template
  const target = normalizeLegalTemplateLifecycleStatus(toStatus, '')
  const actorRole = normalizeMatterPlanOwnerRole(actor.role)
  if (!validation.valid) return { allowed: false, reason: 'template_contract_invalid', errors: validation.errors, requiredCapability: null }
  if (!target) return { allowed: false, reason: 'invalid_target_status', errors: [], requiredCapability: null }
  if (target === template.status) return { allowed: true, reason: 'no_status_change', errors: [], requiredCapability: null }
  if (!canTransitionLegalTemplateStatus(template.status, target)) return { allowed: false, reason: 'template_transition_not_allowed', errors: [], requiredCapability: null }
  const requiredCapability = transitionCapability(template.status, target)
  if (!requiredCapability || !canConveyancerTemplateActor(actorRole, requiredCapability)) return { allowed: false, reason: 'template_transition_not_authorised', errors: [], requiredCapability }
  if (!validDate(occurredAt)) return { allowed: false, reason: 'template_transition_time_required', errors: [], requiredCapability }
  if (['draft', 'withdrawn', 'superseded'].includes(target) && !normalizeText(reason)) return { allowed: false, reason: 'template_transition_reason_required', errors: [], requiredCapability }
  if (target === 'approved' && (!normalizeText(actor.userId || actor.user_id) || normalizeText(actor.userId || actor.user_id) === template.authoredBy.userId)) return { allowed: false, reason: 'independent_template_approval_required', errors: [], requiredCapability }
  if (target === 'published') {
    const readiness = evaluateConveyancerTemplatePublicationReadiness(template)
    if (!readiness.ready) return { allowed: false, reason: 'template_not_publication_ready', errors: readiness.blockers, requiredCapability }
  }
  return { allowed: true, reason: 'template_transition_authorised', errors: [], requiredCapability }
}

export function validateConveyancerTemplateVersionLineage({ currentVersion = {}, previousVersion = {} } = {}) {
  const current = validateConveyancerTemplateVersion(currentVersion)
  const previous = validateConveyancerTemplateVersion(previousVersion)
  const errors = []
  if (!current.valid) errors.push(...current.errors.map((item) => `current:${item}`))
  if (!previous.valid) errors.push(...previous.errors.map((item) => `previous:${item}`))
  if (current.template.templateId !== previous.template.templateId) errors.push('lineage_template_id_mismatch')
  if (current.template.templateKey !== previous.template.templateKey) errors.push('lineage_template_key_mismatch')
  if (current.template.organisationId !== previous.template.organisationId) errors.push('lineage_organisation_mismatch')
  if (current.template.moduleType !== previous.template.moduleType || current.template.packetType !== previous.template.packetType) errors.push('lineage_document_route_mismatch')
  if (current.template.versionNumber !== previous.template.versionNumber + 1) errors.push('lineage_version_must_be_sequential')
  if (current.template.previousVersionId !== previous.template.templateVersionId) errors.push('lineage_previous_version_mismatch')
  if (!['published', 'superseded'].includes(previous.template.status)) errors.push('lineage_predecessor_must_be_released')
  if (current.template.content.contentHash === previous.template.content.contentHash) errors.push('lineage_content_hash_unchanged')
  return { valid: errors.length === 0, errors: unique(errors), current: current.template, previous: previous.template }
}

function readMatterFact(source = {}, camel, snake) {
  return source[camel] ?? source[snake] ?? null
}

export function evaluateConveyancerTemplateApplicability({ template: input = {}, matterFacts = {} } = {}) {
  const validation = validateConveyancerTemplateVersion(input)
  if (!validation.valid) return { applicable: false, reason: 'template_contract_invalid', mismatches: validation.errors, missingFacts: [], specificity: 0, template: validation.template }
  const template = validation.template
  const facts = {
    transactionType: normalizeKey(readMatterFact(matterFacts, 'transactionType', 'transaction_type')),
    financeType: normalizeKey(readMatterFact(matterFacts, 'financeType', 'finance_type')),
    buyerEntityType: normalizeKey(readMatterFact(matterFacts, 'buyerEntityType', 'buyer_entity_type')),
    sellerEntityType: normalizeKey(readMatterFact(matterFacts, 'sellerEntityType', 'seller_entity_type')),
    propertyTenure: normalizeKey(readMatterFact(matterFacts, 'propertyTenure', 'property_tenure')),
    sellerHasExistingBond: normalizeTriState(readMatterFact(matterFacts, 'sellerHasExistingBond', 'seller_has_existing_bond')),
    lane: normalizeKey(readMatterFact(matterFacts, 'lane', 'legal_lane')),
    jurisdictionCode: normalizeText(readMatterFact(matterFacts, 'jurisdictionCode', 'jurisdiction_code') || 'ZA').toUpperCase(),
    languageCode: normalizeText(readMatterFact(matterFacts, 'languageCode', 'language_code') || 'en-ZA'),
  }
  const restrictions = [
    ['transaction_type', template.applicability.transactionTypes, facts.transactionType],
    ['finance_type', template.applicability.financeTypes, facts.financeType],
    ['buyer_entity_type', template.applicability.buyerEntityTypes, facts.buyerEntityType],
    ['seller_entity_type', template.applicability.sellerEntityTypes, facts.sellerEntityType],
    ['property_tenure', template.applicability.propertyTenures, facts.propertyTenure],
  ]
  const missingFacts = restrictions.filter(([, allowed, actual]) => allowed.length && !actual).map(([key]) => key)
  const mismatches = restrictions.filter(([, allowed, actual]) => allowed.length && actual && !allowed.includes(actual)).map(([key]) => key)
  if (template.applicability.sellerHasExistingBond !== null && facts.sellerHasExistingBond === null) missingFacts.push('seller_has_existing_bond')
  if (template.applicability.sellerHasExistingBond !== null && facts.sellerHasExistingBond !== null && template.applicability.sellerHasExistingBond !== facts.sellerHasExistingBond) mismatches.push('seller_has_existing_bond')
  if (template.lane !== CONVEYANCER_TEMPLATE_LANES.shared && !facts.lane) missingFacts.push('legal_lane')
  if (template.lane !== CONVEYANCER_TEMPLATE_LANES.shared && facts.lane && template.lane !== facts.lane) mismatches.push('legal_lane')
  if (template.jurisdictionCode !== facts.jurisdictionCode) mismatches.push('jurisdiction_code')
  if (template.languageCode !== facts.languageCode) mismatches.push('language_code')
  const specificity = restrictions.reduce((total, [, allowed]) => total + allowed.length, 0) + (template.applicability.sellerHasExistingBond === null ? 0 : 1) + (template.lane === CONVEYANCER_TEMPLATE_LANES.shared ? 0 : 1)
  return {
    applicable: !missingFacts.length && !mismatches.length,
    reason: missingFacts.length ? 'template_applicability_facts_missing' : mismatches.length ? 'template_not_applicable' : 'template_applicable',
    missingFacts: unique(missingFacts),
    mismatches: unique(mismatches),
    specificity,
    template,
  }
}

export function selectConveyancerTemplateVersion({ templates = [], matterFacts = {}, organisationId = '', asOf = '' } = {}) {
  const resolvedAsOf = validDate(asOf) ? new Date(asOf) : new Date()
  const requestedOrganisationId = normalizeText(organisationId)
  const evaluations = (Array.isArray(templates) ? templates : []).map((input) => {
    const applicability = evaluateConveyancerTemplateApplicability({ template: input, matterFacts })
    const template = applicability.template
    const organisationAllowed = !template.organisationId || template.organisationId === requestedOrganisationId
    const effective = validDate(template.publication.effectiveFrom) && new Date(template.publication.effectiveFrom) <= resolvedAsOf && (!validDate(template.publication.effectiveUntil) || new Date(template.publication.effectiveUntil) > resolvedAsOf)
    const readiness = evaluateConveyancerTemplatePublicationReadiness(template)
    const selectable = readiness.ready && template.status === 'published' && organisationAllowed && effective && applicability.applicable
    const score = (template.organisationId ? 10000 : 0) + applicability.specificity * 100 + (template.isDefault ? 10 : 0) + template.versionNumber
    const reasons = [
      ...(!readiness.ready ? readiness.blockers : []),
      ...(template.status !== 'published' ? ['template_not_published'] : []),
      ...(!organisationAllowed ? ['template_organisation_mismatch'] : []),
      ...(!effective ? ['template_not_effective'] : []),
      ...(!applicability.applicable ? [applicability.reason] : []),
    ]
    return { template, applicability, selectable, score, reasons: unique(reasons) }
  })
  const candidates = evaluations.filter((item) => item.selectable).sort((left, right) => right.score - left.score || left.template.templateVersionId.localeCompare(right.template.templateVersionId))
  return {
    selected: candidates[0]?.template || null,
    selectionReason: candidates.length ? candidates[0].template.organisationId ? 'organisation_template_selected' : 'global_template_selected' : 'no_selectable_template',
    conflict: candidates.length > 1 && candidates[0].score === candidates[1].score,
    candidates,
    evaluations,
  }
}

export function isConveyancerTemplateVersionImmutable(input = {}) {
  return IMMUTABLE_TEMPLATE_STATUSES.has(normalizeConveyancerTemplateVersion(input).status)
}

function stableGovernedValue(value) {
  if (Array.isArray(value)) return value.map(stableGovernedValue)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => ({ ...result, [key]: stableGovernedValue(value[key]) }), {})
  }
  return value
}

function governedDraftSnapshot(template) {
  return stableGovernedValue({
    contractVersion: template.contractVersion,
    governanceVersion: template.governanceVersion,
    templateId: template.templateId,
    templateVersionId: template.templateVersionId,
    organisationId: template.organisationId,
    moduleType: template.moduleType,
    packetType: template.packetType,
    templateKey: template.templateKey,
    versionNumber: template.versionNumber,
    versionTag: template.versionTag,
    previousVersionId: template.previousVersionId,
    basedOnLiveVersionId: template.basedOnLiveVersionId,
    templateLabel: template.templateLabel,
    description: template.description,
    documentKind: template.documentKind,
    documentModel: template.documentModel,
    templateFormat: template.templateFormat,
    lane: template.lane,
    jurisdictionCode: template.jurisdictionCode,
    languageCode: template.languageCode,
    instrumentFamily: template.instrumentFamily,
    applicability: template.applicability,
    content: template.content,
    variables: template.variables,
    clauses: template.clauses,
    change: template.change,
  })
}

export function buildConveyancerTemplateGovernanceFingerprint(input = {}) {
  const template = normalizeConveyancerTemplateVersion(input)
  const source = JSON.stringify(governedDraftSnapshot(template))
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function evaluateConveyancerTemplateVersionMutation({ currentVersion = {}, proposedVersion = {}, actor = {} } = {}) {
  const currentValidation = validateConveyancerTemplateVersion(currentVersion)
  const proposedValidation = validateConveyancerTemplateVersion(proposedVersion)
  if (!currentValidation.valid) return { allowed: false, reason: 'current_template_contract_invalid', errors: currentValidation.errors }
  if (!proposedValidation.valid) return { allowed: false, reason: 'proposed_template_contract_invalid', errors: proposedValidation.errors }
  const current = currentValidation.template
  const proposed = proposedValidation.template
  if (IMMUTABLE_TEMPLATE_STATUSES.has(current.status)) return { allowed: false, reason: 'released_template_version_immutable', errors: [] }
  if (!['draft', 'attorney_review'].includes(current.status)) return { allowed: false, reason: 'template_not_editable_in_current_status', errors: [] }
  const actorRole = normalizeMatterPlanOwnerRole(actor.role)
  if (!canConveyancerTemplateActor(actorRole, TC.edit)) return { allowed: false, reason: 'template_edit_not_authorised', errors: [] }
  if (actorRole !== R.firmManager && current.authoredBy.userId !== normalizeText(actor.userId || actor.user_id)) return { allowed: false, reason: 'template_owned_by_another_author', errors: [] }
  const identityChanged = [
    'templateId',
    'templateVersionId',
    'organisationId',
    'moduleType',
    'packetType',
    'templateKey',
    'versionNumber',
    'versionTag',
    'previousVersionId',
    'basedOnLiveVersionId',
  ].some((field) => current[field] !== proposed[field])
  if (identityChanged) return { allowed: false, reason: 'template_version_identity_immutable', errors: [] }
  if (proposed.status !== current.status) return { allowed: false, reason: 'use_template_lifecycle_transition', errors: [] }
  const changed = JSON.stringify(governedDraftSnapshot(current)) !== JSON.stringify(governedDraftSnapshot(proposed))
  if (!changed) return { allowed: true, reason: 'no_template_change', errors: [] }
  if (current.content.contentHash === proposed.content.contentHash && JSON.stringify(current.content) !== JSON.stringify(proposed.content)) return { allowed: false, reason: 'content_hash_must_change_with_content', errors: [] }
  return { allowed: true, reason: 'draft_template_mutation_authorised', errors: [] }
}
