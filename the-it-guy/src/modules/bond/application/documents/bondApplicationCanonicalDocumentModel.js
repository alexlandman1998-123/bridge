import { buildCanonicalDocumentRequestAudiencePlan } from '../../../../core/documents/documentRequestCanonicalPlanner.js'
import { buildDocumentRequestContainerModel } from '../../../../core/documents/documentRequestContainerModel.js'
import { resolveBondApplicationDocumentRequirements } from './resolveBondApplicationDocumentRequirements.js'
import { BOND_APPLICATION_DOCUMENT_TIMING } from './bondApplicationDocumentRules.js'

export const BOND_APPLICATION_CANONICAL_DOCUMENT_MODEL_VERSION = 'bond_application_canonical_document_model_v1'

export const BOND_APPLICATION_CANONICAL_PARENT_KEYS = Object.freeze({
  identity: 'buyer_id_document',
  address: 'buyer_proof_of_address',
  proofOfFunds: 'income_affordability_documents',
  affordability: 'income_affordability_documents',
})

const FINANCE_CHILD_TYPES = new Set([
  'bank_statements',
  'proof_of_funds',
  'payslips',
  'employment_contract',
  'buyer_company_registration',
  'financial_statements',
  'commission_income_evidence',
  'pension_income_evidence',
  'proof_of_income',
  'property_finance_existing_bond',
  'debt_settlement_letter',
  'credit_history_supporting_documents',
])

