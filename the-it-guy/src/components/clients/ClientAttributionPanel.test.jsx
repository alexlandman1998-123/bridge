// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClientAttributionPanel from './ClientAttributionPanel'
import { loadClientAttribution } from '../../services/clientAttributionService'
vi.mock('../../services/clientAttributionService', async original => ({ ...await original(), loadClientAttribution: vi.fn() }))
const client = { identityId: 'a', organisationId: 'agency', identityVersion: 1 }
const touch = { id: 'touch-a', lead_id: 'lead-a', utm_source: 'facebook', utm_campaign: 'lyle-launch', occurred_at: '2026-10-09T10:00:00Z', historical: true }
const result = { available: true, touches: [touch], summary: { firstTouch: touch, latestTouch: touch, enquiryCount: 1, taggedEnquiryCount: 1 }, nextCursor: null }
const show = props => render(<MemoryRouter><ClientAttributionPanel client={client} {...props} /></MemoryRouter>)
beforeEach(() => { loadClientAttribution.mockResolvedValue(result) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('shows first/latest source, campaign details, historical evidence and an enquiry link', async () => {
  show()
  await screen.findByText('First known source')
  expect(screen.getByText('Latest known enquiry source')).toBeTruthy()
  expect(screen.queryByText('lyle-launch')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Facebook' }))
  expect(screen.getByText('lyle-launch')).toBeTruthy()
  expect(screen.getByText(/1 of 1 linked enquiries/)).toBeTruthy()
  expect(screen.getAllByText('Historical enquiry record').length).toBeGreaterThan(0)
  expect(screen.getAllByRole('link', { name: 'Open enquiry' })[0].getAttribute('href')).toBe('/pipeline/leads/lead-a')
})
test('pagination deduplicates rows and refresh reloads the summary', async () => {
  loadClientAttribution.mockResolvedValueOnce({ ...result, nextCursor: { id: touch.id, occurred_at: touch.occurred_at } }).mockResolvedValueOnce({ ...result, summary: null, touches: [touch, { ...touch, id: 'touch-b', utm_source: 'google' }] })
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Load older enquiries' }))
  await screen.findByRole('button', { name: 'Google' })
  expect(screen.getAllByRole('link', { name: 'Open enquiry' })).toHaveLength(2)
  expect(loadClientAttribution).toHaveBeenLastCalledWith({ identityId: 'a' }, { cursor: { id: touch.id, occurred_at: touch.occurred_at }, includeSummary: false })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh sources' }))
  await waitFor(() => expect(loadClientAttribution).toHaveBeenLastCalledWith({ identityId: 'a' }, { cursor: null, includeSummary: true }))
})
test('missing setup and denied reads never masquerade as empty evidence', async () => {
  loadClientAttribution.mockResolvedValueOnce({ available: false, touches: [], summary: null, nextCursor: null })
  const { unmount } = show()
  await screen.findByText(/awaiting database setup/)
  expect(screen.queryByText('No enquiry sources recorded yet.')).toBeNull()
  unmount(); loadClientAttribution.mockRejectedValueOnce(new Error('Access denied'))
  show(); await screen.findByText('Access denied')
  expect(screen.queryByText('No enquiry sources recorded yet.')).toBeNull()
})
test('switching clients discards delayed responses from the previous profile', async () => {
  let resolveOld
  loadClientAttribution.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce({ ...result, touches: [], summary: { firstTouch: null, latestTouch: null, enquiryCount: 0, taggedEnquiryCount: 0 } })
  const { rerender } = show()
  rerender(<MemoryRouter><ClientAttributionPanel client={{ ...client, identityId: 'b' }} /></MemoryRouter>)
  await screen.findByText('No enquiry sources recorded yet.')
  resolveOld(result)
  await waitFor(() => expect(screen.queryByText('lyle-launch')).toBeNull())
})

test('channel, tracking and search filters work together without changing full-history attribution', async () => {
  const unknown = { id: 'unknown', lead_id: 'lead-unknown', occurred_at: '2026-10-10T10:00:00Z' }
  loadClientAttribution.mockResolvedValue({ ...result, touches: [unknown, touch], summary: { ...result.summary, enquiryCount: 2, taggedEnquiryCount: 1 } })
  show()
  await screen.findByText('First known source')
  fireEvent.click(screen.getByRole('button', { name: 'Review untagged enquiries' }))
  expect(screen.getByRole('button', { name: 'Source not captured' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Facebook' })).toBeNull()
  expect(screen.getByRole('img', { name: '50% of linked enquiries have tracking tags' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Unknown/ }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Search source history' }), { target: { value: 'not captured' } })
  expect(screen.getByRole('button', { name: 'Source not captured' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByRole('button', { name: 'Facebook' })).toBeTruthy()
  expect(loadClientAttribution).toHaveBeenCalledTimes(1)
})

test('first-source evidence can be inspected even when it is not in the enquiry page', async () => {
  loadClientAttribution.mockResolvedValue({ ...result, summary: { ...result.summary, firstTouch: { ...touch, id: 'browser', utm_source: 'property24', utm_campaign: null, evidence_kind: 'browser_session', occurred_at: '2026-10-01T10:00:00Z' } } })
  show()
  const first = await screen.findByRole('button', { name: 'Inspect first known source' })
  fireEvent.click(first)
  expect(first.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getAllByText('Captured browser session').length).toBeGreaterThan(0)
  expect(screen.getByText('Property24')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Property24' })).toBeNull()
})

test('journey and recent ordering are reversible and refresh retains selection and detail expansion', async () => {
  const early = { ...touch, id: 'early', lead_id: 'lead-early', utm_source: 'google', occurred_at: '2026-10-08T10:00:00Z' }
  loadClientAttribution.mockResolvedValue({ ...result, touches: [touch, early] })
  show()
  await screen.findByRole('button', { name: 'Google' })
  const buttons = () => Array.from(document.querySelectorAll('.source-touch-toggle')).map(button => button.textContent)
  expect(buttons()).toEqual(['Google', 'Facebook'])
  fireEvent.click(screen.getByRole('button', { name: 'Recent' }))
  expect(buttons()).toEqual(['Facebook', 'Google'])
  fireEvent.click(screen.getByRole('button', { name: 'Facebook' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Search source history' }), { target: { value: 'facebook' } })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh sources' }))
  await waitFor(() => expect(loadClientAttribution).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('button', { name: 'Facebook' }).getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByRole('textbox', { name: 'Search source history' }).value).toBe('facebook')
})
