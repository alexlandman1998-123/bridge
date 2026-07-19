import {
  createTransactionProgressDefinition,
} from '../core/transactions/sharedTransactionProgressContract.js'

export const ATTORNEY_WORKFLOW_LANES = {
  transfer: {
    laneKey: 'transfer',
    role: 'transfer_attorney',
    label: 'Transfer Attorney',
    processType: 'transfer',
  },
  bond: {
    laneKey: 'bond',
    role: 'bond_attorney',
    label: 'Bond Attorney',
    processType: 'bond',
  },
  cancellation: {
    laneKey: 'cancellation',
    role: 'cancellation_attorney',
    label: 'Cancellation Attorney',
    processType: 'cancellation',
  },
}

export const ATTORNEY_WORKFLOW_STATUS_BUCKETS = Object.freeze({
  notStarted: 'not_started',
  waitingOnParty: 'waiting_on_party',
  blocked: 'blocked',
  ready: 'ready',
  lodged: 'lodged',
  registered: 'registered',
  complete: 'complete',
})

const ATTORNEY_WORKFLOW_STATUS_LABELS = Object.freeze({
  not_started: 'Not Started',
  waiting_on_party: 'Waiting on Party',
  blocked: 'Blocked',
  ready: 'Ready',
  lodged: 'Lodged',
  registered: 'Registered',
  complete: 'Complete',
})

const DEFAULT_REQUIRED_DATA_VISIBILITY = 'internal'

function normalizeLaneKey(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/_attorney$/, '')
  if (normalized === 'bond') return 'bond'
  if (normalized === 'cancellation') return 'cancellation'
  return 'transfer'
}

function normalizeStatusBucket(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return ATTORNEY_WORKFLOW_STATUS_LABELS[normalized] ? normalized : ATTORNEY_WORKFLOW_STATUS_BUCKETS.notStarted
}

function dataRequirement({
  id,
  label,
  fields = [],
  factKey = null,
  description = '',
  owner = 'attorney',
  severity = 'medium',
  required = true,
  visibility = DEFAULT_REQUIRED_DATA_VISIBILITY,
  appliesWhen = null,
} = {}) {
  return {
    id,
    label,
    fields: Array.isArray(fields) ? fields.filter(Boolean) : [fields].filter(Boolean),
    factKey,
    description,
    owner,
    severity,
    required,
    visibility,
    appliesWhen,
  }
}

function readinessGate(key, label) {
  return key ? { key, label: label || toTitleLabel(key) } : null
}

