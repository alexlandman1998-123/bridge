function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function unique(values = []) {
  return [...new Set((values || []).map((value) => normalizeText(value)).filter(Boolean))]
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const LANDLORD_ENTITY_TYPE_OPTIONS = [
  { value: 'individual', label: 'Private Individual', description: 'One or more natural persons own the property.' },
  { value: 'company', label: 'Company', description: 'A registered company owns the portfolio or asset.' },
  { value: 'cc', label: 'Close Corporation', description: 'A close corporation holds the asset.' },
  { value: 'trust', label: 'Trust', description: 'A trust owns the property with authorised trustees.' },
  { value: 'fund', label: 'Property Fund', description: 'A property fund or collective vehicle owns the stock.' },
  { value: 'reit', label: 'REIT', description: 'A listed or structured REIT owns the assets.' },
  { value: 'listed_company', label: 'Listed Company', description: 'A public listed entity owns the portfolio.' },
  { value: 'government_entity', label: 'Government Entity', description: 'A municipality, SOE, or public authority owns the asset.' },
  { value: 'other', label: 'Other', description: 'Another ownership structure applies.' },
]

export const LANDLORD_PORTFOLIO_TYPE_OPTIONS = [
  { value: 'commercial', label: 'Commercial / Office' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'retail', label: 'Retail' },
  { value: 'agricultural', label: 'Agricultural' },
  { value: 'mixed', label: 'Mixed Portfolio' },
]

export const LANDLORD_PROPERTY_TYPE_OPTIONS = [
  { value: 'commercial', label: 'Commercial / Office' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'retail', label: 'Retail' },
  { value: 'agricultural', label: 'Agricultural' },
  { value: 'mixed_use', label: 'Mixed Use' },
  { value: 'land', label: 'Land' },
]

export const LANDLORD_VACANCY_TYPE_OPTIONS = [
  { value: 'office', label: 'Office' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'retail', label: 'Retail' },
  { value: 'agricultural', label: 'Agricultural' },
  { value: 'yard', label: 'Yard' },
  { value: 'land', label: 'Land' },
  { value: 'other', label: 'Other' },
]

export const LANDLORD_MANDATE_OPTIONS = [
  { value: 'not_now', label: 'Not now' },
  { value: 'leasing', label: 'Leasing Mandate' },
  { value: 'sales', label: 'Sales Mandate' },
  { value: 'both', label: 'Both' },
]

export const LANDLORD_MANDATE_TYPE_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'sole', label: 'Sole' },
  { value: 'joint_sole', label: 'Joint Sole' },
  { value: 'exclusive', label: 'Exclusive' },
]

export const LANDLORD_RELATIONSHIP_TYPE_OPTIONS = [
  { value: 'preferred_broker', label: 'Preferred Broker' },
  { value: 'open_market_broker', label: 'Open Market Broker' },
  { value: 'sole_mandate_broker', label: 'Sole Mandate Broker' },
  { value: 'historical_broker', label: 'Historical Broker' },
  { value: 'internal_contact', label: 'Internal Contact' },
]

export const LANDLORD_ONBOARDING_STATUSES = [
  { value: 'not_sent', label: 'Not Sent' },
  { value: 'sent', label: 'Sent' },
  { value: 'opened', label: 'Opened' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'missing_information', label: 'Missing Information' },
  { value: 'complete', label: 'Complete' },
  { value: 'expired', label: 'Expired' },
]

export const LANDLORD_PROPERTY_MANAGER_RESPONSIBILITIES = [
  'Vacancy updates',
  'Tenant queries',
  'Maintenance coordination',
  'Building access',
  'Viewing access',
  'Operational approvals',
]

export const LANDLORD_ADDITIONAL_CONTACT_TYPES = [
  { value: 'finance_contact', label: 'Finance Contact' },
  { value: 'legal_contact', label: 'Legal Contact' },
  { value: 'facilities_contact', label: 'Facilities Contact' },
  { value: 'accounts_contact', label: 'Accounts Contact' },
  { value: 'marketing_contact', label: 'Marketing Contact' },
]

