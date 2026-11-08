// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { clearAgencyLeadCoreCache, readAgencyLeadCoreCache, writeAgencyLeadCoreCache } from '../agencyLeadCoreCache'
import { clearAgencyLeadWorkspaceSnapshotCache, readAgencyLeadWorkspaceSnapshot, writeAgencyLeadWorkspaceSnapshot } from '../agencyLeadWorkspaceSnapshotCache'
import { clearBuyerLeadWorkspaceDataLoaderCache, loadBuyerLeadWorkspaceData } from '../buyerLeadWorkspaceDataLoader'
import { invalidateAgencyLeadListCache, preloadAgencyLeadCoreRecord } from '../agencyLeadListReadRepository'
import { clearBuyerOfferWorkspaceDataLoaderCache, loadBuyerOfferWorkspaceData } from '../buyerOfferWorkspaceDataLoader'
import { clearBuyerFinanceTransactionDataLoaderCache, loadBuyerFinanceTransactionData } from '../buyerFinanceTransactionDataLoader'
const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('../../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: () => {
  const builder = { select: () => builder, eq: () => builder, limit: () => builder, maybeSingle: () => mocks.read() }
  return builder
} } }))
vi.mock('../../../services/developmentBuyerLeadService.js', () => ({ enrichDevelopmentBuyerLeads: async (_org, leads) => leads }))
const org = '00000000-0000-4000-8000-000000000010'
const leadId = 'buyer'
const snapshot = (version) => ({ leads: [{ leadId, leadCategory: 'buyer', notes: version }] })
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
beforeEach(() => {
  invalidateAgencyLeadListCache()
  clearAgencyLeadCoreCache()
  clearAgencyLeadWorkspaceSnapshotCache()
  clearBuyerLeadWorkspaceDataLoaderCache()
  sessionStorage.clear()
  vi.resetAllMocks()
})
it('does not restore a stale core or remove a replacement request after an edit', async () => {
  const old = deferred(), current = deferred()
  mocks.read.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  const first = preloadAgencyLeadCoreRecord(org, leadId)
  invalidateAgencyLeadListCache(org, leadId)
  const second = preloadAgencyLeadCoreRecord(org, leadId)
  old.resolve({ data: { lead_id: leadId, notes: 'old' } })
  await first
  expect(readAgencyLeadCoreCache(org, leadId)).toBeNull()
  expect(readAgencyLeadWorkspaceSnapshot(org, leadId)).toBeNull()
  const shared = preloadAgencyLeadCoreRecord(org, leadId)
  expect(mocks.read).toHaveBeenCalledTimes(2)
  current.resolve({ data: { lead_id: leadId, notes: 'new' } })
  await Promise.all([second, shared])
  expect(readAgencyLeadCoreCache(org, leadId).lead.notes).toBe('new')
  expect(readAgencyLeadWorkspaceSnapshot(org, leadId).leads[0].notes).toBe('new')
})
it('a cleared buyer request cannot overwrite a fresh result or delete its pending owner', async () => {
  const old = deferred(), current = deferred()
  const fetchWorkspace = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  const args = { organisationId: org, leadId, fetchWorkspace }
  const first = loadBuyerLeadWorkspaceData(args)
  await Promise.resolve()
  clearBuyerLeadWorkspaceDataLoaderCache(org, leadId)
  const second = loadBuyerLeadWorkspaceData(args)
  await Promise.resolve()
  old.resolve(snapshot('old'))
  await first
  expect(loadBuyerLeadWorkspaceData(args)).toBe(second)
  current.resolve(snapshot('new'))
  await second
  expect((await loadBuyerLeadWorkspaceData(args)).leads[0].notes).toBe('new')
  expect(fetchWorkspace).toHaveBeenCalledTimes(2)
})
it('session invalidation removes persisted snapshots and leaves unrelated workspace keys intact', () => {
  writeAgencyLeadWorkspaceSnapshot(org, leadId, snapshot('old'))
  writeAgencyLeadWorkspaceSnapshot('other', leadId, snapshot('other'))
  sessionStorage.setItem('unrelated', 'keep')
  clearAgencyLeadWorkspaceSnapshotCache(org)
  expect(readAgencyLeadWorkspaceSnapshot(org, leadId)).toBeNull()
  expect(readAgencyLeadWorkspaceSnapshot('other', leadId).leads[0].notes).toBe('other')
  expect(sessionStorage.getItem('unrelated')).toBe('keep')
})
it('CRM updates invalidate only the affected buyer; auth reset revokes all lead caches and pending writes', async () => {
  const fetchWorkspace = vi.fn(async (_org, id) => ({ leads: [{ leadId: id, leadCategory: 'buyer' }] }))
  const args = { organisationId: org, leadId, fetchWorkspace }
  await loadBuyerLeadWorkspaceData(args)
  await loadBuyerLeadWorkspaceData({ ...args, leadId: 'other' })
  writeAgencyLeadCoreCache(org, leadId, { lead: snapshot('old').leads[0] })
  writeAgencyLeadWorkspaceSnapshot(org, leadId, snapshot('old'))
  window.dispatchEvent(new CustomEvent('itg:agency-crm-updated', { detail: { organisationId: org, leadId } }))
  expect(readAgencyLeadCoreCache(org, leadId)).toBeNull()
  expect(readAgencyLeadWorkspaceSnapshot(org, leadId)).toBeNull()
  await loadBuyerLeadWorkspaceData(args)
  await loadBuyerLeadWorkspaceData({ ...args, leadId: 'other' })
  expect(fetchWorkspace).toHaveBeenCalledTimes(3)
  const pending = deferred()
  mocks.read.mockReturnValueOnce(pending.promise)
  const preloaded = preloadAgencyLeadCoreRecord(org, leadId)
  window.dispatchEvent(new Event('bridge:workspace-scoped-cache-cleared'))
  pending.resolve({ data: { lead_id: leadId, notes: 'before logout' } })
  await preloaded
  expect(readAgencyLeadCoreCache(org, leadId)).toBeNull()
  expect(readAgencyLeadWorkspaceSnapshot(org, leadId)).toBeNull()
  await loadBuyerLeadWorkspaceData({ ...args, leadId: 'other' })
  expect(fetchWorkspace).toHaveBeenCalledTimes(4)
})
it('clears persisted snapshots even after a module reload loses its in-memory entries', async () => {
  sessionStorage.setItem(`arch9:lead-workspace-snapshot:${org}:buyer`, JSON.stringify(snapshot('persisted')))
  clearAgencyLeadWorkspaceSnapshotCache()
  expect(readAgencyLeadWorkspaceSnapshot(org, leadId)).toBeNull()
})