function toTitleLabel(value = '') {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function stage({
  laneKey,
  key,
  label,
  description,
  actionLabel = null,
  updateLabel = label,
  defaultVisibility = 'professional_shared',
  clientVisibleAllowed = true,
  aliases = [],
  ownerRole = null,
  ownerLabel = null,
  statusBucket = ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty,
  readinessGate: gate = null,
  evidenceRequirements = [],
  requiredData = [],
  requiredDocuments = [],
  requiresNote = false,
  professionalProgressText = '',
  clientProgressTitle = '',
  clientProgressText = '',
}) {
  const lane = normalizeLaneKey(laneKey)
  const laneMeta = ATTORNEY_WORKFLOW_LANES[lane]
  const processLabel = lane === 'transfer'
    ? 'Property transfer'
    : lane === 'bond'
      ? 'Bond registration'
      : 'Bond cancellation'
  const sharedProgress = createTransactionProgressDefinition({
    processKey: lane,
    processLabel,
    stepKey: key,
    ownerRole: ownerRole || laneMeta.role,
    defaultVisibility,
    clientVisibleAllowed,
    professionalTitle: updateLabel || label,
    professionalDescription: professionalProgressText || description,
    clientTitle: clientProgressTitle || `${processLabel} update`,
    clientDescription: clientProgressText || `${processLabel} is currently at: ${label}.`,
  })
  return {
    key,
    label,
    description,
    actionLabel,
    updateLabel,
    defaultVisibility,
    clientVisibleAllowed,
    aliases,
    laneKey: lane,
    ownerRole: ownerRole || laneMeta.role,
    ownerLabel: ownerLabel || laneMeta.label,
    statusBucket: normalizeStatusBucket(statusBucket),
    readinessGate: gate,
    evidenceRequirements: evidenceRequirements.length ? evidenceRequirements : [`${label} confirmed on the matter record.`],
    requiredData,
    requiredDocuments,
    requiresNote,
    sharedProgress,
  }
}

const transferStage = (config) => stage({ laneKey: 'transfer', ...config })
const bondStage = (config) => stage({ laneKey: 'bond', ...config })
const cancellationStage = (config) => stage({ laneKey: 'cancellation', ...config })

const sharedDataRequirements = {
  financeType: dataRequirement({
    id: 'finance_type',
    label: 'Finance Type',
    fields: ['finance_type', 'transaction_finance_type', 'funding_type', 'purchase_finance_type', 'routingProfile.financeType', 'routing_profile.financeType'],
    factKey: 'financeType',
    description: 'Confirms whether the matter is cash, bond, or hybrid.',
    owner: 'agent',
    severity: 'high',
  }),
  transactionType: dataRequirement({
    id: 'transaction_type',
    label: 'Transaction Type',
    fields: ['transaction_type', 'property_transaction_type', 'sale_type', 'listing_type', 'routingProfile.transactionType', 'routing_profile.transactionType'],
    factKey: 'transactionType',
    description: 'Determines whether development, resale, private sale, or commercial requirements apply.',
    owner: 'agent',
  }),
  buyerEntityType: dataRequirement({
    id: 'buyer_entity_type',
    label: 'Buyer Entity Type',
    fields: ['buyer_entity_type', 'buyer_type', 'purchaser_type', 'purchaser_entity_type', 'routingProfile.buyerEntityType', 'routing_profile.buyerEntityType'],
    factKey: 'buyerEntityType',
    description: 'Determines buyer FICA and authority requirements.',
    owner: 'agent',
    severity: 'high',
  }),
  sellerEntityType: dataRequirement({
    id: 'seller_entity_type',
    label: 'Seller Entity Type',
    fields: ['seller_entity_type', 'seller_type', 'vendor_type', 'routingProfile.sellerEntityType', 'routing_profile.sellerEntityType'],
    factKey: 'sellerEntityType',
    description: 'Determines seller FICA and authority requirements.',
    owner: 'agent',
    severity: 'high',
  }),
  propertyTenure: dataRequirement({
    id: 'property_tenure',
    label: 'Property Tenure',
    fields: ['property_tenure', 'propertyTenure', 'property_structure_type', 'propertyStructureType', 'ownership_type', 'routingProfile.propertyTenure', 'routing_profile.propertyTenure'],
    factKey: 'propertyTenure',
    description: 'Determines rates, levy, HOA, and body corporate dependencies.',
    owner: 'agent',
  }),
  vatTreatment: dataRequirement({
    id: 'vat_treatment',
    label: 'VAT / Transfer Duty Treatment',
    fields: ['vat_treatment', 'vatTreatment', 'transfer_tax_treatment', 'vat_applicable', 'routingProfile.vatTreatment', 'routing_profile.vatTreatment'],
    factKey: 'vatTreatment',
    description: 'Confirms whether transfer duty or VAT treatment applies.',
    owner: 'transfer_attorney',
    appliesWhen: ({ facts }) => facts.transactionType === 'commercial' || facts.transactionType === 'development_sale' || facts.hasVatTreatment,
  }),
}

export const ATTORNEY_WORKFLOW_STAGE_DEFINITIONS = {
  transfer: [
    transferStage({
      key: 'instruction_received',
      label: 'Instruction Received',
      description: 'The transfer instruction and source documents have been received.',
      actionLabel: 'Confirm Instruction',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty,
      readinessGate: readinessGate('attorney_instruction_ready', 'Attorney Instruction Ready'),
      requiredData: [sharedDataRequirements.financeType, sharedDataRequirements.transactionType],
      requiredDocuments: ['sales_agreement_or_otp'],
      evidenceRequirements: ['Transfer instruction received from the instructing party.', 'Signed OTP or source agreement is available or requested.'],
    }),
    transferStage({
      key: 'matter_opened',
      label: 'File Opened and Matter Number Assigned',
      description: 'The conveyancing file is opened and a matter number is recorded.',
      actionLabel: 'Open Matter',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty,
      requiredData: [
        dataRequirement({
          id: 'matter_number',
          label: 'Matter Number',
          fields: ['matter_number', 'matterNumber', 'legal_matter_number', 'conveyancing_matter_number'],
          description: 'Internal matter reference used by the attorney.',
          owner: 'transfer_attorney',
          severity: 'high',
        }),
      ],
      evidenceRequirements: ['Matter number captured.', 'Responsible conveyancer or secretary is allocated.'],
    }),
    transferStage({
      key: 'otp_source_docs_checked',
      label: 'OTP and Source Documents Checked',
      description: 'The sale agreement, parties, purchase price, suspensive conditions, and property details are checked.',
      actionLabel: 'Check Source Documents',
      aliases: ['source_documents_checked', 'otp_checked'],
      requiredData: [
        dataRequirement({
          id: 'purchase_price',
          label: 'Purchase Price',
          fields: ['purchase_price', 'purchasePrice', 'sale_price', 'transaction_amount', 'amount'],
          description: 'Purchase price required for duty and financial reconciliation.',
          owner: 'agent',
          severity: 'high',
        }),
        dataRequirement({
          id: 'property_description',
          label: 'Property Description',
          fields: ['property_description', 'propertyDescription', 'property.address', 'property_address', 'unit.address', 'erf_number', 'erfNumber'],
          description: 'Property description must match source documents.',
          owner: 'agent',
          severity: 'high',
        }),
      ],
      requiredDocuments: ['sales_agreement_or_otp', 'seller_property_documents'],
      evidenceRequirements: ['OTP or sale agreement reviewed.', 'Parties, property, price, and suspensive conditions checked.'],
    }),
    transferStage({
      key: 'buyer_fica_requested',
      label: 'Buyer FICA Requested',
      description: 'Buyer identity, address, and entity authority documents have been requested.',
      actionLabel: 'Request Buyer FICA',
      aliases: ['fica_requested', 'documents_pending'],
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty,
      requiredData: [sharedDataRequirements.buyerEntityType],
      requiredDocuments: ['buyer_id_document', 'buyer_proof_of_address', 'buyer_company_registration_documents', 'buyer_trust_deed'],
      evidenceRequirements: ['Buyer FICA request sent.', 'Requested document list matches buyer entity type.'],
    }),
    transferStage({
      key: 'buyer_fica_received',
      label: 'Buyer FICA Received',
      description: 'Buyer FICA and authority documents have been received for review.',
      actionLabel: 'Mark Buyer FICA Received',
      requiredData: [sharedDataRequirements.buyerEntityType],
      requiredDocuments: ['buyer_id_document', 'buyer_proof_of_address', 'buyer_director_ids', 'buyer_trustee_ids'],
      evidenceRequirements: ['Buyer FICA documents uploaded or received.', 'Missing buyer authority items are recorded.'],
    }),
    transferStage({
      key: 'buyer_fica_approved',
      label: 'Buyer FICA Approved',
      description: 'Buyer FICA and authority documents have been reviewed and approved.',
      actionLabel: 'Approve Buyer FICA',
      requiredDocuments: ['buyer_id_document', 'buyer_proof_of_address', 'buyer_company_resolution', 'buyer_trustee_resolution'],
      evidenceRequirements: ['Buyer FICA review completed.', 'Any buyer authority gaps are resolved or waived.'],
    }),
    transferStage({
      key: 'seller_fica_requested',
      label: 'Seller FICA Requested',
      description: 'Seller identity, address, and authority documents have been requested.',
      actionLabel: 'Request Seller FICA',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty,
      requiredData: [sharedDataRequirements.sellerEntityType],
      requiredDocuments: ['seller_id_document', 'seller_proof_of_address', 'seller_company_registration_documents', 'seller_trust_deed'],
      evidenceRequirements: ['Seller FICA request sent.', 'Requested document list matches seller entity type.'],
    }),
    transferStage({
      key: 'seller_fica_received',
      label: 'Seller FICA Received',
      description: 'Seller FICA and authority documents have been received for review.',
      actionLabel: 'Mark Seller FICA Received',
      aliases: ['fica_received'],
      requiredData: [sharedDataRequirements.sellerEntityType],
      requiredDocuments: ['seller_id_document', 'seller_proof_of_address', 'seller_director_ids', 'seller_trustee_ids'],
      evidenceRequirements: ['Seller FICA documents uploaded or received.', 'Missing seller authority items are recorded.'],
    }),
    transferStage({
      key: 'seller_fica_approved',
      label: 'Seller FICA Approved',
      description: 'Seller FICA and authority documents have been reviewed and approved.',
      actionLabel: 'Approve Seller FICA',
      aliases: ['fica_review', 'fica_reviewed'],
      requiredDocuments: ['seller_id_document', 'seller_proof_of_address', 'seller_company_resolution', 'seller_trustee_resolution'],
      evidenceRequirements: ['Seller FICA review completed.', 'Any seller authority gaps are resolved or waived.'],
    }),
    transferStage({
      key: 'entity_authority_checked',
      label: 'Entity Authority Checked',
      description: 'Company, trust, spouse, marital, or signatory authority is checked where applicable.',
      actionLabel: 'Confirm Authority',
      defaultVisibility: 'internal',
      clientVisibleAllowed: false,
      requiredData: [sharedDataRequirements.buyerEntityType, sharedDataRequirements.sellerEntityType],
      requiredDocuments: ['buyer_company_resolution', 'seller_company_resolution', 'buyer_trustee_resolution', 'seller_trustee_resolution', 'buyer_marital_status_documents', 'seller_marital_status_documents'],
      evidenceRequirements: ['Authority documents reviewed.', 'Signer authority is confirmed for all non-individual or marital-status-sensitive parties.'],
    }),
    transferStage({
      key: 'title_deed_checked',
      label: 'Title Deed or Ownership Checked',
      description: 'The title deed, ownership, restrictions, and property description are checked.',
      actionLabel: 'Check Ownership',
      requiredData: [
        sharedDataRequirements.propertyTenure,
        dataRequirement({
          id: 'title_deed_or_property_identifier',
          label: 'Title Deed / Property Identifier',
          fields: ['title_deed_number', 'titleDeedNumber', 'deed_of_transfer_number', 'erf_number', 'erfNumber', 'property.erf_number', 'unit.erf_number'],
          description: 'Title deed or property identifier used for ownership checks.',
          owner: 'transfer_attorney',
          severity: 'high',
        }),
      ],
      requiredDocuments: ['seller_property_documents'],
      evidenceRequirements: ['Title deed or property ownership source checked.', 'Restrictions or title conditions are recorded.'],
    }),
    transferStage({
      key: 'existing_bond_confirmed',
      label: 'Existing Bond or Cancellation Requirement Confirmed',
      description: 'Any seller existing bond and cancellation requirement is confirmed.',
      actionLabel: 'Confirm Existing Bond',
      defaultVisibility: 'internal',
      clientVisibleAllowed: false,
      requiredData: [
        dataRequirement({
          id: 'seller_existing_bond_status',
          label: 'Seller Existing Bond Status',
          fields: ['seller_has_existing_bond', 'seller_has_bond', 'existing_bond', 'has_existing_bond', 'bond_status', 'seller.bond_status', 'routingProfile.sellerHasExistingBond', 'routing_profile.sellerHasExistingBond'],
          factKey: 'sellerHasExistingBond',
          description: 'Confirms whether a cancellation attorney is needed.',
          owner: 'agent',
          severity: 'high',
        }),
      ],
      requiredDocuments: ['seller_bond_cancellation_information'],
      evidenceRequirements: ['Seller existing bond position captured.', 'Cancellation lane is required or explicitly not required.'],
    }),
    transferStage({
      key: 'transfer_duty_assessment_prepared',
      label: 'Transfer Duty Assessment Prepared',
      description: 'Transfer duty or exemption/VAT treatment is calculated and checked.',
      actionLabel: 'Prepare Duty Assessment',
      defaultVisibility: 'internal',
      requiredData: [
        sharedDataRequirements.vatTreatment,
        dataRequirement({
          id: 'transfer_duty_or_vat_basis',
          label: 'Transfer Duty / VAT Basis',
          fields: ['transfer_duty_amount', 'transferDutyAmount', 'vat_treatment', 'vatTreatment', 'purchase_price', 'purchasePrice'],
          description: 'Amount or basis used for transfer duty/VAT treatment.',
          owner: 'transfer_attorney',
        }),
      ],
      evidenceRequirements: ['Duty/VAT calculation prepared.', 'Assessment basis checked against source documents.'],
    }),
    transferStage({
      key: 'transfer_duty_submitted',
      label: 'Transfer Duty Submitted',
      description: 'Transfer duty declaration or exemption submission has been sent.',
      actionLabel: 'Mark Duty Submitted',
      defaultVisibility: 'internal',
      requiredData: [
        dataRequirement({
          id: 'sars_reference',
          label: 'SARS Reference',
          fields: ['sars_reference', 'sarsReference', 'transfer_duty_reference', 'transferDutyReference'],
          description: 'Reference for submitted duty assessment.',
          owner: 'transfer_attorney',
          required: false,
        }),
      ],
      evidenceRequirements: ['Transfer duty declaration submitted.', 'Submission reference or proof is attached where available.'],
    }),
    transferStage({
      key: 'transfer_duty_receipt_received',
      label: 'Transfer Duty Receipt Received',
      description: 'Transfer duty receipt or exemption confirmation has been received.',
      actionLabel: 'Confirm Duty Receipt',
      requiredDocuments: ['transfer_duty_receipt'],
      evidenceRequirements: ['Transfer duty receipt or exemption confirmation received.', 'Receipt is saved to the matter.'],
    }),
    transferStage({
      key: 'rates_figures_requested',
      label: 'Rates Figures Requested',
      description: 'Municipal rates figures have been requested.',
      actionLabel: 'Request Rates Figures',
      defaultVisibility: 'client_visible',
      professionalProgressText: 'Municipal rates clearance figures have been requested and the transaction is awaiting the municipality.',
      clientProgressTitle: 'Rates clearance requested',
      clientProgressText: 'The attorneys have requested the municipal rates clearance figures and are awaiting the municipality.',
      aliases: ['rates_clearance_requested', 'clearances_requested'],
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty,
      requiredData: [
        dataRequirement({
          id: 'municipal_account_reference',
          label: 'Municipal Account Reference',
          fields: ['municipal_account_number', 'municipalAccountNumber', 'rates_account_number', 'ratesAccountNumber', 'property.rates_account_number'],
          description: 'Rates account or municipal reference for clearance request.',
          owner: 'seller',
          required: false,
        }),
      ],
      evidenceRequirements: ['Rates figures request sent to municipality or managing agent.', 'Request date and reference captured.'],
    }),
    transferStage({
      key: 'rates_payment_confirmed',
      label: 'Rates Payment Confirmed',
      description: 'Rates amount due has been paid or payment arrangement is confirmed.',
      actionLabel: 'Confirm Rates Payment',
      requiredData: [
        dataRequirement({
          id: 'rates_payment_reference',
          label: 'Rates Payment Reference',
          fields: ['rates_payment_reference', 'ratesPaymentReference', 'municipal_payment_reference'],
          description: 'Proof or reference showing rates payment was made.',
          owner: 'transfer_attorney',
          required: false,
        }),
      ],
      evidenceRequirements: ['Rates payment proof or confirmation received.', 'Payment amount matches municipal figures.'],
    }),
    transferStage({
      key: 'rates_clearance_received',
      label: 'Rates Clearance Certificate Received',
      description: 'The rates clearance certificate or equivalent municipal clearance has been received.',
      actionLabel: 'Mark Rates Clearance Received',
      aliases: ['rates_clearance_uploaded', 'clearances_received'],
      requiredDocuments: ['rates_clearance', 'rates_clearance_certificate'],
      evidenceRequirements: ['Rates clearance certificate received.', 'Certificate validity date is checked.'],
    }),
    transferStage({
      key: 'levy_clearance_requested',
      label: 'Levy Clearance Requested',
      description: 'Levy, HOA, or body corporate clearance has been requested where applicable.',
      actionLabel: 'Request Levy Clearance',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty,
      requiredData: [
        dataRequirement({
          id: 'levy_account_reference',
          label: 'Levy / HOA Account Reference',
          fields: ['levy_account_number', 'levyAccountNumber', 'body_corporate_account_number', 'hoa_account_number'],
          description: 'Reference used for levy or HOA clearance.',
          owner: 'seller',
          required: false,
          appliesWhen: ({ facts }) => facts.isSectionalTitle || facts.isEstateHoa,
        }),
      ],
      evidenceRequirements: ['Levy or HOA clearance request sent.', 'Managing agent, body corporate, or HOA details captured where applicable.'],
    }),
    transferStage({
      key: 'levy_clearance_received',
      label: 'Levy Clearance Received',
      description: 'Levy, HOA, or body corporate clearance has been received where applicable.',
      actionLabel: 'Mark Levy Clearance Received',
      aliases: ['levy_clearance_uploaded'],
      requiredDocuments: ['body_corporate_levy_clearance', 'hoa_levy_clearance'],
      evidenceRequirements: ['Levy/HOA clearance certificate received or marked not applicable.', 'Validity date is checked where applicable.'],
    }),
    transferStage({
      key: 'compliance_certificates_received',
      label: 'Compliance Certificates Received',
      description: 'Electrical, gas, beetle, electric fence, plumbing, or other compliance certificates have been received as applicable.',
      actionLabel: 'Confirm Compliance Certificates',
      requiredDocuments: ['compliance_certificates'],
      evidenceRequirements: ['Required compliance certificates received.', 'Certificate expiry and property match are checked.'],
    }),
    transferStage({
      key: 'transfer_documents_prepared',
      label: 'Transfer Documents Prepared',
      description: 'The transfer document pack has been prepared for signature.',
      actionLabel: 'Prepare Transfer Documents',
      aliases: ['preparation_in_progress'],
      readinessGate: readinessGate('lodgement_ready', 'Lodgement Ready'),
      requiredDocuments: ['sales_agreement_or_otp', 'seller_property_documents'],
      evidenceRequirements: ['Power of attorney and transfer documents prepared.', 'Documents checked against parties, property, and finance details.'],
    }),
    transferStage({
      key: 'buyer_signing_scheduled',
      label: 'Buyer Signing Scheduled',
      description: 'Buyer signing appointment or remote signing path has been scheduled.',
      actionLabel: 'Schedule Buyer Signing',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty,
      evidenceRequirements: ['Buyer signing date, time, or remote signing instruction captured.', 'Buyer has received signing requirements.'],
    }),
    transferStage({
      key: 'buyer_signed_transfer_documents',
      label: 'Buyer Signed Transfer Documents',
      description: 'Buyer signatures for the transfer pack have been received.',
      actionLabel: 'Mark Buyer Signed',
      aliases: ['buyer_signed', 'buyer_signed_transfer_docs', 'buyer_signed_documents'],
      requiredDocuments: ['buyer_signed_transfer_documents'],
      evidenceRequirements: ['Buyer signed transfer documents received.', 'Witnessing, certification, and capacity checks completed.'],
    }),
    transferStage({
      key: 'seller_signing_scheduled',
      label: 'Seller Signing Scheduled',
      description: 'Seller signing appointment or remote signing path has been scheduled.',
      actionLabel: 'Schedule Seller Signing',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty,
      evidenceRequirements: ['Seller signing date, time, or remote signing instruction captured.', 'Seller has received signing requirements.'],
    }),
    transferStage({
      key: 'seller_signed_transfer_documents',
      label: 'Seller Signed Transfer Documents',
      description: 'Seller signatures for the transfer pack have been received.',
      actionLabel: 'Mark Seller Signed',
      aliases: ['seller_signed', 'seller_signed_transfer_docs', 'seller_signed_documents'],
      requiredDocuments: ['seller_signed_transfer_documents'],
      evidenceRequirements: ['Seller signed transfer documents received.', 'Witnessing, certification, and capacity checks completed.'],
    }),
    transferStage({
      key: 'guarantees_requested',
      label: 'Guarantees Requested',
      description: 'Guarantees or cash undertakings have been requested from the bond attorney, bank, or buyer.',
      actionLabel: 'Request Guarantees',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty,
      evidenceRequirements: ['Guarantee request sent with correct wording and amounts.', 'Cash undertaking route is captured where applicable.'],
    }),
    transferStage({
      key: 'guarantees_received',
      label: 'Guarantees Received',
      description: 'Guarantees or cash undertakings have been received.',
      actionLabel: 'Confirm Guarantees Received',
      requiredDocuments: ['guarantee_letter'],
      evidenceRequirements: ['Guarantees or cash undertaking received.', 'Guarantee amounts and beneficiary details are checked.'],
    }),
    transferStage({
      key: 'transfer_guarantees_accepted',
      label: 'Guarantees Accepted',
      description: 'Guarantee wording and amount have been accepted for transfer readiness.',
      actionLabel: 'Accept Guarantees',
      requiredDocuments: ['guarantee_letter'],
      evidenceRequirements: ['Guarantee wording accepted.', 'Guarantee amount reconciles to cancellation and seller proceeds.'],
    }),
    transferStage({
      key: 'lodgement_pack_prepared',
      label: 'Lodgement Pack Prepared',
      description: 'The transfer lodgement pack has been assembled and checked.',
      actionLabel: 'Prepare Lodgement Pack',
      aliases: ['lodgement_pack_checked'],
      readinessGate: readinessGate('lodgement_ready', 'Lodgement Ready'),
      evidenceRequirements: ['Lodgement pack assembled.', 'Internal lodgement checklist completed.'],
    }),
    transferStage({
      key: 'lodgement_ready',
      label: 'Lodgement Ready',
      description: 'The transfer pack is ready for Deeds Office lodgement.',
      actionLabel: 'Mark Lodgement Ready',
      aliases: ['ready_for_lodgement'],
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.ready,
      readinessGate: readinessGate('lodgement_ready', 'Lodgement Ready'),
      evidenceRequirements: ['All lodgement blockers cleared.', 'Transfer, bond, and cancellation coordination confirmed where applicable.'],
    }),
    transferStage({
      key: 'lodged_at_deeds_office',
      label: 'Lodged at Deeds Office',
      description: 'The matter has been lodged at the Deeds Office.',
      actionLabel: 'Mark Lodged',
      aliases: ['lodged', 'lodgement_submitted'],
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.lodged,
      readinessGate: readinessGate('lodgement_ready', 'Lodgement Ready'),
      evidenceRequirements: ['Deeds Office lodgement confirmed.', 'Lodgement date and batch/reference captured.'],
    }),
    transferStage({
      key: 'in_prep',
      label: 'On Prep',
      description: 'The matter is on prep for registration.',
      actionLabel: 'Mark On Prep',
      aliases: ['prep'],
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.lodged,
      readinessGate: readinessGate('registration_ready', 'Registration Ready'),
      evidenceRequirements: ['Prep status confirmed by Deeds Office.', 'Expected registration timing captured where available.'],
    }),
    transferStage({
      key: 'registered',
      label: 'Registered',
      description: 'Transfer has registered and close-out can begin.',
      actionLabel: 'Confirm Registration',
      aliases: ['registration_confirmed'],
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.registered,
      readinessGate: readinessGate('registration_ready', 'Registration Ready'),
      requiredDocuments: ['registration_confirmation'],
      evidenceRequirements: ['Registration confirmed at Deeds Office.', 'Registration date captured.'],
    }),
    transferStage({
      key: 'final_accounts_prepared',
      label: 'Final Accounts and Statement Prepared',
      description: 'Final accounts, pro-rations, and statements are prepared.',
      actionLabel: 'Prepare Final Accounts',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.registered,
      evidenceRequirements: ['Final account or statement prepared.', 'Seller proceeds, rates refunds, and fees reconciled.'],
    }),
    transferStage({
      key: 'registration_letter_issued',
      label: 'Registration Letter Issued',
      description: 'Registration letter and final stakeholder notifications have been issued.',
      actionLabel: 'Issue Registration Letter',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.registered,
      evidenceRequirements: ['Registration letter issued to relevant parties.', 'Agent/client/bond/cancellation stakeholders notified as applicable.'],
    }),
    transferStage({
      key: 'matter_closed',
      label: 'Matter Closed',
      description: 'The transfer matter is administratively closed.',
      actionLabel: 'Close Matter',
      aliases: ['transfer_complete', 'file_closed'],
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.complete,
      evidenceRequirements: ['Final account completed.', 'File closure checklist completed and matter archived.'],
    }),
  ],
  bond: [
    bondStage({
      key: 'bond_instruction_received',
      label: 'Bond Instruction Received',
      description: 'Bond attorney instruction has been received and logged.',
      actionLabel: 'Confirm Bond Instruction',
      readinessGate: readinessGate('finance_ready', 'Finance Ready'),
      requiredDocuments: ['bond_instruction'],
      evidenceRequirements: ['Bond instruction received from bank or bond originator.', 'Instruction date and source captured.'],
    }),
    bondStage({
      key: 'bank_reference_captured',
      label: 'Bank and Reference Captured',
      description: 'Bank, branch, bond amount, and reference/account details are captured.',
      actionLabel: 'Capture Bank Details',
      defaultVisibility: 'internal',
      clientVisibleAllowed: false,
      requiredData: [
        dataRequirement({
          id: 'bond_bank',
          label: 'Bond Bank',
          fields: ['bond_bank', 'bank_name', 'bankName', 'finance_bank', 'bond.bank_name'],
          description: 'The registering bank for the bond.',
          owner: 'bond_attorney',
          severity: 'high',
        }),
        dataRequirement({
          id: 'bond_reference',
          label: 'Bond Reference / Account',
          fields: ['bond_reference', 'bank_reference', 'bankReference', 'bond_account_number', 'loan_account_number', 'bond.account_number'],
          description: 'Bank reference or loan account used on the matter.',
          owner: 'bond_attorney',
          severity: 'high',
        }),
      ],
      evidenceRequirements: ['Bank name captured.', 'Bank reference, loan account, or attorney instruction reference captured.'],
    }),
    bondStage({
      key: 'bond_approval_letter_received',
      label: 'Grant / Approval Letter Received',
      description: 'The bank grant or bond approval letter has been received.',
      actionLabel: 'Confirm Approval Letter',
      requiredData: [
        dataRequirement({
          id: 'bond_approval_amount',
          label: 'Bond Approval Amount',
          fields: ['bond_approval_amount', 'approved_bond_amount', 'loan_amount', 'bond.amount'],
          description: 'Approved bond amount required for guarantee and registration checks.',
          owner: 'bond_attorney',
          required: false,
        }),
      ],
      requiredDocuments: ['bond_instruction', 'bond_approval_letter'],
      evidenceRequirements: ['Bank grant or approval letter received.', 'Approval amount and conditions reviewed.'],
    }),
    bondStage({
      key: 'bank_requirements_confirmed',
      label: 'Bank Conditions Reviewed',
      description: 'Bank conditions and attorney requirements have been reviewed.',
      actionLabel: 'Review Bank Conditions',
      aliases: ['bank_conditions_reviewed'],
      defaultVisibility: 'internal',
      clientVisibleAllowed: false,
      requiredDocuments: ['bank_requirements'],
      evidenceRequirements: ['Bank conditions checklist reviewed.', 'Outstanding conditions are listed with owners.'],
    }),
    bondStage({
      key: 'bank_conditions_outstanding',
      label: 'Bank Conditions Outstanding',
      description: 'Outstanding bank conditions are captured and assigned.',
      actionLabel: 'Capture Outstanding Conditions',
      defaultVisibility: 'internal',
      clientVisibleAllowed: false,
      requiresNote: true,
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.blocked,
      evidenceRequirements: ['Outstanding bank conditions captured.', 'Owner and follow-up action recorded for each condition.'],
    }),
    bondStage({
      key: 'bank_conditions_resolved',
      label: 'Bank Conditions Resolved',
      description: 'Bank conditions required before lodgement have been resolved.',
      actionLabel: 'Resolve Bank Conditions',
      requiredDocuments: ['bank_requirements'],
      evidenceRequirements: ['Outstanding bank conditions cleared.', 'Bank or internal confirmation saved.'],
    }),
    bondStage({
      key: 'bond_documents_prepared',
      label: 'Bond Documents Prepared',
      description: 'Bond documentation has been prepared for buyer signature.',
      actionLabel: 'Prepare Bond Documents',
      evidenceRequirements: ['Bond document pack prepared.', 'Bond amount, parties, and property details checked.'],
    }),
    bondStage({
      key: 'buyer_bond_signing_scheduled',
      label: 'Buyer Bond Signing Scheduled',
      description: 'Buyer signing appointment for bond documents has been scheduled.',
      actionLabel: 'Schedule Bond Signing',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty,
      evidenceRequirements: ['Buyer bond signing appointment or remote instruction captured.', 'Buyer signing requirements sent.'],
    }),
    bondStage({
      key: 'buyer_signed_bond_documents',
      label: 'Buyer Signed Bond Documents',
      description: 'Buyer signatures on the bond documents have been received.',
      actionLabel: 'Mark Buyer Signed',
      aliases: ['buyer_signed_bond_docs'],
      requiredDocuments: ['buyer_signed_bond_documents'],
      evidenceRequirements: ['Buyer signed bond documents received.', 'Signing, witnessing, and FICA checks completed.'],
    }),
    bondStage({
      key: 'bond_documents_sent_to_bank',
      label: 'Documents Sent to Bank for Approval',
      description: 'Signed bond documents have been sent to the bank for approval where applicable.',
      actionLabel: 'Send Docs to Bank',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty,
      evidenceRequirements: ['Signed docs sent to bank or uploaded to bank portal.', 'Submission date/reference captured.'],
    }),
    bondStage({
      key: 'bank_approval_to_lodge_received',
      label: 'Bank Approval to Lodge Received',
      description: 'The bank has approved lodgement of the bond documents.',
      actionLabel: 'Confirm Approval to Lodge',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.ready,
      readinessGate: readinessGate('lodgement_ready', 'Lodgement Ready'),
      evidenceRequirements: ['Bank approval to lodge received.', 'Approval date/reference captured.'],
    }),
    bondStage({
      key: 'guarantees_issued',
      label: 'Guarantees Issued',
      description: 'Guarantees have been issued to the transfer attorney.',
      actionLabel: 'Confirm Guarantees Issued',
      aliases: ['grant_signed'],
      requiredDocuments: ['guarantee_letter'],
      evidenceRequirements: ['Guarantees issued to transfer attorney.', 'Guarantee values, wording, and expiry checked.'],
    }),
    bondStage({
      key: 'guarantee_wording_accepted',
      label: 'Guarantee Wording Accepted',
      description: 'Guarantee wording has been accepted by the transfer attorney.',
      actionLabel: 'Confirm Guarantee Wording',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.ready,
      evidenceRequirements: ['Transfer attorney accepted guarantee wording.', 'Any wording amendments are resolved.'],
    }),
    bondStage({
      key: 'bond_lodgement_ready',
      label: 'Bond Lodgement Pack Ready',
      description: 'The bond pack is ready to lodge simultaneously with the transfer.',
      actionLabel: 'Mark Bond Ready',
      aliases: ['bond_lodgement_pack_prepared'],
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.ready,
      readinessGate: readinessGate('lodgement_ready', 'Lodgement Ready'),
      evidenceRequirements: ['Bond lodgement pack complete.', 'Simultaneous lodgement coordination confirmed.'],
    }),
    bondStage({
      key: 'bond_lodged',
      label: 'Bond Lodged Simultaneously',
      description: 'The bond documents have been lodged with the transfer.',
      actionLabel: 'Mark Bond Lodged',
      aliases: ['bond_lodgement_submitted'],
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.lodged,
      readinessGate: readinessGate('lodgement_ready', 'Lodgement Ready'),
      evidenceRequirements: ['Bond lodgement confirmed.', 'Simultaneous lodgement reference captured.'],
    }),
    bondStage({
      key: 'bond_registered',
      label: 'Bond Registered',
      description: 'Bond registration has been confirmed.',
      actionLabel: 'Confirm Bond Registration',
      aliases: ['bond_registration_confirmed'],
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.registered,
      readinessGate: readinessGate('registration_ready', 'Registration Ready'),
      evidenceRequirements: ['Bond registration confirmed.', 'Registration date captured.'],
    }),
    bondStage({
      key: 'bond_close_out_complete',
      label: 'Bank Confirmation and Close-Out Complete',
      description: 'Final bank confirmation and bond close-out tasks are complete.',
      actionLabel: 'Close Bond Matter',
      aliases: ['bank_close_out_complete', 'bond_complete'],
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.complete,
      evidenceRequirements: ['Bank final confirmation completed.', 'Bond attorney close-out checklist completed.'],
    }),
  ],
  cancellation: [
    cancellationStage({
      key: 'cancellation_existing_bond_confirmed',
      label: 'Existing Bond Confirmed',
      description: 'The seller existing bond requiring cancellation has been confirmed.',
      actionLabel: 'Confirm Existing Bond',
      requiredData: [
        dataRequirement({
          id: 'seller_existing_bond_status',
          label: 'Seller Existing Bond Status',
          fields: ['seller_has_existing_bond', 'seller_has_bond', 'existing_bond', 'has_existing_bond', 'bond_status', 'seller.bond_status', 'routingProfile.sellerHasExistingBond', 'routing_profile.sellerHasExistingBond'],
          factKey: 'sellerHasExistingBond',
          description: 'Confirms cancellation is required.',
          owner: 'agent',
          severity: 'high',
        }),
      ],
      evidenceRequirements: ['Seller existing bond confirmed.', 'Cancellation requirement recorded on the matter.'],
    }),
    cancellationStage({
      key: 'cancellation_bank_captured',
      label: 'Cancellation Bank Captured',
      description: 'The cancellation bank has been captured.',
      actionLabel: 'Capture Bank',
      defaultVisibility: 'internal',
      clientVisibleAllowed: false,
      requiredData: [
        dataRequirement({
          id: 'cancellation_bank',
          label: 'Cancellation Bank',
          fields: ['cancellation_bank', 'cancellationBank', 'existing_bond_bank', 'seller_bond_bank', 'seller.bank_name', 'cancellation.bank_name'],
          description: 'Bank holding the existing seller bond.',
          owner: 'seller',
          severity: 'high',
        }),
      ],
      evidenceRequirements: ['Cancellation bank captured.', 'Bank details checked with seller or cancellation instruction.'],
    }),
    cancellationStage({
      key: 'cancellation_bond_account_captured',
      label: 'Bond Account Number Captured',
      description: 'The seller bond account or reference number has been captured.',
      actionLabel: 'Capture Account Number',
      defaultVisibility: 'internal',
      clientVisibleAllowed: false,
      requiredData: [
        dataRequirement({
          id: 'cancellation_bond_account_number',
          label: 'Bond Account Number',
          fields: ['cancellation_bond_account_number', 'bond_account_number', 'seller_bond_account_number', 'existing_bond_account_number', 'home_loan_account_number', 'cancellation.account_number'],
          description: 'Account or reference used to request cancellation figures.',
          owner: 'seller',
          severity: 'high',
        }),
      ],
      evidenceRequirements: ['Bond account number or reference captured.', 'Account details checked before figures request.'],
    }),
    cancellationStage({
      key: 'cancellation_instruction_received',
      label: 'Cancellation Instruction Received',
      description: 'Cancellation instruction has been received by the cancellation attorney.',
      actionLabel: 'Confirm Cancellation Instruction',
      aliases: ['bond_cancellation_instruction_received'],
      requiredDocuments: ['seller_bond_cancellation_information'],
      evidenceRequirements: ['Cancellation instruction received.', 'Instruction source, bank, and reference captured.'],
    }),
    cancellationStage({
      key: 'notice_period_captured',
      label: '90-Day Notice Status Captured',
      description: 'The 90-day notice status and expiry position are captured.',
      actionLabel: 'Capture Notice Status',
      defaultVisibility: 'internal',
      requiredData: [
        dataRequirement({
          id: 'notice_period_status',
          label: '90-Day Notice Status',
          fields: ['notice_period_status', 'noticePeriodStatus', 'ninety_day_notice_status', 'cancellation_notice_status'],
          description: 'Shows whether notice was given and whether penalty risk exists.',
          owner: 'seller',
        }),
      ],
      evidenceRequirements: ['Notice status captured.', 'Notice date or no-notice risk recorded.'],
    }),
    cancellationStage({
      key: 'cancellation_figures_requested',
      label: 'Cancellation Figures Requested',
      description: 'Settlement or cancellation figures have been requested from the bank.',
      actionLabel: 'Request Figures',
      aliases: ['settlement_figures_requested'],
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty,
      evidenceRequirements: ['Cancellation figures request sent to bank.', 'Request date/reference captured.'],
    }),
    cancellationStage({
      key: 'cancellation_figures_received',
      label: 'Cancellation Figures Received',
      description: 'Cancellation figures have been received and checked.',
      actionLabel: 'Mark Figures Received',
      aliases: ['settlement_figures_received'],
      requiredDocuments: ['cancellation_figures'],
      evidenceRequirements: ['Cancellation figures received.', 'Settlement amount and account details checked.'],
    }),
    cancellationStage({
      key: 'figures_expiry_captured',
      label: 'Figures Expiry Date Captured',
      description: 'The cancellation figures expiry date has been captured.',
      actionLabel: 'Capture Expiry Date',
      defaultVisibility: 'internal',
      requiredData: [
        dataRequirement({
          id: 'cancellation_figures_expiry_date',
          label: 'Figures Expiry Date',
          fields: ['cancellation_figures_expiry_date', 'figures_expiry_date', 'settlement_figures_expiry_date', 'cancellation.expiry_date'],
          description: 'Expiry date used to prevent lodging on stale figures.',
          owner: 'cancellation_attorney',
          severity: 'high',
        }),
      ],
      evidenceRequirements: ['Figures expiry date captured.', 'Expiry checked against expected lodgement timeline.'],
    }),
    cancellationStage({
      key: 'notice_penalty_risk_captured',
      label: 'Penalty and Notice Risk Captured',
      description: 'Penalty or short-notice risk is captured and escalated where needed.',
      actionLabel: 'Capture Penalty Risk',
      defaultVisibility: 'internal',
      clientVisibleAllowed: false,
      requiredData: [
        dataRequirement({
          id: 'penalty_notice_risk',
          label: 'Penalty / Notice Risk',
          fields: ['penalty_notice_risk', 'notice_penalty_risk', 'cancellation_penalty_amount', 'early_settlement_penalty'],
          description: 'Risk or penalty position from the cancellation figures.',
          owner: 'cancellation_attorney',
          required: false,
        }),
      ],
      evidenceRequirements: ['Penalty risk reviewed.', 'Any penalty or notice concern escalated to the responsible attorney/client team.'],
    }),
    cancellationStage({
      key: 'cancellation_guarantees_requested',
      label: 'Guarantees Requested',
      description: 'Guarantees have been requested from the transfer or bond attorney.',
      actionLabel: 'Request Guarantees',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty,
      evidenceRequirements: ['Guarantee request sent.', 'Required settlement amount and wording supplied.'],
    }),
    cancellationStage({
      key: 'cancellation_guarantees_received',
      label: 'Guarantees Received',
      description: 'Guarantees have been received for the cancellation.',
      actionLabel: 'Mark Guarantees Received',
      aliases: ['guarantees_received_for_cancellation'],
      requiredDocuments: ['guarantee_letter'],
      evidenceRequirements: ['Cancellation guarantees received.', 'Guarantee amount and bank details checked against figures.'],
    }),
    cancellationStage({
      key: 'cancellation_guarantees_accepted',
      label: 'Guarantees Accepted',
      description: 'Guarantees have been accepted by the cancellation bank or attorney.',
      actionLabel: 'Mark Guarantees Accepted',
      aliases: ['guarantees_accepted', 'guarantees_provided'],
      requiredDocuments: ['guarantee_letter'],
      evidenceRequirements: ['Guarantees accepted.', 'Any guarantee wording changes resolved.'],
    }),
    cancellationStage({
      key: 'cancellation_documents_prepared',
      label: 'Cancellation Documents Prepared',
      description: 'Cancellation documents have been prepared or received.',
      actionLabel: 'Prepare Cancellation Documents',
      aliases: ['cancellation_docs_prepared'],
      evidenceRequirements: ['Cancellation consent or bond documents prepared.', 'Documents checked against bank instruction.'],
    }),
    cancellationStage({
      key: 'seller_cancellation_documents_signed',
      label: 'Seller Cancellation Documents Signed',
      description: 'Seller cancellation documents have been signed where required.',
      actionLabel: 'Mark Seller Signed',
      requiredDocuments: ['seller_signed_cancellation_documents'],
      evidenceRequirements: ['Seller cancellation documents signed where required.', 'Signing authority and witnessing checked.'],
    }),
    cancellationStage({
      key: 'cancellation_lodgement_ready',
      label: 'Cancellation Lodgement Ready',
      description: 'Cancellation is ready to lodge simultaneously with the transfer and bond.',
      actionLabel: 'Mark Cancellation Ready',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.ready,
      readinessGate: readinessGate('lodgement_ready', 'Lodgement Ready'),
      evidenceRequirements: ['Cancellation lodgement pack complete.', 'Figures, guarantees, and simultaneous lodgement coordination confirmed.'],
    }),
    cancellationStage({
      key: 'cancellation_lodged',
      label: 'Cancellation Lodged Simultaneously',
      description: 'Cancellation has been lodged with the linked transfer and bond.',
      actionLabel: 'Mark Cancellation Lodged',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.lodged,
      readinessGate: readinessGate('lodgement_ready', 'Lodgement Ready'),
      evidenceRequirements: ['Cancellation lodgement confirmed.', 'Simultaneous lodgement date/reference captured.'],
    }),
    cancellationStage({
      key: 'cancellation_registered',
      label: 'Cancellation Registered',
      description: 'Seller bond cancellation has registered.',
      actionLabel: 'Confirm Cancellation Registration',
      aliases: ['bond_cancelled'],
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.registered,
      readinessGate: readinessGate('registration_ready', 'Registration Ready'),
      evidenceRequirements: ['Cancellation registration confirmed.', 'Registration date captured.'],
    }),
    cancellationStage({
      key: 'settlement_proof_captured',
      label: 'Settlement / Proof of Payment Captured',
      description: 'Settlement or proof of payment has been captured after cancellation registration.',
      actionLabel: 'Capture Settlement Proof',
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.registered,
      requiredData: [
        dataRequirement({
          id: 'settlement_payment_reference',
          label: 'Settlement Payment Reference',
          fields: ['settlement_payment_reference', 'proof_of_payment_reference', 'cancellation_settlement_reference'],
          description: 'Reference proving settlement after cancellation.',
          owner: 'cancellation_attorney',
          required: false,
        }),
      ],
      evidenceRequirements: ['Settlement proof or payment confirmation captured.', 'Settlement amount reconciled to cancellation figures.'],
    }),
    cancellationStage({
      key: 'cancellation_close_out_complete',
      label: 'Cancellation Close-Out Complete',
      description: 'The cancellation matter is closed out.',
      actionLabel: 'Close Cancellation Matter',
      aliases: ['cancellation_complete'],
      statusBucket: ATTORNEY_WORKFLOW_STATUS_BUCKETS.complete,
      evidenceRequirements: ['Cancellation close-out checklist completed.', 'Bank and stakeholder closure confirmations saved where applicable.'],
    }),
  ],
}

function buildAliasIndex() {
  const byLane = {}
  const global = {}

  for (const [laneKey, definitions] of Object.entries(ATTORNEY_WORKFLOW_STAGE_DEFINITIONS)) {
    byLane[laneKey] = {}
    for (const definition of definitions) {
      const keys = [definition.key, ...(definition.aliases || [])]
      for (const key of keys) {
        byLane[laneKey][key] = definition.key
        if (!global[key]) global[key] = definition.key
      }
    }
  }

  return { byLane, global }
}

export const ATTORNEY_STAGE_ALIAS_INDEX = buildAliasIndex()

export const ATTORNEY_LANE_STAGES = Object.freeze(
  Object.fromEntries(
    Object.entries(ATTORNEY_WORKFLOW_STAGE_DEFINITIONS).map(([laneKey, definitions]) => [
      laneKey,
      Object.freeze(definitions.map((definition) => definition.key)),
    ]),
  ),
)

function cloneWithoutAppliesWhen(item = {}) {
  const rest = { ...item }
  delete rest.appliesWhen
  return rest
}

function requirementApplies(requirement = {}, facts = {}) {
  if (!requirement.appliesWhen) return true
  if (typeof requirement.appliesWhen === 'function') {
    try {
      return Boolean(requirement.appliesWhen({ facts }))
    } catch {
      return true
    }
  }
  return true
}

function readPath(source, path) {
  const parts = String(path || '').split('.').filter(Boolean)
  let current = source
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

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

function hasUsableValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'boolean') return true
  return value !== null && value !== undefined && String(value).trim() !== '' && String(value).trim().toLowerCase() !== 'unknown'
}

