// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import HomeSeekersDemo from '../HomeSeekersDemo'
import HomeSeekersBuying from '../HomeSeekersBuying'
import HomeSeekersRenting from '../HomeSeekersRenting'
import HomeSeekersProperty from '../HomeSeekersProperty'
import HomeSeekersFeaturedHomes from '../HomeSeekersFeaturedHomes'
import { useHomeSeekersWebsiteData } from '../homeSeekersWebsiteData'

const sale = { id: 'sale-1', title: 'Published sale', transactionType: 'sale', suburb: 'Waterkloof', address: 'Approved sale address', type: 'House', price: 2500000, bedrooms: 3, bathrooms: 2, parkingBays: 2, description: 'Approved website description', image: 'https://example.test/sale.jpg', images: ['https://example.test/sale.jpg'] }
const rental = { ...sale, id: 'rental-1', title: 'Published rental', transactionType: 'rental', suburb: 'Menlyn', address: 'Approved rental address', price: 12000 }
function feed(listings) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ listings }) })))
}
beforeEach(() => {
  sessionStorage.clear()
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: vi.fn(() => true) })
  feed([sale, rental])
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each([
  [{ loading: true }, 'Loading current homes…'],
  [{ error: 'Unavailable' }, 'The current homes could not be loaded. Please try again shortly.'],
  [{}, 'No homes are available online right now.'],
])('shows an honest state without sample homes: %j', (state, message) => {
  const { container } = render(<HomeSeekersFeaturedHomes listings={[]} {...state} />)
  expect(screen.getByText(message, { exact: false })).toBeTruthy()
  expect(container.querySelector('article')).toBeNull()
  expect(container.querySelector('img')).toBeNull()
  expect(screen.queryByText('DESIGN SAMPLE')).toBeNull()
})

it('shows only published sales on the home page and hides deferred areas', async () => {
  render(<HomeSeekersDemo />)
  const link = await screen.findByRole('link', { name: 'View this home' })
  expect(link.getAttribute('href')).toBe('/demo/homeseekers/properties/sale-1')
  expect(screen.queryByText('Published rental')).toBeNull()
  expect(document.querySelector('a[href="/demo/homeseekers/areas"]')).toBeNull()
  expect(document.querySelector('#areas')).toBeNull()
  expect(fetch).toHaveBeenCalledWith('/api/home-seekers/site', expect.objectContaining({ signal: expect.any(AbortSignal) }))
})

it('keeps deferred sample areas off the guarantee page', () => {
  render(<HomeSeekersDemo guaranteePage />)
  expect(document.querySelector('#areas')).toBeNull()
  expect(document.querySelector('a[href="/demo/homeseekers/areas"]')).toBeNull()
})

it('sales search displays CRM stock and narrows by suburb', async () => {
  render(<HomeSeekersBuying />)
  expect((await screen.findByRole('link', { name: 'View property' })).getAttribute('href')).toBe('/demo/homeseekers/properties/sale-1')
  expect(screen.queryByText('Approved rental address')).toBeNull()
  fireEvent.change(screen.getByRole('textbox', { name: 'Search properties' }), { target: { value: 'Not this suburb' } })
  expect(screen.queryByRole('link', { name: 'View property' })).toBeNull()
})

it('rentals use the CRM feed and offer a detail page', async () => {
  render(<HomeSeekersRenting />)
  expect((await screen.findByRole('link', { name: 'View property' })).getAttribute('href')).toBe('/demo/homeseekers/properties/rental-1')
  expect(screen.queryByText('Approved sale address')).toBeNull()
  expect(screen.getByText(/\/ pm/)).toBeTruthy()
})

it.each([['sale-1', 'FOR SALE', 'All homes'], ['rental-1', 'TO LET', 'All rentals']])('opens the published %s detail with the correct price and return link', async (id, label, back) => {
  render(<MemoryRouter initialEntries={[`/demo/homeseekers/properties/${id}`]}><Routes><Route path="/demo/homeseekers/properties/:propertyId" element={<HomeSeekersProperty />} /></Routes></MemoryRouter>)
  await screen.findByRole('link', { name: back })
  expect(screen.getAllByText(new RegExp(label)).length).toBe(2)
  expect(screen.getByText('Approved website description')).toBeTruthy()
  if (id === 'rental-1') expect(screen.getByText('Monthly rent')).toBeTruthy()
})

it('does not show an unpublished or missing property', async () => {
  feed([])
  render(<MemoryRouter initialEntries={['/demo/homeseekers/properties/sale-1']}><Routes><Route path="/demo/homeseekers/properties/:propertyId" element={<HomeSeekersProperty />} /></Routes></MemoryRouter>)
  await screen.findByRole('link', { name: 'Browse current homes' })
  expect(screen.queryByRole('button', { name: /Request a private viewing/ })).toBeNull()
})

it('reports a malformed API response without exposing a parser error or sample stock', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token <') } })))
  const { result } = renderHook(useHomeSeekersWebsiteData)
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.listings).toEqual([])
  expect(result.current.error).toBe('The current listings could not be loaded. Please try again shortly.')
})
