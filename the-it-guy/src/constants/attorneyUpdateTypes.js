import { normalizeAttorneyTransactionRole, normalizeAttorneyVisibility } from './attorneyPermissions.js'
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

export const ATTORNEY_UPDATE_TYPES = [
  transfer('instruction_received', 'Instruction received'),
  transfer('fica_requested', 'FICA requested'),
  transfer('fica_received', 'FICA received'),
  transfer('transfer_documents_prepared', 'Transfer documents prepared'),
  transfer('buyer_transfer_docs_sent', 'Buyer transfer documents sent'),
  transfer('seller_transfer_docs_sent', 'Seller transfer documents sent'),
  transfer('buyer_signed_transfer_docs', 'Buyer signed transfer documents'),
  transfer('seller_signed_transfer_docs', 'Seller signed transfer documents'),
  transfer('guarantees_requested', 'Guarantees requested'),
  transfer('guarantees_received', 'Guarantees received'),
  transfer('rates_clearance_requested', 'Rates clearance requested'),
  transfer('rates_clearance_received', 'Rates clearance received'),
  transfer('levy_clearance_requested', 'Levy clearance requested'),
  transfer('levy_clearance_received', 'Levy clearance received'),
  transfer('lodgement_ready', 'Lodgement ready'),
  transfer('lodged_at_deeds_office', 'Lodged at Deeds Office'),
  transfer('in_prep', 'In prep'),
  transfer('registered', 'Registered'),
  transfer('registration_confirmed', 'Registration confirmed'),

  bond('bond_instruction_received', 'Bond instruction received'),
  bond('bank_requirements_confirmed', 'Bank requirements confirmed'),
  bond('bond_documents_prepared', 'Bond documents prepared'),
  bond('buyer_bond_docs_sent', 'Buyer bond documents sent'),
  bond('buyer_signed_bond_docs', 'Buyer signed bond documents'),
  bond('guarantees_issued', 'Guarantees issued'),
  bond('bond_lodgement_ready', 'Bond lodgement ready'),
  bond('bond_lodged', 'Bond lodged'),
  bond('bond_registered', 'Bond registered'),
  bond('bank_conditions_outstanding', 'Bank conditions outstanding', {
    defaultVisibility: ATTORNEY_UPDATE_VISIBILITIES.internal,
    clientVisibleAllowed: false,
    requiresNote: true,
  }),
  bond('bank_conditions_resolved', 'Bank conditions resolved'),

  cancellation('cancellation_instruction_received', 'Cancellation instruction received'),
  cancellation('cancellation_figures_requested', 'Cancellation figures requested'),
  cancellation('cancellation_figures_received', 'Cancellation figures received'),
  cancellation('cancellation_guarantees_requested', 'Cancellation guarantees requested'),
  cancellation('cancellation_guarantees_accepted', 'Cancellation guarantees accepted'),
  cancellation('cancellation_documents_prepared', 'Cancellation documents prepared'),
  cancellation('cancellation_lodged', 'Cancellation lodged'),
  cancellation('cancellation_registered', 'Cancellation registered'),
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
  return ATTORNEY_UPDATE_TYPES.find((type) => type.id === normalized) || null
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
