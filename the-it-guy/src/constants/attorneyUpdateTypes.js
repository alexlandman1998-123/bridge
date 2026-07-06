import { normalizeAttorneyTransactionRole, normalizeAttorneyVisibility } from './attorneyPermissions.js'
import { getAttorneyWorkflowUpdateOptions, normalizeAttorneyStageKey } from './attorneyWorkflowStages.js'
import { resolveTransactionFacts } from '../services/attorneyWorkflow/transactionFactsResolver.js'

export const ATTORNEY_UPDATE_VISIBILITIES = {
  internal: 'internal',
  professionalShared: 'professional_shared',
  clientVisible: 'client_visible',
}

const ALL_FINANCE_TYPES = ['cash', 'bond', 'hybrid', 'unknown']
const ALL_TRANSACTION_TYPES = ['development_sale', 'private_sale', 'resale', 'commercial', 'unknown']
const ALL_ENTITY_TYPES = ['individual', 'company', 'trust', 'unknown']

function updateType({
  id,
  label,
  category,
  attorneyRole,
  laneKey,
  defaultVisibility = ATTORNEY_UPDATE_VISIBILITIES.professionalShared,
  clientVisibleAllowed = true,
  requiresNote = false,
  description = '',
  aliases = [],
  appliesWhen = {},
}) {
  return {
    id,
    label,
    category,
    attorneyRole,
    laneKey,
    defaultVisibility,
    clientVisibleAllowed,
    requiresNote,
    description,
    aliases,
    appliesWhen: {
      financeTypes: appliesWhen.financeTypes || ALL_FINANCE_TYPES,
      transactionTypes: appliesWhen.transactionTypes || ALL_TRANSACTION_TYPES,
      buyerEntityTypes: appliesWhen.buyerEntityTypes || ALL_ENTITY_TYPES,
      sellerEntityTypes: appliesWhen.sellerEntityTypes || ALL_ENTITY_TYPES,
      requiresCancellation: appliesWhen.requiresCancellation || false,
    },
  }
}

const transfer = (id, label, overrides = {}) =>
  updateType({
    id,
    label,
    category: 'transfer',
    attorneyRole: 'transfer_attorney',
    laneKey: 'transfer',
    ...overrides,
  })

const bond = (id, label, overrides = {}) =>
  updateType({
    id,
    label,
    category: 'bond',
    attorneyRole: 'bond_attorney',
    laneKey: 'bond',
    appliesWhen: { financeTypes: ['bond', 'hybrid'], ...(overrides.appliesWhen || {}) },
    ...overrides,
  })

const cancellation = (id, label, overrides = {}) =>
  updateType({
    id,
    label,
    category: 'cancellation',
    attorneyRole: 'cancellation_attorney',
    laneKey: 'cancellation',
    appliesWhen: { requiresCancellation: true, ...(overrides.appliesWhen || {}) },
    ...overrides,
  })

const entity = (id, label, appliesWhen, overrides = {}) =>
  updateType({
    id,
    label,
    category: 'entity',
    attorneyRole: 'transfer_attorney',
    laneKey: 'transfer',
    defaultVisibility: ATTORNEY_UPDATE_VISIBILITIES.internal,
    clientVisibleAllowed: false,
    appliesWhen,
    ...overrides,
  })

const workflowUpdatesForLane = (laneKey, builder) =>
  getAttorneyWorkflowUpdateOptions(laneKey).map((option) =>
    builder(option.id, option.label, {
      defaultVisibility: option.defaultVisibility,
      clientVisibleAllowed: option.clientVisibleAllowed,
      requiresNote: option.requiresNote,
      description: option.description,
      aliases: option.aliases,
    }),
  )

const TRANSFER_WORKFLOW_UPDATES = workflowUpdatesForLane('transfer', transfer)
const BOND_WORKFLOW_UPDATES = workflowUpdatesForLane('bond', bond)
const CANCELLATION_WORKFLOW_UPDATES = workflowUpdatesForLane('cancellation', cancellation)

