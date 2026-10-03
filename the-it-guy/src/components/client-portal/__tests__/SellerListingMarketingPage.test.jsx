// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import SellerListingMarketingPage from '../seller/SellerListingMarketingPage.jsx'
import { buildSellerPublicationCards } from '../seller/sellerMarketingModel.js'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

it('renders saved listing data, a verified zero and a live link, then reflects refreshed records', () => {
  const { rerender } = render(<SellerListingMarketingPage listing={{ title: 'Cicely Street', description: 'A sunny family home.', askingPrice: 1290000, bedrooms: 2 }} channels={[{ label: 'Property24', href: 'https://www.property24.com/for-sale/test' }]} channelLeads={{ property24: 0 }} />)
  expect(screen.getByText('A sunny family home.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'View listing on Property24' }).getAttribute('href')).toBe('https://www.property24.com/for-sale/test')
  expect(within(screen.getByText('Property24').closest('article')).getByText('0')).toBeTruthy()
  expect(screen.getAllByText('Lead tracking is not available for this platform yet.')).toHaveLength(2)
  rerender(<SellerListingMarketingPage listing={{ title: 'Cicely Street', description: 'An updated description.', priceOnApplication: true }} channelLeads={{ property24: 3, privateProperty: 1, website: 0 }} />)
  expect(screen.getByText('An updated description.')).toBeTruthy()
  expect(screen.getByText('Price on application')).toBeTruthy()
  expect(within(screen.getByText('Property24').closest('article')).getByText('3')).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'View listing on Property24' })).toBeNull()
})

it('does not invent photos, descriptions, prices, tracking counts or publication links', () => {
  render(<SellerListingMarketingPage />)
  expect(screen.getByText('Property image pending')).toBeTruthy()
  expect(screen.getByText('Price not yet shared')).toBeTruthy()
  expect(screen.getByText('Your agent has not shared the listing description yet.')).toBeTruthy()
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.getAllByText('—')).toHaveLength(3)
})

it('normalizes platform names, deduplicates links and blocks executable URLs', () => {
  const cards = buildSellerPublicationCards([
    { label: 'Property 24', href: 'https://property24.com/a' },
    { label: 'Property24', href: 'https://property24.com/b' },
    { label: 'Private Property', href: 'javascript:alert(1)' },
    { label: 'Agency Website', href: 'https://agency.example/listing' },
  ], { property24: 2, website: 0 })
  expect(cards).toHaveLength(3)
  expect(cards[0].href).toBe('https://property24.com/a')
  expect(cards[1].href).toBe('')
  expect(cards[1].leadCount).toBeNull()
  expect(cards[2].leadCount).toBe(0)
})

it('shows saved market details and omits unavailable fields', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T12:00:00Z'))
  const { rerender } = render(<SellerListingMarketingPage listing={{ propertyType: 'freehold_house', listingDate: '2026-09-27' }} />)
  const glance = screen.getByRole('complementary', { name: 'Listing at a glance' })
  expect(within(glance).getByText('freehold house')).toBeTruthy()
  expect(within(glance).getByText('6')).toBeTruthy()
  expect(within(glance).getByText('Listed on')).toBeTruthy()
  rerender(<SellerListingMarketingPage listing={{ listingDate: 'invalid' }} />)
  expect(screen.queryByRole('complementary', { name: 'Listing at a glance' })).toBeNull()
})

it('expands overflowing descriptions, collapses them and resets when the saved description changes', () => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(400)
  const { rerender } = render(<SellerListingMarketingPage listing={{ description: 'A long property description. '.repeat(60) }} />)
  const more = screen.getByRole('button', { name: 'See more' })
  expect(more.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(more)
  const less = screen.getByRole('button', { name: 'See less' })
  expect(less.getAttribute('aria-expanded')).toBe('true')
  expect(document.getElementById(less.getAttribute('aria-controls')).getAttribute('tabindex')).toBe('0')
  fireEvent.click(less)
  expect(screen.getByRole('button', { name: 'See more' }).getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: 'See more' }))
  rerender(<SellerListingMarketingPage listing={{ description: 'Updated property description. '.repeat(60) }} />)
  expect(screen.getByRole('button', { name: 'See more' }).getAttribute('aria-expanded')).toBe('false')
})
