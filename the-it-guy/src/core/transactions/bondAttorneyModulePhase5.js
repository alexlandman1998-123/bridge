import { BOND_ATTORNEY_PHASE2_FACT_STATUSES } from './bondAttorneyModulePhase2.js'
import {
  buildBondPackWorkspace,
  buildBondPackWorkspaceAuditEvent,
  validateBondPackWorkspace,
} from './bondAttorneyModulePhase3.js'

export const BOND_ATTORNEY_PHASE5_VERSION = 'bond_attorney_module_phase5_bank_conditions_v1'
export const BOND_ATTORNEY_PHASE5_RELEASE_BLOCKER_ID = 'bank_conditions_not_structured'

export const BOND_BANK_CONDITION_STATUSES = Object.freeze({
  open: 'open',
  inProgress: 'in_progress',
  evidenceProvided: 'evidence_provided',
  satisfied: 'satisfied',
  rejected: 'rejected',
  waived: 'waived',
})

export const BOND_BANK_CONDITION_EVIDENCE_STATUSES = Object.freeze({
  missing: 'missing',
  requested: 'requested',
  provided: 'provided',
  approved: 'approved',
  rejected: 'rejected',
  waived: 'waived',
})

export const BOND_BANK_CONDITION_OWNER_ROLES = Object.freeze({
  buyer: 'buyer',
  bondAttorney: 'bond_attorney',
  secretary: 'secretary',
  bank: 'bank',
  originator: 'originator',
  transferAttorney: 'transfer_attorney',
  cancellationAttorney: 'cancellation_attorney',
  unassigned: 'unassigned',
})

export const BOND_BANK_CONDITION_TYPES = Object.freeze({
  insurance: 'insurance',
  fica: 'fica',
  authority: 'authority',
  debitOrder: 'debit_order',
  valuation: 'valuation',
  depositProof: 'deposit_proof',
  guarantee: 'guarantee',
  signing: 'signing',
  bankForm: 'bank_form',
  other: 'other',
})

export const BOND_BANK_CONDITION_DUE_STATES = Object.freeze({
  resolved: 'resolved',
  overdue: 'overdue',
  dueSoon: 'due_soon',
  future: 'future',
  noDueDate: 'no_due_date',
})

export const BOND_BANK_CONDITION_BLOCKER_STATES = Object.freeze({
  resolved: 'resolved',
  blocking: 'blocking',
  attention: 'attention',
  monitor: 'monitor',
})

export const BOND_BANK_CONDITION_CONTROL_BOUNDARY = Object.freeze({
  structuredTrackerOnly: true,
  requiredFactKey: 'bank_conditions',
  requiresVerifiedCanonicalFact: true,
  requiresTypedOwner: true,
  requiresDueDate: true,
  requiresEvidenceContract: true,
  mayCreateOperationalNextActions: true,
  mayRecordEvidenceLinks: true,
  generatesBankApproval: false,
  submitsToBankPortal: false,
  generatesLegalInstrument: false,
  changesExternalRegistryOutcome: false,
})

const S = BOND_BANK_CONDITION_STATUSES
const E = BOND_BANK_CONDITION_EVIDENCE_STATUSES
const R = BOND_BANK_CONDITION_OWNER_ROLES
const T = BOND_BANK_CONDITION_TYPES
const D = BOND_BANK_CONDITION_DUE_STATES
const B = BOND_BANK_CONDITION_BLOCKER_STATES

const OWNER_ROLE_SET = new Set(Object.values(BOND_BANK_CONDITION_OWNER_ROLES))
const CONDITION_STATUS_SET = new Set(Object.values(BOND_BANK_CONDITION_STATUSES))
const EVIDENCE_STATUS_SET = new Set(Object.values(BOND_BANK_CONDITION_EVIDENCE_STATUSES))

const OWNER_ALIASES = Object.freeze({
  attorney: R.bondAttorney,
  bond: R.bondAttorney,
  bond_attorney_team: R.bondAttorney,
  conveyancer: R.bondAttorney,
  conveyancing_secretary: R.secretary,
  assistant: R.secretary,
  lender: R.bank,
  bank_or_originator: R.originator,
  mortgage_originator: R.originator,
  transfer: R.transferAttorney,
  transfer_conveyancer: R.transferAttorney,
  cancellation: R.cancellationAttorney,
  cancellation_conveyancer: R.cancellationAttorney,
})

