// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ListingChannelStatistics from '../ListingChannelStatistics'
import { Eye } from 'lucide-react'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../services/listings/listingOverviewPerformanceService', () => ({ getListingOverviewAnalytics: mocks.get }))
const props = { organisationId: 'agency-1', listingId: 'listing-1' }
const metric = (value, complete = true) => ({ value, available: value !== null, complete, coveredDays: complete ? 30 : 2, expectedDays: 30 })
const source = (views, extra = {}) => ({ published: true, complete: true, metrics: { views: metric(views), alerts: metric(0) }, dataThrough: '2026-10-07', lastSyncedAt: '2026-10-08T06:15:00Z', ...extra })
const fixture = (days = 30) => ({
  windowDays: days,
  period: { startDate: '2026-09-08', endDate: '2026-10-07', completedDaysOnly: true },
  property24: source(1234, { metrics: { views: metric(1234), alerts: metric(0), portalContacts: metric(null), contactForms: metric(4), whatsAppContacts: metric(2), phoneContacts: metric(1), smsContacts: metric(0) } }),
  privateProperty: source(42, { complete: false, metrics: { views: metric(42, false), alerts: metric(2, false), messages: metric(3, false), phoneContacts: metric(null) }, lastAttempt: { failed: true } }),
  website: source(9, { complete: false, metrics: { views: metric(9, false), enquiries: { value: 0, available: true, complete: true } }, lastTrackedAt: '2026-10-07T20:15:00Z', lastSyncedAt: null }),
})
const card = (name) => within(screen.getByRole('article', { name: `${name} statistics` }))
beforeEach(() => { vi.resetAllMocks(); mocks.get.mockResolvedValue(fixture()) })
afterEach(cleanup)

it('loads the shared default period with listing and organisation scope', async () => {
  render(<ListingChannelStatistics {...props} />)
  await screen.findByText('Views complete')
  expect(mocks.get).toHaveBeenCalledWith({ ...props, days: 30 })
  expect(screen.getByRole('radio', { name: '30 days' }).checked).toBe(true)
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(screen.queryByText('08 Sept 2026 – 07 Oct 2026')).toBeNull()
  expect(screen.queryByText('Channel statistics')).toBeNull()
  expect(screen.getByRole('img', { name: 'Property24' }).getAttribute('src')).toBe('/lead-sources/property24.png')
  expect(screen.getByRole('img', { name: 'Private Property' }).getAttribute('src')).toBe('/lead-sources/private-property.jpeg')
})

it('preserves explicit zeros, missing metrics and source-specific contact labels', async () => {
  render(<ListingChannelStatistics {...props} />)
  await screen.findByText('Views complete')
  expect(card('Property24').getByText('1 234')).toBeTruthy()
  expect(card('Property24').getByLabelText('Portal contacts unavailable').textContent).toBe('—')
  expect(card('Property24').getByText('Alerts').nextElementSibling.textContent).toBe('0')
  expect(card('Private Property').getByText('Messages').nextElementSibling.textContent).toBe('3 Partial')
  expect(card('Private Property').queryByText('Portal contacts')).toBeNull()
  expect(card('Private Property').queryByText('WhatsApp forms')).toBeNull()
  expect(card('Website').getByText('Website enquiries').nextElementSibling.textContent).toBe('0')
  expect(card('Website').queryByText('Alerts')).toBeNull()
})

it('shows partial coverage and a failed portal refresh without discarding saved counts', async () => {
  render(<ListingChannelStatistics {...props} />)
  await screen.findByText('Views complete')
  expect(card('Private Property').getByText('42')).toBeTruthy()
  expect(card('Private Property').getByText('Partial data')).toBeTruthy()
  expect(card('Private Property').getByText('2 of 30 days covered · Partial count')).toBeTruthy()
  expect(card('Private Property').getByText('Latest sync failed. Showing saved counts.')).toBeTruthy()
  expect(screen.queryByText(/Data through:/)).toBeNull()
  expect(screen.queryByText(/Last synced:/)).toBeNull()
})

it('keeps the website card compact while distinguishing incomplete coverage', async () => {
  render(<ListingChannelStatistics {...props} />)
  await screen.findByText('Views complete')
  expect(card('Website').queryByText(/Last tracked activity:/)).toBeNull()
  expect(card('Website').getByText('Partial data')).toBeTruthy()
  expect(screen.queryByText(/Contacts reflect/)).toBeNull()
  expect(card('Website').queryByText(/Last synced/)).toBeNull()
  expect(card('Website').queryByText(/days covered/)).toBeNull()
})

it('distinguishes unpublished, awaiting first sync and historical activity', async () => {
  const data = fixture()
  data.property24 = { published: false, metrics: {} }
  data.privateProperty = { published: true, metrics: {} }
  data.website.published = false
  mocks.get.mockResolvedValue(data)
  render(<ListingChannelStatistics {...props} />)
  await screen.findByText('Awaiting first sync')
  expect(card('Property24').getByText('Not published')).toBeTruthy()
  expect(card('Property24').getByText('Views').nextElementSibling.textContent).toBe('—')
  expect(card('Private Property').getByText('Views unavailable')).toBeTruthy()
  expect(card('Website').getByText('9')).toBeTruthy()
  expect(card('Website').getByText('Currently not published · Historical activity')).toBeTruthy()
})

