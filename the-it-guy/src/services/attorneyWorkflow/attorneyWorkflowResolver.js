import { resolveTransactionFacts } from './transactionFactsResolver.js'
import {
  ATTORNEY_LANE_STAGES,
  getAttorneyDataRequirementsForLane,
  getAttorneyDocumentRequirementKeysForLane,
  getAttorneyReadinessGatesForLane,
  getAttorneyWorkflowUpdateOptions,
} from '../../constants/attorneyWorkflowStages.js'

export { ATTORNEY_LANE_STAGES }

const TRANSFER_UPDATE_OPTIONS = getAttorneyWorkflowUpdateOptions('transfer')
const BOND_UPDATE_OPTIONS = getAttorneyWorkflowUpdateOptions('bond')
const CANCELLATION_UPDATE_OPTIONS = getAttorneyWorkflowUpdateOptions('cancellation')

function buildUpdateOption(optionOrTuple, { category = 'workflow_update', attorneyRole, clientVisibleAllowed = true } = {}) {
  if (!Array.isArray(optionOrTuple)) {
    const option = optionOrTuple || {}
    return {
      id: option.id,
      label: option.label,
      category: option.category || category,
      attorneyRole: option.attorneyRole || attorneyRole,
      laneKey: option.laneKey,
      defaultVisibility: option.defaultVisibility,
      clientVisibleAllowed: option.clientVisibleAllowed ?? clientVisibleAllowed,
      requiresNote: option.requiresNote || false,
      description: option.description || '',
      aliases: option.aliases || [],
      statusBucket: option.statusBucket || null,
      readinessGate: option.readinessGate || null,
    }
  }

  const [id, label] = optionOrTuple
  return {
    id,
    label,
    category,
    attorneyRole,
    clientVisibleAllowed,
  }
}

function documentRequirement({
  id,
  label,
  category,
  appliesTo,
  entityType = null,
  attorneyRole = 'transfer_attorney',
  required = true,
  visibility = 'internal_or_requestable',
  reason,
}) {
  return {
    id,
    label,
    category,
    appliesTo,
    entityType,
    attorneyRole,
    required,
    visibility,
    reason,
  }
}

function signingRequirement({ id, label, attorneyRole, signerType, required = true }) {
  return {
    id,
    label,
    attorneyRole,
    signerType,
    required,
  }
}

export function resolveAttorneyLanes(transactionOrFacts = {}) {
  const facts = transactionOrFacts?.rawFieldsUsed ? transactionOrFacts : resolveTransactionFacts(transactionOrFacts)
  const warnings = [...(facts.confidenceWarnings || [])]

  return {
    transfer: {
      required: true,
      role: 'transfer_attorney',
      label: 'Transfer Attorney',
      reason: 'All property transfers require transfer attorney handling.',
      stages: ATTORNEY_LANE_STAGES.transfer,
      dataRequirements: getAttorneyDataRequirementsForLane('transfer', facts),
      documentRequirementKeys: getAttorneyDocumentRequirementKeysForLane('transfer'),
      readinessGates: getAttorneyReadinessGatesForLane('transfer'),
    },
    bond: {
      required: Boolean(facts.requiresBondAttorney),
      role: 'bond_attorney',
      label: 'Bond Attorney',
      reason: facts.requiresBondAttorney
        ? `Required because finance type is ${facts.financeType === 'hybrid' ? 'Hybrid' : 'Bond'}.`
        : facts.financeType === 'cash'
          ? 'Not required for a cash transaction.'
          : 'Not required until finance type clearly indicates bond or hybrid finance.',
      stages: ATTORNEY_LANE_STAGES.bond,
      dataRequirements: getAttorneyDataRequirementsForLane('bond', facts),
      documentRequirementKeys: getAttorneyDocumentRequirementKeysForLane('bond'),
      readinessGates: getAttorneyReadinessGatesForLane('bond'),
    },
    cancellation: {
      required: Boolean(facts.requiresCancellationAttorney),
      role: 'cancellation_attorney',
      label: 'Cancellation Attorney',
      reason: facts.requiresCancellationAttorney
        ? 'Required because seller bond cancellation is flagged for this transaction.'
        : 'Not required because no seller existing bond or cancellation flag is set.',
      stages: ATTORNEY_LANE_STAGES.cancellation,
      dataRequirements: getAttorneyDataRequirementsForLane('cancellation', facts),
      documentRequirementKeys: getAttorneyDocumentRequirementKeysForLane('cancellation'),
      readinessGates: getAttorneyReadinessGatesForLane('cancellation'),
    },
    warnings,
  }
}

