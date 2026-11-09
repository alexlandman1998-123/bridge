// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ calls: [], results: {}, overviewCalls: [] }))
vi.mock('../../../lib/supabaseClient', () => ({
  DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
  supabase: { from(table) {
    const call = { table, filters: [] }
    state.calls.push(call)
    const query = {}
    for (const method of ['select', 'eq', 'neq', 'in', 'ilike', 'order', 'limit', 'maybeSingle', 'is', 'or', 'range', 'not']) {
      query[method] = (...args) => { call.filters.push([method, ...args]); return query }
    }
    query.then = (resolve, reject) => {
      const source = state.results[table]
      const result = typeof source === 'function' ? source(call) : Array.isArray(source) ? source.shift() : source
      return Promise.resolve(result || { data: call.filters.some(([method]) => method === 'maybeSingle') ? null : [], error: null }).then(resolve, reject)
    }
    return query
  } },
}))
vi.mock('../../../lib/documentAccess.js', () => ({ createFreshDocumentSignedUrl: vi.fn(async () => 'https://private.test/signed') }))
vi.mock('../../../lib/developmentMediaStorage.js', () => ({ refreshDevelopmentMedia: vi.fn(async (_client, rows) => rows) }))
vi.mock('../../reporting/api.js', () => ({ fetchDashboardOverview: vi.fn(async (options) => {
  state.overviewCalls.push(options)
  return { rows: [], metrics: {}, developmentSummaries: [] }
}) }))
vi.mock('../../../lib/api.js', () => { throw new Error('Separated reads must not load the legacy API') })

import { supabase } from '../../../lib/supabaseClient'
import { createFreshDocumentSignedUrl } from '../../../lib/documentAccess.js'
import { fetchDevelopmentOptions, fetchUnitsForTransactionSetup, fetchDevelopmentParticipants, fetchAssignedDevelopmentIdsForRole, invalidateDevelopmentOptionsCache } from '../../developments/selectionReadApi.js'
import { fetchDevelopmentsData } from '../../developments/portfolioReadApi.js'
import { fetchTransactionRouteCoreById } from '../workspaceReadApi.js'
import { fetchTransactionRouteCoreById as adapterRead } from '../../../lib/transactionWorkspaceApi.js'
import { invalidateTransactionWorkspaceCoreCache, unitWorkspaceShellCache, transactionRouteCoreCache, unitSummaryCache, unitSummaryInFlight } from '../readCache.js'
import { fetchUnitsDataSummary, fetchTransactionsData } from '../listReadApi.js'
import { fetchTransactionEvents, fetchTransactionProxyUpdates } from '../activityReadApi.js'
import { fetchDocumentsByUnit, fetchDocumentsData, loadSharedDocuments, getSignedUrl } from '../../documents/listReadApi.js'
import { resetKnownMissingOptionalRelations } from '../../../lib/api/shared/schemaReadCompatibility.js'

beforeEach(() => {
  state.calls = []; state.results = {}; state.overviewCalls = []
  invalidateDevelopmentOptionsCache()
  for (const cache of [unitWorkspaceShellCache, transactionRouteCoreCache, unitSummaryCache, unitSummaryInFlight]) cache.clear()
  resetKnownMissingOptionalRelations()
  vi.clearAllMocks()
})
afterEach(() => vi.restoreAllMocks())

it('keeps development options and reservation defaults scoped to requested IDs', async () => {
  state.results.developments = { data: [{ id: 'dev', total_units_expected: '4' }], error: null }
  state.results.development_settings = { data: [{ development_id: 'dev', reservation_deposit_enabled_by_default: true, reservation_deposit_amount: '5000' }], error: null }
  expect(await fetchDevelopmentOptions({ developmentIds: ['dev', 'dev'] })).toMatchObject([{ id: 'dev', planned_units: 4, reservation_deposit_amount: 5000 }])
  expect(state.calls[0].filters).toContainEqual(['in', 'id', ['dev']])
})

it('does not broaden an organisation with no developments into an unscoped read', async () => {
  expect(await fetchDevelopmentOptions({ organisationId: 'org' })).toEqual([])
  expect(state.calls).toHaveLength(2)
  for (const call of state.calls) expect(call.filters).toContainEqual(['eq', 'organisation_id', 'org'])
})

