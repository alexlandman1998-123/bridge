import { resolveLegalTemplateGovernance } from './legalTemplateGovernance.js'
import {
  listLegalDocumentPreviewScenarios,
  resolveLegalDocumentPreviewScenario,
} from './legalDocumentPreviewScenarios.js'
import { evaluateVisibilityRules } from './sectionVisibilityRules.js'

export const LEGAL_DOCUMENT_OUTLINE_GROUPS = Object.freeze([
  Object.freeze({
    key: 'parties',
    label: 'Buyer & seller',
    description: 'The people and legal entities entering the agreement.',
  }),
  Object.freeze({
    key: 'property',
    label: 'Property',
    description: 'The property, title and occupation details.',
  }),
  Object.freeze({
    key: 'price',
    label: 'Purchase price',
    description: 'Price, deposits, commission and transaction costs.',
  }),
  Object.freeze({
    key: 'finance',
    label: 'Finance',
    description: 'Cash, bond finance and finance-related conditions.',
  }),
  Object.freeze({
    key: 'conditions',
    label: 'Terms & conditions',
    description: 'The remaining legal terms and situation-specific wording.',
  }),
  Object.freeze({
    key: 'signatures',
    label: 'Signatures',
    description: 'Signature, initial and execution requirements.',
  }),
])

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
}

function includesAny(value = '', patterns = []) {
  return patterns.some((pattern) => value.includes(pattern))
}

export function getLegalDocumentOutlineGroupKey(block = {}) {
  const key = normalizeKey(`${block.key || ''}_${block.label || ''}`)
  if (block.classification?.signing || includesAny(key, ['signature', 'signing', 'execution', 'initial'])) return 'signatures'
  if (includesAny(key, ['finance', 'bond', 'mortgage', 'cash_sale', 'cash_purchase'])) return 'finance'
  if (includesAny(key, ['purchase_price', 'deposit', 'commission', 'cost', 'tax', 'vat', 'price'])) return 'price'
  if (includesAny(key, ['property', 'sectional', 'title', 'scheme', 'estate', 'hoa', 'occupation', 'risk_transfer'])) return 'property'
  if (includesAny(key, [
    'buyer',
    'seller',
    'purchaser',
    'parties',
    'party',
    'spouse',
    'trustee',
    'authority',
    'capacity',
  ])) return 'parties'
  return 'conditions'
}

export function buildLegalDocumentOutlineGroups(blocks = []) {
  const rows = Array.isArray(blocks) ? blocks : []
  return LEGAL_DOCUMENT_OUTLINE_GROUPS.map((group) => ({
    ...group,
    blocks: rows.filter((block) => getLegalDocumentOutlineGroupKey(block) === group.key),
  }))
}

export function resolveLegalDocumentWorkspaceSelectedBlockId(blocks = [], {
  blockId = '',
  area = '',
} = {}) {
  const rows = Array.isArray(blocks) ? blocks : []
  if (rows.some((block) => block.id === blockId)) return blockId
  const normalizedArea = normalizeKey(area)
  const areaMatch = normalizedArea === 'conditions'
    ? rows.find((block) => block.classification?.conditional)
    : normalizedArea === 'signatures'
      ? rows.find((block) => block.classification?.signing)
      : normalizedArea === 'content'
        ? rows.find((block) => block.classification?.standard)
        : null
  return areaMatch?.id || rows[0]?.id || null
}

export function formatLegalDocumentFieldLabel(value = '') {
  const normalized = String(value || '')
    .replace(/^.*\./, '')
    .replace(/[_-]+/g, ' ')
    .trim()
  return normalized ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Document field'
}

function formatConditionValue(value) {
  if (Array.isArray(value)) return value.map(formatConditionValue).join(', ')
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return formatLegalDocumentFieldLabel(String(value || 'value'))
}