export const ATTORNEY_UPDATE_TYPES = [
  ...TRANSFER_WORKFLOW_UPDATES,
  transfer('buyer_transfer_docs_sent', 'Buyer transfer documents sent'),
  transfer('seller_transfer_docs_sent', 'Seller transfer documents sent'),
  transfer('guarantees_requested', 'Guarantees requested'),

  ...BOND_WORKFLOW_UPDATES,
  bond('buyer_bond_docs_sent', 'Buyer bond documents sent'),
  bond('bank_conditions_outstanding', 'Bank conditions outstanding', {
    defaultVisibility: ATTORNEY_UPDATE_VISIBILITIES.internal,
    clientVisibleAllowed: false,
    requiresNote: true,
  }),
  bond('bank_conditions_resolved', 'Bank conditions resolved'),

  ...CANCELLATION_WORKFLOW_UPDATES,
  cancellation('cancellation_guarantees_requested', 'Cancellation guarantees requested'),
  cancellation('cancellation_complete', 'Cancellation complete'),

  entity('company_resolution_requested', 'Company resolution requested', {
    buyerEntityTypes: ['company'],
    sellerEntityTypes: ['company'],
  }),
  entity('company_resolution_received', 'Company resolution received', {
    buyerEntityTypes: ['company'],
    sellerEntityTypes: ['company'],
  }),
  entity('director_documents_requested', 'Director documents requested', {
    buyerEntityTypes: ['company'],
    sellerEntityTypes: ['company'],
  }),
  entity('director_documents_received', 'Director documents received', {
    buyerEntityTypes: ['company'],
    sellerEntityTypes: ['company'],
  }),
  entity('signing_authority_confirmed', 'Signing authority confirmed', {
    buyerEntityTypes: ['company', 'trust'],
    sellerEntityTypes: ['company', 'trust'],
  }),
  entity('beneficial_ownership_requested', 'Beneficial ownership requested', {
    buyerEntityTypes: ['company', 'trust'],
    sellerEntityTypes: ['company', 'trust'],
  }),
  entity('beneficial_ownership_received', 'Beneficial ownership received', {
    buyerEntityTypes: ['company', 'trust'],
    sellerEntityTypes: ['company', 'trust'],
  }),
  entity('trust_deed_requested', 'Trust deed requested', {
    buyerEntityTypes: ['trust'],
    sellerEntityTypes: ['trust'],
  }),
  entity('trust_deed_received', 'Trust deed received', {
    buyerEntityTypes: ['trust'],
    sellerEntityTypes: ['trust'],
  }),
  entity('letters_of_authority_requested', 'Letters of authority requested', {
    buyerEntityTypes: ['trust'],
    sellerEntityTypes: ['trust'],
  }),
  entity('letters_of_authority_received', 'Letters of authority received', {
    buyerEntityTypes: ['trust'],
    sellerEntityTypes: ['trust'],
  }),
  entity('trustee_resolution_requested', 'Trustee resolution requested', {
    buyerEntityTypes: ['trust'],
    sellerEntityTypes: ['trust'],
  }),
  entity('trustee_resolution_received', 'Trustee resolution received', {
    buyerEntityTypes: ['trust'],
    sellerEntityTypes: ['trust'],
  }),
  entity('trustee_documents_requested', 'Trustee documents requested', {
    buyerEntityTypes: ['trust'],
    sellerEntityTypes: ['trust'],
  }),
  entity('trustee_documents_received', 'Trustee documents received', {
    buyerEntityTypes: ['trust'],
    sellerEntityTypes: ['trust'],
  }),
  entity('marital_status_confirmed', 'Marital status confirmed', {
    buyerEntityTypes: ['individual'],
    sellerEntityTypes: ['individual'],
  }),
  entity('spouse_signature_required', 'Spouse signature required', {
    buyerEntityTypes: ['individual'],
    sellerEntityTypes: ['individual'],
  }, {
    defaultVisibility: ATTORNEY_UPDATE_VISIBILITIES.professionalShared,
    clientVisibleAllowed: true,
  }),
  entity('spouse_signature_received', 'Spouse signature received', {
    buyerEntityTypes: ['individual'],
    sellerEntityTypes: ['individual'],
  }, {
    defaultVisibility: ATTORNEY_UPDATE_VISIBILITIES.professionalShared,
    clientVisibleAllowed: true,
  }),
  entity('anc_requested', 'ANC requested', {
    buyerEntityTypes: ['individual'],
    sellerEntityTypes: ['individual'],
  }),
  entity('anc_received', 'ANC received', {
    buyerEntityTypes: ['individual'],
    sellerEntityTypes: ['individual'],
  }),
]

