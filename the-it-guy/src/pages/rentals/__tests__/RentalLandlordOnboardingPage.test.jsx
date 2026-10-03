// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import Page from '../RentalLandlordOnboardingPage.jsx'
const mocks = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('../../../services/rentals/rentalApplicationFileUpload.js', () => ({
  uploadRentalApplicationFile: mocks.upload,
}))
const fresh = () => ({
  id: 'lead',
  version: 2,
  status: 'draft',
  data: {
    profile: { type: 'individual', name: 'Owner', email: 'owner@example.test' },
    portfolio: [{ id: 'home', address: 'One Road', title: 'Home' }],
  },
  requirements: [
    {
      id: 'req',
      generation: 1,
      active: true,
      subjectId: 'primary',
      scopeKey: 'identity',
      purpose: 'identity',
      state: 'missing',
    },
  ],
  documents: [],
})
const open = () =>
  render(
    <MemoryRouter initialEntries={['/rental-landlord-onboarding/test-token']}>
      <Routes>
        <Route path="/rental-landlord-onboarding/:token" element={<Page />} />
      </Routes>
    </MemoryRouter>,
  )
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ onboarding: fresh() }),
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('retains failed edits and disables upload until discovery is saved', async () => {
  open()
  await screen.findByText('Who is the landlord?')
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Updated owner' },
  })
  expect(
    screen.getByLabelText('Upload Updated owner: Identity evidence').disabled,
  ).toBe(true)
  fetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: 'Onboarding changed; reopen' }),
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save landlord details' }))
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Onboarding changed',
  )
  expect(screen.getByLabelText('Name').value).toBe('Updated owner')
  expect(
    screen.getByRole('button', { name: 'Send onboarding for review' }).disabled,
  ).toBe(true)
})
it('uses the acknowledged version and generation for uploads and restores the file on reopen', async () => {
  const saved = {
    ...fresh(),
    version: 3,
    data: {
      ...fresh().data,
      profile: { ...fresh().data.profile, name: 'Updated owner' },
    },
    requirements: [{ ...fresh().requirements[0], generation: 2 }],
  }
  open()
  await screen.findByText('Who is the landlord?')
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Updated owner' },
  })
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ onboarding: saved }),
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save landlord details' }))
  await screen.findByText(
    'Landlord details saved. You can return using the same link.',
  )
  const uploaded = {
    ...saved,
    version: 4,
    requirements: [
      { ...saved.requirements[0], documentId: 'doc', state: 'received' },
    ],
    documents: [{ id: 'doc', file_name: 'ID.pdf', status: 'uploaded' }],
  }
  mocks.upload.mockResolvedValue({ onboarding: uploaded })
  const file = new File(['ID'], 'ID.pdf', { type: 'application/pdf' })
  fireEvent.change(
    screen.getByLabelText('Upload Updated owner: Identity evidence'),
    { target: { files: [file] } },
  )
  await screen.findByText('ID.pdf · received')
  expect(mocks.upload.mock.calls[0].slice(0, 3)).toEqual([
    file,
    {
      requirementId: 'req',
      generation: 2,
      subjectId: 'primary',
      purpose: 'identity',
    },
    3,
  ])
  cleanup()
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ onboarding: uploaded }),
  })
  open()
  await screen.findByText('ID.pdf · received')
})
it('keeps the committed version after readback fails and makes a follow-up save with it', async () => {
  open()
  await screen.findByText('Who is the landlord?')
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      saved: true,
      version: 3,
      status: 'draft',
      checklistUnavailable: true,
    }),
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save landlord details' }))
  await screen.findByRole('alert')
  expect(screen.queryByLabelText('Upload Owner: Identity evidence')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save landlord details' }))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
  expect(JSON.parse(fetch.mock.calls[2][1].body).version).toBe(3)
})
it('requires a declaration and locks submitted discovery and files', async () => {
  open()
  await screen.findByText('Who is the landlord?')
  expect(
    screen.getByRole('button', { name: 'Send onboarding for review' }).disabled,
  ).toBe(true)
  fireEvent.click(screen.getByLabelText(/I confirm these details are accurate/))
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      onboarding: { ...fresh(), version: 3, status: 'submitted' },
    }),
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Send onboarding for review' }),
  )
  await screen.findByText(/Onboarding submitted/)
  expect(screen.getByLabelText('Name').disabled).toBe(true)
  expect(
    screen.queryByRole('button', { name: 'Save landlord details' }),
  ).toBeNull()
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    action: 'submit',
    version: 2,
    declarationAccepted: true,
  })
})

it('clears the previous landlord when a different link is invalid',async () => {
 function SwitchLink() {const navigate=useNavigate();return <button onClick={() => navigate('/rental-landlord-onboarding/invalid-token')}>Switch link</button>}
 render(<MemoryRouter initialEntries={['/rental-landlord-onboarding/test-token']}><SwitchLink/><Routes><Route path='/rental-landlord-onboarding/:token' element={<Page/>}/></Routes></MemoryRouter>)
 await screen.findByText('Who is the landlord?')
 fetch.mockResolvedValue({ok:false,json:async () => ({error:'Invalid link'})})
 fireEvent.click(screen.getByRole('button',{name:'Switch link'}))
 await screen.findByText('Onboarding unavailable')
 expect(screen.queryByLabelText('Name')).toBeNull()
})
