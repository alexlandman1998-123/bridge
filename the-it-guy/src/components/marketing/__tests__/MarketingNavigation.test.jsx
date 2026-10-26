// @vitest-environment jsdom
import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom'
import { MarketingAnchor, MarketingLink, useMarketingNavigate } from '../MarketingNavigation.jsx'
import { marketingDestination } from '../marketingDestination.js'

afterEach(cleanup)
const mobilePath = '/mobile/marketing'

it('retains campaign, template and draft identifiers and their exact query/hash', () => {
  for (const query of [
    '?section=campaigns&page=studio&collection=channels&format=email&templateId=my%20template#editor',
    '?section=email&view=create&id=draft-1&audienceId=buyers&scheduleDate=2026-10-26#recipients',
    '?section=whatsapp&view=detail&id=sent-1',
  ]) {
    expect(marketingDestination(`/marketing${query}`, mobilePath)).toBe(`${mobilePath}${query}`)
  }
})

it('keeps relative links and query-only object destinations relative to the current mobile workspace', () => {
  for (const to of ['?section=campaigns&page=shop', '#assets', 'email?view=create', '../home', -1]) {
    expect(marketingDestination(to, mobilePath)).toBe(to)
  }
  const to = { search: '?section=calendar', hash: '#day' }
  expect(marketingDestination(to, mobilePath)).toBe(to)
})

it('maps CRM and listing handoffs with their query and fragment intact', () => {
  const cases = [
    ['/pipeline/leads?owner=me#new', '/mobile/leads?owner=me#new'],
    ['/pipeline/leads/lead-1?tab=activity#follow-up', '/mobile/lead/lead-1?tab=activity#follow-up'],
    ['/leads/lead-2', '/mobile/lead/lead-2'],
    ['/agent/listings/listing-1?tab=marketing#facts', '/mobile/listings/listing-1?tab=marketing#facts'],
    ['/listings?status=active', '/mobile/listings?status=active'],
    ['/listings/listing-1/edit?tab=photos', '/mobile/listings/listing-1/edit?tab=photos'],
  ]
  for (const [from, to] of cases) expect(marketingDestination(from, mobilePath)).toBe(to)
})

it('preserves object destinations, desktop behavior and public/external/unsupported links', () => {
  const to = { pathname: '/marketing', search: '?section=email&id=draft-1', hash: '#review' }
  expect(marketingDestination(to, mobilePath)).toEqual({ ...to, pathname: mobilePath })
  expect(marketingDestination(to, '/marketing')).toBe(to)
  for (const link of [
    '/marketing/rsvp/public-token?guest=1#form', '/marketing/invite/invitation',
    '/settings/integrations/whatsapp', '/documents/document-1', '/marketing/unknown',
    'https://example.test/marketing?section=email', '//example.test/marketing',
    'mailto:agent@example.test', 'tel:+27821234567', '/mobile/marketing?section=campaigns',
  ]) {
    expect(marketingDestination(link, mobilePath)).toBe(link)
  }
  expect(marketingDestination('/marketing?section=email', '/mobile/marketing-other')).toBe('/marketing?section=email')
})

function CurrentLocation() {
  const location = useLocation()
  const navigationType = useNavigationType()
  return <output data-testid="location">{JSON.stringify({ ...location, navigationType })}</output>
}
const currentLocation = () => JSON.parse(screen.getByTestId('location').textContent)

it('renders mobile hrefs and keeps relative tab changes inside marketing', () => {
  const ref = createRef()
  render(<MemoryRouter initialEntries={['/mobile/marketing?section=campaigns']}>
    <MarketingLink ref={ref} to="/marketing?section=email&view=create&id=draft-1#content" state={{ from: 'campaign' }}>Edit draft</MarketingLink>
    <MarketingLink to="?section=campaigns&page=studio">Studio</MarketingLink>
    <CurrentLocation />
  </MemoryRouter>)
  expect(ref.current.getAttribute('href')).toBe('/mobile/marketing?section=email&view=create&id=draft-1#content')
  fireEvent.click(screen.getByRole('link', { name: 'Edit draft' }))
  expect(currentLocation()).toMatchObject({ pathname: mobilePath, search: '?section=email&view=create&id=draft-1', hash: '#content', state: { from: 'campaign' } })
  fireEvent.click(screen.getByRole('link', { name: 'Studio' }))
  expect(currentLocation()).toMatchObject({ pathname: mobilePath, search: '?section=campaigns&page=studio' })
})

function NavigateActions() {
  const navigate = useMarketingNavigate()
  return <>
    <button onClick={() => navigate({ pathname: '/marketing', search: '?section=whatsapp&view=create&id=draft-2', hash: '#message' }, { replace: true, state: { source: 'studio' }, preventScrollReset: true })}>Open draft</button>
    <button onClick={() => navigate(-1)}>Back</button>
  </>
}

it('preserves programmatic navigation options, object destinations and history deltas', () => {
  render(<MemoryRouter initialEntries={['/mobile/home', '/mobile/marketing?section=campaigns']} initialIndex={1}>
    <NavigateActions /><CurrentLocation />
  </MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Open draft' }))
  expect(currentLocation()).toMatchObject({ pathname: mobilePath, search: '?section=whatsapp&view=create&id=draft-2', hash: '#message', state: { source: 'studio' }, navigationType: 'REPLACE' })
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(currentLocation()).toMatchObject({ pathname: '/mobile/home', navigationType: 'POP' })
})

it('keeps listing anchors in mobile and preserves their target behavior', () => {
  render(<MemoryRouter initialEntries={[mobilePath]}>
    <MarketingAnchor href="/agent/listings/listing-1" target="_blank" rel="noreferrer">Open listing</MarketingAnchor>
  </MemoryRouter>)
  const link = screen.getByRole('link', { name: 'Open listing' })
  expect(link.getAttribute('href')).toBe('/mobile/listings/listing-1')
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toBe('noreferrer')
})

it('continues supporting listing builders rendered outside the application router', () => {
  render(<MarketingAnchor href="/agent/listings/listing-1">Open listing</MarketingAnchor>)
  expect(screen.getByRole('link', { name: 'Open listing' }).getAttribute('href')).toBe('/agent/listings/listing-1')
})
