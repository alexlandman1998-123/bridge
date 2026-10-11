// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: { rpc: mocks.rpc } }))
import TransactionSellerProfile from '../TransactionSellerProfile.jsx'

const current = (name, email = 'current@example.com') => ({ status: 'current', listing: { sellerOnboarding: { formData: {
  ownerStructureType: 'company', companyName: name, companyRegistrationNumber: 'CURRENT-REG', email, primaryContactName: 'Saved Office',
  companyDirectors: [{ id: 'saved-director', name: 'Dina', surname: 'Director', residentialAddress: 'Saved Home' }], incomeTaxNumber: 'SAVED-TAX',
} } } })
beforeEach(() => { mocks.rpc.mockReset() })
afterEach(cleanup)

it('shows the current shared company fields and refreshes an explicitly cleared contact', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: current('Current Company'), error: null }).mockResolvedValueOnce({ data: current('Current Company', ''), error: null })
  render(<TransactionSellerProfile transactionId="deal" />)
  expect(await screen.findByText('CURRENT-REG')).toBeTruthy()
  expect(screen.getByText('Saved Home')).toBeTruthy()
  expect(screen.getByText('SAVED-TAX')).toBeTruthy()
  expect(screen.getByText('current@example.com')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh profile' }))
  expect(await screen.findByText('Not provided')).toBeTruthy()
  expect(screen.queryByText('current@example.com')).toBeNull()
  expect(mocks.rpc).toHaveBeenLastCalledWith('bridge_get_transaction_seller_profile', { p_transaction_id: 'deal' })
})

it('does not show a previous transaction while a different seller profile is loading', async () => {
  let resolve
  mocks.rpc.mockResolvedValueOnce({ data: current('Old Company'), error: null }).mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const view = render(<TransactionSellerProfile transactionId="old" />)
  expect(await screen.findByText('Old Company')).toBeTruthy()
  view.rerender(<TransactionSellerProfile transactionId="new" />)
  expect(screen.queryByText('Old Company')).toBeNull()
  expect(screen.getByText('Loading seller profile…')).toBeTruthy()
  resolve({ data: current('New Company'), error: null })
  expect(await screen.findByText('New Company')).toBeTruthy()
})

it('does not display current facts for an ambiguous or restricted relationship', async () => {
  mocks.rpc.mockResolvedValue({ data: { status: 'relationship_review_required', listing: current('Never show').listing }, error: null })
  render(<TransactionSellerProfile transactionId="ambiguous" />)
  expect(await screen.findByText(/relationship needs review/)).toBeTruthy()
  expect(screen.queryByText('Never show')).toBeNull()
})

it('an unavailable profile service remains an error instead of falling back to old contact details', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Profile service unavailable' } })
  render(<TransactionSellerProfile transactionId="deal" />)
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Profile service unavailable'))
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
})
