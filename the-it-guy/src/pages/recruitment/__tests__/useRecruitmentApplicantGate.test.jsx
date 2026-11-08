// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useRecruitmentApplicantGate from '../useRecruitmentApplicantGate'
import { checkRecruitmentApplicantGate } from '../recruitmentApplicantGateCheck'

vi.mock('../../../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../recruitmentApplicantGateCheck', () => ({ checkRecruitmentApplicantGate: vi.fn() }))

const session = { user: { id: 'agent-one' } }
const allowed = { required: false, error: false }
const denied = { required: false, error: true }
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
  vi.clearAllMocks()
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

it('aborts a hung request and presents a recoverable error instead of loading forever', async () => {
  checkRecruitmentApplicantGate.mockReturnValue(new Promise(() => {}))
  const { result } = renderHook(() => useRecruitmentApplicantGate(session))
  const signal = checkRecruitmentApplicantGate.mock.calls[0][2].signal
  expect(result.current.checking).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(signal.aborted).toBe(true)
  expect(result.current.checking).toBe(false)
  expect(result.current.error).toBe(true)
  expect(result.current.retryAfterSeconds).toBe(15)
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
