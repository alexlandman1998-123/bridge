export const PROPERTY24_EXDEV_BASE_URL = 'https://api.exdev.property24-test.com'
export const PROPERTY24_DEFAULT_TIMEOUT_MS = 25000

export class Property24HttpError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'Property24HttpError'
    this.status = details.status || null
    this.statusText = details.statusText || ''
    this.method = details.method || 'GET'
    this.path = details.path || ''
    this.responseBody = details.responseBody || null
  }
}

export function normalizeProperty24Text(value = '') {
  return String(value || '').trim()
}

export function normalizeProperty24BaseUrl(value = PROPERTY24_EXDEV_BASE_URL) {
  const baseUrl = normalizeProperty24Text(value) || PROPERTY24_EXDEV_BASE_URL
  return baseUrl.replace(/\/+$/g, '')
}

export function buildProperty24BasicAuthHeader(username, password) {
  const user = normalizeProperty24Text(username)
  const pass = normalizeProperty24Text(password)
  if (!user || !pass) throw new Error('Property24 username and password are required.')
  return `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`
}

export function appendProperty24Query(url, params = {}) {
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      url.searchParams.delete(key)
      for (const item of value) {
        if (item === undefined || item === null || item === '') continue
        url.searchParams.append(key, String(item))
      }
    } else {
      url.searchParams.set(key, String(value))
    }
  }
  return url
}

export function summarizeProperty24Payload(payload, sampleLimit = 3) {
  if (Array.isArray(payload)) {
    return {
      type: 'array',
      count: payload.length,
      sample: payload.slice(0, sampleLimit).map(summarizeProperty24Record),
    }
  }

  if (payload && typeof payload === 'object') {
    return {
      type: 'object',
      keys: Object.keys(payload).sort(),
      sample: summarizeProperty24Record(payload),
    }
  }

  return {
    type: typeof payload,
    value: typeof payload === 'string' ? payload.slice(0, 120) : payload,
  }
}

function summarizeProperty24Record(record = {}) {
  if (!record || typeof record !== 'object') return record
  const safeKeys = [
    'id',
    'agencyId',
    'agentId',
    'listingNumber',
    'name',
    'firstname',
    'lastname',
    'description',
    'emailAddress',
    'sourceReference',
    'status',
    'countryId',
    'provinceId',
    'cityId',
    'suburbId',
  ]
  return Object.fromEntries(
    safeKeys
      .filter((key) => record[key] !== undefined && record[key] !== null && record[key] !== '')
      .map((key) => [key, record[key]]),
  )
}