const DOCUMENT_RULES_BY_ENTITY_TYPE = {
  individual: [
    { key: 'id_document', label: 'ID Document', category: 'id_document', required: true },
    { key: 'proof_of_address', label: 'Proof of Address', category: 'proof_of_address', required: true },
    { key: 'fica_documents', label: 'FICA Documents', category: 'fica', required: true },
    { key: 'vat_certificate', label: 'VAT Certificate', category: 'vat_certificate', requiredWhen: (context) => Boolean(context.vatRegistered) },
    { key: 'property_schedule', label: 'Property Schedule', category: 'property_schedule', required: false },
    { key: 'rates_accounts', label: 'Rates Account', category: 'rates_accounts', required: false },
    { key: 'mandate_document', label: 'Mandate Document', category: 'mandate_document', required: false },
  ],
  company: [
    { key: 'company_registration_documents', label: 'Company Registration Documents', category: 'company_registration', required: true },
    { key: 'proof_of_registered_address', label: 'Proof of Registered Address', category: 'proof_of_address', required: true },
    { key: 'vat_certificate', label: 'VAT Certificate', category: 'vat_certificate', requiredWhen: (context) => Boolean(context.vatRegistered) },
    { key: 'authorising_resolution', label: 'Authorising Resolution', category: 'resolution', required: true },
    { key: 'authorised_signatory_id', label: 'Authorised Signatory ID', category: 'authorised_signatory_id', required: true },
    { key: 'fica_documents', label: 'FICA Documents', category: 'fica', required: true },
    { key: 'company_profile', label: 'Company Profile', category: 'company_profile', required: false },
    { key: 'portfolio_schedule', label: 'Portfolio Schedule', category: 'portfolio_schedule', required: false },
    { key: 'property_schedule', label: 'Property Schedule', category: 'property_schedule', required: false },
    { key: 'rates_accounts', label: 'Rates Accounts', category: 'rates_accounts', required: false },
    { key: 'existing_lease_schedule', label: 'Existing Lease Schedule', category: 'existing_lease_schedule', required: false },
    { key: 'mandate_document', label: 'Mandate Document', category: 'mandate_document', required: false },
  ],
  cc: [
    { key: 'company_registration_documents', label: 'Company Registration Documents', category: 'company_registration', required: true },
    { key: 'proof_of_registered_address', label: 'Proof of Registered Address', category: 'proof_of_address', required: true },
    { key: 'vat_certificate', label: 'VAT Certificate', category: 'vat_certificate', requiredWhen: (context) => Boolean(context.vatRegistered) },
    { key: 'authorising_resolution', label: 'Authorising Resolution', category: 'resolution', required: true },
    { key: 'authorised_signatory_id', label: 'Authorised Signatory ID', category: 'authorised_signatory_id', required: true },
    { key: 'fica_documents', label: 'FICA Documents', category: 'fica', required: true },
  ],
  fund: [
    { key: 'company_registration_documents', label: 'Company Registration Documents', category: 'company_registration', required: true },
    { key: 'proof_of_registered_address', label: 'Proof of Registered Address', category: 'proof_of_address', required: true },
    { key: 'vat_certificate', label: 'VAT Certificate', category: 'vat_certificate', requiredWhen: (context) => Boolean(context.vatRegistered) },
    { key: 'authorising_resolution', label: 'Authorising Resolution', category: 'resolution', required: true },
    { key: 'authorised_signatory_id', label: 'Authorised Signatory ID', category: 'authorised_signatory_id', required: true },
    { key: 'fica_documents', label: 'FICA Documents', category: 'fica', required: true },
    { key: 'portfolio_schedule', label: 'Portfolio Schedule', category: 'portfolio_schedule', required: false },
    { key: 'property_schedule', label: 'Property Schedule', category: 'property_schedule', required: false },
  ],
  reit: [
    { key: 'company_registration_documents', label: 'Company Registration Documents', category: 'company_registration', required: true },
    { key: 'proof_of_registered_address', label: 'Proof of Registered Address', category: 'proof_of_address', required: true },
    { key: 'vat_certificate', label: 'VAT Certificate', category: 'vat_certificate', requiredWhen: (context) => Boolean(context.vatRegistered) },
    { key: 'authorising_resolution', label: 'Authorising Resolution', category: 'resolution', required: true },
    { key: 'authorised_signatory_id', label: 'Authorised Signatory ID', category: 'authorised_signatory_id', required: true },
    { key: 'fica_documents', label: 'FICA Documents', category: 'fica', required: true },
    { key: 'portfolio_schedule', label: 'Portfolio Schedule', category: 'portfolio_schedule', required: false },
    { key: 'property_schedule', label: 'Property Schedule', category: 'property_schedule', required: false },
  ],
  listed_company: [
    { key: 'company_registration_documents', label: 'Company Registration Documents', category: 'company_registration', required: true },
    { key: 'proof_of_registered_address', label: 'Proof of Registered Address', category: 'proof_of_address', required: true },
    { key: 'vat_certificate', label: 'VAT Certificate', category: 'vat_certificate', requiredWhen: (context) => Boolean(context.vatRegistered) },
    { key: 'authorising_resolution', label: 'Authorising Resolution', category: 'resolution', required: true },
    { key: 'authorised_signatory_id', label: 'Authorised Signatory ID', category: 'authorised_signatory_id', required: true },
    { key: 'fica_documents', label: 'FICA Documents', category: 'fica', required: true },
  ],
  trust: [
    { key: 'trust_deed', label: 'Trust Deed', category: 'trust_deed', required: true },
    { key: 'letters_of_authority', label: 'Letters of Authority', category: 'letters_of_authority', required: true },
    { key: 'trustee_id_documents', label: 'Trustee ID Documents', category: 'trustee_id_documents', required: true },
    { key: 'proof_of_address', label: 'Proof of Address', category: 'proof_of_address', required: true },
    { key: 'resolution_authorising_signatory', label: 'Resolution Authorising Signatory', category: 'resolution', required: true },
    { key: 'fica_documents', label: 'FICA Documents', category: 'fica', required: true },
    { key: 'property_schedule', label: 'Property Schedule', category: 'property_schedule', required: false },
    { key: 'existing_lease_schedule', label: 'Existing Lease Schedule', category: 'existing_lease_schedule', required: false },
    { key: 'mandate_document', label: 'Mandate Document', category: 'mandate_document', required: false },
  ],
  government_entity: [
    { key: 'entity_authorisation_document', label: 'Entity Authorisation Document', category: 'entity_authorisation_document', required: true },
    { key: 'proof_of_signatory_authority', label: 'Proof of Signatory Authority', category: 'resolution', required: true },
    { key: 'authorised_signatory_id', label: 'Authorised Signatory ID', category: 'authorised_signatory_id', required: true },
    { key: 'official_contact_details', label: 'Official Contact Details', category: 'official_contact_details', required: true },
    { key: 'fica_documents', label: 'FICA Documents', category: 'fica', requiredWhen: (context) => Boolean(context.ficaApplicable !== false) },
    { key: 'portfolio_schedule', label: 'Portfolio Schedule', category: 'portfolio_schedule', required: false },
    { key: 'property_schedule', label: 'Property Schedule', category: 'property_schedule', required: false },
    { key: 'mandate_document', label: 'Mandate Document', category: 'mandate_document', required: false },
  ],
  other: [
    { key: 'supporting_documents', label: 'Supporting Documents', category: 'supporting_documents', required: true },
  ],
}

