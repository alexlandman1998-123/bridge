function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeUnderscoreKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

export const CANONICAL_MERGE_FIELD_CATEGORIES = [
  'Buyer Details',
  'Seller Details',
  'Property Details',
  'Transaction Terms',
  'Agent / Agency',
  'Developer',
  'Attorney / Conveyancer',
  'Signing',
  'Document Metadata',
]

const CANONICAL_MERGE_FIELD_DEFINITIONS = [
  // Buyer Details
  {
    key: 'buyer_full_name',
    label: 'Buyer Full Name',
    category: 'Buyer Details',
    description: 'Primary buyer display name used on legal documents.',
    dataSource: 'buyers.name OR onboarding_form_data.firstName/lastName',
    required: true,
    packetTypes: ['otp'],
    sampleValue: 'Alex Buyer',
    validationRule: 'text_non_empty',
    aliases: ['buyer.display_name', 'buyer_name', 'buyerFullName', 'buyer_fullname', 'purchaser_name'],
  },
  {
    key: 'buyer_id_number',
    label: 'Buyer ID Number / Registration',
    category: 'Buyer Details',
    description: 'Buyer ID or entity registration number depending on buyer type.',
    dataSource: 'onboarding_form_data.idNumber OR companyRegistrationNumber OR trustRegistrationNumber',
    required: true,
    packetTypes: ['otp'],
    sampleValue: '9001015009088',
    validationRule: 'text_non_empty',
    aliases: ['buyer.registration_or_id', 'buyer_id', 'purchaser_id_number'],
  },
  {
    key: 'buyer_email',
    label: 'Buyer Email',
    category: 'Buyer Details',
    description: 'Primary buyer email address.',
    dataSource: 'buyers.email OR onboarding_form_data.email',
    required: true,
    packetTypes: ['otp'],
    sampleValue: 'buyer@example.com',
    validationRule: 'email_or_empty',
    aliases: ['buyer.email', 'purchaser_email'],
  },
  {
    key: 'buyer_phone',
    label: 'Buyer Phone',
    category: 'Buyer Details',
    description: 'Buyer mobile/telephone number.',
    dataSource: 'buyers.phone OR onboarding_form_data.phone',
    required: false,
    packetTypes: ['otp'],
    sampleValue: '0820000000',
    validationRule: 'phone_or_empty',
    aliases: ['buyer.phone', 'purchaser_phone'],
  },
  {
    key: 'buyer_marital_status',
    label: 'Buyer Marital Status',
    category: 'Buyer Details',
    description: 'Marital status used for legal and compliance clauses.',
    dataSource: 'onboarding_form_data.maritalStatus',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'Married In Community',
    validationRule: 'text_or_empty',
    aliases: ['buyer_marital', 'purchaser_marital_status'],
  },
  {
    key: 'buyer_spouse_name',
    label: 'Buyer Spouse Name',
    category: 'Buyer Details',
    description: 'Spouse/co-signatory name where applicable.',
    dataSource: 'onboarding_form_data.spouseName',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'Taylor Buyer',
    validationRule: 'text_or_empty',
    aliases: ['buyer_spouse', 'purchaser_spouse_name'],
  },
  {
    key: 'buyer_entity_type',
    label: 'Buyer Entity Type',
    category: 'Buyer Details',
    description: 'Buyer legal entity type.',
    dataSource: 'transactions.purchaser_type OR onboarding_form_data.purchaserType',
    required: true,
    packetTypes: ['otp'],
    sampleValue: 'Individual',
    validationRule: 'text_non_empty',
    aliases: ['buyer.entity_type', 'buyer.entity_type_raw', 'purchaser_type'],
  },
  {
    key: 'buyer_representative_name',
    label: 'Buyer Representative Name',
    category: 'Buyer Details',
    description: 'Authorized representative for company/trust buyer.',
    dataSource: 'onboarding_form_data.authorizedRepresentativeName',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'Jordan Representative',
    validationRule: 'text_or_empty',
    aliases: ['buyer.representative_name'],
  },
  {
    key: 'buyer_representative_capacity',
    label: 'Buyer Representative Capacity',
    category: 'Buyer Details',
    description: 'Capacity in which authorized representative signs.',
    dataSource: 'onboarding_form_data.authorizedRepresentativeCapacity',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'Director',
    validationRule: 'text_or_empty',
    aliases: ['buyer.representative_capacity'],
  },
  {
    key: 'buyer_trust_registration_number',
    label: 'Buyer Trust Registration Number',
    category: 'Buyer Details',
    description: 'Trust registration number for buyer trust entities.',
    dataSource: 'onboarding_form_data.trustRegistrationNumber',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'IT1234/2020',
    validationRule: 'text_or_empty',
    aliases: ['buyer.trust_registration_number'],
  },

  // Seller Details
  {
    key: 'seller_full_name',
    label: 'Seller Full Name',
    category: 'Seller Details',
    description: 'Primary seller display name.',
    dataSource: 'lead.sellerName/sellerSurname OR lead.name OR development owner',
    required: true,
    packetTypes: ['mandate', 'otp'],
    sampleValue: 'Sam Seller',
    validationRule: 'text_non_empty',
    aliases: ['seller.display_name', 'seller_name', 'sellerFullName', 'seller_fullname', 'vendor_name'],
  },
  {
    key: 'seller_id_number',
    label: 'Seller ID Number / Registration',
    category: 'Seller Details',
    description: 'Seller ID or entity registration number.',
    dataSource: 'seller onboarding form data or transaction fields',
    required: true,
    packetTypes: ['mandate', 'otp'],
    sampleValue: '7801015009088',
    validationRule: 'text_non_empty',
    aliases: ['seller.registration_or_id', 'seller_id', 'vendor_id_number'],
  },
  {
    key: 'seller_email',
    label: 'Seller Email',
    category: 'Seller Details',
    description: 'Primary seller email address.',
    dataSource: 'lead.sellerEmail OR mandate draft',
    required: false,
    packetTypes: ['mandate'],
    sampleValue: 'seller@example.com',
    validationRule: 'email_or_empty',
    aliases: ['seller.email', 'vendor_email'],
  },
  {
    key: 'seller_phone',
    label: 'Seller Phone',
    category: 'Seller Details',
    description: 'Primary seller phone number.',
    dataSource: 'lead.sellerPhone OR onboarding form',
    required: false,
    packetTypes: ['mandate'],
    sampleValue: '0830000000',
    validationRule: 'phone_or_empty',
    aliases: ['seller.phone', 'vendor_phone'],
  },
  {
    key: 'seller_entity_type',
    label: 'Seller Entity Type',
    category: 'Seller Details',
    description: 'Seller legal entity type.',
    dataSource: 'seller onboarding ownership type',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: 'Individual',
    validationRule: 'text_or_empty',
    aliases: ['seller.entity_type', 'seller.entity_type_raw'],
  },
  {
    key: 'seller_representative_name',
    label: 'Seller Representative Name',
    category: 'Seller Details',
    description: 'Authorized representative name for seller entities.',
    dataSource: 'seller onboarding authorized representative fields',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: 'Casey Representative',
    validationRule: 'text_or_empty',
    aliases: ['seller.representative_name'],
  },
  {
    key: 'seller_representative_capacity',
    label: 'Seller Representative Capacity',
    category: 'Seller Details',
    description: 'Capacity in which seller representative signs.',
    dataSource: 'seller onboarding authorized representative capacity',
    required: false,
    packetTypes: ['mandate'],
    sampleValue: 'Trustee',
    validationRule: 'text_or_empty',
    aliases: ['seller.representative_capacity'],
  },
  {
    key: 'seller_trust_registration_number',
    label: 'Seller Trust Registration Number',
    category: 'Seller Details',
    description: 'Trust registration number for seller trust entities.',
    dataSource: 'seller onboarding trust registration number',
    required: false,
    packetTypes: ['mandate'],
    sampleValue: 'IT9988/2019',
    validationRule: 'text_or_empty',
    aliases: ['seller.trust_registration_number'],
  },

  // Property Details
  {
    key: 'development_name',
    label: 'Development Name',
    category: 'Property Details',
    description: 'Development project name.',
    dataSource: 'units.development.name OR transactions.development_name',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'Casselberry Estate',
    validationRule: 'text_or_empty',
    aliases: ['property.development_name', 'developer.company_name'],
  },
  {
    key: 'unit_number',
    label: 'Unit Number',
    category: 'Property Details',
    description: 'Unit/lot identifier.',
    dataSource: 'units.unit_number OR transaction.unit_id references',
    required: true,
    packetTypes: ['otp'],
    sampleValue: '12',
    validationRule: 'text_non_empty',
    aliases: ['property.unit_label', 'unit_number', 'unit'],
  },
  {
    key: 'erf_number',
    label: 'ERF Number',
    category: 'Property Details',
    description: 'ERF/Lot reference where available.',
    dataSource: 'unit metadata or onboarding data',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'ERF-4021',
    validationRule: 'text_or_empty',
    aliases: ['property.erf_number'],
  },
  {
    key: 'property_address',
    label: 'Property Address',
    category: 'Property Details',
    description: 'Primary legal property address line.',
    dataSource: 'transactions.property_address_line_1 OR onboarding property address',
    required: true,
    packetTypes: ['mandate', 'otp'],
    sampleValue: '12 Sample Street, Pretoria',
    validationRule: 'text_non_empty',
    aliases: ['property.address', 'propertyAddress', 'seller_property_address'],
  },
  {
    key: 'property_suburb',
    label: 'Property Suburb',
    category: 'Property Details',
    description: 'Suburb/locality for property address.',
    dataSource: 'transactions.suburb OR development suburb',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'Lynnwood',
    validationRule: 'text_or_empty',
    aliases: ['property.suburb'],
  },
  {
    key: 'property_type',
    label: 'Property Type',
    category: 'Property Details',
    description: 'Residential, commercial, industrial, etc.',
    dataSource: 'transactions.property_type OR listing/onboarding property type',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: 'Residential',
    validationRule: 'text_or_empty',
    aliases: ['property.property_type'],
  },
  {
    key: 'sectional_title_number',
    label: 'Sectional Title Number',
    category: 'Property Details',
    description: 'Sectional title reference if applicable.',
    dataSource: 'unit metadata',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'SS 238/2022',
    validationRule: 'text_or_empty',
    aliases: ['property.sectional_title_number'],
  },
  {
    key: 'parking_bay',
    label: 'Parking Bay',
    category: 'Property Details',
    description: 'Allocated parking bay reference.',
    dataSource: 'unit metadata',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'B12',
    validationRule: 'text_or_empty',
    aliases: ['property.parking_bay'],
  },
  {
    key: 'storeroom',
    label: 'Storeroom',
    category: 'Property Details',
    description: 'Allocated storeroom reference.',
    dataSource: 'unit metadata',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'SR-6',
    validationRule: 'text_or_empty',
    aliases: ['property.storeroom'],
  },

  // Transaction Terms
  {
    key: 'purchase_price',
    label: 'Purchase Price',
    category: 'Transaction Terms',
    description: 'Total transaction purchase price.',
    dataSource: 'transactions.purchase_price OR sales_price',
    required: true,
    packetTypes: ['otp', 'mandate'],
    sampleValue: 'R 3 250 000',
    validationRule: 'currency_or_text',
    aliases: ['transaction.purchase_price', 'purchase_price', 'purchasePrice'],
  },
  {
    key: 'deposit_amount',
    label: 'Deposit Amount',
    category: 'Transaction Terms',
    description: 'Deposit amount payable by purchaser.',
    dataSource: 'transactions.deposit_amount',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'R 150 000',
    validationRule: 'currency_or_text',
    aliases: ['transaction.deposit_amount', 'deposit'],
  },
  {
    key: 'finance_type',
    label: 'Finance Type',
    category: 'Transaction Terms',
    description: 'Finance type used in transaction.',
    dataSource: 'transactions.finance_type',
    required: true,
    packetTypes: ['otp'],
    sampleValue: 'Bond',
    validationRule: 'text_non_empty',
    aliases: ['transaction.finance_type', 'transaction.finance_type_raw'],
  },
  {
    key: 'bond_amount',
    label: 'Bond Amount',
    category: 'Transaction Terms',
    description: 'Bond finance amount.',
    dataSource: 'transactions.bond_amount',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'R 2 900 000',
    validationRule: 'currency_or_text',
    aliases: ['transaction.bond_amount'],
  },
  {
    key: 'cash_amount',
    label: 'Cash Amount',
    category: 'Transaction Terms',
    description: 'Cash component of transaction.',
    dataSource: 'derived from price/deposit/bond if available',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'R 350 000',
    validationRule: 'currency_or_text',
    aliases: ['transaction.cash_amount'],
  },
  {
    key: 'occupation_date',
    label: 'Occupation Date',
    category: 'Transaction Terms',
    description: 'Date of occupation or handover.',
    dataSource: 'transactions.expected_transfer_date OR onboarding data',
    required: false,
    packetTypes: ['otp'],
    sampleValue: '2026-12-01',
    validationRule: 'date_or_text',
    aliases: ['transaction.occupation_date'],
  },
  {
    key: 'transfer_date',
    label: 'Transfer Date',
    category: 'Transaction Terms',
    description: 'Estimated transfer date.',
    dataSource: 'transactions.expected_transfer_date',
    required: false,
    packetTypes: ['otp'],
    sampleValue: '2027-01-15',
    validationRule: 'date_or_text',
    aliases: ['transaction.transfer_date'],
  },
  {
    key: 'suspensive_conditions',
    label: 'Suspensive Conditions',
    category: 'Transaction Terms',
    description: 'Suspensive condition clause text.',
    dataSource: 'transaction special condition notes',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'Subject to bond approval within 21 days.',
    validationRule: 'text_or_empty',
    aliases: ['transaction.suspensive_conditions'],
  },
  {
    key: 'special_conditions',
    label: 'Special Conditions',
    category: 'Transaction Terms',
    description: 'Custom special condition text block.',
    dataSource: 'document.special conditions from context',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: 'No special conditions captured.',
    validationRule: 'text_or_empty',
    aliases: ['document.special_conditions', 'special_conditions'],
  },

  // Agent / Agency
  {
    key: 'agent_full_name',
    label: 'Agent Full Name',
    category: 'Agent / Agency',
    description: 'Assigned agent display name.',
    dataSource: 'transactions.assigned_agent OR lead assignment fields',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: 'Alex Agent',
    validationRule: 'text_or_empty',
    aliases: ['agent.display_name', 'agent_name'],
  },
  {
    key: 'agent_email',
    label: 'Agent Email',
    category: 'Agent / Agency',
    description: 'Assigned agent email.',
    dataSource: 'transactions.assigned_agent_email OR profile mapping',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: 'agent@agency.com',
    validationRule: 'email_or_empty',
    aliases: ['agent.email'],
  },
  {
    key: 'agency_name',
    label: 'Agency Name',
    category: 'Agent / Agency',
    description: 'Current organisation/agency display name.',
    dataSource: 'organisations.display_name',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: 'Samlin Agency',
    validationRule: 'text_or_empty',
    aliases: ['agency.name'],
  },
  {
    key: 'agency_fsp_number',
    label: 'Agency FSP Number',
    category: 'Agent / Agency',
    description: 'Agency FSP registration number.',
    dataSource: 'organisation settings metadata',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: 'FSP-123456',
    validationRule: 'text_or_empty',
    aliases: ['agency.fsp_number'],
  },

  // Developer
  {
    key: 'developer_name',
    label: 'Developer Name',
    category: 'Developer',
    description: 'Developer company name.',
    dataSource: 'development or organisation records',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'Bridge Developments',
    validationRule: 'text_or_empty',
    aliases: ['developer.company_name'],
  },
  {
    key: 'developer_company_registration',
    label: 'Developer Company Registration',
    category: 'Developer',
    description: 'Developer registration number.',
    dataSource: 'developer profile fields',
    required: false,
    packetTypes: ['otp'],
    sampleValue: '2024/123456/07',
    validationRule: 'text_or_empty',
    aliases: ['developer.registration_number'],
  },
  {
    key: 'developer_representative',
    label: 'Developer Representative',
    category: 'Developer',
    description: 'Developer representative name.',
    dataSource: 'developer representative assignment',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'Jordan Developer',
    validationRule: 'text_or_empty',
    aliases: ['developer.representative_name'],
  },

  // Attorney / Conveyancer
  {
    key: 'attorney_firm_name',
    label: 'Attorney Firm Name',
    category: 'Attorney / Conveyancer',
    description: 'Attorney firm assigned to the matter.',
    dataSource: 'transactions.attorney',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'Bridge Legal',
    validationRule: 'text_or_empty',
    aliases: ['conveyancer.display_name', 'attorney_name'],
  },
  {
    key: 'conveyancer_name',
    label: 'Conveyancer Name',
    category: 'Attorney / Conveyancer',
    description: 'Conveyancer handling transfer.',
    dataSource: 'transaction assignment data',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'Casey Conveyancer',
    validationRule: 'text_or_empty',
    aliases: ['conveyancer.name'],
  },
  {
    key: 'conveyancer_email',
    label: 'Conveyancer Email',
    category: 'Attorney / Conveyancer',
    description: 'Conveyancer contact email.',
    dataSource: 'transactions.assigned_attorney_email',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'conveyancer@bridgelegal.co.za',
    validationRule: 'email_or_empty',
    aliases: ['conveyancer.email'],
  },
  {
    key: 'conveyancer_reference',
    label: 'Conveyancer Reference',
    category: 'Attorney / Conveyancer',
    description: 'Attorney internal matter reference.',
    dataSource: 'transaction or attorney integration metadata',
    required: false,
    packetTypes: ['otp'],
    sampleValue: 'BRG-TRF-2026-0091',
    validationRule: 'text_or_empty',
    aliases: ['conveyancer.reference'],
  },

  // Signing
  {
    key: 'buyer_signature',
    label: 'Buyer Signature',
    category: 'Signing',
    description: 'Reserved signature slot for buyer.',
    dataSource: 'document_signing_fields',
    required: false,
    packetTypes: ['otp'],
    sampleValue: '[Signature]',
    validationRule: 'signature_placeholder',
    aliases: ['signing.buyer_signature'],
  },
  {
    key: 'seller_signature',
    label: 'Seller Signature',
    category: 'Signing',
    description: 'Reserved signature slot for seller.',
    dataSource: 'document_signing_fields',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: '[Signature]',
    validationRule: 'signature_placeholder',
    aliases: ['signing.seller_signature'],
  },
  {
    key: 'witness_signature',
    label: 'Witness Signature',
    category: 'Signing',
    description: 'Reserved signature slot for witness.',
    dataSource: 'document_signing_fields',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: '[Signature]',
    validationRule: 'signature_placeholder',
    aliases: ['signing.witness_signature'],
  },
  {
    key: 'buyer_initials',
    label: 'Buyer Initials',
    category: 'Signing',
    description: 'Reserved initial fields for buyer.',
    dataSource: 'document_signing_fields',
    required: false,
    packetTypes: ['otp'],
    sampleValue: '[Initials]',
    validationRule: 'signature_placeholder',
    aliases: ['signing.buyer_initials'],
  },
  {
    key: 'seller_initials',
    label: 'Seller Initials',
    category: 'Signing',
    description: 'Reserved initial fields for seller.',
    dataSource: 'document_signing_fields',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: '[Initials]',
    validationRule: 'signature_placeholder',
    aliases: ['signing.seller_initials'],
  },
  {
    key: 'signed_date',
    label: 'Signed Date',
    category: 'Signing',
    description: 'Date/time signature completion stamp.',
    dataSource: 'document_packet_signers.signed_at',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: '2026-05-11',
    validationRule: 'date_or_text',
    aliases: ['signing.signed_date'],
  },

  // Document Metadata
  {
    key: 'document_reference',
    label: 'Document Reference',
    category: 'Document Metadata',
    description: 'Document packet or legal reference code.',
    dataSource: 'document_packets.id / template key',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: 'DOC-2026-0001',
    validationRule: 'text_or_empty',
    aliases: ['document.reference'],
  },
  {
    key: 'generated_date',
    label: 'Generated Date',
    category: 'Document Metadata',
    description: 'Date legal draft was generated.',
    dataSource: 'document_packet_versions.generated_at',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: '2026-05-11',
    validationRule: 'date_or_text',
    aliases: ['document.generated_date'],
  },
  {
    key: 'template_version',
    label: 'Template Version',
    category: 'Document Metadata',
    description: 'Template version tag used for this document.',
    dataSource: 'document_packet_templates.version_tag',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: 'v3',
    validationRule: 'text_or_empty',
    aliases: ['document.template_version'],
  },
  {
    key: 'transaction_reference',
    label: 'Transaction Reference',
    category: 'Document Metadata',
    description: 'Transaction/workflow reference identifier.',
    dataSource: 'transactions.id or external reference',
    required: false,
    packetTypes: ['mandate', 'otp'],
    sampleValue: 'TRX-2026-00021',
    validationRule: 'text_or_empty',
    aliases: ['transaction.reference'],
  },
]

