import { getPublicListings } from './publicListingsService.js'
import { writeNodeJsonResponse } from './hqMissionControlApi.js'

function normalizeMethod(value = '') {
  return String(value || 'GET').trim().toUpperCase()
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function buildJsonResponse(status, body, headers = {}) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      ...headers,
    },
    body,
  }
}

function getRequestUrl(url = '', headers = {}) {
  const host = normalizeText(headers.host || headers.Host) || 'www.arch9.co.za'
  const protocol = normalizeText(headers['x-forwarded-proto'] || headers['X-Forwarded-Proto']) || 'https'
  return new URL(url || '/api/public/listings', `${protocol}://${host}`)
}

function getPublicHost(headers = {}) {
  const host = normalizeText(headers.host || headers.Host) || 'www.arch9.co.za'
  const protocol = normalizeText(headers['x-forwarded-proto'] || headers['X-Forwarded-Proto']) || 'https'
  if (host === 'app.arch9.co.za') return 'https://www.arch9.co.za'
  return `${protocol}://${host}`
}

export async function createPublicListingsResponse({ method = 'GET', url = '', headers = {} } = {}) {
  const normalizedMethod = normalizeMethod(method)

  if (normalizedMethod === 'OPTIONS') {
    return {
      status: 204,
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
      body: null,
    }
  }

  const isHeadRequest = normalizedMethod === 'HEAD'

  if (normalizedMethod !== 'GET' && !isHeadRequest) {
    return buildJsonResponse(405, {
      error: 'method_not_allowed',
      message: 'Public listings only supports GET.',
    }, { 'Cache-Control': 'no-store' })
  }

  try {
    const requestUrl = getRequestUrl(url, headers)
    const params = requestUrl.searchParams
    const result = await getPublicListings({
      host: getPublicHost(headers),
      slug: params.get('slug'),
      q: params.get('q'),
      listingType: params.get('listingType'),
      propertyType: params.get('propertyType'),
      suburb: params.get('suburb'),
      city: params.get('city'),
      province: params.get('province'),
      minPrice: params.get('minPrice'),
      maxPrice: params.get('maxPrice'),
      bedrooms: params.get('bedrooms'),
      bathrooms: params.get('bathrooms'),
      limit: params.get('limit'),
      offset: params.get('offset'),
    })

    if (params.get('slug') && !result.listing) {
      return buildJsonResponse(404, {
        error: 'listing_not_found',
        message: 'This listing is not published or could not be found.',
      }, { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' })
    }

    return buildJsonResponse(200, isHeadRequest ? null : result)
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 500)
    return buildJsonResponse(status, {
      error: error?.code || 'public_listings_error',
      message: status >= 500 ? 'Public listings could not be loaded.' : error?.message || 'Public listings request failed.',
    }, { 'Cache-Control': 'no-store' })
  }
}

export { writeNodeJsonResponse }
