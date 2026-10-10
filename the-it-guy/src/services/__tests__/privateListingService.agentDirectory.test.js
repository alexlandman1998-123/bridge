import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ from: vi.fn(), requests: [], rows: [], relatedRows: {} }))
vi.mock('../../lib/supabaseClient', async (importOriginal) => ({
  ...await importOriginal(),
  isSupabaseConfigured: true,
  supabase: { from: fixture.from },
}))
import { getAgentPrivateListings, getOrganisationPrivateListings } from '../privateListingService'

const organisationId = '11111111-1111-4111-8111-111111111111'
const agentId = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  fixture.requests = []
  fixture.relatedRows = {}
  fixture.rows = [{
    id: '33333333-3333-4333-8333-333333333333', organisation_id: organisationId,
    assigned_agent_id: agentId, assigned_agent_email: 'agent@example.test', assigned_agent_name: 'Assigned Agent',
    listing_status: 'active', is_active: true, asking_price: 1250000, estimated_value: 1300000,
    title: 'Directory listing', address_line_1: '12 Test Street', created_at: '2026-10-01T08:00:00Z',
  }]
  fixture.from.mockImplementation((table) => {
    const request = { table, filters: [] }
    fixture.requests.push(request)
    const query = { then(resolve) { return Promise.resolve({ data: table === 'private_listings' ? fixture.rows : fixture.relatedRows[table] || [], error: null, count: fixture.rows.length }).then(resolve) } }
    for (const method of ['select', 'order', 'in', 'not', 'or', 'limit', 'neq']) query[method] = () => query
    query.eq = (field, value) => { request.filters.push([field, value]); return query }
    return query
  })
})

it('reads directory listing metrics in one scoped query without seller or publishing hydration', async () => {
  const listings = await getOrganisationPrivateListings(organisationId, { includeRelatedData: false })
  expect(fixture.requests).toHaveLength(1)
  expect(fixture.requests[0]).toEqual({ table: 'private_listings', filters: expect.arrayContaining([['organisation_id', organisationId]]) })
  expect(listings).toHaveLength(1)
  expect(listings[0]).toMatchObject({
    id: fixture.rows[0].id, assignedAgentId: agentId, assignedAgentEmail: 'agent@example.test',
    assignedAgentName: 'Assigned Agent', askingPrice: 1250000, estimatedValue: 1300000, listingStatus: 'active',
    createdAt: '2026-10-01T08:00:00Z', addressLine1: '12 Test Street',
  })
})

it('retains related reads for existing detail callers', async () => {
  await getOrganisationPrivateListings(organisationId, { includeRequirementsAndDocuments: false })
  const tables = fixture.requests.map((request) => request.table)
  expect(tables).toContain('private_listing_seller_onboarding')
  expect(tables).toContain('listing_publication_data')
  expect(tables).toContain('profiles')
  expect(tables).toHaveLength(5)
})

it('keeps seller contacts and agent assignments while skipping publication queries for clients', async () => {
  fixture.relatedRows = {
    private_listing_seller_onboarding: [{
      id: 'onboarding', private_listing_id: fixture.rows[0].id, status: 'in_progress',
      form_data: { sellerName: 'Existing Seller', sellerEmail: 'seller@example.test', sellerPhone: '0821234567' },
    }],
    profiles: [{ id: agentId, full_name: 'Current Agent Name', email: 'current-agent@example.test' }],
  }
  const listings = await getOrganisationPrivateListings(organisationId, {
    includeRequirementsAndDocuments: false, includeExternalLinks: false, includePublicationDetails: false,
  })
  expect(fixture.requests.map((request) => request.table).sort()).toEqual(['private_listing_seller_onboarding', 'private_listings', 'profiles'].sort())
  expect(listings[0].sellerOnboarding.formData).toMatchObject({ sellerName: 'Existing Seller', sellerEmail: 'seller@example.test' })
  expect(listings[0]).toMatchObject({ assignedAgentName: 'Current Agent Name', assignedAgentEmail: 'current-agent@example.test' })
})

it('omits document hydration for rental cards while retaining scope and distribution details', async () => {
  const listings = await getAgentPrivateListings(agentId, {
    organisationId, includeRequirementsAndDocuments: false, includeMedia: true, requireAvailable: true,
  })
  expect(fixture.requests.map(request => request.table).sort()).toEqual([
    'private_listings', 'private_listing_seller_onboarding', 'listing_external_links',
    'listing_publication_data', 'profiles', 'listing_media',
  ].sort())
  expect(fixture.requests[0].filters).toEqual(expect.arrayContaining([
    ['organisation_id', organisationId], ['assigned_agent_id', agentId],
  ]))
  expect(listings[0]).toMatchObject({ id: fixture.rows[0].id, askingPrice: 1250000 })
})
it('keeps documents available by default for other agent-list callers', async () => {
  await getAgentPrivateListings(agentId, { organisationId })
  const tables = fixture.requests.map(request => request.table)
  expect(tables).toContain('private_listing_document_requirements')
  expect(tables).toContain('private_listing_documents')
})
