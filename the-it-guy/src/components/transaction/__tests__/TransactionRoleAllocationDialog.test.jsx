// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import TransactionRoleAllocationDialog from '../TransactionRoleAllocationDialog.jsx'
import RolePlayersWorkspaceTab from '../../../pages/transaction-workspace/tabs/RolePlayersWorkspaceTab.jsx'

afterEach(cleanup)
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
