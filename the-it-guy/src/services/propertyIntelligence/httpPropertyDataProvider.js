import { normalizePropertySearchFilters, normalizeRequestedReportTypes } from './propertyDataProviderContract'

const DEFAULT_TIMEOUT_MS = 15000

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeBaseUrl(value, { allowInsecureLocalhost = false } = {}) {
  const raw = normalizeText(value)
  if (!raw) throw new Error('The property data API base URL is required for API mode.')
  if (raw.startsWith('/')) return raw.replace(/\/+$/, '')

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('The property data API base URL must be a relative path or a valid HTTPS URL.')
  }
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !(allowInsecureLocalhost && isLocalhost)) {
    throw new Error('The property data API must use HTTPS outside local development.')
  }
  return raw.replace(/\/+$/, '')
}

function queryString(values = {}) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return
    params.set(key, String(value))
  })
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

function errorMessage(payload, status) {
  const message = normalizeText(payload?.message || payload?.error)
  if (message) return message.slice(0, 300)
  return `Property data request failed with status ${status}.`
}

export function createHttpPropertyDataProvider({
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  allowInsecureLocalhost = false,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required for property data API mode.')
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl, { allowInsecureLocalhost })
  const requestTimeoutMs = Math.max(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 1000)

  async function request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
        method,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Arch9-Property-Client': 'canvassing-v1',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(errorMessage(payload, response.status))
      if (!payload || typeof payload !== 'object') throw new Error('The property data API returned an invalid response.')
      return payload
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('The property data provider timed out. Please try again.')
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async function searchProperties(filters = {}) {
    return request(`/properties/search${queryString(normalizePropertySearchFilters(filters))}`)
  }

  async function getPropertiesInBounds(bounds = {}, filters = {}) {
    const viewportBounds = bounds && typeof bounds === 'object' ? bounds : {}
    const normalizedFilters = normalizePropertySearchFilters(filters)
    return request(`/properties/bounds${queryString({
      ...normalizedFilters,
      north: viewportBounds.north,
      south: viewportBounds.south,
      east: viewportBounds.east,
      west: viewportBounds.west,
    })}`)
  }

  async function getPropertyPreview(propertyId) {
    const id = normalizeText(propertyId)
    if (!id) throw new Error('A property is required before loading its preview.')
    return request(`/properties/${encodeURIComponent(id)}`)
  }

  async function priceReports({ propertyIds = [], reportTypes = [] } = {}) {
    return request('/reports/price', {
      method: 'POST',
      body: { propertyIds, reportTypes: normalizeRequestedReportTypes(reportTypes) },
    })
  }

  async function requestReports(payload = {}) {
    return request('/reports/orders', {
      method: 'POST',
      body: { ...payload, reportTypes: normalizeRequestedReportTypes(payload.reportTypes) },
    })
  }

  async function getReportOrders({ organisationId = '' } = {}) {
    return request(`/reports/orders${queryString({ organisationId: normalizeText(organisationId) })}`)
  }

  async function getReportOrder(orderId) {
    const id = normalizeText(orderId)
    if (!id) throw new Error('A property report order is required.')
    return request(`/reports/orders/${encodeURIComponent(id)}`)
  }

  return Object.freeze({
    providerId: 'arch9_property_api',
    providerName: 'Arch9 property API',
    mode: 'api',
    isDemoData: false,
    defaultBounds: null,
    apiBaseUrl: normalizedBaseUrl,
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