it('shares pending selector reads, returns copies and uses the same invalidation cache', async () => {
  let resolveRows
  state.results.developments = () => new Promise((resolve) => { resolveRows = resolve })
  const first = fetchDevelopmentOptions(), second = fetchDevelopmentOptions()
  await vi.waitFor(() => expect(resolveRows).toBeTypeOf('function'))
  resolveRows({ data: [{ id: 'dev', name: 'Development' }], error: null })
  const [left, right] = await Promise.all([first, second])
  expect(left).toEqual(right)
  expect(left[0]).not.toBe(right[0])
  expect(state.calls.filter((call) => call.table === 'developments')).toHaveLength(1)
  const count = state.calls.length
  await fetchDevelopmentOptions()
  expect(state.calls).toHaveLength(count)
  invalidateDevelopmentOptionsCache()
  state.results.developments = { data: [], error: null }
  await fetchDevelopmentOptions()
  expect(state.calls.length).toBeGreaterThan(count)
})

it('keeps selector error handling and older-column fallback', async () => {
  state.results.developments = [
    { data: null, error: { code: '42703', message: 'column organisation_id does not exist' } },
    { data: [{ id: 'dev', name: 'Legacy' }], error: null },
  ]
  expect(await fetchDevelopmentOptions({ developmentIds: ['dev'] })).toMatchObject([{ id: 'dev', planned_units: null }])
  expect(state.calls[1].filters).toContainEqual(['in', 'id', ['dev']])
  state.results.developments = { data: null, error: new Error('Offline') }
  await expect(fetchDevelopmentOptions({ developmentIds: ['other'] })).rejects.toThrow('Offline')
})

it('keeps unit choices tied to their development and active buyer', async () => {
  state.results.units = { data: [{ id: 'unit', development_id: 'dev', unit_number: '1' }], error: null }
  state.results.transactions = { data: [{ id: 'tx', unit_id: 'unit', buyer_id: 'buyer', stage: 'OTP Signed', finance_type: 'bond' }], error: null }
  state.results.buyers = { data: [{ id: 'buyer', name: 'Buyer' }], error: null }
  expect(await fetchUnitsForTransactionSetup('dev')).toMatchObject([{ activeTransaction: { id: 'tx', buyerName: 'Buyer' } }])
  expect(state.calls[0].filters).toContainEqual(['eq', 'development_id', 'dev'])
})

it('preserves assignment identity and role filtering', async () => {
  state.results.development_participants = { data: [
    { id: 'one', development_id: 'dev', user_id: 'agent', role_type: 'agent', is_active: true },
    { id: 'two', development_id: 'other', user_id: 'agent', role_type: 'developer', is_active: true },
  ], error: null }
  expect(await fetchAssignedDevelopmentIdsForRole({ userId: 'agent', roleType: 'agent' })).toEqual(['dev'])
  expect(state.calls[0].filters).toContainEqual(['eq', 'user_id', 'agent'])
  expect(await fetchDevelopmentParticipants('dev', { roleType: 'agent' })).toMatchObject([{ developmentId: 'dev', roleType: 'agent' }])
  expect(state.calls.find((call) => call.filters.some(([method]) => method === 'in')).filters).toContainEqual(['in', 'development_id', ['dev']])
})

it('uses the relationship-scoped portfolio without requesting secondary workspaces', async () => {
  state.results.development_organisation_relationships = { data: [{ development_id: 'dev' }], error: null }
  state.results.developments = { data: [{ id: 'dev', name: 'Development', planned_units: 4 }], error: null }
  expect(await fetchDevelopmentsData({ organisationId: 'org' })).toMatchObject({ developments: [{ id: 'dev', name: 'Development' }] })
  expect(state.overviewCalls).toEqual([{ organisationId: 'org', includeSecondaryData: false }])
  expect(state.calls.find((call) => call.table === 'developments').filters).toContainEqual(['in', 'id', ['dev']])
})

it('routes first-load transaction reads directly and shares cache invalidation', async () => {
  state.results.transactions = { data: { id: 'tx', stage: 'OTP Signed', buyer: { id: 'buyer', name: 'Buyer' } }, error: null }
  const first = await adapterRead('tx')
  expect(first).toMatchObject({ transaction: { id: 'tx' }, buyer: { name: 'Buyer' }, __isRouteCore: true })
  expect(adapterRead).toBe(fetchTransactionRouteCoreById)
  expect(state.calls).toHaveLength(1)
  expect(await fetchTransactionRouteCoreById('tx')).toBe(first)
  expect(state.calls).toHaveLength(1)
  unitWorkspaceShellCache.set('tx', first)
  invalidateTransactionWorkspaceCoreCache('tx')
  expect(unitWorkspaceShellCache.has('tx')).toBe(false)
  await fetchTransactionRouteCoreById('tx')
  expect(state.calls).toHaveLength(2)
})