function valueFromTransaction(transaction = {}, field = '') {
  const direct = readPath(transaction, field)
  if (hasUsableValue(direct)) return direct
  const routingProfile = parseJsonObject(transaction.routingProfile || transaction.routing_profile || transaction.routing_profile_json || transaction.routingProfileJson)
  if (field.startsWith('routingProfile.')) return readPath(routingProfile, field.replace(/^routingProfile\./, ''))
  if (field.startsWith('routing_profile.')) return readPath(routingProfile, field.replace(/^routing_profile\./, ''))
  return undefined
}

function valueFromFact(requirement = {}, facts = {}) {
  if (!requirement.factKey) return { found: false, value: undefined }
  const value = facts[requirement.factKey]
  if (!hasUsableValue(value)) return { found: false, value }

  const rawFieldsUsed = facts.rawFieldsUsed || {}
  if (typeof value === 'boolean') {
    return { found: Boolean(rawFieldsUsed[requirement.factKey]) || value === true, value }
  }

  return { found: true, value }
}

function resolveDataRequirementStatus(requirement = {}, transaction = {}, facts = {}, laneKey = 'transfer', stageKey = null) {
  const factValue = valueFromFact(requirement, facts)
  const transactionMatch = (requirement.fields || [])
    .map((field) => ({ field, value: valueFromTransaction(transaction, field) }))
    .find((item) => hasUsableValue(item.value))
  const complete = Boolean(factValue.found || transactionMatch)
  return {
    ...cloneWithoutAppliesWhen(requirement),
    laneKey: normalizeLaneKey(laneKey),
    stageKey,
    status: complete ? 'complete' : requirement.required === false ? 'optional_missing' : 'missing',
    complete,
    missing: !complete && requirement.required !== false,
    value: transactionMatch?.value ?? factValue.value ?? null,
    sourceField: transactionMatch?.field || (factValue.found ? requirement.factKey : null),
  }
}

