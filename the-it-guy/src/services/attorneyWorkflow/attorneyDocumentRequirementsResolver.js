import { resolveTransactionFacts } from './transactionFactsResolver.js'

export const ATTORNEY_DOCUMENT_CATEGORIES = [
  'fica',
  'entity_documents',
  'transfer_documents',
  'bond_documents',
  'cancellation_documents',
  'property_compliance',
  'development_documents',
  'signing_documents',
  'other',
]

function normalizeCategory(value, fallback = 'other') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'fica_documents') return 'fica'
  if (normalized === 'property_documents' || normalized === 'clearance_documents') return 'property_compliance'
  if (normalized === 'transaction_documents') return 'transfer_documents'
  if (normalized === 'commercial_documents') return 'property_compliance'
  return ATTORNEY_DOCUMENT_CATEGORIES.includes(normalized) ? normalized : fallback
}

function laneKeyFromAttorneyRole(attorneyRole = 'transfer_attorney') {
  if (attorneyRole === 'bond_attorney') return 'bond'
  if (attorneyRole === 'cancellation_attorney') return 'cancellation'
  return 'transfer'
}

function requirement({
  id,
  label,
  description,
  category = 'other',
  laneKey = null,
  attorneyRole = 'transfer_attorney',
  requiredFrom = 'client',
  appliesTo = 'transaction',
  entityType = null,
  required = true,
  requestable = true,
  reviewRequired = true,
  affectsReadiness = true,
  visibilityDefault = 'professional_shared',
  clientUploadAllowed = true,
  reason = '',
}) {
  const normalizedRole = String(attorneyRole || 'transfer_attorney').trim().toLowerCase()
  return {
    id,
    label,
    description: description || reason || label,
    category: normalizeCategory(category),
    laneKey: laneKey || laneKeyFromAttorneyRole(normalizedRole),
    attorneyRole: normalizedRole,
    requiredFrom,
    appliesTo,
    entityType,
    required,
    requestable,
    reviewRequired,
    affectsReadiness,
    visibilityDefault,
    clientUploadAllowed,
    reason,
  }
}

function signingRequirement({
  id,
  label,
  laneKey = 'transfer',
  attorneyRole = 'transfer_attorney',
  signerType,
  required = true,
  sourceRequirementId = null,
  clientVisible = true,
  reason = '',
}) {
  return {
    id,
    label,
    laneKey,
    attorneyRole,
    signerType,
    required,
    sourceRequirementId,
    clientVisible,
    reason,
  }
}

function addCommonTransferRequirements(requirements) {
  requirements.push(
    requirement({
      id: 'sale_agreement_or_otp',
      label: 'Sale Agreement / OTP',
      description: 'Signed source agreement for the property transaction.',
      category: 'transfer_documents',
      requiredFrom: 'agent',
      appliesTo: 'transaction',
      visibilityDefault: 'professional_shared',
      clientUploadAllowed: false,
      reason: 'Transfer attorney requires the sale agreement or OTP to prepare transfer documents.',
    }),
    requirement({
      id: 'buyer_fica',
      label: 'Buyer FICA',
      description: 'Buyer identity and address documents required for FICA verification.',
      category: 'fica',
      requiredFrom: 'buyer',
      appliesTo: 'buyer',
      visibilityDefault: 'client_visible',
      reason: 'Buyer FICA is required for transfer handling.',
    }),
    requirement({
      id: 'seller_fica',
      label: 'Seller FICA',
      description: 'Seller identity and address documents required for FICA verification.',
      category: 'fica',
      requiredFrom: 'seller',
      appliesTo: 'seller',
      visibilityDefault: 'client_visible',
      reason: 'Seller FICA is required for transfer handling.',
    }),
    requirement({
      id: 'transfer_duty_information',
      label: 'Transfer Duty Information',
      category: 'transfer_documents',
      requiredFrom: 'attorney',
      appliesTo: 'transaction',
      clientUploadAllowed: false,
      reason: 'Transfer duty information is required to progress transfer preparation.',
    }),
    requirement({
      id: 'transfer_documents',
      label: 'Transfer Documents',
      category: 'transfer_documents',
      requiredFrom: 'attorney',
      appliesTo: 'transaction',
      clientUploadAllowed: false,
      reason: 'Transfer documents must be prepared and signed.',
    }),
    requirement({
      id: 'rates_clearance',
      label: 'Rates Clearance',
      category: 'property_compliance',
      requiredFrom: 'seller',
      appliesTo: 'property',
      visibilityDefault: 'client_visible',
      reason: 'Rates clearance is generally required before lodgement.',
    }),
  )
}

