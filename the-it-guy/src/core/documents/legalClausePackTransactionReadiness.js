import { buildSouthAfricanLegalDealFacts } from './southAfricanLegalDealFacts.js'
import { resolveSouthAfricanLegalClausePacks } from './southAfricanLegalClausePacks.js'

export const LEGAL_CLAUSE_PACK_TRANSACTION_READINESS_VERSION = 'sa_legal_clause_pack_transaction_readiness_v1'

const SECTION_LABELS = Object.freeze({
  buyer: 'Buyer',
  seller: 'Seller',
  property: 'Property',
  terms: 'Commercial terms',
})

function requirement(fieldKey, placeholderKeys, label, sectionKey, validate = 'text') {
  return Object.freeze({
    fieldKey,
    placeholderKeys: Object.freeze(Array.isArray(placeholderKeys) ? placeholderKeys : [placeholderKeys]),
    label,
    sectionKey,
    validate,
  })
}

const PARTY_REQUIREMENTS = Object.freeze({
  seller_individual_capacity_pack: Object.freeze([
    requirement('sellerFullName', ['seller_full_name', 'seller_name'], 'Seller legal name', 'seller'),
    requirement('sellerIdNumber', ['seller_id_number'], 'Seller ID number', 'seller'),
    requirement('sellerMaritalRegime', ['seller_marital_status', 'seller_marital_regime'], 'Seller marital position', 'seller', 'confirmed'),
  ]),
  seller_company_authority_pack: Object.freeze([
    requirement('sellerFullName', ['seller_full_name', 'seller_name'], 'Seller company name', 'seller'),
    requirement('sellerIdNumber', ['seller_company_registration_number', 'seller_registration_number'], 'Seller company registration number', 'seller'),
    requirement('sellerRepresentativeName', 'seller_representative_name', 'Seller representative', 'seller'),
    requirement('sellerRepresentativeCapacity', 'seller_representative_capacity', 'Seller representative capacity', 'seller'),
    requirement('sellerResolutionDate', 'seller_resolution_date', 'Seller resolution date', 'seller'),
    requirement('sellerAuthorityBasis', 'seller_authority_basis', 'Seller authority or resolution', 'seller'),
  ]),
  seller_trust_authority_pack: Object.freeze([
    requirement('sellerFullName', ['seller_full_name', 'seller_name'], 'Seller trust name', 'seller'),
    requirement('sellerIdNumber', ['seller_trust_registration_number', 'seller_registration_number'], 'Seller trust registration number', 'seller'),
    requirement('sellerTrusteeNames', 'seller_trustee_names', 'Seller trustee names', 'seller'),
    requirement('sellerRepresentativeName', 'seller_representative_name', 'Authorised seller trustee', 'seller'),
    requirement('sellerRepresentativeCapacity', 'seller_representative_capacity', 'Seller representative capacity', 'seller'),
    requirement('sellerAuthorityBasis', 'seller_authority_basis', 'Seller trustee authority', 'seller'),
  ]),
  seller_spouse_consent_pack: Object.freeze([
    requirement('sellerSpouseFullName', 'seller_spouse_full_name', 'Seller spouse name', 'seller'),
    requirement('sellerSpouseIdNumber', 'seller_spouse_id_number', 'Seller spouse ID number', 'seller'),
    requirement('sellerSpouseEmail', 'seller_spouse_email', 'Seller spouse email', 'seller', 'email'),
  ]),
  buyer_individual_capacity_pack: Object.freeze([
    requirement('buyerFullName', ['buyer_full_name', 'buyer_name'], 'Buyer legal name', 'buyer'),
    requirement('buyerIdNumber', ['buyer_id_number'], 'Buyer ID number', 'buyer'),
    requirement('buyerMaritalRegime', ['buyer_marital_status', 'buyer_marital_regime'], 'Buyer marital position', 'buyer', 'confirmed'),
  ]),
  buyer_company_authority_pack: Object.freeze([
    requirement('buyerFullName', ['buyer_full_name', 'buyer_name'], 'Buyer company name', 'buyer'),
    requirement('buyerIdNumber', ['buyer_company_registration_number', 'buyer_registration_number'], 'Buyer company registration number', 'buyer'),
    requirement('buyerRepresentativeName', 'buyer_representative_name', 'Buyer representative', 'buyer'),
    requirement('buyerRepresentativeCapacity', 'buyer_representative_capacity', 'Buyer representative capacity', 'buyer'),
    requirement('buyerResolutionDate', 'buyer_resolution_date', 'Buyer resolution date', 'buyer'),
    requirement('buyerAuthorityBasis', 'buyer_authority_basis', 'Buyer authority or resolution', 'buyer'),
  ]),
  buyer_trust_authority_pack: Object.freeze([
    requirement('buyerFullName', ['buyer_full_name', 'buyer_name'], 'Buyer trust name', 'buyer'),
    requirement('buyerIdNumber', ['buyer_trust_registration_number', 'buyer_registration_number'], 'Buyer trust registration number', 'buyer'),
    requirement('buyerTrusteeNames', 'buyer_trustee_names', 'Buyer trustee names', 'buyer'),
    requirement('buyerRepresentativeName', 'buyer_representative_name', 'Authorised buyer trustee', 'buyer'),
    requirement('buyerRepresentativeCapacity', 'buyer_representative_capacity', 'Buyer representative capacity', 'buyer'),
    requirement('buyerAuthorityBasis', 'buyer_authority_basis', 'Buyer trustee authority', 'buyer'),
  ]),
  buyer_spouse_consent_pack: Object.freeze([
    requirement('buyerSpouseFullName', 'buyer_spouse_full_name', 'Buyer spouse name', 'buyer'),
    requirement('buyerSpouseIdNumber', 'buyer_spouse_id_number', 'Buyer spouse ID number', 'buyer'),
    requirement('buyerSpouseEmail', 'buyer_spouse_email', 'Buyer spouse email', 'buyer', 'email'),
  ]),
})

