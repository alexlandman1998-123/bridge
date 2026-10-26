// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ parties: vi.fn(), profiles: vi.fn(), primary: vi.fn(), sync: vi.fn(), create: vi.fn(), link: vi.fn(), get: vi.fn(), identity: vi.fn(), save: vi.fn(), ids: vi.fn() }))
vi.mock('../../../services/buyerProfileReuseService', () => ({
  createReusableBuyerProfile: mocks.create,
  linkReusableBuyerProfileToTransaction: mocks.link,
  getReusableBuyerProfile: mocks.get,
  saveBuyerProfileIdentity: mocks.identity,
  saveReusableBuyerProfile: mocks.save,
  listReusableBuyerProfileTransactionIds: mocks.ids,
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
  expect(screen.getByText('No buyer details saved')).toBeTruthy()
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

it('keeps an unlinked captured buyer on the same participant when manually capturing', async () => {
  const party = { id: 'captured', participant_name: 'Historical Buyer', participant_email: 'buyer@example.test', is_primary_buyer: true }
  mocks.parties.mockResolvedValue([party])
  mocks.create.mockResolvedValue({ buyer: { id: 'new-profile' }, created: true })
  mocks.link.mockResolvedValue({})
  renderPanel()
  fireEvent.click(await screen.findByRole('button', { name: 'Capture details' }))
  expect(screen.getByLabelText('Full name').value).toBe('Historical Buyer')
  fireEvent.change(screen.getByLabelText('South African ID Number or Passport Number'), { target: { value: '991234' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save buyer details' }))
  await waitFor(() => expect(mocks.link).toHaveBeenCalledWith({ transactionId: 'tx', buyerId: 'new-profile', isPrimary: true, participantId: 'captured' }))
  expect(mocks.create.mock.calls[0][0].profileData.identity_number).toBe('991234')
})

it('loads saved onboarding answers into the inline editor without losing other profile fields', async () => {
  const party = { id: 'person', participant_name: 'Buyer', buyer_party_id: 'profile', is_primary_buyer: true }
  mocks.parties.mockResolvedValue([party])
  mocks.get.mockResolvedValue({ buyer: { id: 'profile', name: 'Buyer' }, profile: { profile_data: { private_saved_note: 'retain' } } })
  mocks.ids.mockResolvedValue([])
  render(<MemoryRouter><TransactionBuyerPartiesPanel transactionId="tx" canEdit embedded primaryParticipantId="person" onboardingDetails={{ identity_number: 'captured-id', seller_name: 'Not buyer', __bridge_flags: { complete: true } }} /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit details' }))
  expect((await screen.findByLabelText('South African ID Number or Passport Number')).value).toBe('captured-id')
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ buyerId: 'profile', profileData: { identity_number: 'captured-id', private_saved_note: 'retain' } }))
})

it('keeps a failed load distinct from an empty backfill and hides capture controls', async () => {
  mocks.parties.mockRejectedValue(new Error('Access unavailable'))
  renderPanel()
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Access unavailable')
  expect(screen.queryByText('No buyer details saved')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Capture buyer manually' })).toBeNull()
})

it('requires an explicit link when manual capture finds an existing profile', async () => {
  mocks.parties.mockResolvedValue([])
  mocks.create.mockResolvedValue({ buyer: { id: 'existing-profile' }, created: false })
  mocks.link.mockResolvedValue({})
  renderPanel()
  fireEvent.click(await screen.findByRole('button', { name: 'Capture buyer manually' }))
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Buyer' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create as primary buyer' }))
  const link = await screen.findByRole('button', { name: 'Link existing buyer profile' })
  expect(mocks.link).not.toHaveBeenCalled()
  fireEvent.click(link)
  await waitFor(() => expect(mocks.link).toHaveBeenCalledOnce())
  expect(mocks.create).toHaveBeenCalledOnce()
})

it('reuses the created profile when linking fails instead of creating another buyer', async () => {
  mocks.parties.mockResolvedValue([])
  mocks.create.mockResolvedValue({ buyer: { id: 'created-profile' }, created: true })
  mocks.link.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValue({})
  renderPanel()
  fireEvent.click(await screen.findByRole('button', { name: 'Capture buyer manually' }))
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Buyer' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create as primary buyer' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Retry linking saved buyer' }))
  await waitFor(() => expect(mocks.link).toHaveBeenCalledTimes(2))
  expect(mocks.create).toHaveBeenCalledOnce()
})