function addBuyerEntityRequirements(requirements, facts) {
  if (facts.buyerIsIndividual) {
    requirements.push(
      requirement({
        id: 'buyer_id_document',
        label: 'Buyer ID Document',
        category: 'fica',
        requiredFrom: 'buyer',
        appliesTo: 'buyer',
        entityType: 'individual',
        visibilityDefault: 'client_visible',
        reason: 'Individual buyer requires identity verification.',
      }),
      requirement({
        id: 'buyer_proof_of_address',
        label: 'Buyer Proof of Address',
        category: 'fica',
        requiredFrom: 'buyer',
        appliesTo: 'buyer',
        entityType: 'individual',
        visibilityDefault: 'client_visible',
        reason: 'Individual buyer requires proof of residential address.',
      }),
      requirement({
        id: 'buyer_marital_status_details',
        label: 'Buyer Marital Status Details',
        category: 'entity_documents',
        requiredFrom: 'buyer',
        appliesTo: 'buyer',
        entityType: 'individual',
        visibilityDefault: 'client_visible',
        reason: 'Marital regime may affect signing authority.',
      }),
    )
  }

  if (facts.buyerIsCompany) {
    requirements.push(
      requirement({
        id: 'buyer_company_registration_documents',
        label: 'Buyer Company Registration Documents',
        category: 'entity_documents',
        requiredFrom: 'buyer',
        appliesTo: 'buyer',
        entityType: 'company',
        visibilityDefault: 'client_visible',
        reason: 'Company buyer requires registration documents.',
      }),
      requirement({
        id: 'buyer_director_ids',
        label: 'Buyer Director IDs',
        category: 'fica',
        requiredFrom: 'buyer',
        appliesTo: 'buyer',
        entityType: 'company',
        visibilityDefault: 'client_visible',
        reason: 'Company directors require FICA verification.',
      }),
      requirement({
        id: 'buyer_business_address',
        label: 'Buyer Proof of Business Address',
        category: 'fica',
        requiredFrom: 'buyer',
        appliesTo: 'buyer',
        entityType: 'company',
        visibilityDefault: 'client_visible',
        reason: 'Company buyer requires proof of business address.',
      }),
      requirement({
        id: 'buyer_company_resolution',
        label: 'Buyer Company Resolution',
        description: 'Confirms the company has authorised the transaction and the signatory.',
        category: 'entity_documents',
        requiredFrom: 'buyer',
        appliesTo: 'buyer',
        entityType: 'company',
        visibilityDefault: 'client_visible',
        reason: 'Company buyer requires authority to sign.',
      }),
      requirement({
        id: 'buyer_beneficial_ownership',
        label: 'Buyer Beneficial Ownership Information',
        category: 'entity_documents',
        requiredFrom: 'buyer',
        appliesTo: 'buyer',
        entityType: 'company',
        visibilityDefault: 'client_visible',
        reason: 'Beneficial ownership checks may be required for company FICA.',
      }),
    )
  }

  if (facts.buyerIsTrust) {
    requirements.push(
      requirement({
        id: 'buyer_trust_deed',
        label: 'Buyer Trust Deed',
        category: 'entity_documents',
        requiredFrom: 'buyer',
        appliesTo: 'buyer',
        entityType: 'trust',
        visibilityDefault: 'client_visible',
        reason: 'Trust buyer requires trust deed verification.',
      }),
      requirement({
        id: 'buyer_letters_of_authority',
        label: 'Buyer Letters of Authority',
        category: 'entity_documents',
        requiredFrom: 'buyer',
        appliesTo: 'buyer',
        entityType: 'trust',
        visibilityDefault: 'client_visible',
        reason: 'Trustees require letters of authority.',
      }),
      requirement({
        id: 'buyer_trustee_ids',
        label: 'Buyer Trustee IDs',
        category: 'fica',
        requiredFrom: 'buyer',
        appliesTo: 'buyer',
        entityType: 'trust',
        visibilityDefault: 'client_visible',
        reason: 'Trustees require FICA verification.',
      }),
      requirement({
        id: 'buyer_trustee_resolution',
        label: 'Buyer Trustee Resolution',
        category: 'entity_documents',
        requiredFrom: 'buyer',
        appliesTo: 'buyer',
        entityType: 'trust',
        visibilityDefault: 'client_visible',
        reason: 'Trust buyer requires trustee authority to sign.',
      }),
      requirement({
        id: 'buyer_trust_beneficial_ownership',
        label: 'Buyer Trust Beneficial Ownership Information',
        category: 'entity_documents',
        requiredFrom: 'buyer',
        appliesTo: 'buyer',
        entityType: 'trust',
        visibilityDefault: 'client_visible',
        reason: 'Trust beneficial ownership checks may be required.',
      }),
    )
  }
}

