export const SUSPENSIVE_CONDITION_WORKFLOW_GATES_VERSION = 'suspensive_condition_workflow_gates_v1'

export const SUSPENSIVE_CONDITION_GATE_KEYS = Object.freeze({
  deadlinesCurrent: 'suspensive_condition_deadlines_current',
  resolutionsReady: 'suspensive_condition_resolutions_ready',
})

const FULFILLED_STATUSES = new Set(['fulfilled', 'fulfiled', 'completed', 'complete', 'satisfied', 'met', 'resolved', 'approved'])
const WAIVED_STATUSES = new Set(['waived', 'waiver'])
const EXTENDED_STATUSES = new Set(['extended', 'extension'])
const INACTIVE_STATUSES = new Set(['not_applicable', 'not_required', 'cancelled', 'canceled', 'removed', 'deleted'])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
}

function hasValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.length > 0
  return normalizeText(value).length > 0
}

function truthyFlag(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  return ['1', 'true', 'yes', 'y', 'on', 'required', 'applicable', 'fulfilled', 'waived', 'extended'].includes(normalized)
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (!hasValue(value)) return []
  return [value]
}

function readPath(source = {}, path = '') {
  return normalizeText(path)
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => {
      if (!current || typeof current !== 'object') return undefined
      return current[key]
    }, source)
}

function firstField(source = {}, fields = []) {
  for (const field of fields) {
    const value = readPath(source, field)
    if (hasValue(value)) return value
  }
  return undefined
}

function firstFromSources(sources = [], fields = []) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    const value = firstField(source, fields)
    if (hasValue(value)) return value
  }
  return undefined
}

function parseDate(value) {
  if (!hasValue(value)) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const raw = normalizeText(value)
  if (!raw) return null
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    return new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 23, 59, 59, 999))
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toIsoDate(value) {
  const date = parseDate(value)
  return date ? date.toISOString() : null
}

function normalizeConditionType(value = '', fallback = 'suspensive_condition') {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  if (normalized.includes('subject_to_sale') || normalized.includes('sale_of_buyer_property')) return 'subject_to_sale'
  if (normalized.includes('inspection') || normalized.includes('defect')) return 'subject_to_inspection'
  if (normalized.includes('bond') || normalized.includes('finance_approval')) return 'standard_bond_condition'
  if (normalized.includes('deposit') || normalized.includes('reservation')) return 'deposit_condition'
  if (normalized.includes('addendum') || normalized.includes('variation')) return 'otp_addendum'
  return normalized
}

