// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RentalTenantApplicationProfile from '../RentalTenantApplicationProfile'
import { uploadRentalApplicationEvidence } from '../../../services/rentals/rentalApplicationEvidenceService.js'
import { savePersistedRentalApplication, getRentalApplicationReview } from '../../../services/rentals/rentalApplicationRepository.js'
import { rentalApplicationFieldScenario } from '../../../../server/tests/fixtures/rentalApplicationFieldScenario.js'
vi.mock('../../../services/rentals/rentalApplicationRepository.js', () => ({ savePersistedRentalApplication: vi.fn(), getRentalApplicationReview: vi.fn().mockResolvedValue({ documents: [], version: 2, requirements: [] }) }))
vi.mock('../../../services/rentals/rentalApplicationEvidenceService.js', () => ({ uploadRentalApplicationEvidence: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const application = { id: 'app', status: 'draft', version: 2, vacancyId: 'vacancy', data: { identity: { firstName: 'Alex', email: 'a@example.test', customKey: 'retained' }, employment: { employer: 'Acme' }, income: { monthlyIncome: '20000' }, rentalHistory: { currentAddress: 'Saved address' }, property: { title: '12 Main Road' }, extra: { retained: true } } }
const lead = { name: 'Alex Tenant', email: 'a@example.test' }
it.each(['individual', 'joint_individuals', 'company', 'close_corporation', 'trust'])('displays saved %s applicant answers in the agent profile without allowing submitted edits', async (type) => {
  const data = { ...rentalApplicationFieldScenario(type), property: { title: 'Confirmed rental home', monthlyRent: 11000, depositAmount: 22000 } }
  render(<RentalTenantApplicationProfile applications={[{ id: 'mapped-app', status: 'submitted', version: 2, data }]} lead={lead} />)
  if (['company', 'close_corporation', 'trust'].includes(type)) expect(screen.getByLabelText('Registered name').value).toBe(data.entity.legalName)
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  expect(screen.getAllByLabelText('First name')[0].value).toBe(data.identity.firstName)
  expect(screen.getAllByLabelText('First name')[1].value).toBe(data.people[0].firstName)
  expect(screen.getByLabelText('Emergency contact name').value).toBe(data.contacts.emergencyContactName)
  expect(screen.getAllByLabelText('First name').every((input) => input.disabled)).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: /Household & property/ }))
  expect(screen.getByText('Confirmed rental home')).toBeTruthy()
  expect(screen.getByLabelText('Intended move date').value).toBe(data.household.intendedOccupationDate)
  fireEvent.click(screen.getByRole('button', { name: /Affordability/ }))
  expect(screen.getByLabelText('Monthly income').value).toBe('25000')
  expect(screen.getByLabelText('Other monthly income').value).toBe('0')
  fireEvent.click(screen.getByRole('button', { name: /Rental history & references/ }))
  expect(screen.getByLabelText('Current address').value).toBe(data.rentalHistory.currentAddress)
  expect(screen.getByLabelText('Reference type').value).toBe(data.references[0].type)
  expect(screen.queryByRole('button', { name: 'Save application profile' })).toBeNull()
  await waitFor(() => expect(getRentalApplicationReview).toHaveBeenCalledWith('mapped-app'))
})
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
  getRentalApplicationReview.mockResolvedValue({ documents: [], version: 3, requirements: [] })
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

it('uses the requirement generation returned after the agent saves discovery before uploading', async () => {
  const requirements = [{ id: 'saved-identity', scopeKey: 'application', subjectId: 'primary', purpose: 'identity', active: true, required: true, mode: 'active', generation: 2, state: 'missing' }]
  savePersistedRentalApplication.mockImplementation(async (current, patch) => ({ ...current, version: 3, data: patch }))
  getRentalApplicationReview.mockResolvedValue({ version: 3, documents: [], requirements })
  uploadRentalApplicationEvidence.mockImplementation(async (current) => ({ application: { ...current, version: 4, requirements: requirements.map((row) => ({ ...row, documentId: 'new', state: 'received' })) }, document: { id: 'new', file_name: 'agent.pdf', status: 'uploaded' } }))
  render(<RentalTenantApplicationProfile lead={lead} applications={[application]} />)
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Changed person' } })
  fireEvent.click(screen.getByRole('button', { name: /Documents & FICA/ }))
  const file = new File(['proof'], 'agent.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('Upload Primary applicant identity'), { target: { files: [file] } })
  await screen.findByText('agent.pdf uploaded.')
  expect(uploadRentalApplicationEvidence).toHaveBeenCalledWith(expect.objectContaining({ version: 3 }), file, expect.objectContaining({ requirementId: 'saved-identity', generation: 2 }))
})