function addSellerEntityRequirements(requirements, facts) {
  if (facts.sellerIsIndividual) {
    requirements.push(
      requirement({
        id: 'seller_id_document',
        label: 'Seller ID Document',
        category: 'fica',
        requiredFrom: 'seller',
        appliesTo: 'seller',
        entityType: 'individual',
        visibilityDefault: 'client_visible',
        reason: 'Individual seller requires identity verification.',
      }),
      requirement({
        id: 'seller_proof_of_address',
        label: 'Seller Proof of Address',
        category: 'fica',
        requiredFrom: 'seller',
        appliesTo: 'seller',
        entityType: 'individual',
        visibilityDefault: 'client_visible',
        reason: 'Individual seller requires proof of residential address.',
      }),
      requirement({
        id: 'seller_marital_status_details',
        label: 'Seller Marital Status Details',
        category: 'entity_documents',
        requiredFrom: 'seller',
        appliesTo: 'seller',
        entityType: 'individual',
        visibilityDefault: 'client_visible',
        reason: 'Marital regime may affect seller signing authority.',
      }),
    )
  }

  if (facts.sellerIsCompany) {
    requirements.push(
      requirement({
        id: 'seller_company_registration_documents',
        label: 'Seller Company Registration Documents',
        category: 'entity_documents',
        requiredFrom: 'seller',
        appliesTo: 'seller',
        entityType: 'company',
        visibilityDefault: 'client_visible',
        reason: 'Company seller requires registration documents.',
      }),
      requirement({
        id: 'seller_director_ids',
        label: 'Seller Director IDs',
        category: 'fica',
        requiredFrom: 'seller',
        appliesTo: 'seller',
        entityType: 'company',
        visibilityDefault: 'client_visible',
        reason: 'Company seller directors require FICA verification.',
      }),
      requirement({
        id: 'seller_company_resolution',
        label: 'Seller Company Resolution',
        category: 'entity_documents',
        requiredFrom: 'seller',
        appliesTo: 'seller',
        entityType: 'company',
        visibilityDefault: 'client_visible',
        reason: 'Company seller requires authority to sell/sign.',
      }),
      requirement({
        id: 'seller_beneficial_ownership',
        label: 'Seller Beneficial Ownership Information',
        category: 'entity_documents',
        requiredFrom: 'seller',
        appliesTo: 'seller',
        entityType: 'company',
        visibilityDefault: 'client_visible',
        reason: 'Beneficial ownership checks may be required for company seller FICA.',
      }),
    )
  }

  if (facts.sellerIsTrust) {
    requirements.push(
      requirement({
        id: 'seller_trust_deed',
        label: 'Seller Trust Deed',
        category: 'entity_documents',
        requiredFrom: 'seller',
        appliesTo: 'seller',
        entityType: 'trust',
        visibilityDefault: 'client_visible',
        reason: 'Trust seller requires trust deed verification.',
      }),
      requirement({
        id: 'seller_letters_of_authority',
        label: 'Seller Letters of Authority',
        category: 'entity_documents',
        requiredFrom: 'seller',
        appliesTo: 'seller',
        entityType: 'trust',
        visibilityDefault: 'client_visible',
        reason: 'Trustees require authority to transact.',
      }),
      requirement({
        id: 'seller_trustee_ids',
        label: 'Seller Trustee IDs',
        category: 'fica',
        requiredFrom: 'seller',
        appliesTo: 'seller',
        entityType: 'trust',
        visibilityDefault: 'client_visible',
        reason: 'Trustees require FICA verification.',
      }),
      requirement({
        id: 'seller_trustee_resolution',
        label: 'Seller Trustee Resolution',
        category: 'entity_documents',
        requiredFrom: 'seller',
        appliesTo: 'seller',
        entityType: 'trust',
        visibilityDefault: 'client_visible',
        reason: 'Trust seller requires trustee authority to sign.',
      }),
    )
  }
}

