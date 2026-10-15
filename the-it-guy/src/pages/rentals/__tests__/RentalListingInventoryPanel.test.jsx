// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Panel from '../RentalListingInventoryPanel.jsx'
import { getRentalListingInventory, ensureRentalListingVacancy } from '../../../services/rentals/rentalListingInventoryRepository.js'
vi.mock('../../../services/rentals/rentalListingInventoryRepository.js', () => ({ getRentalListingInventory: vi.fn(), ensureRentalListingVacancy: vi.fn() }))
const connected = { listingId: 'listing', propertyId: 'property', unitId: 'unit', vacancyId: 'vacancy' }
afterEach(cleanup)
beforeEach(() => { vi.clearAllMocks(); getRentalListingInventory.mockResolvedValue({ ...connected, vacancyId: '' }); ensureRentalListingVacancy.mockResolvedValue(connected) })
const show = props => render(<MemoryRouter><Panel listingId="listing" organisationId="org" {...props} /></MemoryRouter>)
it('loads without writing, then connects once on the agent action and opens the saved vacancy', async () => {
  const reload = vi.fn()
  show({ onConnected: reload })
  await screen.findByRole('link', { name: 'Open managed property and units' })
  expect(ensureRentalListingVacancy).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Connect rental vacancy' }))
  const link = await screen.findByRole('link', { name: 'Open rental vacancy' })
  expect(link.getAttribute('href')).toBe('/agent/rentals/vacancies/vacancy')
  expect(ensureRentalListingVacancy).toHaveBeenCalledTimes(1)
  expect(reload).toHaveBeenCalledTimes(1)
})
it('retains the saved property and exposes the blocking reason without claiming a vacancy exists', async () => {
  ensureRentalListingVacancy.mockRejectedValue(new Error('This unit is occupied.'))
  show()
  await screen.findByRole('link', { name: 'Open managed property and units' })
  fireEvent.click(screen.getByRole('button', { name: 'Connect rental vacancy' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'This unit is occupied.')
  expect(screen.queryByRole('link', { name: 'Open rental vacancy' })).toBeNull()
})
it('does not apply a connection after the panel switches to another listing', async () => {
  let complete
  ensureRentalListingVacancy.mockImplementation(() => new Promise(resolve => { complete = resolve }))
  const reload = vi.fn()
  const view = show({ onConnected: reload })
  await screen.findByRole('link', { name: 'Open managed property and units' })
  fireEvent.click(screen.getByRole('button', { name: 'Connect rental vacancy' }))
  getRentalListingInventory.mockResolvedValue({ listingId: 'other', propertyId: 'other-property', unitId: 'other-unit', vacancyId: '' })
  view.rerender(<MemoryRouter><Panel listingId="other" organisationId="org" onConnected={reload} /></MemoryRouter>)
  complete(connected)
  await waitFor(() => expect(screen.getByRole('link', { name: 'Open managed property and units' }).getAttribute('href')).toContain('other-property'))
  expect(screen.queryByRole('link', { name: 'Open rental vacancy' })).toBeNull()
  expect(reload).not.toHaveBeenCalled()
})