function addBuyerRequirements(requirements, updateOptions, facts) {
  if (facts.buyerIsIndividual) {
    requirements.push(
      documentRequirement({
        id: 'buyer_id_document',
        label: 'Buyer ID Document',
        category: 'fica_documents',
        appliesTo: 'buyer',
        entityType: 'individual',
        reason: 'Individual buyer requires identity verification.',
      }),
      documentRequirement({
        id: 'buyer_proof_of_address',
        label: 'Buyer Proof of Address',
        category: 'fica_documents',
        appliesTo: 'buyer',
        entityType: 'individual',
        reason: 'Individual buyer requires FICA proof of address.',
      }),
      documentRequirement({
        id: 'buyer_marital_status_documents',
        label: 'Buyer Marital Status Documents',
        category: 'entity_documents',
        appliesTo: 'buyer',
        entityType: 'individual',
        reason: 'Marital regime may affect transfer signing authority.',
      }),
    )
  }

  if (facts.buyerIsCompany) {
    requirements.push(
      documentRequirement({
        id: 'buyer_company_registration_documents',
        label: 'Buyer Company Registration Documents',
        category: 'entity_documents',
        appliesTo: 'buyer',
        entityType: 'company',
        reason: 'Company buyer requires registration documents.',
      }),
      documentRequirement({
        id: 'buyer_director_ids',
        label: 'Buyer Director IDs',
        category: 'fica_documents',
        appliesTo: 'buyer',
        entityType: 'company',
        reason: 'Company directors require FICA verification.',
      }),
      documentRequirement({
        id: 'buyer_company_resolution',
        label: 'Buyer Company Resolution',
        category: 'entity_documents',
        appliesTo: 'buyer',
        entityType: 'company',
        reason: 'Company buyer requires proof of authority to sign.',
      }),
      documentRequirement({
        id: 'buyer_beneficial_ownership',
        label: 'Buyer Beneficial Ownership Information',
        category: 'entity_documents',
        appliesTo: 'buyer',
        entityType: 'company',
        reason: 'Beneficial ownership checks may be required for company FICA.',
      }),
    )
    updateOptions.push(
      buildUpdateOption(['buyer_company_resolution_requested', 'Buyer company resolution requested'], {
        category: 'entity_update',
        attorneyRole: 'transfer_attorney',
        clientVisibleAllowed: false,
      }),
      buildUpdateOption(['buyer_company_resolution_received', 'Buyer company resolution received'], {
        category: 'entity_update',
        attorneyRole: 'transfer_attorney',
        clientVisibleAllowed: false,
      }),
      buildUpdateOption(['buyer_signing_authority_confirmed', 'Buyer signing authority confirmed'], {
        category: 'entity_update',
        attorneyRole: 'transfer_attorney',
        clientVisibleAllowed: false,
      }),
    )
  }

  if (facts.buyerIsTrust) {
    requirements.push(
      documentRequirement({
        id: 'buyer_trust_deed',
        label: 'Buyer Trust Deed',
        category: 'entity_documents',
        appliesTo: 'buyer',
        entityType: 'trust',
        reason: 'Trust buyer requires trust deed verification.',
      }),
      documentRequirement({
        id: 'buyer_letters_of_authority',
        label: 'Buyer Letters of Authority',
        category: 'entity_documents',
        appliesTo: 'buyer',
        entityType: 'trust',
        reason: 'Trustees require authority to transact.',
      }),
      documentRequirement({
        id: 'buyer_trustee_ids',
        label: 'Buyer Trustee IDs',
        category: 'fica_documents',
        appliesTo: 'buyer',
        entityType: 'trust',
        reason: 'Trustees require FICA verification.',
      }),
      documentRequirement({
        id: 'buyer_trustee_resolution',
        label: 'Buyer Trustee Resolution',
        category: 'entity_documents',
        appliesTo: 'buyer',
        entityType: 'trust',
        reason: 'Trust buyer requires trustee authority to sign.',
      }),
    )
    updateOptions.push(
      buildUpdateOption(['buyer_trust_deed_requested', 'Buyer trust deed requested'], {
        category: 'entity_update',
        attorneyRole: 'transfer_attorney',
        clientVisibleAllowed: false,
      }),
      buildUpdateOption(['buyer_letters_of_authority_received', 'Letters of authority received'], {
        category: 'entity_update',
        attorneyRole: 'transfer_attorney',
        clientVisibleAllowed: false,
      }),
      buildUpdateOption(['buyer_trustee_resolution_received', 'Trustee resolution received'], {
        category: 'entity_update',
        attorneyRole: 'transfer_attorney',
        clientVisibleAllowed: false,
      }),
    )
  }
}

