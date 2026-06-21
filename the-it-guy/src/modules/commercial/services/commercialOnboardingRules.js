import {
  getPropertyDisclosureStatus,
  isPropertyDisclosureDigitallyComplete,
  normalizePropertyDisclosure,
} from '../../../lib/propertyDisclosure'

const CLIENT_TYPES = [
  { value: 'tenant', label: 'Tenant' },
  { value: 'seller', label: 'Seller' },
]

const TENANT_ENTITY_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
  { value: 'close_corporation', label: 'Close Corporation' },
  { value: 'trust', label: 'Trust' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'franchise_group', label: 'Franchise Group' },
  { value: 'listed_entity', label: 'Listed Entity / Corporate' },
]

const SELLER_ENTITY_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
  { value: 'close_corporation', label: 'Close Corporation' },
  { value: 'trust', label: 'Trust' },
  { value: 'fund', label: 'Fund' },
  { value: 'reit', label: 'REIT' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'listed_entity', label: 'Listed Entity' },
]

const ASSET_CATEGORIES = [
  { value: 'office', label: 'Commercial / Office' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'retail', label: 'Retail' },
  { value: 'agricultural', label: 'Agricultural' },
]

const FORM_FIELD_TYPE = {
  text: 'text',
  email: 'email',
  phone: 'tel',
  number: 'number',
  textarea: 'textarea',
  select: 'select',
  checkbox: 'checkbox',
  date: 'date',
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeClientType(value = 'tenant') {
  const normalized = normalizeLower(value)
  return normalized === 'seller' ? 'seller' : 'tenant'
}

function normalizeAssetCategory(value = 'office') {
  const normalized = normalizeLower(value)
  if (normalized === 'industrial') return 'industrial'
  if (normalized === 'retail') return 'retail'
  if (normalized === 'agricultural') return 'agricultural'
  return 'office'
}

function normalizeEntityType(value = '') {
  const normalized = normalizeLower(value).replace(/[\s/-]+/g, '_')
  if (['individual', 'company', 'trust', 'fund', 'partnership', 'close_corporation', 'franchise_group', 'listed_entity', 'reit'].includes(normalized)) {
    return normalized
  }
  return ''
}

function field(name, label, options = {}) {
  return {
    name,
    label,
    type: options.type || FORM_FIELD_TYPE.text,
    placeholder: options.placeholder || '',
    options: options.options || [],
    help: options.help || '',
    required: Boolean(options.required),
    optional: Boolean(options.optional),
    width: options.width || 'full',
    row: options.row || '',
    persist: options.persist !== false,
  }
}

function requiredDoc(key, label, options = {}) {
  return {
    key,
    label,
    required: options.required !== false,
    optional: Boolean(options.optional),
    notes: options.notes || '',
  }
}

function tenantBaseFields() {
  return [
    field('tenantProfileType', 'Tenant Type', {
      type: FORM_FIELD_TYPE.select,
      options: [
        { value: 'new_lease', label: 'New Lease' },
        { value: 'relocation', label: 'Relocation' },
        { value: 'expansion', label: 'Expansion' },
        { value: 'renewal', label: 'Renewal / Stay vs Go' },
        { value: 'investor', label: 'Investor / Owner Occupier' },
      ],
    }),
    field('tenantName', 'Tenant Name', { required: true }),
    field('tradingName', 'Trading Name'),
    field('registrationNumber', 'Registration Number'),
    field('vatNumber', 'VAT Number'),
    field('vatRegistered', 'VAT Registered', { type: FORM_FIELD_TYPE.checkbox }),
    field('registeredAddress', 'Registered Address'),
    field('tradingAddress', 'Trading Address'),
    field('contactPerson', 'Contact Person'),
    field('email', 'Email', { type: FORM_FIELD_TYPE.email, required: true }),
    field('mobileNumber', 'Mobile Number', { type: FORM_FIELD_TYPE.phone }),
    field('industry', 'Industry / Business Type'),
    field('businessActivity', 'Business Activity', { type: FORM_FIELD_TYPE.textarea }),
    field('website', 'Website'),
    field('yearsTrading', 'Years Trading', { type: FORM_FIELD_TYPE.number }),
    field('numberOfEmployees', 'Number of Employees', { type: FORM_FIELD_TYPE.number }),
  ]
}

function individualTenantFields() {
  return [
    field('fullName', 'Full Name', { required: true }),
    field('idNumber', 'ID Number'),
    field('residentialAddress', 'Residential Address'),
    field('individualEmail', 'Email', { type: FORM_FIELD_TYPE.email }),
    field('individualMobileNumber', 'Mobile Number', { type: FORM_FIELD_TYPE.phone }),
    field('currentEmployer', 'Current Employer / Business Activity'),
  ]
}

function signatoryFields() {
  return [
    field('directorsMembers', 'Directors / Members / Trustees', { type: FORM_FIELD_TYPE.textarea, placeholder: 'Names, roles, and email addresses if available' }),
    field('signatoryFullName', 'Full Name', { required: true }),
    field('signatoryPosition', 'Position / Title', { required: true }),
    field('signatoryEmail', 'Email', { type: FORM_FIELD_TYPE.email, required: true }),
    field('signatoryMobileNumber', 'Mobile Number', { type: FORM_FIELD_TYPE.phone, required: true }),
    field('signatoryIdNumber', 'ID Number', { optional: true }),
    field('signingCapacity', 'Signing Capacity', { required: true }),
    field('authorityConfirmed', 'Authority Confirmed', { type: FORM_FIELD_TYPE.checkbox, required: true }),
  ]
}

function leaseRequirementFields() {
  return [
    field('preferredProperty', 'Preferred Property / Vacancy'),
    field('currentPremises', 'Current Premises', { type: FORM_FIELD_TYPE.textarea }),
    field('preferredArea', 'Preferred Area / Node', { required: true }),
    field('requiredArea', 'Required Area', { type: FORM_FIELD_TYPE.number }),
    field('parkingRequirement', 'Parking Requirement', { type: FORM_FIELD_TYPE.number }),
    field('operationalRequirements', 'Operational Requirements', { type: FORM_FIELD_TYPE.textarea }),
  ]
}

function tenantOfficeFields() {
  return [
    field('numberOfStaff', 'Number of Staff', { type: FORM_FIELD_TYPE.number }),
    field('requiredOffices', 'Required Offices', { type: FORM_FIELD_TYPE.number }),
    field('boardroomRequirement', 'Boardroom Requirement', { type: FORM_FIELD_TYPE.number }),
    field('meetingRoomRequirement', 'Meeting Room Requirement', { type: FORM_FIELD_TYPE.number }),
    field('receptionRequired', 'Reception Required', { type: FORM_FIELD_TYPE.checkbox }),
    field('parkingBaysRequired', 'Parking Bays Required', { type: FORM_FIELD_TYPE.number }),
    field('fibreRequired', 'Fibre Required', { type: FORM_FIELD_TYPE.checkbox }),
    field('backupPowerRequirement', 'Backup Power Requirement', { type: FORM_FIELD_TYPE.checkbox }),
    field('accessControlRequirement', 'Access Control Requirement', { type: FORM_FIELD_TYPE.checkbox }),
  ]
}

function tenantIndustrialFields() {
  return [
    field('warehouseAreaRequired', 'Warehouse Area Required', { type: FORM_FIELD_TYPE.number }),
    field('officeAreaRequired', 'Office Area Required', { type: FORM_FIELD_TYPE.number }),
    field('yardAreaRequired', 'Yard Area Required', { type: FORM_FIELD_TYPE.number }),
    field('eaveHeightRequired', 'Eave Height Required', { type: FORM_FIELD_TYPE.number }),
    field('rollerShutterRequirement', 'Roller Shutter Requirement', { type: FORM_FIELD_TYPE.checkbox }),
    field('dockLevellerRequirement', 'Dock Leveller Requirement', { type: FORM_FIELD_TYPE.checkbox }),
    field('powerRequirement', 'Power Requirement'),
    field('threePhasePowerRequired', 'Three Phase Power Required', { type: FORM_FIELD_TYPE.checkbox }),
    field('truckAccessRequired', 'Truck Access Required', { type: FORM_FIELD_TYPE.checkbox }),
    field('superlinkAccessRequired', 'Superlink Access Required', { type: FORM_FIELD_TYPE.checkbox }),
    field('hazardousGoodsStored', 'Hazardous Goods Stored', { type: FORM_FIELD_TYPE.checkbox }),
  ]
}

function tenantRetailFields() {
  return [
    field('retailConcept', 'Retail Concept / Brand'),
    field('retailTradingName', 'Trading Name'),
    field('tradingHours', 'Trading Hours'),
    field('shopSizeRequired', 'Shop Size Required', { type: FORM_FIELD_TYPE.number }),
    field('storageRequirement', 'Storage Requirement'),
    field('greaseTrapRequired', 'Grease Trap Required', { type: FORM_FIELD_TYPE.checkbox }),
    field('extractionRequired', 'Extraction Required', { type: FORM_FIELD_TYPE.checkbox }),
    field('signageRequirement', 'Signage Requirement'),
    field('liquorLicence', 'Liquor Licence', { type: FORM_FIELD_TYPE.checkbox }),
    field('anchorTenantPreference', 'Anchor Tenant Preference'),
    field('footTrafficRequirement', 'Foot Traffic Requirement'),
    field('franchiseApprovalRequired', 'Franchise Approval Required', { type: FORM_FIELD_TYPE.checkbox }),
  ]
}

function tenantAgriculturalFields() {
  return [
    field('farmingUse', 'Farming Use'),
    field('landSizeRequired', 'Land Size Required', { type: FORM_FIELD_TYPE.number }),
    field('waterRequirement', 'Water Requirement'),
    field('boreholeRequirement', 'Borehole Requirement', { type: FORM_FIELD_TYPE.checkbox }),
    field('irrigationRequirement', 'Irrigation Requirement', { type: FORM_FIELD_TYPE.checkbox }),
    field('grazingRequirement', 'Grazing Requirement', { type: FORM_FIELD_TYPE.checkbox }),
    field('storageRequirement', 'Storage Requirement'),
    field('staffAccommodationRequired', 'Staff Accommodation Required', { type: FORM_FIELD_TYPE.checkbox }),
    field('equipmentStorageRequired', 'Equipment Storage Required', { type: FORM_FIELD_TYPE.checkbox }),
    field('environmentalApprovalsRequired', 'Environmental Approvals Required', { type: FORM_FIELD_TYPE.checkbox }),
  ]
}

function sellerBaseFields() {
  return [
    field('sellerName', 'Seller Name', { required: true }),
    field('registrationNumber', 'Registration Number'),
    field('vatNumber', 'VAT Number'),
    field('vatRegistered', 'VAT Registered', { type: FORM_FIELD_TYPE.checkbox }),
    field('registeredAddress', 'Registered Address'),
    field('postalAddress', 'Postal Address'),
    field('contactPerson', 'Contact Person'),
    field('email', 'Email', { type: FORM_FIELD_TYPE.email, required: true }),
    field('mobileNumber', 'Mobile Number', { type: FORM_FIELD_TYPE.phone }),
  ]
}

function individualSellerFields() {
  return [
    field('fullName', 'Full Name', { required: true }),
    field('idNumber', 'ID Number'),
    field('residentialAddress', 'Residential Address'),
    field('individualEmail', 'Email', { type: FORM_FIELD_TYPE.email }),
    field('individualMobileNumber', 'Mobile Number', { type: FORM_FIELD_TYPE.phone }),
    field('maritalStatus', 'Marital Status'),
  ]
}

function saleInformationFields() {
  return [
    field('propertyName', 'Property Name', { required: true }),
    field('propertyAddress', 'Property Address', { required: true }),
    field('ownershipDetails', 'Ownership Details', { type: FORM_FIELD_TYPE.textarea }),
    field('erfOrPortionNumber', 'Erf / Portion Number'),
    field('titleDeedNumber', 'Title Deed Number', { optional: true }),
    field('vatApplicable', 'VAT Applicable', { type: FORM_FIELD_TYPE.checkbox }),
    field('currentOccupancyStatus', 'Current Occupancy Status'),
    field('existingTenants', 'Existing Tenants', { type: FORM_FIELD_TYPE.checkbox }),
    field('currentLeaseAgreements', 'Current Lease Agreements', { type: FORM_FIELD_TYPE.checkbox }),
    field('tenantSchedule', 'Tenant Schedule', { type: FORM_FIELD_TYPE.textarea }),
    field('existingLeaseSummary', 'Existing Leases Summary', { type: FORM_FIELD_TYPE.textarea }),
    field('operatingCosts', 'Operating Costs'),
    field('municipalAccountNumber', 'Municipal Account Number', { optional: true }),
    field('disclosureInformation', 'Disclosure Information / Known Defects', { type: FORM_FIELD_TYPE.textarea }),
  ]
}

function tenantDealFields() {
  return [
    field('budgetRange', 'Budget / Rental Range', { required: true }),
    field('depositReadiness', 'Deposit Readiness', {
      type: FORM_FIELD_TYPE.select,
      options: [
        { value: 'ready_now', label: 'Ready Now' },
        { value: 'ready_on_approval', label: 'Ready on Approval' },
        { value: 'requires_finance_approval', label: 'Requires Finance Approval' },
        { value: 'unknown', label: 'Not Sure Yet' },
      ],
    }),
    field('leaseTerm', 'Lease Term Preference'),
    field('targetOccupationDate', 'Move-in Timeline', { type: FORM_FIELD_TYPE.date }),
    field('specialConditions', 'Deal Conditions', { type: FORM_FIELD_TYPE.textarea }),
  ]
}

function sellerDealFields() {
  return [
    field('askingPrice', 'Asking Price', { type: FORM_FIELD_TYPE.number, required: true }),
    field('mandateType', 'Mandate Type', {
      type: FORM_FIELD_TYPE.select,
      options: [
        { value: 'open', label: 'Open Mandate' },
        { value: 'sole', label: 'Sole Mandate' },
        { value: 'joint_sole', label: 'Joint Sole Mandate' },
        { value: 'exclusive', label: 'Exclusive Mandate' },
      ],
    }),
    field('reasonForSale', 'Reason for Sale', { type: FORM_FIELD_TYPE.textarea }),
    field('ratesAndTaxes', 'Rates and Taxes'),
    field('levies', 'Levies / Body Corporate Charges'),
    field('existingBond', 'Existing Bond', { type: FORM_FIELD_TYPE.checkbox }),
    field('bondBank', 'Bond Bank'),
    field('bondAccountNumber', 'Bond Account Number', { optional: true }),
    field('outstandingBondAmount', 'Outstanding Bond Amount', { type: FORM_FIELD_TYPE.number, optional: true }),
    field('cancellationAttorneyRequired', 'Cancellation Attorney Required', { type: FORM_FIELD_TYPE.checkbox }),
  ]
}

function sellerOfficeFields() {
  return [
    field('buildingGrade', 'Building Grade'),
    field('gla', 'GLA', { type: FORM_FIELD_TYPE.number }),
    field('vacancyPercentage', 'Vacancy Percentage', { type: FORM_FIELD_TYPE.number }),
    field('parkingBays', 'Parking Bays', { type: FORM_FIELD_TYPE.number }),
    field('currentTenants', 'Current Tenants', { type: FORM_FIELD_TYPE.textarea }),
    field('waleMonths', 'Weighted Average Lease Expiry', { type: FORM_FIELD_TYPE.number, optional: true }),
    field('backupPower', 'Backup Power', { type: FORM_FIELD_TYPE.checkbox }),
    field('fibre', 'Fibre', { type: FORM_FIELD_TYPE.checkbox }),
    field('operatingCostRecovery', 'Operating Cost Recovery'),
  ]
}

function sellerIndustrialFields() {
  return [
    field('warehouseArea', 'Warehouse Area', { type: FORM_FIELD_TYPE.number }),
    field('officeArea', 'Office Area', { type: FORM_FIELD_TYPE.number }),
    field('yardArea', 'Yard Area', { type: FORM_FIELD_TYPE.number }),
    field('eaveHeight', 'Eave Height', { type: FORM_FIELD_TYPE.number }),
    field('powerSupply', 'Power Supply'),
    field('rollerShutterDoors', 'Roller Shutter Doors', { type: FORM_FIELD_TYPE.number }),
    field('dockDoors', 'Dock Doors', { type: FORM_FIELD_TYPE.number }),
    field('truckAccess', 'Truck Access', { type: FORM_FIELD_TYPE.checkbox }),
    field('superlinkAccess', 'Superlink Access', { type: FORM_FIELD_TYPE.checkbox }),
    field('currentIndustrialZoning', 'Current Industrial Zoning'),
    field('environmentalConcerns', 'Environmental Concerns', { type: FORM_FIELD_TYPE.checkbox }),
  ]
}

function sellerRetailFields() {
  return [
    field('centreType', 'Centre Type'),
    field('gla', 'GLA', { type: FORM_FIELD_TYPE.number }),
    field('anchorTenants', 'Anchor Tenants', { type: FORM_FIELD_TYPE.textarea }),
    field('tenantMix', 'Tenant Mix', { type: FORM_FIELD_TYPE.textarea }),
    field('footfall', 'Footfall', { optional: true }),
    field('parkingRatio', 'Parking Ratio'),
    field('marketingLevy', 'Marketing Levy'),
    field('operatingCostRecovery', 'Operating Cost Recovery'),
    field('vacancyPercentage', 'Vacancy Percentage', { type: FORM_FIELD_TYPE.number }),
    field('tradingDensity', 'Trading Density', { optional: true }),
  ]
}

function sellerAgriculturalFields() {
  return [
    field('totalHectares', 'Total Hectares', { type: FORM_FIELD_TYPE.number }),
    field('arableHectares', 'Arable Hectares', { type: FORM_FIELD_TYPE.number }),
    field('grazingHectares', 'Grazing Hectares', { type: FORM_FIELD_TYPE.number }),
    field('waterRights', 'Water Rights'),
    field('boreholes', 'Boreholes', { type: FORM_FIELD_TYPE.number }),
    field('dams', 'Dams', { type: FORM_FIELD_TYPE.number }),
    field('irrigation', 'Irrigation'),
    field('improvements', 'Improvements', { type: FORM_FIELD_TYPE.textarea }),
    field('currentFarmingUse', 'Current Farming Use'),
    field('vatStatus', 'VAT Status'),
    field('staffHousing', 'Staff Housing'),
    field('equipmentIncluded', 'Equipment Included', { type: FORM_FIELD_TYPE.checkbox }),
    field('livestockIncluded', 'Livestock Included', { type: FORM_FIELD_TYPE.checkbox }),
  ]
}

function docsForTenantEntity(entityType = '', vatRegistered = false) {
  const normalizedEntityType = normalizeEntityType(entityType) || 'company'
  if (normalizedEntityType === 'individual') {
    return [
      requiredDoc('id_document', 'ID Document'),
      requiredDoc('proof_of_address', 'Proof of Address'),
      requiredDoc('bank_confirmation_letter', 'Bank Confirmation Letter'),
      requiredDoc('proof_of_income', 'Proof of Income / Affordability Information'),
    ]
  }
  if (normalizedEntityType === 'trust') {
    return [
      requiredDoc('trust_deed', 'Trust Deed'),
      requiredDoc('letters_of_authority', 'Letters of Authority'),
      requiredDoc('trustee_id_documents', 'Trustee ID Documents'),
      requiredDoc('resolution_authorising_signatory', 'Resolution Authorising Signatory'),
      requiredDoc('proof_of_address', 'Proof of Address'),
      requiredDoc('bank_confirmation_letter', 'Bank Confirmation Letter'),
    ]
  }
  const docs = [
    requiredDoc('company_registration_documents', 'Company Registration Documents'),
    requiredDoc('proof_of_address', 'Proof of Address'),
    requiredDoc('director_id_documents', 'Director ID Documents'),
    requiredDoc('resolution_authorising_signatory', 'Resolution Authorising Signatory'),
    requiredDoc('bank_confirmation_letter', 'Bank Confirmation Letter'),
  ]
  if (vatRegistered) docs.splice(1, 0, requiredDoc('vat_certificate', 'VAT Certificate'))
  if (normalizedEntityType === 'franchise_group') {
    docs.splice(4, 0, requiredDoc('franchise_approval_letter', 'Franchise Approval Letter', { optional: true }))
    docs.push(requiredDoc('brand_profile', 'Brand Profile', { optional: true }))
  }
  if (normalizedEntityType === 'partnership') {
    docs.splice(2, 0, requiredDoc('partnership_agreement', 'Partnership Agreement', { optional: true }))
  }
  return docs
}

function docsForSellerEntity(entityType = '', vatRegistered = false) {
  const normalizedEntityType = normalizeEntityType(entityType) || 'company'
  if (normalizedEntityType === 'individual') {
    return [
      requiredDoc('id_document', 'ID Document'),
      requiredDoc('proof_of_address', 'Proof of Address'),
      requiredDoc('marital_status_documents', 'Marital Status Documents', { optional: true }),
      requiredDoc('title_deed', 'Title Deed', { optional: true }),
      requiredDoc('municipal_rates_account', 'Municipal Rates Account'),
      requiredDoc('existing_bond_details', 'Existing Bond Details', { optional: true }),
      requiredDoc('fica_documents', 'FICA Documents'),
    ]
  }
  if (normalizedEntityType === 'trust') {
    return [
      requiredDoc('trust_deed', 'Trust Deed'),
      requiredDoc('letters_of_authority', 'Letters of Authority'),
      requiredDoc('trustee_id_documents', 'Trustee ID Documents'),
      requiredDoc('resolution_authorising_signatory', 'Resolution Authorising Sale / Signatory'),
      requiredDoc('proof_of_address', 'Proof of Address'),
      requiredDoc('title_deed', 'Title Deed', { optional: true }),
      requiredDoc('municipal_rates_account', 'Municipal Rates Account'),
      requiredDoc('existing_bond_details', 'Existing Bond Details', { optional: true }),
      requiredDoc('fica_documents', 'FICA Documents'),
    ]
  }
  if (['fund', 'reit', 'listed_entity'].includes(normalizeEntityType(entityType))) {
    return [
      requiredDoc('entity_registration_documents', 'Entity Registration Documents'),
      requiredDoc('authorising_resolution', 'Authorising Resolution'),
      requiredDoc('signatory_authority_proof', 'Signatory Authority Proof'),
      requiredDoc('authorised_signatory_id', 'Authorised Signatory ID'),
      requiredDoc('vat_certificate', 'VAT Certificate', { optional: !vatRegistered }),
      requiredDoc('title_deed', 'Title Deed', { optional: true }),
      requiredDoc('lease_schedule', 'Lease Schedule', { optional: true }),
      requiredDoc('municipal_account', 'Municipal Account'),
      requiredDoc('existing_finance_or_bond_details', 'Existing Finance / Bond Details', { optional: true }),
      requiredDoc('fica_documents', 'FICA Documents'),
    ]
  }
  const docs = [
    requiredDoc('company_registration_documents', 'Company Registration Documents'),
    requiredDoc('director_id_documents', 'Director ID Documents'),
    requiredDoc('resolution_authorising_signatory', 'Resolution Authorising Sale / Signatory'),
    requiredDoc('proof_of_registered_address', 'Proof of Registered Address'),
    requiredDoc('title_deed', 'Title Deed', { optional: true }),
    requiredDoc('municipal_rates_account', 'Municipal Rates Account'),
    requiredDoc('existing_bond_details', 'Existing Bond Details', { optional: true }),
    requiredDoc('fica_documents', 'FICA Documents'),
  ]
  if (vatRegistered) docs.splice(4, 0, requiredDoc('vat_certificate', 'VAT Certificate'))
  if (['close_corporation', 'partnership'].includes(normalizeEntityType(entityType))) {
    docs.splice(1, 0, requiredDoc('member_or_partner_id_documents', 'Member / Partner ID Documents'))
  }
  return docs
}

function categoryFields(clientType = 'tenant', assetCategory = 'office') {
  const client = normalizeClientType(clientType)
  const category = normalizeAssetCategory(assetCategory)
  if (client === 'tenant') {
    if (category === 'industrial') return tenantIndustrialFields()
    if (category === 'retail') return tenantRetailFields()
    if (category === 'agricultural') return tenantAgriculturalFields()
    return tenantOfficeFields()
  }
  if (category === 'industrial') return sellerIndustrialFields()
  if (category === 'retail') return sellerRetailFields()
  if (category === 'agricultural') return sellerAgriculturalFields()
  return sellerOfficeFields()
}

export function buildCommercialOnboardingPlan(context = {}) {
  const clientType = normalizeClientType(context.clientType)
  const assetCategory = normalizeAssetCategory(context.assetCategory)
  const entityType = normalizeEntityType(context.entityType)
  const vatRegistered = Boolean(context.vatRegistered)

  const entityOptions = clientType === 'tenant' ? TENANT_ENTITY_TYPES : SELLER_ENTITY_TYPES
  const entityQuestion = clientType === 'tenant' ? 'Who is the tenant?' : 'Who is the seller?'
  const assetQuestion = clientType === 'tenant'
    ? 'What type of space is the tenant applying for?'
    : 'What type of asset is being sold?'

  const baseDetailsFields = clientType === 'tenant'
    ? tenantBaseFields()
    : sellerBaseFields()
  const detailedBaseFields = [
    ...baseDetailsFields,
    ...(clientType === 'tenant' && entityType === 'individual' ? individualTenantFields() : []),
    ...(clientType === 'seller' && entityType === 'individual' ? individualSellerFields() : []),
  ]

  const categorySpecificFields = categoryFields(clientType, assetCategory)
  const documents = clientType === 'tenant'
    ? docsForTenantEntity(entityType, vatRegistered)
    : docsForSellerEntity(entityType, vatRegistered)

  const sections = [
    {
      key: 'entity',
      title: entityQuestion,
      description: 'Select the legal party first so the rest of the onboarding rules can resolve cleanly.',
      fields: [
        field('entityType', entityQuestion, { type: FORM_FIELD_TYPE.select, options: entityOptions, required: true }),
        field('assetCategory', assetQuestion, { type: FORM_FIELD_TYPE.select, options: ASSET_CATEGORIES, required: true }),
      ],
    },
    {
      key: clientType === 'tenant' ? 'tenant-details' : 'seller-details',
      title: clientType === 'tenant' ? 'Tenant Details' : 'Seller / Owner Details',
      description: clientType === 'tenant'
        ? 'Capture the legal tenant and trading footprint.'
        : 'Capture the legal owner or seller entity.',
      fields: detailedBaseFields,
    },
    {
      key: 'signatory',
      title: clientType === 'tenant' ? 'Authorised Signatory' : 'Asset Manager / Authorised Signatory',
      description: 'The person signing on behalf of the legal entity.',
      fields: signatoryFields(),
    },
    {
      key: clientType === 'tenant' ? 'requirement' : 'sale-information',
      title: clientType === 'tenant' ? 'Lease Requirement Details' : 'Property Sale Information',
      description: clientType === 'tenant'
        ? 'Capture what the occupier needs from the market.'
        : 'Capture the asset information required to progress a disposal.',
      fields: clientType === 'tenant' ? leaseRequirementFields() : saleInformationFields(),
    },
    {
      key: 'deal-details',
      title: 'Deal Details',
      description: clientType === 'tenant'
        ? 'Confirm timing, budget, deposit readiness, and commercial terms.'
        : 'Confirm pricing, mandate, rates, bond, and sale readiness details.',
      fields: clientType === 'tenant' ? tenantDealFields() : sellerDealFields(),
    },
    {
      key: 'category',
      title: assetCategory === 'office'
        ? 'Commercial / Office'
        : assetCategory === 'industrial'
          ? 'Industrial'
          : assetCategory === 'retail'
            ? 'Retail'
            : 'Agricultural',
      description: clientType === 'tenant'
        ? 'Category-specific tenant operating requirements.'
        : 'Category-specific asset and investment information.',
      fields: categorySpecificFields,
    },
    {
      key: 'documents',
      title: 'Required Documents',
      description: entityType
        ? 'Upload the documents that match the selected legal structure.'
        : 'Select the legal structure first to resolve the document checklist.',
      documents,
    },
  ]

  const requiredFields = sections.flatMap((section) => (section.fields || []).filter((item) => item.required).map((item) => item.name))
  const requiredDocuments = documents.filter((doc) => doc.required).map((doc) => doc.key)

  return {
    clientType,
    assetCategory,
    entityType,
    entityOptions,
    assetQuestion,
    entityQuestion,
    sections,
    requiredFields,
    requiredDocuments,
    documents,
  }
}

function hasFieldValue(value) {
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  return normalizeText(value).length > 0
}

function normalizeDocumentKey(value = '') {
  return normalizeLower(value).replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_]/g, '')
}

