// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import TransactionRoleAllocationDialog, { ALLOCATION_SLOW_MS } from '../TransactionRoleAllocationDialog.jsx'
import RolePlayersWorkspaceTab from '../../../pages/transaction-workspace/tabs/RolePlayersWorkspaceTab.jsx'

afterEach(() => { cleanup(); vi.useRealTimers() })
const firm = { id: 'law', companyName: 'Selected Law', label: 'Selected Law', email: 'law@example.test', group: 'Signed Mandate' }
const originator = { id: 'bond', companyName: 'Selected Bonds', label: 'Selected Bonds', group: 'Connected Partners' }
const roles = [{ key: 'transfer_attorney', label: 'Transfer Attorney', options: [firm] }, { key: 'bond_originator', label: 'Bond Originator', options: [originator] }]

it('offers a standalone allocation save with no buyer or onboarding actions', async () => {
  const save = vi.fn(async () => {})
  const close = vi.fn()
  render(<TransactionRoleAllocationDialog roles={roles} initialRoleType="bond_originator" onAllocate={save} onClose={close} />)
  expect(screen.queryByRole('button', { name: /Send|Copy Link|Onboarding/i })).toBeNull()
  expect(screen.getByRole('button', { name: 'Save allocation' }).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Firm'), { target: { value: originator.id } })
  fireEvent.click(screen.getByRole('button', { name: 'Save allocation' }))
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  expect(save).toHaveBeenCalledExactlyOnceWith('bond_originator', originator)
})

it('keeps the selection and supports retry when allocation fails', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Could not save firm')).mockResolvedValueOnce({})
  const close = vi.fn()
  render(<TransactionRoleAllocationDialog roles={roles} onAllocate={save} onClose={close} />)
  fireEvent.change(screen.getByLabelText('Firm'), { target: { value: firm.id } })
  fireEvent.click(screen.getByRole('button', { name: 'Save allocation' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toBe('Could not save firm')
  expect(screen.getByLabelText('Firm').value).toBe(firm.id)
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save allocation' }))
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
})

it('does not preselect another firm when the user switches roles', () => {
  render(<TransactionRoleAllocationDialog roles={roles} onAllocate={vi.fn()} onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Firm'), { target: { value: firm.id } })
  fireEvent.change(screen.getByLabelText('Transaction role'), { target: { value: 'bond_originator' } })
  expect(screen.getByLabelText('Firm').value).toBe('')
  expect(screen.getByRole('button', { name: 'Save allocation' }).disabled).toBe(true)
})

it('keeps the dialog and selectors locked while a save is pending', async () => {
  let resolveSave
  const save = vi.fn(() => new Promise((resolve) => { resolveSave = resolve }))
  render(<TransactionRoleAllocationDialog roles={roles} onAllocate={save} onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Firm'), { target: { value: firm.id } })
  fireEvent.click(screen.getByRole('button', { name: 'Save allocation' }))
  const pending = screen.getByRole('button', { name: 'Saving allocation…' })
  expect(pending.disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'Close dialog' })).toBeNull()
  fireEvent.click(pending)
  expect(save).toHaveBeenCalledTimes(1)
  resolveSave()
  await waitFor(() => expect(pending.textContent).toBe('Save allocation'))
})

it('opens the requested role directly from the transaction team card', () => {
  const assign = vi.fn()
  render(<RolePlayersWorkspaceTab teamCards={[{ key: 'bond_originator', label: 'Bond Originator', company: 'Not assigned', status: 'Not assigned', actionLabel: 'Assign Bond Originator' }]} onAssignRole={assign} canManageAssignments />)
  fireEvent.click(screen.getByRole('button', { name: 'Bond Originator details: Not assigned' }))
  fireEvent.click(screen.getByRole('button', { name: 'Assign Bond Originator' }))
  expect(assign).toHaveBeenCalledExactlyOnceWith('bond_originator')
})

it('lets a slow save close and reopen without submitting a second allocation, then observes late success', async () => {
  vi.useFakeTimers()
  let resolveSave
  const save = vi.fn(() => new Promise(resolve => { resolveSave = resolve }))
  const oldClose = vi.fn()
  const pendingSavesRef = { current: new Map() }
  const props = { roles, onAllocate: save, pendingSavesRef, requestKey: 'matter-1' }
  const first = render(<TransactionRoleAllocationDialog {...props} onClose={oldClose} />)
  fireEvent.change(screen.getByLabelText('Firm'), { target: { value: firm.id } })
  fireEvent.click(screen.getByRole('button', { name: 'Save allocation' }))
  act(() => { vi.advanceTimersByTime(ALLOCATION_SLOW_MS) })
  expect(screen.getByRole('status').textContent).toContain('save may still complete')
  const close = screen.getByRole('button', { name: 'Close and check transaction' })
  expect(close.disabled).toBe(false)
  expect(screen.getByRole('button', { name: 'Allocation pending' }).disabled).toBe(true)
  fireEvent.click(close)
  expect(oldClose).toHaveBeenCalledTimes(1)
  first.unmount()
  const nextClose = vi.fn()
  render(<TransactionRoleAllocationDialog {...props} onClose={nextClose} />)
  act(() => { vi.advanceTimersByTime(1) })
  expect(screen.getByLabelText('Firm').value).toBe(firm.id)
  fireEvent.click(screen.getByRole('button', { name: 'Allocation pending' }))
  expect(save).toHaveBeenCalledTimes(1)
  await act(async () => { resolveSave(); await Promise.resolve() })
  expect(nextClose).toHaveBeenCalledTimes(1)
  expect(oldClose).toHaveBeenCalledTimes(1)
  expect(pendingSavesRef.current.size).toBe(0)
})

it('retains the selected firm and enables retry when a delayed request later fails', async () => {
  vi.useFakeTimers()
  let rejectSave
  const save = vi.fn(() => new Promise((resolve, reject) => { rejectSave = reject }))
  const close = vi.fn()
  render(<TransactionRoleAllocationDialog roles={roles} onAllocate={save} onClose={close} />)
  fireEvent.change(screen.getByLabelText('Firm'), { target: { value: firm.id } })
  fireEvent.click(screen.getByRole('button', { name: 'Save allocation' }))
  act(() => { vi.advanceTimersByTime(ALLOCATION_SLOW_MS) })
  await act(async () => { rejectSave(new Error('Could not save firm')); await Promise.resolve() })
  expect(screen.getByRole('alert').textContent).toBe('Could not save firm')
  expect(screen.getByRole('button', { name: 'Save allocation' }).disabled).toBe(false)
  expect(screen.getByLabelText('Firm').value).toBe(firm.id)
  expect(close).not.toHaveBeenCalled()
})

it('cleans up the elapsed timer on unmount without forgetting an unresolved save', () => {
  vi.useFakeTimers()
  const pendingSavesRef = { current: new Map() }
  const view = render(<TransactionRoleAllocationDialog roles={roles} onAllocate={() => new Promise(() => {})} onClose={vi.fn()} pendingSavesRef={pendingSavesRef} />)
  fireEvent.change(screen.getByLabelText('Firm'), { target: { value: firm.id } })
  fireEvent.click(screen.getByRole('button', { name: 'Save allocation' }))
  expect(vi.getTimerCount()).toBeGreaterThan(0)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
  expect(pendingSavesRef.current.size).toBe(1)
})


it('explains firm loading failures and lets the user retry without touching onboarding', () => {
  const retry = vi.fn()
  const { rerender } = render(<TransactionRoleAllocationDialog roles={roles} loadError="Firm service unavailable" onRetry={retry} onAllocate={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByRole('alert').textContent).toContain('Firm service unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Reload firms' }))
  expect(retry).toHaveBeenCalledTimes(1)
  rerender(<TransactionRoleAllocationDialog roles={roles} loading loadError="Firm service unavailable" onRetry={retry} onAllocate={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Reload firms' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Save allocation' }).disabled).toBe(true)
})
