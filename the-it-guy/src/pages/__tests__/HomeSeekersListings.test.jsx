// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import HomeSeekersDemo from '../HomeSeekersDemo'
import HomeSeekersBuying from '../HomeSeekersBuying'
import HomeSeekersRenting from '../HomeSeekersRenting'
import HomeSeekersProperty from '../HomeSeekersProperty'
import HomeSeekersFeaturedHomes from '../HomeSeekersFeaturedHomes'
import { homeSeekersCard, useHomeSeekersWebsiteData } from '../homeSeekersWebsiteData'

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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

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

it('standalone navigation, search, mobile menu and property links use the domain root', async () => {
  vi.stubEnv('VITE_HOME_SEEKERS_STANDALONE', 'true')
  // Navigation arrays are created when the public entry's modules load.
  vi.resetModules()
  const { default: StandaloneHome } = await import('../HomeSeekersDemo')
  render(<StandaloneHome />)
  expect((await screen.findByRole('link', { name: 'View this home' })).getAttribute('href')).toBe('/properties/sale-1')
  expect(screen.getByRole('link', { name: 'Home Seekers home' }).getAttribute('href')).toBe('/')
  expect(screen.getByRole('search').getAttribute('action')).toBe('/buying#properties')
  expect(document.querySelector('a[href="/buying?q=Moreleta+Park#properties"]')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
  const drawer = screen.getByRole('dialog', { name: 'Home Seekers navigation' })
  expect([...drawer.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual(['/', '/selling', '/buying', '/renting', '/about', '/join', '/guarantee', '/contact', 'https://app.arch9.co.za/homeseekers/login'])
  expect(document.querySelector('[href*="/demo/homeseekers"], [action*="/demo/homeseekers"]')).toBeNull()
  expect(document.body.style.overflow).toBe('hidden')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Home Seekers navigation' })).toBeNull()
  expect(document.body.style.overflow).toBe('')
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open navigation' }))
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

it.each([['sold', 'SOLD'], ['under_offer', 'UNDER OFFER']])('shows the approved %s status on sale search and the property page', async (listingStatus, label) => {
  feed([{ ...sale, listingStatus }])
  const { unmount } = render(<HomeSeekersBuying />)
  await screen.findByRole('link', { name: 'View property' })
  expect(screen.getByText(label)).toBeTruthy()
  unmount()
  render(<MemoryRouter initialEntries={['/demo/homeseekers/properties/sale-1']}><Routes><Route path="/demo/homeseekers/properties/:propertyId" element={<HomeSeekersProperty />} /></Routes></MemoryRouter>)
  await screen.findByRole('link', { name: 'All homes' })
  expect(screen.getAllByText(new RegExp(label)).length).toBe(2)
})

it('featured homes carry the sale label while rentals stay To let', () => {
  const card = homeSeekersCard({ ...sale, listingStatus: 'under_offer' })
  render(<HomeSeekersFeaturedHomes listings={[card]} />)
  expect(screen.getByText('UNDER OFFER')).toBeTruthy()
  expect(homeSeekersCard({ ...rental, listingStatus: 'sold' }).statusLabel).toBe('To let')
})

it('reports a malformed API response without exposing a parser error or sample stock', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token <') } })))
  const { result } = renderHook(useHomeSeekersWebsiteData)
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.listings).toEqual([])
  expect(result.current.error).toBe('The current listings could not be loaded. Please try again shortly.')
})
