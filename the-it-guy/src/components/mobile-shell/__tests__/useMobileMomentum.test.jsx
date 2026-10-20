// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../services/mobileMomentumService.js', async importOriginal => ({
  ...await importOriginal(), playMobileFeedback: vi.fn(), unlockMobileAudio: vi.fn().mockResolvedValue(true),
}))
import useMobileMomentum from '../useMobileMomentum.js'
import { playMobileFeedback } from '../../../services/mobileMomentumService.js'
const now = new Date('2026-10-20T10:00:00Z')
let identity = 0
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); vi.clearAllMocks() })
afterEach(() => { cleanup(); vi.useRealTimers() })
const task = { id: 'task:one', completed: false }
function initial(extra = {}) { return { scope: `hook-${++identity}`, today: { taskChecklist: [task] }, leads: [], leadsAvailable: true, contactedLeadIds: [], available: true, ...extra } }

it('silently baselines existing leads, rewards one genuine arrival, and never replays it on refresh or remount', () => {
  const props = initial({ leads: [{ leadId: 'old' }] })
  const view = renderHook(p => useMobileMomentum(p), { initialProps: props })
  expect(playMobileFeedback).not.toHaveBeenCalled()
  view.rerender({ ...props, leads: [...props.leads, { leadId: 'new' }] })
  expect(playMobileFeedback).toHaveBeenCalledOnce()
  expect(view.result.current.feedback.kind).toBe('lead')
  view.rerender({ ...props, leads: [] })
  view.rerender({ ...props, leads: [{ leadId: 'new' }] })
  expect(playMobileFeedback).toHaveBeenCalledOnce()
  view.unmount()
  renderHook(() => useMobileMomentum({ ...props, leads: [{ leadId: 'new' }] }))
  expect(playMobileFeedback).toHaveBeenCalledOnce()
})

it('waits for available lead data before baselining so source recovery cannot reward old leads', () => {
  const props = initial({ leadsAvailable: false })
  const view = renderHook(p => useMobileMomentum(p), { initialProps: props })
  view.rerender({ ...props, leadsAvailable: true, leads: [{ leadId: 'old-after-outage' }] })
  expect(playMobileFeedback).not.toHaveBeenCalled()
})

it('celebrates the last saved task once, lowers progress after undo and does not reward repeated completion', () => {
  const props = initial()
  const { result } = renderHook(() => useMobileMomentum(props))
  act(() => result.current.confirmed('task', task, true))
  expect(result.current.feedback.kind).toBe('clear')
  expect(result.current.model.percent).toBe(100)
  act(() => result.current.confirmed('task', { ...task, completed: true }, false))
  expect(result.current.model.percent).toBe(0)
  act(() => result.current.confirmed('task', task, true))
  expect(playMobileFeedback).toHaveBeenCalledOnce()
})

it('never rewards task completions already loaded from saved records', () => {
  const props = initial({ today: { taskChecklist: [{ ...task, completed: true }] } })
  const { result } = renderHook(() => useMobileMomentum(props))
  act(() => result.current.confirmed('task', { ...task, completed: true }, false))
  act(() => result.current.confirmed('task', task, true))
  expect(playMobileFeedback).not.toHaveBeenCalled()
})

it('correctly celebrates the last task when multiple confirmed saves finish together', () => {
  const second = { id: 'task:two', completed: false }
  const props = initial({ today: { taskChecklist: [task, second] } })
  const { result } = renderHook(() => useMobileMomentum(props))
  act(() => {
    result.current.confirmed('task', task, true)
    result.current.confirmed('task', second, true)
  })
  expect(result.current.model.percent).toBe(100)
  expect(result.current.feedback.kind).toBe('clear')
  expect(playMobileFeedback.mock.calls.map(call => call[0])).toEqual(['task', 'clear'])
})

it('counts confirmed buyer contact once even when the refreshed server snapshot also contains it', () => {
  const props = initial({ leads: [{ leadId: 'buyer', leadCategory: 'buyer' }] })
  const view = renderHook(p => useMobileMomentum(p), { initialProps: props })
  act(() => view.result.current.confirmed('contact', { leadId: 'buyer' }))
  expect(view.result.current.model.contacted).toBe(1)
  view.rerender({ ...props, leads: [], contactedLeadIds: ['buyer'] })
  expect(view.result.current.model.contacted).toBe(1)
  expect(playMobileFeedback).toHaveBeenCalledOnce()
})
