// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ListingMarketingGallery from '../ListingMarketingGallery.jsx'

afterEach(cleanup)

const photos = [{ id: 'first', url: '/one.jpg' }, { id: 'cover', url: '/two.jpg' }, { id: 'last', url: '/three.jpg' }]
function props(overrides = {}) {
  return { images: photos, coverImageId: 'cover', title: 'Sales listing', onCover: vi.fn(), onMove: vi.fn(), onRemove: vi.fn(), onUpload: vi.fn(), onEdit: vi.fn(), onRetry: vi.fn(), ...overrides }
}

it('previews the cover first while actions retain the photo IDs and saved ordering', () => {
  const handlers = props()
  render(<ListingMarketingGallery {...handlers} />)
  expect(screen.getAllByRole('img').map(image => image.getAttribute('src'))).toEqual(['/two.jpg', '/one.jpg', '/three.jpg'])
  expect(screen.queryByRole('button', { name: 'Set photo 2 as cover' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Move photo 1 earlier' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Move photo 3 later' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Set photo 3 as cover' }))
  expect(handlers.onCover).toHaveBeenCalledWith('last')
  fireEvent.click(screen.getByRole('button', { name: 'Move photo 2 earlier' }))
  fireEvent.click(screen.getByRole('button', { name: 'Move photo 2 later' }))
  expect(handlers.onMove.mock.calls).toEqual([['cover', 'left'], ['cover', 'right']])
  fireEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }))
  expect(handlers.onRemove).toHaveBeenCalledWith('cover')
})

it('offers adding photos on an empty listing and passes selected files to the existing upload handler', () => {
  const handlers = props({ images: [] })
  render(<ListingMarketingGallery {...handlers} />)
  expect(screen.getByText('No photos')).toBeTruthy()
  expect(screen.getByText('Cover missing')).toBeTruthy()
  const input = screen.getByLabelText('Upload listing photos')
  const choose = vi.spyOn(input, 'click')
  fireEvent.click(screen.getByRole('button', { name: 'Add Photos' }))
  expect(choose).toHaveBeenCalledOnce()
  const files = [new File(['photo'], 'house.jpg', { type: 'image/jpeg' })]
  fireEvent.change(input, { target: { files } })
  expect(handlers.onUpload).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Edit Media' }))
  expect(handlers.onEdit).toHaveBeenCalledOnce()
})

it('blocks repeat mutations while saving and reflects the confirmed replacement cover', () => {
  const handlers = props({ saving: true })
  const view = render(<ListingMarketingGallery {...handlers} />)
  expect(screen.getByRole('status').textContent).toContain('Saving photo changes')
  expect(screen.getAllByRole('button').every(button => button.disabled)).toBe(true)
  view.rerender(<ListingMarketingGallery {...handlers} saving={false} images={[photos[0], photos[2]]} coverImageId="first" />)
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Set photo 1 as cover' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Set photo 2 as cover' }).disabled).toBe(false)
})

it('shows broken photos and allows retry without losing their IDs or reorder positions', async () => {
  const handlers = props()
  render(<ListingMarketingGallery {...handlers} />)
  fireEvent.error(screen.getAllByRole('img')[1])
  expect(screen.getByRole('alert').textContent).toContain('could not be loaded')
  expect(screen.getByText('Photo unavailable')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading photos' }))
  await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3))
  expect(handlers.onRetry).toHaveBeenCalledOnce()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('keeps all 95 gallery photos and their controls while deferring offscreen image downloads', () => {
  const images = Array.from({ length: 95 }, (_, index) => ({ id: String(index), url: `/photo-${index}.jpg` }))
  render(<ListingMarketingGallery {...props({ images })} />)
  const rendered = screen.getAllByRole('img')
  expect(rendered).toHaveLength(95)
  expect(rendered[0].getAttribute('loading')).toBe('eager')
  expect(rendered.slice(1).every((image) => image.getAttribute('loading') === 'lazy' && image.getAttribute('decoding') === 'async')).toBe(true)
  expect(screen.getByRole('button', { name: 'Remove photo 95' })).toBeTruthy()
})
