// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RentalApplicantJourneyPage from '../RentalApplicantJourneyPage.jsx'
import { RENTAL_APPLICATION_SCHEMA_VERSION } from '../../../services/rentals/rentalApplicationFieldContract.js'
vi.mock('../../../services/rentals/rentalApplicationFileUpload.js', () => ({ uploadRentalApplicationFile: vi.fn() }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const data = { schemaVersion: RENTAL_APPLICATION_SCHEMA_VERSION, entity: { type: 'individual' }, identity: { firstName: 'Alex', lastName: 'Tenant', email: 'a@example.test', identityNumber: 'test-passport' }, household: { occupantCount: 1, intendedOccupationDate: '2026-11-01' }, employment: { employmentType: 'employed', employer: 'Acme' }, income: { monthlyIncome: 30000 }, rentalHistory: { currentAddress: '12 Road', reasonForMoving: 'Work' } }
const response = (payload, ok = true) => Promise.resolve({ ok, json: async () => payload })
function mount() { return render(<MemoryRouter initialEntries={['/rental-application/fake-token']}><Routes><Route path="/rental-application/:token" element={<RentalApplicantJourneyPage />} /></Routes></MemoryRouter>) }
it('saves and resumes answers in the linked application and submits applicant-owned declarations using the saved version', async () => {
  const calls = []
  vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
    calls.push(options)
    if (!options.method) return response({ application: { id: 'app', status: 'draft', version: 2, data }, documents: [{ id: 'id', document_type: 'identity', status: 'uploaded' }, { id: 'income', document_type: 'proof_of_income', status: 'uploaded' }], expiresAt: '2026-12-01' })
    const body = JSON.parse(options.body)
    return response({ application: { id: 'app', status: options.method === 'PUT' ? 'submitted' : 'draft', version: body.version + 1, data: body.patch || data } })
  }))
  mount(); await screen.findByRole('button', { name: 'Individual' })
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Updated Alex' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText(/Draft saved/)
  expect(JSON.parse(calls[1].body)).toMatchObject({ version: 2, upgradeSchema: true, patch: { identity: { firstName: 'Updated Alex' } } })
  fireEvent.click(screen.getByRole('button', { name: /Review & declarations/ }))
  expect(screen.getByRole('button', { name: 'Submit application' }).disabled).toBe(true)
  for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox)
  fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))
  await screen.findByRole('heading', { name: 'Application submitted' })
  const submission = calls.find((item) => item.method === 'PUT')
  expect(JSON.parse(submission.body)).toEqual({ action: 'submit', version: 4, declarationAccepted: true, consents: ['privacy', 'credit_check', 'identity_verification'] })
  expect(calls.every((item) => item.headers.Authorization === 'Bearer fake-token')).toBe(true)
})
it('retains entered answers when a save fails and stays on the same step', async () => {
  vi.stubGlobal('fetch', vi.fn((url, options = {}) => !options.method ? response({ application: { id: 'app', status: 'draft', version: 2, data } }) : response({ error: 'Application changed. Your answers are retained.' }, false)))
  mount(); await screen.findByRole('button', { name: 'Individual' })
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Unsaved Alex' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('First name').value).toBe('Unsaved Alex')
  expect(screen.getByText('Step 2 of 8')).toBeTruthy()
})
it('shows expiry failure without rendering the application fields', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => response({ error: 'This application link is invalid or has expired.' }, false)))
  mount(); await screen.findByRole('heading', { name: 'Application unavailable' })
  await waitFor(() => expect(screen.queryByLabelText('First name')).toBeNull())
})
