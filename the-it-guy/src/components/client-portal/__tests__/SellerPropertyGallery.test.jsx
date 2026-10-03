// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

it('removes broken photos and shows the placeholder when none can load', () => {
  render(<SellerPropertyGallery images={['/one.jpg', '/two.jpg']} />)
  fireEvent.error(screen.getAllByRole('img')[0])
  expect(screen.queryByRole('button', { name: 'Next listing photo' })).toBeNull()
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByText('Property image pending')).toBeTruthy()
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
