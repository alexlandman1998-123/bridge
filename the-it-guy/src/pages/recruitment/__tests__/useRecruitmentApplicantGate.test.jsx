// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useRecruitmentApplicantGate from '../useRecruitmentApplicantGate'
import { checkRecruitmentApplicantGate } from '../recruitmentApplicantGateCheck'

vi.mock('../../../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../recruitmentApplicantGateCheck', () => ({ checkRecruitmentApplicantGate: vi.fn() }))

const session = { user: { id: 'agent-one' } }
const allowed = { required: false, error: false }
const denied = { required: false, error: true, retryable: false }
const temporary = { required: false, error: true, retryable: true }
const flush = () => act(async () => { await Promise.resolve() })
function deferred() {
  let resolve
  const promise = new Promise(complete => { resolve = complete })
  return { promise, resolve }
}
function focus() { window.dispatchEvent(new Event('focus')) }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-29T19:00:00Z'))
  vi.resetAllMocks()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it('shares an in-flight check and limits successful focus rechecks', async () => {
  const first = deferred()
  checkRecruitmentApplicantGate.mockReturnValueOnce(first.promise).mockResolvedValue(allowed)
  const { result } = renderHook(() => useRecruitmentApplicantGate(session))
  act(() => { for (let n = 0; n < 20; n += 1) focus() })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(1)
  await act(async () => { first.resolve(allowed) })
  expect(result.current.checking).toBe(false)
  expect(result.current.error).toBe(false)
  act(() => { for (let n = 0; n < 20; n += 1) focus() })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); focus() })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(2)
})

it('backs off failed checks and does not turn focus or retry clicks into a request storm', async () => {
  checkRecruitmentApplicantGate.mockResolvedValue(denied)
  const { result } = renderHook(() => useRecruitmentApplicantGate(session))
  await flush()
  expect(result.current.error).toBe(true)
  expect(result.current.retryAfterSeconds).toBe(15)
  act(() => { for (let n = 0; n < 20; n += 1) { focus(); result.current.retry() } })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); result.current.retry() })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(2)
  expect(result.current.retryAfterSeconds).toBe(30)
  checkRecruitmentApplicantGate.mockResolvedValue(allowed)
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); result.current.retry() })
  expect(result.current.error).toBe(false)
  expect(result.current.retryAfterSeconds).toBe(0)
})

it('aborts hung requests and stops automatically after three bounded attempts', async () => {
  checkRecruitmentApplicantGate.mockReturnValue(new Promise(() => {}))
  const { result } = renderHook(() => useRecruitmentApplicantGate(session))
  const signal = checkRecruitmentApplicantGate.mock.calls[0][2].signal
  expect(result.current.checking).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
  expect(signal.aborted).toBe(true)
  expect(result.current.checking).toBe(true)
  expect(result.current.recovering).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(47_000) })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(3)
  expect(checkRecruitmentApplicantGate.mock.calls.every(call => call[2].signal.aborted)).toBe(true)
  expect(result.current.checking).toBe(false)
  expect(result.current.error).toBe(true)
  expect(result.current.retryAfterSeconds).toBe(15)
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(3)
})

it('accepts a verified 16-second response and shows a slow connection notice while waiting', async () => {
  const first = deferred()
  checkRecruitmentApplicantGate.mockReturnValue(first.promise)
  const { result } = renderHook(() => useRecruitmentApplicantGate(session))
  await act(async () => { await vi.advanceTimersByTimeAsync(8_000) })
  expect(result.current.slow).toBe(true)
  expect(result.current.checking).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(8_000); first.resolve(allowed) })
  expect(result.current.checking).toBe(false)
  expect(result.current.error).toBe(false)
  expect(result.current.slow).toBe(false)
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(1)
  expect(checkRecruitmentApplicantGate.mock.calls[0][2].signal.aborted).toBe(false)
})

it('recovers automatically after transient failures with two then five seconds of backoff', async () => {
  checkRecruitmentApplicantGate.mockResolvedValueOnce(temporary).mockResolvedValueOnce(temporary).mockResolvedValue(allowed)
  const { result } = renderHook(() => useRecruitmentApplicantGate(session))
  await flush()
  expect(result.current.checking).toBe(true)
  expect(result.current.recovering).toBe(true)
  act(() => { for (let n = 0; n < 20; n++) { focus(); result.current.retry() } })
  await act(async () => { await vi.advanceTimersByTimeAsync(1_999) })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(2)
  expect(result.current.checking).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(4_999) })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(2)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(3)
  expect(result.current.checking).toBe(false)
  expect(result.current.error).toBe(false)
})

