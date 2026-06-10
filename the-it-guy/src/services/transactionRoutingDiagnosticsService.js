import { resolveTransactionFacts } from './attorneyWorkflow/transactionFactsResolver.js'
import {
  resolveTransactionRoutingProfile,
  resolveWorkflowKeysForRoutingProfile,
  summarizeTransactionRoutingProfile,
} from './transactionRoutingProfileService.js'

const FIELD_LABELS = Object.freeze({
  finance_type: 'Finance type',
  transaction_type: 'Transaction type',
  buyer_entity_type: 'Buyer type',
  seller_entity_type: 'Seller type',
  property_tenure: 'Property tenure',
  vat_treatment: 'VAT treatment',
})

const WORKFLOW_LABELS = Object.freeze({
  sales_otp: 'Sales / OTP',
  finance_cash: 'Cash finance',
  finance_bond: 'Bond finance',
  finance_hybrid: 'Hybrid finance',
  finance_unknown: 'Finance confirmation',
  attorney_transfer: 'Transfer attorney',
  attorney_bond: 'Bond attorney',
  seller_bond_cancellation: 'Seller bond cancellation',
  registration: 'Registration',
})

const VALUE_LABELS = Object.freeze({
  cash: 'Cash',
  bond: 'Bond',
  hybrid: 'Hybrid',
  combination: 'Hybrid',
  unknown: 'Unknown',
  private_sale: 'Private sale',
  resale: 'Resale',
  development_sale: 'New development',
  commercial: 'Commercial',
  sectional_title: 'Sectional title',
  estate_hoa: 'Estate / HOA',
  freehold: 'Freehold',
  share_block: 'Share block',
  transfer_duty: 'Transfer duty',
  vat: 'VAT',
  zero_rated_going_concern: 'Zero-rated going concern',
  individual: 'Individual',
  company: 'Company',
  trust: 'Trust',
  developer: 'Developer',
})

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

function compactUnique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function labelFor(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return 'Unknown'
  return VALUE_LABELS[normalized] || normalized.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function fieldLabel(value) {
  return FIELD_LABELS[value] || labelFor(value)
}

function workflowLabel(value) {
  return WORKFLOW_LABELS[value] || labelFor(value)
}

function readRoutingProfile(transaction = {}) {
  return parseJsonObject(
    transaction.routingProfile ||
      transaction.routing_profile ||
      transaction.routing_profile_json ||
      transaction.routingProfileJson,
  )
}

function hasUsableProfile(profile = {}) {
  return Boolean(profile && typeof profile === 'object' && Object.keys(profile).length)
}

export function buildTransactionRoutingDiagnostics(transaction = {}) {
  const persistedProfile = readRoutingProfile(transaction)
  const hasPersistedProfile = hasUsableProfile(persistedProfile)
  const profile = hasPersistedProfile ? persistedProfile : resolveTransactionRoutingProfile({ transaction })
  const facts = resolveTransactionFacts({
    ...transaction,
    routing_profile_json: profile,
  })
  const requiredWorkflowKeys = compactUnique(
    (Array.isArray(profile.requiredWorkflowKeys) && profile.requiredWorkflowKeys.length
      ? profile.requiredWorkflowKeys
      : facts.requiredWorkflowKeys?.length
        ? facts.requiredWorkflowKeys
        : resolveWorkflowKeysForRoutingProfile(profile)
    ).map((key) => String(key || '').trim()),
  )
  const missingFields = compactUnique([
    ...(Array.isArray(profile.missingFields) ? profile.missingFields : []),
    ...(Array.isArray(facts.missingFields) ? facts.missingFields : []),
  ])
  const warnings = compactUnique([
    ...(Array.isArray(profile.warnings) ? profile.warnings : []),
    ...(Array.isArray(facts.confidenceWarnings) ? facts.confidenceWarnings : []),
  ])
  const attorneyRoles = compactUnique([
    facts.requiresTransferAttorney ? 'transfer_attorney' : '',
    facts.requiresBondAttorney ? 'bond_attorney' : '',
    facts.requiresCancellationAttorney ? 'cancellation_attorney' : '',
  ])

  return {
    transactionId: transaction?.id || facts.transactionId || profile.transactionId || null,
    source: hasPersistedProfile ? 'persisted' : 'computed',
    status: missingFields.length ? 'needs_attention' : hasPersistedProfile ? 'ready' : 'inferred',
    summary: summarizeTransactionRoutingProfile(profile) || `${labelFor(facts.financeType)} + ${labelFor(facts.transactionType)}`,
    profile,
    facts,
    routingProfileVersion: profile.version || facts.routingProfileVersion || transaction.routing_profile_version || '',
    workflowTemplateKey: profile.workflowTemplateKey || facts.workflowTemplateKey || '',
    requiredWorkflowKeys,
    requiredWorkflowLabels: requiredWorkflowKeys.map(workflowLabel),
    requiredDocumentGroups: compactUnique(profile.requiredDocumentGroups || facts.requiredDocumentGroups || []),
    attorneyRoles,
    attorneyRoleLabels: attorneyRoles.map((role) => workflowLabel(role.replace('_attorney', '') === 'cancellation' ? 'seller_bond_cancellation' : `attorney_${role.replace('_attorney', '')}`)),
    missingFields,
    missingFieldLabels: missingFields.map(fieldLabel),
    warnings,
    decisions: [
      { key: 'finance_type', label: 'Finance', value: labelFor(facts.financeType) },
      { key: 'transaction_type', label: 'Transaction', value: labelFor(facts.transactionType) },
      { key: 'property_tenure', label: 'Tenure', value: labelFor(facts.propertyTenure) },
      { key: 'vat_treatment', label: 'Tax', value: labelFor(facts.vatTreatment) },
      { key: 'seller_bond', label: 'Seller bond', value: facts.requiresCancellationAttorney ? 'Cancellation required' : 'Not required' },
    ],
  }
}

export function getTransactionRoutingStatusLabel(status = '') {
  if (status === 'ready') return 'Routing ready'
  if (status === 'needs_attention') return 'Needs routing facts'
  if (status === 'inferred') return 'Inferred routing'
  return 'Routing pending'
}