function conditionLabel(type = '', condition = {}) {
  const explicit = firstField(condition, ['label', 'title', 'name'])
  if (hasValue(explicit)) return normalizeText(explicit)
  const normalized = normalizeConditionType(type)
  const labels = {
    subject_to_sale: 'Subject-to-sale condition',
    subject_to_inspection: 'Inspection condition',
    standard_bond_condition: 'Bond approval condition',
    deposit_condition: 'Deposit condition',
    otp_addendum: 'OTP addendum condition',
    suspensive_condition: 'Suspensive condition',
  }
  return labels[normalized] || normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function makeCondition(raw = {}, fallbackType = 'suspensive_condition', fallbackKey = '') {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : { description: raw }
  const type = normalizeConditionType(firstField(source, ['type', 'conditionType', 'condition_type', 'key', 'name']), fallbackType)
  const key = normalizeKey(firstField(source, ['id', 'conditionKey', 'condition_key', 'key']) || fallbackKey || type)

  return {
    key,
    type,
    label: conditionLabel(type, source),
    description: normalizeText(firstField(source, ['description', 'text', 'note', 'terms', 'wording'])),
    status: normalizeKey(firstField(source, ['status', 'conditionStatus', 'condition_status', 'fulfilmentStatus', 'fulfillmentStatus'])),
    deadline: firstField(source, [
      'deadline',
      'dueDate',
      'due_date',
      'conditionDeadline',
      'condition_deadline',
      'fulfilmentDeadline',
      'fulfillmentDeadline',
      'fulfilment_deadline',
      'expiryDate',
      'expiry_date',
      'expiresAt',
      'expires_at',
    ]),
    fulfilled: firstField(source, ['fulfilled', 'isFulfilled', 'is_fulfilled', 'conditionFulfilled', 'condition_fulfilled']),
    fulfilledAt: firstField(source, [
      'fulfilledAt',
      'fulfilled_at',
      'fulfilmentAt',
      'fulfilment_at',
      'fulfillmentAt',
      'fulfillment_at',
      'completedAt',
      'completed_at',
    ]),
    fulfilmentEvidenceId: firstField(source, [
      'fulfilmentEvidenceId',
      'fulfilment_evidence_id',
      'fulfillmentEvidenceId',
      'fulfillment_evidence_id',
      'fulfilmentDocumentId',
      'fulfilment_document_id',
      'fulfillmentDocumentId',
      'fulfillment_document_id',
      'evidenceId',
      'evidence_id',
      'documentId',
      'document_id',
    ]),
    waived: firstField(source, ['waived', 'isWaived', 'is_waived', 'conditionWaived', 'condition_waived']),
    waivedAt: firstField(source, ['waivedAt', 'waived_at', 'waiverAt', 'waiver_at']),
    waiverReason: firstField(source, ['waiverReason', 'waiver_reason', 'waiverNote', 'waiver_note']),
    waiverEvidenceId: firstField(source, ['waiverEvidenceId', 'waiver_evidence_id', 'waiverDocumentId', 'waiver_document_id']),
    extended: firstField(source, ['extended', 'isExtended', 'is_extended', 'conditionExtended', 'condition_extended']),
    extendedDeadline: firstField(source, [
      'extendedDeadline',
      'extended_deadline',
      'extensionDeadline',
      'extension_deadline',
      'extensionDueDate',
      'extension_due_date',
      'extendedUntil',
      'extended_until',
      'extension.expiresAt',
      'extension.expires_at',
      'extension.deadline',
      'latestExtension.deadline',
      'latest_extension.deadline',
    ]),
    extensionReason: firstField(source, [
      'extensionReason',
      'extension_reason',
      'extensionNote',
      'extension_note',
      'extension.reason',
      'latestExtension.reason',
      'latest_extension.reason',
    ]),
    extensionEvidenceId: firstField(source, [
      'extensionEvidenceId',
      'extension_evidence_id',
      'extensionDocumentId',
      'extension_document_id',
      'extension.documentId',
      'extension.document_id',
      'latestExtension.documentId',
      'latest_extension.document_id',
    ]),
    extensionSignedAt: firstField(source, [
      'extensionSignedAt',
      'extension_signed_at',
      'extensionApprovedAt',
      'extension_approved_at',
      'extendedAt',
      'extended_at',
      'extension.signedAt',
      'extension.signed_at',
      'latestExtension.signedAt',
      'latest_extension.signed_at',
    ]),
    raw: source,
  }
}

function pushCondition(target, condition, seen) {
  const normalized = makeCondition(condition)
  const dedupeKey = [
    normalized.key,
    normalized.type,
    normalized.deadline,
    normalized.description,
  ].map(normalizeText).join('|')
  if (seen.has(dedupeKey)) return
  seen.add(dedupeKey)
  if (INACTIVE_STATUSES.has(normalized.status)) return
  target.push(normalized)
}

function collectStructuredConditions(transaction = {}, conditionsJson = {}) {
  return [
    ...toArray(transaction.suspensive_conditions),
    ...toArray(transaction.suspensiveConditions),
    ...toArray(transaction.condition_records),
    ...toArray(transaction.conditionRecords),
    ...toArray(transaction.conditions),
    ...toArray(conditionsJson.suspensive_conditions),
    ...toArray(conditionsJson.suspensiveConditions),
    ...toArray(conditionsJson.conditionRecords),
    ...toArray(conditionsJson.condition_records),
    ...toArray(conditionsJson.conditions),
  ]
}

export function extractSuspensiveConditions(transaction = {}) {
  const conditionsJson = parseJsonObject(
    transaction.conditions_json ||
      transaction.conditionsJson ||
      transaction.offer_conditions_json ||
      transaction.offerConditionsJson,
  )
  const sources = [conditionsJson, transaction]
  const conditions = []
  const seen = new Set()

  for (const item of collectStructuredConditions(transaction, conditionsJson)) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      pushCondition(conditions, item, seen)
    } else if (hasValue(item)) {
      pushCondition(conditions, { type: item, description: item }, seen)
    }
  }

  if (truthyFlag(firstFromSources(sources, ['subjectToSale', 'subject_to_sale', 'purchaseSubjectToSale', 'purchase_subject_to_sale']))) {
    pushCondition(conditions, {
      type: 'subject_to_sale',
      status: firstFromSources(sources, ['subjectSaleStatus', 'subject_sale_status', 'subjectToSaleStatus', 'subject_to_sale_status']),
      deadline: firstFromSources(sources, ['subjectSaleDeadline', 'subject_sale_deadline', 'subjectSaleDueDate', 'subject_sale_due_date', 'subjectSaleTimeline', 'subject_sale_timeline']),
      fulfilled: firstFromSources(sources, ['subjectSaleFulfilled', 'subject_sale_fulfilled', 'subjectToSaleFulfilled', 'subject_to_sale_fulfilled']),
      fulfilledAt: firstFromSources(sources, ['subjectSaleFulfilledAt', 'subject_sale_fulfilled_at', 'subjectToSaleFulfilledAt', 'subject_to_sale_fulfilled_at']),
      fulfilmentEvidenceId: firstFromSources(sources, ['subjectSaleEvidenceId', 'subject_sale_evidence_id', 'linkedOtpId', 'linked_otp_id', 'linkedTransactionId', 'linked_transaction_id']),
      waived: firstFromSources(sources, ['subjectSaleWaived', 'subject_sale_waived', 'subjectToSaleWaived', 'subject_to_sale_waived']),
      waivedAt: firstFromSources(sources, ['subjectSaleWaivedAt', 'subject_sale_waived_at']),
      waiverReason: firstFromSources(sources, ['subjectSaleWaiverReason', 'subject_sale_waiver_reason']),
      extendedDeadline: firstFromSources(sources, ['subjectSaleExtendedDeadline', 'subject_sale_extended_deadline', 'subjectSaleExtensionDeadline', 'subject_sale_extension_deadline']),
      extensionEvidenceId: firstFromSources(sources, ['subjectSaleExtensionEvidenceId', 'subject_sale_extension_evidence_id', 'subjectSaleExtensionDocumentId', 'subject_sale_extension_document_id']),
      extensionSignedAt: firstFromSources(sources, ['subjectSaleExtensionSignedAt', 'subject_sale_extension_signed_at']),
      extensionReason: firstFromSources(sources, ['subjectSaleExtensionReason', 'subject_sale_extension_reason']),
    }, seen)
  }

  if (truthyFlag(firstFromSources(sources, ['subjectToInspection', 'subject_to_inspection', 'inspectionCondition', 'inspection_condition']))) {
    pushCondition(conditions, {
      type: 'subject_to_inspection',
      status: firstFromSources(sources, ['inspectionConditionStatus', 'inspection_condition_status']),
      deadline: firstFromSources(sources, ['inspectionDeadline', 'inspection_deadline', 'inspectionDueDate', 'inspection_due_date']),
      fulfilledAt: firstFromSources(sources, ['inspectionCompletedAt', 'inspection_completed_at']),
      fulfilmentEvidenceId: firstFromSources(sources, ['inspectionReportId', 'inspection_report_id']),
      waived: firstFromSources(sources, ['inspectionWaived', 'inspection_waived']),
      waivedAt: firstFromSources(sources, ['inspectionWaivedAt', 'inspection_waived_at']),
      waiverReason: firstFromSources(sources, ['inspectionWaiverReason', 'inspection_waiver_reason']),
      extendedDeadline: firstFromSources(sources, ['inspectionExtendedDeadline', 'inspection_extended_deadline']),
      extensionEvidenceId: firstFromSources(sources, ['inspectionExtensionEvidenceId', 'inspection_extension_evidence_id']),
    }, seen)
  }

  if (truthyFlag(firstFromSources(sources, ['depositCondition', 'deposit_condition', 'reservationDepositCondition', 'reservation_deposit_condition']))) {
    pushCondition(conditions, {
      type: 'deposit_condition',
      status: firstFromSources(sources, ['depositConditionStatus', 'deposit_condition_status']),
      deadline: firstFromSources(sources, ['depositDueDate', 'deposit_due_date', 'reservationDepositDueDate', 'reservation_deposit_due_date']),
      fulfilledAt: firstFromSources(sources, ['depositPaidAt', 'deposit_paid_at', 'reservationDepositPaidAt', 'reservation_deposit_paid_at']),
      fulfilmentEvidenceId: firstFromSources(sources, ['depositProofId', 'deposit_proof_id', 'reservationDepositProofId', 'reservation_deposit_proof_id']),
      waived: firstFromSources(sources, ['depositWaived', 'deposit_waived']),
      waiverReason: firstFromSources(sources, ['depositWaiverReason', 'deposit_waiver_reason']),
      extendedDeadline: firstFromSources(sources, ['depositExtendedDeadline', 'deposit_extended_deadline']),
      extensionEvidenceId: firstFromSources(sources, ['depositExtensionEvidenceId', 'deposit_extension_evidence_id']),
    }, seen)
  }

  const looseSuspensiveText = firstFromSources(sources, ['suspensiveConditionsText', 'suspensive_conditions_text'])
  if (hasValue(looseSuspensiveText)) {
    pushCondition(conditions, { type: 'suspensive_condition', description: looseSuspensiveText }, seen)
  }

  return conditions
}