const CANONICAL_FIELD_BY_KEY = new Map()
const ALIAS_TO_CANONICAL = new Map()

for (const definition of CANONICAL_MERGE_FIELD_DEFINITIONS) {
  const canonicalKey = normalizeUnderscoreKey(definition.key)
  const normalizedDefinition = {
    ...definition,
    key: canonicalKey,
    aliases: Array.from(new Set((definition.aliases || []).map((item) => normalizeText(item)).filter(Boolean))),
  }
  CANONICAL_FIELD_BY_KEY.set(canonicalKey, normalizedDefinition)

  const candidates = [
    canonicalKey,
    normalizeText(definition.key),
    normalizeUnderscoreKey(definition.key),
    ...(normalizedDefinition.aliases || []),
  ]
  for (const alias of candidates) {
    const normalizedAlias = normalizeText(alias)
    if (normalizedAlias) {
      ALIAS_TO_CANONICAL.set(normalizedAlias, canonicalKey)
      ALIAS_TO_CANONICAL.set(normalizeUnderscoreKey(normalizedAlias), canonicalKey)
    }
  }
}

export function listCanonicalMergeFields({ packetType = null } = {}) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  return CANONICAL_MERGE_FIELD_DEFINITIONS
    .map((definition) => CANONICAL_FIELD_BY_KEY.get(normalizeUnderscoreKey(definition.key)))
    .filter(Boolean)
    .filter((definition) => {
      if (!normalizedPacketType) return true
      return Array.isArray(definition.packetTypes) ? definition.packetTypes.includes(normalizedPacketType) : true
    })
}