const STATUS_ALIASES = Object.freeze({
  new: S.open,
  pending: S.open,
  outstanding: S.open,
  started: S.inProgress,
  working: S.inProgress,
  in_review: S.evidenceProvided,
  supplied: S.evidenceProvided,
  provided: S.evidenceProvided,
  complete: S.satisfied,
  completed: S.satisfied,
  resolved: S.satisfied,
  approved: S.satisfied,
  declined: S.rejected,
})

const EVIDENCE_STATUS_ALIASES = Object.freeze({
  attached: E.provided,
  uploaded: E.provided,
  supplied: E.provided,
  received: E.provided,
  accepted: E.approved,
  reviewed: E.approved,
  declined: E.rejected,
})

const CONDITION_TYPE_DEFAULTS = Object.freeze({
  [T.insurance]: Object.freeze({
    label: 'Insurance confirmation',
    evidence: Object.freeze([Object.freeze({ key: 'insurance_confirmation', label: 'Insurance confirmation or policy schedule', type: 'document', requiresApproval: true })]),
  }),
  [T.fica]: Object.freeze({
    label: 'FICA / identity condition',
    evidence: Object.freeze([Object.freeze({ key: 'fica_pack', label: 'Verified FICA and identity pack', type: 'document', requiresApproval: true })]),
  }),
  [T.authority]: Object.freeze({
    label: 'Authority condition',
    evidence: Object.freeze([Object.freeze({ key: 'authority_evidence', label: 'Capacity, mandate or authority evidence', type: 'document', requiresApproval: true })]),
  }),
  [T.debitOrder]: Object.freeze({
    label: 'Debit-order mandate',
    evidence: Object.freeze([Object.freeze({ key: 'debit_order_mandate', label: 'Signed debit-order mandate or bank confirmation', type: 'document', requiresApproval: true })]),
  }),
  [T.valuation]: Object.freeze({
    label: 'Valuation condition',
    evidence: Object.freeze([Object.freeze({ key: 'valuation_report', label: 'Valuation report or lender confirmation', type: 'document', requiresApproval: false })]),
  }),
  [T.depositProof]: Object.freeze({
    label: 'Deposit proof',
    evidence: Object.freeze([Object.freeze({ key: 'deposit_proof', label: 'Deposit or balance-of-purchase-price proof', type: 'document', requiresApproval: true })]),
  }),
  [T.guarantee]: Object.freeze({
    label: 'Guarantee condition',
    evidence: Object.freeze([Object.freeze({ key: 'guarantee_confirmation', label: 'Guarantee wording or expiry confirmation', type: 'document', requiresApproval: true })]),
  }),
  [T.signing]: Object.freeze({
    label: 'Signing condition',
    evidence: Object.freeze([Object.freeze({ key: 'signed_pack_evidence', label: 'Signed bond pack evidence', type: 'document', requiresApproval: true })]),
  }),
  [T.bankForm]: Object.freeze({
    label: 'Bank form condition',
    evidence: Object.freeze([Object.freeze({ key: 'bank_form', label: 'Completed bank form or mandate', type: 'document', requiresApproval: true })]),
  }),
  [T.other]: Object.freeze({
    label: 'Bank condition',
    evidence: Object.freeze([Object.freeze({ key: 'condition_response_evidence', label: 'Condition response evidence', type: 'document', requiresApproval: false })]),
  }),
})

function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '')
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, itemKey) => {
      result[itemKey] = stable(value[itemKey])
      return result
    }, {})
  }
  return value
}

function hash(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(stable(value))
  let result = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    result ^= source.charCodeAt(index)
    result = Math.imul(result, 0x01000193)
  }
  return `fnv1a_${(result >>> 0).toString(16).padStart(8, '0')}`
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value
  const normalized = key(value)
  if (['true', 'yes', 'y', '1', 'blocking', 'required'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'non_blocking', 'not_required'].includes(normalized)) return false
  return fallback
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    if (Array.isArray(value.conditions)) return value.conditions
    if (Array.isArray(value.items)) return value.items
    return Object.entries(value).map(([conditionKey, conditionValue]) => {
      if (conditionValue && typeof conditionValue === 'object' && !Array.isArray(conditionValue)) {
        return { key: conditionKey, ...conditionValue }
      }
      return { key: conditionKey, label: conditionKey, value: conditionValue }
    })
  }
  return text(value) ? [{ label: text(value) }] : []
}

