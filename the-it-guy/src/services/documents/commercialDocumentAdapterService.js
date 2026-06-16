function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function titleize(value) {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function pickNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function resolvePropertyAddress(property = {}) {
  return firstText(
    property.address,
    property.property_address,
    [property.suburb, property.city, property.province].filter(Boolean).join(', '),
  )
}

function resolveLandlordAddress(landlord = {}) {
  return firstText(
    landlord.registered_address,
    landlord.address,
    landlord.postal_address,
  )
}

function resolveAssetManagerName(assetManager = {}) {
  return firstText(
    assetManager.full_name,
    assetManager.name,
    [assetManager.first_name, assetManager.last_name].filter(Boolean).join(' '),
  )
}

export const COMMERCIAL_DOCUMENT_PACKET_TYPES = Object.freeze([
  'commercial_sale',
  'commercial_lease',
])

export const COMMERCIAL_ASSET_CATEGORY_OPTIONS = Object.freeze([
  { value: 'office', label: 'Commercial / Office' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'agricultural', label: 'Agricultural' },
  { value: 'retail', label: 'Retail' },
])

export const COMMERCIAL_DOCUMENT_TEMPLATE_FAMILIES = Object.freeze({
  commercial_lease: [
    'Leasing Mandate',
    'Sole Leasing Mandate',
    'Open Leasing Mandate',
    'Joint Leasing Mandate',
    'Heads of Terms',
    'Offer to Lease',
    'Letter of Intent',
    'Commission Agreement',
    'Lease Addendum',
    'Lease Upload Cover Sheet',
  ],
  commercial_sale: [
    'Sales Mandate',
    'Sole Sales Mandate',
    'Open Sales Mandate',
    'Joint Sole Sales Mandate',
    'Exclusive Sales Mandate',
    'Offer to Purchase',
    'Letter of Intent',
    'NDA / Confidentiality Agreement',
    'Due Diligence Checklist',
    'Commission Agreement',
    'Sale Agreement Upload Cover Sheet',
  ],
})

export const COMMERCIAL_DOCUMENT_GENERATOR_ROUTE = '/commercial/document-generator'

export function isCommercialDocumentPacketType(packetType = '') {
  return COMMERCIAL_DOCUMENT_PACKET_TYPES.includes(normalizeLower(packetType))
}

export function resolveCommercialDocumentFamilyLabel(packetType = '') {
  return normalizeLower(packetType) === 'commercial_sale' ? 'Commercial Sale' : 'Commercial Lease'
}

export function resolveCommercialDocumentFamilyDescription(packetType = '') {
  return normalizeLower(packetType) === 'commercial_sale'
    ? 'Commercial sales templates, mandates, diligence, and agreement workflows.'
    : 'Commercial leasing templates, mandates, heads of terms, and lease workflows.'
}

export function resolveCommercialDocumentTitle(packetType = '', context = {}) {
  const family = resolveCommercialDocumentFamilyLabel(packetType)
  const subject = firstText(
    context?.property?.property_name,
    context?.vacancy?.vacancy_name,
    context?.listing?.title,
    context?.landlord?.name,
    context?.company?.company_name,
    context?.company?.name,
    context?.deal?.deal_name,
    'Commercial document',
  )
  return `${family} • ${subject}`
}

function resolveCommercialPropertyFields(context = {}, assetCategory = '') {
  const property = context?.property || {}
  const vacancy = context?.vacancy || {}
  const listing = context?.listing || {}
  const merged = {
    property_name: firstText(property.property_name, vacancy.property_name, listing.title),
    property_address: resolvePropertyAddress(property),
    vacancy_name: firstText(vacancy.vacancy_name, vacancy.unit_or_floor, listing.title),
    broker_name: firstText(context?.broker?.full_name, context?.broker?.name),
    broker_email: firstText(context?.broker?.email),
    broker_mobile: firstText(context?.broker?.mobile, context?.broker?.phone),
    brokerage_name: firstText(context?.organisation?.displayName, context?.organisation?.name),
    mandate_type: firstText(context?.mandateType, titleize(context?.transactionType) || resolveCommercialDocumentFamilyLabel(context?.packetType)),
    transaction_type: titleize(context?.transactionType || context?.commercialTransactionType || ''),
    asset_category: titleize(assetCategory || context?.assetCategory || ''),
  }

  const officeFields = {
    property_name: firstText(property.property_name, listing.title),
    property_address: resolvePropertyAddress(property),
    building_grade: firstText(property.building_grade),
    gla: pickNumber(property.gla_m2, property.available_space_m2, vacancy.available_area_m2),
    office_area: pickNumber(property.office_area_m2),
    parking_bays: pickNumber(property.parking_ratio, property.parking_bays),
    rental_per_m2: pickNumber(property.asking_rental_per_m2, vacancy.asking_rental, listing.pricing),
    office_operating_costs: pickNumber(property.operating_costs, property.operating_cost_per_m2),
    sale_price: pickNumber(property.asking_sale_price, listing.pricing, listing.sale_price),
    rates_and_taxes: pickNumber(property.rates_and_taxes),
    occupation_date: firstText(vacancy.occupation_date, listing.available_from),
    availability_date: firstText(vacancy.availability_date, listing.available_from),
    lease_term: pickNumber(listing.lease_term_months, property.lease_term_months),
    escalation: pickNumber(property.escalation_percentage, listing.escalation_percentage),
  }

  const industrialFields = {
    property_name: firstText(property.property_name, listing.title),
    property_address: resolvePropertyAddress(property),
    warehouse_area: pickNumber(property.warehouse_area_m2, property.gla_m2, vacancy.available_area_m2),
    office_area: pickNumber(property.office_area_m2),
    yard_area: pickNumber(property.yard_size_m2),
    eave_height: pickNumber(property.eaves_height_m, property.height_m),
    roller_shutter_doors: pickNumber(property.roller_doors),
    dock_levellers: pickNumber(property.dock_levellers),
    power_supply: firstText(property.power_supply),
    three_phase_power: firstText(property.three_phase_power),
    superlink_access: firstText(property.superlink_access),
    rental_per_m2: pickNumber(property.asking_rental_per_m2, vacancy.asking_rental, listing.pricing),
    sale_price: pickNumber(property.asking_sale_price, listing.pricing, listing.sale_price),
    occupation_date: firstText(vacancy.occupation_date, listing.available_from),
    availability_date: firstText(vacancy.availability_date, listing.available_from),
  }

  const retailFields = {
    centre_name: firstText(property.property_name, listing.title),
    shop_number: firstText(vacancy.unit_or_floor, property.unit_or_floor),
    property_address: resolvePropertyAddress(property),
    trading_area: pickNumber(property.trading_area_m2, vacancy.available_area_m2),
    storage_area: pickNumber(property.storage_area_m2),
    retail_type: firstText(property.mall_type, property.retail_type),
    anchor_tenants: firstText(property.anchor_tenants),
    foot_traffic: firstText(property.foot_traffic),
    grease_trap: firstText(property.grease_trap),
    extraction: firstText(property.extraction),
    signage_rights: firstText(property.signage_rights),
    rental_per_m2: pickNumber(property.asking_rental_per_m2, vacancy.asking_rental, listing.pricing),
    marketing_levy: pickNumber(property.marketing_levy),
    retail_operating_costs: pickNumber(property.operating_costs, property.operating_cost_per_m2),
    availability_date: firstText(vacancy.availability_date, listing.available_from),
    lease_term: pickNumber(listing.lease_term_months, property.lease_term_months),
    escalation: pickNumber(property.escalation_percentage, listing.escalation_percentage),
  }

  const agriculturalFields = {
    farm_name: firstText(property.property_name, listing.title),
    district: firstText(property.suburb, property.city),
    province: firstText(property.province),
    total_hectares: pickNumber(property.farm_size_ha, property.land_size_m2),
    arable_hectares: pickNumber(property.arable_hectares),
    grazing_hectares: pickNumber(property.grazing_hectares),
    water_rights: firstText(property.water_rights),
    boreholes: firstText(property.boreholes),
    dams: firstText(property.dams),
    irrigation: firstText(property.irrigation),
    main_house: firstText(property.main_house),
    staff_housing: firstText(property.staff_housing),
    sheds: firstText(property.sheds),
    current_farming_use: firstText(property.crop_type, property.livestock_capacity),
    sale_price: pickNumber(property.asking_sale_price, listing.pricing, listing.sale_price),
    vat_status: firstText(property.vat_status),
    occupation_date: firstText(vacancy.occupation_date, listing.available_from),
  }

  const categoryFields = assetCategory === 'industrial'
    ? industrialFields
    : assetCategory === 'retail'
      ? retailFields
      : assetCategory === 'agricultural'
        ? agriculturalFields
        : officeFields

  return {
    ...merged,
    ...categoryFields,
    landlord_company_name: firstText(context?.landlord?.name, context?.landlord?.company_name, context?.company?.company_name),
    landlord_registration_number: firstText(context?.landlord?.registration_number, context?.company?.registration_number),
    landlord_vat_number: firstText(context?.landlord?.vat_number, context?.company?.vat_number),
    landlord_registered_address: resolveLandlordAddress(context?.landlord || context?.company || {}),
    landlord_postal_address: firstText(context?.landlord?.postal_address, context?.company?.postal_address),
    landlord_contact_number: firstText(context?.landlord?.phone, context?.landlord?.contact_number, context?.company?.phone),
    landlord_email: firstText(context?.landlord?.email, context?.company?.email),
    asset_manager_name: resolveAssetManagerName(context?.assetManager || context?.signatory || {}),
    asset_manager_position: firstText(context?.assetManager?.position, context?.assetManager?.job_title, context?.signatory?.position),
    asset_manager_email: firstText(context?.assetManager?.email, context?.signatory?.email).toLowerCase(),
    asset_manager_mobile: firstText(context?.assetManager?.mobile, context?.assetManager?.phone),
    asset_manager_id_number: firstText(context?.assetManager?.id_number, context?.signatory?.id_number),
    asset_manager_signing_capacity: firstText(context?.assetManager?.signing_capacity, context?.signatory?.signing_capacity, 'Authorised Signatory'),
    asset_manager_authority_confirmed: context?.assetManager?.authorityConfirmed === false || context?.signatory?.authorityConfirmed === false ? 'No' : 'Yes',
    commission_percentage: firstText(context?.commissionPercentage, context?.deal?.estimated_commission, context?.listing?.commission_percentage),
    mandate_start_date: firstText(context?.mandate?.start_date, context?.mandateStartDate, context?.createdAt),
    mandate_expiry_date: firstText(context?.mandate?.expiry_date, context?.mandateExpiryDate),
    mandate_type: firstText(context?.mandateType, resolveCommercialDocumentFamilyLabel(context?.packetType)),
  }
}

export function resolveCommercialDocumentContext({ packetType = 'commercial_lease', context = {} } = {}) {
  const transactionType = normalizeLower(context?.transactionType || context?.commercialTransactionType || (normalizeLower(packetType) === 'commercial_sale' ? 'sale' : 'lease')) || 'lease'
  const assetCategory = normalizeLower(context?.assetCategory || context?.asset_category || 'office')
  const documentContext = {
    documentContextType: 'commercial',
    commercialTransactionType: transactionType,
    assetCategory,
    ...context,
  }

  return {
    ...documentContext,
    documentTitle: resolveCommercialDocumentTitle(packetType, documentContext),
    placeholders: resolveCommercialDocumentPlaceholders({
      packetType,
      context: documentContext,
    }),
  }
}

export function buildCommercialDocumentGeneratorPath(params = {}) {
  const searchParams = new URLSearchParams()
  Object.entries(params || {}).forEach(([key, value]) => {
    const text = normalizeText(value)
    if (text) searchParams.set(key, text)
  })
  const query = searchParams.toString()
  return query ? `${COMMERCIAL_DOCUMENT_GENERATOR_ROUTE}?${query}` : COMMERCIAL_DOCUMENT_GENERATOR_ROUTE
}
