// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RentalApplicationFeeSettingsPage from '../RentalApplicationFeeSettingsPage.jsx'
import { getRentalApplicationFeeSettings, saveRentalApplicationFeeSettings } from '../../../services/rentals/rentalApplicationFeeSettingsService.js'
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentWorkspace: { id: 'org-one' } }) }))
vi.mock('../../../services/rentals/rentalApplicationFeeSettingsService.js', () => ({ getRentalApplicationFeeSettings: vi.fn(), saveRentalApplicationFeeSettings: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('saves the organisation fee with its version and retains edits on a failed save', async () => {
  getRentalApplicationFeeSettings.mockResolvedValue({ amount: 0, paymentInstructions: '', version: 0, canEdit: true })
  saveRentalApplicationFeeSettings.mockRejectedValueOnce(new Error('Rental settings changed. Reload before saving')).mockResolvedValueOnce({ amount: 350, payment_instructions: 'Pay after submission', version: 1 })
  render(<MemoryRouter><RentalApplicationFeeSettingsPage /></MemoryRouter>)
  const amount = await screen.findByLabelText(/Total application fee/)
  expect(getRentalApplicationFeeSettings).toHaveBeenCalledWith('org-one')
  fireEvent.change(amount, { target: { value: '350' } })
  fireEvent.change(screen.getByLabelText(/Payment instructions/), { target: { value: 'Pay after submission' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save rental settings' }))
  await screen.findByRole('alert')
  expect(amount.value).toBe('350')
  expect(saveRentalApplicationFeeSettings).toHaveBeenCalledWith('org-one', { amount: '350', paymentInstructions: 'Pay after submission', version: 0, canEdit: true })
  fireEvent.click(screen.getByRole('button', { name: 'Save rental settings' }))
  await screen.findByRole('status')
})
it('shows settings to an agent without allowing edits', async () => {
  getRentalApplicationFeeSettings.mockResolvedValue({ amount: 350, paymentInstructions: 'Pay after submission', version: 1, canEdit: false })
  render(<MemoryRouter><RentalApplicationFeeSettingsPage /></MemoryRouter>)
  expect((await screen.findByLabelText(/Total application fee/)).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Save rental settings' }).disabled).toBe(true)
})
it('saves optional policy guidance without forcing an affordability threshold', async () => {
  getRentalApplicationFeeSettings.mockResolvedValue({ amount: 0, paymentInstructions: '', version: 0, canEdit: true, policy: {} })
  saveRentalApplicationFeeSettings.mockResolvedValue({ amount: 0, payment_instructions: '', version: 1, application_policy_json: { documentMonths: 6, sponsorPolicy: 'considered' } })
  render(<MemoryRouter><RentalApplicationFeeSettingsPage /></MemoryRouter>)
  const period = await screen.findByLabelText('Income document period (months)')
  expect(screen.getByLabelText('Rent / net income guideline (%)').value).toBe('')
  fireEvent.change(period, { target: { value: '6' } })
  fireEvent.change(screen.getByLabelText('Sponsor preference'), { target: { value: 'considered' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save rental settings' }))
  await screen.findByRole('status')
  expect(saveRentalApplicationFeeSettings).toHaveBeenCalledWith('org-one', expect.objectContaining({ policy: { documentMonths: '6', sponsorPolicy: 'considered' } }))
})
