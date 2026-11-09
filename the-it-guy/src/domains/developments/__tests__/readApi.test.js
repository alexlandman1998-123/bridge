// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ calls: [], responses: [], tables: {} }))
vi.mock('../../../lib/supabaseClient', () => ({ supabase: { rpc(name, parameters) {
  state.calls.push({ rpc: name, parameters })
  return Promise.resolve(state.responses.shift() || { data: null, error: null })
}, from(table) {
  const call = { table, filters: [] }; state.calls.push(call)
  const query = {}
  for (const method of ['select', 'eq', 'order', 'limit', 'maybeSingle', 'in', 'range', 'is', 'or', 'neq']) query[method] = (...args) => { call.filters.push([method, ...args]); return query }
  query.then = (resolve, reject) => {
    const tableResult = state.tables[table]
    const result = Array.isArray(tableResult) ? tableResult.shift() : tableResult
    return Promise.resolve(result || state.responses.shift() || { data: call.filters.some(([method]) => method === 'maybeSingle') ? null : [], error: null }).then(resolve, reject)
  }
  return query
} } }))
vi.mock('../../../lib/developmentMediaStorage.js', () => ({ refreshDevelopmentMedia: vi.fn(async (_client, rows) => rows) }))
vi.mock('../../../lib/api', () => { throw new Error('Read-only development entry must not load the legacy API') })
import * as reads from '../api.js'
import * as adapter from '../../../lib/developmentDetailApi.js'
import { fetchDevelopmentDetailSection } from '../detailSectionReadApi.js'
import { getKnownMissingOptionalRelations, resetKnownMissingOptionalRelations, rememberMissingOptionalRelation } from '../../../lib/api/shared/schemaReadCompatibility.js'
beforeEach(() => { state.calls = []; state.responses = []; state.tables = {} })

it('opens the overview without optional libraries, histories, analytics or financial reads', async () => {
  state.tables.developments = { data: { id: 'slim-dev', organisation_id: 'org', name: 'Development' }, error: null }
  state.tables.units = { data: [{ id: 'unit', development_id: 'slim-dev', unit_number: '1', status: 'Available' }], error: null }
  const result = await reads.fetchDevelopmentDetail('slim-dev', { deferOptionalData: true })
  const coreCalls = [...state.calls]
  expect(result.rows).toHaveLength(1)
  expect(result.rows[0]).toHaveProperty('documentSummary')
  expect(result).toHaveProperty('settings')
  expect(result.financials).toBeUndefined()
  expect(result.documents).toBeUndefined()
  const deferredTables = ['development_financials', 'development_documents', 'development_marketing_access', 'development_marketing_activity', 'development_unit_types', 'development_floorplans', 'development_price_books', 'development_unit_prices', 'development_structure_nodes', 'alteration_requests']
  expect(coreCalls.filter(call => deferredTables.includes(call.table) || call.rpc === 'get_development_visual_analytics')).toEqual([])
  state.calls = []
  const full = await reads.fetchDevelopmentDetail('complete-dev')
  expect(full.rows).toEqual(result.rows)
  expect(full.financials).toBeDefined()
  expect(full.documents).toEqual([])
  expect(state.calls.length - coreCalls.length).toBeGreaterThanOrEqual(12)
  console.info(`Development fixture reads: complete=${state.calls.length}, core=${coreCalls.length}`)
})

it('reads only the requested section and keeps its development scope', async () => {
  state.tables.development_financials = { data: { development_id: 'dev', land_cost: '123' }, error: null }
  state.tables.alteration_requests = { data: [{ id: 'change', amount_inc_vat: 50 }], error: null }
  expect(await fetchDevelopmentDetailSection('dev', 'financials')).toMatchObject({ financials: { landCost: 123 }, alterations: [{ id: 'change' }] })
  expect(state.calls.map(call => call.table)).toEqual(['development_financials', 'alteration_requests'])
  for (const call of state.calls) expect(call.filters).toContainEqual(['eq', 'development_id', 'dev'])
  state.calls = []
  await fetchDevelopmentDetailSection('dev', 'catalogue')
  expect(state.calls.map(call => call.table).sort()).toEqual(['development_unit_types', 'development_floorplans', 'development_price_books', 'development_unit_prices', 'development_structure_nodes'].sort())
  for (const call of state.calls) expect(call.filters).toContainEqual(['eq', 'development_id', 'dev'])
  await expect(fetchDevelopmentDetailSection('dev', 'unknown')).rejects.toThrow('Unknown development detail section')
})

