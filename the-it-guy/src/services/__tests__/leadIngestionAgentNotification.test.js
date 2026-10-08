import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ from: vi.fn(), create: vi.fn(), assign: vi.fn(), send: vi.fn(), acknowledge: vi.fn(), reused: false, duplicate: false }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: fixture.from, functions: { invoke: fixture.acknowledge } }, invokeEdgeFunction: fixture.send }))
vi.mock('../../lib/agencyCrmRepository', () => ({ createAgencyCrmLeadRecord: fixture.create, createAgencyCrmLeadActivity: vi.fn().mockResolvedValue({}), createAgencyCrmLeadTask: vi.fn().mockResolvedValue({}), updateAgencyCrmContactRecord: vi.fn() }))
vi.mock('../leadAssignmentService', () => ({ autoAssignLead: fixture.assign }))
vi.mock('../leadRequirementService', () => ({ listLeadRequirements: vi.fn().mockResolvedValue([]), createLeadRequirement: vi.fn().mockResolvedValue({}) }))
vi.mock('../leadListingInterestService', () => ({ upsertLeadListingInterest: vi.fn().mockResolvedValue({}) }))
vi.mock('../developerLeadService', () => ({ createAgencyIntroducedDeveloperLead: vi.fn() }))
import { createOrUpdateLeadFromEnquiry } from '../leadIngestionService'

const organisationId = '11111111-1111-4111-8111-111111111111'
const contactId = '22222222-2222-4222-8222-222222222222'
const leadId = '33333333-3333-4333-8333-333333333333'
const initialAgent = '44444444-4444-4444-8444-444444444444'
const finalAgent = '55555555-5555-4555-8555-555555555555'
const request = { organisationId, source: 'Property24', externalReference: 'p24-one', name: 'Taylor Buyer', phone: '0820000000', assignedAgent: { id: initialAgent, email: 'initial@example.com' }, leadCategory: 'buyer' }
const options = { createInitialTask: false, createLeadRecommendation: false }
beforeEach(() => {
  fixture.reused = false
  fixture.duplicate = false
  fixture.send.mockReset().mockResolvedValue({ data: { ok: true, sent: true }, error: null })
  fixture.acknowledge.mockReset().mockResolvedValue({ data: { ok: true }, error: null })
  fixture.create.mockReset().mockResolvedValue({ leadId, contactId, organisationId, assignedAgentId: initialAgent, assignedAgentEmail: 'initial@example.com' })
  fixture.assign.mockReset().mockResolvedValue({ lead: { assignedAgentId: finalAgent, assignedAgentEmail: 'final@example.com' } })
  fixture.from.mockReset().mockImplementation((table) => {
    let inserted
    const query = {
      select: () => query, eq: () => query, ilike: () => query, in: () => query, limit: () => query, order: () => query,
      insert: (value) => { inserted = value; return query }, update: (value) => { inserted = value; return query },
      maybeSingle: async () => ({ data: table === 'lead_ingestion_logs' && fixture.duplicate ? { log_id: contactId, status: 'processed', lead_id: leadId, contact_id: contactId } : table === 'contacts' && fixture.reused ? { contact_id: contactId, first_name: 'Taylor', phone: request.phone } : table === 'leads' && fixture.reused ? { lead_id: leadId, contact_id: contactId, assigned_agent_id: initialAgent } : null, error: null }),
      single: async () => ({ data: inserted, error: null }),
      then: (resolve) => Promise.resolve({ data: table === 'leads' && fixture.reused ? [{ lead_id: leadId, contact_id: contactId, assigned_agent_id: initialAgent }] : [], error: null }).then(resolve),
    }
    return query
  })
})
it('notifies the final assignee for a phone-only enquiry and defers both preliminary emails', async () => {
  const result = await createOrUpdateLeadFromEnquiry(request, options)
  expect(result.ok).toBe(true)
  expect(fixture.create.mock.calls[0][2]).toMatchObject({ notifyAgent: false })
  expect(fixture.assign.mock.calls[0][1]).toMatchObject({ notifyAgentEmail: false })
  expect(fixture.acknowledge).not.toHaveBeenCalled()
  expect(fixture.send).toHaveBeenCalledTimes(1)
  expect(fixture.send.mock.calls[0][1].body).toMatchObject({ to: 'final@example.com', assignedUserId: finalAgent, leadPhone: request.phone, leadName: 'Taylor Buyer' })
})
it('does not lose the final agent alert when the customer acknowledgement throws', async () => {
  fixture.acknowledge.mockRejectedValue(new Error('ack transport failed'))
  const result = await createOrUpdateLeadFromEnquiry({ ...request, email: 'buyer@example.com' }, options)
  expect(result.ok).toBe(true)
  expect(fixture.send).toHaveBeenCalledTimes(1)
  expect(result.warning).toMatch(/buyer acknowledgement/)
})
it('does not send a new-lead alert when matching an existing lead, and retains reassignment alerts', async () => {
  fixture.reused = true
  const result = await createOrUpdateLeadFromEnquiry(request, options)
  expect(result.reusedLead).toBe(true)
  expect(fixture.assign.mock.calls[0][1]).toMatchObject({ notifyAgentEmail: true })
  expect(fixture.send).not.toHaveBeenCalled()
})
it('does not reassign or email a previously completed external enquiry', async () => {
  fixture.duplicate = true
  const result = await createOrUpdateLeadFromEnquiry(request, options)
  expect(result.status).toBe('duplicate')
  expect(fixture.assign).not.toHaveBeenCalled()
  expect(fixture.send).not.toHaveBeenCalled()
})
