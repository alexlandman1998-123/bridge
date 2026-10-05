// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
vi.mock('../../../services/transactionHandoffRegisterService', () => ({ readTransactionHandoffRegister: vi.fn(), recoverTransactionHandoff: vi.fn() }))
import { readTransactionHandoffRegister, recoverTransactionHandoff } from '../../../services/transactionHandoffRegisterService'
import TransactionHandoffRegisterPanel from '../TransactionHandoffRegisterPanel'
const entry = { id: 'handoff', required: true, role_type: 'bond_originator', destination_company_name: 'Beta Bond', nomination_status: 'nominated', instruction_status: 'awaiting_signed_otp', invitation_status: 'not_invited', delivery_status: 'not_recorded', acceptance_status: 'awaiting_receipt', exception_keys: [] }
afterEach(() => { cleanup(); vi.resetAllMocks() })
describe('organisation handoff register', () => {
 it('shows separate readiness, delivery and receipt without treating nomination as success', async () => {
  readTransactionHandoffRegister.mockResolvedValue({ items: [entry, { ...entry, id: 'unused', required: false }] })
  render(<TransactionHandoffRegisterPanel transactionId="matter" />)
  expect(await screen.findByText('Beta Bond · Organisation nominated')).toBeTruthy()
  expect(screen.getByText('Awaiting signed OTP')).toBeTruthy()
  expect(screen.getByText('Delivery not confirmed')).toBeTruthy()
  expect(screen.getByText('Awaiting organisation receipt')).toBeTruthy()
  expect(screen.getAllByText('Bond originator')).toHaveLength(1)
 })
 it('reports invitation binding and expiry exceptions for external partners', async () => {
  readTransactionHandoffRegister.mockResolvedValue({ items: [{ ...entry, destination_company_name: null, invited_company_name: 'External Bond', nomination_status: 'invited', invitation_status: 'expired', exception_keys: ['invitation_expired', 'accepted_invitation_not_bound'] }] })
  render(<TransactionHandoffRegisterPanel transactionId="matter" />)
  expect(await screen.findByText('External Bond · Partner invited')).toBeTruthy()
  expect(screen.getByText('Resend the expired partner invitation.')).toBeTruthy()
  expect(screen.getByText('Connect the accepted invitation to the partner organisation.')).toBeTruthy()
 })
 it('makes load failure visible and allows a retry', async () => {
  readTransactionHandoffRegister.mockRejectedValueOnce(new Error('Register unavailable')).mockResolvedValueOnce({ items: [entry] })
  render(<TransactionHandoffRegisterPanel transactionId="matter" />)
  expect((await screen.findByRole('alert')).textContent).toBe('Register unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Refresh handoffs' }))
  expect(await screen.findByText('Beta Bond · Organisation nominated')).toBeTruthy()
 })
 it('shows persisted failures, workspace preparation and recovery actions', async () => {
  readTransactionHandoffRegister.mockResolvedValue({ items: [{ ...entry, delivery_status: 'failed', dispatch_status: 'failed', dispatch_reason: 'retries_exhausted', workspace_prepared_at: '2026-10-04T08:00:00Z' }] })
  render(<TransactionHandoffRegisterPanel transactionId="matter" />)
  expect(await screen.findByText('Delivery needs attention')).toBeTruthy()
  expect(screen.getByText('Prepared for the organisation')).toBeTruthy()
  expect(screen.getByText('Automatic retries stopped. Review the failed handoff.')).toBeTruthy()
 })
 it('shows the replacement held for review without reporting delivery success', async () => {
  readTransactionHandoffRegister.mockResolvedValue({ items: [{ ...entry, assignment_cleanup_status: 'review_required', dispatch_status: 'blocked', dispatch_reason: 'retirement_review_required' }] })
  render(<TransactionHandoffRegisterPanel transactionId="matter" />)
  expect(await screen.findByText('Previous finance work needs review')).toBeTruthy()
  expect(screen.getByText('Review the existing bond work before releasing the replacement handoff.')).toBeTruthy()
  expect(screen.getByText('Delivery not confirmed')).toBeTruthy()
 })
 it('requires a reason, reports a review conflict and refreshes after recovery', async () => {
  readTransactionHandoffRegister.mockResolvedValue({ items: [{ ...entry, dispatch_generation: 3, recovery_actions: ['release_review'] }] })
  recoverTransactionHandoff.mockRejectedValueOnce(new Error('Existing finance owner required')).mockResolvedValueOnce({ success: true })
  render(<TransactionHandoffRegisterPanel transactionId="matter" />)
  const button = await screen.findByRole('button', { name: 'Release reviewed handoff' })
  expect(button.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Review reason'), { target: { value: 'Reviewed existing ownership' } })
  fireEvent.click(button)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Existing finance owner required')
  const first = recoverTransactionHandoff.mock.calls[0][0]
  fireEvent.click(button)
  await vi.waitFor(() => expect(readTransactionHandoffRegister).toHaveBeenCalledTimes(2))
  expect(recoverTransactionHandoff.mock.calls[1][0].requestId).toBe(first.requestId)
  expect(first.generation).toBe(3)
 })
 it('never displays a previous matter when responses arrive out of order', async () => {
  let resolveOld
  readTransactionHandoffRegister.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce({ items: [{ ...entry, destination_company_name: 'Current partner' }] })
  const { rerender } = render(<TransactionHandoffRegisterPanel transactionId="old" />)
  rerender(<TransactionHandoffRegisterPanel transactionId="current" />)
  await screen.findByText('Current partner · Organisation nominated')
  await act(async () => { resolveOld({ items: [entry] }) })
  expect(screen.queryByText('Beta Bond · Organisation nominated')).toBeNull()
 })
})