export const LEGAL_CLAUSE_PACK_TRANSACTION_REQUIREMENTS = Object.freeze({
  residential_resale_core_pack: Object.freeze([
    requirement('propertyAddress', ['property_address', 'property_full_address'], 'Property address', 'property'),
    requirement('purchasePrice', 'purchase_price', 'Purchase price', 'terms', 'positive_number'),
  ]),
  ...PARTY_REQUIREMENTS,
  property_full_title_pack: Object.freeze([
    requirement('erfNumber', ['property_erf_number', 'erf_number'], 'Registered erf number', 'property'),
  ]),
  property_sectional_title_pack: Object.freeze([
    requirement('unitNumber', ['property_unit_number', 'property_section_number', 'unit_number'], 'Section or unit number', 'property'),
    requirement('complexName', ['property_complex_name', 'property_sectional_title_scheme', 'complex_name'], 'Registered scheme name', 'property'),
  ]),
  property_estate_hoa_pack: Object.freeze([
    requirement('propertyEstateOrHoaName', 'property_estate_or_hoa_name', 'Estate or HOA name', 'property'),
  ]),
  property_exclusive_use_pack: Object.freeze([]),
  cash_sale_pack: Object.freeze([
    requirement('cashAmount', 'cash_amount', 'Cash purchase amount', 'terms', 'positive_number'),
  ]),
  bond_finance_pack: Object.freeze([
    requirement('bondAmount', 'bond_amount', 'Bond amount', 'terms', 'positive_number'),
    requirement('bondApprovalDeadline', 'bond_approval_deadline', 'Bond approval deadline', 'terms'),
  ]),
  cash_contribution_pack: Object.freeze([
    requirement('cashAmount', 'cash_amount', 'Cash contribution', 'terms', 'positive_number'),
  ]),
  deposit_trust_pack: Object.freeze([
    requirement('depositHolder', 'deposit_holder', 'Deposit trust-account holder', 'terms', 'confirmed'),
  ]),
  linked_property_sale_pack: Object.freeze([
    requirement('linkedSaleDeadline', 'linked_sale_deadline', 'Linked-sale deadline', 'terms'),
  ]),
  occupation_before_transfer_pack: Object.freeze([
    requirement('occupationalRent', 'occupational_rent', 'Occupational rent', 'terms', 'positive_number'),
  ]),
  existing_lease_pack: Object.freeze([
    requirement('leaseExpiryDate', 'lease_expiry_date', 'Existing lease expiry date', 'terms'),
  ]),
  transfer_duty_tax_pack: Object.freeze([
    requirement('sellerVatStatus', 'seller_vat_status', 'Seller VAT status', 'terms', 'confirmed'),
    requirement('vatTreatment', 'vat_treatment', 'VAT or transfer-duty treatment', 'terms', 'confirmed'),
  ]),
  vat_inclusive_tax_pack: Object.freeze([
    requirement('sellerVatStatus', 'seller_vat_status', 'Seller VAT status', 'terms', 'confirmed'),
    requirement('vatTreatment', 'vat_treatment', 'VAT treatment', 'terms', 'confirmed'),
  ]),
  vat_exclusive_tax_pack: Object.freeze([
    requirement('sellerVatStatus', 'seller_vat_status', 'Seller VAT status', 'terms', 'confirmed'),
    requirement('vatTreatment', 'vat_treatment', 'VAT treatment', 'terms', 'confirmed'),
  ]),
  vat_zero_rated_tax_pack: Object.freeze([
    requirement('sellerVatStatus', 'seller_vat_status', 'Seller VAT status', 'terms', 'confirmed'),
    requirement('vatTreatment', 'vat_treatment', 'Potential zero-rated treatment', 'terms', 'confirmed'),
  ]),
})

