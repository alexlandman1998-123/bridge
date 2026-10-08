// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useListingWebsitePublications from '../useListingWebsitePublications'
import { getWebsiteListingPublicationStatus } from '../../services/websiteListingPublicationService'

vi.mock('../../services/websiteListingPublicationService', () => ({ getWebsiteListingPublicationStatus: vi.fn() }))
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const rows = (count) => Array.from({ length: count }, (_, index) => ({ id: id(index), updatedAt: 'v1' }))
const live = { status: 'published', websiteStatus: 'published', projectionStatus: 'Published', hostname: 'kingdomrealestate.co.za' }
beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

it('enriches rendered stock with at most four reads at once and skips duplicate/local IDs', async () => {
  const pending = []
  getWebsiteListingPublicationStatus.mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
  const listings = [...rows(6), rows(1)[0], { id: 'local-draft' }]
  const { result } = renderHook(() => useListingWebsitePublications(listings, 'kingdom'))
  expect(result.current).toEqual({})
  expect(pending).toHaveLength(4)
  await act(async () => { pending[0](live) })
  expect(result.current[id(0)]).toEqual(live)
  expect(pending).toHaveLength(5)
  await act(async () => { pending.slice(1, 5).forEach((resolve) => resolve(live)) })
  await act(async () => { pending[5](live) })
  expect(Object.keys(result.current)).toHaveLength(6)
  expect(getWebsiteListingPublicationStatus).toHaveBeenCalledTimes(6)
})

it('rejects late status reads after changing organisation and fails closed on denied reads', async () => {
  let resolveOld
  getWebsiteListingPublicationStatus.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    .mockRejectedValue(new Error('access denied'))
  const { result, rerender } = renderHook(({ scope }) => useListingWebsitePublications(rows(1), scope), { initialProps: { scope: 'kingdom' } })
  rerender({ scope: 'isell' })
  await waitFor(() => expect(result.current[id(0)]).toBeNull())
  await act(async () => { resolveOld(live) })
  expect(result.current[id(0)]).toBeNull()
})

it('refreshes after publishing or removing a listing without rereading for identical hydration', async () => {
  getWebsiteListingPublicationStatus.mockResolvedValue(live)
  const { result, rerender } = renderHook(() => useListingWebsitePublications(rows(1), 'kingdom'))
  await waitFor(() => expect(result.current[id(0)]).toEqual(live))
  rerender()
  expect(getWebsiteListingPublicationStatus).toHaveBeenCalledTimes(1)
  getWebsiteListingPublicationStatus.mockResolvedValue({ ...live, status: 'unpublished' })
  await act(async () => { window.dispatchEvent(new Event('itg:listings-updated')) })
  await waitFor(() => expect(result.current[id(0)].status).toBe('unpublished'))
  expect(getWebsiteListingPublicationStatus).toHaveBeenCalledTimes(2)
})
