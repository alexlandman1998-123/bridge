// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ListingChannelStatistics from '../ListingChannelStatistics'

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
  expect(screen.getByText('08 Sept 2026 – 07 Oct 2026')).toBeTruthy()
})

it('preserves explicit zeros, missing metrics and source-specific contact labels', async () => {
  render(<ListingChannelStatistics {...props} />)
  await screen.findByText('Views complete')
  expect(card('Property24').getByText('1 234')).toBeTruthy()
  expect(card('Property24').getByText('Portal contacts').nextElementSibling.textContent).toBe('Unavailable')
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
  expect(card('Private Property').getByText('Data through: 07 Oct 2026')).toBeTruthy()
})

it('labels website activity separately from portal syncs and confirmed coverage', async () => {
  render(<ListingChannelStatistics {...props} />)
  await screen.findByText('Views complete')
  expect(card('Website').getByText(/Last tracked activity: 07 Oct 2026/)).toBeTruthy()
  expect(card('Website').getByText(/Continuous tracking coverage is unverified/)).toBeTruthy()
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
  expect(card('Property24').getByText('—')).toBeTruthy()
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
  expect(screen.getByText('Last 90 completed days')).toBeTruthy()
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
  expect(screen.getByText('Last 7 completed days')).toBeTruthy()
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