export function resolveCanonicalMergeFieldKey(rawKey = '', { packetType = null } = {}) {
  const normalized = normalizeText(rawKey)
  if (!normalized) return ''
  const packetFiltered = listCanonicalMergeFields({ packetType })
  const packetAllowed = new Set(packetFiltered.map((definition) => definition.key))
  const mapped =
    ALIAS_TO_CANONICAL.get(normalized) ||
    ALIAS_TO_CANONICAL.get(normalizeUnderscoreKey(normalized)) ||
    ''
  if (!mapped) return ''
  if (!packetAllowed.size || packetAllowed.has(mapped)) return mapped
  return ''
}

export function getCanonicalMergeFieldDefinition(rawKey = '', { packetType = null } = {}) {
  const resolvedKey = resolveCanonicalMergeFieldKey(rawKey, { packetType }) || normalizeUnderscoreKey(rawKey)
  const definition = CANONICAL_FIELD_BY_KEY.get(resolvedKey)
  if (!definition) return null
  if (!packetType) return definition
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  if (Array.isArray(definition.packetTypes) && !definition.packetTypes.includes(normalizedPacketType)) return null
  return definition
}

export function suggestCanonicalMergeFieldKey(rawKey = '', { packetType = null } = {}) {
  const normalizedKey = normalizeUnderscoreKey(rawKey)
  if (!normalizedKey) return ''
  const packetFields = listCanonicalMergeFields({ packetType })
  const byExact = packetFields.find((definition) => definition.key === normalizedKey)
  if (byExact) return byExact.key

  const byPrefix = packetFields.find((definition) => definition.key.includes(normalizedKey) || normalizedKey.includes(definition.key))
  return byPrefix?.key || ''
}

