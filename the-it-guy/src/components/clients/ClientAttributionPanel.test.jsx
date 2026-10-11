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
  expect(screen.getAllByText('lyle-launch')).toHaveLength(3)
  expect(screen.getByText(/1 of 1 linked enquiries/)).toBeTruthy()
  expect(screen.getByText('Historical enquiry record')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Open enquiry' }).getAttribute('href')).toBe('/pipeline/leads/lead-a')
})
test('pagination deduplicates rows and refresh reloads the summary', async () => {
  loadClientAttribution.mockResolvedValueOnce({ ...result, nextCursor: { id: touch.id, occurred_at: touch.occurred_at } }).mockResolvedValueOnce({ ...result, summary: null, touches: [touch, { ...touch, id: 'touch-b', utm_source: 'google' }] })
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Load older enquiries' }))
  await screen.findByText('google')
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
