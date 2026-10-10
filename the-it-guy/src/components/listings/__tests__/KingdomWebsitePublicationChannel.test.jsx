// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import KingdomWebsitePublicationChannel from '../KingdomWebsitePublicationChannel'
const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))
vi.mock('../../../services/kingdomWebsitePublicationService', () => ({ getKingdomWebsitePublicationStatus: mocks.get, setKingdomWebsitePublication: mocks.set }))
const connected = { available: true, websiteStatus: 'published', status: 'published', hostname: 'kingdomrealestate.co.za', blockers: [] }
beforeEach(() => { vi.resetAllMocks(); mocks.get.mockResolvedValue(connected) })
afterEach(cleanup)
it('uses a menu and a read-only refresh without saving or publishing', async () => {
  const onPrepare = vi.fn()
  render(<KingdomWebsitePublicationChannel listingId="listing-1" onPrepare={onPrepare} />)
  fireEvent.click(await screen.findByText('Manage'))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
  expect(onPrepare).not.toHaveBeenCalled()
  expect(mocks.set).not.toHaveBeenCalled()
})
it.each([['update', 'Update website'], ['unpublish', 'Remove from website']])('keeps %s working through the menu', async (action, label) => {
  mocks.set.mockResolvedValue({ ...connected, status: action === 'unpublish' ? 'unpublished' : 'published' })
  const onPrepare = vi.fn(async () => ({ ok: true }))
  const onPublicationAction = vi.fn()
  render(<KingdomWebsitePublicationChannel listingId="listing-1" onPrepare={onPrepare} onPublicationAction={onPublicationAction} />)
  fireEvent.click(await screen.findByText('Manage'))
  fireEvent.click(screen.getByRole('button', { name: label }))
  await waitFor(() => expect(onPublicationAction).toHaveBeenCalledWith(expect.objectContaining({ stage: action === 'unpublish' ? 'withdrawn' : 'accepted' })))
  expect(mocks.set).toHaveBeenCalledWith('listing-1', action)
  expect(onPrepare).toHaveBeenCalledTimes(action === 'unpublish' ? 0 : 1)
})
it('Edit listing opens the shared editor without publishing', async () => {
 const onEdit=vi.fn()
 render(<KingdomWebsitePublicationChannel listingId="listing-1" onEdit={onEdit} />)
 fireEvent.click(await screen.findByText('Manage'))
 fireEvent.click(screen.getByRole('button',{name:'Edit listing'}))
 expect(onEdit).toHaveBeenCalledTimes(1)
 expect(mocks.set).not.toHaveBeenCalled()
})

it('lifecycle mode hides setup blockers and has no content publishing control', async () => {
  mocks.get.mockResolvedValue({ ...connected, status: 'unpublished', blockers: ['Missing headline.'] })
  render(<KingdomWebsitePublicationChannel listingId="listing-1" manageActions={<button type="button">Manage listing</button>} />)
  await screen.findByRole('button', { name: 'Manage listing' })
  expect(screen.queryByText('Missing headline.')).toBeNull()
  expect(screen.queryByText('Needs attention')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Publish to website' })).toBeNull()
  expect(mocks.set).not.toHaveBeenCalled()
})
