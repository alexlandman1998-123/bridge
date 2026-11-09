// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import DevelopmentChannelStatistics from '../DevelopmentChannelStatistics.jsx'
import DevelopmentMarketingOverview from '../DevelopmentMarketingOverview.jsx'

const mocks = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../../../services/developmentListingPerformanceService.js', () => ({ loadDevelopmentListingPerformance: mocks.load }))
const listings = [{ id: 'listing-a', organisationId: 'agency-a', updatedAt: '2026-11-09', title: 'Unit A' }]
const props = { developmentId: 'development-a', websitePublished: true, listings }
const metric = value => ({ available: value !== null, value, complete: false, coveredDays: 2, expectedDays: 30 })
const fixture = () => ({
  property24: { published: true, metrics: { views: metric(120), alerts: metric(0), contactForms: metric(3) } },
  privateProperty: { published: true, metrics: { views: metric(45), messages: metric(7) } },
  website: { published: true, metrics: { views: metric(86), enquiries: metric(4) }, periodLabel: 'Development website activity, including today.' },
  leadsAvailable: true, leadCount: 2, newThisWeek: 1, leadsComplete: true,
  viewingsAvailable: true, viewingCount: 0, upcomingViewings: 0, viewingsComplete: true,
  averageDaysOnMarket: 6, datedListingCount: 1,
})
const card = name => within(screen.getByRole('article', { name: `${name} statistics` }))
beforeEach(() => { mocks.load.mockReset().mockResolvedValue(fixture()) })
afterEach(cleanup)

it('shows three overview columns with each source’s own metrics and development scope', async () => {
  render(<DevelopmentChannelStatistics {...props} />)
  await card('Property24').findByText('120')
  expect(mocks.load).toHaveBeenCalledWith(listings, 30, expect.any(AbortSignal), { developmentId: 'development-a', websitePublished: true })
  expect(card('Private Property').getByText('45')).toBeTruthy()
  expect(card('Website').getByText('86')).toBeTruthy()
  expect(card('Property24').getByText('Alerts').nextElementSibling.textContent).toBe('0 Partial')
  expect(card('Private Property').getByText('Messages').nextElementSibling.textContent).toBe('7 Partial')
  expect(card('Website').getByText('Website enquiries').nextElementSibling.textContent).toBe('4 Partial')
  expect(card('Website').getByText(/Development website activity, including today/)).toBeTruthy()
  expect(screen.queryByRole('group', { name: 'Listing performance summary' })).toBeNull()
  expect(screen.queryByText('Current listings')).toBeNull()
})

it('clears the old development and period while loading and ignores their late results', async () => {
  let resolveOld
  mocks.load.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
  const view = render(<DevelopmentChannelStatistics {...props} />)
  const oldSignal = mocks.load.mock.calls[0][2]
  view.rerender(<DevelopmentChannelStatistics {...props} developmentId="development-b" listings={[]} />)
  await card('Website').findByText('86')
  expect(oldSignal.aborted).toBe(true)
  await act(async () => resolveOld({ ...fixture(), website: { metrics: { views: metric(999) } } }))
  expect(card('Website').queryByText('999')).toBeNull()
  mocks.load.mockImplementationOnce(() => new Promise(() => {}))
  fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
  expect(card('Website').queryByText('86')).toBeNull()
  expect(mocks.load).toHaveBeenLastCalledWith([], 7, expect.any(AbortSignal), { developmentId: 'development-b', websitePublished: true })
})

it('shows unavailable data on a failed read and recovers on retry', async () => {
  mocks.load.mockRejectedValueOnce(new Error('internal details'))
  render(<DevelopmentChannelStatistics {...props} />)
  await screen.findByRole('alert')
  expect(card('Property24').getByText('Views unavailable')).toBeTruthy()
  expect(card('Website').getByText('Views unavailable')).toBeTruthy()
  expect(screen.queryByText('internal details')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await card('Website').findByText('86')
})

it('retains the Marketing overview summary and listing gallery', async () => {
  render(<DevelopmentMarketingOverview {...props} onOpenListing={vi.fn()} />)
  await card('Website').findByText('86')
  expect(screen.getByRole('group', { name: 'Listing performance summary' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Current listings' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Open Unit A' })).toBeTruthy()
})