it('isolates a document-library failure from the opening overview', async () => {
  state.tables.developments = { data: { id: 'doc-failure-dev', name: 'Development' }, error: null }
  state.tables.development_documents = { data: null, error: new Error('Library temporarily unavailable') }
  expect(await reads.fetchDevelopmentDetail('doc-failure-dev', { deferOptionalData: true })).toHaveProperty('development.id', 'doc-failure-dev')
  await expect(fetchDevelopmentDetailSection('doc-failure-dev', 'documents')).rejects.toThrow('Library temporarily unavailable')
})

it.each([
  ['fetchDevelopmentDocumentRequirements', 'document_requirements'],
  ['fetchDevelopmentMarketingAccess', 'development_marketing_access'],
  ['fetchDevelopmentMarketingActivity', 'development_marketing_activity'],
])('keeps %s scoped to the requested development', async (name, table) => {
  await reads[name]('development-one')
  expect(state.calls[0].table).toBe(table)
  expect(state.calls[0].filters).toContainEqual(['eq', 'development_id', 'development-one'])
})
it('keeps event ownership filters and mapping unchanged', async () => {
  state.responses.push({ data: [{ id: 'event', event_type: 'launch', title: 'Launch' }], error: null })
  expect(await adapter.fetchDevelopmentMarketingEvents('dev', 'org')).toMatchObject([{ id: 'event', eventType: 'launch' }])
  expect(state.calls[0].filters).toContainEqual(['eq', 'organisation_id', 'org'])
  expect(state.calls[0].filters).toContainEqual(['eq', 'subject_id', 'dev'])
})
it('uses the small read entry for website analytics without importing the legacy API', async () => {
  await adapter.fetchDevelopmentVisualAnalytics('dev', { days: 7 })
  expect(state.calls[0]).toEqual({ rpc: 'get_development_visual_analytics', parameters: { requested_development_id: 'dev', requested_days: 7 } })
})
it('preserves financial defaults and numeric mapping', async () => {
  state.responses.push({ data: { land_cost: '150', notes: 'Original' }, error: null })
  expect(await reads.fetchDevelopmentFinancials('dev')).toMatchObject({ developmentId: 'dev', landCost: 150, notes: 'Original' })
})
it('preserves missing-schema and denied access handling, but propagates genuine failures', async () => {
  state.responses.push({ data: null, error: { code: '42501', message: 'Permission denied' } })
  expect(await reads.fetchDevelopmentMarketingAccess('dev')).toEqual([])
  state.responses.push({ data: null, error: new Error('Connection failed') })
  await expect(reads.fetchDevelopmentMarketingAccess('dev')).rejects.toThrow('Connection failed')
})

it('loads a complete development through the read boundary without importing the legacy API', async () => {
  state.tables.developments = { data: { id: 'dev', organisation_id: 'org', name: 'Development', snag_tracking_enabled: true, alterations_enabled: true }, error: null }
  state.tables.units = { data: [{ id: 'unit', development_id: 'dev', unit_number: '1', status: 'Available' }], error: null }
  const result = await adapter.fetchDevelopmentDetail('dev')
  expect(result.development.name).toBe('Development')
  expect(result.rows).toHaveLength(1)
  expect(result.rows[0].unit.id).toBe('unit')
  expect(result).toMatchObject({ transactionRows: [], documents: [], listings: [], alterations: [] })
  expect(result.settings).toMatchObject({ snag_reporting_enabled: true, alteration_requests_enabled: true })
  expect(state.calls.find((call) => call.table === 'units').filters).toContainEqual(['eq', 'development_id', 'dev'])
  expect(state.calls.find((call) => call.table === 'private_listings').filters).toContainEqual(['eq', 'development_id', 'dev'])
})

it('preserves the older development-column fallback and optional-table defaults', async () => {
  state.tables.developments = [
    { data: null, error: { code: '42703', message: 'column code does not exist' } },
    { data: { id: 'dev', name: 'Legacy' }, error: null },
  ]
  state.tables.development_financials = { data: null, error: { code: '42P01', message: 'relation does not exist' } }
  const result = await reads.fetchDevelopmentDetail('dev')
  expect(result.development.name).toBe('Legacy')
  expect(result.financials.developmentId).toBe('dev')
  const queries = state.calls.filter((call) => call.table === 'developments')
  expect(queries[1].filters).toContainEqual(['select', 'id, name, planned_units'])
  expect(queries[1].filters).toContainEqual(['eq', 'id', 'dev'])
})

it('returns no detail when neither the row nor the authorised portfolio exposes it', async () => {
  expect(await reads.fetchDevelopmentDetail('unavailable')).toBeNull()
})

