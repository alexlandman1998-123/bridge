import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ operations: [], failLead: false, send: vi.fn(), from: vi.fn() }))
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: fixture.from }, invokeEdgeFunction: fixture.send }))
vi.mock('../agencyPipelineService', () => ({
  reconcileAgencyPipelineSnapshot: (_org, value) => value,
  getAgencyPipelineSnapshot: vi.fn(), deleteLeadActivity: vi.fn(), deleteAgencyLead: vi.fn(), deleteLeadTask: vi.fn(), updateAgencyContact: vi.fn(), updateLeadActivity: vi.fn(), updateAgencyLead: vi.fn(), updateLeadTask: vi.fn(),
}))
vi.mock('../agencyCrmUpdateBus', () => ({ emitAgencyCrmUpdated: vi.fn() }))
import { createAgencyCrmLeadRecord } from '../agencyCrmRepository'

const organisationId = '11111111-1111-4111-8111-111111111111'
const agentId = '33333333-3333-4333-8333-333333333333'
const actor = { id: '44444444-4444-4444-8444-444444444444', email: 'manager@example.com', name: 'Manager' }
function payload(agent = { id: agentId, email: 'agent@example.com', name: 'Casey Agent' }) {
  return { contact: { firstName: 'Taylor', lastName: 'Buyer', phone: '0820000000' }, assignedAgent: agent, lead: { leadCategory: 'Buyer', leadSource: 'Walk-in' } }
}
beforeEach(() => {
  fixture.operations = []
  fixture.failLead = false
  fixture.send.mockReset().mockImplementation(async (_name, options) => {
    fixture.operations.push({ type: 'email', payload: options.body })
    return { data: { ok: true, sent: true }, error: null }
  })
  fixture.from.mockReset().mockImplementation((table) => {
    let row
    const query = {
      upsert: (value) => { row = value; return query }, select: () => query, eq: () => query, in: () => query, limit: () => query,
      maybeSingle: async () => ({ data: { user_id: agentId, email: 'looked-up-agent@example.com', first_name: 'Casey', last_name: 'Agent' }, error: null }),
      single: async () => {
        fixture.operations.push({ type: table })
        return { data: row, error: table === 'leads' && fixture.failLead ? new Error('Lead save failed') : null }
      },
    }
    return query
  })
})
it('alerts the assignee only after verifying both saved records', async () => {
  const lead = await createAgencyCrmLeadRecord(organisationId, payload(), { actor })
  await vi.waitFor(() => expect(fixture.send).toHaveBeenCalledTimes(1))
  expect(fixture.operations.map((op) => op.type)).toEqual(['contacts', 'leads', 'email'])
  expect(fixture.operations[2].payload).toMatchObject({ to: 'agent@example.com', leadId: lead.leadId, leadName: 'Taylor Buyer', leadPhone: '0820000000' })
})
it('does not email for a failed lead save', async () => {
  fixture.failLead = true
  await expect(createAgencyCrmLeadRecord(organisationId, payload(), { actor })).rejects.toThrow(/Lead save failed/)
  expect(fixture.send).not.toHaveBeenCalled()
})
it('leaves a saved lead successful when email delivery fails', async () => {
  fixture.send.mockResolvedValue({ data: null, error: new Error('Provider unavailable') })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const lead = await createAgencyCrmLeadRecord(organisationId, payload(), { actor })
    expect(lead.leadId).toBeTruthy()
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
  } finally { warn.mockRestore() }
})
it('defers notification during ingestion and persistence repairs', async () => {
  await createAgencyCrmLeadRecord(organisationId, payload(), { actor, notifyAgent: false })
  expect(fixture.send).not.toHaveBeenCalled()
})
it('resolves an assignee missing an email instead of using the creating manager email', async () => {
  await createAgencyCrmLeadRecord(organisationId, payload({ id: agentId }), { actor })
  await vi.waitFor(() => expect(fixture.send).toHaveBeenCalledTimes(1))
  expect(fixture.send.mock.calls[0][1].body.to).toBe('looked-up-agent@example.com')
})