function hasFulfilmentEvidence(condition = {}) {
  return hasValue(condition.fulfilmentEvidenceId) || hasValue(condition.fulfilledAt) || truthyFlag(condition.fulfilled)
}

function hasWaiverEvidence(condition = {}) {
  return hasValue(condition.waiverEvidenceId) || hasValue(condition.waivedAt) || hasValue(condition.waiverReason)
}

function hasExtensionEvidence(condition = {}) {
  return hasValue(condition.extensionEvidenceId) || hasValue(condition.extensionSignedAt) || hasValue(condition.extensionReason)
}

function buildIssue(code, message, gateKey, requiredEvidence = []) {
  return { code, message, gateKey, requiredEvidence }
}

function evaluateCondition(condition = {}, now = new Date()) {
  const status = normalizeKey(condition.status)
  const deadlineDate = parseDate(condition.deadline)
  const extendedDeadlineDate = parseDate(condition.extendedDeadline)
  const fulfilledByStatus = FULFILLED_STATUSES.has(status)
  const waivedByStatus = WAIVED_STATUSES.has(status)
  const extendedByStatus = EXTENDED_STATUSES.has(status)
  const fulfilled = fulfilledByStatus || hasFulfilmentEvidence(condition)
  const waiverSignalled = waivedByStatus || truthyFlag(condition.waived)
  const waiverReady = waiverSignalled && (waivedByStatus || hasWaiverEvidence(condition))
  const extensionSignalled = extendedByStatus || truthyFlag(condition.extended) || hasValue(condition.extendedDeadline)
  const extensionReady = extensionSignalled && Boolean(extendedDeadlineDate) && (extendedByStatus || hasExtensionEvidence(condition))
  const resolved = fulfilled || waiverReady
  const effectiveDeadline = extensionReady ? extendedDeadlineDate : deadlineDate
  const expired = Boolean(effectiveDeadline && effectiveDeadline.getTime() < now.getTime() && !resolved)
  const issues = []

  if (!resolved && !deadlineDate && !extendedDeadlineDate) {
    issues.push(buildIssue(
      'SUSPENSIVE_CONDITION_DEADLINE_REQUIRED',
      `${condition.label} needs a tracked deadline before the workflow can advance.`,
      SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent,
      ['condition_deadline'],
    ))
  }

  if (!resolved && extensionSignalled && !extendedDeadlineDate) {
    issues.push(buildIssue(
      'SUSPENSIVE_CONDITION_EXTENSION_DEADLINE_REQUIRED',
      `${condition.label} has an extension signal, but no extended deadline is recorded.`,
      SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent,
      ['condition_extension_deadline'],
    ))
  }

  if (!resolved && extensionSignalled && extendedDeadlineDate && !extensionReady) {
    issues.push(buildIssue(
      'SUSPENSIVE_CONDITION_EXTENSION_EVIDENCE_REQUIRED',
      `${condition.label} has an extended deadline, but the extension evidence is not recorded.`,
      SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent,
      ['condition_extension_evidence'],
    ))
  }

  if (!resolved && expired) {
    issues.push(buildIssue(
      'SUSPENSIVE_CONDITION_DEADLINE_EXPIRED',
      `${condition.label} has passed its deadline and must be fulfilled, waived, or extended in writing.`,
      SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent,
      ['condition_fulfilment_or_waiver', 'condition_extension_evidence'],
    ))
  }

  if (waiverSignalled && !waiverReady) {
    issues.push(buildIssue(
      'SUSPENSIVE_CONDITION_WAIVER_EVIDENCE_REQUIRED',
      `${condition.label} has a waiver signal, but the written waiver evidence or reason is not recorded.`,
      SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady,
      ['condition_waiver_evidence'],
    ))
  }

  if (!resolved) {
    issues.push(buildIssue(
      'SUSPENSIVE_CONDITION_RESOLUTION_REQUIRED',
      `${condition.label} must be fulfilled or waived before transfer or registration can advance.`,
      SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady,
      ['condition_fulfilment_or_waiver'],
    ))
  }

  const deadlineIssues = issues.filter((issue) => issue.gateKey === SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent)
  const resolutionIssues = issues.filter((issue) => issue.gateKey === SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady)

  return {
    ...condition,
    status,
    deadline_iso: toIsoDate(condition.deadline),
    extended_deadline_iso: toIsoDate(condition.extendedDeadline),
    effective_deadline_iso: effectiveDeadline ? effectiveDeadline.toISOString() : null,
    fulfilled,
    waived: waiverReady,
    extended: extensionReady,
    resolved,
    expired,
    deadline_ready: deadlineIssues.length === 0,
    resolution_ready: resolutionIssues.length === 0,
    issues,
  }
}

