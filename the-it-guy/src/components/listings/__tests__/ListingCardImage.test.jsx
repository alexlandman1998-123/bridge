// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ListingCardImage from '../ListingCardImage'
import RentalListingIndexCard from '../RentalListingIndexCard'
afterEach(cleanup)
it('recovers a failed thumbnail using its original once, then shows an unavailable placeholder', () => {
  render(<ListingCardImage src="/thumb.jpg" fallbackSrc="/original.jpg" alt="House" />)
  const thumbnail = screen.getByRole('img', { name: 'House' })
  expect(thumbnail.getAttribute('loading')).toBe('lazy')
  expect(thumbnail.getAttribute('decoding')).toBe('async')
  fireEvent.error(thumbnail)
  expect(screen.getByRole('img').getAttribute('src')).toBe('/original.jpg')
  fireEvent.load(screen.getByRole('img'))
  expect(screen.getByRole('img').className).toContain('opacity-100')
  fireEvent.error(screen.getByRole('img'))
  expect(screen.queryByRole('img')).toBeNull()
})
it('retains rental cover fallbacks and resets failed state when a replacement source arrives', () => {
  const props = { row: { title: 'Rental', imageUrl: '/one.jpg' }, liveChannels: [], priority: true }
  const view = render(<RentalListingIndexCard {...props} imageSource={{ src: '/thumb.jpg', fallbackSrc: '/one.jpg' }} />)
  expect(screen.getByRole('img').getAttribute('loading')).toBe('eager')
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('img').getAttribute('src')).toBe('/one.jpg')
  fireEvent.error(screen.getByRole('img'))
  expect(screen.queryByRole('img')).toBeNull()
  view.rerender(<RentalListingIndexCard {...props} imageSource={{ src: '/replacement.jpg' }} />)
  expect(screen.getByRole('img').getAttribute('src')).toBe('/replacement.jpg')
})
it('resets the reusable image when either source changes without a parent key', () => {
  const view = render(<ListingCardImage src="/one.jpg" fallbackSrc="/original-one.jpg" alt="House" />)
  fireEvent.error(screen.getByRole('img'))
  fireEvent.error(screen.getByRole('img'))
  expect(screen.queryByRole('img')).toBeNull()
  view.rerender(<ListingCardImage src="/two.jpg" fallbackSrc="/original-two.jpg" alt="House" />)
  expect(screen.getByRole('img').getAttribute('src')).toBe('/two.jpg')
  fireEvent.error(screen.getByRole('img'))
  fireEvent.error(screen.getByRole('img'))
  view.rerender(<ListingCardImage src="/two.jpg" fallbackSrc="/replacement-original.jpg" alt="House" />)
  expect(screen.getByRole('img').getAttribute('src')).toBe('/two.jpg')
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('img').getAttribute('src')).toBe('/replacement-original.jpg')
})
