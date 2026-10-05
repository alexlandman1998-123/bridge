// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import TaskConfirmations from '../TaskConfirmations.jsx'
import { AGREEMENT_CONDITION_REGISTER, SECURITY_ACCOUNT_REGISTER } from '../../../../services/attorneyWorkflow/conveyancingReviewPolicy.js'
import { normalizeTaskConfirmations } from '../../../../core/transactions/legalTaskConfirmations.js'

afterEach(cleanup)
const condition = { id: 'conditions', label: 'Agreement conditions reviewed', answers: ['yes', 'no', 'not_applicable'], register: AGREEMENT_CONDITION_REGISTER }

it('saves repeated conditions and restores their current values after reload', async () => {
  const save = vi.fn().mockResolvedValue(true)
  const view = render(<TaskConfirmations taskKey="otp" items={[condition]} saved={{}} onSave={save} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
  fireEvent.change(screen.getByLabelText('Condition / obligation'), { target: { value: 'Linked sale' } })
  fireEvent.change(screen.getByLabelText('Responsible person'), { target: { value: 'Buyer' } })
  fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'fulfilled' } })
  fireEvent.click(within(screen.getByRole('group', { name: condition.label })).getByRole('button', { name: 'Yes' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save answers' }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  const saved = normalizeTaskConfirmations(save.mock.calls[0][0])
  expect(saved.conditions.items[0]).toMatchObject({ description: 'Linked sale', owner: 'Buyer', status: 'fulfilled' })
  view.unmount()
  render(<TaskConfirmations taskKey="otp" items={[condition]} saved={saved} onSave={save} />)
  expect(screen.getByLabelText('Condition / obligation').value).toBe('Linked sale')
  expect(screen.getByLabelText('Responsible person').value).toBe('Buyer')
})

it('requires an answer before saving a populated register and preserves the row after a failed save', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Save unconfirmed'))
  render(<TaskConfirmations taskKey="otp" items={[condition]} saved={{}} onSave={save} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
  fireEvent.change(screen.getByLabelText('Condition / obligation'), { target: { value: 'Deposit' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save answers' }))
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('group', { name: condition.label })).getByRole('button', { name: 'Yes' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save answers' }))
  await waitFor(() => expect(screen.getByText('Save unconfirmed')).toBeTruthy())
  expect(screen.getByLabelText('Condition / obligation').value).toBe('Deposit')
})

it('retains distinct accounts for a shared bond and prevents changes in a read-only task', () => {
  const item = { id: 'securities', label: 'Security review', answers: ['yes', 'no'], register: SECURITY_ACCOUNT_REGISTER }
  render(<TaskConfirmations taskKey="allocation" items={[item]} disabled saved={{ securities: { answer: 'yes', items: [
    { id: '1', bondReference: 'B123', account: 'Account 1' }, { id: '2', bondReference: 'B123', account: 'Account 2' },
  ] } }} onSave={vi.fn()} />)
  expect(screen.getAllByLabelText('Registered bond reference').map(input => input.value)).toEqual(['B123', 'B123'])
  expect(screen.getAllByLabelText('Loan account / no account basis').map(input => input.value)).toEqual(['Account 1', 'Account 2'])
  expect(screen.getByRole('button', { name: 'Add item' }).disabled).toBe(true)
  expect(screen.getAllByRole('group').filter(group => group.tagName === 'FIELDSET').every(group => group.disabled)).toBe(true)
})