export function normalizeAttorneyStageKey(stageKey, laneKey = null) {
  const normalized = String(stageKey || '').trim().toLowerCase()
  if (!normalized) return ''
  const lane = laneKey ? normalizeLaneKey(laneKey) : null
  return (
    (lane && ATTORNEY_STAGE_ALIAS_INDEX.byLane[lane]?.[normalized]) ||
    ATTORNEY_STAGE_ALIAS_INDEX.global[normalized] ||
    normalized
  )
}

export function getAttorneyStageDefinition(stageKey, laneKey = null) {
  const lane = laneKey ? normalizeLaneKey(laneKey) : null
  const canonicalKey = normalizeAttorneyStageKey(stageKey, lane)

  if (lane) {
    return ATTORNEY_WORKFLOW_STAGE_DEFINITIONS[lane]?.find((definition) => definition.key === canonicalKey) || null
  }

  for (const definitions of Object.values(ATTORNEY_WORKFLOW_STAGE_DEFINITIONS)) {
    const match = definitions.find((definition) => definition.key === canonicalKey)
    if (match) return match
  }
  return null
}

export function getAttorneyStageLabel(stageKey, laneKey = null) {
  const definition = getAttorneyStageDefinition(stageKey, laneKey)
  if (definition?.label) return definition.label
  return toTitleLabel(stageKey)
}

