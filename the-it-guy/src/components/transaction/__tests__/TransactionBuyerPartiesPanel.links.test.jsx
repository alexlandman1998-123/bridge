// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ parties: vi.fn(), profiles: vi.fn(), primary: vi.fn(), sync: vi.fn() }))
vi.mock('../../../services/buyerProfileReuseService', () => ({
  listTransactionBuyerParties: mocks.parties,
  listReusableBuyerProfiles: mocks.profiles,
  setTransactionPrimaryBuyerParty: mocks.primary,
}))
vi.mock('../../../services/dealSetupService', () => ({ syncDealSetupDownstream: mocks.sync }))
import TransactionBuyerPartiesPanel from '../TransactionBuyerPartiesPanel.jsx'

beforeEach(() => { mocks.profiles.mockResolvedValue([]); mocks.primary.mockResolvedValue(null); mocks.sync.mockResolvedValue(null) })
afterEach(() => { cleanup(); vi.clearAllMocks() })
const renderPanel = () => render(<MemoryRouter><TransactionBuyerPartiesPanel transactionId="tx" canEdit /></MemoryRouter>)

it('shows a missing primary for an empty imported buyer roster without making assignments', async () => {
  mocks.parties.mockResolvedValue([])
  renderPanel()
  await waitFor(() => expect(mocks.parties).toHaveBeenCalledOnce())
  expect(screen.getByText('Primary buyer needed')).toBeTruthy()
  expect(screen.getByText('Add a buyer profile to begin.')).toBeTruthy()
  expect(mocks.primary).not.toHaveBeenCalled()
  expect(mocks.sync).not.toHaveBeenCalled()
})

it('lets the operator resolve conflicting primary flags using the existing assignment action', async () => {
  const first = { id: 'p1', participant_name: 'First Buyer', buyer_party_id: 'b1', is_primary_buyer: true }
  const second = { id: 'p2', participant_name: 'Second Buyer', buyer_party_id: 'b2', is_primary_buyer: true }
  mocks.parties.mockResolvedValueOnce([first, second]).mockResolvedValue([{ ...first, is_primary_buyer: false }, second])
  renderPanel()
  const buttons = await screen.findAllByRole('button', { name: 'Make primary' })
  expect(buttons).toHaveLength(2)
  expect(screen.getByText('Primary buyer needed')).toBeTruthy()
  fireEvent.click(buttons[1])
  await waitFor(() => expect(mocks.primary).toHaveBeenCalledWith({ transactionId: 'tx', participantId: 'p2' }))
  expect(await screen.findByText('Primary: Second Buyer')).toBeTruthy()
})