function addSellerRequirements(requirements, updateOptions, facts) {
  if (facts.sellerIsIndividual) {
    requirements.push(
      documentRequirement({
        id: 'seller_id_document',
        label: 'Seller ID Document',
        category: 'fica_documents',
        appliesTo: 'seller',
        entityType: 'individual',
        reason: 'Individual seller requires identity verification.',
      }),
      documentRequirement({
        id: 'seller_proof_of_address',
        label: 'Seller Proof of Address',
        category: 'fica_documents',
        appliesTo: 'seller',
        entityType: 'individual',
        reason: 'Individual seller requires FICA proof of address.',
      }),
      documentRequirement({
        id: 'seller_marital_status_documents',
        label: 'Seller Marital Status Documents',
        category: 'entity_documents',
        appliesTo: 'seller',
        entityType: 'individual',
        reason: 'Marital regime may affect transfer signing authority.',
      }),
    )
  }

  if (facts.sellerIsCompany) {
    requirements.push(
      documentRequirement({
        id: 'seller_company_registration_documents',
        label: 'Seller Company Registration Documents',
        category: 'entity_documents',
        appliesTo: 'seller',
        entityType: 'company',
        reason: 'Company seller requires registration documents.',
      }),
      documentRequirement({
        id: 'seller_director_ids',
        label: 'Seller Director IDs',
        category: 'fica_documents',
        appliesTo: 'seller',
        entityType: 'company',
        reason: 'Company directors require FICA verification.',
      }),
      documentRequirement({
        id: 'seller_company_resolution',
        label: 'Seller Company Resolution',
        category: 'entity_documents',
        appliesTo: 'seller',
        entityType: 'company',
        reason: 'Company seller requires authority to sell/sign.',
      }),
      documentRequirement({
        id: 'seller_beneficial_ownership',
        label: 'Seller Beneficial Ownership Information',
        category: 'entity_documents',
        appliesTo: 'seller',
        entityType: 'company',
        reason: 'Beneficial ownership checks may be required for company FICA.',
      }),
    )
  }

  if (facts.sellerIsTrust) {
    requirements.push(
      documentRequirement({
        id: 'seller_trust_deed',
        label: 'Seller Trust Deed',
        category: 'entity_documents',
        appliesTo: 'seller',
        entityType: 'trust',
        reason: 'Trust seller requires trust deed verification.',
      }),
      documentRequirement({
        id: 'seller_letters_of_authority',
        label: 'Seller Letters of Authority',
        category: 'entity_documents',
        appliesTo: 'seller',
        entityType: 'trust',
        reason: 'Trustees require authority to transact.',
      }),
      documentRequirement({
        id: 'seller_trustee_ids',
        label: 'Seller Trustee IDs',
        category: 'fica_documents',
        appliesTo: 'seller',
        entityType: 'trust',
        reason: 'Trustees require FICA verification.',
      }),
      documentRequirement({
        id: 'seller_trustee_resolution',
        label: 'Seller Trustee Resolution',
        category: 'entity_documents',
        appliesTo: 'seller',
        entityType: 'trust',
        reason: 'Trust seller requires trustee authority to sign.',
      }),
    )
  }

  if (facts.requiresCancellationAttorney) {
    requirements.push(
      documentRequirement({
        id: 'seller_bond_cancellation_information',
        label: 'Seller Bond Cancellation Information',
        category: 'cancellation_documents',
        appliesTo: 'seller',
        attorneyRole: 'cancellation_attorney',
        reason: 'Seller existing bond requires cancellation handling.',
      }),
      documentRequirement({
        id: 'cancellation_figures',
        label: 'Cancellation Figures',
        category: 'cancellation_documents',
        appliesTo: 'seller',
        attorneyRole: 'cancellation_attorney',
        reason: 'Cancellation figures are required before cancellation guarantees can be accepted.',
      }),
    )
    updateOptions.push(
      ...CANCELLATION_UPDATE_OPTIONS.map((option) => buildUpdateOption(option, { attorneyRole: 'cancellation_attorney' })),
    )
  }
}