export function getAttorneyStageDefinitionsForLane(laneKey) {
  const lane = normalizeLaneKey(laneKey)
  return [...(ATTORNEY_WORKFLOW_STAGE_DEFINITIONS[lane] || [])]
}

export function getAttorneyStageKeysForLane(laneKey) {
  const lane = normalizeLaneKey(laneKey)
  return [...(ATTORNEY_LANE_STAGES[lane] || [])]
}

export function getAttorneyStageAliases(stageKey, laneKey = null) {
  const canonicalKey = normalizeAttorneyStageKey(stageKey, laneKey)
  const lane = laneKey ? normalizeLaneKey(laneKey) : null
  const definitions = lane
    ? ATTORNEY_WORKFLOW_STAGE_DEFINITIONS[lane] || []
    : Object.values(ATTORNEY_WORKFLOW_STAGE_DEFINITIONS).flat()
  const definition = definitions.find((item) => item.key === canonicalKey)
  return definition ? [definition.key, ...(definition.aliases || [])] : [canonicalKey].filter(Boolean)
}

export function attorneyStageKeyMatches(candidateKey, expectedKeys = [], laneKey = null) {
  const canonicalCandidate = normalizeAttorneyStageKey(candidateKey, laneKey)
  return expectedKeys.some((key) => normalizeAttorneyStageKey(key, laneKey) === canonicalCandidate)
}