function addBondRequirements(requirements, signingRequirements, facts) {
  if (!facts.requiresBondAttorney) return

  const bondBase = {
    laneKey: 'bond',
    attorneyRole: 'bond_attorney',
    category: 'bond_documents',
    requiredFrom: 'buyer',
    appliesTo: 'buyer',
    visibilityDefault: 'professional_shared',
  }

  requirements.push(
    requirement({ ...bondBase, id: 'bond_instruction', label: 'Bond Instruction', reason: 'Bond/hybrid transaction requires bond instruction handling.' }),
    requirement({ ...bondBase, id: 'bond_grant_letter', label: 'Grant Letter', reason: 'Bond grant letter confirms approved bond terms.' }),
    requirement({ ...bondBase, id: 'bank_requirements', label: 'Bank Requirements', reason: 'Bank requirements must be confirmed for bond registration.' }),
    requirement({ ...bondBase, id: 'buyer_bank_fica', label: 'Buyer FICA for Bank', visibilityDefault: 'client_visible', reason: 'Bank may require buyer FICA documents.' }),
    requirement({ ...bondBase, id: 'bond_documents', label: 'Bond Documents', requiredFrom: 'attorney', clientUploadAllowed: false, reason: 'Bond documents must be prepared and signed.' }),
    requirement({ ...bondBase, id: 'bank_signing_documents', label: 'Bank Signing Documents', requiredFrom: 'attorney', clientUploadAllowed: false, reason: 'Bank signing pack is required for bond registration.' }),
    requirement({ ...bondBase, id: 'guarantees_issued', label: 'Guarantees Issued', requiredFrom: 'attorney', clientUploadAllowed: false, reason: 'Guarantees must be issued for the transfer process.' }),
    requirement({ ...bondBase, id: 'bank_approval_conditions', label: 'Bank Approval Conditions', required: false, reason: 'Bank approval conditions may apply.' }),
    requirement({ ...bondBase, id: 'proof_of_insurance', label: 'Proof of Insurance', required: false, visibilityDefault: 'client_visible', reason: 'Insurance proof may be required by the bank.' }),
    requirement({ ...bondBase, id: 'banking_mandate', label: 'Debit Order / Banking Mandate', required: false, visibilityDefault: 'client_visible', reason: 'Banking mandate may be required by the lender.' }),
  )

  signingRequirements.push(
    signingRequirement({
      id: 'buyer_bond_documents_signature',
      label: 'Buyer Bond Documents Signature',
      laneKey: 'bond',
      attorneyRole: 'bond_attorney',
      signerType: 'buyer',
      sourceRequirementId: 'bond_documents',
      reason: 'Buyer must sign bond documents for bond registration.',
    }),
  )
}

