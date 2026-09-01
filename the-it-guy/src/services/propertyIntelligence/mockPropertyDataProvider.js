import {
  PROPERTY_REPORT_TYPE_LIST,
  normalizePropertySearchFilters,
  normalizeRequestedReportTypes,
} from './propertyDataProviderContract'
import { MOCK_PROPERTY_DEFAULT_BOUNDS, MOCK_PROPERTY_FIXTURES } from './mockPropertyFixtures'

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function publicProperty(property) {
  const { reportData, ...preview } = property
  return copy(preview)
}

function matchesSearch(property, filters) {
  const query = normalizeKey(filters.query)
  if (query) {
    const searchable = [
      property.address,
      property.formattedAddress,
      property.streetName,
      property.suburb,
      property.city,
      property.province,
      property.erfNumber,
      `Erf ${property.erfNumber}`,
      property.providerPropertyId,
    ].map(normalizeKey).join(' ')
    if (!searchable.includes(query)) return false
  }

  if (filters.area && !normalizeKey(`${property.suburb} ${property.city} ${property.province}`).includes(normalizeKey(filters.area))) return false
  if (filters.propertyType && normalizeKey(property.propertyType) !== normalizeKey(filters.propertyType)) return false
  if (filters.transferDateFrom && property.lastTransferDate < filters.transferDateFrom) return false
  if (filters.transferDateTo && property.lastTransferDate > filters.transferDateTo) return false
  if (filters.minValue !== null && property.indicativeValue < filters.minValue) return false
  if (filters.maxValue !== null && property.indicativeValue > filters.maxValue) return false
  return true
}

function isInsideBounds(property, bounds = {}) {
  const north = Number(bounds.north)
  const south = Number(bounds.south)
  const east = Number(bounds.east)
  const west = Number(bounds.west)
  if (![north, south, east, west].every(Number.isFinite)) return true
  return property.latitude <= north && property.latitude >= south && property.longitude <= east && property.longitude >= west
}