function addTransactionTypeRequirements(requirements, facts) {
  if (facts.isDevelopmentSale) {
    requirements.push(
      documentRequirement({
        id: 'developer_documents',
        label: 'Developer Documents',
        category: 'development_documents',
        appliesTo: 'developer',
        reason: 'Development sale requires developer-side supporting documents.',
      }),
      documentRequirement({
        id: 'unit_documents',
        label: 'Unit Documents',
        category: 'development_documents',
        appliesTo: 'property',
        reason: 'Development sale requires unit-specific documents.',
      }),
      documentRequirement({
        id: 'sales_agreement_or_otp',
        label: 'Sales Agreement / OTP',
        category: 'transaction_documents',
        appliesTo: 'transaction',
        reason: 'Development sale requires signed sale agreement or OTP source documents.',
      }),
      documentRequirement({
        id: 'sectional_title_or_hoa_documents',
        label: 'Sectional Title / HOA Documents',
        category: 'property_documents',
        appliesTo: 'property',
        required: false,
        reason: 'Sectional title or HOA documents may apply to development matters.',
      }),
    )
  }

  if (facts.isPrivateSale || facts.isResale) {
    requirements.push(
      documentRequirement({
        id: 'seller_property_documents',
        label: 'Seller Property Documents',
        category: 'property_documents',
        appliesTo: 'seller',
        reason: 'Private/resale transactions require seller-side property documents.',
      }),
      documentRequirement({
        id: 'rates_clearance',
        label: 'Rates Clearance',
        category: 'clearance_documents',
        appliesTo: 'property',
        reason: 'Rates clearance is generally required before lodgement.',
      }),
      documentRequirement({
        id: 'compliance_certificates',
        label: 'Compliance Certificates',
        category: 'property_documents',
        appliesTo: 'property',
        reason: 'Compliance certificates may be required before transfer registration.',
      }),
    )
  }

  if (facts.isCommercialTransaction) {
    requirements.push(
      documentRequirement({
        id: 'commercial_vat_status',
        label: 'VAT Status',
        category: 'commercial_documents',
        appliesTo: 'transaction',
        required: false,
        reason: 'Commercial transactions may require VAT status confirmation.',
      }),
      documentRequirement({
        id: 'lease_information',
        label: 'Lease Information',
        category: 'commercial_documents',
        appliesTo: 'property',
        required: false,
        reason: 'Tenanted commercial properties may require lease information.',
      }),
      documentRequirement({
        id: 'commercial_beneficial_ownership',
        label: 'Beneficial Ownership Checks',
        category: 'commercial_documents',
        appliesTo: 'transaction',
        reason: 'Commercial transactions often require enhanced authority and beneficial ownership checks.',
      }),
    )
  }
}

function addPropertyTenureRequirements(requirements, facts) {
  if (facts.isSectionalTitle) {
    requirements.push(
      documentRequirement({
        id: 'body_corporate_levy_clearance',
        label: 'Body Corporate Levy Clearance',
        category: 'property_documents',
        appliesTo: 'property',
        reason: 'Sectional title transfers require levy clearance from the body corporate.',
      }),
      documentRequirement({
        id: 'sectional_title_conduct_rules',
        label: 'Sectional Title Conduct Rules',
        category: 'property_documents',
        appliesTo: 'property',
        required: false,
        reason: 'Sectional title matters may require body corporate conduct rules.',
      }),
    )
  }

  if (facts.isEstateHoa) {
    requirements.push(
      documentRequirement({
        id: 'hoa_levy_clearance',
        label: 'HOA Levy Clearance',
        category: 'property_documents',
        appliesTo: 'property',
        reason: 'Estate/HOA transfers require HOA levy clearance.',
      }),
      documentRequirement({
        id: 'hoa_consent',
        label: 'HOA Consent',
        category: 'property_documents',
        appliesTo: 'property',
        required: false,
        reason: 'Some estate transfers require HOA consent before transfer.',
      }),
    )
  }
}