function createContactDraft(defaults = {}) {
  return {
    clientKey: defaults.clientKey || `contact-${Math.random().toString(36).slice(2, 10)}`,
    id: defaults.id || '',
    full_name: defaults.full_name || '',
    position: defaults.position || '',
    email: defaults.email || '',
    mobile: defaults.mobile || '',
    id_number: defaults.id_number || '',
    signing_capacity: defaults.signing_capacity || '',
    authority_confirmed: Boolean(defaults.authority_confirmed),
    can_approve_mandates: Boolean(defaults.can_approve_mandates),
    can_approve_leasing_terms: Boolean(defaults.can_approve_leasing_terms),
    can_approve_sales_terms: Boolean(defaults.can_approve_sales_terms),
    is_primary: Boolean(defaults.is_primary),
    portfolio_region: defaults.portfolio_region || '',
    responsibilities: Array.isArray(defaults.responsibilities) ? defaults.responsibilities : [],
    notes: defaults.notes || '',
    contact_type: defaults.contact_type || '',
  }
}

function createPropertyDraft(defaults = {}) {
  return {
    clientKey: defaults.clientKey || `property-${Math.random().toString(36).slice(2, 10)}`,
    id: defaults.id || '',
    property_name: defaults.property_name || '',
    property_type: defaults.property_type || '',
    address: defaults.address || '',
    addressValue: defaults.addressValue || defaults.address_value || null,
    suburb: defaults.suburb || '',
    city: defaults.city || '',
    province: defaults.province || '',
    gla_m2: defaults.gla_m2 || '',
    ownership_status: defaults.ownership_status || '',
    assigned_asset_manager_key: defaults.assigned_asset_manager_key || '',
    assigned_property_manager_key: defaults.assigned_property_manager_key || '',
    notes: defaults.notes || '',
    vacancies: Array.isArray(defaults.vacancies) ? defaults.vacancies.map(createVacancyDraft) : [],
  }
}

