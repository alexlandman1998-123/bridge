// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useTransactionPartnerOptions } from '../useTransactionPartnerOptions.js'
import { fetchPartnersSnapshot } from '../../lib/partnersRepository.js'
import { listUserPreferredPartnerRoutingRules } from '../../lib/transactionWorkspaceSecondaryApi.js'

vi.mock('../../lib/partnersRepository.js', () => ({ fetchPartnersSnapshot: vi.fn() }))
vi.mock('../../lib/transactionWorkspaceSecondaryApi.js', () => ({ listUserPreferredPartnerRoutingRules: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers() })
const accessContext = { userId: 'agent', organisationId: 'org' }
const props = { enabled: true, organisationId: 'org', workspaceType: 'agency', accessContext }

it('settles after loading rules and does not refetch because its results rendered', async () => {
  fetchPartnersSnapshot.mockResolvedValue({ relationships: [{ id: 'firm' }] })
  listUserPreferredPartnerRoutingRules.mockResolvedValue([{ id: 'preferred' }])
  const { result, rerender } = renderHook(values => useTransactionPartnerOptions(values), { initialProps: props })
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.routingRules).toEqual([{ id: 'preferred' }])
  rerender({ ...props })
  expect(fetchPartnersSnapshot).toHaveBeenCalledTimes(1)
  expect(listUserPreferredPartnerRoutingRules).toHaveBeenCalledTimes(1)
})

it('shows a recoverable failure and reloads on request', async () => {
  fetchPartnersSnapshot.mockRejectedValueOnce(new Error('Firm service unavailable')).mockResolvedValueOnce({ relationships: [] })
  listUserPreferredPartnerRoutingRules.mockResolvedValue([])
  const { result } = renderHook(() => useTransactionPartnerOptions(props))
  await waitFor(() => expect(result.current.error).toBe('Firm service unavailable'))
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.error).toBe('')
  expect(fetchPartnersSnapshot).toHaveBeenCalledTimes(2)
})

it('times out and ignores a late result from the failed attempt', async () => {
  vi.useFakeTimers()
  let finish
  fetchPartnersSnapshot.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  listUserPreferredPartnerRoutingRules.mockResolvedValue([])
  const { result } = renderHook(() => useTransactionPartnerOptions(props))
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
  expect(result.current.loading).toBe(false)
  expect(result.current.error).toContain('too long')
  await act(async () => { finish({ relationships: [{ id: 'late-firm' }] }) })
  expect(result.current.snapshot).toBeNull()
})

it('ignores a response from the previous organisation', async () => {
  let finish
  fetchPartnersSnapshot.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce({ relationships: [{ id: 'new-firm' }] })
  listUserPreferredPartnerRoutingRules.mockResolvedValue([])
  const { result, rerender } = renderHook(values => useTransactionPartnerOptions(values), { initialProps: props })
  rerender({ ...props, organisationId: 'new-org', accessContext: { organisationId: 'new-org', userId: 'agent' } })
  await waitFor(() => expect(result.current.snapshot?.relationships[0].id).toBe('new-firm'))
  await act(async () => { finish({ relationships: [{ id: 'old-firm' }] }) })
  expect(result.current.snapshot.relationships[0].id).toBe('new-firm')
})
