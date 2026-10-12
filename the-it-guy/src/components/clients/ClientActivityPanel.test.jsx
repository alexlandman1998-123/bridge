// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClientActivityPanel from './ClientActivityPanel'
import { loadClientActivity, logClientInteraction } from '../../services/clientActivityService'
vi.mock('../../services/clientActivityService', async (original) => ({ ...await original(), loadClientActivity: vi.fn(), logClientInteraction: vi.fn() }))
const client = { id: 'client:a', identityId: 'a', identityVersion: 3, organisationId: 'agency', name: 'Taylor Smith' }
const event = { id: 'event-a', title: 'Call logged', detail: 'Confirmed viewing', actor_kind: 'staff', actor_name: 'Alex Agent', source_kind: 'lead', source_id: 'lead-a', occurred_at: '2026-10-09T10:00:00Z' }
const show = (props = {}) => render(<MemoryRouter><ClientActivityPanel client={client} {...props} /></MemoryRouter>)
beforeEach(() => { loadClientActivity.mockResolvedValue({ available: true, events: [event], nextCursor: null }); logClientInteraction.mockResolvedValue('saved') })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

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

test('incoming and outgoing views distinguish a campaign response from provider tracking', async () => {
  loadClientActivity.mockResolvedValue({ available: true, nextCursor: null, events: [
    { ...event, id: 'response', title: 'Campaign response recorded', event_type: 'campaign.response', category: 'interaction' },
    { ...event, id: 'sent', title: 'Campaign sent', event_type: 'campaign.sent', category: 'interaction', origin_table: 'email_campaign_recipients', origin_id: 'recipient' },
    { ...event, id: 'open', title: 'Campaign opened', event_type: 'campaign.opened', category: 'interaction', origin_table: 'email_campaign_recipients', origin_id: 'recipient' },
  ] })
  show()
  fireEvent.click(await screen.findByRole('button', { name: /Incoming/ }))
  await screen.findByRole('button', { name: 'Campaign response recorded' })
  expect(screen.queryByRole('button', { name: 'Confirmed viewing' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Outgoing/ }))
  const campaign = screen.getByRole('button', { name: 'Confirmed viewing' })
  expect(screen.queryByRole('button', { name: 'Campaign response recorded' })).toBeNull()
  fireEvent.click(campaign)
  expect(campaign.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByText(/Only a recorded response confirms a reply/)).toBeTruthy()
})

test('refresh preserves expanded details, search and previously loaded older history', async () => {
  const old = { ...event, id: 'older', title: 'Earlier enquiry', occurred_at: '2026-10-08T10:00:00Z' }
  loadClientActivity.mockResolvedValueOnce({ available: true, events: [event], nextCursor: { id: event.id, occurred_at: event.occurred_at } })
    .mockResolvedValueOnce({ available: true, events: [old], nextCursor: null })
    .mockResolvedValueOnce({ available: true, events: [{ ...event, id: 'new', title: 'New update' }, event], nextCursor: { id: event.id, occurred_at: event.occurred_at } })
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Load older activity' }))
  const entry = await screen.findByRole('button', { name: 'Earlier enquiry' })
  fireEvent.click(entry)
  fireEvent.change(screen.getByRole('textbox', { name: 'Search activity' }), { target: { value: 'Earlier' } })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(loadClientActivity).toHaveBeenCalledTimes(3))
  expect(screen.getByRole('button', { name: 'Earlier enquiry' }).getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByRole('textbox', { name: 'Search activity' }).value).toBe('Earlier')
})


test('automatic updates preserve expansion and stop while updates are paused', async () => {
  show()
  const entry = await screen.findByRole('button', { name: 'Call logged' })
  fireEvent.click(entry)
  fireEvent.click(screen.getByRole('switch'))
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('switch'))
  loadClientActivity.mockResolvedValue({ available: true, nextCursor: null, events: [
    { ...event, id: 'new-update', title: 'New incoming lead', occurred_at: '2026-10-10T10:00:00Z' }, event,
  ] })
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(screen.getByRole('button', { name: 'Call logged' }).getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByRole('button', { name: 'New incoming lead' })).toBeTruthy()
  const requests = loadClientActivity.mock.calls.length
  fireEvent.click(screen.getByRole('switch'))
  await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
  expect(loadClientActivity).toHaveBeenCalledTimes(requests)
})