export function getAttorneyUpdateType(updateTypeId) {
  const normalized = String(updateTypeId || '').trim()
  const direct = ATTORNEY_UPDATE_TYPES.find((type) => type.id === normalized || type.aliases?.includes(normalized))
  if (direct) return direct
  const canonicalStageKey = normalizeAttorneyStageKey(normalized)
  return ATTORNEY_UPDATE_TYPES.find((type) => type.id === canonicalStageKey || type.aliases?.includes(canonicalStageKey)) || null
}

function matchesOneOf(value, allowed = []) {
  if (!allowed?.length) return true
  return allowed.includes(value)
}

function entityApplies(facts, updateTypeDefinition) {
  const appliesWhen = updateTypeDefinition.appliesWhen || {}
  const buyerApplies = matchesOneOf(facts.buyerEntityType, appliesWhen.buyerEntityTypes)
  const sellerApplies = matchesOneOf(facts.sellerEntityType, appliesWhen.sellerEntityTypes)
  const buyerRestricted = appliesWhen.buyerEntityTypes?.length && !appliesWhen.buyerEntityTypes.includes('unknown')
  const sellerRestricted = appliesWhen.sellerEntityTypes?.length && !appliesWhen.sellerEntityTypes.includes('unknown')

  if (buyerRestricted && sellerRestricted) return buyerApplies || sellerApplies
  if (buyerRestricted) return buyerApplies
  if (sellerRestricted) return sellerApplies
  return buyerApplies && sellerApplies
}

export function attorneyUpdateTypeApplies(updateTypeDefinition, facts) {
  if (!updateTypeDefinition || !facts) return false
  const appliesWhen = updateTypeDefinition.appliesWhen || {}
  if (!matchesOneOf(facts.financeType, appliesWhen.financeTypes)) return false
  if (!matchesOneOf(facts.transactionType, appliesWhen.transactionTypes)) return false
  if (appliesWhen.requiresCancellation && !facts.requiresCancellationAttorney) return false
  if (updateTypeDefinition.attorneyRole === 'bond_attorney' && !facts.requiresBondAttorney) return false
  if (updateTypeDefinition.attorneyRole === 'cancellation_attorney' && !facts.requiresCancellationAttorney) return false
  return entityApplies(facts, updateTypeDefinition)
}

function groupLabelForCategory(category) {
  const labels = {
    transfer: 'Transfer Updates',
    bond: 'Bond Updates',
    cancellation: 'Cancellation Updates',
    entity: 'Entity Updates',
  }
  return labels[category] || 'Other Updates'
}

export function resolveAttorneyUpdateOptions(transactionOrFacts = {}, attorneyRole = 'transfer_attorney') {
  const facts = transactionOrFacts?.rawFieldsUsed ? transactionOrFacts : resolveTransactionFacts(transactionOrFacts)
  const role = normalizeAttorneyTransactionRole(attorneyRole)
  const options = ATTORNEY_UPDATE_TYPES
    .filter((type) => type.attorneyRole === role)
    .filter((type) => attorneyUpdateTypeApplies(type, facts))
    .map((type) => ({
      ...type,
      defaultVisibility: normalizeAttorneyVisibility(type.defaultVisibility),
    }))

  const groupsByCategory = options.reduce((accumulator, option) => {
    const key = option.category || 'other'
    if (!accumulator[key]) {
      accumulator[key] = {
        label: groupLabelForCategory(key),
        category: key,
        options: [],
      }
    }
    accumulator[key].options.push(option)
    return accumulator
  }, {})

  return {
    groups: Object.values(groupsByCategory),
    warnings: [...(facts.confidenceWarnings || [])],
  }
}
