import { validateDealSetupFunding } from './dealSetupContract.js'
export const DEAL_REVIEW_SECTIONS = Object.freeze([
  { key: 'buyer', label: 'Buyer details', identityField: 'name', fields: [
    ['name', 'Full name'], ['purchaserType', 'Buyer type', 'buyer_type'], ['email', 'Email address', 'email'],
    ['phone', 'Mobile number', 'tel'], ['identityNumber', 'ID / passport / registration number'], ['residentialAddress', 'Residential / business address', 'textarea'],
  ] },
  { key: 'seller', label: 'Seller details', identityField: 'name', fields: [
    ['name', 'Seller name'], ['entityType', 'Seller type'], ['email', 'Seller email', 'email'], ['phone', 'Seller phone', 'tel'],
    ['identityNumber', 'ID / passport / registration number'], ['address', 'Seller address', 'textarea'],
  ] },
  { key: 'property', label: 'Property details', identityField: 'addressLine1', fields: [
    ['addressLine1', 'Property address'], ['addressLine2', 'Address line 2'], ['suburb', 'Suburb'], ['city', 'City'],
    ['province', 'Province'], ['postalCode', 'Postal code'], ['erfUnit', 'Erf / portion / unit reference'], ['description', 'Property description', 'textarea'],
  ] },
  { key: 'attorney', label: 'Attorney details', identityField: 'firmName', fields: [
    ['firmName', 'Captured attorney firm'], ['contactName', 'Contact person'], ['email', 'Attorney email', 'email'],
    ['phone', 'Attorney phone', 'tel'], ['reference', 'Attorney reference'],
  ] },
  { key: 'funding', label: 'Commercial terms & Funding', identityField: 'financeType', fields: [
    ['purchasePrice', 'Purchase price', 'number'], ['depositAmount', 'Deposit', 'number'],
    ['financeType', 'Finance type', 'finance_type'], ['cashAmount', 'Cash amount', 'number'],
    ['bondAmount', 'Bond amount', 'number'], ['managedBy', 'Finance managed by', 'finance_manager'], ['bank', 'Bank'],
  ] },
])

export function reviewSectionDefinition(key) {
  const definition = DEAL_REVIEW_SECTIONS.find((section) => section.key === key)
  if (!definition) throw new Error('Choose a valid review section.')
  return definition
}

export function reviewSectionDetails(key, snapshot = {}) {
  return Object.fromEntries(reviewSectionDefinition(key).fields.map(([field]) => [field, String(snapshot[field] ?? '').trim()]))
}

export function reviewSectionChanged(key, draft = {}, current = {}) {
  return JSON.stringify(reviewSectionDetails(key, draft)) !== JSON.stringify(reviewSectionDetails(key, current))
}

export function reviewFieldChanges(key, previous = {}, saved = {}) {
  return reviewSectionDefinition(key).fields.filter(([field]) => String(previous[field] ?? '') !== String(saved[field] ?? ''))
    .map(([field, label]) => ({ field, label, previous: String(previous[field] ?? ''), saved: String(saved[field] ?? '') }))
}

export function validateReviewDetails({ section, details, snapshot = {}, confirm = false, sourceAvailable = false, attested = false } = {}) {
  const definition = reviewSectionDefinition(section)
  const errors = []
  for (const [key] of definition.fields) {
    if (typeof details?.[key] !== 'string') errors.push('Complete all fields using text.')
    else if (details[key].length > 1000) errors.push('Fields must be at most 1000 characters.')
  }
  if (details?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) errors.push('Enter a valid email address.')
  if (section === 'buyer' && !['individual', 'married_coc', 'company', 'trust'].includes(details?.purchaserType)) errors.push('Choose a valid buyer type.')
  if (section === 'funding') {
    for (const key of ['purchasePrice', 'depositAmount', 'cashAmount', 'bondAmount']) {
      if (details?.[key] && !/^[0-9]{1,12}(\.[0-9]{1,2})?$/.test(details[key])) errors.push('Enter a non-negative amount with at most two decimal places.')
    }
    if (details?.financeType && !['cash', 'bond', 'hybrid', 'combination'].includes(details.financeType)) errors.push('Choose a supported finance type.')
    if (details?.managedBy && !['client', 'bond_originator'].includes(details.managedBy)) errors.push('Choose who manages the bond.')
    if (confirm) {
      errors.push(...validateDealSetupFunding({ terms: { purchasePrice: details?.purchasePrice, depositAmount: details?.depositAmount }, finance: { type: details?.financeType, cashAmount: details?.cashAmount, bondAmount: details?.bondAmount, managedBy: details?.managedBy } }).issues)
      if (!(Number(details?.purchasePrice) > 0)) errors.push('Enter the purchase price before confirming.')
      if (['cash', 'hybrid', 'combination'].includes(details?.financeType) && !details?.cashAmount) errors.push('Enter the cash amount before confirming.')
      if (['bond', 'hybrid', 'combination'].includes(details?.financeType) && (!details?.bondAmount || !details?.managedBy)) errors.push('Enter the bond amount and finance manager before confirming.')
    }
  }
  if (confirm) {
    if (!String(details?.[definition.identityField] || '').trim()) errors.push('Complete the section identity before confirming it.')
    if (!sourceAvailable) errors.push('An available source PDF is required before confirmation.')
    if (!attested) errors.push('Check the details against the original document before confirming.')
    if (section === 'buyer' && (snapshot.primaryCount !== 1 ||
      (snapshot.capturedBuyerId && snapshot.capturedBuyerId !== snapshot.buyerProfileId) ||
      (snapshot.savedPrimaryId && snapshot.savedPrimaryId !== snapshot.participantId))) {
      errors.push('Resolve the primary buyer links in Deal Setup before confirming this section.')
    }
  }
  return [...new Set(errors)]
}

// A reviewed correction is local to the exact saved assignment; a later buyer
// replacement must never inherit the previous buyer's corrected display name.
export function transactionReviewedBuyerName(transaction = {}) {
  const marker = transaction.deal_review_details?.buyer
  if (!marker || String(marker.profileId || '') !== String(transaction.buyer_id || '')) return ''
  if (String(marker.savedPrimaryId ?? marker.participantId ?? '') !== String(transaction.primary_buyer_participant_id || '')) return ''
  return String(transaction.buyer_name || '').trim()
}