export function normalizeMergeFieldPayload(placeholders = {}, { packetType = null, includeAliasKeys = true } = {}) {
  const source = placeholders && typeof placeholders === 'object' ? placeholders : {}
  const normalizedPayload = {}
  const aliasHits = []
  const unknownKeys = []

  for (const [rawKey, value] of Object.entries(source)) {
    const key = normalizeText(rawKey)
    if (!key) continue
    const canonicalKey = resolveCanonicalMergeFieldKey(key, { packetType })

    if (!canonicalKey) {
      const normalizedAliasKey = normalizeUnderscoreKey(key)
      if (normalizedAliasKey) {
        unknownKeys.push({
          key,
          normalized: normalizedAliasKey,
          suggested: suggestCanonicalMergeFieldKey(key, { packetType }) || null,
        })
      }
      if (includeAliasKeys) normalizedPayload[key] = value
      continue
    }

    if (canonicalKey !== key) {
      aliasHits.push({
        alias: key,
        canonicalKey,
      })
    }

    if (normalizedPayload[canonicalKey] === undefined || normalizedPayload[canonicalKey] === null || normalizedPayload[canonicalKey] === '') {
      normalizedPayload[canonicalKey] = value
    }
    if (includeAliasKeys) {
      normalizedPayload[key] = value
    }
  }

  if (includeAliasKeys) {
    const canonicalFields = listCanonicalMergeFields({ packetType })
    for (const field of canonicalFields) {
      const canonicalValue = normalizedPayload[field.key]
      if (canonicalValue === undefined || canonicalValue === null || canonicalValue === '') continue
      for (const alias of field.aliases || []) {
        if (normalizedPayload[alias] === undefined) {
          normalizedPayload[alias] = canonicalValue
        }
      }
    }
  }

  return {
    payload: normalizedPayload,
    aliasHits,
    unknownKeys,
  }
}

