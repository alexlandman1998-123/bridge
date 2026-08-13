import {
  DOCUMENT_REQUEST_CANONICAL_MATRIX,
  DOCUMENT_REQUEST_CANONICAL_MATRIX_SOURCE_VERSION,
  DOCUMENT_REQUEST_CANONICAL_MATRIX_VERSION,
  validateDocumentRequestCanonicalMatrix,
} from './documentRequestCanonicalMatrix.js'

export const DOCUMENT_REQUEST_CANONICAL_POLICY_VERSION = 'document_request_canonical_policy_v1'
export const DOCUMENT_REQUEST_CANONICAL_POLICY_SOURCE = 'config/document-request-phase1-legal-checklist.json'

export const CANONICAL_DOCUMENT_REQUEST_ALLOWED_OWNER_ROLES = Object.freeze([
  'agent',
  'buyer',
  'seller',
  'transfer_attorney',
  'cancellation_attorney',
])

export const CANONICAL_DOCUMENT_REQUEST_ALLOWED_VISIBILITIES = Object.freeze([
  'client_visible',
  'professional_shared',
  'internal_only',
])

export const CANONICAL_DOCUMENT_REQUEST_ALLOWED_LEVELS = Object.freeze([
  'required',
  'conditional',
  'pending_policy_required',
  'pending_policy_required_unless_waived',
])

export const CANONICAL_DOCUMENT_REQUEST_ALLOWED_BLOCKERS = Object.freeze([
  'attorney_instruction_ready',
  'finance_ready',
  'lodgement_ready',
  'registration_ready',
])

export const CANONICAL_DOCUMENT_REQUEST_DEFERRED_KEYS = Object.freeze([
  'property_acquisition_record',
  'capital_improvement_records',
])

