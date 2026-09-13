import { normalizeProperty24Text } from './client.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const API_VERSION_PATTERN = /^v[0-9]+$/

function requiredUuid(value, label) {
  const normalized = normalizeProperty24Text(value)
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} must be a UUID.`)
  return normalized
}

function optionalUuid(value, label) {
  const normalized = normalizeProperty24Text(value)
  return normalized ? requiredUuid(normalized, label) : null
}

function requiredPositiveInteger(value, label) {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer.`)
  return number
}

function optionalCount(value, label) {
  if (value === null || value === undefined) return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer when supplied.`)
  return number
}

function optionalPrice(value) {
  if (value === null || value === undefined) return null
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error('price must be numeric when supplied.')
  return number
}

function requiredDate(value, label) {
  const normalized = normalizeProperty24Text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`${label} must use YYYY-MM-DD.`)
  return normalized
}

export function buildProperty24ListingStatisticsSnapshot({
  organisationId,
  privateListingId,
  environment = 'production',
  sourceApiVersion = 'v55',
  statistic,
  syncedAt = new Date().toISOString(),
} = {}) {
  const normalizedEnvironment = normalizeProperty24Text(environment).toLowerCase()
  const normalizedApiVersion = normalizeProperty24Text(sourceApiVersion).toLowerCase()
  if (!['exdev', 'production'].includes(normalizedEnvironment)) throw new Error('environment must be exdev or production.')
  if (!API_VERSION_PATTERN.test(normalizedApiVersion)) throw new Error('sourceApiVersion must use the form vNN.')
  if (!statistic || statistic.kind !== 'listing') throw new Error('A normalized per-listing Property24 statistic is required.')

  return {
    organisation_id: requiredUuid(organisationId, 'organisationId'),
    private_listing_id: optionalUuid(privateListingId, 'privateListingId'),
    environment: normalizedEnvironment,
    agency_id: requiredPositiveInteger(statistic.agencyId, 'statistic.agencyId'),
    listing_number: requiredPositiveInteger(statistic.listingNumber, 'statistic.listingNumber'),
    statistic_date: requiredDate(statistic.statisticDate, 'statistic.statisticDate'),
    source_api_version: normalizedApiVersion,
    view_count: optionalCount(statistic.listingViews, 'statistic.listingViews'),
    alert_count: optionalCount(statistic.listingAlerts, 'statistic.listingAlerts'),
    tel_leads: optionalCount(statistic.telephoneLeads, 'statistic.telephoneLeads'),
    sms_leads: optionalCount(statistic.smsLeads, 'statistic.smsLeads'),
    listing_contact_form_leads: optionalCount(statistic.listingContactFormLeads, 'statistic.listingContactFormLeads'),
    whatsapp_contact_form_leads: optionalCount(statistic.whatsAppContactFormLeads, 'statistic.whatsAppContactFormLeads'),
    total_leads: optionalCount(statistic.totalLeads, 'statistic.totalLeads'),
    total_contact_leads: optionalCount(statistic.totalContactLeads, 'statistic.totalContactLeads'),
    price: optionalPrice(statistic.price),
    synced_at: new Date(syncedAt).toISOString(),
  }
}