export function getAttorneyWorkflowStatusBucket(stageKey, laneKey = null) {
  const definition = getAttorneyStageDefinition(stageKey, laneKey)
  return definition?.statusBucket || ATTORNEY_WORKFLOW_STATUS_BUCKETS.notStarted
}

export function getAttorneyWorkflowStatusLabel(statusBucket = '') {
  const normalized = normalizeStatusBucket(statusBucket)
  return ATTORNEY_WORKFLOW_STATUS_LABELS[normalized] || toTitleLabel(normalized)
}

export function resolveAttorneyWorkflowState({ laneKey = 'transfer', laneStatus = '', currentStage = '', summary = {} } = {}) {
  const normalizedLaneStatus = String(laneStatus || summary.status || '').trim().toLowerCase()
  if (normalizedLaneStatus === 'blocked') return ATTORNEY_WORKFLOW_STATUS_BUCKETS.blocked
  if (normalizedLaneStatus === 'waiting') return ATTORNEY_WORKFLOW_STATUS_BUCKETS.waitingOnParty
  if (normalizedLaneStatus === 'completed' || normalizedLaneStatus === 'complete') return ATTORNEY_WORKFLOW_STATUS_BUCKETS.complete
  if (normalizedLaneStatus === 'not_started' && !currentStage && !summary.currentStage) return ATTORNEY_WORKFLOW_STATUS_BUCKETS.notStarted
  const stageKey = currentStage || summary.currentStage
  return stageKey ? getAttorneyWorkflowStatusBucket(stageKey, laneKey) : ATTORNEY_WORKFLOW_STATUS_BUCKETS.notStarted
}

