// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RentalTenantApplicationProfile from '../RentalTenantApplicationProfile'
import { savePersistedRentalApplication } from '../../../services/rentals/rentalApplicationRepository.js'
vi.mock('../../../services/rentals/rentalApplicationRepository.js', () => ({ savePersistedRentalApplication: vi.fn(), getRentalApplicationReview: vi.fn().mockResolvedValue({ documents: [] }) }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const application = { id: 'app', status: 'draft', version: 2, vacancyId: 'vacancy', data: { identity: { firstName: 'Alex', email: 'a@example.test', customKey: 'retained' }, employment: { employer: 'Acme' }, income: { monthlyIncome: '20000' }, rentalHistory: { currentAddress: 'Saved address' }, property: { title: '12 Main Road' }, extra: { retained: true } } }
const lead = { name: 'Alex Tenant', email: 'a@example.test' }
it('keeps application answers across steps and saves to the same linked record without losing fields', async () => {
  const onReload = vi.fn().mockResolvedValue()
  savePersistedRentalApplication.mockResolvedValue(application)
  render(<RentalTenantApplicationProfile lead={lead} applications={[application]} onReload={onReload} onSetup={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Updated Alex' } })
  fireEvent.click(screen.getByRole('button', { name: /Affordability/ }))
  fireEvent.change(screen.getByLabelText('Other monthly income'), { target: { value: '1500' } })
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  expect(screen.getByLabelText('First name').value).toBe('Updated Alex')
  fireEvent.click(screen.getByRole('button', { name: 'Save application profile' }))
  await waitFor(() => expect(savePersistedRentalApplication).toHaveBeenCalledWith(application, expect.objectContaining({ identity: expect.objectContaining({ firstName: 'Updated Alex', customKey: 'retained' }), employment: { employer: 'Acme' }, income: { monthlyIncome: '20000', otherIncome: '1500' }, extra: { retained: true } })))
  await waitFor(() => expect(onReload).toHaveBeenCalled())
})
it('retains unsaved answers when saving fails', async () => {
  savePersistedRentalApplication.mockRejectedValue(new Error('Version conflict'))
  render(<RentalTenantApplicationProfile lead={lead} applications={[application]} onReload={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Draft name' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save application profile' }))
  await screen.findByText('Version conflict')
  expect(screen.getByLabelText('First name').value).toBe('Draft name')
})
it('does not let agents overwrite a submitted application', () => {
  render(<RentalTenantApplicationProfile lead={lead} applications={[{ ...application, status: 'submitted' }]} />)
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  expect(screen.getByLabelText('First name').disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'Save application profile' })).toBeNull()
})
it('starts through the existing property and onboarding flow and provides the document workspace', () => {
  const onSetup = vi.fn()
  render(<RentalTenantApplicationProfile lead={lead} onSetup={onSetup} documentsContent={<p>Existing FICA workspace</p>} />)
  fireEvent.click(screen.getByRole('button', { name: 'Choose property' }))
  expect(onSetup).toHaveBeenCalled()
  expect(screen.getByText('Existing FICA workspace')).toBeTruthy()
})
it('retains the draft when leaving the profile and blocks overwriting a newer application version', async () => {
  const draftsRef = { current: new Map() }
  const first = render(<RentalTenantApplicationProfile draftsRef={draftsRef} lead={lead} applications={[application]} onReload={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Unsent edits' } })
  first.unmount()
  render(<RentalTenantApplicationProfile draftsRef={draftsRef} lead={lead} applications={[{ ...application, version: 3 }]} onReload={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  expect(screen.getByLabelText('First name').value).toBe('Unsent edits')
  fireEvent.click(screen.getByRole('button', { name: 'Save application profile' }))
  await screen.findByText(/Application changed elsewhere. Your edits are retained/)
  expect(savePersistedRentalApplication).not.toHaveBeenCalled()
})
it('keeps a saved snapshot if reloading the workspace fails after the database accepted the save', async () => {
  const draftsRef = { current: new Map() }
  savePersistedRentalApplication.mockImplementation(async (current, patch) => ({ ...current, version: current.version + 1, data: patch }))
  const first = render(<RentalTenantApplicationProfile draftsRef={draftsRef} lead={lead} applications={[application]} onReload={vi.fn().mockRejectedValue(new Error('Reload unavailable'))} />)
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Saved Alex' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save application profile' }))
  await screen.findByText('Reload unavailable'); first.unmount()
  render(<RentalTenantApplicationProfile draftsRef={draftsRef} lead={lead} applications={[application]} onReload={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  expect(screen.getByLabelText('First name').value).toBe('Saved Alex')
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0825550100' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save application profile' }))
  await waitFor(() => expect(savePersistedRentalApplication.mock.calls[1][0].version).toBe(3))
})
