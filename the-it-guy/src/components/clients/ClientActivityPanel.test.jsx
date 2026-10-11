// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClientActivityPanel from './ClientActivityPanel'
import { loadClientActivity, logClientInteraction } from '../../services/clientActivityService'
vi.mock('../../services/clientActivityService', async (original) => ({ ...await original(), loadClientActivity: vi.fn(), logClientInteraction: vi.fn() }))
const client = { id: 'client:a', identityId: 'a', identityVersion: 3, organisationId: 'agency', name: 'Taylor Smith' }
const event = { id: 'event-a', title: 'Call logged', detail: 'Confirmed viewing', actor_kind: 'staff', actor_name: 'Alex Agent', source_kind: 'lead', source_id: 'lead-a', occurred_at: '2026-10-09T10:00:00Z' }
const show = (props = {}) => render(<MemoryRouter><ClientActivityPanel client={client} {...props} /></MemoryRouter>)
beforeEach(() => { loadClientActivity.mockResolvedValue({ available: true, events: [event], nextCursor: null }); logClientInteraction.mockResolvedValue('saved') })
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('renders dates, actor and source links, and filters through the paged reader', async () => {
  show()
  await screen.findByText('Confirmed viewing')
  expect(screen.getByText('Recorded by Alex Agent')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Open linked record' }).getAttribute('href')).toBe('/pipeline/leads/lead-a')
  fireEvent.change(screen.getByLabelText('Activity filter'), { target: { value: 'appointment' } })
  await waitFor(() => expect(loadClientActivity).toHaveBeenLastCalledWith({ identityId: 'a', organisationId: 'agency' }, { category: 'appointment', cursor: null }))
})

test('loads older events without duplicating a repeated row', async () => {
  loadClientActivity.mockResolvedValueOnce({ available: true, events: [event], nextCursor: { id: event.id, occurred_at: event.occurred_at } }).mockResolvedValueOnce({ available: true, events: [event, { ...event, id: 'event-b', title: 'Earlier enquiry' }], nextCursor: null })
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Load older activity' }))
  await screen.findByText('Earlier enquiry')
  expect(screen.getAllByText('Call logged')).toHaveLength(1)
})

test('logs an interaction and refreshes the directory without sending email', async () => {
  const onChanged = vi.fn().mockResolvedValue(undefined)
  show({ onChanged })
  await screen.findByText('Confirmed viewing')
  fireEvent.click(screen.getByRole('button', { name: 'Log interaction' }))
  fireEvent.change(screen.getByLabelText('Interaction type'), { target: { value: 'email' } })
  fireEvent.change(screen.getByLabelText('Interaction details'), { target: { value: 'Discussed The Lyle launch' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save interaction' }))
  await waitFor(() => expect(onChanged).toHaveBeenCalledWith('a'))
  expect(logClientInteraction).toHaveBeenCalledWith(client, expect.objectContaining({ type: 'email', detail: 'Discussed The Lyle launch', requestId: expect.any(String) }))
  expect(screen.getByRole('status').textContent).toContain('does not send a message')
})

test('an uncertain save keeps its request ID on retry and does not claim success', async () => {
  logClientInteraction.mockRejectedValueOnce(new Error('Network timeout')).mockResolvedValueOnce('saved')
  show()
  await screen.findByText('Confirmed viewing')
  fireEvent.click(screen.getByRole('button', { name: 'Log interaction' }))
  fireEvent.change(screen.getByLabelText('Interaction details'), { target: { value: 'Confirmed launch date' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save interaction' }))
  await screen.findByText('Network timeout')
  const requestId = logClientInteraction.mock.calls[0][1].requestId
  expect(screen.queryByText(/Interaction saved/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save interaction' }))
  await screen.findByText(/Interaction saved/)
  expect(logClientInteraction.mock.calls[1][1].requestId).toBe(requestId)
})

test('missing setup and denied reads stay distinct and do not show misleading empty history', async () => {
  loadClientActivity.mockResolvedValueOnce({ available: false, events: [], nextCursor: null })
  const { unmount } = show()
  await screen.findByText(/awaiting database setup/)
  expect(screen.queryByRole('button', { name: 'Log interaction' })).toBeNull()
  unmount()
  loadClientActivity.mockRejectedValueOnce(new Error('Access denied'))
  show()
  await screen.findByText('Access denied')
  expect(screen.queryByText('No recorded activity yet.')).toBeNull()
})

test('late responses from another client cannot replace the selected timeline', async () => {
  let resolveOld
  loadClientActivity.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce({ available: true, events: [{ ...event, title: 'Other client enquiry' }], nextCursor: null })
  const { rerender } = show()
  rerender(<MemoryRouter><ClientActivityPanel client={{ ...client, identityId: 'b' }} /></MemoryRouter>)
  await screen.findByText('Other client enquiry')
  resolveOld({ available: true, events: [event], nextCursor: null })
  await waitFor(() => expect(screen.queryByText('Call logged')).toBeNull())
})

test('a campaign response refresh signal reloads the activity panel', async () => {
  const client = { identityId: 'campaign-client', organisationId: 'agency', identityVersion: 1 }
  loadClientActivity.mockResolvedValue({ available: true, events: [], nextCursor: null })
  const { rerender } = render(<MemoryRouter><ClientActivityPanel client={client} refreshToken={0} /></MemoryRouter>)
  await waitFor(() => expect(loadClientActivity).toHaveBeenCalledTimes(1))
  rerender(<MemoryRouter><ClientActivityPanel client={client} refreshToken={1} /></MemoryRouter>)
  await waitFor(() => expect(loadClientActivity).toHaveBeenCalledTimes(2))
})