export function getAttorneyWorkflowUpdateOptions(laneKey) {
  const lane = normalizeLaneKey(laneKey)
  const laneMeta = ATTORNEY_WORKFLOW_LANES[lane]
  return getAttorneyStageDefinitionsForLane(lane).map((definition) => ({
    id: definition.key,
    label: definition.updateLabel || definition.label,
    category: lane,
    attorneyRole: laneMeta.role,
    laneKey: lane,
    defaultVisibility: definition.defaultVisibility,
    clientVisibleAllowed: definition.clientVisibleAllowed,
    description: definition.description,
    aliases: definition.aliases || [],
    requiresNote: definition.requiresNote || false,
    statusBucket: definition.statusBucket,
    readinessGate: definition.readinessGate,
    sharedProgress: definition.sharedProgress,
  }))
}

export function getAttorneyWorkflowStageTemplates(laneKey) {
  return getAttorneyStageDefinitionsForLane(laneKey).map((definition, index) => ({
    key: definition.key,
    label: definition.label,
    description: definition.description,
    actionLabel: definition.actionLabel,
    sortOrder: index + 1,
    ownerRole: definition.ownerRole,
    ownerLabel: definition.ownerLabel,
    statusBucket: definition.statusBucket,
    readinessGate: definition.readinessGate,
    evidenceRequirements: [...(definition.evidenceRequirements || [])],
    requiredData: (definition.requiredData || []).map(cloneWithoutAppliesWhen),
    requiredDocuments: [...(definition.requiredDocuments || [])],
    sharedProgress: definition.sharedProgress,
  }))
}

