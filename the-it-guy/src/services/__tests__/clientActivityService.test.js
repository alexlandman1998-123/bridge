import { beforeEach, expect, test, vi } from 'vitest'
import { clientActivityRecordPath, loadClientActivity, loadLatestClientActivity, logClientInteraction, recordClientPortalVisit } from '../clientActivityService'
const transport = vi.hoisted(() => ({ rpc: vi.fn() }))
const scoped = vi.hoisted(() => ({ rpc: vi.fn() }))
const scopedFactory = vi.hoisted(() => vi.fn(() => scoped))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: transport, createScopedSupabaseClient: scopedFactory }))
beforeEach(() => { vi.clearAllMocks(); transport.rpc.mockResolvedValue({ data: [], error: null }); scoped.rpc.mockResolvedValue({ error: null }) })
const client = { identityId: 'client-a', organisationId: 'agency-a' }

test('timeline uses the server-resolved profile, category and stable time/ID cursor', async () => {
  transport.rpc.mockResolvedValue({ data: [{ id: 'new', occurred_at: '2026-10-09T12:00:00Z' }, { id: 'old', occurred_at: '2026-10-08T12:00:00Z' }], error: null })
  const result = await loadClientActivity(client, { category: 'appointment', pageSize: 1, cursor: { id: 'previous', occurred_at: '2026-10-10T12:00:00Z' } })
  expect(transport.rpc).toHaveBeenCalledWith('agency_client_activity_page', { p_client_id: 'client-a', p_category: 'appointment', p_limit: 2, p_before_id: 'previous', p_before_at: '2026-10-10T12:00:00Z' })
  expect(result.events.map(event => event.id)).toEqual(['new'])
  expect(result.nextCursor).toEqual({ id: 'new', occurred_at: '2026-10-09T12:00:00Z' })
})

test('missing setup is explicit, while permission/network errors stay visible', async () => {
  transport.rpc.mockResolvedValue({ error: { code: 'PGRST202' } })
  expect((await loadClientActivity(client)).available).toBe(false)
  transport.rpc.mockResolvedValue({ error: { code: '42501', message: 'Access denied' } })
  await expect(loadClientActivity(client)).rejects.toMatchObject({ code: '42501' })
  expect((await loadClientActivity({})).available).toBe(false)
})

test('latest activity paginates beyond the server row limit and scopes the agency', async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ client_id: `client-${i}`, last_activity_at: '2026-10-09T12:00:00Z' }))
  const query = { order: vi.fn(), range: vi.fn((start, end) => Promise.resolve({ data: rows.slice(start, end + 1), error: null })) }
  query.order.mockReturnValue(query)
  transport.rpc.mockReturnValue(query)
  const result = await loadLatestClientActivity('agency-a')
  expect(result.size).toBe(1001)
  expect(transport.rpc).toHaveBeenCalledWith('agency_client_activity_latest', { p_organisation_id: 'agency-a' })
  expect(query.range.mock.calls).toEqual([[0,499],[500,999],[1000,1499]])
})

test('interaction commands retain the request ID and never nominate an actor or agency', async () => {
  transport.rpc.mockResolvedValue({ data: 'saved', error: null })
  await logClientInteraction(client, { type: 'call', detail: ' Confirmed viewing ', occurredAt: '2026-10-09T12:00:00Z', requestId: 'command' })
  expect(transport.rpc).toHaveBeenCalledWith('agency_client_log_interaction', { p_client_id: 'client-a', p_request_id: 'command', p_type: 'call', p_detail: 'Confirmed viewing', p_occurred_at: '2026-10-09T12:00:00Z' })
  transport.rpc.mockClear()
  await expect(logClientInteraction(client, { type: 'call', detail: '' })).rejects.toThrow('valid time')
  expect(transport.rpc).not.toHaveBeenCalled()
})

test('portal telemetry only accepts known actions and sends credentials through scoped access', async () => {
  const result = await recordClientPortalVisit({ token: 'test-token', sellerAccessToken: 'test-session', section: 'documents', requestId: 'command' })
  expect(result.recorded).toBe(true)
  expect(scopedFactory).toHaveBeenCalledWith({ 'x-bridge-client-portal-token': 'test-token', 'x-bridge-seller-portal-access-token': 'test-session' })
  expect(scoped.rpc).toHaveBeenCalledWith('agency_client_record_portal_visit', { p_token: 'test-token', p_seller_access_token: 'test-session', p_section: 'documents', p_request_id: 'command' })
  scoped.rpc.mockClear()
  expect((await recordClientPortalVisit({ token: 'test-token', section: '/url-containing-token', requestId: 'command' })).recorded).toBe(false)
  expect(scoped.rpc).not.toHaveBeenCalled()
  scoped.rpc.mockResolvedValue({ error: { code: '42501' } })
  expect((await recordClientPortalVisit({ token: 'test-token', section: 'overview', requestId: 'command' })).recorded).toBe(false)
})

test('record links follow the existing agency workspace routes', () => {
  expect(clientActivityRecordPath({ source_kind: 'lead', source_id: 'lead' })).toBe('/pipeline/leads/lead')
  expect(clientActivityRecordPath({ source_kind: 'listing_seller', source_id: 'listing' })).toBe('/agent/listings/listing')
  expect(clientActivityRecordPath({ source_kind: 'transaction_buyer', source_id: 'matter' })).toBe('/transactions/matter')
  expect(clientActivityRecordPath({ source_kind: null })).toBeNull()
})
