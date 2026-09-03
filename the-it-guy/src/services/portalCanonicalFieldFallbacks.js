import {
  buildCanonicalMergeFieldPayload,
  resolveCanonicalFieldValue,
} from '../core/documents/canonicalFieldResolver.js'

function normalizeText(value) {
  if (value && typeof value === 'object') return ''
  return String(value ?? '').trim()
}

const PENDING_PLACEHOLDER_KEYS = new Set([
  'buyer',
  'buyer_pending',
  'buyer_details_pending',
  'seller',
  'seller_pending',
  'seller_details_pending',
  'property',
  'property_pending',
  'address_pending',
  'not_assigned',
  'not_captured',
  'not_provided',
  'not_set',
])

function isPendingPlaceholder(value) {
  const key = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return PENDING_PLACEHOLDER_KEYS.has(key)
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text && !isPendingPlaceholder(text)) return text
  }
  return ''
}

function addSource(target, source, seen = new WeakSet()) {
  if (!isPlainObject(source)) return
  if (seen.has(source)) return
  seen.add(source)
  target.push(source)

  for (const key of [
    'onboardingFormData',
    'onboarding_form_data',
    'formData',
    'form_data',
    'buyerOnboardingFormData',
    'buyer_onboarding_form_data',
    'sellerOnboardingFormData',
    'seller_onboarding_form_data',
    'sellerCanonicalFacts',
    'seller_canonical_facts_json',
    'canonicalFacts',
    'canonical_facts',
    'workDeliveryPayload',
    'work_delivery_payload',
  ]) {
    if (isPlainObject(source[key])) target.push(source[key])
  }

  if (isPlainObject(source.sellerOnboarding?.formData)) target.push(source.sellerOnboarding.formData)
  if (isPlainObject(source.sellerOnboarding?.canonicalFacts)) target.push(source.sellerOnboarding.canonicalFacts)
  if (isPlainObject(source.transaction)) addSource(target, source.transaction, seen)
  if (isPlainObject(source.listing)) addSource(target, source.listing, seen)
  if (isPlainObject(source.privateListing)) addSource(target, source.privateListing, seen)
  if (isPlainObject(source.buyer)) target.push({ buyer: source.buyer })
  if (isPlainObject(source.seller)) target.push({ seller: source.seller })
  if (isPlainObject(source.property)) target.push({ property: source.property })
  if (isPlainObject(source.finance)) target.push({ finance: source.finance })
}

export function buildPortalCanonicalSources(...groups) {
  const sources = []
  const seen = new WeakSet()
  for (const group of groups.flat()) {
    addSource(sources, group, seen)
  }
  return sources
}

export function buildPortalCanonicalMergePayload(sources = [], options = {}) {
  return buildCanonicalMergeFieldPayload(buildPortalCanonicalSources(sources), options)
}

export function resolvePortalCanonicalText(mergeFieldKey = '', sources = [], options = {}) {
  for (const source of buildPortalCanonicalSources(sources)) {
    const value = resolveCanonicalFieldValue(source, mergeFieldKey, options)
    const text = normalizeText(Array.isArray(value) ? value.map((item) => normalizeText(item?.name || item)).filter(Boolean).join(', ') : value)
    if (text && !isPendingPlaceholder(text)) return text
  }
  return ''
}

export function resolvePortalSellerName(row = {}, options = {}) {
  const listing = isPlainObject(row.listing) ? row.listing : {}
  const formData = isPlainObject(row.formData)
    ? row.formData
    : isPlainObject(row.onboardingFormData)
      ? row.onboardingFormData
      : isPlainObject(row.onboarding_form_data)
        ? row.onboarding_form_data
        : {}
  const transaction = isPlainObject(row.transaction) ? row.transaction : {}
  const payload = isPlainObject(row.workDeliveryPayload)
    ? row.workDeliveryPayload
    : isPlainObject(row.work_delivery_payload)
      ? row.work_delivery_payload
      : {}
  const fallback = options.fallback ?? row.fallback ?? 'Seller'
  const flatName = [
    firstText(row.sellerName, row.seller_name, formData.sellerName, formData.sellerFirstName, formData.firstName, formData.name),
    firstText(formData.sellerSurname, formData.lastName, formData.surname),
  ].filter(Boolean).join(' ').trim()
  return firstText(
    flatName,
    row?.seller?.name,
    row?.seller,
    transaction.seller_name,
    transaction.sellerName,
    payload.sellerName,
    payload.seller_name,
    listing?.seller?.name,
    listing?.sellerName,
    resolvePortalCanonicalText('seller_full_name', [row, formData, listing, transaction, payload], { packetType: 'mandate' }),
  ) || fallback
}