function isoDateOnly(value) {
  if (!validDate(value)) return null
  return new Date(value).toISOString().slice(0, 10)
}

function endOfDate(value) {
  if (!validDate(value)) return null
  const date = new Date(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text(value))) date.setUTCHours(23, 59, 59, 999)
  return date
}

function daysUntil(dueDate, asOf) {
  const due = endOfDate(dueDate)
  const now = validDate(asOf) ? new Date(asOf) : new Date()
  if (!due) return null
  return Math.ceil((due.getTime() - now.getTime()) / 86_400_000)
}

function actorSummary(actor = {}) {
  return Object.freeze({
    role: key(actor.role || actor.actorRole || actor.actor_role) || 'system',
    userId: text(actor.userId || actor.user_id) || null,
  })
}

function normalizeOwnerRole(value = '') {
  const normalized = key(value)
  if (!normalized) return R.unassigned
  const role = OWNER_ALIASES[normalized] || normalized
  return OWNER_ROLE_SET.has(role) ? role : R.unassigned
}

function normalizeStatus(value = '', fallback = S.open) {
  const normalized = key(value)
  const status = STATUS_ALIASES[normalized] || normalized
  return CONDITION_STATUS_SET.has(status) ? status : fallback
}

function normalizeEvidenceStatus(value = '', fallback = E.missing) {
  const normalized = key(value)
  const status = EVIDENCE_STATUS_ALIASES[normalized] || normalized
  return EVIDENCE_STATUS_SET.has(status) ? status : fallback
}

function normalizeConditionType(value = '') {
  const normalized = key(value)
  if (normalized.includes('insurance')) return T.insurance
  if (normalized.includes('fica') || normalized.includes('identity')) return T.fica
  if (normalized.includes('authority') || normalized.includes('resolution') || normalized.includes('mandate_authority')) return T.authority
  if (normalized.includes('debit') || normalized.includes('mandate')) return T.debitOrder
  if (normalized.includes('valuation') || normalized.includes('valuer')) return T.valuation
  if (normalized.includes('deposit') || normalized.includes('balance_purchase')) return T.depositProof
  if (normalized.includes('guarantee')) return T.guarantee
  if (normalized.includes('sign')) return T.signing
  if (normalized.includes('bank_form') || normalized.includes('form')) return T.bankForm
  return T.other
}

function normalizeEvidenceRequirement(requirement = {}, fallbackType = T.other, index = 0) {
  const source = requirement && typeof requirement === 'object' ? requirement : { label: requirement }
  const defaultRequirement = CONDITION_TYPE_DEFAULTS[fallbackType]?.evidence?.[index] || CONDITION_TYPE_DEFAULTS[T.other].evidence[0]
  const requirementKey = key(source.key || source.requirementKey || source.requirement_key || source.id || source.label || defaultRequirement.key) || `evidence_${index + 1}`
  return Object.freeze({
    key: requirementKey,
    label: text(source.label || source.name || defaultRequirement.label || requirementKey),
    type: key(source.type || source.evidenceType || source.evidence_type || defaultRequirement.type || 'document') || 'document',
    required: source.required !== false,
    requiresApproval: bool(source.requiresApproval ?? source.requires_approval, defaultRequirement.requiresApproval === true),
  })
}

function normalizeEvidenceRequirements(requirements, conditionType) {
  const defaults = CONDITION_TYPE_DEFAULTS[conditionType]?.evidence || CONDITION_TYPE_DEFAULTS[T.other].evidence
  const source = asArray(requirements).length ? asArray(requirements) : defaults
  return Object.freeze(source.map((requirement, index) => normalizeEvidenceRequirement(requirement, conditionType, index)))
}

