import { resolveTransactionFacts } from '../../src/services/attorneyWorkflow/transactionFactsResolver.js'

export const ATTORNEY_LANE_WORKFLOW_KEYS = Object.freeze([
  'attorney_transfer',
  'attorney_bond',
  'seller_bond_cancellation',
])

export const ATTORNEY_LANE_STEP_ALIASES = Object.freeze({
  attorney_transfer: {
    instruction_received: ['instruction_received'],
    transfer_documents_requested: ['fica_requested', 'transfer_documents_requested'],
    transfer_documents_received: ['fica_received', 'transfer_documents_received'],
    transfer_documents_prepared: ['transfer_documents_prepared'],
    transfer_documents_signed: ['buyer_signed_transfer_documents', 'seller_signed_transfer_documents', 'signed_transfer_documents'],
    clearance_figures_requested: ['clearances_requested', 'clearance_figures_requested'],
    clearance_figures_received: ['clearances_received', 'rates_clearance_uploaded', 'clearance_figures_received'],
    transfer_duty_requested: ['transfer_duty_requested'],
    transfer_duty_received: ['transfer_duty_received'],
    guarantees_confirmed: ['guarantees_received', 'guarantees_confirmed'],
    ready_for_lodgement: ['lodgement_ready', 'lodgement_pack_prepared'],
    lodged: ['lodgement_submitted', 'lodged'],
    prep_for_registration: ['prep', 'prep_for_registration'],
  },
  attorney_bond: {
    bond_instruction_received: ['bond_instruction_received'],
    bond_documents_requested: ['bond_documents_requested'],
    bond_documents_received: ['bond_documents_received'],
    bond_documents_prepared: ['bond_documents_prepared'],
    bond_documents_signed: ['buyer_signed_bond_documents', 'bond_documents_signed'],
    bank_conditions_received: ['bank_requirements_confirmed', 'bank_conditions_reviewed', 'bank_conditions_received'],
    bank_conditions_satisfied: ['grant_signed', 'bank_conditions_satisfied'],
    guarantees_issued: ['guarantees_issued'],
    ready_for_lodgement: ['bond_lodgement_ready', 'bond_lodgement_pack_prepared'],
    lodged: ['bond_lodgement_submitted', 'bond_lodged', 'lodged'],
    prep_for_registration: ['bond_registered', 'prep_for_registration'],
  },
  seller_bond_cancellation: {
    cancellation_instruction_received: ['cancellation_instruction_received'],
    cancellation_figures_requested: ['cancellation_figures_requested'],
    cancellation_figures_received: ['cancellation_figures_received'],
    cancellation_documents_prepared: ['cancellation_documents_prepared'],
    cancellation_documents_signed: ['cancellation_documents_signed'],
    guarantees_received: ['guarantees_accepted', 'guarantees_received'],
    ready_for_lodgement: ['cancellation_lodgement_ready', 'ready_for_lodgement'],
    lodged: ['cancellation_lodged', 'lodged'],
    prep_for_registration: ['cancellation_registered', 'prep_for_registration'],
  },
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function truthy(value) {
  const normalized = normalizeKey(value)
  return ['1', 'true', 'yes', 'y', 'required', 'active', 'assigned'].includes(normalized)
}

function hasLane(readModel = {}, laneKey = '') {
  return (readModel?.lanes || []).some((lane) => normalizeKey(lane?.laneKey) === normalizeKey(laneKey))
}

function hasSignal(transaction = {}, keys = []) {
  return keys.some((key) => {
    const value = transaction?.[key]
    if (typeof value === 'boolean') return value
    return truthy(value) || Boolean(normalizeText(value))
  })
}

export function isBondRegistrationRequired(transaction = {}, options = {}) {
  const facts = options.facts || resolveTransactionFacts(transaction)
  return (
    Boolean(facts.requiresBondAttorney) ||
    hasLane(options.readModel, 'bond') ||
    hasSignal(transaction, [
      'bond_attorney',
      'bond_attorney_assigned',
      'bond_instruction_exists',
      'bond_instruction_received',
      'bond_workspace_id',
      'bond_workspace_unit_id',
      'bond_instruction_id',
    ])
  )
}

export function isSellerBondCancellationRequired(transaction = {}, options = {}) {
  const facts = options.facts || resolveTransactionFacts(transaction)
  return (
    Boolean(facts.requiresCancellationAttorney) ||
    hasLane(options.readModel, 'cancellation') ||
    hasSignal(transaction, [
      'seller_bond_cancellation_required',
      'cancellation_attorney',
      'cancellation_attorney_assigned',
      'cancellation_instruction_exists',
      'cancellation_instruction_received',
      'cancellation_instruction_id',
      'seller_has_existing_bond',
      'existing_bond',
      'cancellation_required',
    ])
  )
}

export function resolveBondLaneReason(transaction = {}, options = {}) {
  const facts = options.facts || resolveTransactionFacts(transaction)
  if (facts.isBondDeal) return 'Bond finance requires a bond registration matter.'
  if (facts.isHybridDeal) return 'Hybrid finance requires a bond registration matter.'
  if (hasLane(options.readModel, 'bond')) return 'An attorney bond lane already exists for this transaction.'
  if (hasSignal(transaction, ['bond_attorney', 'bond_attorney_assigned'])) return 'A bond attorney has been appointed for this transaction.'
  if (hasSignal(transaction, ['bond_instruction_exists', 'bond_instruction_received', 'bond_instruction_id'])) {
    return 'Bond instruction signals already exist for this transaction.'
  }
  return 'No bond registration matter is currently required.'
}

export function resolveCancellationLaneReason(transaction = {}, options = {}) {
  const facts = options.facts || resolveTransactionFacts(transaction)
  if (facts.sellerHasExistingBond) return 'Seller has an existing bond that requires cancellation.'
  if (facts.cancellationRequired) return 'Seller bond cancellation is flagged for this transaction.'
  if (hasLane(options.readModel, 'cancellation')) return 'A cancellation attorney lane already exists for this transaction.'
  if (hasSignal(transaction, ['cancellation_attorney', 'cancellation_attorney_assigned'])) {
    return 'A cancellation attorney has been appointed for this transaction.'
  }
  if (hasSignal(transaction, ['cancellation_instruction_exists', 'cancellation_instruction_received', 'cancellation_instruction_id'])) {
    return 'Cancellation instruction signals already exist for this transaction.'
  }
  return 'No seller bond cancellation matter is currently required.'
}

export function resolveRequiredAttorneyLanes(transaction = {}, options = {}) {
  const facts = options.facts || resolveTransactionFacts(transaction)
  const bondRequired = isBondRegistrationRequired(transaction, { ...options, facts })
  const cancellationRequired = isSellerBondCancellationRequired(transaction, { ...options, facts })

  return {
    attorney_transfer: {
      required: true,
      reason: 'Sale transaction requires transfer matter.',
    },
    attorney_bond: {
      required: bondRequired,
      reason: resolveBondLaneReason(transaction, { ...options, facts }),
    },
    seller_bond_cancellation: {
      required: cancellationRequired,
      reason: resolveCancellationLaneReason(transaction, { ...options, facts }),
    },
  }
}

export function resolveRequiredAttorneyWorkflowKeys(transaction = {}, options = {}) {
  const lanes = resolveRequiredAttorneyLanes(transaction, options)
  return Object.entries(lanes)
    .filter(([, config]) => config.required)
    .map(([workflowKey]) => workflowKey)
}

export function getAttorneyLaneStepAliases(workflowKey = '', stepKey = '') {
  return ATTORNEY_LANE_STEP_ALIASES[normalizeText(workflowKey)]?.[normalizeText(stepKey)] || []
}
