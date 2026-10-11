// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClientIdentityPanel from './ClientIdentityPanel'
import { loadClientMergeHistory, mergeClientIdentities, saveClientIdentity } from '../../services/clientIdentityService'
vi.mock('../../services/clientIdentityService', () => ({ loadClientMergeHistory: vi.fn(), mergeClientIdentities: vi.fn(), saveClientIdentity: vi.fn() }))
const client = { id: 'client:a', identityId: 'a', identityVersion: 3, organisationId: 'agency', name: 'Alex Smith', email: 'a@example.test', emails: ['a@example.test'], phone: '27821234567', phones: ['27821234567'], canManageIdentity: true, linkedLeadIds: ['lead-a'], linkedRecords: [{ kind: 'lead', id: 'lead-a', path: '/pipeline/leads/lead-a', label: 'The Lyle enquiry' }] }
const other = { ...client, id: 'client:b', identityId: 'b', email: 'b@example.test', emails: ['b@example.test'], linkedLeadIds: ['lead-b'], linkedRecords: [] }
const show = (props = {}) => render(<MemoryRouter><ClientIdentityPanel client={client} clients={[client, other]} {...props} /></MemoryRouter>)
beforeEach(() => { loadClientMergeHistory.mockResolvedValue([]); saveClientIdentity.mockResolvedValue({}); mergeClientIdentities.mockResolvedValue({ client_id: 'a' }) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('editing saves alternative emails while retaining the stable client ID and links', async () => {
  const onChanged = vi.fn().mockResolvedValue(undefined)
  show({ onChanged })
  fireEvent.click(screen.getByRole('button', { name: 'Edit contact details' }))
  fireEvent.change(screen.getByLabelText('Email addresses'), { target: { value: 'preferred@example.test\na@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save contact details' }))
  await waitFor(() => expect(onChanged).toHaveBeenCalledWith('a'))
  expect(saveClientIdentity).toHaveBeenCalledWith(client, { name: 'Alex Smith', emails: ['preferred@example.test', 'a@example.test'], phones: ['27821234567'] })
  expect(screen.getByRole('link', { name: 'The Lyle enquiry' }).getAttribute('href')).toBe('/pipeline/leads/lead-a')
})

test('merging requires a reason and confirmation and respects the retained profile choice', async () => {
  const onChanged = vi.fn().mockResolvedValue(undefined)
  mergeClientIdentities.mockResolvedValue({ client_id: 'b' })
  show({ onChanged })
  fireEvent.click(screen.getByRole('button', { name: 'Review merge' }))
  const merge = screen.getByRole('button', { name: 'Merge profiles' })
  expect(merge.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Keep primary details from'), { target: { value: 'other' } })
  fireEvent.change(screen.getByLabelText('Reason for merging'), { target: { value: 'Client confirmed both emails' } })
  expect(merge.disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(merge)
  await waitFor(() => expect(onChanged).toHaveBeenCalledWith('b'))
  expect(mergeClientIdentities).toHaveBeenCalledWith(other, client, 'Client confirmed both emails')
})

test('rejected merges remain reviewable and never pretend to succeed', async () => {
  mergeClientIdentities.mockRejectedValue(new Error('Client details changed. Reload both profiles before merging.'))
  const onChanged = vi.fn()
  show({ onChanged })
  fireEvent.click(screen.getByRole('button', { name: 'Review merge' }))
  fireEvent.change(screen.getByLabelText('Reason for merging'), { target: { value: 'Reviewed' } })
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Merge profiles' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('details changed'))
  expect(onChanged).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Merge profiles' })).toBeTruthy()
})

test('staff permissions and missing setup do not expose mutation controls', () => {
  const { unmount } = show({ client: { ...client, canManageIdentity: false } })
  expect(screen.queryByRole('button', { name: 'Review merge' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Edit contact details' })).toBeNull()
  unmount()
  show({ client: { ...client, identityId: null, canManageIdentity: false } })
  expect(screen.getByText(/awaiting database setup/)).toBeTruthy()
  expect(mergeClientIdentities).not.toHaveBeenCalled()
})
