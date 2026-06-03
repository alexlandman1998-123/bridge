import { createOrUpdateLeadFromEnquiry, normalizeLeadSource, recordLeadIngestionFailure } from './leadIngestionService'
import { getOrganisationPrivateListings } from './privateListingService'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizePhone(value) {
  const text = normalizeText(value)
  if (!text) return ''
  const plus = text.startsWith('+') ? '+' : ''
  return `${plus}${text.replace(/[^\d]/g, '')}`
}

function isUuidLike(value) {
  return UUID_PATTERN.test(normalizeText(value))
}

function readPath(source = {}, path = '') {
  if (!path) return undefined
  return path.split('.').reduce((value, key) => {
    if (value === null || value === undefined) return undefined
    return value[key]
  }, source)
}

function pickFirst(source = {}, paths = []) {
  for (const path of paths) {
    const value = readPath(source, path)
    if (Array.isArray(value) && value.length) return value[0]
    if (value !== null && value !== undefined && normalizeText(value) !== '') return value
  }
  return ''
}

function splitName(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  }
}

function normalizeTimestamp(value) {
  const raw = pickTimestamp(value)
  if (!raw) return new Date().toISOString()
  if (typeof raw === 'number' || /^\d+$/.test(String(raw))) {
    const number = Number(raw)
    const date = new Date(number < 10000000000 ? number * 1000 : number)
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
  }
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function pickTimestamp(value) {
  return value
}

function normalizeArrayInput(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  const text = normalizeText(value)
  return text ? text.split(/[,;\n]/).map(normalizeText).filter(Boolean) : []
}

function buildExternalReference(source, fallbackPrefix = 'ENQ') {
  const reference = normalizeText(source)
  if (reference) return reference
  return `${fallbackPrefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function buildRequirement(payload = {}) {
  const areas = normalizeArrayInput(payload.areas || payload.area || payload.areaInterest || payload.suburb)
  const suburbs = normalizeArrayInput(payload.suburbs || payload.suburb)
  const propertyTypes = normalizeArrayInput(payload.propertyTypes || payload.propertyType || payload.property_type)
  const budgetMax = payload.budgetMax ?? payload.budget_max ?? payload.budget
  const budgetMin = payload.budgetMin ?? payload.budget_min
  const bedroomsMin = payload.bedroomsMin ?? payload.bedrooms_min ?? payload.bedrooms
  const bathroomsMin = payload.bathroomsMin ?? payload.bathrooms_min ?? payload.bathrooms
  const mustHaves = normalizeArrayInput(payload.mustHaves || payload.must_haves || payload.features)
  const hasSignal = areas.length || suburbs.length || propertyTypes.length || budgetMax || budgetMin || bedroomsMin || bathroomsMin || mustHaves.length
  if (!hasSignal) return null
  return {
    title: normalizeText(payload.requirementTitle || payload.title) || '',
    intentType: normalizeText(payload.intentType || payload.intent_type) || 'buy',
    propertyTypes,
    areas,
    suburbs,
    city: normalizeText(payload.city),
    province: normalizeText(payload.province),
    budgetMin,
    budgetMax,
    bedroomsMin,
    bathroomsMin,
    garagesMin: payload.garagesMin ?? payload.garages_min ?? payload.garages,
    parkingMin: payload.parkingMin ?? payload.parking_min ?? payload.parking,
    mustHaves,
    timeline: normalizeText(payload.timeline),
    urgency: normalizeText(payload.urgency),
    notes: normalizeText(payload.requirementNotes || payload.notes),
    isPrimary: true,
  }
}

export function buildCanonicalLeadPayload(payload = {}, sourceName = 'Other') {
  const originalPayload = payload.rawPayload && typeof payload.rawPayload === 'object' ? payload.rawPayload : payload
  const fullName = normalizeText(payload.name || payload.fullName || [payload.firstName, payload.lastName].filter(Boolean).join(' '))
  const nameParts = splitName(fullName)
  const firstName = normalizeText(payload.firstName || payload.first_name || nameParts.firstName)
  const lastName = normalizeText(payload.lastName || payload.last_name || nameParts.lastName)
  const source = normalizeLeadSource(payload.source || sourceName)
  const canonical = {
    source,
    organisationId: normalizeText(payload.organisationId || payload.organisation_id),
    externalReference: normalizeText(payload.externalReference || payload.external_reference || payload.reference || payload.id),
    firstName,
    lastName,
    name: normalizeText(fullName || [firstName, lastName].filter(Boolean).join(' ')),
    phone: normalizePhone(payload.phone || payload.mobile || payload.cellphone),
    email: normalizeLower(payload.email),
    message: normalizeText(payload.message || payload.body || payload.notes || payload.comment),
    listingReference: normalizeText(payload.listingReference || payload.listing_reference || payload.externalListingReference || payload.external_listing_reference),
    listingId: normalizeText(payload.listingId || payload.listing_id || payload.privateListingId || payload.private_listing_id),
    receivedAt: normalizeTimestamp(payload.receivedAt || payload.received_at || payload.createdAt || payload.created_at || payload.timestamp),
    enquiryTimestamp: normalizeTimestamp(payload.receivedAt || payload.received_at || payload.createdAt || payload.created_at || payload.timestamp),
    leadCategory: normalizeText(payload.leadCategory || payload.lead_category) || 'Buyer',
    leadDirection: normalizeText(payload.leadDirection || payload.lead_direction) || 'Inbound',
    budget: payload.budgetMax ?? payload.budget_max ?? payload.budget,
    budgetMax: payload.budgetMax ?? payload.budget_max ?? payload.budget,
    area: normalizeText(payload.area || payload.areaInterest || payload.suburb),
    areaInterest: normalizeText(payload.areaInterest || payload.area || payload.suburb),
    propertyType: normalizeText(payload.propertyType || payload.property_type),
    bedrooms: payload.bedroomsMin ?? payload.bedrooms_min ?? payload.bedrooms,
    bathrooms: payload.bathroomsMin ?? payload.bathrooms_min ?? payload.bathrooms,
    requirement: buildRequirement(payload),
    originalPayload,
  }
  return {
    ...canonical,
    rawPayload: {
      ...originalPayload,
      canonical,
    },
  }
}

export function validateCanonicalPayload(payload = {}) {
  const errors = []
  if (!normalizeText(payload.organisationId || payload.organisation_id)) errors.push('Missing organisation.')
  if (!normalizeText(payload.phone) && !normalizeText(payload.email)) errors.push('Missing contact details: phone or email is required.')
  return {
    ok: errors.length === 0,
    errors,
  }
}

function mapCommonContactPayload(payload = {}, sourceName = 'Other') {
  return buildCanonicalLeadPayload({
    source: sourceName,
    organisationId: pickFirst(payload, ['organisationId', 'organisation_id', 'workspaceId', 'workspace_id']),
    externalReference: pickFirst(payload, ['externalReference', 'external_reference', 'enquiryId', 'enquiry_id', 'submissionId', 'submission_id', 'reference', 'id']),
    firstName: pickFirst(payload, ['firstName', 'first_name', 'contact.firstName', 'contact.first_name']),
    lastName: pickFirst(payload, ['lastName', 'last_name', 'contact.lastName', 'contact.last_name']),
    name: pickFirst(payload, ['name', 'fullName', 'full_name', 'contact.name', 'contact.fullName']),
    phone: pickFirst(payload, ['phone', 'mobile', 'cellphone', 'contact.phone', 'contact.mobile']),
    email: pickFirst(payload, ['email', 'contact.email']),
    message: pickFirst(payload, ['message', 'body', 'notes', 'comment', 'enquiryText', 'enquiry_text']),
    listingReference: pickFirst(payload, ['listingReference', 'listing_reference', 'externalListingReference', 'external_listing_reference', 'propertyReference', 'property_reference']),
    listingId: pickFirst(payload, ['listingId', 'listing_id', 'privateListingId', 'private_listing_id']),
    receivedAt: pickFirst(payload, ['receivedAt', 'received_at', 'createdAt', 'created_at', 'timestamp']),
    leadCategory: pickFirst(payload, ['leadCategory', 'lead_category']),
    leadDirection: pickFirst(payload, ['leadDirection', 'lead_direction']),
    budget: pickFirst(payload, ['budget', 'budgetMax', 'budget_max']),
    budgetMax: pickFirst(payload, ['budgetMax', 'budget_max', 'budget']),
    budgetMin: pickFirst(payload, ['budgetMin', 'budget_min']),
    area: pickFirst(payload, ['area', 'areaInterest', 'area_interest', 'suburb']),
    suburb: pickFirst(payload, ['suburb']),
    city: pickFirst(payload, ['city']),
    province: pickFirst(payload, ['province']),
    propertyType: pickFirst(payload, ['propertyType', 'property_type']),
    bedrooms: pickFirst(payload, ['bedrooms', 'bedroomsMin', 'bedrooms_min']),
    bathrooms: pickFirst(payload, ['bathrooms', 'bathroomsMin', 'bathrooms_min']),
    rawPayload: payload,
  }, sourceName)
}

export function mapWebsitePayload(payload = {}) {
  const formType = normalizeLower(pickFirst(payload, ['formType', 'form_type', 'type', 'enquiryType', 'enquiry_type']))
  const isSellerIntent = ['valuation', 'valuation_request', 'list_my_property', 'seller', 'sell'].includes(formType)
  return buildCanonicalLeadPayload({
    ...mapCommonContactPayload(payload, 'Website'),
    source: 'Website',
    externalReference: buildExternalReference(pickFirst(payload, ['externalReference', 'external_reference', 'submissionId', 'submission_id', 'id', 'reference']), 'WEB'),
    leadCategory: isSellerIntent ? 'Seller' : pickFirst(payload, ['leadCategory', 'lead_category']) || 'Buyer',
    propertyType: pickFirst(payload, ['propertyType', 'property_type', 'propertyInterest', 'property_interest']),
    intentType: isSellerIntent ? 'sell' : 'buy',
    rawPayload: payload,
  }, 'Website')
}

export function mapProperty24Payload(payload = {}) {
  return buildCanonicalLeadPayload({
    source: 'Property24',
    organisationId: pickFirst(payload, ['organisationId', 'organisation_id', 'agencyId', 'agency_id']),
    externalReference: buildExternalReference(pickFirst(payload, ['externalReference', 'external_reference', 'enquiryId', 'enquiry_id', 'leadId', 'lead_id', 'id', 'reference']), 'P24'),
    name: pickFirst(payload, ['name', 'fullName', 'full_name', 'contactName', 'contact_name', 'customer.name']),
    phone: pickFirst(payload, ['phone', 'mobile', 'telephone', 'contactNumber', 'contact_number', 'customer.phone']),
    email: pickFirst(payload, ['email', 'customer.email']),
    message: pickFirst(payload, ['message', 'comments', 'comment', 'enquiryText', 'enquiry_text', 'body']),
    listingReference: pickFirst(payload, ['listingReference', 'listing_reference', 'property24ListingId', 'property24_listing_id', 'propertyId', 'property_id', 'listing.id']),
    listingId: pickFirst(payload, ['listingId', 'listing_id', 'privateListingId', 'private_listing_id']),
    receivedAt: pickFirst(payload, ['receivedAt', 'received_at', 'createdAt', 'created_at', 'timestamp']),
    rawPayload: payload,
  }, 'Property24')
}

export function mapPrivatePropertyPayload(payload = {}) {
  return buildCanonicalLeadPayload({
    source: 'Private Property',
    organisationId: pickFirst(payload, ['organisationId', 'organisation_id', 'agencyId', 'agency_id']),
    externalReference: buildExternalReference(pickFirst(payload, ['externalReference', 'external_reference', 'enquiryId', 'enquiry_id', 'leadId', 'lead_id', 'id', 'reference']), 'PP'),
    name: pickFirst(payload, ['name', 'fullName', 'full_name', 'contactName', 'contact_name', 'customer.name']),
    phone: pickFirst(payload, ['phone', 'mobile', 'telephone', 'contactNumber', 'contact_number', 'customer.phone']),
    email: pickFirst(payload, ['email', 'customer.email']),
    message: pickFirst(payload, ['message', 'comments', 'comment', 'enquiryText', 'enquiry_text', 'body']),
    listingReference: pickFirst(payload, ['listingReference', 'listing_reference', 'privatePropertyListingId', 'private_property_listing_id', 'propertyId', 'property_id', 'listing.id']),
    listingId: pickFirst(payload, ['listingId', 'listing_id', 'privateListingId', 'private_listing_id']),
    receivedAt: pickFirst(payload, ['receivedAt', 'received_at', 'createdAt', 'created_at', 'timestamp']),
    rawPayload: payload,
  }, 'Private Property')
}

export function mapWhatsAppPayload(payload = {}) {
  const firstMessage = Array.isArray(payload.messages) ? payload.messages[0] || {} : {}
  return buildCanonicalLeadPayload({
    source: 'WhatsApp',
    organisationId: pickFirst(payload, ['organisationId', 'organisation_id', 'metadata.organisationId', 'metadata.organisation_id']),
    externalReference: buildExternalReference(pickFirst(payload, ['externalReference', 'external_reference', 'messageId', 'message_id', 'id', 'messages.0.id', 'reference']), 'WA'),
    name: pickFirst(payload, ['senderName', 'sender_name', 'profile.name', 'contacts.0.profile.name', 'fromName', 'from_name']),
    phone: pickFirst(payload, ['senderNumber', 'sender_number', 'from', 'waId', 'wa_id', 'contacts.0.wa_id']),
    email: pickFirst(payload, ['email']),
    message: normalizeText(firstMessage?.text?.body || firstMessage?.body || pickFirst(payload, ['message', 'body', 'text.body', 'text'])),
    listingReference: pickFirst(payload, ['listingReference', 'listing_reference', 'metadata.listingReference', 'metadata.listing_reference']),
    listingId: pickFirst(payload, ['listingId', 'listing_id', 'metadata.listingId', 'metadata.listing_id']),
    receivedAt: firstMessage.timestamp || pickFirst(payload, ['timestamp', 'receivedAt', 'received_at']),
    rawPayload: payload,
  }, 'WhatsApp')
}

export function mapManualImportRow(row = {}) {
  return buildCanonicalLeadPayload({
    source: pickFirst(row, ['Source', 'source']) || 'Manual Import',
    organisationId: pickFirst(row, ['Organisation ID', 'organisation_id', 'organisationId']),
    externalReference: buildExternalReference(pickFirst(row, ['External Reference', 'external_reference', 'externalReference', 'Reference', 'reference', 'ID', 'id']), 'IMPORT'),
    name: pickFirst(row, ['Name', 'name', 'Full Name', 'full_name', 'fullName']),
    phone: pickFirst(row, ['Phone', 'phone', 'Mobile', 'mobile']),
    email: pickFirst(row, ['Email', 'email']),
    message: pickFirst(row, ['Message', 'message', 'Notes', 'notes']),
    listingReference: pickFirst(row, ['Listing Reference', 'listing_reference', 'listingReference']),
    budget: pickFirst(row, ['Budget', 'budget', 'Budget Max', 'budget_max', 'budgetMax']),
    area: pickFirst(row, ['Area', 'area', 'Suburb', 'suburb']),
    propertyType: pickFirst(row, ['Property Type', 'property_type', 'propertyType']),
    rawPayload: row,
  }, pickFirst(row, ['Source', 'source']) || 'Manual Import')
}

export function mapGenericSourcePayload(payload = {}) {
  return mapCommonContactPayload(payload, payload.source || 'Other')
}

function referenceTokens(listing = {}) {
  return [
    listing.id,
    listing.listingReference,
    listing.listingCode,
    listing.property24Reference,
    listing.property24ListingUrl,
    listing.privatePropertyReference,
    listing.privatePropertyListingUrl,
    ...(Array.isArray(listing.externalLinks) ? listing.externalLinks.flatMap((link) => [link.reference, link.url, link.label]) : []),
  ].map(normalizeLower).filter(Boolean)
}

function listingMatchesReference(listing = {}, reference = '', source = '') {
  const normalizedReference = normalizeLower(reference)
  if (!normalizedReference) return false
  const tokens = referenceTokens(listing)
  if (tokens.some((token) => token === normalizedReference || token.includes(normalizedReference))) return true
  const normalizedSource = normalizeLower(source)
  if (normalizedSource.includes('property24')) return normalizeLower(listing.property24Reference) === normalizedReference || normalizeLower(listing.property24ListingUrl).includes(normalizedReference)
  if (normalizedSource.includes('private')) return normalizeLower(listing.privatePropertyReference) === normalizedReference || normalizeLower(listing.privatePropertyListingUrl).includes(normalizedReference)
  return false
}

export async function resolveExternalListingReference({ organisationId = '', listingId = '', listingReference = '', source = 'Other' } = {}) {
  const normalizedOrgId = normalizeText(organisationId)
  const reference = normalizeText(listingReference || listingId)
  if (!normalizedOrgId || !reference) return null
  const listings = await getOrganisationPrivateListings(normalizedOrgId, { includeRequirementsAndDocuments: false }).catch(() => [])
  if (isUuidLike(listingId)) {
    const byId = listings.find((listing) => normalizeText(listing.id) === normalizeText(listingId))
    if (byId) return byId
  }
  return listings.find((listing) => listingMatchesReference(listing, reference, source)) || null
}

async function processCanonicalPayload(canonicalPayload = {}, options = {}) {
  const payload = {
    ...canonicalPayload,
    organisationId: canonicalPayload.organisationId || options.organisationId || options.organisation_id || '',
  }
  const validation = validateCanonicalPayload(payload)
  if (!validation.ok) {
    if (!payload.organisationId) return { ok: false, status: 'failed', error: validation.errors.join(' ') }
    return recordLeadIngestionFailure(payload, validation.errors.join(' '))
  }
  const listing = await resolveExternalListingReference(payload)
  const ingestionPayload = {
    ...payload,
    listingId: listing?.id || payload.listingId || '',
    listingReference: payload.listingReference,
    receivedAt: payload.receivedAt,
    rawPayload: payload.rawPayload,
  }
  return createOrUpdateLeadFromEnquiry(ingestionPayload, options)
}

export function processProperty24Payload(payload = {}, options = {}) {
  return processCanonicalPayload(mapProperty24Payload(payload), options)
}

export function processPrivatePropertyPayload(payload = {}, options = {}) {
  return processCanonicalPayload(mapPrivatePropertyPayload(payload), options)
}

export function processWebsitePayload(payload = {}, options = {}) {
  return processCanonicalPayload(mapWebsitePayload(payload), options)
}

export function processWhatsAppPayload(payload = {}, options = {}) {
  return processCanonicalPayload(mapWhatsAppPayload(payload), options)
}

export async function processManualImportPayload(rows = [], options = {}) {
  const inputRows = Array.isArray(rows) ? rows : [rows]
  const results = []
  for (const row of inputRows) {
    try {
      results.push(await processCanonicalPayload(mapManualImportRow(row), options))
    } catch (error) {
      results.push({ ok: false, status: 'failed', error: error?.message || 'Manual import row failed.' })
    }
  }
  return {
    ok: results.every((result) => result.ok !== false),
    processed: results.filter((result) => result.ok !== false).length,
    failed: results.filter((result) => result.ok === false).length,
    results,
  }
}

export function processGenericSourcePayload(payload = {}, options = {}) {
  return processCanonicalPayload(mapGenericSourcePayload(payload), options)
}

export const __leadSourceConnectorServiceTestUtils = {
  buildCanonicalLeadPayload,
  mapGenericSourcePayload,
  mapManualImportRow,
  mapPrivatePropertyPayload,
  mapProperty24Payload,
  mapWebsitePayload,
  mapWhatsAppPayload,
  listingMatchesReference,
  referenceTokens,
  validateCanonicalPayload,
}