function normalizeEvidenceItem(evidence = {}, index = 0) {
  const source = evidence && typeof evidence === 'object' ? evidence : { referenceId: evidence }
  return Object.freeze({
    evidenceId: text(source.evidenceId || source.evidence_id || source.id) || `condition-evidence-${index + 1}`,
    requirementKey: key(source.requirementKey || source.requirement_key || source.key || source.evidenceKey || source.evidence_key),
    status: normalizeEvidenceStatus(source.status || source.evidenceStatus || source.evidence_status, text(source.referenceId || source.reference_id || source.documentId || source.document_id) ? E.provided : E.missing),
    referenceId: text(source.referenceId || source.reference_id || source.documentId || source.document_id || source.fileId || source.file_id) || null,
    capturedAt: source.capturedAt || source.captured_at || null,
    reviewedAt: source.reviewedAt || source.reviewed_at || source.approvedAt || source.approved_at || null,
    reason: text(source.reason || source.waiverReason || source.waiver_reason) || null,
  })
}

function normalizeEvidenceItems(items) {
  return Object.freeze(asArray(items).map(normalizeEvidenceItem))
}

function evidenceMatchesRequirement(evidence, requirement) {
  return evidence.requirementKey === requirement.key || (!evidence.requirementKey && evidence.referenceId && requirement.key)
}

function evidenceSatisfiesRequirement(evidence, requirement) {
  if (!evidence) return false
  if (evidence.status === E.waived) return Boolean(evidence.reason)
  if (requirement.requiresApproval) return evidence.status === E.approved
  return [E.provided, E.approved].includes(evidence.status)
}

function evidenceRejectedForRequirement(evidenceItems, requirement) {
  return evidenceItems.some((evidence) => evidenceMatchesRequirement(evidence, requirement) && evidence.status === E.rejected)
}

function buildEvidenceContract({ requirements, evidenceItems }) {
  const required = requirements.filter((requirement) => requirement.required !== false)
  const gaps = required.filter((requirement) => !evidenceItems.some((evidence) => evidenceMatchesRequirement(evidence, requirement) && evidenceSatisfiesRequirement(evidence, requirement)))
  const rejected = required.filter((requirement) => evidenceRejectedForRequirement(evidenceItems, requirement))
  return Object.freeze({
    required: Object.freeze(required),
    provided: evidenceItems,
    evidenceSatisfied: gaps.length === 0,
    evidenceGaps: Object.freeze(gaps.map((requirement) => requirement.key)),
    rejectedEvidenceKeys: Object.freeze(rejected.map((requirement) => requirement.key)),
  })
}

function conditionResolved({ status, evidenceSatisfied, waiverReason }) {
  if (status === S.waived) return Boolean(text(waiverReason))
  return status === S.satisfied && evidenceSatisfied === true
}

function dueState({ dueDate, asOf, resolved }) {
  if (resolved) return D.resolved
  if (!dueDate) return D.noDueDate
  const due = endOfDate(dueDate)
  const now = validDate(asOf) ? new Date(asOf) : new Date()
  if (!due) return D.noDueDate
  if (due.getTime() < now.getTime()) return D.overdue
  const days = daysUntil(dueDate, asOf)
  if (days === null) return D.noDueDate
  if (days <= 2) return D.dueSoon
  return D.future
}

function blocker({ id, severity = 'medium', category = 'readiness', detail = '' }) {
  return Object.freeze({ id, severity, category, detail })
}

function buildConditionBlockers({ condition, resolved }) {
  const blockers = []
  if (condition.ownerRole === R.unassigned) blockers.push(blocker({ id: 'condition_owner_required', severity: 'critical', category: 'structure' }))
  if (!condition.dueDate) blockers.push(blocker({ id: 'condition_due_date_required', severity: 'critical', category: 'structure' }))
  if (!condition.evidenceContract.required.length) blockers.push(blocker({ id: 'condition_evidence_contract_required', severity: 'critical', category: 'structure' }))
  if (condition.evidenceContract.rejectedEvidenceKeys.length) {
    blockers.push(blocker({ id: 'condition_evidence_rejected', severity: 'high', detail: condition.evidenceContract.rejectedEvidenceKeys.join(',') }))
  }
  if (condition.status === S.satisfied && condition.evidenceContract.evidenceSatisfied !== true) {
    blockers.push(blocker({ id: 'satisfied_condition_evidence_incomplete', severity: 'critical', category: 'structure', detail: condition.evidenceContract.evidenceGaps.join(',') }))
  } else if (!resolved && condition.evidenceContract.evidenceGaps.length) {
    blockers.push(blocker({ id: 'required_evidence_missing', severity: condition.bankBlocking ? 'high' : 'medium', detail: condition.evidenceContract.evidenceGaps.join(',') }))
  }
  if (condition.status === S.waived && !condition.waiverReason) {
    blockers.push(blocker({ id: 'waiver_reason_required', severity: 'critical', category: 'structure' }))
  }
  if (!resolved && condition.dueState === D.overdue) blockers.push(blocker({ id: 'condition_overdue', severity: 'high' }))
  if (!resolved && condition.bankBlocking) blockers.push(blocker({ id: 'bank_blocking_condition_open', severity: 'high' }))
  return Object.freeze(blockers)
}

