// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { uploadRentalApplicationFile } from '../../../services/rentals/rentalApplicationFileUpload.js'
import RentalApplicantJourneyPage from '../RentalApplicantJourneyPage.jsx'
import { RENTAL_APPLICATION_SCHEMA_VERSION } from '../../../services/rentals/rentalApplicationFieldContract.js'
vi.mock('../../../services/rentals/rentalApplicationFileUpload.js', () => ({ uploadRentalApplicationFile: vi.fn() }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const data = { schemaVersion: RENTAL_APPLICATION_SCHEMA_VERSION, entity: { type: 'individual' }, identity: { firstName: 'Alex', lastName: 'Tenant', email: 'a@example.test', identityNumber: 'test-passport' }, household: { occupantCount: 1, intendedOccupationDate: '2026-11-01' }, employment: { employmentType: 'employed', employer: 'Acme' }, income: { monthlyIncome: 30000 }, rentalHistory: { currentAddress: '12 Road', reasonForMoving: 'Work' } }
const requirements = ['identity','proof_of_income'].map((purpose) => ({ id: `r-${purpose}`, subjectId: 'primary', scopeKey: 'application', purpose, required: true, active: true, mode: 'active', generation: 1, state: 'received', documentId: purpose === 'identity' ? 'id' : 'income' }))
const response = (payload, ok = true) => Promise.resolve({ ok, json: async () => payload })
function mount() { return render(<MemoryRouter initialEntries={['/rental-application/fake-token']}><Routes><Route path="/rental-application/:token" element={<RentalApplicantJourneyPage />} /></Routes></MemoryRouter>) }
it('saves and resumes answers in the linked application and submits applicant-owned declarations using the saved version', async () => {
  const calls = []
  vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
    calls.push(options)
    if (!options.method) return response({ application: { id: 'app', status: 'draft', version: 2, data, requirements }, documents: [{ id: 'id', document_type: 'identity', status: 'uploaded' }, { id: 'income', document_type: 'proof_of_income', status: 'uploaded' }], expiresAt: '2026-12-01' })
    const body = JSON.parse(options.body)
    return response({ application: { id: 'app', status: options.method === 'PUT' ? 'submitted' : 'draft', version: body.version + 1, data: body.patch || data, requirements } })
  }))
  mount(); await screen.findByRole('button', { name: 'Individual' })
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0825550123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText(/Draft saved/)
  expect(JSON.parse(calls[1].body)).toMatchObject({ version: 2, upgradeSchema: true, patch: { identity: { phone: '0825550123' } } })
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
  vi.stubGlobal('fetch', vi.fn((url, options = {}) => !options.method ? response({ application: { id: 'app', status: 'draft', version: 2, data, requirements } }) : response({ error: 'Application changed. Your answers are retained.' }, false)))
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
it('requires fresh evidence immediately after an identity edit, before saving', async () => {
  vi.stubGlobal('fetch', vi.fn(() => response({ application: { id: 'app', status: 'draft', version: 2, data, requirements }, documents: [{ id: 'id', document_type: 'identity', status: 'accepted' }, { id: 'income', document_type: 'proof_of_income', status: 'accepted' }] })))
  mount(); await screen.findByRole('button', { name: 'Individual' })
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Changed applicant' } })
  fireEvent.click(screen.getByRole('button', { name: /Review & declarations/ }))
  for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox)
  expect(screen.getByRole('button', { name: 'Submit application' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: /Documents & FICA/ }))
  expect(screen.getAllByText('Not uploaded').length).toBeGreaterThanOrEqual(2)
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('saves changed discovery and uploads against the returned requirement generation, then reopens the saved assignment', async () => {
  const newer = requirements.map((row) => ({ ...row, generation: 2, state: 'missing', documentId: null }))
  const uploaded = newer.map((row) => row.purpose === 'identity' ? { ...row, documentId: 'new-file', state: 'received' } : row)
  let persisted = { id: 'app', status: 'draft', version: 2, data, requirements }
  vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
    if (!options.method) return response({ application: persisted, documents: persisted.version > 2 ? [{ id: 'new-file', file_name: 'fresh.pdf', status: 'uploaded' }] : [] })
    const body = JSON.parse(options.body)
    persisted = { ...persisted, version: 3, data: body.patch, requirements: newer }
    return response({ application: persisted })
  }))
  uploadRentalApplicationFile.mockImplementation(async () => {
    persisted = { ...persisted, version: 4, requirements: uploaded }
    return { application: persisted, document: { id: 'new-file', file_name: 'fresh.pdf', status: 'uploaded' } }
  })
  const first = mount(); await screen.findByRole('button', { name: 'Individual' })
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'New applicant' } })
  fireEvent.click(screen.getByRole('button', { name: /Documents & FICA/ }))
  expect(screen.getByText(/Document preview:/)).toBeTruthy()
  const file = new File(['proof'], 'fresh.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('Upload Primary applicant identity'), { target: { files: [file] } })
  await screen.findByText('fresh.pdf uploaded.')
  expect(uploadRentalApplicationFile).toHaveBeenCalledWith(file, expect.objectContaining({ requirementId: 'r-identity', generation: 2 }), 3, expect.any(Function))
  first.unmount(); mount(); await screen.findByRole('button', { name: 'Individual' })
  fireEvent.click(screen.getByRole('button', { name: /Documents & FICA/ }))
  expect(screen.getByText('fresh.pdf · received')).toBeTruthy()
})

it('does not retain another applicant when switching to an invalid link',async () => {
 function SwitchLink() {const navigate=useNavigate();return <button onClick={() => navigate('/rental-application/invalid-token')}>Switch link</button>}
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async () => ({application:{id:'app',status:'draft',version:2,data},documents:[],requirements:[]})}))
 render(<MemoryRouter initialEntries={['/rental-application/valid-token']}><SwitchLink/><Routes><Route path='/rental-application/:token' element={<RentalApplicantJourneyPage/>}/></Routes></MemoryRouter>)
 await screen.findByRole('heading',{name:'Rental application',exact:true})
 fetch.mockResolvedValue({ok:false,json:async () => ({error:'Invalid link'})})
 fireEvent.click(screen.getByRole('button',{name:'Switch link'}))
 await screen.findByRole('heading',{name:'Application unavailable',exact:true})
 expect(screen.queryByRole('heading',{name:'Rental application',exact:true})).toBeNull()
})