function addCancellationRequirements(requirements, signingRequirements, facts) {
  if (!facts.requiresCancellationAttorney) return

  const cancellationBase = {
    laneKey: 'cancellation',
    attorneyRole: 'cancellation_attorney',
    category: 'cancellation_documents',
    requiredFrom: 'seller',
    appliesTo: 'seller',
    visibilityDefault: 'client_visible',
  }

  requirements.push(
    requirement({ ...cancellationBase, id: 'cancellation_instruction', label: 'Cancellation Instruction', reason: 'Cancellation instruction is required when seller bond cancellation applies.' }),
    requirement({ ...cancellationBase, id: 'existing_bond_account_details', label: 'Existing Bond Account Details', reason: 'Existing bond account details are required to request cancellation figures.' }),
    requirement({ ...cancellationBase, id: 'cancellation_figures', label: 'Cancellation Figures', visibilityDefault: 'professional_shared', reason: 'Cancellation figures are required before cancellation guarantees can be accepted.' }),
    requirement({ ...cancellationBase, id: 'cancellation_guarantees', label: 'Guarantees for Cancellation', visibilityDefault: 'professional_shared', reason: 'Cancellation guarantees must be accepted by the cancellation attorney.' }),
    requirement({ ...cancellationBase, id: 'bank_cancellation_documents', label: 'Bank Cancellation Documents', visibilityDefault: 'professional_shared', reason: 'Bank cancellation documents must be prepared or received.' }),
    requirement({ ...cancellationBase, id: 'cancellation_consent', label: 'Cancellation Consent', required: false, reason: 'Cancellation consent may be required.' }),
    requirement({ ...cancellationBase, id: 'proof_of_settlement', label: 'Proof of Settlement', required: false, reason: 'Proof of settlement may be required after cancellation settlement.' }),
  )

  signingRequirements.push(
    signingRequirement({
      id: 'seller_cancellation_documents_signature',
      label: 'Seller Cancellation Documents Signature',
      laneKey: 'cancellation',
      attorneyRole: 'cancellation_attorney',
      signerType: 'seller',
      sourceRequirementId: 'bank_cancellation_documents',
      reason: 'Seller may need to sign cancellation documents.',
    }),
  )
}