function blockerState({ resolved, bankBlocking, blockers }) {
  if (resolved) return B.resolved
  if (bankBlocking) return B.blocking
  if (blockers.some((item) => ['critical', 'high'].includes(item.severity))) return B.attention
  return B.monitor
}

function normalizeCondition(input = {}, index = 0, { asOf = new Date().toISOString() } = {}) {
  const source = input && typeof input === 'object' ? input : { label: input }
  const rawKey = source.conditionKey || source.condition_key || source.key || source.code || source.id || source.label || source.description || `condition_${index + 1}`
  const conditionKey = key(rawKey) || `condition_${index + 1}`
  const type = normalizeConditionType(source.type || source.conditionType || source.condition_type || source.category || rawKey)
  const status = normalizeStatus(source.status || source.conditionStatus || source.condition_status || source.state || (source.satisfied === true || source.resolved === true ? S.satisfied : S.open))
  const ownerRole = normalizeOwnerRole(source.ownerRole || source.owner_role || source.owner || source.responsibleRole || source.responsible_role || source.responsibleParty || source.responsible_party)
  const dueDate = isoDateOnly(source.dueDate || source.due_date || source.targetDate || source.target_date || source.requiredBy || source.required_by)
  const evidenceRequirements = normalizeEvidenceRequirements(source.evidenceRequirements || source.evidence_requirements || source.requiredEvidence || source.required_evidence, type)
  const evidenceItems = normalizeEvidenceItems(source.evidence || source.evidenceItems || source.evidence_items || source.providedEvidence || source.provided_evidence)
  const evidenceContract = buildEvidenceContract({ requirements: evidenceRequirements, evidenceItems })
  const waiverReason = text(source.waiverReason || source.waiver_reason || source.reason)
  const resolved = conditionResolved({ status, evidenceSatisfied: evidenceContract.evidenceSatisfied, waiverReason })
  const normalized = {
    conditionId: text(source.conditionId || source.condition_id || source.id) || hash({ conditionKey, index }),
    key: conditionKey,
    label: text(source.label || source.title || CONDITION_TYPE_DEFAULTS[type]?.label || rawKey),
    description: text(source.description || source.detail || source.value),
    type,
    status,
    bankBlocking: bool(source.bankBlocking ?? source.bank_blocking ?? source.blocking ?? source.isBlocking ?? source.satisfactionRequired ?? source.satisfaction_required, true),
    ownerRole,
    ownerUserId: text(source.ownerUserId || source.owner_user_id || source.assigneeUserId || source.assignee_user_id) || null,
    dueDate,
    dueState: D.noDueDate,
    waiverReason: waiverReason || null,
    sourceReference: text(source.sourceReference || source.source_reference || source.sourceId || source.source_id) || null,
    evidenceContract,
    resolved,
    blockerState: B.monitor,
    blockers: Object.freeze([]),
  }
  normalized.dueState = dueState({ dueDate, asOf, resolved })
  normalized.blockers = buildConditionBlockers({ condition: normalized, resolved })
  normalized.blockerState = blockerState({ resolved, bankBlocking: normalized.bankBlocking, blockers: normalized.blockers })
  return Object.freeze(normalized)
}