const CLIENT_OWNER_ROLES = new Set(['buyer', 'seller'])
const PROFESSIONAL_OWNER_ROLES = new Set(['agent', 'transfer_attorney', 'cancellation_attorney'])
const PENDING_POLICY_SIGNOFF_GROUPS = Object.freeze({
  buyer_anc_document: 'buyer_anc_document',
  buyer_company_beneficial_ownership: 'company_beneficial_ownership',
  seller_company_beneficial_ownership: 'company_beneficial_ownership',
  buyer_trust_beneficial_ownership: 'trust_beneficial_ownership',
  seller_trust_beneficial_ownership: 'trust_beneficial_ownership',
})
const ACTIVE_REQUIRED_SIGNOFF_GROUPS = Object.freeze({
  seller_bank_account_confirmation: 'seller_bank_confirmation',
  seller_tax_number: 'seller_income_tax_number',
  electrical_compliance_certificate: 'electrical_coc',
  gas_compliance_certificate: 'conditional_compliance_certificates',
  electric_fence_certificate: 'conditional_compliance_certificates',
  water_installation_certificate: 'conditional_compliance_certificates',
  beetle_certificate: 'conditional_compliance_certificates',
  solar_compliance_documents: 'conditional_compliance_certificates',
  approved_building_plans: 'conditional_compliance_certificates',
  occupation_certificate: 'conditional_compliance_certificates',
})

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function countBy(items = [], resolver = (item) => item) {
  return items.reduce((acc, item) => {
    const key = resolver(item) || 'unknown'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function isPendingPolicyLevel(level = '') {
  return normalizeKey(level).startsWith('pending_policy_')
}

function signoffDecisionByKey(matrix = DOCUMENT_REQUEST_CANONICAL_MATRIX) {
  return new Map((matrix.signoffDecisions || []).map((decision) => [decision.key, decision]))
}

function pushIssue(issues, severity, code, message, context = {}) {
  issues.push(Object.freeze({ severity, code, message, ...context }))
}

export function classifyCanonicalDocumentRequestPolicyRequirement(requirement = {}, matrix = DOCUMENT_REQUEST_CANONICAL_MATRIX) {
  const decisionMap = signoffDecisionByKey(matrix)
  const pendingPolicy = isPendingPolicyLevel(requirement.level)
  const signoffKey = pendingPolicy
    ? PENDING_POLICY_SIGNOFF_GROUPS[requirement.key] || requirement.key
    : ACTIVE_REQUIRED_SIGNOFF_GROUPS[requirement.key] || null
  const signoffDecision = signoffKey ? decisionMap.get(signoffKey) || null : null

  return Object.freeze({
    key: requirement.key,
    pendingPolicy,
    requestableByDefault: !pendingPolicy,
    signoffKey,
    signoffStatus: signoffDecision?.status || null,
    approvedForDefaultRequest: !pendingPolicy && (!signoffDecision || signoffDecision.status === 'approved'),
  })
}

export function validateCanonicalDocumentRequestPolicy(matrix = DOCUMENT_REQUEST_CANONICAL_MATRIX) {
  const issues = []
  const matrixValidation = validateDocumentRequestCanonicalMatrix(matrix)
  const requirementKeys = new Set((matrix.requirements || []).map((requirement) => requirement.key))
  const decisionMap = signoffDecisionByKey(matrix)

  for (const error of matrixValidation.errors || []) {
    pushIssue(issues, 'error', 'matrix_contract_error', error)
  }

  for (const requirement of matrix.requirements || []) {
    if (!CANONICAL_DOCUMENT_REQUEST_ALLOWED_OWNER_ROLES.includes(requirement.ownerRole)) {
      pushIssue(issues, 'error', 'unsupported_owner_role', `${requirement.key}: unsupported ownerRole ${requirement.ownerRole}`, {
        requirementKey: requirement.key,
      })
    }
    if (!CANONICAL_DOCUMENT_REQUEST_ALLOWED_OWNER_ROLES.includes(requirement.requestedFrom)) {
      pushIssue(issues, 'error', 'unsupported_requested_from', `${requirement.key}: unsupported requestedFrom ${requirement.requestedFrom}`, {
        requirementKey: requirement.key,
      })
    }
    if (!CANONICAL_DOCUMENT_REQUEST_ALLOWED_LEVELS.includes(requirement.level)) {
      pushIssue(issues, 'error', 'unsupported_level', `${requirement.key}: unsupported level ${requirement.level}`, {
        requirementKey: requirement.key,
      })
    }
    if (!CANONICAL_DOCUMENT_REQUEST_ALLOWED_VISIBILITIES.includes(requirement.visibility)) {
      pushIssue(issues, 'error', 'unsupported_visibility', `${requirement.key}: unsupported visibility ${requirement.visibility}`, {
        requirementKey: requirement.key,
      })
    }
    if (!CANONICAL_DOCUMENT_REQUEST_ALLOWED_BLOCKERS.includes(requirement.blocker)) {
      pushIssue(issues, 'error', 'unsupported_blocker', `${requirement.key}: unsupported blocker ${requirement.blocker}`, {
        requirementKey: requirement.key,
      })
    }
    if (requirement.visibility === 'client_visible' && !CLIENT_OWNER_ROLES.has(requirement.requestedFrom)) {
      pushIssue(issues, 'error', 'client_visible_not_client_owned', `${requirement.key}: client-visible rows must be requested from buyer or seller`, {
        requirementKey: requirement.key,
      })
    }
    if (requirement.visibility === 'professional_shared' && CLIENT_OWNER_ROLES.has(requirement.requestedFrom)) {
      pushIssue(issues, 'warning', 'professional_shared_client_owned', `${requirement.key}: professional-shared row is requested from a client role`, {
        requirementKey: requirement.key,
      })
    }
    if (PROFESSIONAL_OWNER_ROLES.has(requirement.ownerRole) && requirement.visibility === 'client_visible' && !CLIENT_OWNER_ROLES.has(requirement.requestedFrom)) {
      pushIssue(issues, 'error', 'professional_owner_client_visible_without_client_requester', `${requirement.key}: professional-owned client-visible rows need a client requestedFrom role`, {
        requirementKey: requirement.key,
      })
    }
    if (CANONICAL_DOCUMENT_REQUEST_DEFERRED_KEYS.includes(requirement.key)) {
      pushIssue(issues, 'error', 'deferred_key_in_canonical_policy', `${requirement.key}: deferred key must not be part of the canonical policy`, {
        requirementKey: requirement.key,
      })
    }

    const classification = classifyCanonicalDocumentRequestPolicyRequirement(requirement, matrix)
    if (classification.pendingPolicy && !classification.signoffStatus) {
      pushIssue(issues, 'error', 'pending_policy_missing_signoff_decision', `${requirement.key}: pending-policy row has no signoff decision`, {
        requirementKey: requirement.key,
      })
    }
    if (classification.pendingPolicy && classification.signoffStatus === 'approved') {
      pushIssue(issues, 'warning', 'pending_policy_approved_but_not_activated', `${requirement.key}: signoff is approved but level is still pending-policy`, {
        requirementKey: requirement.key,
      })
    }
    if (!classification.pendingPolicy && classification.signoffStatus === 'pending') {
      pushIssue(issues, 'warning', 'active_row_has_pending_related_signoff', `${requirement.key}: active row is related to a pending signoff decision`, {
        requirementKey: requirement.key,
        signoffKey: classification.signoffKey,
      })
    }
  }

  for (const decision of matrix.signoffDecisions || []) {
    const directRequirementExists = requirementKeys.has(decision.key)
    const groupedRequirementExists = Object.values(PENDING_POLICY_SIGNOFF_GROUPS).includes(decision.key) ||
      Object.values(ACTIVE_REQUIRED_SIGNOFF_GROUPS).includes(decision.key)
    if (!directRequirementExists && !groupedRequirementExists) {
      pushIssue(issues, 'warning', 'signoff_decision_without_requirement_anchor', `${decision.key}: signoff decision does not map to a canonical requirement anchor`, {
        signoffKey: decision.key,
      })
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warning')
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    issues: Object.freeze(issues),
  })
}

export function buildCanonicalDocumentRequestPolicyReport(matrix = DOCUMENT_REQUEST_CANONICAL_MATRIX) {
  const validation = validateCanonicalDocumentRequestPolicy(matrix)
  const classifications = (matrix.requirements || []).map((requirement) =>
    classifyCanonicalDocumentRequestPolicyRequirement(requirement, matrix),
  )
  const pendingPolicyKeys = classifications.filter((item) => item.pendingPolicy).map((item) => item.key)
  const requestableByDefaultKeys = classifications.filter((item) => item.requestableByDefault).map((item) => item.key)
  const signoffPendingKeys = (matrix.signoffDecisions || [])
    .filter((decision) => decision.status === 'pending')
    .map((decision) => decision.key)

  return Object.freeze({
    version: DOCUMENT_REQUEST_CANONICAL_POLICY_VERSION,
    source: DOCUMENT_REQUEST_CANONICAL_POLICY_SOURCE,
    matrixVersion: DOCUMENT_REQUEST_CANONICAL_MATRIX_VERSION,
    sourceVersion: DOCUMENT_REQUEST_CANONICAL_MATRIX_SOURCE_VERSION,
    status: validation.ok
      ? signoffPendingKeys.length
        ? 'valid_pending_signoff'
        : 'valid_approved'
      : 'invalid',
    singleSourceOfTruth: true,
    requestablePolicy: 'pending_policy_rows_are_visible_but_not_requestable_by_default',
    counts: Object.freeze({
      requirements: matrix.requirements?.length || 0,
      requestableByDefault: requestableByDefaultKeys.length,
      pendingPolicy: pendingPolicyKeys.length,
      signoffDecisions: matrix.signoffDecisions?.length || 0,
      pendingSignoffDecisions: signoffPendingKeys.length,
      warnings: validation.warnings.length,
      errors: validation.errors.length,
    }),
    byOwnerRole: Object.freeze(countBy(matrix.requirements || [], (requirement) => requirement.ownerRole)),
    byRequestedFrom: Object.freeze(countBy(matrix.requirements || [], (requirement) => requirement.requestedFrom)),
    byVisibility: Object.freeze(countBy(matrix.requirements || [], (requirement) => requirement.visibility)),
    byLevel: Object.freeze(countBy(matrix.requirements || [], (requirement) => requirement.level)),
    byBlocker: Object.freeze(countBy(matrix.requirements || [], (requirement) => requirement.blocker)),
    pendingPolicyKeys: Object.freeze(pendingPolicyKeys),
    requestableByDefaultKeys: Object.freeze(requestableByDefaultKeys),
    signoffPendingKeys: Object.freeze(signoffPendingKeys),
    deferredKeysAbsentFromPolicy: Object.freeze(
      CANONICAL_DOCUMENT_REQUEST_DEFERRED_KEYS.filter((key) => !matrix.requirements?.some((requirement) => requirement.key === key)),
    ),
    signoffAnchors: Object.freeze(
      unique([
        ...Object.values(PENDING_POLICY_SIGNOFF_GROUPS),
        ...Object.values(ACTIVE_REQUIRED_SIGNOFF_GROUPS),
      ]).sort(),
    ),
    validation,
  })
}