it('does not retry permission or configuration errors automatically', async () => {
  checkRecruitmentApplicantGate.mockResolvedValue(denied)
  const { result } = renderHook(() => useRecruitmentApplicantGate(session))
  await flush()
  await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(120_000) })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(1)
  expect(result.current.error).toBe(true)
  expect(result.current.recovering).toBe(false)
})

it('stops after repeated transient failures and coalesces recovery when the connection returns', async () => {
  checkRecruitmentApplicantGate.mockResolvedValue(temporary)
  const { result } = renderHook(() => useRecruitmentApplicantGate(session))
  await flush()
  await act(async () => { await vi.advanceTimersByTimeAsync(7_000) })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(3)
  expect(result.current.checking).toBe(false)
  expect(result.current.error).toBe(true)
  expect(result.current.retryAfterSeconds).toBe(15)
  checkRecruitmentApplicantGate.mockResolvedValue(allowed)
  act(() => { for (let n = 0; n < 20; n++) window.dispatchEvent(new Event('online')) })
  expect(result.current.checking).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(14_999) })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(3)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(4)
  expect(result.current.error).toBe(false)
})

it('ignores a late response from an aborted attempt and preserves the next verified decision', async () => {
  const first = deferred(), second = deferred()
  checkRecruitmentApplicantGate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const { result } = renderHook(() => useRecruitmentApplicantGate(session))
  await act(async () => { await vi.advanceTimersByTimeAsync(22_000); first.resolve(allowed) })
  expect(result.current.checking).toBe(true)
  await act(async () => { second.resolve({ required: true, error: false }) })
  expect(result.current.required).toBe(true)
  expect(result.current.checking).toBe(false)
})

it('cancels a scheduled retry on account change and on unmount', async () => {
  checkRecruitmentApplicantGate.mockResolvedValue(temporary)
  const { rerender, unmount } = renderHook(({ value }) => useRecruitmentApplicantGate(value), { initialProps: { value: session } })
  await flush()
  rerender({ value: { user: { id: 'agent-two' } } })
  await flush()
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(2)
  unmount()
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
  expect(checkRecruitmentApplicantGate).toHaveBeenCalledTimes(2)
})

it('closes access on a failed recheck rather than reusing the previous permission decision', async () => {
  checkRecruitmentApplicantGate.mockResolvedValueOnce(allowed).mockResolvedValueOnce(denied)
  const { result } = renderHook(() => useRecruitmentApplicantGate(session))
  await flush()
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); focus() })
  expect(result.current.error).toBe(true)
  expect(result.current.required).toBe(false)
})

it('discards the old account response and aborts it when the signed-in user changes', async () => {
  const first = deferred()
  checkRecruitmentApplicantGate.mockReturnValueOnce(first.promise).mockResolvedValue(allowed)
  const { result, rerender } = renderHook(({ value }) => useRecruitmentApplicantGate(value), { initialProps: { value: session } })
  const oldSignal = checkRecruitmentApplicantGate.mock.calls[0][2].signal
  rerender({ value: { user: { id: 'agent-two' } } })
  await flush()
  await act(async () => { first.resolve({ required: true, error: false }) })
  expect(oldSignal.aborted).toBe(true)
  expect(result.current.required).toBe(false)
  expect(result.current.error).toBe(false)
  expect(checkRecruitmentApplicantGate.mock.calls[1][1]).toBe('agent-two')
})

it('does not query without a signed-in user', () => {
  const { result } = renderHook(() => useRecruitmentApplicantGate(null))
  act(() => { focus(); result.current.retry() })
  expect(checkRecruitmentApplicantGate).not.toHaveBeenCalled()
  expect(result.current.checking).toBe(false)
})

it('requires a fresh decision when the same account signs in after signing out', async () => {
  const second = deferred()
  checkRecruitmentApplicantGate.mockResolvedValueOnce(allowed).mockReturnValueOnce(second.promise)
  const { result, rerender } = renderHook(({ value }) => useRecruitmentApplicantGate(value), { initialProps: { value: session } })
  await flush()
  rerender({ value: null })
  rerender({ value: session })
  expect(result.current.checking).toBe(true)
  await act(async () => { second.resolve({ required: true, error: false }) })
  expect(result.current.required).toBe(true)
  expect(result.current.checking).toBe(false)
})