for (const [label, load, clear, fetchKey, makeResult] of [
  ['offers', loadBuyerOfferWorkspaceData, clearBuyerOfferWorkspaceDataLoaderCache, 'fetchWorkspace', version => ({ offers: [{ id: version }], sessions: [] })],
  ['finance', loadBuyerFinanceTransactionData, clearBuyerFinanceTransactionDataLoaderCache, 'fetchDiagnostic', version => ({ version })],
]) {
  it(`${label} cache revokes pending reads on clear, CRM updates and auth reset`, async () => {
    clear()
    const old = deferred(), current = deferred()
    const fetch = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const args = { organisationId: org, leadId, transactionId: 'transaction', [fetchKey]: fetch }
    const first = load(args)
    await Promise.resolve()
    clear()
    const second = load(args)
    await Promise.resolve()
    current.resolve(makeResult('new'))
    await second
    old.resolve(makeResult('old'))
    await first
    expect(await load(args)).toEqual(makeResult('new'))
    expect(fetch).toHaveBeenCalledTimes(2)
    fetch.mockResolvedValue(makeResult('refreshed'))
    window.dispatchEvent(new CustomEvent('itg:agency-crm-updated', { detail: { organisationId: org, leadId } }))
    expect(await load(args)).toEqual(makeResult('refreshed'))
    expect(fetch).toHaveBeenCalledTimes(3)
    window.dispatchEvent(new Event('bridge:workspace-scoped-cache-cleared'))
    await load(args)
    expect(fetch).toHaveBeenCalledTimes(4)
    clear()
  })
}