function conditionSort(left, right) {
  const stateRank = { [B.blocking]: 0, [B.attention]: 1, [B.monitor]: 2, [B.resolved]: 3 }
  const dueRank = { [D.overdue]: 0, [D.dueSoon]: 1, [D.noDueDate]: 2, [D.future]: 3, [D.resolved]: 4 }
  return (stateRank[left.blockerState] ?? 9) - (stateRank[right.blockerState] ?? 9) ||
    (dueRank[left.dueState] ?? 9) - (dueRank[right.dueState] ?? 9) ||
    text(left.dueDate || '9999-12-31').localeCompare(text(right.dueDate || '9999-12-31')) ||
    left.key.localeCompare(right.key)
}

function buildNextAction(condition) {
  if (condition.resolved) return null
  const firstBlocker = condition.blockers[0]?.id || null
  let actionLabel = 'Follow up condition owner'
  if (condition.ownerRole === R.unassigned) actionLabel = 'Assign condition owner'
  else if (!condition.dueDate) actionLabel = 'Set condition due date'
  else if (condition.evidenceContract.rejectedEvidenceKeys.length) actionLabel = 'Resolve rejected evidence'
  else if (condition.evidenceContract.evidenceGaps.length) actionLabel = 'Attach or approve required evidence'
  else if (condition.dueState === D.overdue) actionLabel = 'Escalate overdue bank condition'
  else if (condition.bankBlocking) actionLabel = 'Clear bank blocker'

  return Object.freeze({
    conditionId: condition.conditionId,
    conditionKey: condition.key,
    ownerRole: condition.ownerRole,
    dueDate: condition.dueDate,
    dueState: condition.dueState,
    blockerState: condition.blockerState,
    priority: condition.blockerState === B.blocking ? 'high' : condition.dueState === D.overdue ? 'high' : 'normal',
    actionLabel,
    reason: firstBlocker,
    evidenceGaps: condition.evidenceContract.evidenceGaps,
  })
}

function buildMetrics(conditions = []) {
  const byOwnerRole = conditions.reduce((result, condition) => {
    result[condition.ownerRole] = (result[condition.ownerRole] || 0) + 1
    return result
  }, {})
  const byBlockerState = conditions.reduce((result, condition) => {
    result[condition.blockerState] = (result[condition.blockerState] || 0) + 1
    return result
  }, {})
  return Object.freeze({
    conditionCount: conditions.length,
    structuredConditionCount: conditions.filter((condition) => condition.ownerRole !== R.unassigned && Boolean(condition.dueDate) && condition.evidenceContract.required.length > 0).length,
    resolvedCount: conditions.filter((condition) => condition.resolved).length,
    openCount: conditions.filter((condition) => !condition.resolved).length,
    blockingOpenCount: conditions.filter((condition) => condition.bankBlocking && !condition.resolved).length,
    overdueOpenCount: conditions.filter((condition) => !condition.resolved && condition.dueState === D.overdue).length,
    dueSoonOpenCount: conditions.filter((condition) => !condition.resolved && condition.dueState === D.dueSoon).length,
    evidenceGapCount: conditions.reduce((sum, condition) => sum + condition.evidenceContract.evidenceGaps.length, 0),
    rejectedEvidenceCount: conditions.reduce((sum, condition) => sum + condition.evidenceContract.rejectedEvidenceKeys.length, 0),
    missingOwnerCount: conditions.filter((condition) => condition.ownerRole === R.unassigned).length,
    missingDueDateCount: conditions.filter((condition) => !condition.dueDate).length,
    byOwnerRole: Object.freeze(byOwnerRole),
    byBlockerState: Object.freeze(byBlockerState),
  })
}

function buildConditionFingerprint(conditions = []) {
  return hash(conditions.map((condition) => ({
    key: condition.key,
    type: condition.type,
    status: condition.status,
    bankBlocking: condition.bankBlocking,
    ownerRole: condition.ownerRole,
    dueDate: condition.dueDate,
    evidenceRequirements: condition.evidenceContract.required.map((requirement) => ({
      key: requirement.key,
      type: requirement.type,
      required: requirement.required,
      requiresApproval: requirement.requiresApproval,
    })),
    evidenceStatuses: condition.evidenceContract.provided.map((evidence) => ({
      requirementKey: evidence.requirementKey,
      status: evidence.status,
      referenceId: evidence.referenceId,
      capturedAt: evidence.capturedAt,
      reviewedAt: evidence.reviewedAt,
    })),
  })))
}

