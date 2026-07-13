import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import {
  CANONICAL_RESOLVER_SOURCE,
  CANONICAL_RESOLVER_VERSION,
  REQUIREMENT_LEVELS,
  REQUIREMENT_STATUSES,
} from './canonicalDocumentResolverService'
import {
  getCrossModuleDocumentDefinition,
  resolveCrossModuleDocumentKey,
} from './crossModuleDocumentKeyMapService'

export const CANONICAL_DOCUMENT_ADAPTERS_FLAG = 'VITE_CANONICAL_DOCUMENT_ADAPTERS_ENABLED'
export const CANONICAL_DOCUMENT_ADAPTER_SOURCE = 'canonical_document_adapter'

export const ADAPTER_EVENT_TYPES = Object.freeze({
  legacySynced: 'legacy_synced',
  legacyUploadLinked: 'legacy_upload_linked',
  legacyStatusImported: 'legacy_status_imported',
  packetLinked: 'packet_linked',
  documentRequestCreated: 'document_request_created',
  mappingMissing: 'mapping_missing',
  syncSkipped: 'sync_skipped',
  statusConflict: 'status_conflict',
})

const PRIVATE_LISTING_STATUSES = Object.freeze({
  required: 'required',
  requested: 'requested',
  uploaded: 'uploaded',
  underReview: 'under_review',
  rejected: 'rejected',
  approved: 'approved',
  completed: 'completed',
  notApplicable: 'not_applicable',
})

const TRANSACTION_REQUIRED_STATUSES = Object.freeze({
  missing: 'missing',
  uploaded: 'uploaded',
  underReview: 'under_review',
  accepted: 'accepted',
  reuploadRequired: 'reupload_required',
  notRequired: 'not_required',
})

const DOCUMENT_REQUEST_STATUSES = Object.freeze({
  requested: 'requested',
  uploaded: 'uploaded',
  reviewed: 'reviewed',
  rejected: 'rejected',
  completed: 'completed',
})

const LEGACY_PRIVATE_STATUS_STRENGTH = Object.freeze({
  required: 10,
  requested: 20,
  rejected: 30,
  uploaded: 40,
  under_review: 50,
  approved: 70,
  completed: 80,
  not_applicable: 90,
})

const LEGACY_TRANSACTION_STATUS_STRENGTH = Object.freeze({
  missing: 10,
  reupload_required: 30,
  uploaded: 40,
  under_review: 50,
  accepted: 80,
  not_required: 90,
})

const CANONICAL_STATUS_STRENGTH = Object.freeze({
  pending: 10,
  requested: 20,
  rejected: 30,
  expired: 35,
  uploaded: 40,
  under_review: 50,
  approved: 70,
  completed: 80,
  waived: 85,
  not_applicable: 90,
})

export const CANONICAL_TO_LEGACY_REQUIREMENT_KEYS = Object.freeze({
  signed_mandate: 'mandate_signature',
  generated_mandate: 'generated_mandate',
  generated_otp: 'generated_otp',
  signed_otp: 'otp',
  information_sheet: 'information_sheet',
  seller_id_document: 'id_document',
  seller_proof_of_address: 'proof_of_address',
  seller_company_registration: 'seller_company_registration',
  seller_trust_deed: 'seller_trust_deed',
  seller_letters_of_authority: 'seller_letters_of_authority',
  seller_executor_authority: 'seller_executor_authority',
  company_resolution_to_sell: 'company_resolution_to_sell',
  trust_resolution_to_sell: 'trust_resolution_to_sell',
  bond_bank_details: 'bond_bank_details',
  bond_cancellation_notice: 'bond_cancellation_notice',
  property_condition_disclosure: 'property_condition_disclosure',
  levy_statement: 'levy_statement',
  hoa_levy_statement: 'hoa_levy_statement',
  hoa_details: 'hoa_contact_details',
  lease_agreement: 'lease_agreement',
  tenant_details: 'tenant_details',
  rental_schedule: 'rental_schedule',
  zoning_certificate: 'zoning_certificate',
  occupation_certificate: 'occupation_certificate',
  buyer_id_document: 'buyer_id_document',
  buyer_proof_of_address: 'buyer_proof_of_address',
  proof_of_funds: 'proof_of_funds',
  reservation_deposit_proof: 'reservation_deposit_proof',
  bond_preapproval: 'bond_preapproval',
  bond_approval: 'bond_approval',
  grant_letter: 'grant_signed',
  bank_statements: 'bank_statements',
  payslips: 'payslips',
  proof_of_income: 'proof_of_income',
  guarantees: 'guarantees',
  transfer_documents: 'transfer_documents',
  signed_transfer_documents: 'signed_transfer_pack',
  settlement_figure: 'settlement_figures',
  bond_instruction_to_attorneys: 'bond_instruction',
  signed_packet_version: 'final_signed_packet',
  signed_addendum: 'signed_addendum',
  bond_application_form: 'bond_application_form',
})

