import {
  LEGAL_INSTRUMENT_FAMILIES,
  resolveLegalInstrumentFamilyProfile,
} from './legalInstrumentFamilyRouter.js'
import {
  normalizeLegalFinanceType,
  normalizeLegalMaritalRegime,
  normalizeLegalPartyEntityType,
  normalizeLegalPropertyTitleType,
} from './legalDocumentScenarioProfile.js'

export const SOUTH_AFRICAN_LEGAL_DEAL_FACTS_VERSION = 'sa_legal_deal_facts_v1'

export const LEGAL_FACT_YES_NO_UNKNOWN_OPTIONS = Object.freeze([
  { value: 'unknown', label: 'Not confirmed' },
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
])

export const LEGAL_FACT_VAT_STATUS_OPTIONS = Object.freeze([
  { value: 'unknown', label: 'Attorney to confirm' },
  { value: 'not_vendor', label: 'Seller is not a VAT vendor for this sale' },
  { value: 'vendor', label: 'Seller is a VAT vendor for this sale' },
])

export const LEGAL_FACT_VAT_TREATMENT_OPTIONS = Object.freeze([
  { value: 'unknown', label: 'Attorney to confirm' },
  { value: 'transfer_duty', label: 'Transfer duty applies' },
  { value: 'vat_inclusive', label: 'Purchase price includes VAT' },
  { value: 'vat_exclusive', label: 'VAT is added to the purchase price' },
  { value: 'zero_rated', label: 'Potential zero-rated transaction' },
])