function buildScheduleModel({ register }) {
  return Object.freeze({
    version: BOND_ATTORNEY_PHASE5_VERSION,
    workspaceId: register.workspaceId,
    transactionId: register.transactionId,
    generatedAt: register.generatedAt,
    conditionFingerprint: register.conditionFingerprint,
    rows: Object.freeze(register.conditions.map((condition) => Object.freeze({
      conditionId: condition.conditionId,
      key: condition.key,
      label: condition.label,
      type: condition.type,
      ownerRole: condition.ownerRole,
      dueDate: condition.dueDate,
      dueState: condition.dueState,
      status: condition.status,
      bankBlocking: condition.bankBlocking,
      blockerState: condition.blockerState,
      evidenceSatisfied: condition.evidenceContract.evidenceSatisfied,
      evidenceGaps: condition.evidenceContract.evidenceGaps,
      nextAction: buildNextAction(condition)?.actionLabel || 'No action required',
    }))),
  })
}

function buildAuditEvent({ workspace, register, actor, commandId, occurredAt }) {
  const base = buildBondPackWorkspaceAuditEvent({
    workspace,
    eventType: 'bond_bank_conditions_structured',
    actor,
    commandId,
    occurredAt,
  })
  return Object.freeze({
    ...base,
    version: BOND_ATTORNEY_PHASE5_VERSION,
    workspaceEventVersion: base.version,
    releaseBlockerId: BOND_ATTORNEY_PHASE5_RELEASE_BLOCKER_ID,
    conditionFingerprint: register.conditionFingerprint,
    conditionMetrics: register.metrics,
    readyForPhase6: register.readyForPhase6,
  })
}

export function validateBondConditionRegister(register = {}) {
  const errors = []
  const warnings = []
  if (register.version !== BOND_ATTORNEY_PHASE5_VERSION) errors.push('condition_register_version_invalid')
  if (register.workspaceValidation && register.workspaceValidation.valid !== true) errors.push(...register.workspaceValidation.errors.map((error) => `workspace:${error}`))
  if (register.bankConditionsFactStatus !== BOND_ATTORNEY_PHASE2_FACT_STATUSES.verified) errors.push('bank_conditions_fact_not_verified')
  if (!Array.isArray(register.conditions) || !register.conditions.length) errors.push('bank_conditions_required')

  const conditionKeys = (register.conditions || []).map((condition) => condition.key)
  if (new Set(conditionKeys).size !== conditionKeys.length) errors.push('duplicate_bank_condition_key')

  ;(register.conditions || []).forEach((condition) => {
    if (!condition.key) errors.push('bank_condition_key_required')
    if (!Object.values(T).includes(condition.type)) errors.push(`bank_condition_type_invalid:${condition.key}`)
    if (!CONDITION_STATUS_SET.has(condition.status)) errors.push(`bank_condition_status_invalid:${condition.key}`)
    if (condition.ownerRole === R.unassigned) errors.push(`bank_condition_owner_required:${condition.key}`)
    if (!condition.dueDate) errors.push(`bank_condition_due_date_required:${condition.key}`)
    if (!condition.evidenceContract?.required?.length) errors.push(`bank_condition_evidence_contract_required:${condition.key}`)
    if (condition.status === S.satisfied && condition.evidenceContract?.evidenceSatisfied !== true) errors.push(`satisfied_condition_evidence_incomplete:${condition.key}`)
    if (condition.status === S.waived && !condition.waiverReason) errors.push(`waived_condition_reason_required:${condition.key}`)
    if (condition.blockerState === B.blocking) warnings.push(`open_bank_blocking_condition:${condition.key}`)
    if (condition.dueState === D.overdue && !condition.resolved) warnings.push(`overdue_bank_condition:${condition.key}`)
    condition.evidenceContract?.evidenceGaps?.forEach((gap) => warnings.push(`condition_evidence_gap:${condition.key}:${gap}`))
  })

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(unique(errors)),
    warnings: Object.freeze(unique(warnings)),
  })
}