function addVatTreatmentRequirements(requirements, facts) {
  if (!facts.hasVatTreatment) return
  requirements.push(
    documentRequirement({
      id: 'vat_status_confirmation',
      label: 'VAT Status Confirmation',
      category: 'commercial_documents',
      appliesTo: 'transaction',
      reason: 'VAT-routed transfers require VAT treatment confirmation.',
    }),
  )
  if (facts.vatTreatment === 'zero_rated_going_concern') {
    requirements.push(
      documentRequirement({
        id: 'zero_rated_going_concern_confirmation',
        label: 'Zero-Rated Going Concern Confirmation',
        category: 'commercial_documents',
        appliesTo: 'transaction',
        reason: 'Zero-rated going concern transactions require supporting VAT confirmation.',
      }),
    )
  }
}

export function resolveLegalRequirements(transactionOrFacts = {}) {
  const facts = transactionOrFacts?.rawFieldsUsed ? transactionOrFacts : resolveTransactionFacts(transactionOrFacts)
  const lanes = resolveAttorneyLanes(facts)
  const requiredAttorneyRoles = Object.values(lanes)
    .filter((lane) => lane?.role && lane.required)
    .map((lane) => lane.role)

  const documentRequirements = []
  const updateOptions = [
    ...TRANSFER_UPDATE_OPTIONS.map((option) => buildUpdateOption(option, { attorneyRole: 'transfer_attorney' })),
  ]
  const signingRequirements = [
    signingRequirement({
      id: 'buyer_transfer_documents_signature',
      label: 'Buyer must sign transfer documents',
      attorneyRole: 'transfer_attorney',
      signerType: 'buyer',
    }),
    signingRequirement({
      id: 'seller_transfer_documents_signature',
      label: 'Seller must sign transfer documents',
      attorneyRole: 'transfer_attorney',
      signerType: 'seller',
    }),
  ]

  addBuyerRequirements(documentRequirements, updateOptions, facts)
  addSellerRequirements(documentRequirements, updateOptions, facts)
  addTransactionTypeRequirements(documentRequirements, facts)
  addPropertyTenureRequirements(documentRequirements, facts)
  addVatTreatmentRequirements(documentRequirements, facts)

  if (facts.requiresBondAttorney) {
    documentRequirements.push(
      documentRequirement({
        id: 'bond_instruction',
        label: 'Bond Instruction',
        category: 'bond_documents',
        appliesTo: 'buyer',
        attorneyRole: 'bond_attorney',
        reason: 'Bond/hybrid transaction requires bond attorney instruction handling.',
      }),
      documentRequirement({
        id: 'bank_requirements',
        label: 'Bank Requirements',
        category: 'bond_documents',
        appliesTo: 'buyer',
        attorneyRole: 'bond_attorney',
        reason: 'Bank conditions must be confirmed for bond registration.',
      }),
    )
    updateOptions.push(...BOND_UPDATE_OPTIONS.map((option) => buildUpdateOption(option, { attorneyRole: 'bond_attorney' })))
    signingRequirements.push(
      signingRequirement({
        id: 'buyer_bond_documents_signature',
        label: 'Buyer must sign bond documents',
        attorneyRole: 'bond_attorney',
        signerType: 'buyer',
      }),
    )
  }

  const dataRequirements = Object.fromEntries(
    Object.entries(lanes)
      .filter(([, lane]) => lane?.required)
      .map(([laneKey, lane]) => [laneKey, lane.dataRequirements || getAttorneyDataRequirementsForLane(laneKey, facts)]),
  )

  return {
    facts,
    lanes,
    requiredAttorneyRoles,
    documentRequirements,
    dataRequirements,
    updateOptions,
    signingRequirements,
    warnings: [...(facts.confidenceWarnings || []), ...(lanes.warnings || [])],
  }
}

export function getAttorneyUpdateOptions(transactionOrFacts = {}, attorneyRole = 'transfer_attorney') {
  const requirements = resolveLegalRequirements(transactionOrFacts)
  return requirements.updateOptions.filter((option) => option.attorneyRole === attorneyRole)
}
