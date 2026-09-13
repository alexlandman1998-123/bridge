export const PROPERTY24_STATISTICS_CONTRACT_VERSION = 'arch9_property24_statistics_v55_phase1'

export const PROPERTY24_STATISTICS_METRICS = Object.freeze([
  {
    key: 'listingContactFormLeads',
    label: 'Listing contact forms',
    property24Field: 'requestDetailsLeads',
    description: 'Enquiries submitted through the standard Property24 listing contact form.',
    category: 'portal_contact',
  },
  {
    key: 'whatsAppContactFormLeads',
    label: 'WhatsApp contact forms',
    property24Field: 'whatsAppLeads',
    description: 'Enquiries initiated through Property24’s WhatsApp contact form.',
    category: 'portal_contact',
  },
  {
    key: 'telephoneLeads',
    label: 'Phone leads',
    property24Field: 'telLeads',
    description: 'Phone-contact activity measured by Property24.',
    category: 'portal_contact',
  },
  {
    key: 'smsLeads',
    label: 'SMS leads',
    property24Field: 'smsLeads',
    description: 'SMS-contact activity measured by Property24.',
    category: 'portal_contact',
  },
  {
    key: 'totalContactLeads',
    label: 'Total portal contacts',
    property24Field: 'totalContactLeads',
    description: 'Property24’s own total for all portal contact types; it is not recomputed by Arch9.',
    category: 'portal_contact_total',
  },
  {
    key: 'listingViews',
    label: 'Listing views',
    property24Field: 'viewCount',
    description: 'Property24 listing page views.',
    category: 'portal_interest',
  },
  {
    key: 'listingAlerts',
    label: 'Listing alerts',
    property24Field: 'alertCount',
    description: 'Property24 alert or saved-search exposure.',
    category: 'portal_interest',
  },
])

export const PROPERTY24_STATISTICS_REPORTING_RULES = Object.freeze([
  'Property24 WhatsApp contact forms are portal contacts and are never combined with Arch9 WhatsApp campaign results.',
  'Imported Property24 CRM leads are reported separately from Property24 portal contacts.',
  'Total portal contacts use Property24 totalContactLeads and are never calculated by Arch9 from individual contact fields.',
  'Property24 statistics represent portal performance; imported CRM leads represent leads that Arch9 received and stored.',
])

const LISTING_STATISTICS_FIELDS = new Set([
  'listingNumber',
  'agencyId',
  'viewCount',
  'alertCount',
  'telLeads',
  'smsLeads',
  'whatsAppLeads',
  'requestDetailsLeads',
  'date',
  'totalLeads',
  'totalContactLeads',
  'price',
  'streetAddress',
])

const STATISTICS_SUMMARY_FIELDS = new Set([
  'periodId',
  'agencyId',
  'suburbId',
  'listingType',
  'propertyCount',
  'viewCount',
  'alertCount',
  'telLeads',
  'smsLeads',
  'whatsAppLeads',
  'requestDetailsLeads',
  'averagePropertyCount',
  'totalLeads',
])

function statisticCount(value) {
  if (value === undefined || value === null || value === '') return null
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? Math.round(count) : null
}

function statisticNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function statisticText(value) {
  return String(value || '').trim() || null
}

function metricValues(source = {}) {
  return Object.fromEntries(
    PROPERTY24_STATISTICS_METRICS.map((metric) => [metric.key, statisticCount(source[metric.property24Field])]),
  )
}

function unsupportedFields(source = {}, allowedFields = new Set()) {
  return Object.keys(source || {}).filter((field) => !allowedFields.has(field)).sort()
}

function diagnostics(source = {}, allowedFields) {
  const unexpectedFields = unsupportedFields(source, allowedFields)
  return {
    unexpectedFields,
    warnings: unexpectedFields.length
      ? [`Property24 returned unrecognised listing statistics fields: ${unexpectedFields.join(', ')}.`]
      : [],
  }
}

/**
 * Converts the per-listing v55 ListingStatistics response into the stable
 * reporting shape used by later storage and dashboard phases. Missing fields
 * stay null so a missing Property24 value cannot be mistaken for zero.
 */
export function normalizeProperty24ListingStatistics(source = {}) {
  const record = source && typeof source === 'object' ? source : {}
  return {
    kind: 'listing',
    listingNumber: statisticCount(record.listingNumber),
    agencyId: statisticCount(record.agencyId),
    statisticDate: statisticText(record.date),
    totalLeads: statisticCount(record.totalLeads),
    price: statisticNumber(record.price),
    streetAddress: record.streetAddress && typeof record.streetAddress === 'object' ? { ...record.streetAddress } : null,
    ...metricValues(record),
    ...diagnostics(record, LISTING_STATISTICS_FIELDS),
    raw: { ...record },
  }
}

/**
 * Converts the v55 agency/suburb summary response without inventing a
 * totalContactLeads value: Property24 does not provide that field on summary
 * rows, so it must remain unavailable rather than be reconstructed.
 */
export function normalizeProperty24ListingStatisticsSummary(source = {}) {
  const record = source && typeof source === 'object' ? source : {}
  return {
    kind: 'summary',
    periodId: statisticCount(record.periodId),
    agencyId: statisticCount(record.agencyId),
    suburbId: statisticCount(record.suburbId),
    listingType: statisticText(record.listingType),
    propertyCount: statisticCount(record.propertyCount),
    averagePropertyCount: statisticNumber(record.averagePropertyCount),
    totalLeads: statisticCount(record.totalLeads),
    totalContactLeads: null,
    ...metricValues(record),
    ...diagnostics(record, STATISTICS_SUMMARY_FIELDS),
    raw: { ...record },
  }
}

export function getProperty24StatisticsContract() {
  return {
    version: PROPERTY24_STATISTICS_CONTRACT_VERSION,
    metrics: PROPERTY24_STATISTICS_METRICS.map((metric) => ({ ...metric })),
    reportingRules: [...PROPERTY24_STATISTICS_REPORTING_RULES],
  }
}
