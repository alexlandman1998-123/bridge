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

export function normalizeProperty24ApiVersion(value = 'v53') {
  const normalized = normalizeProperty24Text(value).toLowerCase().replace(/^\/?listing\//, '').replace(/^v?/, 'v')
  if (!/^v\d+$/.test(normalized)) throw new Error('Property24 API version must use the form vNN, for example v55.')
  return normalized
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
    'errorMessage',
    'errors',
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
  apiVersion = 'v53',
  timeoutMs = PROPERTY24_DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.')
  const normalizedBaseUrl = normalizeProperty24BaseUrl(baseUrl)
  const normalizedApiVersion = normalizeProperty24ApiVersion(apiVersion)
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

  const listingPath = (suffix) => `/listing/${normalizedApiVersion}${suffix}`

  return {
    baseUrl: normalizedBaseUrl,
    apiVersion: normalizedApiVersion,
    request,
    echo: (stringToEcho = 'Arch9 Property24 Phase 1 smoke test') =>
      request(listingPath('/echo'), { params: { stringToEcho } }),
    echoAuthenticated: (stringToEcho = 'Arch9 Property24 authenticated smoke test') =>
      request(listingPath('/echo-authenticated'), { params: { stringToEcho } }),
    fetchAgencies: (franchiseId) =>
      request(listingPath('/agencies'), { params: { franchiseId } }),
    fetchAgency: (agencyId) =>
      request(listingPath(`/agencies/${encodeURIComponent(String(agencyId))}`)),
    fetchAgencyAgents: (agencyId) =>
      request(listingPath(`/agencies/${encodeURIComponent(String(agencyId))}/agents`)),
    createAgent: (agent) =>
      request(listingPath('/agents'), { method: 'POST', body: agent }),
    updateAgent: (agent) =>
      request(listingPath('/agents'), { method: 'PUT', body: agent }),
    updateAgentProfilePicture: (agentId, profilePicture) =>
      request(listingPath(`/agents/${encodeURIComponent(String(agentId))}/profile-picture`), {
        method: 'PUT',
        body: profilePicture,
      }),
    saveListing: (listing) =>
      request(listingPath('/listings'), { method: 'POST', body: listing }),
    fetchCountries: () =>
      request(listingPath('/countries')),
    fetchProvinces: (countryId) =>
      request(listingPath('/provinces'), { params: { countryId } }),
    fetchCities: (provinceId) =>
      request(listingPath('/cities'), { params: { provinceId } }),
    fetchSuburbs: (cityId) =>
      request(listingPath('/suburbs'), { params: { cityId } }),
    findSuburb: ({ countryName, provinceName, cityName, suburbName } = {}) =>
      request(listingPath('/suburbs/find'), { params: { countryName, provinceName, cityName, suburbName } }),
    findSuburbFromPoint: ({ latitude, longitude } = {}) =>
      request(listingPath('/suburbs/find-from-point'), { params: { latitude, longitude } }),
    fetchPropertyTypes: (countryId) =>
      request(listingPath('/property-types'), { params: { countryId } }),
    fetchListingTypes: (countryId) =>
      request(listingPath('/listing-types'), { params: { countryId } }),
    checkListingOnPortal: (listingNumber) =>
      request(listingPath(`/listings/${encodeURIComponent(String(listingNumber))}/is-on-portal`)),
    updateListingStatus: (listingNumber, listingStatus) =>
      request(listingPath(`/listings/${encodeURIComponent(String(listingNumber))}/status`), {
        method: 'PUT',
        params: { listingStatus },
      }),
    fetchListingReconciliation: ({ agencyId, agentId } = {}) =>
      request(listingPath('/listings/reconciliation'), { params: { agencyId, agentId } }),
    fetchListingUpdates: (fromDate) =>
      request(listingPath('/listings/updates'), { params: { fromDate } }),
    fetchListingLeads: ({ after } = {}) =>
      request(listingPath('/listings/leads'), { params: { after } }),
    fetchListingLeadsForListing: (listingNumber, { startDate, endDate } = {}) =>
      request(listingPath(`/listings/${encodeURIComponent(String(listingNumber))}/leads`), {
        params: { startDate, endDate },
      }),
    fetchAgencyListingStatistics: ({ agencyIds, listingType, startDate, endDate } = {}) =>
      request(listingPath('/listings/statistics'), {
        params: { agencyIds, listingType, startDate, endDate },
      }),
    fetchListingStatistics: (listingNumber, { startDate, endDate } = {}) =>
      request(listingPath(`/listings/${encodeURIComponent(String(listingNumber))}/statistics`), {
        params: { startDate, endDate },
      }),
    fetchLeadStatisticsPeriods: () =>
      request(listingPath('/listings/leads/statistics-periods')),
    fetchLeadStatistics: ({ periodIds, listingType, agencyIds, suburbIds } = {}) =>
      request(listingPath('/listings/leads/statistics'), {
        params: { periodIds, listingType, agencyIds, suburbIds },
      }),
    fetchStatisticsLastUpdateDate: () =>
      request(listingPath('/statistics/last-update-date')),
  }
}