export function getRequiredCanonicalMergeFields(packetType = '') {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  return listCanonicalMergeFields({ packetType: normalizedPacketType }).filter((definition) => definition.required)
}

export function validateTemplateTokensAgainstRegistry({
  tokens = [],
  packetType = null,
} = {}) {
  const tokenRows = Array.isArray(tokens) ? tokens : []
  const unknown = []
  const normalized = []
  const deprecated = []
  const seen = new Set()

  for (const token of tokenRows) {
    const rawToken = normalizeText(token)
    if (!rawToken) continue
    const canonicalKey = resolveCanonicalMergeFieldKey(rawToken, { packetType })

    if (!canonicalKey) {
      unknown.push({
        token: rawToken,
        suggested: suggestCanonicalMergeFieldKey(rawToken, { packetType }) || null,
      })
      continue
    }

    if (rawToken !== canonicalKey) {
      deprecated.push({
        token: rawToken,
        canonicalKey,
      })
    }

    if (!seen.has(canonicalKey)) {
      normalized.push(canonicalKey)
      seen.add(canonicalKey)
    }
  }

  const requiredDefinitions = getRequiredCanonicalMergeFields(packetType)
  const missingRequired = requiredDefinitions
    .filter((definition) => !seen.has(definition.key))
    .map((definition) => ({
      key: definition.key,
      label: definition.label,
    }))

  return {
    normalized,
    unknown,
    deprecated,
    missingRequired,
    isValid: unknown.length === 0,
  }
}

export function buildCanonicalMergeSampleData({ packetType = null } = {}) {
  const rows = listCanonicalMergeFields({ packetType })
  return rows.reduce((accumulator, row) => {
    accumulator[row.key] = row.sampleValue || ''
    return accumulator
  }, {})
}

export function buildCanonicalMergeFieldSourceMap({ packetType = null, payload = {} } = {}) {
  const normalized = normalizeMergeFieldPayload(payload, {
    packetType,
    includeAliasKeys: true,
  }).payload
  return listCanonicalMergeFields({ packetType }).map((definition) => ({
    key: definition.key,
    label: definition.label,
    category: definition.category,
    source: definition.dataSource,
    required: Boolean(definition.required),
    packetTypes: definition.packetTypes || [],
    resolvedValue: normalized?.[definition.key] ?? null,
    hasValue: Boolean(normalizeText(normalized?.[definition.key])),
    sampleValue: definition.sampleValue || '',
    validationRule: definition.validationRule || '',
  }))
}
