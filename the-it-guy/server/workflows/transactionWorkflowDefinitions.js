import { resolveTransactionFacts } from '../../src/services/attorneyWorkflow/transactionFactsResolver.js'
import { resolveRequiredAttorneyLanes } from '../services/attorneyLaneResolver.js'
import { normaliseFinanceType, resolveFinanceWorkflowKey } from '../services/financeWorkflowResolver.js'

export const TRANSACTION_WORKFLOW_VERSION = 1

export const transactionWorkflowDefinitions = Object.freeze({
  sales_otp: {
    label: 'Sales / OTP',
    parentStage: 'SALES_OTP',
    steps: [
      { key: 'buyer_onboarding_complete', label: 'Buyer onboarding complete', required: true, blocking: true, ownerRole: 'buyer', sortOrder: 10 },
      { key: 'seller_onboarding_complete', label: 'Seller onboarding complete', required: true, blocking: true, ownerRole: 'seller', sortOrder: 20 },
      { key: 'signed_otp_received', label: 'Signed OTP received', required: true, blocking: true, ownerRole: 'buyer', sortOrder: 30 },
      { key: 'supporting_docs_complete', label: 'Supporting documents complete', required: true, blocking: true, ownerRole: 'agent', sortOrder: 40 },
      { key: 'ready_for_finance_handoff', label: 'Ready for Finance', required: true, blocking: true, ownerRole: 'agent', sortOrder: 60 },
    ],
  },
  finance_unknown: {
    label: 'Finance Type Required',
    parentStage: 'FINANCE',
    steps: [
      { key: 'finance_type_confirmed', label: 'Finance type confirmed', required: true, blocking: true, ownerRole: 'agent', sortOrder: 10 },
    ],
  },
  finance_cash: {
    label: 'Cash Finance',
    parentStage: 'FINANCE',
    steps: [
      { key: 'proof_of_funds_received', label: 'Proof of funds received', required: true, blocking: true, ownerRole: 'buyer', sortOrder: 10 },
      { key: 'proof_of_funds_reviewed', label: 'Proof of funds reviewed', required: true, blocking: true, ownerRole: 'agent', sortOrder: 20 },
      { key: 'cash_confirmation_approved', label: 'Cash confirmation approved', required: true, blocking: true, ownerRole: 'agent', sortOrder: 30 },
      { key: 'ready_for_transfer', label: 'Ready for Transfer', required: true, blocking: true, ownerRole: 'agent', sortOrder: 40 },
    ],
  },
  finance_bond: {
    label: 'Bond Finance',
    parentStage: 'FINANCE',
    steps: [
      { key: 'documents_received', label: 'Bond documents received', required: true, blocking: true, ownerRole: 'buyer', sortOrder: 10 },
      { key: 'documents_reviewed', label: 'Bond documents reviewed', required: true, blocking: true, ownerRole: 'bond_originator', sortOrder: 20 },
      { key: 'applications_submitted', label: 'Bank applications submitted', required: true, blocking: true, ownerRole: 'bond_originator', sortOrder: 30 },
      { key: 'feedback_received', label: 'Bank feedback received', required: true, blocking: true, ownerRole: 'bank', sortOrder: 40 },
      { key: 'quote_approved', label: 'Quote approved', required: true, blocking: true, ownerRole: 'buyer', sortOrder: 50 },
      { key: 'instruction_sent', label: 'Instruction sent', required: true, blocking: true, ownerRole: 'bond_originator', sortOrder: 60 },
      { key: 'ready_for_transfer', label: 'Ready for Transfer', required: true, blocking: true, ownerRole: 'bond_originator', sortOrder: 70 },
    ],
  },
  finance_hybrid: {
    label: 'Hybrid Finance',
    parentStage: 'FINANCE',
    steps: [
      { key: 'cash_portion_confirmed', label: 'Cash contribution confirmed', required: true, blocking: true, ownerRole: 'buyer', sortOrder: 10 },
      { key: 'bond_documents_received', label: 'Bond documents received', required: true, blocking: true, ownerRole: 'buyer', sortOrder: 20 },
      { key: 'bond_documents_reviewed', label: 'Bond documents reviewed', required: true, blocking: true, ownerRole: 'bond_originator', sortOrder: 30 },
      { key: 'applications_submitted', label: 'Bank applications submitted', required: true, blocking: true, ownerRole: 'bond_originator', sortOrder: 40 },
      { key: 'feedback_received', label: 'Bank feedback received', required: true, blocking: true, ownerRole: 'bank', sortOrder: 50 },
      { key: 'quote_approved', label: 'Quote approved', required: true, blocking: true, ownerRole: 'buyer', sortOrder: 60 },
      { key: 'instruction_sent', label: 'Instruction sent', required: true, blocking: true, ownerRole: 'bond_originator', sortOrder: 70 },
      { key: 'ready_for_transfer', label: 'Ready for Transfer', required: true, blocking: true, ownerRole: 'bond_originator', sortOrder: 80 },
    ],
  },
  attorney_transfer: {
    label: 'Attorney Transfer',
    parentStage: 'TRANSFER',
    steps: [
      { key: 'instruction_received', label: 'Instruction received', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 10 },
      { key: 'transfer_documents_requested', label: 'Transfer documents requested', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 20 },
      { key: 'transfer_documents_received', label: 'Transfer documents received', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 30 },
      { key: 'transfer_documents_prepared', label: 'Transfer documents prepared', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 40 },
      { key: 'transfer_documents_signed', label: 'Transfer documents signed', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 50 },
      { key: 'clearance_figures_requested', label: 'Clearance figures requested', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 60 },
      { key: 'clearance_figures_received', label: 'Clearance figures received', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 70 },
      { key: 'transfer_duty_requested', label: 'Transfer duty requested', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 80 },
      { key: 'transfer_duty_received', label: 'Transfer duty received', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 90 },
      { key: 'guarantees_confirmed', label: 'Guarantees confirmed', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 100 },
      { key: 'ready_for_lodgement', label: 'Ready for lodgement', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 110 },
      { key: 'lodged', label: 'Lodged', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 120 },
      { key: 'prep_for_registration', label: 'Prep for registration', required: false, blocking: false, ownerRole: 'attorney', sortOrder: 130 },
    ],
  },
  attorney_bond: {
    label: 'Attorney Bond',
    parentStage: 'TRANSFER',
    steps: [
      { key: 'bond_instruction_received', label: 'Bond instruction received', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 10 },
      { key: 'bond_documents_requested', label: 'Bond documents requested', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 20 },
      { key: 'bond_documents_received', label: 'Bond documents received', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 30 },
      { key: 'bond_documents_prepared', label: 'Bond documents prepared', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 40 },
      { key: 'bond_documents_signed', label: 'Bond documents signed', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 50 },
      { key: 'bank_conditions_received', label: 'Bank conditions received', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 60 },
      { key: 'bank_conditions_satisfied', label: 'Bank conditions satisfied', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 70 },
      { key: 'guarantees_issued', label: 'Guarantees issued', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 80 },
      { key: 'ready_for_lodgement', label: 'Ready for lodgement', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 90 },
      { key: 'lodged', label: 'Lodged', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 100 },
      { key: 'prep_for_registration', label: 'Prep for registration', required: false, blocking: false, ownerRole: 'attorney', sortOrder: 110 },
    ],
  },
  seller_bond_cancellation: {
    label: 'Seller Bond Cancellation',
    parentStage: 'TRANSFER',
    steps: [
      { key: 'cancellation_instruction_received', label: 'Cancellation instruction received', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 10 },
      { key: 'cancellation_figures_requested', label: 'Cancellation figures requested', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 20 },
      { key: 'cancellation_figures_received', label: 'Cancellation figures received', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 30 },
      { key: 'cancellation_documents_prepared', label: 'Cancellation documents prepared', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 40 },
      { key: 'cancellation_documents_signed', label: 'Cancellation documents signed', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 50 },
      { key: 'guarantees_received', label: 'Guarantees received', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 60 },
      { key: 'ready_for_lodgement', label: 'Ready for lodgement', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 70 },
      { key: 'lodged', label: 'Lodged', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 80 },
      { key: 'prep_for_registration', label: 'Prep for registration', required: false, blocking: false, ownerRole: 'attorney', sortOrder: 90 },
    ],
  },
  registration: {
    label: 'Registration',
    parentStage: 'REGISTRATION',
    steps: [
      { key: 'deeds_office_linked', label: 'Deeds office linked', required: false, blocking: false, ownerRole: 'attorney', sortOrder: 10 },
      { key: 'all_required_matters_lodged', label: 'All required matters lodged', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 20 },
      { key: 'on_prep', label: 'On prep', required: false, blocking: false, ownerRole: 'attorney', sortOrder: 30 },
      { key: 'registration_confirmed', label: 'Registration confirmed', required: true, blocking: true, ownerRole: 'attorney', sortOrder: 40 },
      { key: 'final_accounts_complete', label: 'Final accounts complete', required: false, blocking: false, ownerRole: 'attorney', sortOrder: 50 },
      { key: 'matter_closed', label: 'Matter closed', required: false, blocking: false, ownerRole: 'attorney', sortOrder: 60 },
    ],
  },
})