it('preserves transaction route access errors instead of falling back to broader data', async () => {
  const error = { code: '42501', message: 'Permission denied' }
  state.results.transactions = { data: null, error }
  await expect(fetchTransactionRouteCoreById('tx')).rejects.toEqual(error)
  expect(state.calls).toHaveLength(1)
})

it('retains the transaction-summary cache and handles empty transaction lists', async () => {
  expect(await fetchUnitsDataSummary({ developmentId: 'dev' })).toEqual([])
  const count = state.calls.length
  expect(await fetchUnitsDataSummary({ developmentId: 'dev' })).toEqual([])
  expect(state.calls).toHaveLength(count)
  expect(await fetchTransactionsData({ developmentId: 'dev' })).toEqual([])
})

it('does not query documents when the scoped organisation has no units', async () => {
  expect(await fetchDocumentsByUnit({ organisationId: 'org' })).toEqual([])
  expect(state.calls.some((call) => call.table === 'documents')).toBe(false)
  expect(await fetchDocumentsData({ developmentId: 'dev' })).toEqual([])
})

it('preserves document viewer filtering before signing', async () => {
  state.results.documents = { data: [
    { id: 'hidden', transaction_id: 'tx', name: 'Internal', file_path: 'internal.pdf', visibility_scope: 'internal' },
    { id: 'shared', transaction_id: 'tx', name: 'Shared', file_path: 'shared.pdf', visibility_scope: 'shared', is_client_visible: true },
  ], error: null }
  const rows = await loadSharedDocuments(supabase, { transactionIds: ['tx'], viewer: 'client' })
  expect(rows.map((row) => row.id)).toEqual(['shared'])
  expect(createFreshDocumentSignedUrl).toHaveBeenCalledTimes(1)
  expect(createFreshDocumentSignedUrl.mock.calls[0][0]).toMatchObject({ filePath: 'shared.pdf', client: supabase })
})

it('keeps final signed portal documents as path-free descriptors', async () => {
  state.results.documents = [
    { data: [], error: null },
    { data: [{ id: 'final', transaction_id: 'tx', stage_key: 'final_signed', file_path: 'private.pdf', visibility_scope: 'shared', is_client_visible: true }], error: null },
  ]
  const rows = await loadSharedDocuments(supabase, { transactionIds: ['tx'], viewer: 'client', clientPortalFinalArtifactDescriptors: true })
  expect(rows).toMatchObject([{ finalDocumentId: 'final', canonicalFinalArtifact: true, file_path: '', url: '' }])
  expect(createFreshDocumentSignedUrl).not.toHaveBeenCalled()
  const finalSelect = state.calls[1].filters.find(([method]) => method === 'select')[1]
  expect(finalSelect).not.toMatch(/file_path|file_bucket|file_url/)
})

it('never constructs a public document URL after a signing failure', async () => {
  createFreshDocumentSignedUrl.mockRejectedValueOnce(new Error('Denied'))
  expect(await getSignedUrl('private.pdf', { client: supabase })).toBeNull()
})

it('keeps activity reads bounded and scoped to their transaction', async () => {
  state.results.transaction_events = { data: [{ id: 'event', transaction_id: 'tx', event_type: 'created' }], error: null }
  expect(await fetchTransactionEvents('tx', { limit: 5 })).toMatchObject([{ id: 'event', transactionId: 'tx' }])
  expect(state.calls[0].filters).toContainEqual(['eq', 'transaction_id', 'tx'])
  expect(state.calls[0].filters).toContainEqual(['limit', 5])
})

it('negative-caches missing proxy tables but propagates denied reads', async () => {
  state.results.transaction_proxy_updates = { data: null, error: { code: '42P01' } }
  expect(await fetchTransactionProxyUpdates('tx')).toEqual([])
  expect(await fetchTransactionProxyUpdates('tx')).toEqual([])
  expect(state.calls).toHaveLength(1)
  resetKnownMissingOptionalRelations()
  const denied = { code: '42501', message: 'Permission denied' }
  state.results.transaction_proxy_updates = { data: null, error: denied }
  await expect(fetchTransactionProxyUpdates('tx')).rejects.toEqual(denied)
})
