export const PROPERTY_REPORT_TYPES = Object.freeze({
  deedsSummary: Object.freeze({
    id: 'deeds_summary',
    label: 'Deeds summary',
    description: 'Registered property description and ownership summary.',
    unitPrice: 35,
  }),
  transferHistory: Object.freeze({
    id: 'transfer_history',
    label: 'Transfer history',
    description: 'Transfer dates and recorded consideration values.',
    unitPrice: 20,
  }),
  propertyValuation: Object.freeze({
    id: 'property_valuation',
    label: 'Property valuation',
    description: 'Indicative value and comparable-property summary.',
    unitPrice: 30,
  }),
})

export const PROPERTY_REPORT_TYPE_LIST = Object.freeze(Object.values(PROPERTY_REPORT_TYPES))
export const PROPERTY_REPORT_TYPE_IDS = Object.freeze(PROPERTY_REPORT_TYPE_LIST.map((reportType) => reportType.id))

export const PROPERTY_DATA_PROVIDER_METHODS = Object.freeze([
  'searchProperties',
  'getPropertiesInBounds',
  'getPropertyPreview',
  'priceReports',
  'requestReports',
  'getReportOrders',
  'getReportOrder',
])

export function normalizePropertySearchFilters(filters = {}) {
  const source = filters && typeof filters === 'object' ? filters : {}
  const numericOrNull = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return null
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }

  return {
    query: String(source.query || '').trim(),
    area: String(source.area || '').trim(),
    propertyType: String(source.propertyType || '').trim(),
    transferDateFrom: String(source.transferDateFrom || '').trim(),
    transferDateTo: String(source.transferDateTo || '').trim(),
    minValue: numericOrNull(source.minValue),
    maxValue: numericOrNull(source.maxValue),
    limit: Math.min(Math.max(Number(source.limit) || 100, 1), 500),
  }
}

export function assertPropertyDataProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new Error('A property data provider object is required.')
  }

  const missingMethods = PROPERTY_DATA_PROVIDER_METHODS.filter((method) => typeof provider[method] !== 'function')
  if (missingMethods.length) {
    throw new Error(`Property data provider is missing: ${missingMethods.join(', ')}.`)
  }

  return provider
}

export function normalizeRequestedReportTypes(reportTypes = []) {
  const requested = Array.isArray(reportTypes) ? reportTypes : []
  const normalized = [...new Set(requested.map((value) => String(value || '').trim()).filter(Boolean))]
  const unsupported = normalized.filter((value) => !PROPERTY_REPORT_TYPE_IDS.includes(value))
  if (unsupported.length) throw new Error(`Unsupported property report type: ${unsupported.join(', ')}.`)
  return normalized
}
