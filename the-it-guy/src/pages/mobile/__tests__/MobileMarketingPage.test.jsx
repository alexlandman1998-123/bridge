// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom'
import MobileMarketingPage from '../MobileMarketingPage.jsx'

vi.mock('../../MarketingComingSoonPage.jsx', () => ({
  default: function MarketingWorkspace() {
    const [params, setParams] = useSearchParams()
    return <div><p>Shared marketing workspace</p><button onClick={() => setParams({ ...Object.fromEntries(params), id: 'saved-draft', view: 'create' }, { replace: true })}>Remember draft</button></div>
  },
}))

function Location() {
  const location = useLocation()
  return <output aria-label="Current route">{location.pathname}{location.search}{location.hash}</output>
}

async function mount(query = '') {
  render(<MemoryRouter initialEntries={[`/mobile/marketing${query}`]}><MobileMarketingPage /><Location /></MemoryRouter>)
  await screen.findByText('Shared marketing workspace')
}

afterEach(cleanup)

it('opens the existing draft with all handoff parameters intact', async () => {
  const query = '?section=email&tab=templates&view=create&id=draft&listingId=listing&scheduleDate=2026-10-25&ai=1#editor'
  await mount(query)
  expect(screen.getByLabelText('Marketing workspace').value).toBe('email')
  expect(screen.getByLabelText('Current route').textContent).toBe(`/mobile/marketing${query}`)
  fireEvent.click(screen.getByRole('button', { name: 'Remember draft' }))
  expect(screen.getByLabelText('Current route').textContent).toContain('/mobile/marketing?section=email&tab=templates&view=create&id=saved-draft&listingId=listing&scheduleDate=2026-10-25&ai=1')
})

it.each([
  ['overview', ''],
  ['campaigns', '?section=campaigns'],
  ['templates', '?section=campaigns&page=studio'],
  ['calendar', '?section=campaigns&page=calendar'],
  ['email', '?section=email'],
  ['whatsapp', '?section=whatsapp'],
  ['meta', '?section=meta'],
  ['show-days', '?section=show-days'],
  ['launches', '?section=launches'],
  ['website', '?section=website'],
])('opens %s inside the mobile workspace', async (key, query) => {
  await mount('?section=campaigns&view=detail&id=old')
  fireEvent.change(screen.getByLabelText('Marketing workspace'), { target: { value: key } })
  expect(screen.getByLabelText('Current route').textContent).toBe(`/mobile/marketing${query}`)
})

it.each([
  '?section=campaigns&view=templates',
  '?section=campaigns&view=template-edit&id=mine',
  '?section=campaigns&view=channel-template-edit&id=mine',
  '?section=campaigns&view=create&channelTemplate=mine',
])('keeps the shop selected for direct template/editor links: %s', async (query) => {
  await mount(query)
  expect(screen.getByLabelText('Marketing workspace').value).toBe('templates')
  expect(screen.getByRole('link', { name: 'Templates' }).getAttribute('aria-current')).toBe('page')
})

it('opens template formats and the marketing calendar without leaving mobile', async () => {
  await mount('?section=email&view=detail&id=sent')
  fireEvent.click(screen.getByRole('link', { name: 'Templates' }))
  expect(screen.getByLabelText('Current route').textContent).toBe('/mobile/marketing?section=campaigns&page=studio')
  fireEvent.click(screen.getByRole('link', { name: 'Calendar' }))
  expect(screen.getByLabelText('Current route').textContent).toBe('/mobile/marketing?section=campaigns&page=calendar')
})
