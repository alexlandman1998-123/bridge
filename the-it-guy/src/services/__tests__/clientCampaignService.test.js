import { beforeEach, expect, test, vi } from 'vitest'
import { campaignResponseLabel, loadClientCampaigns, logClientCampaignResponse } from '../clientCampaignService'
const transport = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: transport }))
const client = { identityId: 'client-a' }
beforeEach(() => { vi.clearAllMocks() })
test('loads campaign summary with bounded recipient pages and a stable timestamp/ID cursor', async () => {
  transport.rpc.mockImplementation(name => Promise.resolve({ data: name.endsWith('summary') ? { campaignCount: 4 } : [{ id: 'a', created_at: '2026-10-09' }, { id: 'b', created_at: '2026-10-08' }] }))
  const result = await loadClientCampaigns(client, { pageSize: 1, cursor: { created_at: '2026-10-10', id: 'previous' } })
  expect(transport.rpc).toHaveBeenCalledWith('agency_client_campaign_page', { p_client_id: 'client-a', p_before_at: '2026-10-10', p_before_id: 'previous', p_limit: 2 })
  expect(result.campaigns).toHaveLength(1)
  expect(result.nextCursor).toEqual({ created_at: '2026-10-09', id: 'a' })
  expect(result.summary.campaignCount).toBe(4)
})
test('older pages skip summaries and missing setup is distinct from denied access', async () => {
  transport.rpc.mockResolvedValue({ data: [] })
  await loadClientCampaigns(client, { includeSummary: false, pageSize: 1000 })
  expect(transport.rpc).toHaveBeenCalledTimes(1)
  expect(transport.rpc.mock.calls[0][1].p_limit).toBe(101)
  transport.rpc.mockImplementation(name => Promise.resolve({ data: name.endsWith('summary') ? null : [] }))
  await expect(loadClientCampaigns(client)).rejects.toThrow('unavailable')
  transport.rpc.mockResolvedValue({ error: { code: 'PGRST202' } })
  expect((await loadClientCampaigns(client)).available).toBe(false)
  transport.rpc.mockResolvedValue({ error: { code: '42501', message: 'Denied' } })
  await expect(loadClientCampaigns(client)).rejects.toMatchObject({ code: '42501' })
})
test('profiles without permanent identities never call the database', async () => {
  expect((await loadClientCampaigns({})).available).toBe(false)
  await expect(logClientCampaignResponse({})).rejects.toThrow('permanent client')
  expect(transport.rpc).not.toHaveBeenCalled()
})
test('logs only an explicit confirmed response with its retry ID, never sends a message', async () => {
  transport.rpc.mockResolvedValue({ data: 'response-id' })
  const entry = { recipientId: 'recipient', requestId: 'retry-id', kind: 'email_reply', detail: ' Asked about the launch ', occurredAt: '2026-10-09T10:00:00Z' }
  expect(await logClientCampaignResponse(client, entry)).toBe('response-id')
  expect(transport.rpc).toHaveBeenCalledWith('agency_client_log_campaign_response', { p_client_id: 'client-a', p_recipient_id: 'recipient', p_request_id: 'retry-id', p_kind: 'email_reply', p_detail: 'Asked about the launch', p_occurred_at: entry.occurredAt })
  expect(campaignResponseLabel('email_reply')).toBe('Email reply')
  expect(campaignResponseLabel('unknown')).toBe('Response')
})
test('invalid telemetry-as-response, oversized notes and unconfirmed saves are rejected', async () => {
  const entry = { recipientId: 'r', requestId: 'q', kind: 'email_reply', detail: 'Reply', occurredAt: '2026-10-09' }
  for (const invalid of [{ kind: 'opened' }, { detail: 'x'.repeat(4001) }, { occurredAt: 'bad' }, { requestId: null }]) await expect(logClientCampaignResponse(client, { ...entry, ...invalid })).rejects.toThrow('valid time')
  expect(transport.rpc).not.toHaveBeenCalled()
  transport.rpc.mockResolvedValue({ data: null })
  await expect(logClientCampaignResponse(client, entry)).rejects.toThrow('could not be confirmed')
  transport.rpc.mockResolvedValue({ error: { message: 'Denied' } })
  await expect(logClientCampaignResponse(client, entry)).rejects.toMatchObject({ message: 'Denied' })
})