const DECISION_REVIEW_FIELDS = Object.freeze({
  seller_foreign_marriage_unknown: requirement('sellerForeignMarriage', 'seller_foreign_marriage', 'Whether the seller marriage is governed outside South Africa', 'seller', 'confirmed'),
  seller_marriage_country_missing: requirement('sellerMarriageCountry', 'seller_marriage_country', 'Seller country of marriage', 'seller'),
  buyer_foreign_marriage_unknown: requirement('buyerForeignMarriage', 'buyer_foreign_marriage', 'Whether the buyer marriage is governed outside South Africa', 'buyer', 'confirmed'),
  buyer_marriage_country_missing: requirement('buyerMarriageCountry', 'buyer_marriage_country', 'Buyer country of marriage', 'buyer'),
  hoa_status_unknown: requirement('propertyInEstateOrHoa', 'property_in_estate_or_hoa', 'Whether estate or HOA rules apply', 'property', 'confirmed'),
  hoa_name_missing: requirement('propertyEstateOrHoaName', 'property_estate_or_hoa_name', 'Estate or HOA name', 'property'),
  exclusive_use_areas_unknown: requirement('propertyExclusiveUseAreas', 'property_exclusive_use_areas', 'Whether exclusive-use areas form part of the sale', 'property', 'confirmed'),
  bond_approval_deadline_missing: requirement('bondApprovalDeadline', 'bond_approval_deadline', 'Bond approval deadline', 'terms'),
  deposit_holder_unknown: requirement('depositHolder', 'deposit_holder', 'Deposit trust-account holder', 'terms', 'confirmed'),
  lease_status_unknown: requirement('existingLease', 'existing_lease', 'Whether an existing lease or occupier applies', 'terms', 'confirmed'),
  lease_expiry_missing: requirement('leaseExpiryDate', 'lease_expiry_date', 'Existing lease expiry date', 'terms'),
  occupation_timing_unknown: requirement('occupationBeforeTransfer', 'occupation_before_transfer', 'Whether occupation occurs before transfer', 'terms', 'confirmed'),
  occupational_rent_missing: requirement('occupationalRent', 'occupational_rent', 'Occupational rent', 'terms', 'positive_number'),
  linked_sale_unknown: requirement('saleOfExistingPropertyCondition', 'sale_of_existing_property_condition', 'Whether the offer depends on another property sale', 'terms', 'confirmed'),
  linked_sale_deadline_missing: requirement('linkedSaleDeadline', 'linked_sale_deadline', 'Linked-sale deadline', 'terms'),
  seller_vat_status_unknown: requirement('sellerVatStatus', 'seller_vat_status', 'Seller VAT status', 'terms', 'confirmed'),
  vat_treatment_unknown: requirement('vatTreatment', 'vat_treatment', 'VAT or transfer-duty treatment', 'terms', 'confirmed'),
})

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readPath(source = {}, path = '') {
  let current = source
  for (const part of String(path).split('.').filter(Boolean)) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

function resolveRequirementValue(item, { draft, placeholders, facts }) {
  const candidates = [
    draft?.[item.fieldKey],
    ...item.placeholderKeys.map((key) => placeholders?.[key]),
    ...item.placeholderKeys.map((key) => readPath(facts, key)),
  ]
  return candidates.find((value) => value !== null && value !== undefined && normalizeText(value) !== '')
}

function valueIsMissing(value, validate = 'text') {
  const text = normalizeText(value)
  if (!text) return true
  const normalized = text.toLowerCase().replace(/[\s./-]+/g, '_')
  if (['unknown', 'not_confirmed', 'tbc', 'missing', 'not_provided', 'n_a'].includes(normalized)) return true
  if (validate === 'positive_number') {
    const number = Number(text.replace(/[^0-9.-]/g, ''))
    return !Number.isFinite(number) || number <= 0
  }
  if (validate === 'email') return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
  return false
}

function fieldIssue(item, pack = null, reviewItem = null) {
  const packLabel = normalizeText(pack?.label || reviewItem?.relatedPackLabel || 'Legal setup')
  return {
    source: 'legal_clause_pack_transaction_readiness',
    packKey: pack?.key || reviewItem?.relatedPackKey || null,
    packLabel,
    sectionKey: item.sectionKey,
    sectionLabel: SECTION_LABELS[item.sectionKey] || 'Legal setup',
    fieldKey: item.fieldKey,
    placeholderKey: item.placeholderKeys[0] || item.fieldKey,
    placeholderLabel: item.label,
    message: `${item.label} is required before this OTP can be generated.`,
    required: true,
  }
}

function dedupeIssues(issues = []) {
  const seen = new Set()
  return issues.filter((issue) => {
    const key = `${issue.fieldKey || issue.placeholderKey}|${issue.packKey || issue.sectionKey}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function asMoney(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(number) ? number : null
}

function buildFinancialConflicts(facts = {}) {
  const finance = asRecord(facts.finance)
  const price = asMoney(finance.purchasePrice)
  const bond = asMoney(finance.bondAmount)
  const cash = asMoney(finance.cashAmount)
  const deposit = asMoney(finance.depositAmount)
  const conflicts = []
  const add = (code, message, factPaths, packKeys) => conflicts.push({ code, message, factPaths, packKeys, blocking: true })

  if (price !== null && cash !== null && finance.type === 'cash' && Math.abs(price - cash) > 0.01) {
    add(
      'cash_amount_does_not_match_purchase_price',
      'For a cash sale, the cash purchase amount must equal the purchase price.',
      ['finance.purchasePrice', 'finance.cashAmount'],
      ['cash_sale_pack'],
    )
  }
  if (price !== null && bond !== null && cash !== null && finance.type === 'combination' && Math.abs(price - bond - cash) > 0.01) {
    add(
      'combination_finance_does_not_balance',
      'The bond amount and cash contribution must add up to the purchase price.',
      ['finance.purchasePrice', 'finance.bondAmount', 'finance.cashAmount'],
      ['bond_finance_pack', 'cash_contribution_pack'],
    )
  }
  if (price !== null && bond !== null && bond > price) {
    add('bond_exceeds_purchase_price', 'The bond amount cannot exceed the purchase price.', ['finance.purchasePrice', 'finance.bondAmount'], ['bond_finance_pack'])
  }
  if (price !== null && cash !== null && cash > price) {
    add('cash_exceeds_purchase_price', 'The cash amount cannot exceed the purchase price.', ['finance.purchasePrice', 'finance.cashAmount'], ['cash_sale_pack', 'cash_contribution_pack'])
  }
  if (price !== null && deposit !== null && deposit > price) {
    add('deposit_exceeds_purchase_price', 'The deposit cannot exceed the purchase price.', ['finance.purchasePrice', 'finance.depositAmount'], ['deposit_trust_pack'])
  }
  return conflicts
}

export function resolveLegalClausePackTransactionReadiness(options = {}) {
  const draft = asRecord(options.draft || options.otpDraft || options.context?.otpDraft)
  const placeholders = asRecord(options.placeholders)
  const facts = options.facts || buildSouthAfricanLegalDealFacts({
    ...options,
    draft,
    source: 'phase_6_transaction_readiness',
  })
  const resolution = options.resolution || resolveSouthAfricanLegalClausePacks(facts)
  const activePacks = Array.isArray(resolution?.activePacks) ? resolution.activePacks : []

  const packRows = activePacks.map((pack) => {
    const requirements = LEGAL_CLAUSE_PACK_TRANSACTION_REQUIREMENTS[pack.key] || []
    const fields = requirements.map((item) => {
      const value = resolveRequirementValue(item, { draft, placeholders, facts })
      const missing = valueIsMissing(value, item.validate)
      return { ...item, value: value ?? '', present: !missing, missing }
    })
    const missingFields = fields.filter((field) => field.missing).map((field) => fieldIssue(field, pack))
    return {
      key: pack.key,
      label: pack.label,
      category: pack.category,
      reason: pack.reason,
      fields,
      missingFields,
      status: missingFields.length ? 'missing_data' : 'ready',
      ready: missingFields.length === 0,
    }
  })

  const decisionIssues = []
  const attorneyReviewItems = []
  for (const reviewItem of resolution?.reviewItems || []) {
    const decisionField = DECISION_REVIEW_FIELDS[reviewItem.code]
    if (decisionField) {
      decisionIssues.push(fieldIssue(decisionField, null, reviewItem))
    } else {
      attorneyReviewItems.push({
        ...reviewItem,
        source: 'legal_clause_pack_attorney_review',
        requiredBeforeSignature: true,
      })
    }
  }
  if (resolution?.activePackKeys?.includes('vat_zero_rated_tax_pack')) {
    attorneyReviewItems.push({
      code: 'zero_rated_vat_specialist_review',
      section: 'tax',
      message: 'The transferring or tax attorney must confirm every zero-rating requirement before signature.',
      relatedPackKey: 'vat_zero_rated_tax_pack',
      relatedPackLabel: 'Potential zero-rated VAT treatment',
      source: 'legal_clause_pack_attorney_review',
      requiredBeforeSignature: true,
    })
  }

  const missingFields = dedupeIssues([
    ...packRows.flatMap((pack) => pack.missingFields),
    ...decisionIssues,
  ])
  const conflicts = [
    ...(Array.isArray(resolution?.conflicts) ? resolution.conflicts : []),
    ...buildFinancialConflicts(facts),
  ]
  const sections = Object.entries(SECTION_LABELS).map(([key, label]) => {
    const issues = missingFields.filter((issue) => issue.sectionKey === key)
    return { key, label, issues, missingCount: issues.length, complete: issues.length === 0 }
  })
  const readyPackCount = packRows.filter((pack) => pack.ready).length
  const canGenerate = Boolean(resolution?.draftAssemblyAllowed) && conflicts.length === 0 && missingFields.length === 0
  const canSendForSignature = canGenerate && attorneyReviewItems.length === 0 && Boolean(resolution?.signingReady)

  return {
    schemaVersion: LEGAL_CLAUSE_PACK_TRANSACTION_READINESS_VERSION,
    factsVersion: facts?.schemaVersion || null,
    factsKey: facts?.factsKey || null,
    selectionKey: resolution?.selectionKey || null,
    assemblyMode: resolution?.assemblyMode || null,
    automatedAssemblyAllowed: Boolean(resolution?.draftAssemblyAllowed),
    activePacks: packRows,
    activePackCount: packRows.length,
    readyPackCount,
    blockedPackCount: packRows.length - readyPackCount,
    missingFields,
    missingFieldCount: missingFields.length,
    decisionIssues: dedupeIssues(decisionIssues),
    conflicts,
    attorneyReviewItems,
    attorneyReviewCount: attorneyReviewItems.length,
    sections,
    canGenerate,
    canSendForSignature,
  }
}
