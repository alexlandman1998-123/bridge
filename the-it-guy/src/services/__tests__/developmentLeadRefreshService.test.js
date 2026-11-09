// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ invalidate: vi.fn(), buyer: vi.fn(), snapshot: vi.fn() }))
vi.mock('../../pages/agency/agencyLeadListReadRepository.js', () => ({ invalidateAgencyLeadListCache: mocks.invalidate }))
vi.mock('../../pages/agency/buyerLeadWorkspaceDataLoader.js', () => ({ clearBuyerLeadWorkspaceDataLoaderCache: mocks.buyer }))
vi.mock('../../pages/agency/agencyLeadWorkspaceSnapshotCache.js', () => ({ clearAgencyLeadWorkspaceSnapshotCache: mocks.snapshot }))
import { notifyDevelopmentLeadChange } from '../developmentLeadRefreshService.js'
beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear() })
it('invalidates both workspace views and publishes identity-only notifications for other tabs', () => {
  const event = vi.fn(), stock = vi.fn()
  window.addEventListener('bridge:buyer-lifecycle-refresh', event)
  window.addEventListener('itg:developments-changed', stock)
  try {
    notifyDevelopmentLeadChange({ developerOrgId: 'developer', sourceAgencyOrgId: 'agency', sourceLeadId: 'buyer', buyerFullName: 'Private name', buyerEmail: 'private@example.test' }, { stockChanged: true })
    expect(mocks.invalidate.mock.calls).toEqual([['developer', 'buyer'], ['agency', 'buyer']])
    expect(mocks.buyer).toHaveBeenCalledOnce()
    expect(mocks.snapshot).toHaveBeenCalledOnce()
    expect(stock).toHaveBeenCalledOnce()
    const detail = JSON.parse(window.localStorage.getItem('bridge:buyer-lifecycle-refresh:v1'))
    expect(detail).toEqual({ organisationId: 'agency', leadId: 'buyer', stockChanged: true, updatedAt: expect.any(Number) })
    expect(event.mock.calls[0][0].detail).toEqual(detail)
  } finally {
    window.removeEventListener('bridge:buyer-lifecycle-refresh', event)
    window.removeEventListener('itg:developments-changed', stock)
  }
})
it('does not reload the whole unit workspace when only the buyer stage changed', () => {
  const stock = vi.fn()
  window.addEventListener('itg:developments-changed', stock)
  try {
    notifyDevelopmentLeadChange({ developerOrgId: 'developer', sourceLeadId: 'buyer' })
    expect(stock).not.toHaveBeenCalled()
    expect(JSON.parse(window.localStorage.getItem('bridge:buyer-lifecycle-refresh:v1')).stockChanged).toBe(false)
  } finally { window.removeEventListener('itg:developments-changed', stock) }
})
