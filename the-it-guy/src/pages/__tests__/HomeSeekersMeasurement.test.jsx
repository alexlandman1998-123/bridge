// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HomeSeekersMeasurement from '../HomeSeekersMeasurement'
import HomeSeekersFooter from '../HomeSeekersFooter'

vi.mock('../homeSeekersPixel', async importOriginal => ({
  ...await importOriginal(),
  homeSeekersPixelSurface: () => true,
  trackHomeSeekersPage: vi.fn(),
}))
vi.mock('../homeSeekersWebsiteData', () => ({ useHomeSeekersPageTracking: vi.fn() }))
vi.mock('../HomeSeekersLoginLink', () => ({ default: () => <a href="/login">Log in</a> }))

afterEach(cleanup)

it('dismisses all floating controls after a choice, remembers it, and reopens from the footer', () => {
  const page = () => <MemoryRouter><HomeSeekersMeasurement /><HomeSeekersFooter /></MemoryRouter>
  const first = render(page())
  fireEvent.click(screen.getByRole('button', { name: 'Allow measurement' }))
  expect(screen.queryByRole('region', { name: 'Optional website measurement' })).toBeNull()
  expect(window.localStorage.getItem('home-seekers-marketing-consent-v1')).toBe('granted')
  expect(document.querySelector('.hs-measurement__preferences')).toBeNull()
  expect(within(screen.getByRole('contentinfo')).getByRole('button', { name: 'Tracking preferences' })).toBeTruthy()

  first.unmount()
  render(page())
  expect(screen.queryByRole('region', { name: 'Optional website measurement' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Tracking preferences' }))
  expect(screen.getByRole('region', { name: 'Optional website measurement' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
  expect(screen.queryByRole('region', { name: 'Optional website measurement' })).toBeNull()
  expect(window.localStorage.getItem('home-seekers-marketing-consent-v1')).toBe('denied')
})