function addTransactionTypeRequirements(requirements, facts) {
  if (facts.isDevelopmentSale) {
    requirements.push(
      requirement({ id: 'developer_sale_pack', label: 'Developer Sale Pack', category: 'development_documents', requiredFrom: 'developer', appliesTo: 'developer', clientUploadAllowed: false, reason: 'Development sale requires developer sale pack.' }),
      requirement({ id: 'unit_schedule', label: 'Unit Schedule', category: 'development_documents', requiredFrom: 'developer', appliesTo: 'property', clientUploadAllowed: false, reason: 'Development sale requires unit schedule.' }),
      requirement({ id: 'building_plans', label: 'Building Plans', category: 'development_documents', requiredFrom: 'developer', appliesTo: 'property', required: false, clientUploadAllowed: false, reason: 'Building plans may be required for development matters.' }),
      requirement({ id: 'occupation_certificate', label: 'Occupation Certificate', category: 'development_documents', requiredFrom: 'developer', appliesTo: 'property', required: false, clientUploadAllowed: false, reason: 'Occupation certificate may be required where applicable.' }),
      requirement({ id: 'hoa_body_corporate_rules', label: 'HOA / Body Corporate Rules', category: 'development_documents', requiredFrom: 'developer', appliesTo: 'property', required: false, clientUploadAllowed: false, reason: 'HOA or body corporate rules may apply.' }),
      requirement({ id: 'sectional_title_documents', label: 'Sectional Title Documents', category: 'development_documents', requiredFrom: 'developer', appliesTo: 'property', required: false, clientUploadAllowed: false, reason: 'Sectional title documents may apply.' }),
      requirement({ id: 'developer_signing_authority', label: 'Developer Signing Authority', category: 'entity_documents', requiredFrom: 'developer', appliesTo: 'developer', clientUploadAllowed: false, reason: 'Developer signing authority must be confirmed.' }),
      requirement({ id: 'nhbrc_compliance_documents', label: 'NHBRC / Compliance Documents', category: 'development_documents', requiredFrom: 'developer', appliesTo: 'property', required: false, clientUploadAllowed: false, reason: 'NHBRC or compliance documents may apply.' }),
    )
  }

  if (facts.isPrivateSale || facts.isResale) {
    requirements.push(
      requirement({ id: 'title_deed_copy', label: 'Title Deed Copy', category: 'property_compliance', requiredFrom: 'seller', appliesTo: 'property', required: false, visibilityDefault: 'client_visible', reason: 'Title deed copy is useful where available.' }),
      requirement({ id: 'levy_clearance', label: 'Levy Clearance', category: 'property_compliance', requiredFrom: 'seller', appliesTo: 'property', required: false, visibilityDefault: 'client_visible', reason: 'Levy clearance applies to sectional title or HOA properties.' }),
      requirement({ id: 'electrical_compliance_certificate', label: 'Electrical Compliance Certificate', category: 'property_compliance', requiredFrom: 'seller', appliesTo: 'property', visibilityDefault: 'client_visible', reason: 'Electrical compliance is commonly required for transfer.' }),
      requirement({ id: 'gas_compliance_certificate', label: 'Gas Compliance Certificate', category: 'property_compliance', requiredFrom: 'seller', appliesTo: 'property', required: false, visibilityDefault: 'client_visible', reason: 'Gas compliance is required if gas installations apply.' }),
      requirement({ id: 'electric_fence_certificate', label: 'Electric Fence Certificate', category: 'property_compliance', requiredFrom: 'seller', appliesTo: 'property', required: false, visibilityDefault: 'client_visible', reason: 'Electric fence certificate is required if an electric fence applies.' }),
      requirement({ id: 'beetle_certificate', label: 'Beetle Certificate', category: 'property_compliance', requiredFrom: 'seller', appliesTo: 'property', required: false, visibilityDefault: 'client_visible', reason: 'Beetle certificate may apply by region or agreement.' }),
    )
  }

  if (facts.isCommercialTransaction) {
    requirements.push(
      requirement({ id: 'vat_status_confirmation', label: 'VAT Status Confirmation', category: 'property_compliance', requiredFrom: 'seller', appliesTo: 'transaction', required: false, visibilityDefault: 'professional_shared', reason: 'Commercial transactions may require VAT treatment confirmation.' }),
      requirement({ id: 'lease_agreements', label: 'Lease Agreements', category: 'property_compliance', requiredFrom: 'seller', appliesTo: 'property', required: false, visibilityDefault: 'professional_shared', reason: 'Tenanted commercial properties require lease information.' }),
      requirement({ id: 'occupancy_schedule', label: 'Occupancy Schedule', category: 'property_compliance', requiredFrom: 'seller', appliesTo: 'property', required: false, visibilityDefault: 'professional_shared', reason: 'Occupancy information may be needed for commercial transfer.' }),
      requirement({ id: 'zoning_use_information', label: 'Zoning / Use Information', category: 'property_compliance', requiredFrom: 'seller', appliesTo: 'property', required: false, visibilityDefault: 'professional_shared', reason: 'Zoning or permitted-use information may be required.' }),
      requirement({ id: 'property_income_schedule', label: 'Property Income Schedule', category: 'property_compliance', requiredFrom: 'seller', appliesTo: 'property', required: false, visibilityDefault: 'professional_shared', reason: 'Income schedule may be required for investment commercial transactions.' }),
    )
  }
}

