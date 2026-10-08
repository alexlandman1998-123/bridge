import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ from: vi.fn(), send: vi.fn(), activity: vi.fn(), lead: {} }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: fixture.from }, invokeEdgeFunction: fixture.send }))
vi.mock('../../lib/agencyCrmRepository', () => ({ createAgencyCrmLeadActivity: fixture.activity }))
vi.mock('../universalAssignmentService', () => ({ recordUniversalAssignmentEvent: vi.fn().mockResolvedValue({}), UNIVERSAL_ASSIGNMENT_METHODS: {} }))
import { autoAssignLead } from '../leadAssignmentService'
const organisationId = '11111111-1111-4111-8111-111111111111'
const leadId = '22222222-2222-4222-8222-222222222222'
const agentId = '33333333-3333-4333-8333-333333333333'
beforeEach(() => {
  fixture.lead = { lead_id: leadId, organisation_id: organisationId, listing_id: '44444444-4444-4444-8444-444444444444' }
  fixture.send.mockReset().mockResolvedValue({ data: { ok: true }, error: null })
  fixture.activity.mockReset().mockResolvedValue({})
  fixture.from.mockReset().mockImplementation((table) => {
    let inserted
    const query = { select: () => query, eq: () => query, in: () => query, or: () => query, limit: () => query,
      insert: (value) => { inserted = value; return query }, update: (value) => { fixture.lead = { ...fixture.lead, ...value }; return query },
      maybeSingle: async () => ({ data: table === 'leads' ? fixture.lead : table === 'private_listings' ? { assigned_agent_id: agentId } : table === 'organisation_users' ? { user_id: agentId, email: 'agent@example.com', first_name: 'Casey' } : null, error: null }),
      single: async () => ({ data: table === 'leads' ? fixture.lead : inserted, error: null }),
    }
    return query
  })
})
it('saves automatic assignment and its activity without an extra email during new-lead ingestion', async () => {
  const result = await autoAssignLead({ organisationId, leadId }, { notifyAgentEmail: false })
  expect(result.lead.assignedAgentId).toBe(agentId)
  expect(fixture.activity).toHaveBeenCalledTimes(1)
  expect(fixture.send).not.toHaveBeenCalled()
})
it('keeps the usual assignment email for callers outside the new-lead flow', async () => {
  const result = await autoAssignLead({ organisationId, leadId })
  expect(result.lead.assignedAgentId).toBe(agentId)
  expect(fixture.send).toHaveBeenCalledTimes(1)
  expect(fixture.send.mock.calls[0][1].body).toMatchObject({ to: 'agent@example.com', type: 'lead_assigned' })
})