export function resolvePortalBuyerName(row = {}, { fallback = 'Buyer pending' } = {}) {
  const transaction = isPlainObject(row.transaction) ? row.transaction : {}
  const formData = isPlainObject(row.formData)
    ? row.formData
    : isPlainObject(row.onboardingFormData)
      ? row.onboardingFormData
      : isPlainObject(row.onboarding_form_data)
        ? row.onboarding_form_data
        : {}
  const payload = isPlainObject(row.workDeliveryPayload)
    ? row.workDeliveryPayload
    : isPlainObject(row.work_delivery_payload)
      ? row.work_delivery_payload
      : {}
  return firstText(
    row?.buyer?.name,
    row?.buyer,
    row?.buyerName,
    row?.buyer_name,
    row?.client,
    row?.clientName,
    transaction.buyer_name,
    transaction.buyerName,
    transaction.client_name,
    transaction.clientName,
    payload.buyerName,
    payload.buyer_name,
    resolvePortalCanonicalText('buyer_full_name', [formData, transaction, payload, row], { packetType: 'otp' }),
  ) || fallback
}

export function resolvePortalPropertyLabel(row = {}, { fallback = 'Property pending' } = {}) {
  const transaction = isPlainObject(row.transaction) ? row.transaction : {}
  const unit = isPlainObject(row.unit) ? row.unit : {}
  const development = isPlainObject(row.development) ? row.development : {}
  const payload = isPlainObject(row.workDeliveryPayload)
    ? row.workDeliveryPayload
    : isPlainObject(row.work_delivery_payload)
      ? row.work_delivery_payload
      : {}
  const canonicalAddress = resolvePortalCanonicalText('property_address', [row, transaction, payload], { packetType: 'otp' })
  const canonicalSuburb = resolvePortalCanonicalText('property_suburb', [row, transaction, payload], { packetType: 'otp' })
  const canonicalCity = resolvePortalCanonicalText('property_city', [row, transaction, payload], { packetType: 'otp' })
  const directProperty = firstText(
    row?.property?.display_address,
    row?.property?.displayAddress,
    row?.property?.address,
    row?.property,
    row?.propertyLabel,
    row?.property_label,
    row?.propertyAddress,
    row?.property_address,
    row?.address,
    transaction.property_name,
    transaction.propertyName,
    transaction.property_address_line_1,
    transaction.propertyAddressLine1,
    transaction.property_address,
    transaction.property_description,
    payload.propertyLabel,
    payload.property_label,
    canonicalAddress,
    [canonicalSuburb, canonicalCity].filter(Boolean).join(', '),
  )
  if (directProperty) return directProperty

  // Unit-created transactions inherit their address from the development.
  // Never reduce an otherwise identifiable development matter to a generic
  // “Property pending” label.
  const developmentAddress = firstText(
    development.formatted_address,
    development.formattedAddress,
    development.address,
    development.street_address,
    development.streetAddress,
    development.address_line_1,
    development.addressLine1,
    development.location,
  )
  const unitLabel = firstText(unit.unit_label, unit.unitLabel, unit.unit_number, unit.unitNumber)
  const developmentName = firstText(development.development_name, development.developmentName, development.name)
  if (developmentAddress && unitLabel) return `${developmentAddress} · Unit ${unitLabel}`
  if (developmentAddress) return developmentAddress
  if (developmentName && unitLabel) return `${developmentName} · Unit ${unitLabel}`
  if (unitLabel) return `Unit ${unitLabel}`
  if (developmentName) return developmentName
  return fallback
}