export function buildBondConditionNextActions(register = {}) {
  return Object.freeze((register.conditions || [])
    .map(buildNextAction)
    .filter(Boolean)
    .sort((left, right) => {
      const priorityRank = { high: 0, normal: 1 }
      const blockerRank = { [B.blocking]: 0, [B.attention]: 1, [B.monitor]: 2, [B.resolved]: 3 }
      return (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9) ||
        (blockerRank[left.blockerState] ?? 9) - (blockerRank[right.blockerState] ?? 9) ||
        text(left.dueDate || '9999-12-31').localeCompare(text(right.dueDate || '9999-12-31')) ||
        left.conditionKey.localeCompare(right.conditionKey)
    }))
}

export function buildBondConditionScheduleModel(register = {}) {
  return buildScheduleModel({ register })
}

export function buildBondConditionRegister({
  workspace = null,
  transaction = {},
  lane = {},
  evidence = {},
  conditions = null,
  actor = {},
  commandId = 'bond-condition-register',
  generatedAt = new Date().toISOString(),
  asOf = generatedAt,
} = {}) {
  const effectiveWorkspace = workspace || buildBondPackWorkspace({ transaction, lane, evidence, generatedAt })
  const workspaceValidation = validateBondPackWorkspace(effectiveWorkspace)
  const bankConditionsFact = effectiveWorkspace.canonicalData?.factsByKey?.bank_conditions || null
  const conditionSource = conditions === null || conditions === undefined ? bankConditionsFact?.value : conditions
  const normalizedConditions = Object.freeze(asArray(conditionSource).map((condition, index) => normalizeCondition(condition, index, { asOf })).sort(conditionSort))
  const metrics = buildMetrics(normalizedConditions)
  const conditionFingerprint = buildConditionFingerprint(normalizedConditions)
  const shell = Object.freeze({
    version: BOND_ATTORNEY_PHASE5_VERSION,
    releaseBlockerId: BOND_ATTORNEY_PHASE5_RELEASE_BLOCKER_ID,
    workspaceId: effectiveWorkspace.workspaceId,
    transactionId: effectiveWorkspace.transactionId,
    laneKey: 'bond',
    generatedAt,
    asOf,
    bankConditionsFactStatus: bankConditionsFact?.status || BOND_ATTORNEY_PHASE2_FACT_STATUSES.missing,
    bankConditionsFactFingerprint: bankConditionsFact?.fingerprint || null,
    workspaceValidation,
    conditions: normalizedConditions,
    metrics,
    conditionFingerprint,
    controls: BOND_BANK_CONDITION_CONTROL_BOUNDARY,
    readyForPhase6: false,
  })
  const validation = validateBondConditionRegister(shell)
  const nextActions = buildBondConditionNextActions(shell)
  const readyForPhase6 = validation.valid &&
    metrics.conditionCount > 0 &&
    metrics.structuredConditionCount === metrics.conditionCount &&
    metrics.blockingOpenCount === 0 &&
    metrics.evidenceGapCount === 0 &&
    metrics.missingOwnerCount === 0 &&
    metrics.missingDueDateCount === 0 &&
    metrics.rejectedEvidenceCount === 0
  const register = Object.freeze({
    ...shell,
    validation,
    nextActions,
    scheduleModel: buildScheduleModel({ register: { ...shell, nextActions } }),
    readyForPhase6,
  })
  return Object.freeze({
    ...register,
    auditEvent: buildAuditEvent({ workspace: effectiveWorkspace, register, actor, commandId, occurredAt: generatedAt }),
  })
}

export function buildBondAttorneyPhase5BaselineReport(input = {}) {
  const register = buildBondConditionRegister(input)
  return Object.freeze({
    version: BOND_ATTORNEY_PHASE5_VERSION,
    releaseBlockerId: BOND_ATTORNEY_PHASE5_RELEASE_BLOCKER_ID,
    conditionCount: register.metrics.conditionCount,
    structuredConditionCount: register.metrics.structuredConditionCount,
    blockingOpenCount: register.metrics.blockingOpenCount,
    evidenceGapCount: register.metrics.evidenceGapCount,
    overdueOpenCount: register.metrics.overdueOpenCount,
    validation: register.validation,
    nextActionCount: register.nextActions.length,
    controls: register.controls,
    readyForPhase6: register.readyForPhase6,
  })
}