it('clears counts for a new period and ignores a late response for the old period', async () => {
  let resolveOld, resolveNew
  mocks.get.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve }))
  render(<ListingChannelStatistics {...props} />)
  expect(screen.getByText('Loading statistics…')).toBeTruthy()
  fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
  expect(mocks.get).toHaveBeenLastCalledWith({ ...props, days: 90 })
  expect(screen.getByRole('radio', { name: '90 days' }).checked).toBe(true)
  await act(async () => resolveNew({ ...fixture(90), property24: source(900) }))
  expect(card('Property24').getByText('900')).toBeTruthy()
  await act(async () => resolveOld(fixture()))
  expect(card('Property24').queryByText('1 234')).toBeNull()
  expect(card('Property24').getByText('900')).toBeTruthy()
})

it('selects seven days and preserves the current scope', async () => {
  render(<ListingChannelStatistics {...props} />)
  await screen.findByText('Views complete')
  let resolveSeven
  mocks.get.mockImplementationOnce(() => new Promise((resolve) => { resolveSeven = resolve }))
  fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
  await waitFor(() => expect(mocks.get).toHaveBeenLastCalledWith({ ...props, days: 7 }))
  expect(card('Property24').queryByText('1 234')).toBeNull()
  expect(screen.getByRole('radio', { name: '7 days' }).checked).toBe(true)
  await act(async () => resolveSeven(fixture(7)))
  await screen.findByText('Views complete')
  expect(screen.getByRole('radio', { name: '7 days' }).checked).toBe(true)
})

it('displays confirmed zero views without marking the metric unavailable', async () => {
  mocks.get.mockResolvedValue({ ...fixture(), property24: source(0) })
  render(<ListingChannelStatistics {...props} />)
  await screen.findByText('Views complete')
  expect(card('Property24').getByText('Views').nextElementSibling.textContent).toBe('0')
  expect(card('Property24').queryByText('Views unavailable')).toBeNull()
})

it('hides the previous organisation’s counts while the next listing loads', async () => {
  const view = render(<ListingChannelStatistics {...props} />)
  await screen.findByText('Views complete')
  mocks.get.mockImplementation(() => new Promise(() => {}))
  view.rerender(<ListingChannelStatistics organisationId="agency-2" listingId="listing-2" />)
  expect(card('Property24').queryByText('1 234')).toBeNull()
  expect(mocks.get).toHaveBeenLastCalledWith({ organisationId: 'agency-2', listingId: 'listing-2', days: 30 })
})

it('retains same-period counts after a read failure and retries without exposing database errors', async () => {
  const view = render(<ListingChannelStatistics {...props} />)
  await screen.findByText('Views complete')
  mocks.get.mockRejectedValueOnce(new Error('internal database details'))
  view.rerender(<ListingChannelStatistics {...props} refreshKey="new-snapshot" />)
  await screen.findByRole('alert')
  expect(card('Property24').getByText('1 234')).toBeTruthy()
  expect(screen.getByText('Could not refresh statistics. Showing last loaded counts.')).toBeTruthy()
  expect(screen.queryByText('internal database details')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(mocks.get).toHaveBeenCalledTimes(3)
})

it('does not present values from an older reader as a completed-day period', async () => {
  mocks.get.mockResolvedValue({ ...fixture(), period: null })
  render(<ListingChannelStatistics {...props} />)
  await screen.findByRole('alert')
  expect(card('Property24').getByText('Unavailable', { selector: 'p' })).toBeTruthy()
  expect(card('Property24').queryByText('1 234')).toBeNull()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
})

const summaryCards = ['Total leads', 'Viewings', 'Days on market'].map((label) => ({ label, value: '1', meta: 'Listing total', icon: Eye }))
const summary = () => within(screen.getByRole('group', { name: 'Listing performance summary' }))

it('sums only available channel views for the selected period and marks incomplete totals', async () => {
  render(<ListingChannelStatistics {...props} summaryCards={summaryCards} />)
  await summary().findByText('1 285')
  expect(summary().getByText('Partial count · 30 days')).toBeTruthy()
  expect(summary().getByText('Total leads')).toBeTruthy()
  mocks.get.mockResolvedValueOnce({ ...fixture(7), property24: source(100), privateProperty: source(null), website: source(5) })
  fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
  await summary().findByText('105')
  expect(summary().queryByText('1 285')).toBeNull()
  expect(summary().getByText('Partial count · 7 days')).toBeTruthy()
})

it('keeps missing totals distinct from verified zero views', async () => {
  mocks.get.mockResolvedValueOnce({ ...fixture(), property24: source(null), privateProperty: source(null), website: source(null) })
  const view = render(<ListingChannelStatistics {...props} summaryCards={summaryCards} />)
  await summary().findByText('Views unavailable')
  expect(summary().getByText('—')).toBeTruthy()
  mocks.get.mockResolvedValueOnce({ ...fixture(), property24: source(0), privateProperty: source(0), website: source(0) })
  view.rerender(<ListingChannelStatistics {...props} summaryCards={summaryCards} refreshKey="zero-counts" />)
  await summary().findByText('0')
  expect(summary().getByText('Across all channels · 30 days')).toBeTruthy()
})

it('does not carry another listing’s total views into a new scope', async () => {
  const view = render(<ListingChannelStatistics {...props} summaryCards={summaryCards} />)
  await summary().findByText('1 285')
  mocks.get.mockImplementation(() => new Promise(() => {}))
  view.rerender(<ListingChannelStatistics organisationId="agency-2" listingId="listing-2" summaryCards={summaryCards} />)
  expect(summary().queryByText('1 285')).toBeNull()
  expect(summary().getByText('Loading views…')).toBeTruthy()
})

it('falls back to the portal name if a logo cannot load', async () => {
  render(<ListingChannelStatistics {...props} />)
  await screen.findByText('Views complete')
  fireEvent.error(screen.getByRole('img', { name: 'Property24' }))
  expect(card('Property24').getByRole('heading', { name: 'Property24' }).className).not.toBe('sr-only')
})
