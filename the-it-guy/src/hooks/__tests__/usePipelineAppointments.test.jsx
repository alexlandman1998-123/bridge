// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../lib/agencyPipelineService', () => ({ listAppointmentsAsync: vi.fn() }))
import { listAppointmentsAsync } from '../../lib/agencyPipelineService'
import usePipelineAppointments from '../usePipelineAppointments'
afterEach(() => { cleanup(); vi.resetAllMocks() })
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
const base = { organisationId: 'agency', agentId: 'agent' }
describe('independent appointment loading', () => {
  it('loads full lead history without a date bound', async () => {
    const rows = [{ appointmentId: 'future', dateTime: '2027-10-01T09:40:00Z' }]
    listAppointmentsAsync.mockResolvedValue(rows)
    const { result } = renderHook(() => usePipelineAppointments({ ...base, leadId: 'seller' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.rows).toEqual(rows)
    expect(listAppointmentsAsync).toHaveBeenCalledWith('agency', expect.objectContaining({ leadId: 'seller', from: null, to: null }))
  })
  it('ignores a late response after calendar navigation or an organisation change', async () => {
    const old = deferred(); const next = deferred()
    listAppointmentsAsync.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
    const { result, rerender } = renderHook((props) => usePipelineAppointments(props), { initialProps: { ...base, from: '2026-10-01' } })
    rerender({ ...base, organisationId: 'other', from: '2027-10-01' })
    await act(async () => next.resolve([{ appointmentId: 'new' }]))
    await act(async () => old.resolve([{ appointmentId: 'stale' }]))
    expect(result.current.rows).toEqual([{ appointmentId: 'new' }])
  })
  it('preserves rows after failed refresh and replaces them after a verified empty retry', async () => {
    listAppointmentsAsync.mockResolvedValueOnce([{ appointmentId: 'saved' }]).mockRejectedValueOnce(new Error('Network failed')).mockResolvedValueOnce([])
    const { result } = renderHook(() => usePipelineAppointments(base))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.error).toBe('Network failed'))
    expect(result.current.rows).toEqual([{ appointmentId: 'saved' }])
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.rows).toEqual([])
  })
  it('reports a timeout and ignores its late result', async () => {
    const request = deferred(); listAppointmentsAsync.mockReturnValue(request.promise)
    const { result } = renderHook(() => usePipelineAppointments({ ...base, timeoutMs: 10 }))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toContain('taking too long')
    await act(async () => request.resolve([{ appointmentId: 'late' }]))
    expect(result.current.status).toBe('error')
    expect(result.current.rows).toEqual([])
  })
  it('does not treat malformed data as an empty calendar', async () => {
    listAppointmentsAsync.mockResolvedValue(null)
    const { result } = renderHook(() => usePipelineAppointments(base))
    await waitFor(() => expect(result.current.error).toContain('could not be verified'))
  })
})