export function createMockPropertyDataProvider({ properties = MOCK_PROPERTY_FIXTURES, now = () => new Date() } = {}) {
  const propertyRows = Array.isArray(properties) ? properties : []
  const reportOrders = []

  function presentReportOrder(order) {
    const currentTime = now()
    const currentTimeMs = currentTime instanceof Date ? currentTime.getTime() : new Date(currentTime).getTime()
    const elapsedMs = Math.max(currentTimeMs - order.requestedAtMs, 0)
    const status = elapsedMs >= 1500 ? 'ready' : elapsedMs >= 600 ? 'processing' : 'queued'
    const { requestedAtMs, ...publicOrder } = order
    return copy({
      ...publicOrder,
      status,
      completedAt: status === 'ready' ? new Date(requestedAtMs + 1500).toISOString() : '',
      propertySummaries: order.propertyIds.map((propertyId) => {
        const property = propertyRows.find((row) => row.id === propertyId)
        const lineItems = order.quote.lineItems.filter((lineItem) => lineItem.propertyId === propertyId)
        return property ? {
          id: property.id,
          address: property.address,
          formattedAddress: property.formattedAddress,
          suburb: property.suburb,
          erfNumber: property.erfNumber,
          propertyType: property.propertyType,
          reportTypes: lineItems.map((lineItem) => lineItem.reportType),
          amount: lineItems.reduce((total, lineItem) => total + lineItem.amount, 0),
          isDemoData: true,
        } : null
      }).filter(Boolean),
    })
  }

  function resolveProperties(propertyIds = []) {
    const requestedIds = [...new Set((Array.isArray(propertyIds) ? propertyIds : []).map((value) => String(value || '').trim()).filter(Boolean))]
    const resolved = requestedIds.map((propertyId) => propertyRows.find((property) => property.id === propertyId)).filter(Boolean)
    if (resolved.length !== requestedIds.length) throw new Error('One or more selected properties could not be found.')
    return resolved
  }

  async function searchProperties(filters = {}) {
    const normalizedFilters = normalizePropertySearchFilters(filters)
    const matchingProperties = propertyRows.filter((property) => matchesSearch(property, normalizedFilters))
    return {
      items: matchingProperties.slice(0, normalizedFilters.limit).map(publicProperty),
      total: matchingProperties.length,
      filters: normalizedFilters,
      providerId: 'arch9_mock_property_data',
      isDemoData: true,
    }
  }

  async function getPropertiesInBounds(bounds = MOCK_PROPERTY_DEFAULT_BOUNDS, filters = {}) {
    const normalizedFilters = normalizePropertySearchFilters(filters)
    const matchingProperties = propertyRows
      .filter((property) => isInsideBounds(property, bounds))
      .filter((property) => matchesSearch(property, normalizedFilters))
    return {
      items: matchingProperties.slice(0, normalizedFilters.limit).map(publicProperty),
      total: matchingProperties.length,
      bounds: copy(bounds),
      providerId: 'arch9_mock_property_data',
      isDemoData: true,
    }
  }

  async function getPropertyPreview(propertyId) {
    const property = propertyRows.find((row) => row.id === String(propertyId || '').trim())
    if (!property) throw new Error('The selected property could not be found.')
    return publicProperty(property)
  }

  async function priceReports({ propertyIds = [], reportTypes = [] } = {}) {
    const selectedProperties = resolveProperties(propertyIds)
    const selectedReportTypes = normalizeRequestedReportTypes(reportTypes)
    if (!selectedProperties.length) throw new Error('Select at least one property before pricing reports.')
    if (!selectedReportTypes.length) throw new Error('Select at least one report type before pricing reports.')

    const lineItems = selectedProperties.flatMap((property) => selectedReportTypes.map((reportTypeId) => {
      if (property.reportAvailability?.[reportTypeId] !== true) return null
      const definition = PROPERTY_REPORT_TYPE_LIST.find((reportType) => reportType.id === reportTypeId)
      return {
        propertyId: property.id,
        propertyAddress: property.formattedAddress,
        reportType: reportTypeId,
        reportLabel: definition.label,
        amount: definition.unitPrice,
      }
    }).filter(Boolean))
    const subtotal = lineItems.reduce((total, lineItem) => total + lineItem.amount, 0)

    return {
      currency: 'ZAR',
      taxExclusive: true,
      lineItems,
      subtotal,
      total: subtotal,
      propertyCount: selectedProperties.length,
      reportCount: lineItems.length,
      isDemoPricing: true,
    }
  }

  async function requestReports(request = {}) {
    const quote = await priceReports(request)
    const selectedProperties = resolveProperties(request.propertyIds)
    const currentTime = now()
    const requestedAtDate = currentTime instanceof Date ? currentTime : new Date(currentTime)
    const requestedAt = requestedAtDate.toISOString()
    const order = {
      id: `mock-report-order-${String(reportOrders.length + 1).padStart(3, '0')}`,
      requestedAt,
      requestedAtMs: requestedAtDate.getTime(),
      requestedBy: String(request.requestedBy || '').trim(),
      requestedByName: String(request.requestedByName || '').trim() || 'Demo agent',
      organisationId: String(request.organisationId || '').trim(),
      propertyIds: selectedProperties.map((property) => property.id),
      reportTypes: normalizeRequestedReportTypes(request.reportTypes),
      quote,
      isDemoData: true,
    }
    reportOrders.unshift(order)
    return presentReportOrder(order)
  }

  async function getReportOrders({ organisationId = '' } = {}) {
    const normalizedOrganisationId = String(organisationId || '').trim()
    const items = normalizedOrganisationId
      ? reportOrders.filter((order) => order.organisationId === normalizedOrganisationId)
      : reportOrders
    return { items: items.map(presentReportOrder), total: items.length, providerId: 'arch9_mock_property_data', isDemoData: true }
  }

  async function getReportOrder(orderId) {
    const order = reportOrders.find((row) => row.id === String(orderId || '').trim())
    if (!order) throw new Error('The selected property report order could not be found.')
    const presentedOrder = presentReportOrder(order)
    if (presentedOrder.status !== 'ready') throw new Error('The selected property reports are not ready yet.')

    const propertyReports = order.propertyIds.map((propertyId) => {
      const property = propertyRows.find((row) => row.id === propertyId)
      if (!property) return null
      const lineItems = order.quote.lineItems.filter((lineItem) => lineItem.propertyId === propertyId)
      const includedReportTypes = lineItems.map((lineItem) => ({ id: lineItem.reportType, label: lineItem.reportLabel }))
      const previousTransferYear = Math.max(Number(property.lastTransferDate.slice(0, 4)) - 7, 2000)
      return {
        id: `${order.id}:${property.id}`,
        orderId: order.id,
        status: 'ready',
        requestedAt: order.requestedAt,
        completedAt: presentedOrder.completedAt,
        requestedBy: order.requestedBy,
        requestedByName: order.requestedByName,
        amount: lineItems.reduce((total, lineItem) => total + lineItem.amount, 0),
        currency: order.quote.currency,
        taxExclusive: order.quote.taxExclusive,
        reportTypes: includedReportTypes,
        property: publicProperty(property),
        deedsSummary: {
          registeredOwner: property.reportData.registeredOwner,
          titleDeedNumber: property.reportData.titleDeedNumber,
          registrationDivision: property.reportData.registrationDivision,
          registeredDescription: `Erf ${property.erfNumber}, Arch9 Demo Estate, Western Cape`,
        },
        transferHistory: [
          {
            transferDate: property.lastTransferDate,
            transferAmount: property.lastTransferAmount,
            titleDeedNumber: property.reportData.titleDeedNumber,
          },
          {
            transferDate: `${previousTransferYear}-06-18`,
            transferAmount: Math.round(property.lastTransferAmount * 0.61),
            titleDeedNumber: `T${Number(property.erfNumber) + 18000}/${previousTransferYear}`,
          },
        ],
        valuation: {
          indicativeValue: property.indicativeValue,
          lowerRange: Math.round(property.indicativeValue * 0.92),
          upperRange: Math.round(property.indicativeValue * 1.08),
          comparablePropertyCount: property.reportData.comparablePropertyCount,
        },
        isDemoData: true,
        demoNotice: 'Fictional property and ownership data for demonstration only.',
      }
    }).filter(Boolean)

    return { ...presentedOrder, propertyReports, isDemoData: true }
  }

  return Object.freeze({
    providerId: 'arch9_mock_property_data',
    providerName: 'Arch9 mock property data',
    mode: 'mock',
    isDemoData: true,
    defaultBounds: MOCK_PROPERTY_DEFAULT_BOUNDS,
    capabilities: Object.freeze({ parcelBoundaries: true, reportPricing: true, reportOrdering: true }),
    searchProperties,
    getPropertiesInBounds,
    getPropertyPreview,
    priceReports,
    requestReports,
    getReportOrders,
    getReportOrder,
  })
}
