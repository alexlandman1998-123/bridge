// @vitest-environment jsdom
import { act, renderHook, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useMetaWorkspace } from '../useMetaWorkspace'
const mocks = vi.hoisted(() => ({ authState: null, request: vi.fn() }))
vi.mock('../../context/AuthSessionContext', () => ({ useAuthSession: () => ({ authState: mocks.authState }) }))
vi.mock('../../services/metaIntegrationService', () => ({ metaIntegrationRequest: mocks.request }))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
beforeEach(() => { mocks.authState = { user: { id: 'agent-a' }, currentWorkspace: { id: 'agency' } }; mocks.request.mockReset() })
afterEach(cleanup)
it('discards an old user response and clears capabilities when users switch within the same agency', async () => {
  const first = deferred(), second = deferred()
  mocks.request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const hook = renderHook(() => useMetaWorkspace())
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1))
  mocks.authState = { ...mocks.authState, user: { id: 'agent-b' } }; hook.rerender()
  expect(hook.result.current.senders).toEqual([])
  expect(hook.result.current.canManage).toBe(false)
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))
  await act(async () => { first.resolve({ senders: [{ id: 'private-a' }], canManage: true }); await first.promise })
  expect(hook.result.current.senders).toEqual([])
  await act(async () => { second.resolve({ senders: [{ id: 'private-b' }], canManage: false }); await second.promise })
  expect(hook.result.current.senders).toEqual([{ id: 'private-b' }])
  expect(hook.result.current.accessScope).toBe('agency:agent-b')
})
it('clears cached senders and management access when the workspace refresh fails', async () => {
  mocks.request.mockResolvedValueOnce({ senders: [{ id: 'private-a' }], canManage: true }).mockRejectedValueOnce(Error('Membership revoked'))
  const hook = renderHook(() => useMetaWorkspace())
  await waitFor(() => expect(hook.result.current.canManage).toBe(true))
  await act(() => hook.result.current.refresh())
  expect(hook.result.current.senders).toEqual([])
  expect(hook.result.current.assignees).toEqual([])
  expect(hook.result.current.canManage).toBe(false)
  expect(hook.result.current.error).toBe('Membership revoked')
})
it('does not fetch a connection without a signed-in person', async () => {
  mocks.authState = { user: null, currentWorkspace: { id: 'agency' } }
  const hook = renderHook(() => useMetaWorkspace())
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  expect(mocks.request).not.toHaveBeenCalled()
})
it('clears agency controls and other agent numbers when the same person loses a management role', async () => {
  mocks.authState.currentMembership = { workspaceRole: 'principal', status: 'active' }
  mocks.request.mockResolvedValueOnce({ senders: [{ id: 'other-agent-number' }], canManage: true })
  const pending = deferred()
  const hook = renderHook(() => useMetaWorkspace())
  await waitFor(() => expect(hook.result.current.canManage).toBe(true))
  mocks.request.mockReturnValueOnce(pending.promise)
  mocks.authState = { ...mocks.authState, currentMembership: { workspaceRole: 'agent', status: 'active' } }
  hook.rerender()
  expect(hook.result.current.senders).toEqual([])
  expect(hook.result.current.canManage).toBe(false)
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))
  await act(async () => { pending.resolve({ senders: [], canManage: false }); await pending.promise })
  expect(hook.result.current.canManage).toBe(false)
})
