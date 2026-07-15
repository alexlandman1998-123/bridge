import { LEGAL_INSTRUMENT_FAMILIES } from './legalInstrumentFamilyRouter.js'

export const SOUTH_AFRICAN_LEGAL_CLAUSE_PACKS_VERSION = 'sa_legal_clause_packs_v1'

function definePack(definition) {
  return Object.freeze({
    ...definition,
    requiredFactPaths: Object.freeze(definition.requiredFactPaths || []),
    sectionKeys: Object.freeze(definition.sectionKeys || [definition.key]),
    dependencies: Object.freeze(definition.dependencies || []),
  })
}

export const SOUTH_AFRICAN_LEGAL_CLAUSE_PACK_DEFINITIONS = Object.freeze([
  definePack({ key: 'residential_resale_core_pack', label: 'Residential resale terms', category: 'core', requiredFactPaths: ['instrument.familyKey'] }),
  definePack({ key: 'seller_individual_capacity_pack', label: 'Individual seller capacity', category: 'seller', requiredFactPaths: ['parties.seller.entityType', 'parties.seller.maritalRegime'] }),
  definePack({ key: 'seller_company_authority_pack', label: 'Company seller authority', category: 'seller', requiredFactPaths: ['parties.seller.entityType'] }),
  definePack({ key: 'seller_trust_authority_pack', label: 'Trust seller authority', category: 'seller', requiredFactPaths: ['parties.seller.entityType'] }),
  definePack({ key: 'seller_spouse_consent_pack', label: 'Seller spouse consent', category: 'seller', requiredFactPaths: ['parties.seller.maritalRegime'], dependencies: ['seller_individual_capacity_pack'] }),
  definePack({ key: 'buyer_individual_capacity_pack', label: 'Individual buyer capacity', category: 'buyer', requiredFactPaths: ['parties.buyer.entityType', 'parties.buyer.maritalRegime'] }),
  definePack({ key: 'buyer_company_authority_pack', label: 'Company buyer authority', category: 'buyer', requiredFactPaths: ['parties.buyer.entityType'] }),
  definePack({ key: 'buyer_trust_authority_pack', label: 'Trust buyer authority', category: 'buyer', requiredFactPaths: ['parties.buyer.entityType'] }),
  definePack({ key: 'buyer_spouse_consent_pack', label: 'Buyer spouse consent', category: 'buyer', requiredFactPaths: ['parties.buyer.maritalRegime'], dependencies: ['buyer_individual_capacity_pack'] }),
  definePack({ key: 'property_full_title_pack', label: 'Full-title property terms', category: 'property', requiredFactPaths: ['property.titleType'] }),
  definePack({ key: 'property_sectional_title_pack', label: 'Sectional-title property terms', category: 'property', requiredFactPaths: ['property.titleType'] }),
  definePack({ key: 'property_estate_hoa_pack', label: 'Estate or HOA terms', category: 'property', requiredFactPaths: ['property.inEstateOrHoa'] }),
  definePack({ key: 'property_exclusive_use_pack', label: 'Exclusive-use area terms', category: 'property', requiredFactPaths: ['property.existingExclusiveUseAreas'], dependencies: ['property_sectional_title_pack'] }),
  definePack({ key: 'cash_sale_pack', label: 'Cash payment terms', category: 'finance', requiredFactPaths: ['finance.type'] }),
  definePack({ key: 'bond_finance_pack', label: 'Bond suspensive-condition terms', category: 'finance', requiredFactPaths: ['finance.type'] }),
  definePack({ key: 'cash_contribution_pack', label: 'Cash contribution terms', category: 'finance', requiredFactPaths: ['finance.type', 'finance.cashAmount'], dependencies: ['bond_finance_pack'] }),
  definePack({ key: 'deposit_trust_pack', label: 'Deposit and trust-account terms', category: 'finance', requiredFactPaths: ['finance.depositAmount', 'finance.depositHolder'] }),
  definePack({ key: 'linked_property_sale_pack', label: 'Buyer-linked property sale condition', category: 'conditions', requiredFactPaths: ['conditions.saleOfExistingProperty', 'conditions.linkedSaleDeadline'] }),
  definePack({ key: 'occupation_before_transfer_pack', label: 'Occupation before transfer terms', category: 'occupation', requiredFactPaths: ['occupation.beforeTransfer', 'occupation.occupationalRent'] }),
  definePack({ key: 'existing_lease_pack', label: 'Existing lease or occupier terms', category: 'occupation', requiredFactPaths: ['occupation.existingLease'] }),
  definePack({ key: 'transfer_duty_tax_pack', label: 'Transfer-duty treatment', category: 'tax', requiredFactPaths: ['tax.vatTreatment'] }),
  definePack({ key: 'vat_inclusive_tax_pack', label: 'VAT-inclusive price treatment', category: 'tax', requiredFactPaths: ['tax.vatTreatment'] }),
  definePack({ key: 'vat_exclusive_tax_pack', label: 'VAT-exclusive price treatment', category: 'tax', requiredFactPaths: ['tax.vatTreatment'] }),
  definePack({ key: 'vat_zero_rated_tax_pack', label: 'Potential zero-rated VAT treatment', category: 'tax', requiredFactPaths: ['tax.vatTreatment'] }),
])