export const LEGACY_TO_CANONICAL_REQUIREMENT_KEYS = Object.freeze({
  mandate_signature: 'signed_mandate',
  signed_mandate: 'signed_mandate',
  generated_mandate: 'generated_mandate',
  mandate_generated: 'generated_mandate',
  generated_otp: 'generated_otp',
  generated_offer_to_purchase: 'generated_otp',
  otp_generated: 'generated_otp',
  otp_pending_approval: 'generated_otp',
  signed_otp: 'signed_otp',
  otp: 'signed_otp',
  otp_signed: 'signed_otp',
  signed_offer_to_purchase: 'signed_otp',
  information_sheet: 'information_sheet',
  seller_id: 'seller_id_document',
  id_document: 'seller_id_document',
  seller_fica: 'seller_id_document',
  seller_id_document: 'seller_id_document',
  proof_of_address: 'seller_proof_of_address',
  seller_proof_of_address: 'seller_proof_of_address',
  seller_company_registration: 'seller_company_registration',
  company_registration: 'seller_company_registration',
  company_registration_document: 'seller_company_registration',
  seller_trust_deed: 'seller_trust_deed',
  trust_deed: 'seller_trust_deed',
  seller_letters_of_authority: 'seller_letters_of_authority',
  letters_of_authority: 'seller_letters_of_authority',
  seller_executor_authority: 'seller_executor_authority',
  executor_authority: 'seller_executor_authority',
  company_resolution_to_sell: 'company_resolution_to_sell',
  company_resolution: 'company_resolution_to_sell',
  trust_resolution_to_sell: 'trust_resolution_to_sell',
  trust_resolution: 'trust_resolution_to_sell',
  rates_account: 'rates_account',
  bond_statement: 'bond_statement',
  bond_bank_details: 'bond_bank_details',
  bond_cancellation_notice: 'bond_cancellation_notice',
  levy_docs: 'levy_statement',
  levy_statement: 'levy_statement',
  hoa_docs: 'hoa_details',
  hoa_contact_details: 'hoa_details',
  hoa_levy_statement: 'hoa_levy_statement',
  body_corporate_details: 'body_corporate_details',
  tenant_docs: 'lease_agreement',
  lease_agreement: 'lease_agreement',
  tenant_details: 'tenant_details',
  rental_schedule: 'rental_schedule',
  electrical_compliance_certificate: 'electrical_compliance_certificate',
  property_condition_disclosure: 'property_condition_disclosure',
  defects_declaration: 'property_condition_disclosure',
  title_deed_copy: 'title_deed_copy',
  zoning_certificate: 'zoning_certificate',
  occupation_certificate: 'occupation_certificate',
  buyer_id: 'buyer_id_document',
  buyer_fica: 'buyer_id_document',
  buyer_id_document: 'buyer_id_document',
  buyer_proof_of_address: 'buyer_proof_of_address',
  buyer_address: 'buyer_proof_of_address',
  proof_of_funds: 'proof_of_funds',
  reservation_deposit_proof: 'reservation_deposit_proof',
  reservation_deposit_pop: 'reservation_deposit_proof',
  cash_proof: 'proof_of_funds',
  bond_preapproval: 'bond_preapproval',
  bond_pre_approval: 'bond_preapproval',
  bond_approval: 'bond_approval',
  bank_approval_to_lodge: 'bond_instruction_to_attorneys',
  bank_requirements: 'bank_feedback',
  grant_signed: 'grant_letter',
  grant_letter: 'grant_letter',
  bank_statements: 'bank_statements',
  payslips: 'payslips',
  proof_of_income: 'proof_of_income',
  income_verification: 'proof_of_income',
  guarantees: 'guarantees',
  guarantee_letter: 'guarantees',
  transfer_documents: 'transfer_documents',
  developer_sale_pack: 'transfer_documents',
  final_account: 'transfer_documents',
  transfer_duty_receipt: 'transfer_documents',
  transfer_document_pack: 'signed_transfer_documents',
  signed_transfer_pack: 'signed_transfer_documents',
  signed_transfer_documents: 'signed_transfer_documents',
  buyer_signed_bond_documents: 'bond_instruction_to_attorneys',
  settlement_figures: 'settlement_figure',
  settlement_figure: 'settlement_figure',
  cancellation_figures: 'settlement_figure',
  bond_instruction: 'bond_instruction_to_attorneys',
  bond_instruction_to_attorneys: 'bond_instruction_to_attorneys',
  cancellation_instruction: 'bond_cancellation_notice',
  cancellation_confirmation: 'bond_cancellation_notice',
  seller_bond_cancellation_information: 'bond_bank_details',
  bond_registration_confirmation: 'registration_confirmation',
  final_signed_packet: 'signed_packet_version',
  closing_pack: 'signed_packet_version',
  signed_addendum: 'signed_addendum',
  registration_confirmation: 'registration_confirmation',
  bond_application_form: 'bond_application_form',
  bond_application: 'bond_application_form',
  buyer_company_registration_documents: 'buyer_company_registration',
  buyer_company_resolution: 'buyer_company_registration',
  buyer_director_ids: 'buyer_id_document',
  buyer_business_address: 'buyer_proof_of_address',
  buyer_letters_of_authority: 'buyer_trust_deed',
  buyer_trust_deed: 'buyer_trust_deed',
  buyer_trustee_ids: 'buyer_id_document',
  buyer_trustee_resolution: 'buyer_trust_deed',
  proof_of_funds_cash_component: 'proof_of_funds',
  rates_clearance: 'rates_clearance_certificate',
  rates_clearance_certificate: 'rates_clearance_certificate',
  levy_clearance: 'levy_clearance_certificate',
  levy_clearance_certificate: 'levy_clearance_certificate',
  seller_company_resolution: 'company_resolution_to_sell',
})

export const PACK_TO_PRIVATE_LISTING_GROUP = Object.freeze({
  seller_identity_fica: 'fica',
  seller_authority: 'mandate',
  property_ownership: 'property',
  property_finance_existing_bond: 'financial',
  property_compliance: 'compliance',
  sectional_title_body_corporate: 'property',
  estate_hoa: 'property',
  tenant_occupancy: 'property',
  marketing_assets: 'marketing',
  attorney_transfer_readiness: 'mandate',
  buyer_identity_fica: 'fica',
  buyer_finance: 'financial',
  bond_originator: 'financial',
  attorney_generated_documents: 'mandate',
})

