// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }))
vi.mock('../../../services/transactionSellerCaptureService.js', () => ({ loadTransactionSellerCapture: mocks.load, saveTransactionSellerCapture: mocks.save }))
vi.mock('../../location/AddressInput', () => ({ default: ({ addressSearch: _address, ...props }) => <input {...props} /> }))
vi.mock('../../ui/Field.jsx', () => ({ default: ({ as: Tag = 'input', addressSearch: _address, ...props }) => <Tag {...props} /> }))
import TransactionSellerCapturePanel from '../TransactionSellerCapturePanel.jsx'
const personId = '00000000-0000-4000-8000-000000000802'
const context = { details: { name: 'Owner A', email: 'old@example.test', phone: '' }, revision: { listingId: null, participantId: personId, formUpdatedAt: 'original' }, roster: [{ id: personId, name: 'Owner A' }], profile: {} }
beforeEach(() => { mocks.load.mockResolvedValue(context); mocks.save.mockReset() })
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('offers full manual seller details without lead creation, onboarding or document requirements', async () => {
  render(<TransactionSellerCapturePanel transactionId="tx" canEdit />)
  fireEvent.change(await screen.findByLabelText('Legal owner type'), { target: { value: 'individual' } })
  expect(screen.getByLabelText('First name')).toBeTruthy()
  expect(screen.getByLabelText('ID number')).toBeTruthy()
  expect(screen.getByLabelText('Income tax number')).toBeTruthy()
  expect(screen.getByLabelText('Occupation or business activity')).toBeTruthy()
  expect(screen.queryByText('Property and ownership details')).toBeNull()
  expect(screen.queryByText('Document requirements')).toBeNull()
  expect(screen.queryByText('POPI consent')).toBeNull()
  expect(mocks.save).not.toHaveBeenCalled()
})
it('saves a partial draft and original revision, then reopens from its confirmed receipt', async () => {
  mocks.save.mockImplementation(async ({ profile, mutationId }) => ({ ...context, revision: { ...context.revision, formUpdatedAt: 'saved' }, details: { ...context.details, name: 'Jamie Owner' }, profile, mutationId }))
  render(<TransactionSellerCapturePanel transactionId="tx" canEdit />)
  fireEvent.change(await screen.findByLabelText('Legal owner type'), { target: { value: 'individual' } })
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Jamie' } })
  fireEvent.change(screen.getByLabelText('Surname'), { target: { value: 'Owner' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save seller details' }))
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Seller details saved to this transaction.')
  expect(mocks.save.mock.calls[0][0].context.revision.formUpdatedAt).toBe('original')
  expect(mocks.save.mock.calls[0][0].profile.people[0].id).toBe(personId)
  expect(screen.getByLabelText('First name').value).toBe('Jamie')
})
it('retains unsaved entries and uses the identical command after an uncertain save', async () => {
  mocks.save.mockRejectedValue(new Error('Save could not be confirmed'))
  render(<TransactionSellerCapturePanel transactionId="tx" canEdit />)
  fireEvent.change(await screen.findByLabelText('Legal owner type'), { target: { value: 'company' } })
  fireEvent.change(screen.getByLabelText('Company / CC name'), { target: { value: 'History Pty Ltd' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save seller details' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Company / CC name').value).toBe('History Pty Ltd')
  fireEvent.click(screen.getByRole('button', { name: 'Save seller details' }))
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2))
  expect(mocks.save.mock.calls[1][0]).toEqual(mocks.save.mock.calls[0][0])
  expect(mocks.load).toHaveBeenCalledOnce()
})
it('shows a load failure instead of an empty backfill form', async () => {
  mocks.load.mockRejectedValue(new Error('Seller access unavailable'))
  render(<TransactionSellerCapturePanel transactionId="tx" canEdit />)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Seller access unavailable')
  expect(screen.queryByLabelText('Legal owner type')).toBeNull()
})
