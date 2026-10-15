// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RentalLandlordMandatePanel } from '../RentalLandlordMandatePanel.jsx'
import { searchRentalLandlordContacts, createRentalPropertyLandlord } from '../../../../../services/rentals/rentalLandlordMandateRepository.js'
vi.mock('../../../../../services/rentals/rentalLandlordMandateRepository.js', () => ({ listRentalPropertyLandlords: vi.fn().mockResolvedValue([]), listRentalPropertyMandates: vi.fn().mockResolvedValue([]), getRentalPropertyMarketingReadiness: vi.fn().mockResolvedValue({}), createRentalPropertyLandlord: vi.fn(), createRentalPropertyMandate: vi.fn(), searchRentalLandlordContacts: vi.fn() }))
const property = { id: 'property', organisationId: 'org', branchId: 'branch' }
afterEach(cleanup)
beforeEach(() => { vi.clearAllMocks(); searchRentalLandlordContacts.mockResolvedValue([{ id: 'existing-contact', name: 'Saved Owner', email: 'owner@example.test' }]); createRentalPropertyLandlord.mockResolvedValue({ id: 'relationship' }) })
it('searches saved contacts and links the selected person with explicit ownership and primary-contact choices', async () => {
  render(<RentalLandlordMandatePanel property={property} userId="agent" />)
  fireEvent.change(await screen.findByLabelText('Find existing landlord contact'), { target: { value: 'Saved' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search contacts' }))
  await screen.findByRole('option', { name: 'Saved Owner · owner@example.test' })
  expect(searchRentalLandlordContacts).toHaveBeenCalledWith('org', 'Saved')
  fireEvent.change(screen.getByLabelText('Existing landlord contact'), { target: { value: 'existing-contact' } })
  fireEvent.change(screen.getByLabelText('Ownership %'), { target: { value: '50' } })
  fireEvent.click(screen.getByLabelText('Primary contact'))
  fireEvent.click(screen.getByRole('button', { name: 'Add landlord' }))
  expect(createRentalPropertyLandlord).toHaveBeenCalledWith(expect.objectContaining({ partyId: 'existing-contact', propertyId: 'property', organisationId: 'org', ownershipShare: '50', primaryContact: false }))
  expect(screen.queryByPlaceholderText('Paste existing party ID')).toBeNull()
})
it('shows a failed contact search without offering an arbitrary ID entry', async () => {
  searchRentalLandlordContacts.mockRejectedValue(new Error('Contacts are unavailable in this workspace.'))
  render(<RentalLandlordMandatePanel property={property} userId="agent" />)
  fireEvent.change(await screen.findByLabelText('Find existing landlord contact'), { target: { value: 'Saved' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search contacts' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Contacts are unavailable in this workspace.')
  expect(screen.getByRole('button', { name: 'Add landlord' }).disabled).toBe(true)
})