export function describeLegalDocumentCondition(condition = {}) {
  if (!condition || typeof condition !== 'object' || condition.enabled === false) return 'Always included'
  const firstRule = Array.isArray(condition.rules) ? condition.rules[0] : null
  const source = firstRule && typeof firstRule === 'object' ? firstRule : condition
  const field = source.field || source.key || source.placeholder || source.placeholderKey
  if (!field) return 'When conditions match'
  const operatorLabels = {
    equals: 'is',
    not_equals: 'is not',
    in: 'is one of',
    not_in: 'is not one of',
    truthy: 'is provided',
    falsy: 'is not provided',
    exists: 'is provided',
    not_exists: 'is not provided',
  }
  const operator = operatorLabels[normalizeKey(source.operator)] || 'matches'
  if (['is provided', 'is not provided'].includes(operator)) {
    return `${formatLegalDocumentFieldLabel(field)} ${operator}`
  }
  return `${formatLegalDocumentFieldLabel(field)} ${operator} ${formatConditionValue(source.value)}`
}

export function buildLegalDocumentReviewModel({
  template = null,
  blocks = [],
  dirty = false,
  editPermission = {},
  publication = {},
} = {}) {
  const status = template ? resolveLegalTemplateGovernance(template).status : 'missing'
  const rows = Array.isArray(blocks) ? blocks : []
  const emptyRequiredBlocks = rows.filter((block) => block.required && !String(block.content || '').trim())
  const submissionBlockers = [
    ...(!rows.length ? ['Add document wording before requesting legal review.'] : []),
    ...emptyRequiredBlocks.map((block) => `${block.label} needs wording before legal review.`),
    ...(dirty ? ['Save the latest changes before requesting legal review.'] : []),
    ...(!editPermission.editable && status === 'draft' ? [editPermission.reason || 'You cannot submit this draft.'] : []),
  ]
  const labels = {
    missing: 'Set up required',
    draft: 'Draft in progress',
    attorney_review: 'Legal review requested',
    approved: publication.ready ? 'Approved and release-ready' : 'Legal approval recorded',
    published: 'Published and live',
    superseded: 'Superseded version',
    withdrawn: 'Withdrawn version',
  }
  const action = status === 'draft'
    ? 'submit_review'
    : status === 'attorney_review'
      ? 'return_to_draft'
      : ['approved'].includes(status)
        ? 'open_release'
        : null
  return {
    status,
    label: labels[status] || formatLegalDocumentFieldLabel(status),
    action,
    actionLabel: action === 'submit_review'
      ? 'Request legal review'
      : action === 'return_to_draft'
        ? 'Return to editing'
        : action === 'open_release'
          ? 'Review and activate'
          : '',
    actionEnabled: action === 'submit_review'
      ? submissionBlockers.length === 0
      : action === 'return_to_draft'
        ? Boolean(editPermission.editable) && !dirty
        : action === 'open_release',
    submissionBlockers,
  }
}

export function buildLegalDocumentScenarioTestResults({
  blocks = [],
  scenarios = listLegalDocumentPreviewScenarios(),
  packetType = 'otp',
  organisationId = null,
} = {}) {
  const rows = Array.isArray(blocks) ? blocks : []
  return (Array.isArray(scenarios) ? scenarios : []).map((scenario) => {
    const resolved = resolveLegalDocumentPreviewScenario({
      scenarioKey: scenario.key,
      packetType,
      organisationId,
    })
    const placeholders = {
      ...resolved.context,
      ...(resolved.profile?.routingPlaceholders || {}),
      ...(resolved.profile?.placeholders || {}),
    }
    const decisions = rows.map((block) => ({
      id: block.id,
      label: block.label,
      conditional: Boolean(block.classification?.conditional),
      included: !block.classification?.conditional || evaluateVisibilityRules(block.condition, placeholders),
    }))
    const conditional = decisions.filter((decision) => decision.conditional)
    return {
      key: scenario.key,
      label: scenario.label,
      description: scenario.description,
      includedCount: decisions.filter((decision) => decision.included).length,
      conditionalIncludedCount: conditional.filter((decision) => decision.included).length,
      conditionalExcludedCount: conditional.filter((decision) => !decision.included).length,
      includedConditionalBlocks: conditional.filter((decision) => decision.included),
      decisions,
    }
  })
}