export function evaluateSuspensiveConditionWorkflowGates(transaction = {}, options = {}) {
  const now = parseDate(options.now) || new Date()
  const conditions = extractSuspensiveConditions(transaction).map((condition) => evaluateCondition(condition, now))
  const activeConditions = conditions.filter((condition) => !INACTIVE_STATUSES.has(condition.status))
  const deadlineBlockers = activeConditions.flatMap((condition) =>
    condition.issues
      .filter((issue) => issue.gateKey === SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent)
      .map((issue) => ({ ...issue, condition })),
  )
  const resolutionBlockers = activeConditions.flatMap((condition) =>
    condition.issues
      .filter((issue) => issue.gateKey === SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady)
      .map((issue) => ({ ...issue, condition })),
  )

  return {
    version: SUSPENSIVE_CONDITION_WORKFLOW_GATES_VERSION,
    hasConditions: activeConditions.length > 0,
    condition_count: activeConditions.length,
    conditions: activeConditions,
    gates: {
      [SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent]: {
        gateKey: SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent,
        label: 'Suspensive Condition Deadlines Current',
        status: deadlineBlockers.length ? 'blocked' : 'ready',
        ready: deadlineBlockers.length === 0,
        blockers: deadlineBlockers,
      },
      [SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady]: {
        gateKey: SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady,
        label: 'Suspensive Condition Resolutions Ready',
        status: resolutionBlockers.length ? 'blocked' : 'ready',
        ready: resolutionBlockers.length === 0,
        blockers: resolutionBlockers,
      },
    },
  }
}

