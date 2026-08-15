import { buildCanonicalDocumentRequestAudiencePlan } from '../../../../core/documents/documentRequestCanonicalPlanner.js'
import { buildDocumentRequestContainerModel } from '../../../../core/documents/documentRequestContainerModel.js'
import { resolveBondApplicationDocumentRequirements } from './resolveBondApplicationDocumentRequirements.js'
import { BOND_APPLICATION_DOCUMENT_TIMING } from './bondApplicationDocumentRules.js'

export const BOND_APPLICATION_CANONICAL_DOCUMENT_MODEL_VERSION = 'bond_application_canonical_document_model_v1'
export const BOND_APPLICATION_CHILD_CONTAINER_POLICY_VERSION = 'bond_application_child_container_policy_v1'

export const BOND_APPLICATION_CANONICAL_PARENT_KEYS = Object.freeze({
  identity: 'buyer_id_document',
  address: 'buyer_proof_of_address',
  legal: 'bond_application_legal_documents',
  proofOfFunds: 'income_affordability_documents',
  affordability: 'income_affordability_documents',
})

const LEGAL_CHILD_TYPES = new Set([
  'offer_to_purchase',
  'marriage_certificate',
  'antenuptial_contract',
  'buyer_company_registration',
  'buyer_company_resolution',
  'buyer_director_identity_documents',
  'buyer_company_beneficial_ownership',
  'buyer_trust_deed',
  'buyer_letters_of_authority',
  'buyer_trustee_identity_documents',
  'buyer_trust_resolution',
  'buyer_trust_beneficial_ownership',
  'surety_undertaking',
])

const FINANCE_CHILD_TYPES = new Set([
  'bank_statements',
  'personal_bank_statements',
  'business_bank_statements',
  'proof_of_funds',
  'payslips',
  'employment_contract',
  'buyer_company_financial_statements',
  'buyer_company_tax_documents',
  'financial_statements',
  'management_accounts',
  'accountant_letter',
  'tax_documents',
  'assets_liabilities_statement',
  'commission_income_evidence',
  'contract_income_history',
  'pension_income_evidence',
  'rental_income_evidence',
  'maintenance_income_evidence',
  'investment_income_evidence',
  'trust_income_evidence',
  'proof_of_income',
  'property_finance_existing_bond',
  'debt_settlement_letter',
  'credit_history_supporting_documents',
])

const BOND_ORIGINATOR_VISIBLE_PARENT_KEYS = new Set([
  'bond_approval',
  'grant_signed',
  'bond_application_legal_documents',
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
  if (requirementKey === 'bond_application_business_registration') return BOND_APPLICATION_CANONICAL_PARENT_KEYS.affordability
  if (LEGAL_CHILD_TYPES.has(canonicalType)) return BOND_APPLICATION_CANONICAL_PARENT_KEYS.legal
  if (FINANCE_CHILD_TYPES.has(canonicalType)) return BOND_APPLICATION_CANONICAL_PARENT_KEYS.affordability
  if (requirementKey.includes('income') || requirementKey.includes('bank_statement') || requirementKey.includes('credit')) {
    return BOND_APPLICATION_CANONICAL_PARENT_KEYS.affordability
  }
  return ''
}

function canonicalParentLabel(parentKey = '') {
  if (parentKey === 'buyer_id_document') return 'Buyer ID / Passport'
  if (parentKey === 'buyer_proof_of_address') return 'Buyer Proof of Address'
  if (parentKey === 'bond_application_legal_documents') return 'Application Legal Documents'
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
    allowMultipleFiles: Boolean(requirement.allowMultipleFiles),
    evidencePeriodMonths: requirement.evidencePeriodMonths || null,
    evidencePeriodYears: requirement.evidencePeriodYears || null,
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

function buildChildRows(children = []) {
  return children
    .filter((child) => child.canonicalParentKey === BOND_APPLICATION_CANONICAL_PARENT_KEYS.affordability)
    .map((child, index) => Object.freeze({
      id: `bond_child_${child.key}`,
      document_key: child.key,
      document_label: child.title || child.key,
      requested_from: 'buyer',
      visibility_scope: 'client_visible',
      status: child.required ? 'missing' : 'not_applicable',
      is_required: child.required,
      group_key: 'bond_application_documents',
      group_label: child.category || 'Bond application documents',
      sort_order: 100 + index + 1,
      parent_document_key: child.canonicalParentKey,
      child_requirement_key: child.key,
      child_container: true,
      originatorVisible: child.originatorVisible,
    }))
}

function buildUploadRows(parentRows = [], childRows = []) {
  const splitParentKeys = new Set(childRows.map((row) => row.parent_document_key).filter(Boolean))
  return Object.freeze([
    ...parentRows
      .filter((row) => !splitParentKeys.has(row.document_key))
      .map((row) => Object.freeze({
        ...row,
        parent_container: true,
      })),
    ...childRows,
  ])
}

function buildCanonicalScenarioFromBondApplication(applicationState = {}) {
  return Object.freeze({
    buyerEntityType: applicationState?.application?.buyerEntity?.entityType || 'individual',
    financeType: applicationState?.application?.finance?.financeType || 'bond',
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
  const childRows = buildChildRows(children)
  const uploadRows = buildUploadRows(parentRows, childRows)
  const buyerContainerModel = buildDocumentRequestContainerModel({
    transactionId: applicationState?.application?.transactionId || '',
    audience: 'buyer',
    requiredDocuments: uploadRows,
    additionalRequests,
  })
  const bondOriginatorContainerModel = buildDocumentRequestContainerModel({
    transactionId: applicationState?.application?.transactionId || '',
    audience: 'bond_originator',
    requiredDocuments: uploadRows.filter((row) => row.originatorVisible),
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
    childRows: Object.freeze(childRows),
    uploadRows,
    parentKeys: Object.freeze(unique(parentRows.map((row) => row.document_key))),
    childContainerKeys: Object.freeze(unique(childRows.map((row) => row.document_key))),
    uploadContainerKeys: Object.freeze(unique(uploadRows.map((row) => row.document_key))),
    originatorVisibleParentKeys: Object.freeze(parentRows.filter((row) => row.originatorVisible).map((row) => row.document_key)),
    originatorVisibleChildKeys: Object.freeze(childRows.filter((row) => row.originatorVisible).map((row) => row.document_key)),
    splitParentKeys: Object.freeze(unique(childRows.map((row) => row.parent_document_key))),
    byCanonicalParentKey: Object.freeze(countBy(children, (child) => child.canonicalParentKey || 'unmapped')),
    byParticipantRole: Object.freeze(countBy(children, (child) => child.participantRole)),
    byRequiredBefore: Object.freeze(countBy(children, (child) => child.requiredBefore)),
    buyerContainerSummary: buyerContainerModel.summary,
    bondOriginatorContainerSummary: bondOriginatorContainerModel.summary,
    buyerContainerKeys: Object.freeze(buyerContainerModel.containers.map((container) => container.documentKey)),
    bondOriginatorContainerKeys: Object.freeze(bondOriginatorContainerModel.containers.map((container) => container.documentKey)),
    canonicalBondOriginatorPlanKeys: Object.freeze(canonicalPlan.requests.map((request) => request.key)),
    canonicalBondOriginatorRequestableKeys: Object.freeze(
      canonicalPlan.requests.filter((request) => request.requestable).map((request) => request.key),
    ),
    diagnostics: Object.freeze(resolved.diagnostics || []),
  })
}
