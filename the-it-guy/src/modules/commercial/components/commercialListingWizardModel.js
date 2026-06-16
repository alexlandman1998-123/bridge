function normalizeText(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function splitMultiline(value) {
  return String(value || '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== '') return value
  }
  return ''
}

export const LISTING_INTENT_OPTIONS = [
  {
    value: 'lease',
    label: 'Lease',
    description: 'Market available space, capture vacancy details, and flow naturally into leasing.',
  },
  {
    value: 'sale',
    label: 'Sale',
    description: 'Market a property for disposal, capture mandate details, and flow into sales deals.',
  },
]

export const PROPERTY_CATEGORY_OPTIONS = [
  {
    value: 'commercial',
    label: 'Commercial',
    description: 'Office buildings, office parks, business suites.',
  },
  {
    value: 'industrial',
    label: 'Industrial',
    description: 'Warehouses, factories, logistics parks, yards.',
  },
  {
    value: 'retail',
    label: 'Retail',
    description: 'Shopping centres, stores, showrooms, restaurants.',
  },
  {
    value: 'agricultural',
    label: 'Agricultural',
    description: 'Farms, land, agri facilities, rural commercial assets.',
  },
]

export const VISIBILITY_OPTIONS = [
  { value: 'internal', label: 'Internal' },
  { value: 'private', label: 'Private' },
  { value: 'public', label: 'Public' },
]

export function listingStatusOptions(intent = 'lease') {
  if (intent === 'sale') {
    return [
      { value: 'draft', label: 'Draft' },
      { value: 'available', label: 'Available' },
      { value: 'under_offer', label: 'Under Offer' },
      { value: 'sold', label: 'Sold' },
      { value: 'archived', label: 'Archived' },
    ]
  }

  return [
    { value: 'draft', label: 'Draft' },
    { value: 'available', label: 'Available' },
    { value: 'under_negotiation', label: 'Under Negotiation' },
    { value: 'heads_of_terms', label: 'Heads of Terms' },
    { value: 'leased', label: 'Leased' },
    { value: 'archived', label: 'Archived' },
  ]
}

export function createInitialValues(lookups = {}) {
  const brokerValue = Array.isArray(lookups.brokers) && lookups.brokers.length === 1 ? lookups.brokers[0].value : ''
  return {
    listing_intent: '',
    property_category: '',
    property_link_mode: 'existing',
    property_id: '',
    landlord_id: '',
    broker_id: brokerValue,
    branch_id: '',
    team_id: '',
    new_landlord_name: '',
    new_landlord_contact: '',
    new_property_name: '',
    new_property_address: '',
    new_property_suburb: '',
    new_property_city: '',
    new_property_province: '',
    new_property_country: 'South Africa',
    title: '',
    property_name: '',
    description: '',
    listing_status: 'draft',
    visibility: 'internal',
    featured: false,
    parking_ratio: '',
    office_grade: '',
    number_of_floors: '',
    lift_access: false,
    backup_power: false,
    backup_water: false,
    fibre_availability: false,
    reception_area: false,
    boardrooms: '',
    kitchenette: false,
    shared_facilities: '',
    security: '',
    access_control: '',
    warehouse_height: '',
    roller_shutter_doors: '',
    yard_size: '',
    power_supply: '',
    amperage: '',
    loading_bays: '',
    truck_access: false,
    superlink_access: false,
    sprinkler_system: false,
    office_component: '',
    mezzanine: false,
    crane_capacity: '',
    dock_levellers: '',
    three_phase_power: false,
    retail_frontage: '',
    foot_traffic: '',
    centre_type: '',
    anchor_tenants: '',
    shop_number: '',
    trading_area: '',
    storage_area: '',
    loading_access: '',
    signage_opportunity: '',
    tenant_mix: '',
    parking_availability: '',
    visibility_from_road: '',
    liquor_food_suitability: '',
    farm_size: '',
    arable_land_size: '',
    water_rights: '',
    boreholes: '',
    irrigation: '',
    soil_type: '',
    improvements: '',
    farm_buildings: '',
    fencing: '',
    eskom_power: false,
    worker_accommodation: '',
    access_roads: '',
    current_agricultural_use: '',
    zoning_land_use_rights: '',
    existing_vacancy_id: '',
    new_vacancy_name: '',
    unit_or_floor_suite: '',
    availability_date: '',
    gross_lettable_area: '',
    available_area: '',
    gross_rental_per_m2: '',
    net_rental_per_m2: '',
    operating_costs: '',
    rates_and_taxes: '',
    parking_bays: '',
    escalation_percentage: '',
    lease_term: '',
    tenant_installation_allowance: '',
    deposit_requirement: '',
    occupation_date: '',
    lease_type: '',
    existing_tenant: '',
    lease_expiry_date: '',
    vacant_occupied_status: 'vacant',
    asking_price: '',
    price_per_m2: '',
    erf_size: '',
    building_size: '',
    occupancy_status: '',
    current_rental_income: '',
    net_operating_income: '',
    yield_value: '',
    cap_rate: '',
    zoning: '',
    title_deed_information: '',
    municipal_valuation: '',
    lease_encumbrances: '',
    tenant_schedule: '',
    investment_summary: '',
    sale_mandate_type: '',
    sale_mandate_status: '',
    mandate_expiry_date: '',
    photo_urls: '',
    brochure_url: '',
    floor_plan_url: '',
    supporting_document_urls: '',
    internal_notes: '',
  }
}

export function getWizardSteps(values = {}) {
  const intentLabel = values.listing_intent === 'sale' ? 'Sale Details' : 'Lease Terms'
  return [
    { id: 'intent', label: 'Listing Type' },
    { id: 'category', label: 'Category' },
    { id: 'property', label: 'Property Details' },
    { id: 'details', label: 'Commercial Details' },
    { id: 'terms', label: intentLabel },
    { id: 'media', label: 'Media & Documents' },
    { id: 'review', label: 'Review & Create' },
  ]
}

export function getCategoryFields(category = '') {
  if (category === 'industrial') {
    return [
      { name: 'warehouse_height', label: 'Warehouse height', type: 'text' },
      { name: 'roller_shutter_doors', label: 'Roller shutter doors', type: 'number' },
      { name: 'yard_size', label: 'Yard size', type: 'number', suffix: 'm2' },
      { name: 'power_supply', label: 'Power supply' },
      { name: 'amperage', label: 'Amperage', type: 'number' },
      { name: 'loading_bays', label: 'Loading bays', type: 'number' },
      { name: 'truck_access', label: 'Truck access', type: 'checkbox' },
      { name: 'superlink_access', label: 'Superlink access', type: 'checkbox' },
      { name: 'sprinkler_system', label: 'Sprinkler system', type: 'checkbox' },
      { name: 'office_component', label: 'Office component' },
      { name: 'mezzanine', label: 'Mezzanine', type: 'checkbox' },
      { name: 'crane_capacity', label: 'Crane capacity' },
      { name: 'dock_levellers', label: 'Dock levellers', type: 'number' },
      { name: 'three_phase_power', label: 'Three-phase power', type: 'checkbox' },
    ]
  }

  if (category === 'retail') {
    return [
      { name: 'retail_frontage', label: 'Retail frontage' },
      { name: 'foot_traffic', label: 'Foot traffic' },
      { name: 'centre_type', label: 'Centre type' },
      { name: 'anchor_tenants', label: 'Anchor tenants' },
      { name: 'shop_number', label: 'Shop number' },
      { name: 'trading_area', label: 'Trading area', type: 'number', suffix: 'm2' },
      { name: 'storage_area', label: 'Storage area', type: 'number', suffix: 'm2' },
      { name: 'loading_access', label: 'Loading access' },
      { name: 'signage_opportunity', label: 'Signage opportunity' },
      { name: 'tenant_mix', label: 'Tenant mix' },
      { name: 'parking_availability', label: 'Parking availability' },
      { name: 'visibility_from_road', label: 'Visibility from road' },
      { name: 'liquor_food_suitability', label: 'Liquor / food suitability' },
    ]
  }

  if (category === 'agricultural') {
    return [
      { name: 'farm_size', label: 'Farm size', type: 'number', suffix: 'ha' },
      { name: 'arable_land_size', label: 'Arable land size', type: 'number', suffix: 'ha' },
      { name: 'water_rights', label: 'Water rights' },
      { name: 'boreholes', label: 'Boreholes', type: 'number' },
      { name: 'irrigation', label: 'Irrigation' },
      { name: 'soil_type', label: 'Soil type' },
      { name: 'improvements', label: 'Improvements', type: 'textarea', span: 'full' },
      { name: 'farm_buildings', label: 'Farm buildings' },
      { name: 'fencing', label: 'Fencing' },
      { name: 'eskom_power', label: 'Eskom power', type: 'checkbox' },
      { name: 'worker_accommodation', label: 'Worker accommodation' },
      { name: 'access_roads', label: 'Access roads' },
      { name: 'current_agricultural_use', label: 'Current agricultural use' },
      { name: 'zoning_land_use_rights', label: 'Zoning / land use rights' },
    ]
  }

  return [
    { name: 'office_grade', label: 'Office grade' },
    { name: 'number_of_floors', label: 'Number of floors', type: 'number' },
    { name: 'lift_access', label: 'Lift access', type: 'checkbox' },
    { name: 'backup_power', label: 'Backup power', type: 'checkbox' },
    { name: 'backup_water', label: 'Backup water', type: 'checkbox' },
    { name: 'fibre_availability', label: 'Fibre availability', type: 'checkbox' },
    { name: 'reception_area', label: 'Reception area', type: 'checkbox' },
    { name: 'boardrooms', label: 'Boardrooms', type: 'number' },
    { name: 'kitchenette', label: 'Kitchenette', type: 'checkbox' },
    { name: 'shared_facilities', label: 'Shared facilities' },
    { name: 'security', label: 'Security' },
    { name: 'access_control', label: 'Access control' },
    { name: 'parking_ratio', label: 'Parking ratio' },
  ]
}

export function getTermFields(intent = 'lease') {
  if (intent === 'sale') {
    return [
      { name: 'asking_price', label: 'Asking price', type: 'number' },
      { name: 'price_per_m2', label: 'Price per m2', type: 'number' },
      { name: 'erf_size', label: 'Erf size', type: 'number', suffix: 'm2' },
      { name: 'building_size', label: 'Building size', type: 'number', suffix: 'm2' },
      { name: 'occupancy_status', label: 'Occupancy status' },
      { name: 'current_rental_income', label: 'Current rental income', type: 'number' },
      { name: 'net_operating_income', label: 'Net operating income', type: 'number' },
      { name: 'yield_value', label: 'Yield', type: 'number' },
      { name: 'cap_rate', label: 'Cap rate', type: 'number' },
      { name: 'zoning', label: 'Zoning' },
      { name: 'title_deed_information', label: 'Title deed information' },
      { name: 'rates_and_taxes', label: 'Rates and taxes', type: 'number' },
      { name: 'municipal_valuation', label: 'Municipal valuation', type: 'number' },
      { name: 'lease_encumbrances', label: 'Lease encumbrances', type: 'textarea', span: 'full' },
      { name: 'tenant_schedule', label: 'Tenant schedule', type: 'textarea', span: 'full' },
      { name: 'investment_summary', label: 'Investment summary', type: 'textarea', span: 'full' },
      { name: 'sale_mandate_type', label: 'Sale mandate type' },
      { name: 'sale_mandate_status', label: 'Mandate status' },
      { name: 'mandate_expiry_date', label: 'Mandate expiry date', type: 'date' },
    ]
  }

  return [
    { name: 'existing_vacancy_id', label: 'Link existing vacancy', type: 'select', optionsFrom: 'vacancies' },
    { name: 'new_vacancy_name', label: 'New vacancy name' },
    { name: 'unit_or_floor_suite', label: 'Unit / floor / suite number' },
    { name: 'gross_lettable_area', label: 'Gross lettable area', type: 'number', suffix: 'm2' },
    { name: 'available_area', label: 'Available area', type: 'number', required: true, suffix: 'm2' },
    { name: 'availability_date', label: 'Availability date', type: 'date', required: true },
    { name: 'gross_rental_per_m2', label: 'Gross rental per m2', type: 'number', required: true },
    { name: 'net_rental_per_m2', label: 'Net rental per m2', type: 'number' },
    { name: 'operating_costs', label: 'Operating costs', type: 'number' },
    { name: 'rates_and_taxes', label: 'Rates and taxes', type: 'number' },
    { name: 'parking_bays', label: 'Parking bays', type: 'number' },
    { name: 'escalation_percentage', label: 'Escalation percentage', type: 'number' },
    { name: 'lease_term', label: 'Lease term' },
    { name: 'tenant_installation_allowance', label: 'Tenant installation allowance', type: 'number' },
    { name: 'deposit_requirement', label: 'Deposit requirement' },
    { name: 'occupation_date', label: 'Occupation date', type: 'date' },
    { name: 'lease_type', label: 'Lease type' },
    { name: 'existing_tenant', label: 'Existing tenant' },
    { name: 'lease_expiry_date', label: 'Lease expiry date', type: 'date' },
    { name: 'vacant_occupied_status', label: 'Vacant / occupied status' },
  ]
}

function categoryFieldValues(values = {}) {
  return getCategoryFields(values.property_category).reduce((accumulator, field) => {
    if (values[field.name] !== '' && values[field.name] !== null && values[field.name] !== undefined) {
      accumulator[field.name] = field.type === 'number' ? toNumber(values[field.name]) : field.type === 'checkbox' ? Boolean(values[field.name]) : normalizeText(values[field.name])
    }
    return accumulator
  }, {})
}

function leaseTermValues(values = {}) {
  if (values.listing_intent !== 'lease') return {}
  return {
    gross_lettable_area: toNumber(values.gross_lettable_area),
    available_area: toNumber(values.available_area),
    unit_or_floor_suite: normalizeText(values.unit_or_floor_suite),
    availability_date: normalizeText(values.availability_date),
    gross_rental_per_m2: toNumber(values.gross_rental_per_m2),
    net_rental_per_m2: toNumber(values.net_rental_per_m2),
    operating_costs: toNumber(values.operating_costs),
    rates_and_taxes: toNumber(values.rates_and_taxes),
    parking_ratio: normalizeText(values.parking_ratio),
    parking_bays: toNumber(values.parking_bays),
    escalation_percentage: toNumber(values.escalation_percentage),
    lease_term: normalizeText(values.lease_term),
    tenant_installation_allowance: toNumber(values.tenant_installation_allowance),
    deposit_requirement: normalizeText(values.deposit_requirement),
    occupation_date: normalizeText(values.occupation_date),
    lease_type: normalizeText(values.lease_type),
    existing_tenant: normalizeText(values.existing_tenant),
    lease_expiry_date: normalizeText(values.lease_expiry_date),
    vacant_occupied_status: normalizeText(values.vacant_occupied_status),
  }
}

function saleTermValues(values = {}) {
  if (values.listing_intent !== 'sale') return {}
  return {
    asking_price: toNumber(values.asking_price),
    price_per_m2: toNumber(values.price_per_m2),
    erf_size: toNumber(values.erf_size),
    building_size: toNumber(values.building_size),
    occupancy_status: normalizeText(values.occupancy_status),
    current_rental_income: toNumber(values.current_rental_income),
    net_operating_income: toNumber(values.net_operating_income),
    yield: toNumber(values.yield_value),
    cap_rate: toNumber(values.cap_rate),
    zoning: normalizeText(values.zoning),
    title_deed_information: normalizeText(values.title_deed_information),
    rates_and_taxes: toNumber(values.rates_and_taxes),
    municipal_valuation: toNumber(values.municipal_valuation),
    lease_encumbrances: normalizeText(values.lease_encumbrances),
    tenant_schedule: normalizeText(values.tenant_schedule),
    investment_summary: normalizeText(values.investment_summary),
    sale_mandate_type: normalizeText(values.sale_mandate_type),
    sale_mandate_status: normalizeText(values.sale_mandate_status),
    mandate_expiry_date: normalizeText(values.mandate_expiry_date),
  }
}

function compactObject(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (!value || typeof value !== 'object') return value
  return Object.entries(value).reduce((accumulator, [key, entry]) => {
    if (entry === null || entry === undefined) return accumulator
    if (typeof entry === 'string' && !entry.trim()) return accumulator
    if (Array.isArray(entry) && !entry.length) return accumulator
    if (typeof entry === 'object' && !Array.isArray(entry)) {
      const compacted = compactObject(entry)
      if (!Object.keys(compacted).length) return accumulator
      accumulator[key] = compacted
      return accumulator
    }
    accumulator[key] = entry
    return accumulator
  }, {})
}

function resolveOptionLabel(options = [], value = '') {
  return options.find((option) => option.value === value)?.label || value || '-'
}

export function buildListingPayload(values = {}, lookups = {}) {
  const intent = values.listing_intent
  const propertyMode = values.property_link_mode
  const propertyName = propertyMode === 'existing'
    ? resolveOptionLabel(lookups.properties || [], values.property_id)
    : normalizeText(values.new_property_name)
  const vacancyName = intent === 'lease'
    ? firstPresent(values.new_vacancy_name, values.unit_or_floor_suite ? `${propertyName} ${values.unit_or_floor_suite}` : '', `${propertyName} Vacancy`)
    : ''
  const photoUrls = splitMultiline(values.photo_urls)
  const supportingDocuments = splitMultiline(values.supporting_document_urls)
  const leaseTerms = compactObject(leaseTermValues(values))
  const saleTerms = compactObject(saleTermValues(values))
  const commercialAttributes = compactObject(categoryFieldValues(values))
  const listingStatus = normalizeText(values.listing_status) || 'draft'
  const pricing = intent === 'sale'
    ? toNumber(values.asking_price)
    : firstPresent(toNumber(values.gross_rental_per_m2), toNumber(values.net_rental_per_m2), null)
  const availableFrom = intent === 'sale'
    ? ''
    : firstPresent(values.availability_date, values.occupation_date, '')

  return {
    listing_type: intent,
    listing_category: values.property_category,
    listing_status: listingStatus,
    title: normalizeText(values.title),
    description: normalizeText(values.description),
    pricing,
    pricing_notes: intent === 'sale'
      ? normalizeText(values.investment_summary || values.lease_encumbrances)
      : normalizeText(values.lease_term || values.lease_type),
    featured: Boolean(values.featured),
    available_from: normalizeText(availableFrom) || null,
    landlord_id: normalizeText(values.landlord_id) || null,
    property_id: propertyMode === 'existing' ? normalizeText(values.property_id) || null : null,
    vacancy_id: intent === 'lease' ? normalizeText(values.existing_vacancy_id) || null : null,
    branch_id: normalizeText(values.branch_id) || null,
    team_id: normalizeText(values.team_id) || null,
    broker_id: normalizeText(values.broker_id) || null,
    notes: normalizeText(values.internal_notes) || null,
    new_landlord_name: normalizeText(values.new_landlord_name) || null,
    new_landlord_contact: normalizeText(values.new_landlord_contact) || null,
    new_property_name: propertyMode === 'new' ? normalizeText(values.new_property_name) || null : null,
    new_property_area: propertyMode === 'new' ? firstPresent(values.new_property_suburb, values.new_property_city, values.new_property_province) || null : null,
    new_property_address: propertyMode === 'new' ? normalizeText(values.new_property_address) || null : null,
    new_property_suburb: propertyMode === 'new' ? normalizeText(values.new_property_suburb) || null : null,
    new_property_city: propertyMode === 'new' ? normalizeText(values.new_property_city) || null : null,
    new_property_province: propertyMode === 'new' ? normalizeText(values.new_property_province) || null : null,
    new_property_country: propertyMode === 'new' ? normalizeText(values.new_property_country) || 'South Africa' : null,
    new_property_type: propertyMode === 'new' ? normalizeText(values.property_category) || null : null,
    new_vacancy_name: intent === 'lease' && !normalizeText(values.existing_vacancy_id) ? vacancyName : null,
    new_vacancy_unit: intent === 'lease' && !normalizeText(values.existing_vacancy_id) ? normalizeText(values.unit_or_floor_suite) || null : null,
    new_vacancy_status: intent === 'lease'
      ? (listingStatus === 'available' ? 'available' : listingStatus === 'under_negotiation' ? 'under_negotiation' : listingStatus === 'heads_of_terms' ? 'hot_in_progress' : listingStatus === 'leased' ? 'occupied' : 'draft')
      : null,
    metadata_json: compactObject({
      listing_intent: intent,
      property_category: values.property_category,
      property_details: {
        linked_property_id: normalizeText(values.property_id) || null,
        property_mode: propertyMode,
        property_name: propertyName,
        address: normalizeText(values.new_property_address),
        suburb: normalizeText(values.new_property_suburb),
        city: normalizeText(values.new_property_city),
        province: normalizeText(values.new_property_province),
        country: normalizeText(values.new_property_country),
      },
      contact_context: {
        landlord_id: normalizeText(values.landlord_id),
        landlord_name: normalizeText(values.new_landlord_name),
        landlord_contact: normalizeText(values.new_landlord_contact),
      },
      lease_terms: leaseTerms,
      sale_terms: saleTerms,
      commercial_attributes: commercialAttributes,
      vacancy_context: intent === 'lease' ? compactObject({
        vacancy_id: normalizeText(values.existing_vacancy_id),
        vacancy_name: vacancyName,
        unit_or_floor_suite: normalizeText(values.unit_or_floor_suite),
      }) : {},
      media_notes: {
        supporting_documents: supportingDocuments,
      },
      internal_notes: normalizeText(values.internal_notes),
    }),
    marketing_json: {
      status: listingStatus === 'draft' ? 'draft' : 'live',
      visibility: values.visibility || 'internal',
      workflow_status: listingStatus,
    },
    media_json: {
      photos: photoUrls,
      videos: [],
      brochure: normalizeText(values.brochure_url) || null,
      floor_plan: normalizeText(values.floor_plan_url) || null,
      supporting_documents: supportingDocuments,
    },
    performance_json: {
      views: 0,
      enquiries: 0,
      requirements_matched: 0,
      deals_created: 0,
      conversion_rate: 0,
    },
  }
}

export function validateWizardStep(stepIndex, values = {}) {
  const errors = {}
  if (stepIndex >= 0 && !normalizeText(values.listing_intent)) errors.listing_intent = 'Choose lease or sale.'
  if (stepIndex >= 1 && !normalizeText(values.property_category)) errors.property_category = 'Choose a property category.'

  if (stepIndex >= 2) {
    if (values.property_link_mode === 'existing') {
      if (!normalizeText(values.property_id)) errors.property_id = 'Select a property or switch to new property.'
    } else {
      if (!normalizeText(values.new_property_name)) errors.new_property_name = 'Property name is required.'
      if (!firstPresent(values.new_property_address, values.new_property_suburb, values.new_property_city, values.new_property_province)) {
        errors.new_property_address = 'Capture at least one location field.'
      }
    }
    if (!normalizeText(values.broker_id)) errors.broker_id = 'Assign a broker before continuing.'
  }

  if (stepIndex >= 3) {
    if (!normalizeText(values.title)) errors.title = 'Listing title is required.'
  }

  if (stepIndex >= 4 && normalizeText(values.listing_status) !== 'draft') {
    if (values.listing_intent === 'lease') {
      if (!normalizeText(values.available_area)) errors.available_area = 'Available area is required.'
      if (!normalizeText(values.gross_rental_per_m2)) errors.gross_rental_per_m2 = 'Rental per m2 is required.'
      if (!normalizeText(values.availability_date)) errors.availability_date = 'Availability date is required.'
    }

    if (values.listing_intent === 'sale') {
      if (!normalizeText(values.asking_price)) errors.asking_price = 'Asking price is required.'
      if (!normalizeText(values.building_size) && !normalizeText(values.erf_size)) {
        errors.building_size = 'Building size or erf size is required.'
        errors.erf_size = 'Building size or erf size is required.'
      }
      if (!normalizeText(values.sale_mandate_status)) errors.sale_mandate_status = 'Mandate status is required.'
    }
  }

  return errors
}

export function buildReviewSections(values = {}, lookups = {}) {
  const intent = resolveOptionLabel(LISTING_INTENT_OPTIONS, values.listing_intent)
  const category = resolveOptionLabel(PROPERTY_CATEGORY_OPTIONS, values.property_category)
  const propertyLabel = values.property_link_mode === 'existing'
    ? resolveOptionLabel(lookups.properties || [], values.property_id)
    : normalizeText(values.new_property_name) || 'New property'
  const landlordLabel = values.landlord_id
    ? resolveOptionLabel(lookups.landlords || [], values.landlord_id)
    : normalizeText(values.new_landlord_name) || '-'
  const vacancyLabel = values.listing_intent === 'lease'
    ? firstPresent(resolveOptionLabel(lookups.vacancies || [], values.existing_vacancy_id), values.new_vacancy_name, values.unit_or_floor_suite, '-')
    : '-'

  const shared = [
    ['Listing Type', intent],
    ['Category', category],
    ['Property', propertyLabel],
    ['Landlord / Owner', landlordLabel],
    ['Assigned Broker', resolveOptionLabel(lookups.brokers || [], values.broker_id)],
    ['Listing Title', normalizeText(values.title) || '-'],
    ['Status', resolveOptionLabel(listingStatusOptions(values.listing_intent), values.listing_status)],
    ['Visibility', resolveOptionLabel(VISIBILITY_OPTIONS, values.visibility)],
  ]

  const location = [
    ['Address', normalizeText(values.new_property_address) || '-'],
    ['Suburb / City', [values.new_property_suburb, values.new_property_city].filter(Boolean).join(', ') || '-'],
    ['Province', normalizeText(values.new_property_province) || '-'],
  ]

  const terms = values.listing_intent === 'sale'
    ? [
        ['Asking Price', normalizeText(values.asking_price) || '-'],
        ['Building Size', normalizeText(values.building_size) || '-'],
        ['Erf Size', normalizeText(values.erf_size) || '-'],
        ['Mandate Status', normalizeText(values.sale_mandate_status) || '-'],
      ]
    : [
        ['Vacancy', vacancyLabel],
        ['Available Area', normalizeText(values.available_area) || '-'],
        ['Gross Rental', normalizeText(values.gross_rental_per_m2) || '-'],
        ['Availability', normalizeText(values.availability_date) || '-'],
      ]

  return [
    { id: 'shared', title: 'Listing Summary', rows: shared },
    { id: 'location', title: 'Location', rows: location },
    { id: 'terms', title: values.listing_intent === 'sale' ? 'Sale Snapshot' : 'Lease Snapshot', rows: terms },
  ]
}