function gateAppliesToTargetParentStage(targetParentStage = '') {
  const stage = normalizeKey(targetParentStage)
  if (stage === 'finance') return 'deadline'
  if (['transfer', 'registration', 'complete'].includes(stage)) return 'resolution'
  return ''
}

export function buildSuspensiveConditionWorkflowBlockers(transaction = {}, options = {}) {
  const gateScope = gateAppliesToTargetParentStage(options.targetParentStage)
  if (!gateScope) return []

  const evaluated = evaluateSuspensiveConditionWorkflowGates(transaction, { now: options.now })
  if (!evaluated.hasConditions) return []

  const selected = gateScope === 'deadline'
    ? evaluated.gates[SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent].blockers
    : [
        ...evaluated.gates[SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent].blockers,
        ...evaluated.gates[SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady].blockers,
      ]

  return selected.map((item) => ({
    code: item.code,
    message: item.message,
    severity: 'hard',
    ownerRole: options.ownerRole || 'attorney',
    workflowKey: options.workflowKey || '',
    stepKey: options.stepKey || undefined,
    requiredEvidence: item.requiredEvidence || [],
    gateKey: item.gateKey,
    conditionKey: item.condition?.key || null,
    conditionType: item.condition?.type || null,
    conditionLabel: item.condition?.label || null,
    conditionDeadline: item.condition?.effective_deadline_iso || item.condition?.deadline_iso || null,
    actionKey: options.actionKey || null,
  }))
}

export function areSuspensiveConditionWorkflowGatesSatisfied(transaction = {}, gateKey = '', options = {}) {
  const gate = normalizeKey(gateKey)
  const evaluated = evaluateSuspensiveConditionWorkflowGates(transaction, options)
  if (!evaluated.hasConditions) return true
  if (gate === SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent) {
    return evaluated.gates[SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent].ready
  }
  if (gate === SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady) {
    return evaluated.gates[SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent].ready &&
      evaluated.gates[SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady].ready
  }
  return true
}
