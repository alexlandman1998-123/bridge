// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ListingFacebookPostPanel from '../ListingFacebookPostPanel'
import { buildListingShowDayPostSource } from '../../../services/listings/listingShowDayModel'
const api = vi.hoisted(() => ({ request: vi.fn(), list: vi.fn(), create: vi.fn() }))
vi.mock('../../../services/metaIntegrationService', () => ({ metaIntegrationRequest: api.request }))
vi.mock('../../../services/marketingEventRepository', () => ({ listMarketingEvents: api.list, createMarketingEvent: api.create, canPersistMarketingEvents: () => true }))
const listing = { id: 'listing-one', title: 'Family home', address: '1 Main Road', agentName: 'Host Agent' }
const event = { id: 'event-one', listingId: listing.id, title: 'Open home', address: '1 Main Road', hostName: 'Host Agent', status: 'Upcoming', visibility: 'public', registrationEnabled: true, publicToken: 'event-token', startsAt: '2099-11-15T08:00:00Z', endsAt: '2099-11-15T12:00:00Z' }
const mount = (props = {}) => render(<MemoryRouter><ListingFacebookPostPanel organisationId="org-one" listingId={listing.id} listing={listing} publicListingReady {...props} /></MemoryRouter>)
beforeEach(() => {
  vi.resetAllMocks()
  api.list.mockResolvedValue([event])
  api.request.mockImplementation(async (_org, action, fields = {}) => {
    if (action === 'workspace') return { pages: [{ id: 'page-one', page_name: 'Agency Page', canPost: true }] }
    if (action === 'listing_posts') return { posts: [] }
    if (action === 'preview_post') return { post: { id: 'post-one', status: 'draft', snapshot_json: { caption: fields.caption || 'Listing caption', mode: fields.mode || 'text' } } }
    if (action === 'publish_post') return { post: { id: 'post-one', status: 'published', public_url: 'https://facebook.com/post-one' } }
    throw Error(`Unexpected action ${action}`)
  })
})
afterEach(cleanup)
async function chooseEvent() {
  fireEvent.click(screen.getByRole('radio', { name: /Show day post/ }))
  await screen.findByRole('option', { name: /Open home/ })
  fireEvent.change(screen.getByLabelText('Show day'), { target: { value: event.id } })
}
it('keeps normal posting independent and preserves its caption when switching choices', async () => {
  mount()
  await screen.findByRole('button', { name: 'Preview Facebook post' })
  expect(api.list).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'My independent property post' } })
  await chooseEvent()
  expect(screen.getByLabelText('Caption').value).toContain('RSVP: https://app.arch9.co.za/marketing/rsvp/event-token')
  fireEvent.click(screen.getByRole('radio', { name: /Normal Facebook post/ }))
  expect(screen.getByLabelText('Caption').value).toBe('My independent property post')
  expect(api.create).not.toHaveBeenCalled()
  expect(api.request.mock.calls.some(call => call[1] === 'publish_post')).toBe(false)
})
it('prepares the public date, SAST time and RSVP in a reviewed show day post', async () => {
  mount(); await chooseEvent()
  expect(screen.getByLabelText('Caption').value).toContain('10:00–14:00 SAST')
  expect(screen.getByLabelText('Post format').value).toBe('text')
  expect(screen.queryByRole('option', { name: 'Public listing link' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Preview Facebook post' }))
  await screen.findByRole('dialog', { name: 'Review Facebook post' })
  expect(api.request).toHaveBeenCalledWith('org-one', 'preview_post', expect.objectContaining({ caption: expect.stringContaining('Open home'), mode: 'text' }))
  expect(api.request.mock.calls.some(call => call[1] === 'publish_post')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Publish to Facebook' }))
  await screen.findByText(/Meta accepted this post/)
  expect(api.request.mock.calls.filter(call => call[1] === 'publish_post')).toHaveLength(1)
})
it('blocks a stale or cancelled event before publishing', async () => {
  mount(); await chooseEvent()
  fireEvent.click(screen.getByRole('button', { name: 'Preview Facebook post' }))
  await screen.findByRole('dialog', { name: 'Review Facebook post' })
  api.list.mockResolvedValue([{ ...event, status: 'Cancelled' }])
  fireEvent.click(screen.getByRole('button', { name: 'Publish to Facebook' }))
  await screen.findByText(/This show day has changed/)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(api.request.mock.calls.some(call => call[1] === 'publish_post')).toBe(false)
})
it('does not prepare a preview if refreshing an event fails', async () => {
  mount(); await chooseEvent()
  api.list.mockRejectedValue(Error('Show days unavailable'))
  fireEvent.click(screen.getByRole('button', { name: 'Preview Facebook post' }))
  await screen.findByText('Show days unavailable')
  expect(api.request.mock.calls.some(call => call[1] === 'preview_post')).toBe(false)
})
it('clears the event and draft when changing workspaces', async () => {
  const view = mount(); await chooseEvent()
  view.rerender(<MemoryRouter><ListingFacebookPostPanel organisationId="org-two" listingId="listing-two" /></MemoryRouter>)
  await waitFor(() => expect(screen.getByRole('radio', { name: /Normal Facebook post/ }).checked).toBe(true))
  expect(screen.getByLabelText('Caption').value).toBe('')
  expect(screen.queryByLabelText('Show day')).toBeNull()
})
it('only offers eligible events for this listing', async () => {
  api.list.mockResolvedValue([event, ...[{ status: 'Draft' }, { visibility: 'private' }, { listingId: 'other' }, { publicToken: '' }, { registrationEnabled: false }, { endsAt: '2000-01-01T12:00:00Z' }].map((change, i) => ({ ...event, ...change, id: `excluded-${i}`, title: `Excluded ${i}` }))])
  mount(); await chooseEvent()
  expect(screen.queryByRole('option', { name: /Excluded/ })).toBeNull()
})
it('uses only public event fields in the caption and detects a changed time', () => {
  const source = buildListingShowDayPostSource({ ...event, attendees: [{ name: 'PRIVATE CUSTOMER' }], metadata: { internalNotes: 'PRIVATE NOTE' } }, listing)
  expect(source.caption).not.toMatch(/PRIVATE/)
  expect(source.signature).not.toBe(buildListingShowDayPostSource({ ...event, startsAt: '2099-11-15T09:00:00Z' }, listing).signature)
  expect(buildListingShowDayPostSource(event, listing, { origin: 'http://localhost:5173' })).toBeNull()
})
it('creates a show day without posting and uses it only after an explicit selection', async () => {
  api.create.mockResolvedValue(event)
  mount(); await chooseEvent()
  fireEvent.click(screen.getByRole('button', { name: 'Create show day' }))
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2099-11-15' } })
  fireEvent.click(screen.getByRole('button', { name: 'Publish and create RSVP' }))
  await screen.findByRole('button', { name: 'Use this show day' })
  expect(api.create).toHaveBeenCalledTimes(1)
  expect(api.request.mock.calls.some(call => ['preview_post', 'publish_post'].includes(call[1]))).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Use this show day' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByLabelText('Caption').value).toContain('/marketing/rsvp/event-token')
})