const BOND_ORIGINATOR_VISIBLE_PARENT_KEYS = new Set([
  'bond_approval',
  'grant_signed',
  'income_affordability_documents',
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function countBy(items = [], resolver = (item) => item) {
  return items.reduce((acc, item) => {
    const key = resolver(item) || 'unknown'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

export function resolveBondApplicationCanonicalParentKey(requirement = {}) {
  const canonicalType = normalizeKey(requirement.canonicalDocumentType)
  const requirementKey = normalizeKey(requirement.key || requirement.baseRequirementKey)
  if (canonicalType === 'buyer_id_document') return BOND_APPLICATION_CANONICAL_PARENT_KEYS.identity
  if (canonicalType === 'buyer_proof_of_address') return BOND_APPLICATION_CANONICAL_PARENT_KEYS.address
  if (FINANCE_CHILD_TYPES.has(canonicalType)) return BOND_APPLICATION_CANONICAL_PARENT_KEYS.affordability
  if (requirementKey.includes('income') || requirementKey.includes('bank_statement') || requirementKey.includes('credit')) {
    return BOND_APPLICATION_CANONICAL_PARENT_KEYS.affordability
  }
  return ''
}

function canonicalParentLabel(parentKey = '') {
  if (parentKey === 'buyer_id_document') return 'Buyer ID / Passport'
  if (parentKey === 'buyer_proof_of_address') return 'Buyer Proof of Address'
  if (parentKey === 'income_affordability_documents') return 'Income and Affordability Documents'
  return parentKey.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function childRequirementToCanonicalChild(requirement = {}) {
  const canonicalParentKey = resolveBondApplicationCanonicalParentKey(requirement)
  return Object.freeze({
    key: requirement.key,
    baseRequirementKey: requirement.baseRequirementKey || requirement.key,
    title: requirement.title,
    category: requirement.category,
    participantRole: requirement.participantRole,
    participantKey: requirement.participantKey || null,
    canonicalDocumentType: requirement.canonicalDocumentType,
    canonicalParentKey,
    required: requirement.required !== false,
    active: requirement.active !== false,
    requiredBefore: requirement.requiredBefore,
    satisfactionMode: requirement.satisfactionMode,
    minimumFileCount: Math.max(Number(requirement.minimumFileCount || 1), 1),
    originatorVisible: BOND_ORIGINATOR_VISIBLE_PARENT_KEYS.has(canonicalParentKey),
    blocksSignature: requirement.required !== false &&
      requirement.requiredBefore === BOND_APPLICATION_DOCUMENT_TIMING.requiredBeforeSignature,
  })
}

function buildParentRows(children = []) {
  const byParent = new Map()
  for (const child of children) {
    if (!child.canonicalParentKey) continue
    if (!byParent.has(child.canonicalParentKey)) byParent.set(child.canonicalParentKey, [])
    byParent.get(child.canonicalParentKey).push(child)
  }

  return [...byParent.entries()].map(([parentKey, parentChildren], index) => Object.freeze({
    id: `bond_parent_${parentKey}`,
    document_key: parentKey,
    document_label: canonicalParentLabel(parentKey),
    requested_from: 'buyer',
    visibility_scope: 'client_visible',
    status: parentChildren.some((child) => child.required) ? 'missing' : 'not_applicable',
    is_required: parentChildren.some((child) => child.required),
    group_key: 'bond_application_documents',
    group_label: 'Bond application documents',
    sort_order: index + 1,
    childRequirementKeys: Object.freeze(parentChildren.map((child) => child.key)),
    childRequiredCount: parentChildren.filter((child) => child.required).length,
    originatorVisible: BOND_ORIGINATOR_VISIBLE_PARENT_KEYS.has(parentKey),
  }))
}

function buildCanonicalScenarioFromBondApplication(applicationState = {}) {
  return Object.freeze({
    buyerEntityType: 'individual',
    financeType: 'bond',
    __includeBuyerCanonicalRequests: true,
  })
}

export function buildBondApplicationCanonicalDocumentModel({
  applicationState = {},
  participantRole = 'primary_applicant',
  participantContext = null,
  additionalRequests = [],
} = {}) {
  const resolved = resolveBondApplicationDocumentRequirements({
    applicationState,
    participantRole,
    participantContext,
  })
  const children = resolved.activeRequirements.map(childRequirementToCanonicalChild)
  const unmappedChildren = children.filter((child) => !child.canonicalParentKey)
  const parentRows = buildParentRows(children)
  const buyerContainerModel = buildDocumentRequestContainerModel({
    transactionId: applicationState?.application?.transactionId || '',
    audience: 'buyer',
    requiredDocuments: parentRows,
    additionalRequests,
  })
  const bondOriginatorContainerModel = buildDocumentRequestContainerModel({
    transactionId: applicationState?.application?.transactionId || '',
    audience: 'bond_originator',
    requiredDocuments: parentRows.filter((row) => row.originatorVisible),
    additionalRequests,
  })
  const canonicalPlan = buildCanonicalDocumentRequestAudiencePlan(buildCanonicalScenarioFromBondApplication(applicationState), 'bond_originator')

  return Object.freeze({
    version: BOND_APPLICATION_CANONICAL_DOCUMENT_MODEL_VERSION,
    ruleSetVersion: resolved.ruleSetVersion,
    participantRole: participantContext?.participantRole || participantRole,
    participantKey: participantContext?.participantKey || null,
    canonicalScenario: buildCanonicalScenarioFromBondApplication(applicationState),
    activeChildRequirementCount: children.length,
    requiredChildRequirementCount: children.filter((child) => child.required).length,
    children: Object.freeze(children),
    unmappedChildren: Object.freeze(unmappedChildren),
    parentRows: Object.freeze(parentRows),
    parentKeys: Object.freeze(unique(parentRows.map((row) => row.document_key))),
    originatorVisibleParentKeys: Object.freeze(parentRows.filter((row) => row.originatorVisible).map((row) => row.document_key)),
    byCanonicalParentKey: Object.freeze(countBy(children, (child) => child.canonicalParentKey || 'unmapped')),
    byParticipantRole: Object.freeze(countBy(children, (child) => child.participantRole)),
    byRequiredBefore: Object.freeze(countBy(children, (child) => child.requiredBefore)),
    buyerContainerSummary: buyerContainerModel.summary,
    bondOriginatorContainerSummary: bondOriginatorContainerModel.summary,
    canonicalBondOriginatorPlanKeys: Object.freeze(canonicalPlan.requests.map((request) => request.key)),
    canonicalBondOriginatorRequestableKeys: Object.freeze(
      canonicalPlan.requests.filter((request) => request.requestable).map((request) => request.key),
    ),
    diagnostics: Object.freeze(resolved.diagnostics || []),
  })
}
