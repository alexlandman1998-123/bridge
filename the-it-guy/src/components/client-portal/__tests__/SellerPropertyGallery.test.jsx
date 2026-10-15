// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SellerPropertyGallery from '../seller/SellerPropertyGallery.jsx'
import { resolveListingPropertyImages } from '../seller/listingPropertyImages.js'

afterEach(cleanup)

it('uses the listing cover first and deduplicates photos across portal projections, excluding videos', () => {
  expect(resolveListingPropertyImages({
    coverImageUrl: 'https://images.test/cover.jpg',
    listing: { galleryImages: [{ url: 'https://images.test/two.jpg' }, { url: 'https://images.test/cover.jpg' }], marketing: { imageGallery: ['https://images.test/three.jpg', { url: 'https://images.test/clip', type: 'video' }] } },
    activeSellingContext: { images: ['https://images.test/two.jpg'] },
    formData: { images: ['https://images.test/old.jpg'] },
  })).toEqual(['https://images.test/cover.jpg', 'https://images.test/two.jpg', 'https://images.test/three.jpg'])
})

it('supports onboarding photo fallback and empty listings', () => {
  expect(resolveListingPropertyImages({ formData: { imageGallery: [{ publicUrl: '/one.jpg' }] } })).toEqual(['/one.jpg'])
  expect(resolveListingPropertyImages()).toEqual([])
})

it('browses with buttons and keyboard, updates the count after a swipe, and wraps around', () => {
  const { container } = render(<SellerPropertyGallery images={['/one.jpg', '/two.jpg', '/three.jpg']} propertyTitle="Cicely Street" />)
  const track = container.querySelector('[tabindex]')
  Object.defineProperty(track, 'clientWidth', { value: 600 })
  track.scrollTo = vi.fn()
  fireEvent.click(screen.getByRole('button', { name: 'Next listing photo' }))
  expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 600, behavior: 'smooth' })
  fireEvent.scroll(track, { target: { scrollLeft: 1200 } })
  expect(screen.getByText('3 / 3')).toBeTruthy()
  fireEvent.keyDown(track, { key: 'ArrowRight' })
  expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' })
  expect(screen.getAllByRole('img')).toHaveLength(3)
})

it('removes broken photos and reports a loading failure instead of asking for uploads', () => {
  render(<SellerPropertyGallery images={['/one.jpg', '/two.jpg']} />)
  fireEvent.error(screen.getAllByRole('img')[0])
  expect(screen.queryByRole('button', { name: 'Next listing photo' })).toBeNull()
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByText('Photos could not be loaded')).toBeTruthy()
  expect(screen.queryByText('Property image pending')).toBeNull()
  expect(screen.queryByText('Listing photos will appear here once your agent adds them.')).toBeNull()
})

it('shows loading until saved gallery data arrives instead of claiming photos are missing', () => {
  const { rerender } = render(<SellerPropertyGallery images={[]} loading showThumbnails />)
  expect(screen.getByRole('status').textContent).toContain('Loading listing photos')
  expect(screen.queryByText('Property image pending')).toBeNull()
  rerender(<SellerPropertyGallery images={['/saved.jpg']} loading={false} showThumbnails />)
  expect(screen.getByRole('region', { name: 'Listing photos' })).toBeTruthy()
  expect(screen.queryByRole('status')).toBeNull()
})

it('allows retrying a temporary image failure', async () => {
  render(<SellerPropertyGallery images={['/saved.jpg']} />)
  fireEvent.error(screen.getByRole('img'))
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading photos' }))
  await waitFor(() => expect(screen.getByRole('img').getAttribute('src')).toBe('/saved.jpg'))
})

it('waits for a gallery refresh on retry and uses the renewed private links', async () => {
  let finishRefresh
  const onRetry = vi.fn(() => new Promise((resolve) => { finishRefresh = resolve }))
  const { rerender } = render(<SellerPropertyGallery images={[]} loadError onRetry={onRetry} />)
  expect(screen.getByText('Photos could not be loaded')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading photos' }))
  expect(onRetry).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status').textContent).toContain('Loading listing photos')
  rerender(<SellerPropertyGallery images={['/renewed.jpg']} onRetry={onRetry} />)
  finishRefresh()
  await waitFor(() => expect(screen.getByRole('img').getAttribute('src')).toBe('/renewed.jpg'))
})

it('keeps the retry available when refreshing the gallery fails', async () => {
  const onRetry = vi.fn().mockRejectedValue(new Error('Offline'))
  render(<SellerPropertyGallery images={['/saved.jpg']} onRetry={onRetry} />)
  fireEvent.error(screen.getByRole('img'))
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading photos' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry loading photos' })).toBeTruthy())
  expect(screen.getByText('Photos could not be loaded')).toBeTruthy()
  expect(onRetry).toHaveBeenCalledTimes(1)
})

it('selects a thumbnail and keeps its selected state in sync with swiping', () => {
  const { container } = render(<SellerPropertyGallery images={['/one.jpg', '/two.jpg', '/three.jpg']} showThumbnails />)
  const track = container.querySelector('[tabindex]')
  Object.defineProperty(track, 'clientWidth', { value: 500 })
  track.scrollTo = vi.fn()
  fireEvent.click(screen.getByRole('button', { name: 'Show listing photo 3' }))
  expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 1000, behavior: 'smooth' })
  expect(screen.getByRole('button', { name: 'Show listing photo 3' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.scroll(track, { target: { scrollLeft: 500 } })
  expect(screen.getByRole('button', { name: 'Show listing photo 2' }).getAttribute('aria-pressed')).toBe('true')
})