function createVacancyDraft(defaults = {}) {
  return {
    clientKey: defaults.clientKey || `vacancy-${Math.random().toString(36).slice(2, 10)}`,
    id: defaults.id || '',
    vacancy_name: defaults.vacancy_name || '',
    unit_or_floor: defaults.unit_or_floor || '',
    vacancy_type: defaults.vacancy_type || '',
    available_area_m2: defaults.available_area_m2 || '',
    rental_per_m2: defaults.rental_per_m2 || '',
    operating_costs: defaults.operating_costs || '',
    availability_date: defaults.availability_date || '',
    lease_term_preference: defaults.lease_term_preference || '',
    assigned_broker: defaults.assigned_broker || '',
    assigned_property_manager_key: defaults.assigned_property_manager_key || '',
    notes: defaults.notes || '',
  }
}

function createMandateDraft(defaults = {}) {
  return {
    id: defaults.id || '',
    mandate_kind: defaults.mandate_kind || '',
    mandate_type: defaults.mandate_type || '',
    start_date: defaults.start_date || '',
    expiry_date: defaults.expiry_date || '',
    commission_structure: defaults.commission_structure || '',
    brokerage_assigned: defaults.brokerage_assigned || '',
    broker_assigned: defaults.broker_assigned || '',
    notes: defaults.notes || '',
    property_client_key: defaults.property_client_key || '',
    vacancy_client_key: defaults.vacancy_client_key || '',
  }
}

function createBrokerRelationshipDraft(defaults = {}) {
  return {
    clientKey: defaults.clientKey || `relationship-${Math.random().toString(36).slice(2, 10)}`,
    brokerage_name: defaults.brokerage_name || '',
    broker_name: defaults.broker_name || '',
    broker_email: defaults.broker_email || '',
    broker_mobile: defaults.broker_mobile || '',
    relationship_type: defaults.relationship_type || '',
    mandate_type: defaults.mandate_type || '',
    notes: defaults.notes || '',
  }
}