export function getTransactionWorkflowDefinition(workflowKey = '') {
  return transactionWorkflowDefinitions[String(workflowKey || '').trim()] || null
}

export function listTransactionWorkflowKeys() {
  return Object.keys(transactionWorkflowDefinitions)
}

export function resolveWorkflowKeysForTransaction(transaction = {}) {
  const facts = resolveTransactionFacts(transaction)
  if (Array.isArray(facts.requiredWorkflowKeys) && facts.requiredWorkflowKeys.length) {
    const routedKeys = facts.requiredWorkflowKeys.filter((key) => getTransactionWorkflowDefinition(key))
    if (routedKeys.length) return routedKeys
  }
  const financeType = normaliseFinanceType(transaction.finance_type || facts.financeType)
  const attorneyLanes = resolveRequiredAttorneyLanes(transaction, { facts })
  const keys = ['sales_otp']
  keys.push(resolveFinanceWorkflowKey({ finance_type: financeType }))

  keys.push('attorney_transfer')

  if (attorneyLanes.attorney_bond.required) {
    keys.push('attorney_bond')
  }

  if (attorneyLanes.seller_bond_cancellation.required) {
    keys.push('seller_bond_cancellation')
  }

  keys.push('registration')

  return keys
}

export function buildWorkflowStepsForKey(workflowKey = '') {
  const definition = getTransactionWorkflowDefinition(workflowKey)
  if (!definition) return []
  return (definition.steps || []).map((step) => ({
    ...step,
    workflowKey,
  }))
}