export function getAttorneySharedProgressDefinition(stageKey, laneKey = null) {
  return getAttorneyStageDefinition(stageKey, laneKey)?.sharedProgress || null
}

export function getAttorneyDataRequirementsForLane(laneKey, facts = {}) {
  const lane = normalizeLaneKey(laneKey)
  const byId = new Map()
  for (const definition of getAttorneyStageDefinitionsForLane(lane)) {
    for (const requirement of definition.requiredData || []) {
      if (!requirementApplies(requirement, facts)) continue
      const existing = byId.get(requirement.id)
      byId.set(requirement.id, {
        ...cloneWithoutAppliesWhen(requirement),
        laneKey: lane,
        stageKeys: existing ? [...new Set([...(existing.stageKeys || []), definition.key])] : [definition.key],
      })
    }
  }
  return [...byId.values()]
}

export function getAttorneyDocumentRequirementKeysForLane(laneKey) {
  const lane = normalizeLaneKey(laneKey)
  return [
    ...new Set(
      getAttorneyStageDefinitionsForLane(lane)
        .flatMap((definition) => definition.requiredDocuments || [])
        .filter(Boolean),
    ),
  ]
}

export function getAttorneyEvidenceRequirementsForStage(stageKey, laneKey = null) {
  const definition = getAttorneyStageDefinition(stageKey, laneKey)
  return [...(definition?.evidenceRequirements || [])]
}

export function getAttorneyReadinessGatesForLane(laneKey) {
  const lane = normalizeLaneKey(laneKey)
  const byKey = new Map()
  for (const definition of getAttorneyStageDefinitionsForLane(lane)) {
    if (!definition.readinessGate?.key) continue
    const existing = byKey.get(definition.readinessGate.key)
    byKey.set(definition.readinessGate.key, {
      ...definition.readinessGate,
      laneKey: lane,
      stageKeys: existing ? [...new Set([...(existing.stageKeys || []), definition.key])] : [definition.key],
    })
  }
  return [...byKey.values()]
}

export function resolveAttorneyDataRequirementsForLane({ laneKey = 'transfer', transaction = {}, facts = {} } = {}) {
  const lane = normalizeLaneKey(laneKey)
  const requirements = getAttorneyDataRequirementsForLane(lane, facts).map((requirement) =>
    resolveDataRequirementStatus(requirement, transaction, facts, lane, requirement.stageKeys?.[0] || null),
  )
  const required = requirements.filter((item) => item.required !== false)
  const missing = required.filter((item) => item.missing)
  const complete = requirements.filter((item) => item.complete)
  return {
    requirements,
    summary: {
      total: requirements.length,
      required: required.length,
      missing: missing.length,
      complete: complete.length,
    },
  }
}
