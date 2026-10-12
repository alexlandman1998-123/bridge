// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ListingSyndicationChannelCard from '../ListingSyndicationChannelCard'

afterEach(cleanup)

it('keeps internal storage included and separates fixing details from selecting a portal', () => {
  const toggle = vi.fn()
  const fix = vi.fn()
  render(<>
    <ListingSyndicationChannelCard channel={{ key: 'arch9_internal', label: 'Arch9 Platform', internalOnly: true }} selected onToggle={toggle} />
    <ListingSyndicationChannelCard channel={{ key: 'property24', label: 'Property24' }} selected={false} needsAttention="2 required fields missing" onToggle={toggle}><button type="button" onClick={fix}>Fix fields</button></ListingSyndicationChannelCard>
  </>)
  const internal = screen.getByRole('button', { name: 'Arch9 Platform' })
  expect(internal.disabled).toBe(true)
  expect(internal.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(internal)
  fireEvent.click(screen.getByRole('button', { name: 'Fix fields' }))
  expect(fix).toHaveBeenCalledTimes(1)
  expect(toggle).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Property24' }))
  expect(toggle).toHaveBeenCalledWith('property24')
})


it.each(['kingdom_website', 'agency_website'])('uses the website destination logo for %s, including partner workspaces', channel => {
  render(<ListingSyndicationChannelCard channel={{ key: 'agency_website', availability: { channel, label: 'Kingdom Real Estate Website', logoUrl: '/kingdom-logo.png', hostname: 'kingdomrealestate.co.za' } }} selected agencyLogo="/isell-logo.png" />)
  expect(screen.getByRole('img', { name: 'Kingdom Real Estate Website logo' }).getAttribute('src')).toBe('/kingdom-logo.png')
  expect(screen.queryByRole('img', { name: 'I Sell Property logo' })).toBeNull()
})

it('falls back to a globe if the destination logo fails to load', () => {
  render(<ListingSyndicationChannelCard channel={{ key: 'agency_website', availability: { channel: 'kingdom_website', label: 'Kingdom Website', logoUrl: '/missing.png' } }} selected agencyLogo="/isell-logo.png" />)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByRole('button', { name: 'Kingdom Website' })).toBeTruthy()
})

it('shows a channel error and independent status/retry actions in its advertising row', () => {
  const toggle = vi.fn(), retry = vi.fn(), check = vi.fn()
  render(<ListingSyndicationChannelCard layout="row" channel={{ key: 'private_property', label: 'Private Property' }} selected onToggle={toggle}
    publication={{ status: 'needs_attention', retryable: true, message: 'Address is incomplete.' }} onRetry={retry} onCheckStatus={check} />)
  expect(screen.getByRole('article', { name: 'Private Property advertising' }).className).toContain('listing-syndication-row')
  expect(screen.getByText('Address is incomplete.')).toBeTruthy()
  expect(screen.queryByText('Listing saved')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Check status' }))
  fireEvent.click(screen.getByRole('button', { name: 'Retry this website' }))
  expect(check).toHaveBeenCalledOnce()
  expect(retry).toHaveBeenCalledOnce()
  expect(toggle).not.toHaveBeenCalled()
})

it('keeps an uncertain channel checkable without offering retry or claiming it is live', () => {
  render(<ListingSyndicationChannelCard layout="row" channel={{ key: 'property24', label: 'Property24' }} selected
    publication={{ status: 'uncertain', message: 'Request timed out' }} onCheckStatus={vi.fn()} onRetry={vi.fn()} />)
  expect(screen.getByText('Not confirmed')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Check status' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Retry this website' })).toBeNull()
  expect(screen.getByText(/website may have accepted this request/)).toBeTruthy()
})

it('shows accepted receipts as previous results after edits and blocks retry while another channel is sending', () => {
  const { rerender } = render(<ListingSyndicationChannelCard layout="row" channel={{ key: 'property24', label: 'Property24' }} selected previousResult
    publication={{ status: 'submitted' }} />)
  expect(screen.getByText('Previous advertising request')).toBeTruthy()
  expect(screen.getByText('Request accepted')).toBeTruthy()
  expect(screen.getByText(/Check the public advert before treating it as live/)).toBeTruthy()
  rerender(<ListingSyndicationChannelCard layout="row" channel={{ key: 'property24', label: 'Property24' }} selected unsavedChanges retryBlocked
    publication={{ status: 'needs_attention', retryable: true }} onRetry={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Save and retry this website' }).disabled).toBe(true)
})
