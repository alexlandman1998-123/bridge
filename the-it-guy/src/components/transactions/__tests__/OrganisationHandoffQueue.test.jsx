// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
vi.mock('../../../services/transactionHandoffRegisterService', () => ({ readOrganisationHandoffQueue: vi.fn() }))
vi.mock('../TransactionHandoffRegisterPanel', () => ({ default: ({ transactionId }) => <div>Reviewing {transactionId}</div> }))
import { readOrganisationHandoffQueue } from '../../../services/transactionHandoffRegisterService'
import OrganisationHandoffQueue from '../OrganisationHandoffQueue'
const row = { queue_id: 'handoff', handoff_id: 'handoff', transaction_id: 'matter', matter_label: 'A9-123', role_type: 'bond_originator', bucket: 'data_gap', queue_reason: 'provider_receipt_missing', pending_since: '2026-10-04T08:00:00Z', destination_company_name: 'Beta Bond', exception_keys: [] }
const result = { success: true, organisationId: 'agency', total: 1, hasMore: false, counts: { data_gap: 1 }, items: [row] }
afterEach(() => { cleanup(); vi.resetAllMocks() })
const view = org => <MemoryRouter><OrganisationHandoffQueue organisationId={org} /></MemoryRouter>
describe('organisation handoff queue', () => {
 it('makes missing evidence visible and opens the guarded matter register', async () => {
  readOrganisationHandoffQueue.mockResolvedValue(result)
  render(view('agency'))
  expect(await screen.findByText('A9-123 · Bond originator')).toBeTruthy()
  expect(screen.getByText('Delivery is marked sent without a provider receipt. Confirm the earlier result before sending again.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Open matter' }).getAttribute('href')).toBe('/transactions/matter')
  fireEvent.click(screen.getByRole('button', { name: 'Review handoffs' }))
  expect(screen.getByText('Reviewing matter')).toBeTruthy()
 })
 it('filters and pages with server totals and resets paging when the filter changes', async () => {
  readOrganisationHandoffQueue.mockResolvedValue({ ...result, total: 40, hasMore: true })
  render(view('agency'))
  await screen.findByText('40 outstanding handoffs in this view.')
  fireEvent.click(screen.getByRole('button', { name: 'Next handoffs' }))
  await vi.waitFor(() => expect(readOrganisationHandoffQueue).toHaveBeenLastCalledWith('agency', { bucket: 'all', offset: 25 }))
  fireEvent.change(screen.getByLabelText('Show handoffs'), { target: { value: 'invitation' } })
  await vi.waitFor(() => expect(readOrganisationHandoffQueue).toHaveBeenLastCalledWith('agency', { bucket: 'invitation', offset: 0 }))
 })
 it('does not describe a stale empty page as a healthy organisation', async () => {
  readOrganisationHandoffQueue.mockResolvedValue({ ...result, items: [], total: 3 })
  render(view('agency'))
  expect(await screen.findByText('No handoffs on this page. Return to the previous page or refresh the queue.')).toBeTruthy()
  expect(screen.queryByText('No outstanding handoffs in this view.')).toBeNull()
 })
 it('reports permission or loading failures without showing a healthy empty queue', async () => {
  readOrganisationHandoffQueue.mockRejectedValueOnce(new Error('Organisation authority required')).mockResolvedValueOnce({ ...result, total: 0, items: [], counts: {} })
  render(view('agency'))
  expect((await screen.findByRole('alert')).textContent).toBe('Organisation authority required')
  expect(screen.queryByText('No outstanding handoffs in this view.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }))
  expect(await screen.findByText('No outstanding handoffs in this view.')).toBeTruthy()
 })
 it('discards an old organisation response and closes its review immediately', async () => {
  let resolveOld
  readOrganisationHandoffQueue.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce({ ...result, organisationId: 'current', items: [{ ...row, matter_label: 'Current agency' }] })
  const { rerender } = render(view('old'))
  rerender(view('current'))
  await screen.findByText('Current agency · Bond originator')
  await act(async () => resolveOld(result))
  expect(screen.queryByText('A9-123 · Bond originator')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Review handoffs' }))
  readOrganisationHandoffQueue.mockResolvedValue({ ...result, organisationId: 'next', items: [] })
  rerender(view('next'))
  expect(screen.queryByText('Reviewing matter')).toBeNull()
 })
})
