// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDocumentClientWorkspace } from '../useDocumentClientWorkspace.js'
const read = vi.hoisted(() => vi.fn())
vi.mock('../workspaceReadApi.js', () => ({ fetchDocumentClientWorkspace: read }))
const row = { unit: { id: 'unit' }, transaction: { id: 'one' } }
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }
beforeEach(() => read.mockReset())
afterEach(cleanup)
it('does no work without a selection and deduplicates a pending refresh', async () => {
  const pending = deferred(); read.mockReturnValue(pending.promise)
  const { result, rerender } = renderHook(props => useDocumentClientWorkspace(props.row, props.scope), { initialProps: { row: null, scope: 'actor:org' } })
  expect(read).not.toHaveBeenCalled()
  rerender({ row, scope: 'actor:org' })
  act(() => { void result.current.refresh(); void result.current.refresh() })
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => pending.resolve({ ...row, documents: [] }))
  expect(result.current.loading).toBe(false)
})
it('ignores a late result after the selected client or actor scope changes', async () => {
  const pending = deferred(); read.mockReturnValueOnce(pending.promise).mockResolvedValue({ transaction: { id: 'two' }, documents: [{ id: 'new-scope' }] })
  const { result, rerender } = renderHook(props => useDocumentClientWorkspace(props.row, props.scope), { initialProps: { row, scope: 'actor:org' } })
  rerender({ row: { transaction: { id: 'two' } }, scope: 'other:other-org' })
  await waitFor(() => expect(result.current.data?.transaction.id).toBe('two'))
  await act(async () => pending.resolve({ ...row, documents: [{ id: 'old-private-document' }] }))
  expect(result.current.data.documents).toEqual([{ id: 'new-scope' }])
})
it('retries a failed read and refreshes an already saved client without discarding its visible data', async () => {
  read.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ ...row, documents: [] })
  const { result } = renderHook(() => useDocumentClientWorkspace(row, 'actor:org'))
  await waitFor(() => expect(result.current.error).toBe('Offline'))
  await act(async () => result.current.refresh())
  expect(result.current.data.documents).toEqual([])
  const pending = deferred(); read.mockReturnValue(pending.promise)
  act(() => { void result.current.refresh() })
  expect(result.current.loading).toBe(true)
  expect(result.current.data.documents).toEqual([])
  await act(async () => pending.resolve({ ...row, documents: [{ id: 'saved' }] }))
  expect(result.current.data.documents[0].id).toBe('saved')
})

it('supersedes an outstanding read when a requirements change invalidates the view', async () => {
  const old = deferred()
  read.mockReturnValueOnce(old.promise).mockResolvedValue({ ...row, documents: [{ id: 'new-evidence' }] })
  const { result } = renderHook(() => useDocumentClientWorkspace(row, 'actor:org'))
  await act(async () => result.current.refresh({ force: true }))
  expect(result.current.data.documents[0].id).toBe('new-evidence')
  await act(async () => old.resolve({ ...row, documents: [{ id: 'old-evidence' }] }))
  expect(result.current.data.documents[0].id).toBe('new-evidence')
})
