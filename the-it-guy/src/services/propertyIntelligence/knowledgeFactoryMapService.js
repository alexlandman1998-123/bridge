import { getEdgeFunctionInvokeError, invokeEdgeFunction, supabase } from '../../lib/supabaseClient'

function text(value = '') {
  return String(value || '').trim()
}

function isJwt(value = '') {
  return /^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/.test(text(value))
}

function tokenShape(value = '') {
  const token = text(value)
  return { length: token.length, segments: token ? token.split('.').length : 0, jwt: isJwt(token) }
}

function encodeSessionToken(value = '') {
  return window.btoa(text(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function resolveMapAccessToken(accessToken = '') {
  // A workspace bootstrap can briefly retain a non-Supabase placeholder token.
  // Never forward it to the server. Prefer a live stored session, and give its
  // refresh token one chance to obtain a current access JWT.
  console.info('[KF map] supplied session token shape', tokenShape(accessToken))
  if (isJwt(accessToken)) return text(accessToken)
  const current = await supabase.auth.getSession()
  const storedToken = text(current?.data?.session?.access_token)
  console.info('[KF map] stored session token shape', tokenShape(storedToken))
  if (isJwt(storedToken)) return storedToken
  const refreshed = await supabase.auth.refreshSession()
  const refreshedToken = text(refreshed?.data?.session?.access_token)
  console.info('[KF map] refreshed session token shape', tokenShape(refreshedToken))
  if (isJwt(refreshedToken)) return refreshedToken
  throw new Error('Your sign-in session is no longer valid. Please sign in again.')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function assertOrganisationId(organisationId = '') {
  const value = text(organisationId)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Select a valid organisation workspace before using property intelligence.')
  }
  return value
}

async function call(body, accessToken = '') {
  // Parcel map requests must leave through the Cape Town Vercel Function. The
  // report workflow remains on its existing gated path until its separate
  // supplier calls are migrated as a follow-up.
  if (body?.action === 'status' || body?.action === 'map_properties') {
    // The workspace bootstrap already holds the live session in memory. Use it
    // when supplied, then fall back to Supabase storage for ordinary callers.
    const token = await resolveMapAccessToken(accessToken)
    const response = await fetch('/api/knowledge-factory/map', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-arch9-session-token-encoded': encodeSessionToken(token) } : {}),
      },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(text(data.error) || `Property intelligence request failed (${response.status}).`)
    return data || {}
  }
  const result = await invokeEdgeFunction('knowledge-factory-graphql', { body })
  if (result.error) throw new Error(getEdgeFunctionInvokeError(result).message)
  return result.data || {}
}

export async function getKnowledgeFactoryMapStatus({ organisationId, accessToken } = {}) {
  return call({ action: 'status', organisationId: assertOrganisationId(organisationId) }, accessToken)
}

export async function searchKnowledgeFactoryMap({ organisationId, purpose, bounds, accessToken } = {}) {
  const normalizedPurpose = text(purpose)
  if (normalizedPurpose.length < 10) throw new Error('Provide a specific canvassing purpose before searching the map.')
  return call({
    action: 'map_properties',
    organisationId: assertOrganisationId(organisationId),
    purpose: normalizedPurpose,
    bounds,
  }, accessToken)
}

function normalizeReportTypes(values = []) {
  const requested = [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))]
  const supported = new Set(['property_summary', 'municipal_valuation'])
  if (!requested.length || requested.some((value) => !supported.has(value))) throw new Error('Select one or more supported report sections.')
  return requested
}

export async function quoteKnowledgeFactoryReport({ organisationId, purpose, propertyId, reportTypes } = {}) {
  const normalizedPurpose = text(purpose)
  const normalizedPropertyId = text(propertyId)
  if (normalizedPurpose.length < 10) throw new Error('Provide a report purpose of at least 10 characters.')
  if (!/^[1-9]\d{0,14}$/.test(normalizedPropertyId)) throw new Error('Enter a valid property ID.')
  return call({
    action: 'quote_property_report',
    organisationId: assertOrganisationId(organisationId),
    purpose: normalizedPurpose,
    propertyId: normalizedPropertyId,
    reportTypes: normalizeReportTypes(reportTypes),
  })
}

export async function requestKnowledgeFactoryReport({ organisationId, purpose, quoteId } = {}) {
  const normalizedPurpose = text(purpose)
  if (normalizedPurpose.length < 10) throw new Error('Provide a report purpose of at least 10 characters.')
  if (!UUID.test(text(quoteId))) throw new Error('A valid property report quote is required.')
  return call({ action: 'request_property_report', organisationId: assertOrganisationId(organisationId), purpose: normalizedPurpose, quoteId: text(quoteId) })
}

export async function listKnowledgeFactoryReports({ organisationId } = {}) {
  return call({ action: 'list_property_reports', organisationId: assertOrganisationId(organisationId) })
}
