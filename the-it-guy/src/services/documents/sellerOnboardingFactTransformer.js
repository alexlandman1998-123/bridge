import { getPropertyCategoryLabel, normalizePropertyCategory, normalizePropertyStructureType } from '../../lib/propertyTaxonomy.js'

export const CANONICAL_SELLER_FACTS_VERSION = 'seller_onboarding_facts_v1'

export const SELLER_LEGAL_TYPES = Object.freeze([
  'individual',
  'company',
  'trust',
  'deceased_estate',
  'power_of_attorney',
  'multiple_owners',
  'other',
])

export const MARITAL_REGIMES = Object.freeze([
  'in_community',
  'out_of_community',
  'anc',
  'foreign_marriage',
  'unknown',
  'not_applicable',
])

export const PROPERTY_TYPES = Object.freeze([
  'freehold',
  'sectional_title',
  'share_block',
  'estate',
  'commercial',
  'farm',
  'industrial',
  'mixed_use',
  'vacant_land',
  'other',
])

export const OCCUPANCY_STATUSES = Object.freeze([
  'vacant',
  'owner_occupied',
  'tenant_occupied',
  'partially_occupied',
  'unknown',
])

const PROVINCE_ALIASES = Object.freeze({
  gp: 'Gauteng',
  gauteng: 'Gauteng',
  wc: 'Western Cape',
  western_cape: 'Western Cape',
  'western cape': 'Western Cape',
  kzn: 'KwaZulu-Natal',
  kwazulu_natal: 'KwaZulu-Natal',
  'kwazulu-natal': 'KwaZulu-Natal',
  'kwazulu natal': 'KwaZulu-Natal',
  ec: 'Eastern Cape',
  eastern_cape: 'Eastern Cape',
  'eastern cape': 'Eastern Cape',
  fs: 'Free State',
  free_state: 'Free State',
  'free state': 'Free State',
  lp: 'Limpopo',
  limpopo: 'Limpopo',
  mp: 'Mpumalanga',
  mpumalanga: 'Mpumalanga',
  nc: 'Northern Cape',
  northern_cape: 'Northern Cape',
  'northern cape': 'Northern Cape',
  nw: 'North West',
  north_west: 'North West',
  'north west': 'North West',
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function pickEnum(value, allowed, fallback) {
  const normalized = normalizeKey(value)
  return allowed.includes(normalized) ? normalized : fallback
}

export function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = normalizeKey(value)
  if (['true', 'yes', 'y', '1', 'on', 'enabled'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'off', 'disabled'].includes(normalized)) return false
  return fallback
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeDate(value) {
  const text = normalizeText(value)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

export function normalizeProvince(value = '') {
  const normalized = normalizeKey(value)
  return PROVINCE_ALIASES[normalized] || normalizeText(value)
}

export function normalizeSellerLegalType(form = {}) {
  const explicit = normalizeKey(form.sellerLegalType || form.legalType || form.ownershipType || form.sellerType)
  if (explicit === 'married_cop' || explicit === 'married_anc' || explicit === 'individual_owner') return 'individual'
  if (explicit === 'multiple') return 'multiple_owners'
  if (explicit === 'deceased' || explicit === 'estate_late') return 'deceased_estate'
  if (explicit === 'poa') return 'power_of_attorney'
  return pickEnum(explicit, SELLER_LEGAL_TYPES, 'individual')
}

export function normalizeMaritalRegime(form = {}) {
  const explicit = normalizeKey(form.maritalRegime || form.marriageRegime)
  if (explicit === 'married_cop' || explicit === 'cop' || explicit === 'community_of_property') return 'in_community'
  if (explicit === 'married_anc' || explicit === 'anc') return 'anc'
  if (explicit === 'out_of_community' || explicit === 'out_of_community_without_accrual' || explicit === 'out_of_community_with_accrual') return 'out_of_community'
  if (explicit === 'foreign' || explicit === 'foreign_marriage') return 'foreign_marriage'

  const ownershipType = normalizeKey(form.ownershipType)
  if (ownershipType === 'married_cop') return 'in_community'
  if (ownershipType === 'married_anc') return 'anc'

  const maritalStatus = normalizeKey(form.maritalStatus)
  if (!maritalStatus || ['single', 'unmarried', 'divorced', 'widowed'].includes(maritalStatus)) return 'not_applicable'
  return pickEnum(explicit, MARITAL_REGIMES, maritalStatus === 'married' ? 'unknown' : 'not_applicable')
}

export function normalizeCanonicalPropertyType(form = {}) {
  const explicit = normalizeKey(form.canonicalPropertyType || form.propertyClassification || form.propertyType)
  const structure = normalizeKey(form.propertyStructureType)
  const category = normalizeKey(form.propertyCategory)
  const estateName = normalizeText(form.estateName || form.estateComplexName)

  if (['sectional_title', 'sectional'].includes(structure) || ['apartment', 'townhouse', 'cluster', 'duplex'].includes(explicit)) return 'sectional_title'
  if (['share_block'].includes(structure) || explicit === 'share_block') return 'share_block'
  if (estateName || explicit === 'estate') return 'estate'
  if (category === 'commercial' || ['office_building', 'warehouse', 'retail_store', 'commercial'].includes(explicit)) return 'commercial'
  if (explicit === 'farm' || category === 'agricultural') return 'farm'
  if (explicit === 'industrial') return 'industrial'
  if (explicit === 'mixed_use') return 'mixed_use'
  if (explicit === 'vacant_land') return 'vacant_land'
  if (explicit === 'house' || explicit === 'freehold') return 'freehold'
  return pickEnum(explicit, PROPERTY_TYPES, 'freehold')
}

export function normalizeOccupancyStatus(form = {}) {
  const explicit = normalizeKey(form.occupancyStatus || form.propertyOccupancyStatus)
  if (explicit === 'tenant' || explicit === 'tenanted') return 'tenant_occupied'
  if (explicit === 'owner' || explicit === 'owner_occupied') return 'owner_occupied'
  return pickEnum(explicit, OCCUPANCY_STATUSES, 'unknown')
}

function buildOwnerFacts(form = {}) {
  if (Array.isArray(form.multipleOwners) && form.multipleOwners.length) {
    return form.multipleOwners.map((owner, index) => ({
      index: index + 1,
      first_name: normalizeText(owner.name),
      surname: normalizeText(owner.surname),
      id_number: normalizeText(owner.idNumber),
      email: normalizeText(owner.email),
      phone: normalizeText(owner.phone),
      ownership_share: normalizeNumber(owner.ownershipShare),
    }))
  }
  return []
}

export function transformSellerOnboardingToFacts(form = {}, listing = {}, options = {}) {
  const sellerLegalType = normalizeSellerLegalType(form)
  const maritalRegime = normalizeMaritalRegime(form)
  const propertyType = normalizeCanonicalPropertyType(form)
  const occupancyStatus = normalizeOccupancyStatus(form)
  const features = Array.isArray(form.features) ? form.features.map(normalizeKey) : []
  const estateOrHoa = normalizeBoolean(form.estateOrHoa, false) || propertyType === 'estate' || Boolean(normalizeText(form.estateName || form.estateComplexName))
  const sectionalTitle = normalizeBoolean(form.sectionalTitle, false) || propertyType === 'sectional_title'
  const shareBlock = normalizeBoolean(form.shareBlock, false) || propertyType === 'share_block'
  const commercialProperty = normalizeBoolean(form.commercialProperty, false) || ['commercial', 'industrial', 'mixed_use'].includes(propertyType)
  const bodyCorporate = normalizeBoolean(form.bodyCorporate, false) || sectionalTitle || shareBlock
  const existingBond = normalizeBoolean(form.existingBond ?? form.sellerHasExistingBond ?? form.bondedProperty, false)
  const gasInstallation = normalizeBoolean(form.gasInstallation, false)
  const electricFence = normalizeBoolean(form.electricFence, false) || features.includes('security')
  const solarInstallation = normalizeBoolean(form.solarInstallation, false) || features.includes('solar')
  const swimmingPool = normalizeBoolean(form.swimmingPool ?? form.pool, false)
  const borehole = normalizeBoolean(form.borehole, false) || features.includes('water')

  return {
    seller: {
      legal_type: sellerLegalType,
      ownership_type: normalizeKey(form.ownershipType),
      number_of_owners: sellerLegalType === 'multiple_owners' ? Math.max(buildOwnerFacts(form).length, 1) : normalizeNumber(form.numberOfOwners) || 1,
      first_name: normalizeText(form.sellerFirstName),
      surname: normalizeText(form.sellerSurname),
      email: normalizeText(form.email),
      phone: normalizeText(form.phone),
      id_number: normalizeText(form.idNumber),
      residential_address: normalizeText(form.residentialAddress),
      authorised_representative: normalizeText(form.authorisedRepresentative || form.companyDirectorName || form.trusteeName),
      tax_number: normalizeText(form.sellerTaxNumber),
      vat_registered: normalizeBoolean(form.vatRegistered, false),
      vat_number: normalizeText(form.vatNumber),
      existing_bond: existingBond,
      marital_status: normalizeKey(form.maritalStatus || (maritalRegime === 'not_applicable' ? 'not_married' : 'married')),
      marital_regime: maritalRegime,
      spouse_involved: normalizeBoolean(form.spouseInvolved, maritalRegime !== 'not_applicable' && maritalRegime !== 'unknown'),
      spouse: {
        name: normalizeText(form.spouseName),
        id_number: normalizeText(form.spouseIdNumber),
        email: normalizeText(form.spouseEmail),
        phone: normalizeText(form.spousePhone),
      },
      company: {
        name: normalizeText(form.companyName),
        registration_number: normalizeText(form.companyRegistrationNumber),
        director_name: normalizeText(form.companyDirectorName),
        director_email: normalizeText(form.companyDirectorEmail),
        director_phone: normalizeText(form.companyDirectorPhone),
      },
      trust: {
        name: normalizeText(form.trustName),
        registration_number: normalizeText(form.trustRegistrationNumber),
        trustee_name: normalizeText(form.trusteeName),
        trustee_email: normalizeText(form.trusteeEmail),
        trustee_phone: normalizeText(form.trusteePhone),
      },
      deceased_estate: {
        executor_name: normalizeText(form.executorName),
        executor_email: normalizeText(form.executorEmail),
        executor_phone: normalizeText(form.executorPhone),
        estate_reference: normalizeText(form.estateReference),
      },
      power_of_attorney: {
        representative_name: normalizeText(form.powerOfAttorneyName || form.authorisedRepresentative),
        representative_email: normalizeText(form.powerOfAttorneyEmail),
        representative_phone: normalizeText(form.powerOfAttorneyPhone),
      },
      owners: buildOwnerFacts(form),
    },
    property: {
      property_type: propertyType,
      property_category: normalizePropertyCategory(form.propertyCategory || listing.propertyCategory || listing.property_category, { fallback: 'residential' }),
      property_category_label: getPropertyCategoryLabel(form.propertyCategory || listing.propertyCategory || listing.property_category),
      property_structure_type: normalizePropertyStructureType(form.propertyStructureType || listing.propertyStructureType || listing.property_structure_type, { fallback: 'other' }),
      sectional_title: sectionalTitle,
      share_block: shareBlock,
      estate_or_hoa: estateOrHoa,
      hoa: estateOrHoa,
      body_corporate: bodyCorporate,
      commercial_property: commercialProperty,
      erf_number: normalizeText(form.erfNumber),
      unit_number: normalizeText(form.unitNumber),
      section_number: normalizeText(form.sectionNumber),
      scheme_name: normalizeText(form.schemeName),
      estate_name: normalizeText(form.estateName || form.estateComplexName),
      municipality: normalizeText(form.municipality || form.city),
      province: normalizeProvince(form.province),
      address: normalizeText(form.propertyAddress),
      suburb: normalizeText(form.suburb),
      city: normalizeText(form.city),
      title_deed_available: normalizeBoolean(form.titleDeedAvailable, false),
      sg_diagram_available: normalizeBoolean(form.sgDiagramAvailable, false),
      erf_diagram_available: normalizeBoolean(form.erfDiagramAvailable, false),
      approved_building_plans_available: normalizeBoolean(form.approvedBuildingPlansAvailable, false),
      floor_plan_available: normalizeBoolean(form.floorPlanAvailable, false),
      erf_size: normalizeNumber(form.erfSize),
      floor_size: normalizeNumber(form.floorSize),
      rates_taxes: normalizeNumber(form.ratesTaxes),
      levies: normalizeNumber(form.levies),
    },
    occupancy: {
      status: occupancyStatus,
      tenant_occupied: occupancyStatus === 'tenant_occupied',
      lease_exists: normalizeBoolean(form.leaseExists, false),
      lease_expiry_date: normalizeDate(form.leaseExpiryDate),
      monthly_rental: normalizeNumber(form.monthlyRental),
      rental_deposit: normalizeNumber(form.rentalDeposit),
      tenant_name: normalizeText(form.tenantName),
      tenant_contact_details: normalizeText(form.tenantContactDetails),
      notice_period_details: normalizeText(form.noticePeriodDetails),
      rental_schedule_available: normalizeBoolean(form.rentalScheduleAvailable, false),
    },
    finance: {
      existing_bond: existingBond,
      bond_bank: normalizeText(form.bondBank || form.currentBondBank),
      bond_account_reference: normalizeText(form.bondAccountReference || form.currentBondAccountNumber),
      multiple_bonds: normalizeBoolean(form.multipleBonds, false),
      access_bond: normalizeBoolean(form.accessBond, false),
      estimated_settlement_amount: normalizeNumber(form.estimatedSettlementAmount),
      cancellation_required: normalizeBoolean(form.cancellationRequired, existingBond),
      cancellation_attorney_known: normalizeBoolean(form.cancellationAttorneyKnown, false),
      cancellation_attorney_details: normalizeText(form.cancellationAttorneyDetails),
    },
    compliance: {
      gas_installation: gasInstallation,
      electric_fence: electricFence,
      solar_installation: solarInstallation,
      swimming_pool: swimmingPool,
      borehole,
      generator_installation: normalizeBoolean(form.generatorInstallation, false),
      beetle_certificate_region: normalizeBoolean(form.beetleCertificateRegion, false),
      plumbing_certificate_required: normalizeBoolean(form.plumbingCertificateRequired, false),
      occupation_certificate_available: normalizeBoolean(form.occupationCertificateAvailable, false),
      electrical_coc_available: normalizeBoolean(form.electricalCocAvailable, false),
      gas_coc_available: normalizeBoolean(form.gasCocAvailable, false),
      electric_fence_certificate_available: normalizeBoolean(form.electricFenceCertificateAvailable, false),
      plumbing_certificate_available: normalizeBoolean(form.plumbingCertificateAvailable, false),
      solar_compliance_available: normalizeBoolean(form.solarComplianceAvailable, false),
    },
    transaction: {
      asking_price: normalizeNumber(form.askingPrice || listing.askingPrice),
      selling_timeline: normalizeKey(form.sellingTimeline),
      selling_reason: normalizeKey(form.sellingReason),
      mandate_type: normalizeKey(form.mandateType || listing.mandateType),
    },
    context: {
      type: options.contextType || 'private_listing',
      id: options.contextId || listing.id || null,
      listing_id: options.listingId || listing.id || null,
      source: options.source || 'seller_onboarding',
      facts_version: CANONICAL_SELLER_FACTS_VERSION,
    },
  }
}

function missingIf(condition, code, message, severity = 'required') {
  return condition ? [{ code, message, severity }] : []
}

export function validateSellerOnboardingFacts(facts = {}, { draft = false } = {}) {
  const required = []
  const recommended = []
  const push = (items) => {
    for (const item of items) {
      if (item.severity === 'recommended') recommended.push(item)
      else required.push(item)
    }
  }

  push(missingIf(!facts.seller?.first_name, 'seller_first_name_missing', 'Seller name is required.'))
  push(missingIf(!facts.seller?.surname, 'seller_surname_missing', 'Seller surname is required.'))
  push(missingIf(!facts.seller?.email, 'seller_email_missing', 'Seller email is required.'))
  push(missingIf(!facts.seller?.phone, 'seller_phone_missing', 'Seller phone is required.'))
  push(missingIf(facts.seller?.legal_type === 'company' && !facts.seller?.company?.registration_number, 'company_registration_missing', 'Company registration number is required for company sellers.'))
  push(missingIf(facts.seller?.legal_type === 'trust' && !facts.seller?.trust?.registration_number, 'trust_registration_missing', 'Trust registration number is required for trust sellers.'))
  push(missingIf(facts.seller?.legal_type === 'deceased_estate' && !facts.seller?.deceased_estate?.executor_name, 'executor_details_missing', 'Executor details are required for deceased estate sellers.'))
  push(missingIf(facts.finance?.existing_bond && !facts.finance?.bond_bank, 'bond_bank_missing', 'Bond bank is required when there is an existing bond.', draft ? 'recommended' : 'required'))
  push(missingIf(facts.occupancy?.lease_exists && !facts.occupancy?.lease_expiry_date, 'lease_expiry_missing', 'Lease expiry date is required when a lease exists.', draft ? 'recommended' : 'required'))
  push(missingIf(!facts.property?.municipality, 'municipality_missing', 'Municipality helps determine readiness and compliance.', 'recommended'))
  push(missingIf(!facts.property?.province, 'province_missing', 'Province is required for property classification.'))

  return {
    ok: draft ? true : required.length === 0,
    required,
    recommended,
    issueCount: required.length + recommended.length,
  }
}

function sectionScore(items = []) {
  const total = items.length || 1
  const completed = items.filter(Boolean).length
  return {
    completed,
    total,
    percent: Math.round((completed / total) * 100),
  }
}

export function calculateSellerFactReadiness(facts = {}) {
  const sections = {
    seller_identity: sectionScore([
      facts.seller?.legal_type,
      facts.seller?.first_name,
      facts.seller?.surname,
      facts.seller?.email,
      facts.seller?.phone,
    ]),
    seller_authority: sectionScore([
      facts.seller?.legal_type,
      facts.seller?.marital_regime,
      facts.seller?.legal_type === 'company' ? facts.seller?.company?.registration_number : true,
      facts.seller?.legal_type === 'trust' ? facts.seller?.trust?.registration_number : true,
      facts.seller?.legal_type === 'deceased_estate' ? facts.seller?.deceased_estate?.executor_name : true,
    ]),
    property_classification: sectionScore([
      facts.property?.property_type,
      facts.property?.address,
      facts.property?.suburb,
      facts.property?.municipality,
      facts.property?.province,
    ]),
    finance_details: sectionScore([
      typeof facts.finance?.existing_bond === 'boolean',
      !facts.finance?.existing_bond || facts.finance?.bond_bank,
      !facts.finance?.existing_bond || facts.finance?.bond_account_reference,
    ]),
    occupancy_details: sectionScore([
      facts.occupancy?.status,
      facts.occupancy?.status !== 'tenant_occupied' || facts.occupancy?.tenant_name,
      facts.occupancy?.status !== 'tenant_occupied' || typeof facts.occupancy?.lease_exists === 'boolean',
    ]),
    compliance_details: sectionScore([
      typeof facts.compliance?.gas_installation === 'boolean',
      typeof facts.compliance?.electric_fence === 'boolean',
      typeof facts.compliance?.solar_installation === 'boolean',
      typeof facts.compliance?.swimming_pool === 'boolean',
    ]),
  }
  const sectionValues = Object.values(sections)
  return {
    sections,
    percent: Math.round(sectionValues.reduce((sum, item) => sum + item.percent, 0) / sectionValues.length),
  }
}

export function buildCanonicalSellerOnboardingPayload(form = {}, listing = {}, options = {}) {
  const facts = transformSellerOnboardingToFacts(form, listing, options)
  const validation = validateSellerOnboardingFacts(facts, { draft: Boolean(options.draft) })
  const readiness = calculateSellerFactReadiness(facts)
  return {
    canonicalSellerFacts: facts,
    canonicalSellerFactReadiness: {
      ...readiness,
      validation,
      factsVersion: CANONICAL_SELLER_FACTS_VERSION,
      generatedAt: new Date().toISOString(),
    },
  }
}

export function buildSellerResolverInputFromFacts(facts = {}, { contextType = 'private_listing', contextId = '', listingId = '', transactionId = null, options = {} } = {}) {
  const resolvedContextId = contextId || facts.context?.id || facts.context?.listing_id || listingId
  return {
    contextType,
    contextId: resolvedContextId,
    listingId: listingId || facts.context?.listing_id || resolvedContextId || null,
    transactionId,
    facts: {
      ...facts,
      context: {
        ...(facts.context || {}),
        type: contextType,
        id: resolvedContextId,
        listing_id: listingId || facts.context?.listing_id || resolvedContextId || null,
      },
    },
    options: {
      regenerate: true,
      sourceSystem: 'seller_onboarding',
      resolverVersion: CANONICAL_SELLER_FACTS_VERSION,
      ...options,
    },
  }
}