export function createEmptyLandlordOnboardingForm(source = {}) {
  const formData = source?.form_data && typeof source.form_data === 'object' ? source.form_data : source
  return {
    entity_type: formData.entity_type || source.entity_type || 'company',
    landlord_details: {
      legal_name: formData.landlord_details?.legal_name || source.legal_name || source.name || '',
      trading_name: formData.landlord_details?.trading_name || source.trading_name || '',
      registration_number: formData.landlord_details?.registration_number || source.registration_number || '',
      vat_number: formData.landlord_details?.vat_number || source.vat_number || '',
      vat_registered: Boolean(formData.landlord_details?.vat_registered || source.vat_registered || source.vat_number),
      registered_address: formData.landlord_details?.registered_address || source.registered_address || '',
      residential_address: formData.landlord_details?.residential_address || '',
      postal_address: formData.landlord_details?.postal_address || source.postal_address || '',
      main_contact_number: formData.landlord_details?.main_contact_number || source.main_phone || source.phone || '',
      main_email_address: formData.landlord_details?.main_email_address || source.main_email || source.email || '',
      website: formData.landlord_details?.website || source.website || '',
      full_name: formData.landlord_details?.full_name || source.contact_person || '',
      id_number: formData.landlord_details?.id_number || '',
      trust_name: formData.landlord_details?.trust_name || '',
      trust_registration_number: formData.landlord_details?.trust_registration_number || '',
      masters_office_reference: formData.landlord_details?.masters_office_reference || '',
      fica_applicable: formData.landlord_details?.fica_applicable !== false,
    },
    asset_managers: Array.isArray(formData.asset_managers) && formData.asset_managers.length
      ? formData.asset_managers.map((row) => createContactDraft({ ...row, contact_type: 'asset_manager' }))
      : [createContactDraft({ contact_type: 'asset_manager', is_primary: true, authority_confirmed: true })],
    property_managers: Array.isArray(formData.property_managers) && formData.property_managers.length
      ? formData.property_managers.map((row) => createContactDraft({ ...row, contact_type: 'property_manager' }))
      : [createContactDraft({ contact_type: 'property_manager', is_primary: true, responsibilities: [...LANDLORD_PROPERTY_MANAGER_RESPONSIBILITIES] })],
    additional_contacts: Array.isArray(formData.additional_contacts)
      ? formData.additional_contacts.map((row) => createContactDraft(row))
      : [],
    portfolio: {
      asset_types: Array.isArray(formData.portfolio?.asset_types)
        ? formData.portfolio.asset_types
        : (Array.isArray(source.portfolio_type) ? source.portfolio_type : []),
      number_of_properties: formData.portfolio?.number_of_properties || source.number_of_properties_estimate || '',
      estimated_total_gla: formData.portfolio?.estimated_total_gla || source.total_gla_estimate || '',
      primary_regions: Array.isArray(formData.portfolio?.primary_regions) ? formData.portfolio.primary_regions : [],
      portfolio_notes: formData.portfolio?.portfolio_notes || source.portfolio_notes || '',
      add_properties_now: formData.portfolio?.add_properties_now !== false,
    },
    properties: Array.isArray(formData.properties) ? formData.properties.map(createPropertyDraft) : [],
    mandate_request: formData.mandate_request || 'not_now',
    mandates: Array.isArray(formData.mandates) ? formData.mandates.map(createMandateDraft) : [],
    broker_relationships: {
      has_existing_relationships: Boolean(formData.broker_relationships?.has_existing_relationships),
      relationships: Array.isArray(formData.broker_relationships?.relationships)
        ? formData.broker_relationships.relationships.map(createBrokerRelationshipDraft)
        : [],
    },
    banking_details: {
      account_holder: formData.banking_details?.account_holder || '',
      bank_name: formData.banking_details?.bank_name || '',
      branch_code: formData.banking_details?.branch_code || '',
      account_number: formData.banking_details?.account_number || '',
      account_type: formData.banking_details?.account_type || '',
      finance_contact_email: formData.banking_details?.finance_contact_email || '',
      payment_reference: formData.banking_details?.payment_reference || '',
    },
    approval_permissions: {
      broker_can_prepare_mandates: formData.approval_permissions?.broker_can_prepare_mandates !== false,
      broker_can_market_vacancies: formData.approval_permissions?.broker_can_market_vacancies !== false,
      broker_can_share_documents: Boolean(formData.approval_permissions?.broker_can_share_documents),
      requires_owner_approval_before_terms: formData.approval_permissions?.requires_owner_approval_before_terms !== false,
    },
    onboarding_notes: formData.onboarding_notes || '',
  }
}

