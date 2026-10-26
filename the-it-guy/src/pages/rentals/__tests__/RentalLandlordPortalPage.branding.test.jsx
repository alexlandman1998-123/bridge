// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RentalLandlordPortalPage from '../RentalLandlordPortalPage.jsx'

vi.mock('../../../lib/supabaseClient', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-session' } } }) } } }))
const branding = {
  agencyName: 'Kingdom Real Estate', logoDarkUrl: 'https://example.test/kingdom.svg',
  primaryColour: '#123456', secondaryColour: '#234567', accentColour: '#bc3456',
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each([false, true])('uses the property agency CI in desktop and mobile chrome (account=%s)', async account => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ branding, property: { name: 'Saved home' }, units: [], tenancies: [] }) }))
  vi.stubGlobal('fetch', fetchMock)
  render(<MemoryRouter initialEntries={['/landlord/fixture-token']}><Routes><Route path="/landlord/:token" element={<RentalLandlordPortalPage accountMembershipId={account ? 'fixture-membership' : ''} />} /></Routes></MemoryRouter>)
  const logos = await screen.findAllByRole('img', { name: 'Kingdom Real Estate logo' })
  expect(logos).toHaveLength(2)
  for (const logo of logos) expect(logo.getAttribute('src')).toBe(branding.logoDarkUrl)
  const sidebar = document.querySelector('[data-buyer-portal-shell="desktop-sidebar"]')
  expect(sidebar.style.backgroundColor).toBe('rgb(18, 52, 86)')
  const shell = sidebar.parentElement
  expect(shell.style.getPropertyValue('--landlord-primary')).toBe('#123456')
  expect(shell.style.getPropertyValue('--landlord-secondary')).toBe('#234567')
  expect(shell.style.getPropertyValue('--landlord-accent')).toBe('#bc3456')
  expect(fetchMock.mock.calls[0][0]).toBe(account ? '/api/rentals/client-portal?audience=landlord&membershipId=fixture-membership' : '/api/public/rental-landlord-portal')
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(account ? 'Bearer fixture-session' : 'Bearer fixture-token')
})

it('keeps an unbranded agency usable without introducing demo identity', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ branding: { agencyName: 'Saved Agency' }, property: {}, units: [], tenancies: [] }) })))
  render(<MemoryRouter initialEntries={['/landlord/private-token']}><Routes><Route path="/landlord/:token" element={<RentalLandlordPortalPage />} /></Routes></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: 'Saved Agency' })).toBeTruthy()
  expect(screen.queryByText('private token')).toBeNull()
})