function documentMatchesRequirement(document = {}, requirement = {}) {
  const left = [
    document.key,
    document.category,
    document.title,
    document.document_name,
    document.file_name,
  ].map(normalizeDocumentKey).filter(Boolean).join(' ')
  const right = [requirement.key, requirement.label].map(normalizeDocumentKey).filter(Boolean).join(' ')
  return Boolean(left && right && (left.includes(right) || right.includes(left)))
}

export function buildCommercialOnboardingCompletion({ plan = {}, responses = {}, documents = [], documentRequests = [] } = {}) {
  const requiredFields = new Set(plan.requiredFields || [])
  const requiredDocuments = (plan.documents || []).filter((item) => item.required)
  const completedRequiredFields = [...requiredFields].filter((name) => hasFieldValue(responses?.[name])).length
  const completedRequiredDocuments = requiredDocuments.filter((requirement) => {
    return [...(documents || []), ...(documentRequests || [])].some((document) => {
      if (document.status && ['approved', 'completed', 'archived', 'verified'].includes(normalizeLower(document.status))) return true
      return documentMatchesRequirement(document, requirement)
    })
  }).length

  const totalItems = requiredFields.size + requiredDocuments.length
  const completedItems = completedRequiredFields + completedRequiredDocuments
  const disclosure = normalizePropertyDisclosure(responses.propertyDisclosure || responses.property_disclosure || {}, { kind: 'commercial' })
  const disclosureRequired = plan.clientType === 'seller'
  const disclosureComplete = !disclosureRequired || isPropertyDisclosureDigitallyComplete(disclosure)
  const adjustedTotalItems = totalItems + (disclosureRequired ? 1 : 0)
  const adjustedCompletedItems = completedItems + (disclosureComplete && disclosureRequired ? 1 : 0)
  const completionPercentage = adjustedTotalItems ? Math.round((adjustedCompletedItems / adjustedTotalItems) * 100) : 0
  const missingFields = [...requiredFields].filter((name) => !hasFieldValue(responses?.[name]))
  if (disclosureRequired && !disclosureComplete) missingFields.push('Property Disclosure')
  const missingDocuments = requiredDocuments.filter((requirement) => {
    return ![...(documents || []), ...(documentRequests || [])].some((document) => documentMatchesRequirement(document, requirement))
  })

  return {
    completionPercentage,
    completedRequiredFields,
    requiredFieldCount: requiredFields.size,
    completedRequiredDocuments,
    requiredDocumentCount: requiredDocuments.length,
    missingFields,
    missingDocuments,
    propertyDisclosureStatus: getPropertyDisclosureStatus(disclosure),
    propertyDisclosureComplete: disclosureComplete,
    isComplete: completionPercentage === 100,
  }
}

export function normalizeCommercialOnboardingResponses(responses = {}) {
  return Object.entries(responses || {}).reduce((accumulator, [key, value]) => {
    if (value === undefined) return accumulator
    accumulator[key] = value
    return accumulator
  }, {})
}

export {
  ASSET_CATEGORIES as COMMERCIAL_ONBOARDING_ASSET_CATEGORY_OPTIONS,
  CLIENT_TYPES as COMMERCIAL_ONBOARDING_CLIENT_TYPE_OPTIONS,
  SELLER_ENTITY_TYPES as COMMERCIAL_ONBOARDING_SELLER_ENTITY_OPTIONS,
  TENANT_ENTITY_TYPES as COMMERCIAL_ONBOARDING_TENANT_ENTITY_OPTIONS,
  FORM_FIELD_TYPE as COMMERCIAL_ONBOARDING_FIELD_TYPES,
  normalizeAssetCategory,
  normalizeClientType,
  normalizeEntityType,
}
