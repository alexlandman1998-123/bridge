import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), reads: [], results: {} }))
vi.mock('../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: { from: mocks.from } }))
import { fetchDeveloperLeadIntake } from '../developerLeadService.js'

const leadId = '00000000-0000-4000-8000-000000000011'
const developerOrgId = '00000000-0000-4000-8000-000000000001'
beforeEach(() => {
  mocks.reads.length = 0
  mocks.results = {
    developer_leads: { data: { developer_lead_id: leadId, developer_org_id: developerOrgId, lead_owner: 'developer', visibility_state: 'full', lead_status: 'new' }, error: null },
    developer_lead_private_details: { data: [{ developer_lead_id: leadId, buyer_full_name: 'Test Buyer', buyer_email: 'buyer@example.com' }], error: null },
    developer_lead_development_interests: { data: [], error: null },
  }
  mocks.from.mockReset().mockImplementation(table => {
    const read = { table, filters: {} }
    mocks.reads.push(read)
    const query = {
      select: fields => { read.fields = fields; return query },
      eq: (key, value) => { read.filters[key] = value; return query },
      in: (key, value) => { read.filters[key] = value; return query },
      order: () => query,
      maybeSingle: () => Promise.resolve(mocks.results[table]),
      then: (resolve, reject) => Promise.resolve(mocks.results[table]).then(resolve, reject),
    }
    return query
  })
})

it('resolves one authorised lead by ID and returns its owning developer organisation', async () => {
  const result = await fetchDeveloperLeadIntake({ developerLeadId: leadId })
  expect(result.developerOrgId).toBe(developerOrgId)
  expect(result.buyerFullName).toBe('Test Buyer')
  expect(mocks.reads[0]).toMatchObject({ table: 'developer_leads', filters: { developer_lead_id: leadId } })
  expect(mocks.reads[0].filters).not.toHaveProperty('developer_org_id')
  expect(mocks.reads.slice(1).every(read => read.filters.developer_lead_id?.length === 1 && read.filters.developer_lead_id[0] === leadId)).toBe(true)
})

it('does not fetch private details when row policies hide the lead', async () => {
  mocks.results.developer_leads = { data: null, error: null }
  expect(await fetchDeveloperLeadIntake({ developerLeadId: leadId })).toBeNull()
  expect(mocks.reads).toHaveLength(1)
})

it('propagates a denied read without retrying or falling back to a broader query', async () => {
  mocks.results.developer_leads = { data: null, error: { code: '42501', message: 'Permission denied' } }
  await expect(fetchDeveloperLeadIntake({ developerLeadId: leadId })).rejects.toMatchObject({ code: '42501' })
  expect(mocks.reads).toHaveLength(1)
})

it('retains protected agency lead masking before handover', async () => {
  mocks.results.developer_leads.data = { ...mocks.results.developer_leads.data, lead_owner: 'agency', ownership_model: 'agency_introduced', visibility_state: 'protected', source_agency_org_id: '00000000-0000-4000-8000-000000000002' }
  const result = await fetchDeveloperLeadIntake({ developerLeadId: leadId })
  expect(result.buyerEmail).not.toBe('buyer@example.com')
  expect(result.accessProfile.requiresHandoverBeforePrivateDetails).toBe(true)
})

it('rejects invalid identifiers before issuing a query', async () => {
  expect(await fetchDeveloperLeadIntake({ developerLeadId: 'bad-id' })).toBeNull()
  expect(mocks.from).not.toHaveBeenCalled()
})