export function getLandlordOnboardingDocumentRequirements(context = {}) {
  const rules = DOCUMENT_RULES_BY_ENTITY_TYPE[normalizeLower(context.entityType)] || DOCUMENT_RULES_BY_ENTITY_TYPE.other
  return rules.filter((rule) => rule.required || (typeof rule.requiredWhen === 'function' && rule.requiredWhen(context)))
}

export function getLandlordOnboardingOptionalDocuments(context = {}) {
  const rules = DOCUMENT_RULES_BY_ENTITY_TYPE[normalizeLower(context.entityType)] || DOCUMENT_RULES_BY_ENTITY_TYPE.other
  return rules.filter((rule) => !rule.required && !(typeof rule.requiredWhen === 'function' && rule.requiredWhen(context)))
}

export function getLandlordOnboardingStepDefinitions() {
  return [
    { id: 'welcome', label: 'Welcome', helper: 'Start here.' },
    { id: 'entity', label: 'Entity / Personal Details', helper: 'Confirm who owns the property or portfolio.' },
    { id: 'contacts', label: 'Contacts & Signatories', helper: 'Capture directors, signatories, asset managers, and property managers.' },
    { id: 'portfolio', label: 'Property / Requirement Details', helper: 'Describe the asset profile and add properties or vacancies.' },
    { id: 'mandates', label: 'Deal Details', helper: 'Capture mandate, banking, approval, and broker relationship details.' },
    { id: 'documents', label: 'Documents', helper: 'Upload the required supporting documents.' },
    { id: 'review', label: 'Review & Submit', helper: 'Check the submission before sending it through.' },
  ]
}

function pushIfMissing(collection, key, condition) {
  if (condition) collection.push(key)
}