export const PRIVATE_LISTING_GROUP_TO_PACK = Object.freeze({
  seller_identity: 'seller_identity_fica',
  seller_identity_fica: 'seller_identity_fica',
  fica: 'seller_identity_fica',
  buyer_fica: 'buyer_identity_fica',
  buyer_identity: 'buyer_identity_fica',
  buyer_identity_fica: 'buyer_identity_fica',
  marital: 'seller_identity_fica',
  company: 'seller_authority',
  trust: 'seller_authority',
  authority: 'seller_authority',
  seller_authority: 'seller_authority',
  property: 'property_ownership',
  property_ownership: 'property_ownership',
  financial: 'property_finance_existing_bond',
  finance: 'buyer_finance',
  buyer_finance: 'buyer_finance',
  bond_originator: 'bond_originator',
  mandate: 'seller_authority',
  sale: 'attorney_transfer_readiness',
  attorney_transfer_readiness: 'attorney_transfer_readiness',
  transfer: 'attorney_transfer_readiness',
  signing: 'attorney_generated_documents',
  attorney_generated_documents: 'attorney_generated_documents',
  compliance: 'property_compliance',
  property_compliance: 'property_compliance',
  body_corporate: 'sectional_title_body_corporate',
  sectional_title_body_corporate: 'sectional_title_body_corporate',
  hoa: 'estate_hoa',
  estate_hoa: 'estate_hoa',
  tenant: 'tenant_occupancy',
  tenant_occupancy: 'tenant_occupancy',
  marketing: 'marketing_assets',
  marketing_assets: 'marketing_assets',
})