it('propagates development access failures', async () => {
  const error = { code: '42501', message: 'Permission denied' }
  state.tables.developments = { data: null, error }
  await expect(reads.fetchDevelopmentDetail('dev')).rejects.toEqual(error)
})

it('reads settings and role-player configuration without requiring workflow code', async () => {
  expect(await reads.fetchDevelopmentSettings('')).toHaveProperty('client_portal_enabled')
  expect(await reads.fetchDevelopmentAttorneyConfig('dev')).toHaveProperty('developmentId', 'dev')
  expect(await reads.fetchDevelopmentBondConfig('dev')).toHaveProperty('developmentId', 'dev')
})

it('loads linked-listing covers through the small read service', async () => {
  const listingId = '11111111-1111-4111-8111-111111111111'
  state.tables.developments = { data: { id: 'dev', name: 'Development' }, error: null }
  state.tables.private_listings = { data: [{ id: listingId, development_id: 'dev', status: 'draft' }], error: null }
  state.tables.listing_media = { data: [{ listing_id: listingId, file_url: 'https://example.test/cover.jpg', media_type: 'image', is_cover: true }], error: null }
  const result = await reads.fetchDevelopmentDetail('dev')
  expect(result.listings).toMatchObject([{ id: listingId, coverImageUrl: 'https://example.test/cover.jpg' }])
  expect(state.calls.find((call) => call.table === 'listing_media').filters).toContainEqual(['in', 'listing_id', [listingId]])
})

it('reads developer partner options with the existing organisation scope', async () => {
  const organisationId = '11111111-1111-4111-8111-111111111111'
  expect(await adapter.fetchDeveloperPartnersWorkspace({ organisationId })).toMatchObject({ schemaReady: true, relationships: [], defaults: [] })
  expect(state.calls.find((call) => call.table === 'developer_partner_relationships').filters).toContainEqual(['eq', 'developer_organisation_id', organisationId])
  expect(state.calls.find((call) => call.table === 'organisation_preferred_partners').filters).toContainEqual(['eq', 'organisation_id', organisationId])
})

it('keeps the partner-schema fallback distinct from network errors', async () => {
  const organisationId = '11111111-1111-4111-8111-111111111111'
  state.tables.developer_partner_relationships = { data: null, error: { code: '42P01', message: 'relation does not exist' } }
  expect(await reads.fetchDeveloperPartnersWorkspace({ organisationId })).toMatchObject({ schemaReady: false, relationships: [] })
  state.tables.developer_partner_relationships = { data: null, error: new Error('Offline') }
  await expect(reads.fetchDeveloperPartnersWorkspace({ organisationId })).rejects.toThrow('Offline')
})

it('preserves missing-relation cache resets and excludes permission errors', () => {
  resetKnownMissingOptionalRelations()
  expect(rememberMissingOptionalRelation('document_requests', { code: '42501', message: 'Permission denied' })).toBe(false)
  expect(getKnownMissingOptionalRelations()).toEqual([])
  expect(rememberMissingOptionalRelation('document_requests', { code: '42P01' })).toBe(true)
  expect(getKnownMissingOptionalRelations()).toEqual(['document_requests'])
  resetKnownMissingOptionalRelations()
  expect(getKnownMissingOptionalRelations()).toEqual([])
})

it('filters archived development documents before spending work refreshing their media', async () => {
  const { refreshDevelopmentMedia } = await import('../../../lib/developmentMediaStorage.js')
  vi.mocked(refreshDevelopmentMedia).mockClear()
  state.tables.development_documents = { data: [{ id: 'current', title: 'Current', document_type: 'marketing' }, { id: 'archived', title: 'Previous', document_type: 'marketing', archived_at: '2026-11-01T12:00:00Z' }], error: null }
  const documents = await reads.fetchDevelopmentDocuments('development-one')
  expect(documents.map(row => row.id)).toEqual(['current'])
  expect(refreshDevelopmentMedia.mock.calls.at(-1)[1].map(row => row.id)).toEqual(['current'])
})

it('keeps explicit history reads available for archived development documents', async () => {
  state.tables.development_documents = { data: [{ id: 'current', title: 'Current', document_type: 'marketing' }, { id: 'archived', title: 'Previous', document_type: 'marketing', archived_at: '2026-11-01T12:00:00Z' }], error: null }
  const documents = await reads.fetchDevelopmentDocuments('development-one', { includeHistory: true })
  expect(documents.map(row => row.id)).toEqual(['current', 'archived'])
})