export function validateLandlordOnboardingForm(form = {}, { requireSubmitReady = false } = {}) {
  const errors = {}
  const missingFieldKeys = []
  const entityType = normalizeLower(form.entity_type || 'company')
  const details = form.landlord_details || {}
  const portfolio = form.portfolio || {}
  const properties = Array.isArray(form.properties) ? form.properties : []

  pushIfMissing(missingFieldKeys, 'entity_type', !entityType)

  if (entityType === 'individual') {
    pushIfMissing(missingFieldKeys, 'landlord_details.full_name', !normalizeText(details.full_name))
    pushIfMissing(missingFieldKeys, 'landlord_details.id_number', !normalizeText(details.id_number))
    pushIfMissing(missingFieldKeys, 'landlord_details.main_email_address', !normalizeText(details.main_email_address))
    pushIfMissing(missingFieldKeys, 'landlord_details.main_contact_number', !normalizeText(details.main_contact_number))
    pushIfMissing(missingFieldKeys, 'landlord_details.residential_address', !normalizeText(details.residential_address))
  } else if (entityType === 'trust') {
    pushIfMissing(missingFieldKeys, 'landlord_details.trust_name', !normalizeText(details.trust_name))
    pushIfMissing(missingFieldKeys, 'landlord_details.trust_registration_number', !normalizeText(details.trust_registration_number))
    pushIfMissing(missingFieldKeys, 'landlord_details.registered_address', !normalizeText(details.registered_address))
    pushIfMissing(missingFieldKeys, 'landlord_details.main_contact_number', !normalizeText(details.main_contact_number))
    pushIfMissing(missingFieldKeys, 'landlord_details.main_email_address', !normalizeText(details.main_email_address))
  } else {
    pushIfMissing(missingFieldKeys, 'landlord_details.legal_name', !normalizeText(details.legal_name))
    pushIfMissing(missingFieldKeys, 'landlord_details.registration_number', !normalizeText(details.registration_number) && entityType !== 'government_entity' && entityType !== 'other')
    pushIfMissing(missingFieldKeys, 'landlord_details.registered_address', !normalizeText(details.registered_address))
    pushIfMissing(missingFieldKeys, 'landlord_details.main_contact_number', !normalizeText(details.main_contact_number))
    pushIfMissing(missingFieldKeys, 'landlord_details.main_email_address', !normalizeText(details.main_email_address))
  }

  const assetManagers = Array.isArray(form.asset_managers) ? form.asset_managers : []
  const propertyManagers = Array.isArray(form.property_managers) ? form.property_managers : []
  const primaryAssetManager = assetManagers.find((row) => row.is_primary)
  const primaryPropertyManager = propertyManagers.find((row) => row.is_primary)

  pushIfMissing(missingFieldKeys, 'asset_managers', !assetManagers.length)
  pushIfMissing(missingFieldKeys, 'asset_managers.primary', assetManagers.length > 0 && !primaryAssetManager)
  pushIfMissing(missingFieldKeys, 'property_managers', !propertyManagers.length)
  pushIfMissing(missingFieldKeys, 'property_managers.primary', propertyManagers.length > 0 && !primaryPropertyManager)

  if (requireSubmitReady) {
    pushIfMissing(missingFieldKeys, 'portfolio.asset_types', !Array.isArray(portfolio.asset_types) || !portfolio.asset_types.length)
    pushIfMissing(missingFieldKeys, 'portfolio.number_of_properties', !normalizeText(portfolio.number_of_properties))
    pushIfMissing(missingFieldKeys, 'portfolio.primary_regions', !Array.isArray(portfolio.primary_regions) || !portfolio.primary_regions.length)
  }

  if (portfolio.add_properties_now && requireSubmitReady) {
    pushIfMissing(missingFieldKeys, 'properties', !properties.length)
  }

  properties.forEach((property, index) => {
    if (!requireSubmitReady && !normalizeText(property.property_name)) return
    pushIfMissing(missingFieldKeys, `properties.${index}.property_name`, !normalizeText(property.property_name))
    pushIfMissing(missingFieldKeys, `properties.${index}.property_type`, !normalizeText(property.property_type))
    pushIfMissing(missingFieldKeys, `properties.${index}.city`, !normalizeText(property.city))
    pushIfMissing(missingFieldKeys, `properties.${index}.province`, !normalizeText(property.province))
    ;(property.vacancies || []).forEach((vacancy, vacancyIndex) => {
      if (!requireSubmitReady && !normalizeText(vacancy.vacancy_name)) return
      pushIfMissing(missingFieldKeys, `properties.${index}.vacancies.${vacancyIndex}.vacancy_name`, !normalizeText(vacancy.vacancy_name))
      pushIfMissing(missingFieldKeys, `properties.${index}.vacancies.${vacancyIndex}.available_area_m2`, !normalizeText(vacancy.available_area_m2))
      pushIfMissing(missingFieldKeys, `properties.${index}.vacancies.${vacancyIndex}.rental_per_m2`, !normalizeText(vacancy.rental_per_m2))
      pushIfMissing(missingFieldKeys, `properties.${index}.vacancies.${vacancyIndex}.availability_date`, !normalizeText(vacancy.availability_date))
    })
  })

  const mandateRequest = normalizeLower(form.mandate_request)
  if (requireSubmitReady && ['leasing', 'sales', 'both'].includes(mandateRequest)) {
    pushIfMissing(missingFieldKeys, 'mandates', !Array.isArray(form.mandates) || !form.mandates.length)
    ;(form.mandates || []).forEach((mandate, index) => {
      pushIfMissing(missingFieldKeys, `mandates.${index}.mandate_kind`, !normalizeText(mandate.mandate_kind))
      pushIfMissing(missingFieldKeys, `mandates.${index}.mandate_type`, !normalizeText(mandate.mandate_type))
      pushIfMissing(missingFieldKeys, `mandates.${index}.start_date`, !normalizeText(mandate.start_date))
      pushIfMissing(missingFieldKeys, `mandates.${index}.expiry_date`, !normalizeText(mandate.expiry_date))
      pushIfMissing(missingFieldKeys, `mandates.${index}.commission_structure`, !normalizeText(mandate.commission_structure))
    })
  }

  if (missingFieldKeys.length) {
    errors.general = 'Please complete the highlighted landlord onboarding fields.'
  }

  return { errors, missingFieldKeys: unique(missingFieldKeys) }
}

