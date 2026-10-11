import { beforeEach, expect, test, vi } from 'vitest'
import { attributionSourceLabel, loadClientAttribution } from '../clientAttributionService'
const transport = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: transport }))
const client = { identityId: 'client-a' }
beforeEach(() => { vi.clearAllMocks() })

test('reads summary and bounded enquiry pages using the permanent client and timestamp/ID cursor', async () => {
  transport.rpc.mockImplementation(name => Promise.resolve({ data: name.endsWith('summary') ? { enquiryCount: 3 } : [{ id: 'a', occurred_at: '2026-10-09' }, { id: 'b', occurred_at: '2026-10-08' }], error: null }))
  const result = await loadClientAttribution(client, { pageSize: 1, cursor: { id: 'previous', occurred_at: '2026-10-10' } })
  expect(transport.rpc).toHaveBeenCalledWith('agency_client_attribution_page', { p_client_id: 'client-a', p_limit: 2, p_before_at: '2026-10-10', p_before_id: 'previous' })
  expect(transport.rpc).toHaveBeenCalledWith('agency_client_attribution_summary', { p_client_id: 'client-a' })
  expect(result.summary.enquiryCount).toBe(3)
  expect(result.touches).toHaveLength(1)
  expect(result.nextCursor).toEqual({ id: 'a', occurred_at: '2026-10-09' })
})
test('older pages skip summary reloading, while setup errors and denied reads remain distinct', async () => {
  transport.rpc.mockResolvedValue({ data: [], error: null })
  expect((await loadClientAttribution(client, { includeSummary: false })).available).toBe(true)
  expect(transport.rpc).toHaveBeenCalledTimes(1)
  transport.rpc.mockImplementation(name => Promise.resolve({ data: name.endsWith('summary') ? null : [], error: null }))
  await expect(loadClientAttribution(client)).rejects.toThrow('unavailable')
  transport.rpc.mockResolvedValue({ error: { code: 'PGRST202' } })
  expect((await loadClientAttribution(client)).available).toBe(false)
  transport.rpc.mockResolvedValue({ error: { code: '42501', message: 'Access denied' } })
  await expect(loadClientAttribution(client)).rejects.toMatchObject({ code: '42501' })
})
test('unknown sources stay unknown, and profiles without identities never call the database', async () => {
  expect((await loadClientAttribution({})).available).toBe(false)
  expect(transport.rpc).not.toHaveBeenCalled()
  expect(attributionSourceLabel({ utm_source: 'google', source_channel: 'website' })).toBe('google')
  expect(attributionSourceLabel({ source_channel: 'manual' })).toBe('manual')
  expect(attributionSourceLabel({})).toBe('Source not captured')
})
