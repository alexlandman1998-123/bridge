// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useListingWebsitePublications from '../useListingWebsitePublications'
import { getWebsiteListingPublicationStatuses as readBatch } from '../../services/websiteListingPublicationService'
vi.mock('../../services/websiteListingPublicationService', () => ({ getWebsiteListingPublicationStatuses: vi.fn() }))
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const rows = count => Array.from({ length: count }, (_, index) => ({ id: id(index), updatedAt: 'v1' }))
const live = { status: 'published', websiteStatus: 'published', projectionStatus: 'Published' }
beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)
it('reads 201 listings in three batches and skips duplicate/local IDs with only three state updates', async () => {
  const pending = []
  readBatch.mockImplementation(ids => new Promise(resolve => pending.push(() => resolve(Object.fromEntries(ids.map(id => [id, live]))))))
  let renders = 0
  const { result } = renderHook(() => { renders += 1; return useListingWebsitePublications([...rows(201), rows(1)[0], { id: 'local-draft' }], 'kingdom') })
  expect(result.current).toEqual({})
  expect(pending).toHaveLength(1)
  for (const [index, count] of [100, 200, 201].entries()) {
    await act(async () => pending[index]())
    expect(Object.keys(result.current)).toHaveLength(count)
  }
  expect(readBatch.mock.calls.map(([ids]) => ids.length)).toEqual([100, 100, 1])
  expect(renders).toBe(4)
})
it('rejects late reads after an organisation change and fails closed for denied reads', async () => {
  let finish
  readBatch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockRejectedValue(new Error('access denied'))
  const { result, rerender } = renderHook(({ scope }) => useListingWebsitePublications(rows(1), scope), { initialProps: { scope: 'old' } })
  rerender({ scope: 'new' })
  await waitFor(() => expect(result.current[id(0)]).toBeNull())
  await act(async () => finish({ [id(0)]: live }))
  expect(result.current[id(0)]).toBeNull()
})
it('refreshes after a publication event without rereading for identical hydration', async () => {
  readBatch.mockResolvedValue({ [id(0)]: live })
  const { result, rerender } = renderHook(() => useListingWebsitePublications(rows(1), 'kingdom'))
  await waitFor(() => expect(result.current[id(0)]).toEqual(live))
  rerender()
  expect(readBatch).toHaveBeenCalledTimes(1)
  readBatch.mockResolvedValue({ [id(0)]: { ...live, status: 'unpublished' } })
  await act(async () => window.dispatchEvent(new Event('itg:listings-updated')))
  await waitFor(() => expect(result.current[id(0)].status).toBe('unpublished'))
  expect(readBatch).toHaveBeenCalledTimes(2)
})
it('stops starting batches after unmount and treats omitted results as unavailable', async () => {
  let finish
  readBatch.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const { unmount } = renderHook(() => useListingWebsitePublications(rows(201), 'kingdom'))
  unmount()
  await act(async () => finish({}))
  expect(readBatch).toHaveBeenCalledTimes(1)
  readBatch.mockResolvedValue({ [id(0)]: live })
  const { result } = renderHook(() => useListingWebsitePublications(rows(2), 'kingdom'))
  await waitFor(() => expect(result.current[id(1)]).toBeNull())
  expect(result.current[id(0)]).toBe(live)
})