export function createProperty24Client({
  baseUrl = PROPERTY24_EXDEV_BASE_URL,
  username,
  password,
  userGroupId,
  timeoutMs = PROPERTY24_DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.')
  const normalizedBaseUrl = normalizeProperty24BaseUrl(baseUrl)
  const authorization = buildProperty24BasicAuthHeader(username, password)
  const normalizedUserGroupId = normalizeProperty24Text(userGroupId)

  async function request(path, { method = 'GET', params = {}, body, headers = {} } = {}) {
    const normalizedPath = normalizeProperty24Text(path)
    if (!normalizedPath.startsWith('/')) throw new Error(`Property24 path must start with "/": ${normalizedPath}`)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const startedAt = Date.now()
    const url = appendProperty24Query(new URL(`${normalizedBaseUrl}${normalizedPath}`), params)

    try {
      const response = await fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: authorization,
          ...(normalizedUserGroupId ? { 'P24-UserGroupId': normalizedUserGroupId } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      const contentType = response.headers?.get?.('content-type') || ''
      const responseBody = contentType.includes('json')
        ? await response.json().catch(() => null)
        : await response.text().catch(() => '')

      if (!response.ok) {
        throw new Property24HttpError(`Property24 ${method} ${normalizedPath} failed with ${response.status}.`, {
          status: response.status,
          statusText: response.statusText,
          method,
          path: normalizedPath,
          responseBody,
        })
      }

      return {
        ok: true,
        status: response.status,
        durationMs: Date.now() - startedAt,
        data: responseBody,
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Property24HttpError(`Property24 ${method} ${normalizedPath} timed out after ${timeoutMs}ms.`, {
          method,
          path: normalizedPath,
        })
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    baseUrl: normalizedBaseUrl,
    request,
    echo: (stringToEcho = 'Arch9 Property24 Phase 1 smoke test') =>
      request('/listing/v53/echo', { params: { stringToEcho } }),
    echoAuthenticated: (stringToEcho = 'Arch9 Property24 authenticated smoke test') =>
      request('/listing/v53/echo-authenticated', { params: { stringToEcho } }),
    fetchAgencies: (franchiseId) =>
      request('/listing/v53/agencies', { params: { franchiseId } }),
    fetchAgency: (agencyId) =>
      request(`/listing/v53/agencies/${encodeURIComponent(String(agencyId))}`),
    fetchAgencyAgents: (agencyId) =>
      request(`/listing/v53/agencies/${encodeURIComponent(String(agencyId))}/agents`),
    createAgent: (agent) =>
      request('/listing/v53/agents', { method: 'POST', body: agent }),
    updateAgent: (agent) =>
      request('/listing/v53/agents', { method: 'PUT', body: agent }),
    updateAgentProfilePicture: (agentId, profilePicture) =>
      request(`/listing/v53/agents/${encodeURIComponent(String(agentId))}/profile-picture`, {
        method: 'PUT',
        body: profilePicture,
      }),
    saveListing: (listing) =>
      request('/listing/v53/listings', { method: 'POST', body: listing }),
    fetchCountries: () =>
      request('/listing/v53/countries'),
    fetchProvinces: (countryId) =>
      request('/listing/v53/provinces', { params: { countryId } }),
    fetchCities: (provinceId) =>
      request('/listing/v53/cities', { params: { provinceId } }),
    fetchSuburbs: (cityId) =>
      request('/listing/v53/suburbs', { params: { cityId } }),
    findSuburb: ({ countryName, provinceName, cityName, suburbName } = {}) =>
      request('/listing/v53/suburbs/find', { params: { countryName, provinceName, cityName, suburbName } }),
    findSuburbFromPoint: ({ latitude, longitude } = {}) =>
      request('/listing/v53/suburbs/find-from-point', { params: { latitude, longitude } }),
    fetchPropertyTypes: (countryId) =>
      request('/listing/v53/property-types', { params: { countryId } }),
    fetchListingTypes: (countryId) =>
      request('/listing/v53/listing-types', { params: { countryId } }),
    checkListingOnPortal: (listingNumber) =>
      request(`/listing/v53/listings/${encodeURIComponent(String(listingNumber))}/is-on-portal`),
    updateListingStatus: (listingNumber, listingStatus) =>
      request(`/listing/v53/listings/${encodeURIComponent(String(listingNumber))}/status`, {
        method: 'PUT',
        params: { listingStatus },
      }),
    fetchListingReconciliation: ({ agencyId, agentId } = {}) =>
      request('/listing/v53/listings/reconciliation', { params: { agencyId, agentId } }),
    fetchListingUpdates: (fromDate) =>
      request('/listing/v53/listings/updates', { params: { fromDate } }),
    fetchListingLeads: ({ after } = {}) =>
      request('/listing/v53/listings/leads', { params: { after } }),
    fetchListingLeadsForListing: (listingNumber, { startDate, endDate } = {}) =>
      request(`/listing/v53/listings/${encodeURIComponent(String(listingNumber))}/leads`, {
        params: { startDate, endDate },
      }),
    fetchAgencyListingStatistics: ({ agencyIds, listingType, startDate, endDate } = {}) =>
      request('/listing/v53/listings/statistics', {
        params: { agencyIds, listingType, startDate, endDate },
      }),
    fetchListingStatistics: (listingNumber, { startDate, endDate } = {}) =>
      request(`/listing/v53/listings/${encodeURIComponent(String(listingNumber))}/statistics`, {
        params: { startDate, endDate },
      }),
    fetchLeadStatisticsPeriods: () =>
      request('/listing/v53/listings/leads/statistics-periods'),
    fetchLeadStatistics: ({ periodIds, listingType, agencyIds, suburbIds } = {}) =>
      request('/listing/v53/listings/leads/statistics', {
        params: { periodIds, listingType, agencyIds, suburbIds },
      }),
    fetchStatisticsLastUpdateDate: () =>
      request('/listing/v53/statistics/last-update-date'),
  }
}
