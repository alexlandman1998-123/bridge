import { beforeEach, describe, expect, it, vi } from 'vitest'
const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { rpc, from } }))
vi.mock('../envValidation', () => ({ isUnsafeFallbackAllowed: () => false }))
import { listAppointmentsAsync } from '../agencyPipelineService'
const org = '10000000-0000-4000-8000-000000000001'
const lead = '20000000-0000-4000-8000-000000000001'
beforeEach(() => { vi.resetAllMocks() })
describe('lead appointment service', () => {
  it('uses the scoped history reader without date bounds', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    expect(await listAppointmentsAsync(org, { leadId: lead, from: '2026-01-01', to: '2026-12-31' })).toEqual([])
    expect(rpc).toHaveBeenCalledWith('bridge_list_lead_appointments', { p_organisation_id: org, p_lead_id: lead, p_include_all: false })
    expect(from).not.toHaveBeenCalled()
  })
  it('keeps a far-future booking assigned to another agent after the server authorises it', async () => {
    rpc.mockResolvedValue({ data: [{ appointment_id: '40000000-0000-4000-8000-000000000001', organisation_id: org, lead_id: lead, agent_id: '30000000-0000-4000-8000-000000000002', date_time: '2027-10-01T09:40:00Z', appointment_date: '2027-10-01', start_time: '11:40:00', status: 'confirmed' }], error: null })
    from.mockReturnValue({ select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) })
    const rows = await listAppointmentsAsync(org, { leadId: lead, agentId: '30000000-0000-4000-8000-000000000001', from: '2026-01-01', to: '2026-12-31' })
    expect(rows).toHaveLength(1)
    expect(rows[0].leadId).toBe(lead)
    expect(rows[0].dateTime).toContain('2027-10-01')
  })
  it('does not fall back to an unrelated rolling calendar when the migration is missing', async () => {
    const error = { code: 'PGRST202', message: 'History reader unavailable' }
    rpc.mockResolvedValue({ error })
    await expect(listAppointmentsAsync(org, { leadId: lead })).rejects.toEqual(error)
    expect(from).not.toHaveBeenCalled()
  })
  it('keeps navigated calendar ranges in the calendar RPC', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await listAppointmentsAsync(org, { from: '2027-09-24T00:00:00Z', to: '2027-10-09T00:00:00Z' })
    expect(rpc).toHaveBeenCalledWith('bridge_list_calendar_appointments', expect.objectContaining({ p_from: '2027-09-24T00:00:00Z', p_to: '2027-10-09T00:00:00Z' }))
  })
  it('reports malformed successful responses', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await expect(listAppointmentsAsync(org, { leadId: lead })).rejects.toThrow('could not be verified')
  })
})