const PACK_BY_KEY = new Map(SOUTH_AFRICAN_LEGAL_CLAUSE_PACK_DEFINITIONS.map((pack) => [pack.key, pack]))

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function uniqueByCode(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    const key = normalizeText(item?.code || item?.key || item?.message)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function serializePack(pack, reason) {
  return {
    key: pack.key,
    label: pack.label,
    category: pack.category,
    sectionKeys: [...pack.sectionKeys],
    dependencies: [...pack.dependencies],
    requiredFactPaths: [...pack.requiredFactPaths],
    reason,
  }
}

function buildConflict(code, message, factPaths = [], packKeys = []) {
  return { code, message, factPaths, packKeys, blocking: true }
}

function buildReviewItem(item = {}, relatedPackKey = '') {
  const pack = PACK_BY_KEY.get(relatedPackKey)
  return {
    code: normalizeText(item.code || `review_${relatedPackKey || 'legal_facts'}`),
    section: normalizeText(item.section || pack?.category || 'legal_setup'),
    message: normalizeText(item.message || 'Attorney review is required before this document is sent for signature.'),
    relatedPackKey: relatedPackKey || null,
    relatedPackLabel: pack?.label || null,
    blockingForSigning: true,
  }
}

const REVIEW_PACK_BY_FACT_CODE = Object.freeze({
  hoa_name_missing: 'property_estate_hoa_pack',
  exclusive_use_areas_unknown: 'property_exclusive_use_pack',
  bond_approval_deadline_missing: 'bond_finance_pack',
  deposit_holder_unknown: 'deposit_trust_pack',
  lease_expiry_missing: 'existing_lease_pack',
  linked_sale_deadline_missing: 'linked_property_sale_pack',
  occupational_rent_missing: 'occupation_before_transfer_pack',
  vat_treatment_unknown: 'transfer_duty_tax_pack',
})

export function resolveSouthAfricanLegalClausePacks(facts = {}) {
  const activePacks = []
  const reviewItems = (Array.isArray(facts.reviewItems) ? facts.reviewItems : []).map((item) => (
    buildReviewItem(item, REVIEW_PACK_BY_FACT_CODE[item.code] || '')
  ))
  const conflicts = []
  const addPack = (key, reason) => {
    const pack = PACK_BY_KEY.get(key)
    if (pack && !activePacks.some((item) => item.key === key)) activePacks.push(serializePack(pack, reason))
  }
  const addReview = (code, section, message, relatedPackKey = '') => {
    reviewItems.push(buildReviewItem({ code, section, message }, relatedPackKey))
  }

  const familyKey = normalizeText(facts?.instrument?.familyKey) || LEGAL_INSTRUMENT_FAMILIES.UNKNOWN
  const automatedResidentialResale = familyKey === LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_RESALE && facts?.instrument?.generationAllowed !== false
  if (automatedResidentialResale) addPack('residential_resale_core_pack', 'Residential resale agreement selected.')

  for (const role of ['seller', 'buyer']) {
    const party = facts?.parties?.[role] || {}
    if (party.entityType === 'individual') addPack(`${role}_individual_capacity_pack`, `${role === 'seller' ? 'Seller' : 'Buyer'} is an individual.`)
    if (['company', 'close_corporation'].includes(party.entityType)) addPack(`${role}_company_authority_pack`, `${role === 'seller' ? 'Seller' : 'Buyer'} is a company or close corporation.`)
    if (party.entityType === 'trust') addPack(`${role}_trust_authority_pack`, `${role === 'seller' ? 'Seller' : 'Buyer'} is a trust.`)
    if (party.entityType === 'individual' && party.maritalRegime === 'in_community') {
      addPack(`${role}_spouse_consent_pack`, `${role === 'seller' ? 'Seller' : 'Buyer'} is married in community of property.`)
    }
    if (party.entityType === 'individual' && party.foreignMarriage === 'yes') {
      addReview(
        `${role}_foreign_marriage_review`,
        'parties',
        `Attorney must confirm the effect of the ${role}'s foreign marriage before signature.`,
        `${role}_individual_capacity_pack`,
      )
    }
  }

  if (facts?.property?.titleType === 'full_title') addPack('property_full_title_pack', 'The property is full title.')
  if (facts?.property?.titleType === 'sectional_title') addPack('property_sectional_title_pack', 'The property is sectional title.')
  if (facts?.property?.inEstateOrHoa === 'yes') addPack('property_estate_hoa_pack', 'Estate or HOA rules apply.')
  if (facts?.property?.existingExclusiveUseAreas === 'yes') addPack('property_exclusive_use_pack', 'Exclusive-use areas form part of the sale.')

  if (facts?.finance?.type === 'cash') addPack('cash_sale_pack', 'The purchase is recorded as a cash sale.')
  if (['bond', 'combination'].includes(facts?.finance?.type)) addPack('bond_finance_pack', 'Bond finance forms part of the purchase price.')
  if (facts?.finance?.type === 'combination') addPack('cash_contribution_pack', 'The price includes both a bond and a cash contribution.')
  if ((asNumber(facts?.finance?.depositAmount) || 0) > 0) addPack('deposit_trust_pack', 'A deposit is payable and must be held in trust.')

  if (facts?.conditions?.saleOfExistingProperty === 'yes') addPack('linked_property_sale_pack', 'The offer depends on the buyer selling another property.')
  if (facts?.occupation?.beforeTransfer === 'yes') addPack('occupation_before_transfer_pack', 'Occupation is expected before transfer.')
  if (facts?.occupation?.existingLease === 'yes') addPack('existing_lease_pack', 'An existing lease or occupier affects the property.')

  const taxPackByTreatment = {
    transfer_duty: 'transfer_duty_tax_pack',
    vat_inclusive: 'vat_inclusive_tax_pack',
    vat_exclusive: 'vat_exclusive_tax_pack',
    zero_rated: 'vat_zero_rated_tax_pack',
  }
  const taxPackKey = taxPackByTreatment[facts?.tax?.vatTreatment]
  if (taxPackKey) addPack(taxPackKey, `Tax treatment is recorded as ${String(facts.tax.vatTreatment).replaceAll('_', ' ')}.`)

  const activeKeys = new Set(activePacks.map((pack) => pack.key))
  for (const pack of activePacks) {
    for (const dependency of pack.dependencies) {
      if (!activeKeys.has(dependency)) {
        conflicts.push(buildConflict(
          `missing_dependency_${pack.key}`,
          `${pack.label} requires ${PACK_BY_KEY.get(dependency)?.label || dependency}.`,
          pack.requiredFactPaths,
          [pack.key, dependency],
        ))
      }
    }
  }

  const vatTreatments = ['vat_inclusive', 'vat_exclusive', 'zero_rated']
  if (facts?.tax?.sellerVatStatus === 'not_vendor' && vatTreatments.includes(facts?.tax?.vatTreatment)) {
    conflicts.push(buildConflict(
      'non_vendor_with_vat_treatment',
      'Seller is marked as a non-VAT vendor for this sale, but a VAT price treatment is selected.',
      ['tax.sellerVatStatus', 'tax.vatTreatment'],
      [taxPackKey].filter(Boolean),
    ))
  }
  if (facts?.tax?.sellerVatStatus === 'vendor' && facts?.tax?.vatTreatment === 'transfer_duty') {
    addReview('vat_vendor_transfer_duty_review', 'tax', 'Attorney must confirm why transfer duty applies although the seller is recorded as a VAT vendor.', 'transfer_duty_tax_pack')
  }
  if (facts?.property?.titleType !== 'sectional_title' && facts?.property?.existingExclusiveUseAreas === 'yes') {
    conflicts.push(buildConflict(
      'exclusive_use_without_sectional_title',
      'Exclusive-use areas cannot be assembled without a sectional-title property route.',
      ['property.titleType', 'property.existingExclusiveUseAreas'],
      ['property_exclusive_use_pack', 'property_sectional_title_pack'],
    ))
  }
  if (facts?.finance?.type === 'cash' && (asNumber(facts?.finance?.bondAmount) || 0) > 0) {
    conflicts.push(buildConflict('cash_route_with_bond_amount', 'Finance is marked cash, but a bond amount is present.', ['finance.type', 'finance.bondAmount'], ['cash_sale_pack', 'bond_finance_pack']))
  }
  if (facts?.finance?.type === 'bond' && (asNumber(facts?.finance?.cashAmount) || 0) > 0) {
    conflicts.push(buildConflict('bond_route_with_cash_contribution', 'Finance is marked bond-only, but a cash contribution is present. Select combination finance or remove the cash contribution.', ['finance.type', 'finance.cashAmount'], ['bond_finance_pack', 'cash_contribution_pack']))
  }
  if (facts?.conditions?.saleOfExistingProperty === 'no' && normalizeText(facts?.conditions?.linkedSaleDeadline)) {
    conflicts.push(buildConflict('linked_sale_deadline_without_condition', 'A linked-sale deadline is present although the linked property sale condition is set to no.', ['conditions.saleOfExistingProperty', 'conditions.linkedSaleDeadline'], ['linked_property_sale_pack']))
  }
  if (facts?.occupation?.existingLease === 'no' && normalizeText(facts?.occupation?.leaseExpiryDate)) {
    conflicts.push(buildConflict('lease_expiry_without_lease', 'A lease expiry date is present although the property is marked as having no existing lease.', ['occupation.existingLease', 'occupation.leaseExpiryDate'], ['existing_lease_pack']))
  }
  if (facts?.occupation?.beforeTransfer === 'no' && (asNumber(facts?.occupation?.occupationalRent) || 0) > 0) {
    conflicts.push(buildConflict('occupational_rent_without_early_occupation', 'Occupational rent is present although occupation before transfer is set to no.', ['occupation.beforeTransfer', 'occupation.occupationalRent'], ['occupation_before_transfer_pack']))
  }

  const resolvedReviewItems = uniqueByCode(reviewItems)
  const resolvedConflicts = uniqueByCode(conflicts)
  const activePackKeys = activePacks.map((pack) => pack.key)
  const decisions = SOUTH_AFRICAN_LEGAL_CLAUSE_PACK_DEFINITIONS.map((pack) => {
    const active = activePacks.find((item) => item.key === pack.key)
    const relatedReview = resolvedReviewItems.filter((item) => item.relatedPackKey === pack.key)
    return {
      key: pack.key,
      label: pack.label,
      category: pack.category,
      status: active ? (relatedReview.length ? 'included_review_required' : 'included') : 'excluded',
      reason: active?.reason || 'The captured deal facts did not activate this pack.',
      reviewCodes: relatedReview.map((item) => item.code),
    }
  })
  const draftAssemblyAllowed = automatedResidentialResale && resolvedConflicts.length === 0
  const signingReady = draftAssemblyAllowed && resolvedReviewItems.length === 0

  return {
    schemaVersion: SOUTH_AFRICAN_LEGAL_CLAUSE_PACKS_VERSION,
    factsVersion: facts?.schemaVersion || null,
    factsKey: facts?.factsKey || null,
    familyKey,
    assemblyMode: automatedResidentialResale ? 'automated_residential_resale' : 'attorney_template_required',
    activePacks,
    activePackKeys,
    reviewItems: resolvedReviewItems,
    conflicts: resolvedConflicts,
    decisions,
    draftAssemblyAllowed,
    signingReady,
    selectionKey: [SOUTH_AFRICAN_LEGAL_CLAUSE_PACKS_VERSION, facts?.factsKey, ...activePackKeys].filter(Boolean).join('__'),
  }
}

export function buildSouthAfricanLegalClausePackPlaceholders(resolution = {}) {
  return {
    legal_clause_pack_version: resolution.schemaVersion || SOUTH_AFRICAN_LEGAL_CLAUSE_PACKS_VERSION,
    legal_clause_pack_selection_key: resolution.selectionKey || '',
    legal_active_clause_packs: (resolution.activePackKeys || []).join(', '),
    legal_clause_pack_review_items: (resolution.reviewItems || []).map((item) => item.code).join(', '),
    legal_clause_pack_conflicts: (resolution.conflicts || []).map((item) => item.code).join(', '),
    legal_clause_pack_draft_allowed: resolution.draftAssemblyAllowed ? 'yes' : 'no',
    legal_clause_pack_signing_ready: resolution.signingReady ? 'yes' : 'no',
  }
}