function addBaseSigningRequirements(signingRequirements, facts) {
  signingRequirements.push(
    signingRequirement({
      id: 'buyer_transfer_signature',
      label: 'Buyer Transfer Signature',
      signerType: 'buyer',
      sourceRequirementId: 'transfer_documents',
      reason: 'Buyer must sign transfer documents.',
    }),
    signingRequirement({
      id: 'seller_transfer_signature',
      label: 'Seller Transfer Signature',
      signerType: 'seller',
      sourceRequirementId: 'transfer_documents',
      reason: 'Seller must sign transfer documents.',
    }),
  )

  if (facts.buyerIsCompany) {
    signingRequirements.push(signingRequirement({
      id: 'buyer_director_resolution_signature',
      label: 'Buyer Director Resolution Signature',
      signerType: 'buyer_representative',
      sourceRequirementId: 'buyer_company_resolution',
      reason: 'Company buyer resolution must be signed by authorised representative/directors.',
    }))
  }
  if (facts.buyerIsTrust) {
    signingRequirements.push(signingRequirement({
      id: 'buyer_trustee_resolution_signature',
      label: 'Buyer Trustee Resolution Signature',
      signerType: 'buyer_trustee',
      sourceRequirementId: 'buyer_trustee_resolution',
      reason: 'Trust buyer resolution must be signed by trustees.',
    }))
  }
  if (facts.sellerIsCompany) {
    signingRequirements.push(signingRequirement({
      id: 'seller_director_resolution_signature',
      label: 'Seller Director Resolution Signature',
      signerType: 'seller_representative',
      sourceRequirementId: 'seller_company_resolution',
      reason: 'Company seller resolution must be signed by authorised representative/directors.',
    }))
  }
  if (facts.sellerIsTrust) {
    signingRequirements.push(signingRequirement({
      id: 'seller_trustee_resolution_signature',
      label: 'Seller Trustee Resolution Signature',
      signerType: 'seller_trustee',
      sourceRequirementId: 'seller_trustee_resolution',
      reason: 'Trust seller resolution must be signed by trustees.',
    }))
  }
}

function dedupeById(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function resolveAttorneySigningRequirements(transactionOrFacts = {}) {
  const facts = transactionOrFacts?.rawFieldsUsed ? transactionOrFacts : resolveTransactionFacts(transactionOrFacts)
  const signingRequirements = []
  addBaseSigningRequirements(signingRequirements, facts)
  addBondRequirements([], signingRequirements, facts)
  addCancellationRequirements([], signingRequirements, facts)
  return {
    transactionId: facts.transactionId,
    signingRequirements: dedupeById(signingRequirements),
    warnings: [...(facts.confidenceWarnings || [])],
    missingFields: [...(facts.missingFields || [])],
  }
}

export function resolveLegalDocumentRequirements(transactionOrFacts = {}) {
  const facts = transactionOrFacts?.rawFieldsUsed ? transactionOrFacts : resolveTransactionFacts(transactionOrFacts)
  const requirements = []
  const signingRequirements = []

  addCommonTransferRequirements(requirements)
  addBuyerEntityRequirements(requirements, facts)
  addSellerEntityRequirements(requirements, facts)
  addTransactionTypeRequirements(requirements, facts)
  addBaseSigningRequirements(signingRequirements, facts)
  addBondRequirements(requirements, signingRequirements, facts)
  addCancellationRequirements(requirements, signingRequirements, facts)

  return {
    transactionId: facts.transactionId,
    facts,
    requirements: dedupeById(requirements),
    signingRequirements: dedupeById(signingRequirements),
    warnings: [...(facts.confidenceWarnings || [])],
    missingFields: [...(facts.missingFields || [])],
  }
}

export { normalizeCategory as normalizeAttorneyDocumentCategory }