export const PACK_LABELS = Object.freeze({
  seller_identity_fica: 'Seller Identity & FICA',
  seller_authority: 'Seller Authority',
  property_ownership: 'Property Ownership',
  property_finance_existing_bond: 'Property Finance / Existing Bond',
  property_compliance: 'Property Compliance',
  sectional_title_body_corporate: 'Sectional Title / Body Corporate',
  estate_hoa: 'Estate / HOA',
  tenant_occupancy: 'Tenant / Occupancy',
  marketing_assets: 'Marketing Assets',
  attorney_transfer_readiness: 'Attorney / Transfer Readiness',
  buyer_identity_fica: 'Buyer Identity & FICA',
  buyer_finance: 'Buyer Finance',
  bond_originator: 'Bond Originator',
  attorney_generated_documents: 'Attorney Generated Documents',
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function isTruthyFlag(value) {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalizeText(value).toLowerCase())
}

function getEnvFlag(name) {
  try {
    return import.meta.env?.[name]
  } catch {
    return undefined
  }
}

function requireClient(client = supabase) {
  if (!client || !isSupabaseConfigured) throw new Error('Supabase is required for canonical document adapter sync.')
  return client
}

export function areCanonicalDocumentAdaptersEnabled(options = {}) {
  if (typeof options.enabled === 'boolean') return options.enabled
  if (typeof options.force === 'boolean' && options.force) return true
  return isTruthyFlag(getEnvFlag(CANONICAL_DOCUMENT_ADAPTERS_FLAG))
}

export function canonicalDefinitionKeyToLegacyKey(key = '') {
  const normalized = normalizeKey(key)
  return CANONICAL_TO_LEGACY_REQUIREMENT_KEYS[normalized] || normalized
}

export function legacyRequirementKeyToCanonicalKey(key = '') {
  const normalized = normalizeKey(key)
  return LEGACY_TO_CANONICAL_REQUIREMENT_KEYS[normalized] || resolveCrossModuleDocumentKey(normalized, normalized)
}

export function packKeyToLegacyRequirementGroup(packKey = '') {
  return PACK_TO_PRIVATE_LISTING_GROUP[normalizeKey(packKey)] || 'property'
}

export function legacyRequirementGroupToPackKey(group = '') {
  return PRIVATE_LISTING_GROUP_TO_PACK[normalizeKey(group)] || 'property_ownership'
}

export function canonicalLevelToLegacyRequired(level = '') {
  return [REQUIREMENT_LEVELS.blocker, REQUIREMENT_LEVELS.required].includes(normalizeKey(level))
}

export function canonicalStatusToPrivateListingStatus(status = '') {
  switch (normalizeKey(status)) {
    case REQUIREMENT_STATUSES.pending:
      return PRIVATE_LISTING_STATUSES.required
    case REQUIREMENT_STATUSES.requested:
      return PRIVATE_LISTING_STATUSES.requested
    case REQUIREMENT_STATUSES.uploaded:
      return PRIVATE_LISTING_STATUSES.uploaded
    case REQUIREMENT_STATUSES.underReview:
      return PRIVATE_LISTING_STATUSES.underReview
    case REQUIREMENT_STATUSES.approved:
      return PRIVATE_LISTING_STATUSES.approved
    case REQUIREMENT_STATUSES.completed:
      return PRIVATE_LISTING_STATUSES.completed
    case REQUIREMENT_STATUSES.rejected:
      return PRIVATE_LISTING_STATUSES.rejected
    case REQUIREMENT_STATUSES.waived:
    case REQUIREMENT_STATUSES.notApplicable:
      return PRIVATE_LISTING_STATUSES.notApplicable
    case REQUIREMENT_STATUSES.expired:
      return PRIVATE_LISTING_STATUSES.requested
    default:
      return PRIVATE_LISTING_STATUSES.required
  }
}

export function privateListingStatusToCanonicalStatus(status = '') {
  switch (normalizeKey(status)) {
    case PRIVATE_LISTING_STATUSES.required:
      return REQUIREMENT_STATUSES.pending
    case PRIVATE_LISTING_STATUSES.requested:
      return REQUIREMENT_STATUSES.requested
    case PRIVATE_LISTING_STATUSES.uploaded:
      return REQUIREMENT_STATUSES.uploaded
    case PRIVATE_LISTING_STATUSES.underReview:
      return REQUIREMENT_STATUSES.underReview
    case PRIVATE_LISTING_STATUSES.approved:
      return REQUIREMENT_STATUSES.approved
    case PRIVATE_LISTING_STATUSES.completed:
      return REQUIREMENT_STATUSES.completed
    case PRIVATE_LISTING_STATUSES.rejected:
      return REQUIREMENT_STATUSES.rejected
    case PRIVATE_LISTING_STATUSES.notApplicable:
      return REQUIREMENT_STATUSES.notApplicable
    default:
      return REQUIREMENT_STATUSES.pending
  }
}

export function canonicalStatusToTransactionRequiredStatus(status = '') {
  switch (normalizeKey(status)) {
    case REQUIREMENT_STATUSES.uploaded:
      return TRANSACTION_REQUIRED_STATUSES.uploaded
    case REQUIREMENT_STATUSES.underReview:
      return TRANSACTION_REQUIRED_STATUSES.underReview
    case REQUIREMENT_STATUSES.approved:
    case REQUIREMENT_STATUSES.completed:
    case REQUIREMENT_STATUSES.waived:
      return TRANSACTION_REQUIRED_STATUSES.accepted
    case REQUIREMENT_STATUSES.rejected:
    case REQUIREMENT_STATUSES.expired:
      return TRANSACTION_REQUIRED_STATUSES.reuploadRequired
    case REQUIREMENT_STATUSES.notApplicable:
      return TRANSACTION_REQUIRED_STATUSES.notRequired
    default:
      return TRANSACTION_REQUIRED_STATUSES.missing
  }
}

export function transactionRequiredStatusToCanonicalStatus(status = '') {
  switch (normalizeKey(status)) {
    case TRANSACTION_REQUIRED_STATUSES.uploaded:
      return REQUIREMENT_STATUSES.uploaded
    case TRANSACTION_REQUIRED_STATUSES.underReview:
      return REQUIREMENT_STATUSES.underReview
    case TRANSACTION_REQUIRED_STATUSES.accepted:
      return REQUIREMENT_STATUSES.approved
    case TRANSACTION_REQUIRED_STATUSES.reuploadRequired:
      return REQUIREMENT_STATUSES.rejected
    case TRANSACTION_REQUIRED_STATUSES.notRequired:
      return REQUIREMENT_STATUSES.notApplicable
    default:
      return REQUIREMENT_STATUSES.pending
  }
}

export function canonicalStatusToDocumentRequestStatus(status = '') {
  switch (normalizeKey(status)) {
    case REQUIREMENT_STATUSES.uploaded:
    case REQUIREMENT_STATUSES.underReview:
      return DOCUMENT_REQUEST_STATUSES.uploaded
    case REQUIREMENT_STATUSES.approved:
      return DOCUMENT_REQUEST_STATUSES.reviewed
    case REQUIREMENT_STATUSES.completed:
    case REQUIREMENT_STATUSES.waived:
    case REQUIREMENT_STATUSES.notApplicable:
      return DOCUMENT_REQUEST_STATUSES.completed
    case REQUIREMENT_STATUSES.rejected:
    case REQUIREMENT_STATUSES.expired:
      return DOCUMENT_REQUEST_STATUSES.rejected
    default:
      return DOCUMENT_REQUEST_STATUSES.requested
  }
}

export function pickStrongerLegacyStatus(existingStatus, incomingStatus, strengthMap) {
  const existing = normalizeKey(existingStatus)
  const incoming = normalizeKey(incomingStatus)
  if (!existing) return incoming
  if (!incoming) return existing
  return (strengthMap[existing] || 0) > (strengthMap[incoming] || 0) ? existing : incoming
}

export function pickStrongerCanonicalStatus(existingStatus, incomingStatus) {
  return pickStrongerLegacyStatus(existingStatus, incomingStatus, CANONICAL_STATUS_STRENGTH)
}

export function detectStatusConflict(existingStatus, incomingStatus, strengthMap = CANONICAL_STATUS_STRENGTH) {
  const existing = normalizeKey(existingStatus)
  const incoming = normalizeKey(incomingStatus)
  if (!existing || !incoming || existing === incoming) return null
  const existingStrength = strengthMap[existing] || 0
  const incomingStrength = strengthMap[incoming] || 0
  if (existingStrength >= 70 && incomingStrength <= 35) {
    return { existingStatus: existing, incomingStatus: incoming, reason: 'would_downgrade_completed_state' }
  }
  if (incomingStrength >= 70 && existingStrength <= 35) {
    return { existingStatus: existing, incomingStatus: incoming, reason: 'legacy_or_canonical_disagreement' }
  }
  return null
}

function getDefinition(instance = {}) {
  return instance.document_definitions || instance.document_definition || instance.definition || {}
}

function getDefinitionLabel(instance = {}) {
  const definition = getDefinition(instance)
  return definition.display_label || instance.display_label || instance.document_definition_key || 'Document'
}

function getDefinitionDescription(instance = {}) {
  const definition = getDefinition(instance)
  return definition.description || instance.description || null
}

function privateListingVisibility(instance = {}) {
  const roles = normalizeArray(instance.visible_to_roles).map(normalizeKey)
  if (roles.includes('seller')) return 'seller_visible'
  if (roles.some((role) => ['buyer', 'transferring_attorney', 'bond_attorney', 'cancellation_attorney', 'bond_originator'].includes(role))) {
    return 'shared_role_players'
  }
  return 'internal'
}

function transactionVisibility(instance = {}) {
  const roles = normalizeArray(instance.visible_to_roles).map(normalizeKey)
  if (roles.includes('buyer') || roles.includes('seller')) return 'client'
  if (roles.some((role) => ['transferring_attorney', 'bond_attorney', 'cancellation_attorney', 'bond_originator'].includes(role))) return 'shared'
  return 'internal'
}

function requestedFromRole(instance = {}) {
  const role = normalizeKey(instance.requested_from_role)
  if (!role) return 'client'
  if (role === 'seller' || role === 'buyer') return 'client'
  return role
}

export function canonicalInstanceToPrivateListingRequirement(instance = {}, existing = null) {
  const listingId = instance.listing_id || instance.context_id
  const incomingStatus = canonicalStatusToPrivateListingStatus(instance.status)
  const status = existing
    ? pickStrongerLegacyStatus(existing.status, incomingStatus, LEGACY_PRIVATE_STATUS_STRENGTH)
    : incomingStatus
  const generatedFrom = {
    ...(existing?.generated_from || {}),
    canonical: {
      requirementInstanceId: instance.id || null,
      documentDefinitionKey: instance.document_definition_key,
      sourceSystem: instance.source_system || CANONICAL_RESOLVER_SOURCE,
      resolverVersion: instance.resolver_version || CANONICAL_RESOLVER_VERSION,
      syncedAt: new Date().toISOString(),
    },
  }

  return {
    id: existing?.id,
    private_listing_id: listingId,
    requirement_key: canonicalDefinitionKeyToLegacyKey(instance.document_definition_key),
    requirement_name: getDefinitionLabel(instance),
    requirement_description: getDefinitionDescription(instance),
    requirement_group: packKeyToLegacyRequirementGroup(instance.pack_key),
    document_visibility: privateListingVisibility(instance),
    status,
    is_required: canonicalLevelToLegacyRequired(instance.requirement_level),
    generated_from: generatedFrom,
    canonical_requirement_instance_id: instance.id || null,
  }
}

export function canonicalInstanceToTransactionRequiredDocument(instance = {}, existing = null) {
  const incomingStatus = canonicalStatusToTransactionRequiredStatus(instance.status)
  const status = existing
    ? pickStrongerLegacyStatus(existing.status, incomingStatus, LEGACY_TRANSACTION_STATUS_STRENGTH)
    : incomingStatus

  return {
    id: existing?.id,
    transaction_id: instance.transaction_id,
    document_key: canonicalDefinitionKeyToLegacyKey(instance.document_definition_key),
    document_label: getDefinitionLabel(instance),
    is_required: canonicalLevelToLegacyRequired(instance.requirement_level),
    is_uploaded: ['uploaded', 'under_review', 'accepted'].includes(status),
    status,
    enabled: instance.status !== REQUIREMENT_STATUSES.notApplicable,
    group_key: instance.pack_key,
    group_label: PACK_LABELS[instance.pack_key] || instance.pack_key,
    description: getDefinitionDescription(instance),
    required_from_role: requestedFromRole(instance),
    visibility_scope: transactionVisibility(instance),
    allow_multiple: false,
    canonical_requirement_instance_id: instance.id || null,
  }
}

export function canonicalInstanceToDocumentRequest(instance = {}, existing = null) {
  return {
    id: existing?.id,
    transaction_id: instance.transaction_id,
    category: instance.pack_key,
    document_type: canonicalDefinitionKeyToLegacyKey(instance.document_definition_key),
    title: getDefinitionLabel(instance),
    description: getDefinitionDescription(instance),
    priority: instance.requirement_level === REQUIREMENT_LEVELS.optional ? 'optional' : instance.requirement_level === REQUIREMENT_LEVELS.recommended ? 'important' : 'required',
    assigned_to_role: requestedFromRole(instance),
    status: existing
      ? pickStrongerLegacyStatus(existing.status, canonicalStatusToDocumentRequestStatus(instance.status), {
        requested: 10,
        rejected: 30,
        uploaded: 40,
        reviewed: 70,
        completed: 80,
      })
      : canonicalStatusToDocumentRequestStatus(instance.status),
    requires_review: ![REQUIREMENT_LEVELS.optional, REQUIREMENT_LEVELS.notApplicable].includes(instance.requirement_level),
    canonical_requirement_instance_id: instance.id || null,
  }
}

export function deriveCanonicalStatusFromLegacyUpload(legacyDocument = {}, legacyRequirement = {}, definition = {}) {
  const legacyStatus = privateListingStatusToCanonicalStatus(legacyDocument.status || legacyRequirement.status || 'uploaded')
  if (legacyStatus === REQUIREMENT_STATUSES.uploaded && definition.review_required) return REQUIREMENT_STATUSES.underReview
  return legacyStatus === REQUIREMENT_STATUSES.pending ? REQUIREMENT_STATUSES.uploaded : legacyStatus
}

export function buildCanonicalUploadPatch(instance = {}, legacyDocument = {}, legacyRequirement = {}, definition = {}) {
  const incomingStatus = deriveCanonicalStatusFromLegacyUpload(legacyDocument, legacyRequirement, definition)
  const conflict = detectStatusConflict(instance.status, incomingStatus)
  const status = pickStrongerCanonicalStatus(instance.status, incomingStatus)
  return {
    patch: {
      id: instance.id,
      status,
      satisfied_by_document_id: legacyDocument.document_id || legacyDocument.id || instance.satisfied_by_document_id || null,
      resolver_version: instance.resolver_version || CANONICAL_RESOLVER_VERSION,
      source_system: instance.source_system || CANONICAL_DOCUMENT_ADAPTER_SOURCE,
    },
    conflict,
  }
}

export function findMatchingCanonicalInstance(legacyRequirement = {}, instances = []) {
  const canonicalId = legacyRequirement.canonical_requirement_instance_id
  if (canonicalId) {
    const direct = instances.find((item) => item.id === canonicalId)
    if (direct) return { instance: direct, strategy: 'canonical_requirement_instance_id' }
  }

  const canonicalKey = legacyRequirementKeyToCanonicalKey(legacyRequirement.requirement_key || legacyRequirement.document_key || legacyRequirement.document_type)
  const mapped = instances.find((item) => item.document_definition_key === canonicalKey)
  if (mapped) return { instance: mapped, strategy: 'explicit_key_mapping' }

  return { instance: null, strategy: 'unmapped' }
}

export function getUnmappedLegacyRequirementKeys(legacyRows = []) {
  return [...new Set(legacyRows
    .map((row) => normalizeKey(row.requirement_key || row.document_key || row.document_type))
    .filter(Boolean)
    .filter((key) => !LEGACY_TO_CANONICAL_REQUIREMENT_KEYS[key] && !getCrossModuleDocumentDefinition(key)))].sort()
}

export function buildAdapterAuditReport({
  canonicalInstances = [],
  legacyRequirements = [],
  legacyDocuments = [],
  packetVersions = [],
} = {}) {
  const projectedKeys = new Set(canonicalInstances.map((item) => canonicalDefinitionKeyToLegacyKey(item.document_definition_key)))
  const legacyKeys = new Set(legacyRequirements.map((item) => normalizeKey(item.requirement_key || item.document_key || item.document_type)).filter(Boolean))
  const duplicateLegacyRequirements = []
  const seen = new Map()

  for (const row of legacyRequirements) {
    const key = normalizeKey(row.requirement_key || row.document_key || row.document_type)
    if (!key) continue
    const count = (seen.get(key) || 0) + 1
    seen.set(key, count)
    if (count === 2) duplicateLegacyRequirements.push(key)
  }

  return {
    unmappedLegacyRequirementKeys: getUnmappedLegacyRequirementKeys(legacyRequirements),
    canonicalInstancesNotProjectedToLegacy: canonicalInstances
      .filter((item) => !legacyKeys.has(canonicalDefinitionKeyToLegacyKey(item.document_definition_key)))
      .map((item) => item.document_definition_key),
    legacyRequirementsWithoutCanonicalInstances: [...legacyKeys]
      .filter((key) => !projectedKeys.has(key))
      .sort(),
    duplicateLegacyRequirements: duplicateLegacyRequirements.sort(),
    statusConflicts: legacyRequirements
      .map((row) => {
        const match = findMatchingCanonicalInstance(row, canonicalInstances).instance
        if (!match) return null
        const incoming = privateListingStatusToCanonicalStatus(row.status)
        const conflict = detectStatusConflict(match.status, incoming)
        return conflict ? { legacyKey: row.requirement_key || row.document_key, canonicalKey: match.document_definition_key, ...conflict } : null
      })
      .filter(Boolean),
    documentsNotLinkedToAnyRequirement: legacyDocuments
      .filter((row) => !row.requirement_id && !row.canonical_requirement_instance_id)
      .map((row) => row.id),
    packetVersionsNotLinkedToMatchingRequirement: packetVersions
      .filter((row) => !row.canonical_requirement_instance_id)
      .map((row) => row.id),
  }
}

function makeSkipResult(reason, options = {}) {
  return {
    skipped: true,
    reason,
    featureFlag: CANONICAL_DOCUMENT_ADAPTERS_FLAG,
    enabled: areCanonicalDocumentAdaptersEnabled(options),
  }
}

async function insertRequirementEvents(client, events = []) {
  if (!events.length) return { inserted: 0 }
  const result = await client.from('document_requirement_events').insert(events)
  if (result.error) throw result.error
  return { inserted: events.length }
}

function buildAdapterEvent(requirementInstanceId, eventType, metadata = {}) {
  return {
    requirement_instance_id: requirementInstanceId,
    event_type: eventType,
    actor_role: 'system',
    actor_user_id: null,
    message: metadata.message || null,
    metadata_json: {
      source_system: CANONICAL_DOCUMENT_ADAPTER_SOURCE,
      ...metadata,
    },
  }
}

function indexedBy(rows = [], keys = []) {
  const map = new Map()
  for (const row of rows) {
    for (const key of keys) {
      const value = normalizeText(row[key])
      if (value && !map.has(`${key}:${value}`)) map.set(`${key}:${value}`, row)
    }
  }
  return map
}

export async function syncCanonicalToPrivateListingRequirements({ contextId, listingId = null, client = supabase, force = false } = {}) {
  if (!areCanonicalDocumentAdaptersEnabled({ force })) return makeSkipResult('canonical_document_adapters_disabled', { force })
  const db = requireClient(client)
  const resolvedListingId = listingId || contextId
  if (!resolvedListingId) throw new Error('listingId or contextId is required.')

  const instanceResult = await db
    .from('document_requirement_instances')
    .select('*, document_definitions(*)')
    .eq('context_type', 'private_listing')
    .or(`context_id.eq.${resolvedListingId},listing_id.eq.${resolvedListingId}`)
  if (instanceResult.error) throw instanceResult.error

  const legacyResult = await db
    .from('private_listing_document_requirements')
    .select('*')
    .eq('private_listing_id', resolvedListingId)
  if (legacyResult.error) throw legacyResult.error

  const legacyByLinkOrKey = indexedBy(legacyResult.data || [], ['canonical_requirement_instance_id', 'requirement_key'])
  const rows = (instanceResult.data || []).map((instance) => {
    const legacyKey = canonicalDefinitionKeyToLegacyKey(instance.document_definition_key)
    const existing = legacyByLinkOrKey.get(`canonical_requirement_instance_id:${instance.id}`) || legacyByLinkOrKey.get(`requirement_key:${legacyKey}`) || null
    return canonicalInstanceToPrivateListingRequirement(instance, existing)
  })

  if (!rows.length) return { skipped: false, synced: 0, rows: [] }
  const write = await db
    .from('private_listing_document_requirements')
    .upsert(rows, { onConflict: 'private_listing_id,requirement_key' })
    .select('*')
  if (write.error) throw write.error

  await insertRequirementEvents(db, (instanceResult.data || []).map((instance) => buildAdapterEvent(instance.id, ADAPTER_EVENT_TYPES.legacySynced, {
    legacy_table: 'private_listing_document_requirements',
    listing_id: resolvedListingId,
  })))

  return { skipped: false, synced: write.data?.length || 0, rows: write.data || [] }
}

export async function syncCanonicalToTransactionRequiredDocuments({ transactionId, client = supabase, force = false } = {}) {
  if (!areCanonicalDocumentAdaptersEnabled({ force })) return makeSkipResult('canonical_document_adapters_disabled', { force })
  const db = requireClient(client)
  if (!transactionId) throw new Error('transactionId is required.')

  const instanceResult = await db
    .from('document_requirement_instances')
    .select('*, document_definitions(*)')
    .eq('context_type', 'transaction')
    .eq('transaction_id', transactionId)
  if (instanceResult.error) throw instanceResult.error

  const legacyResult = await db
    .from('transaction_required_documents')
    .select('*')
    .eq('transaction_id', transactionId)
  if (legacyResult.error) throw legacyResult.error

  const legacyByLinkOrKey = indexedBy(legacyResult.data || [], ['canonical_requirement_instance_id', 'document_key'])
  const rows = (instanceResult.data || []).map((instance) => {
    const instanceWithTransaction = { ...instance, transaction_id: instance.transaction_id || transactionId }
    const legacyKey = canonicalDefinitionKeyToLegacyKey(instance.document_definition_key)
    const existing = legacyByLinkOrKey.get(`canonical_requirement_instance_id:${instance.id}`) || legacyByLinkOrKey.get(`document_key:${legacyKey}`) || null
    return canonicalInstanceToTransactionRequiredDocument(instanceWithTransaction, existing)
  })

  if (!rows.length) return { skipped: false, synced: 0, rows: [] }
  const write = await db
    .from('transaction_required_documents')
    .upsert(rows, { onConflict: 'transaction_id,document_key' })
    .select('*')
  if (write.error) throw write.error

  await insertRequirementEvents(db, (instanceResult.data || []).map((instance) => buildAdapterEvent(instance.id, ADAPTER_EVENT_TYPES.legacySynced, {
    legacy_table: 'transaction_required_documents',
    transaction_id: transactionId,
  })))

  return { skipped: false, synced: write.data?.length || 0, rows: write.data || [] }
}

export async function syncCanonicalToDocumentRequests({ transactionId, contextType = 'transaction', contextId = transactionId, client = supabase, force = false } = {}) {
  if (!areCanonicalDocumentAdaptersEnabled({ force })) return makeSkipResult('canonical_document_adapters_disabled', { force })
  const db = requireClient(client)
  if (!transactionId) throw new Error('transactionId is required.')

  const instanceResult = await db
    .from('document_requirement_instances')
    .select('*, document_definitions(*)')
    .eq('context_type', contextType)
    .eq('context_id', contextId)
    .neq('status', REQUIREMENT_STATUSES.notApplicable)
  if (instanceResult.error) throw instanceResult.error

  const requestResult = await db
    .from('document_requests')
    .select('*')
    .eq('transaction_id', transactionId)
  if (requestResult.error) throw requestResult.error

  const existingByLink = indexedBy(requestResult.data || [], ['canonical_requirement_instance_id'])
  const rows = (instanceResult.data || [])
    .filter((instance) => [REQUIREMENT_LEVELS.blocker, REQUIREMENT_LEVELS.required].includes(instance.requirement_level))
    .filter((instance) => [REQUIREMENT_STATUSES.pending, REQUIREMENT_STATUSES.requested, REQUIREMENT_STATUSES.rejected, REQUIREMENT_STATUSES.expired].includes(instance.status))
    .map((instance) => canonicalInstanceToDocumentRequest({
      ...instance,
      transaction_id: instance.transaction_id || transactionId,
    }, existingByLink.get(`canonical_requirement_instance_id:${instance.id}`)))

  if (!rows.length) return { skipped: false, synced: 0, rows: [] }
  const write = await db
    .from('document_requests')
    .upsert(rows, { onConflict: 'id' })
    .select('*')
  if (write.error) throw write.error

  await insertRequirementEvents(db, rows.map((row) => buildAdapterEvent(row.canonical_requirement_instance_id, ADAPTER_EVENT_TYPES.documentRequestCreated, {
    legacy_table: 'document_requests',
    transaction_id: transactionId,
  })))

  return { skipped: false, synced: write.data?.length || 0, rows: write.data || [] }
}

export async function linkDocumentToCanonicalRequirement(documentId, requirementInstanceId, { client = supabase, status = REQUIREMENT_STATUSES.uploaded, force = false } = {}) {
  if (!areCanonicalDocumentAdaptersEnabled({ force })) return makeSkipResult('canonical_document_adapters_disabled', { force })
  const db = requireClient(client)
  if (!documentId || !requirementInstanceId) throw new Error('documentId and requirementInstanceId are required.')

  const instanceResult = await db
    .from('document_requirement_instances')
    .select('*')
    .eq('id', requirementInstanceId)
    .maybeSingle()
  if (instanceResult.error) throw instanceResult.error
  const instance = instanceResult.data
  const nextStatus = pickStrongerCanonicalStatus(instance?.status, status)

  const documentWrite = await db
    .from('documents')
    .update({ canonical_requirement_instance_id: requirementInstanceId })
    .eq('id', documentId)
  if (documentWrite.error) throw documentWrite.error

  const instanceWrite = await db
    .from('document_requirement_instances')
    .update({
      status: nextStatus,
      satisfied_by_document_id: documentId,
      source_system: CANONICAL_DOCUMENT_ADAPTER_SOURCE,
    })
    .eq('id', requirementInstanceId)
    .select('*')
    .maybeSingle()
  if (instanceWrite.error) throw instanceWrite.error

  await insertRequirementEvents(db, [buildAdapterEvent(requirementInstanceId, ADAPTER_EVENT_TYPES.legacyUploadLinked, {
    document_id: documentId,
    previous_status: instance?.status || null,
    next_status: nextStatus,
  })])

  return instanceWrite.data
}

export async function linkPacketToCanonicalRequirement(packetVersionId, requirementInstanceId, { packetId = null, client = supabase, force = false } = {}) {
  if (!areCanonicalDocumentAdaptersEnabled({ force })) return makeSkipResult('canonical_document_adapters_disabled', { force })
  const db = requireClient(client)
  if (!packetVersionId || !requirementInstanceId) throw new Error('packetVersionId and requirementInstanceId are required.')

  const packetVersionWrite = await db
    .from('document_packet_versions')
    .update({ canonical_requirement_instance_id: requirementInstanceId })
    .eq('id', packetVersionId)
    .select('*')
    .maybeSingle()
  if (packetVersionWrite.error) throw packetVersionWrite.error

  const resolvedPacketId = packetId || packetVersionWrite.data?.packet_id || null
  if (resolvedPacketId) {
    const packetWrite = await db
      .from('document_packets')
      .update({ canonical_requirement_instance_id: requirementInstanceId })
      .eq('id', resolvedPacketId)
    if (packetWrite.error) throw packetWrite.error
  }

  const instanceWrite = await db
    .from('document_requirement_instances')
    .update({
      status: REQUIREMENT_STATUSES.completed,
      satisfied_by_packet_id: resolvedPacketId,
      satisfied_by_packet_version_id: packetVersionId,
      source_system: CANONICAL_DOCUMENT_ADAPTER_SOURCE,
    })
    .eq('id', requirementInstanceId)
    .select('*')
    .maybeSingle()
  if (instanceWrite.error) throw instanceWrite.error

  await insertRequirementEvents(db, [buildAdapterEvent(requirementInstanceId, ADAPTER_EVENT_TYPES.packetLinked, {
    packet_id: resolvedPacketId,
    packet_version_id: packetVersionId,
  })])

  return instanceWrite.data
}

export async function syncPrivateListingUploadsToCanonical({ listingId, contextId = listingId, client = supabase, force = false } = {}) {
  if (!areCanonicalDocumentAdaptersEnabled({ force })) return makeSkipResult('canonical_document_adapters_disabled', { force })
  const db = requireClient(client)
  if (!listingId && !contextId) throw new Error('listingId or contextId is required.')
  const resolvedListingId = listingId || contextId

  const [docsResult, instancesResult] = await Promise.all([
    db
      .from('private_listing_documents')
      .select('*, private_listing_document_requirements(*)')
      .eq('private_listing_id', resolvedListingId),
    db
      .from('document_requirement_instances')
      .select('*, document_definitions(*)')
      .eq('context_type', 'private_listing')
      .or(`context_id.eq.${resolvedListingId},listing_id.eq.${resolvedListingId}`),
  ])
  if (docsResult.error) throw docsResult.error
  if (instancesResult.error) throw instancesResult.error

  const events = []
  const updates = []
  const docUpdates = []
  for (const doc of docsResult.data || []) {
    const legacyRequirement = doc.private_listing_document_requirements || {}
    const match = findMatchingCanonicalInstance({
      ...legacyRequirement,
      canonical_requirement_instance_id: doc.canonical_requirement_instance_id || legacyRequirement.canonical_requirement_instance_id,
      document_type: doc.document_type,
    }, instancesResult.data || [])
    if (!match.instance) {
      events.push(buildAdapterEvent(instancesResult.data?.[0]?.id, ADAPTER_EVENT_TYPES.mappingMissing, {
        legacy_document_id: doc.id,
        legacy_requirement_key: legacyRequirement.requirement_key || doc.document_type || null,
      }))
      continue
    }
    const update = buildCanonicalUploadPatch(match.instance, doc, legacyRequirement, getDefinition(match.instance))
    updates.push(update.patch)
    docUpdates.push({ id: doc.id, canonical_requirement_instance_id: match.instance.id })
    events.push(buildAdapterEvent(match.instance.id, ADAPTER_EVENT_TYPES.legacyUploadLinked, {
      legacy_document_id: doc.id,
      legacy_requirement_id: legacyRequirement.id || null,
      strategy: match.strategy,
      conflict: update.conflict,
    }))
    if (update.conflict) events.push(buildAdapterEvent(match.instance.id, ADAPTER_EVENT_TYPES.statusConflict, update.conflict))
  }

  if (updates.length) {
    const write = await db.from('document_requirement_instances').upsert(updates, { onConflict: 'id' })
    if (write.error) throw write.error
  }
  for (const docUpdate of docUpdates) {
    const write = await db.from('private_listing_documents').update({
      canonical_requirement_instance_id: docUpdate.canonical_requirement_instance_id,
    }).eq('id', docUpdate.id)
    if (write.error) throw write.error
  }
  await insertRequirementEvents(db, events.filter((event) => event.requirement_instance_id))

  return { skipped: false, linked: updates.length, documentUpdates: docUpdates }
}