export const LEGAL_FACT_DEPOSIT_HOLDER_OPTIONS = Object.freeze([
  { value: 'unknown', label: 'Not confirmed' },
  { value: 'transfer_attorney', label: 'Transferring attorney' },
  { value: 'estate_agency', label: 'Estate agency trust account' },
  { value: 'other_attorney', label: 'Another attorney' },
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstPopulatedRecord(values = []) {
  for (const value of values) {
    const record = asRecord(value)
    if (Object.keys(record).length > 0) return record
  }
  return {}
}

function firstValue(sources = [], keys = []) {
  for (const key of keys) {
    for (const source of sources) {
      const value = asRecord(source)[key]
      if (value !== null && value !== undefined && normalizeText(value) !== '') return value
    }
  }
  return ''
}

function normalizeTriState(value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  const key = normalizeKey(value)
  if (['yes', 'true', '1', 'applicable', 'required'].includes(key)) return 'yes'
  if (['no', 'false', '0', 'not_applicable', 'none'].includes(key)) return 'no'
  return 'unknown'
}

function normalizeEnum(value, allowed = [], fallback = 'unknown') {
  const key = normalizeKey(value)
  return allowed.includes(key) ? key : fallback
}

function normalizeMoney(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function buildPartyFacts(role, sources = []) {
  const prefix = role === 'seller' ? 'seller' : 'buyer'
  const entityType = normalizeLegalPartyEntityType(firstValue(sources, [
    `${prefix}EntityType`, `${prefix}_entity_type`, `${prefix}Type`, `${prefix}_type`,
    ...(role === 'buyer' ? ['purchaserType', 'purchaser_type'] : []),
    'entityType', 'entity_type',
  ]))
  const maritalRegime = entityType === 'individual'
    ? normalizeLegalMaritalRegime(firstValue(sources, [
        `${prefix}MaritalRegime`, `${prefix}_marital_regime`, `${prefix}MaritalStatus`, `${prefix}_marital_status`,
        'maritalRegime', 'maritalStatus', 'marital_regime', 'marital_status',
      ]))
    : ''
  const marriageCountry = entityType === 'individual' && maritalRegime && maritalRegime !== 'single'
    ? normalizeText(firstValue(sources, [
        `${prefix}MarriageCountry`, `${prefix}_marriage_country`, 'marriageCountry', 'marriage_country',
      ]))
    : ''
  const foreignMarriage = entityType === 'individual' && maritalRegime && maritalRegime !== 'single'
    ? normalizeTriState(firstValue(sources, [
        `${prefix}ForeignMarriage`, `${prefix}_foreign_marriage`, 'foreignMarriage', 'foreign_marriage',
      ]))
    : 'no'

  return {
    role,
    entityType,
    maritalRegime,
    marriageCountry,
    foreignMarriage,
    name: normalizeText(firstValue(sources, [`${prefix}FullName`, `${prefix}_full_name`, 'fullName', 'name', 'legalName'])),
    identityOrRegistrationNumber: normalizeText(firstValue(sources, [
      `${prefix}IdNumber`, `${prefix}_id_number`, `${prefix}RegistrationNumber`, `${prefix}_registration_number`,
      'idNumber', 'registrationNumber',
    ])),
    representativeName: normalizeText(firstValue(sources, [
      `${prefix}RepresentativeName`, `${prefix}_representative_name`, 'representativeName',
    ])),
    representativeCapacity: normalizeText(firstValue(sources, [
      `${prefix}RepresentativeCapacity`, `${prefix}_representative_capacity`, 'representativeCapacity',
    ])),
    authorityBasis: normalizeText(firstValue(sources, [
      `${prefix}AuthorityBasis`, `${prefix}_authority_basis`, 'authorityBasis',
    ])),
    spouseFullName: normalizeText(firstValue(sources, [
      `${prefix}SpouseFullName`, `${prefix}_spouse_full_name`, 'spouseFullName',
    ])),
  }
}

function buildReviewItems(facts) {
  const items = []
  const add = (code, section, message) => items.push({ code, section, message })
  for (const party of [facts.parties.seller, facts.parties.buyer]) {
    if (party.entityType === 'individual' && party.maritalRegime && party.maritalRegime !== 'single') {
      if (party.foreignMarriage === 'yes' && !party.marriageCountry) {
        add(`${party.role}_marriage_country_missing`, 'parties', `Confirm the ${party.role}'s country of marriage.`)
      }
      if (party.foreignMarriage === 'unknown') {
        add(`${party.role}_foreign_marriage_unknown`, 'parties', `Confirm whether the ${party.role}'s marriage is governed outside South Africa.`)
      }
    }
  }
  if (facts.property.inEstateOrHoa === 'unknown') add('hoa_status_unknown', 'property', 'Confirm whether estate or HOA rules apply.')
  if (facts.property.inEstateOrHoa === 'yes' && !facts.property.estateOrHoaName) {
    add('hoa_name_missing', 'property', 'Enter the applicable estate or HOA name.')
  }
  if (facts.property.titleType === 'sectional_title' && facts.property.existingExclusiveUseAreas === 'unknown') {
    add('exclusive_use_areas_unknown', 'property', 'Confirm whether exclusive-use areas form part of the sectional-title sale.')
  }
  if (['bond', 'combination'].includes(facts.finance.type) && !facts.finance.bondApprovalDeadline) {
    add('bond_approval_deadline_missing', 'finance', 'Confirm the bond approval deadline.')
  }
  if (facts.occupation.existingLease === 'unknown') add('lease_status_unknown', 'occupation', 'Confirm whether the property is sold subject to an existing lease or occupier.')
  if (facts.occupation.existingLease === 'yes' && !facts.occupation.leaseExpiryDate) {
    add('lease_expiry_missing', 'occupation', 'Enter the existing lease expiry date or refer it for attorney review.')
  }
  if (facts.occupation.beforeTransfer === 'unknown') add('occupation_timing_unknown', 'occupation', 'Confirm whether occupation will occur before transfer.')
  if (facts.tax.sellerVatStatus === 'unknown') add('seller_vat_status_unknown', 'tax', 'Confirm the seller VAT and transfer-duty treatment.')
  if (facts.tax.vatTreatment === 'unknown') add('vat_treatment_unknown', 'tax', 'Confirm whether VAT or transfer duty applies to the sale.')
  if (facts.conditions.saleOfExistingProperty === 'unknown') add('linked_sale_unknown', 'conditions', 'Confirm whether the offer depends on the buyer selling another property.')
  if (facts.conditions.saleOfExistingProperty === 'yes' && !facts.conditions.linkedSaleDeadline) {
    add('linked_sale_deadline_missing', 'conditions', 'Enter the deadline for the buyer-linked property sale condition.')
  }
  if (facts.finance.depositAmount > 0 && facts.finance.depositHolder === 'unknown') add('deposit_holder_unknown', 'finance', 'Confirm who will hold the deposit in trust.')
  if (facts.occupation.beforeTransfer === 'yes' && facts.occupation.occupationalRent === null) {
    add('occupational_rent_missing', 'occupation', 'Enter the occupational rent for occupation before transfer.')
  }
  return items
}

export function buildSouthAfricanLegalDealFacts(options = {}) {
  const context = asRecord(options.context)
  const draft = asRecord(options.draft || options.otpDraft || context.otpDraft || context.sourceContext?.otpDraft)
  const transaction = asRecord(options.transaction || context.transaction)
  const buyer = asRecord(options.buyer || context.buyer || context.sourceContext?.buyer)
  const seller = asRecord(options.seller || options.sellerDetails || context.sellerDetails || context.sourceContext?.seller)
  const property = asRecord(options.property || context.property || context.sourceContext?.property)
  const sourceContext = asRecord(options.sourceContext || context.sourceContext)
  const existing = firstPopulatedRecord([
    options.facts,
    transaction.legal_deal_facts_json,
    transaction.legalDealFactsJson,
    sourceContext.canonicalLegalDealFacts,
    sourceContext.canonical_legal_deal_facts,
  ])
  const instrumentFamilyProfile = resolveLegalInstrumentFamilyProfile({
    packetType: 'otp',
    legalInstrumentFamily: firstValue([draft, existing.instrument, transaction, sourceContext], [
      'legalInstrumentFamily', 'legal_instrument_family', 'familyKey', 'family_key',
    ]),
    transaction,
    property: { ...property, ...asRecord(existing.property) },
    sourceContext,
    context,
  })
  const sellerFacts = buildPartyFacts('seller', [draft, asRecord(existing.parties)?.seller, seller, transaction, sourceContext])
  const buyerFacts = buildPartyFacts('buyer', [draft, asRecord(existing.parties)?.buyer, buyer, transaction, sourceContext])
  const propertySources = [draft, asRecord(existing.property), property, transaction, sourceContext]
  const financeSources = [draft, asRecord(existing.finance), transaction, sourceContext]
  const conditionSources = [draft, asRecord(existing.conditions), sourceContext]
  const occupationSources = [draft, asRecord(existing.occupation), sourceContext]
  const taxSources = [draft, asRecord(existing.tax), transaction, sourceContext]

  const facts = {
    schemaVersion: SOUTH_AFRICAN_LEGAL_DEAL_FACTS_VERSION,
    jurisdiction: 'ZA',
    instrument: {
      familyKey: instrumentFamilyProfile?.familyKey || LEGAL_INSTRUMENT_FAMILIES.UNKNOWN,
      recognized: Boolean(instrumentFamilyProfile?.recognized),
      generationAllowed: Boolean(instrumentFamilyProfile?.generationAllowed),
      source: instrumentFamilyProfile?.source || 'unknown',
    },
    parties: {
      seller: sellerFacts,
      buyer: buyerFacts,
      purchaserCount: normalizeText(firstValue([draft, existing.parties], ['coBuyerFullName', 'co_buyer_full_name'])) ? 2 : 1,
    },
    property: {
      titleType: normalizeLegalPropertyTitleType(firstValue(propertySources, [
        'propertyTitleType', 'property_title_type', 'titleType', 'title_type', 'propertyType', 'property_type',
      ])),
      inEstateOrHoa: normalizeTriState(firstValue(propertySources, ['propertyInEstateOrHoa', 'property_in_estate_or_hoa', 'inEstateOrHoa'])),
      estateOrHoaName: normalizeText(firstValue(propertySources, ['propertyEstateOrHoaName', 'property_estate_or_hoa_name', 'estateOrHoaName', 'complexName'])),
      existingExclusiveUseAreas: normalizeTriState(firstValue(propertySources, [
        'propertyExclusiveUseAreas', 'property_exclusive_use_areas', 'existingExclusiveUseAreas',
      ])),
    },
    finance: {
      type: normalizeLegalFinanceType(firstValue(financeSources, ['financeType', 'finance_type', 'type'])),
      purchasePrice: normalizeMoney(firstValue(financeSources, ['purchasePrice', 'purchase_price', 'sales_price'])),
      depositAmount: normalizeMoney(firstValue(financeSources, ['depositAmount', 'deposit_amount'])),
      bondAmount: normalizeMoney(firstValue(financeSources, ['bondAmount', 'bond_amount'])),
      cashAmount: normalizeMoney(firstValue(financeSources, ['cashAmount', 'cash_amount'])),
      depositHolder: normalizeEnum(firstValue(financeSources, ['depositHolder', 'deposit_holder']), [
        'unknown', 'transfer_attorney', 'estate_agency', 'other_attorney',
      ]),
      bondApprovalDeadline: normalizeText(firstValue(financeSources, ['bondApprovalDeadline', 'bond_approval_deadline'])),
    },
    conditions: {
      saleOfExistingProperty: normalizeTriState(firstValue(conditionSources, [
        'saleOfExistingPropertyCondition', 'sale_of_existing_property_condition', 'saleOfExistingProperty',
      ])),
      linkedSaleDeadline: normalizeText(firstValue(conditionSources, ['linkedSaleDeadline', 'linked_sale_deadline'])),
    },
    occupation: {
      beforeTransfer: normalizeTriState(firstValue(occupationSources, ['occupationBeforeTransfer', 'occupation_before_transfer', 'beforeTransfer'])),
      occupationalRent: normalizeMoney(firstValue(occupationSources, ['occupationalRent', 'occupational_rent'])),
      existingLease: normalizeTriState(firstValue(occupationSources, ['existingLease', 'existing_lease', 'propertyCurrentlyLeased'])),
      leaseExpiryDate: normalizeText(firstValue(occupationSources, ['leaseExpiryDate', 'lease_expiry_date'])),
    },
    tax: {
      sellerVatStatus: normalizeEnum(firstValue(taxSources, ['sellerVatStatus', 'seller_vat_status']), ['unknown', 'not_vendor', 'vendor']),
      vatTreatment: normalizeEnum(firstValue(taxSources, ['vatTreatment', 'vat_treatment']), [
        'unknown', 'transfer_duty', 'vat_inclusive', 'vat_exclusive', 'zero_rated',
      ]),
    },
    capturedAt: new Date().toISOString(),
    source: normalizeText(options.source || existing.source || 'otp_legal_intake'),
  }
  facts.reviewItems = buildReviewItems(facts)
  facts.factsKey = [
    facts.instrument.familyKey,
    sellerFacts.entityType,
    sellerFacts.maritalRegime,
    buyerFacts.entityType,
    buyerFacts.maritalRegime,
    facts.property.titleType,
    facts.finance.type,
    facts.property.inEstateOrHoa,
    facts.occupation.existingLease,
    facts.conditions.saleOfExistingProperty,
    facts.tax.sellerVatStatus,
  ].join('__')
  return facts
}

export function validateSouthAfricanLegalDealFacts(facts = {}) {
  const blockers = []
  const addBlocker = (key, label) => blockers.push({ key, label, message: `${label} is required for legal document routing.` })
  if (!facts?.instrument?.familyKey || facts.instrument.familyKey === LEGAL_INSTRUMENT_FAMILIES.UNKNOWN) addBlocker('legal_instrument_family', 'Agreement family')
  if (!facts?.parties?.seller?.entityType) addBlocker('seller_entity_type', 'Seller type')
  if (facts?.parties?.seller?.entityType === 'individual' && !facts.parties.seller.maritalRegime) addBlocker('seller_marital_regime', 'Seller marital position')
  if (!facts?.parties?.buyer?.entityType) addBlocker('buyer_entity_type', 'Buyer type')
  if (facts?.parties?.buyer?.entityType === 'individual' && !facts.parties.buyer.maritalRegime) addBlocker('buyer_marital_regime', 'Buyer marital position')
  if (!facts?.property?.titleType) addBlocker('property_title_type', 'Property title type')
  if (!facts?.finance?.type) addBlocker('finance_type', 'Finance type')
  return {
    schemaVersion: facts?.schemaVersion || SOUTH_AFRICAN_LEGAL_DEAL_FACTS_VERSION,
    complete: blockers.length === 0,
    blockers,
    reviewItems: Array.isArray(facts?.reviewItems) ? facts.reviewItems : [],
  }
}

export function buildSouthAfricanLegalDealFactPlaceholders(facts = {}) {
  return {
    legal_deal_facts_version: facts.schemaVersion || SOUTH_AFRICAN_LEGAL_DEAL_FACTS_VERSION,
    legal_deal_facts_key: facts.factsKey || '',
    legal_instrument_family: facts.instrument?.familyKey || '',
    seller_entity_type: facts.parties?.seller?.entityType || '',
    seller_marital_status: facts.parties?.seller?.maritalRegime || '',
    seller_marriage_country: facts.parties?.seller?.marriageCountry || '',
    buyer_entity_type: facts.parties?.buyer?.entityType || '',
    buyer_marital_status: facts.parties?.buyer?.maritalRegime || '',
    buyer_marriage_country: facts.parties?.buyer?.marriageCountry || '',
    property_title_type: facts.property?.titleType || '',
    property_in_estate_or_hoa: facts.property?.inEstateOrHoa || 'unknown',
    property_estate_or_hoa_name: facts.property?.estateOrHoaName || '',
    property_exclusive_use_areas: facts.property?.existingExclusiveUseAreas || 'unknown',
    finance_type: facts.finance?.type || '',
    deposit_holder: facts.finance?.depositHolder || 'unknown',
    bond_approval_deadline: facts.finance?.bondApprovalDeadline || '',
    sale_of_existing_property_condition: facts.conditions?.saleOfExistingProperty || 'unknown',
    linked_sale_deadline: facts.conditions?.linkedSaleDeadline || '',
    occupation_before_transfer: facts.occupation?.beforeTransfer || 'unknown',
    occupational_rent: facts.occupation?.occupationalRent ?? '',
    existing_lease: facts.occupation?.existingLease || 'unknown',
    lease_expiry_date: facts.occupation?.leaseExpiryDate || '',
    seller_vat_status: facts.tax?.sellerVatStatus || 'unknown',
    vat_treatment: facts.tax?.vatTreatment || 'unknown',
  }
}