function documentKeysFromRows(rows = []) {
  return new Set((rows || []).map((row) => normalizeLower(row.document_key || row.key || row.metadata?.documentKey || row.document_name)))
}

export function calculateLandlordOnboardingProgress({
  form = {},
  uploadedDocuments = [],
  requiredDocuments = [],
} = {}) {
  const { missingFieldKeys } = validateLandlordOnboardingForm(form, { requireSubmitReady: true })
  const uploadedKeys = documentKeysFromRows(uploadedDocuments)
  const missingDocumentKeys = requiredDocuments
    .filter((document) => !uploadedKeys.has(normalizeLower(document.key)) && !uploadedKeys.has(normalizeLower(document.label)))
    .map((document) => document.key)
  const totalPropertyCount = (form.properties || []).length
  const totalVacancyCount = (form.properties || []).reduce((count, property) => count + (property.vacancies || []).length, 0)
  const completedSignals = [
    normalizeText(form.entity_type),
    normalizeText(form.landlord_details?.legal_name || form.landlord_details?.full_name || form.landlord_details?.trust_name),
    normalizeText(form.landlord_details?.main_email_address),
    normalizeText(form.landlord_details?.main_contact_number),
    (form.asset_managers || []).length,
    (form.property_managers || []).length,
    (form.portfolio?.asset_types || []).length,
    totalPropertyCount,
    totalVacancyCount,
    (form.mandates || []).length,
    requiredDocuments.length - missingDocumentKeys.length,
  ]
  const populatedCount = completedSignals.filter((value) => {
    if (typeof value === 'number') return value > 0
    return Boolean(normalizeText(value))
  }).length
  const completionPercentage = Math.max(0, Math.min(100, Math.round((populatedCount / Math.max(completedSignals.length, 1)) * 100)))
  return {
    completionPercentage,
    missingFieldKeys,
    missingDocumentKeys,
    missingCount: missingFieldKeys.length + missingDocumentKeys.length,
  }
}

export function buildLandlordOnboardingSummary(form = {}) {
  const entityType = LANDLORD_ENTITY_TYPE_OPTIONS.find((option) => option.value === normalizeLower(form.entity_type))
  const totalProperties = (form.properties || []).length
  const totalVacancies = (form.properties || []).reduce((count, property) => count + (property.vacancies || []).length, 0)
  const totalGla = toNumber(form.portfolio?.estimated_total_gla)
  return [
    ['Entity Type', entityType?.label || normalizeText(form.entity_type) || '-'],
    ['Landlord', normalizeText(form.landlord_details?.legal_name || form.landlord_details?.full_name || form.landlord_details?.trust_name) || '-'],
    ['Primary Email', normalizeText(form.landlord_details?.main_email_address) || '-'],
    ['Primary Contact', normalizeText(form.landlord_details?.main_contact_number) || '-'],
    ['Asset Managers', String((form.asset_managers || []).length || 0)],
    ['Property Managers', String((form.property_managers || []).length || 0)],
    ['Properties', String(totalProperties)],
    ['Vacancies', String(totalVacancies)],
    ['Estimated Total GLA', totalGla ? `${totalGla.toLocaleString()} m²` : '-'],
    ['Mandate Request', LANDLORD_MANDATE_OPTIONS.find((option) => option.value === normalizeLower(form.mandate_request))?.label || 'Not now'],
    ['Banking Details', normalizeText(form.banking_details?.bank_name || form.banking_details?.account_holder) ? 'Captured' : 'Outstanding'],
  ]
}
