import { getEdgeFunctionInvokeError, invokeEdgeFunction } from '../../lib/supabaseClient'

function text(value = '') {
  return String(value || '').trim()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function assertOrganisationId(organisationId = '') {
  const value = text(organisationId)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Select a valid organisation workspace before using property intelligence.')
  }
  return value
}

async function call(body) {
  const result = await invokeEdgeFunction('knowledge-factory-graphql', { body })
  if (result.error) throw new Error(getEdgeFunctionInvokeError(result).message)
  return result.data || {}
}

export async function getKnowledgeFactoryMapStatus({ organisationId } = {}) {
  return call({ action: 'status', organisationId: assertOrganisationId(organisationId) })
}

export async function searchKnowledgeFactoryMap({ organisationId, purpose, bounds } = {}) {
  const normalizedPurpose = text(purpose)
  if (normalizedPurpose.length < 10) throw new Error('Provide a specific canvassing purpose before searching the map.')
  return call({
    action: 'map_properties',
    organisationId: assertOrganisationId(organisationId),
    purpose: normalizedPurpose,
    bounds,
  })
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
