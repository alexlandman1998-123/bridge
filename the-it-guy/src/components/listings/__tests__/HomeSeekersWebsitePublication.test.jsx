// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import WebsiteListingPublicationPanel from '../WebsiteListingPublicationPanel'

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))
vi.mock('../../../services/websiteListingPublicationService', () => ({
  getWebsiteListingPublicationStatus: mocks.get,
  setWebsiteListingPublication: mocks.set,
}))
const connected = {
  websiteSiteId: 'c2fcb2e4-23c1-4302-b490-7332f5075669',
  hostname: 'home-seekers-2958d402.sites.propdata.co.za',
  websiteStatus: 'published', projectionStatus: 'Published',
  status: 'published', eligible: true, blockers: [],
}
const props = { listingId: 'listing-1', listingTitle: 'CRM home', variant: 'channel' }
const publicUrl = 'https://home-seekers-website-alpha.vercel.app/demo/homeseekers/properties/listing-1'
beforeEach(() => { vi.resetAllMocks(); mocks.get.mockResolvedValue(connected) })
afterEach(cleanup)

it('offers the working Home Seekers listing link when the CRM reports it live', async () => {
  render(<WebsiteListingPublicationPanel {...props} />)
  expect((await screen.findByRole('link', { name: 'View listing' })).getAttribute('href')).toBe(publicUrl)
  expect(mocks.set).not.toHaveBeenCalled()
})

it.each([
  ['publish', 'unpublished', 'Publish to website'],
  ['update', 'published', 'Update website listing'],
])('records the correct public link after a CRM %s', async (action, status, label) => {
  mocks.get.mockResolvedValue({ ...connected, status })
  mocks.set.mockResolvedValue(connected)
  const draft = { headline: 'Current CRM details' }
  const onPrepare = vi.fn(async () => ({ ok: true, publicationDraft: draft }))
  const onPublicationAction = vi.fn()
  render(<WebsiteListingPublicationPanel {...props} onPrepare={onPrepare} onPublicationAction={onPublicationAction} />)
  fireEvent.click(await screen.findByText('Manage'))
  fireEvent.click(screen.getByRole('button', { name: label }))
  await waitFor(() => expect(onPublicationAction).toHaveBeenCalledWith(expect.objectContaining({ stage: 'accepted', action, publication: expect.objectContaining({ publicUrl }), draft })))
  expect(onPrepare).toHaveBeenCalledTimes(1)
  expect(mocks.set).toHaveBeenCalledWith('listing-1', action)
  expect(screen.getAllByRole('link', { name: 'View listing' }).every((link) => link.getAttribute('href') === publicUrl)).toBe(true)
})

it('removes the public link after unpublishing, while retaining the CRM listing', async () => {
  mocks.set.mockResolvedValue({ ...connected, status: 'unpublished' })
  const onPublicationAction = vi.fn()
  render(<WebsiteListingPublicationPanel {...props} onPublicationAction={onPublicationAction} />)
  fireEvent.click(await screen.findByText('Manage'))
  fireEvent.click(screen.getByRole('button', { name: 'Remove from website' }))
  await waitFor(() => expect(onPublicationAction).toHaveBeenCalledWith(expect.objectContaining({ stage: 'withdrawn' })))
  expect(mocks.set).toHaveBeenCalledWith('listing-1', 'unpublish')
  expect(screen.queryByRole('link', { name: 'View listing' })).toBeNull()
})

it('withholds the public link when the canonical listing is no longer published', async () => {
  mocks.get.mockResolvedValue({ ...connected, projectionStatus: 'Draft' })
  render(<WebsiteListingPublicationPanel {...props} />)
  await screen.findByText('Not visible on website')
  expect(screen.queryByRole('link', { name: 'View listing' })).toBeNull()
})

it('explains the screenshot state and prepares a hidden listing with one publish action', async () => {
  mocks.get.mockResolvedValue({ ...connected, projectionStatus: 'Draft', imageCount: 98, durableImageCount: 0, blockers: [
    'Publish the listing projection before enabling the agency-website channel.',
    'Prepare durable website copies for every listing image.',
  ] })
  mocks.set.mockResolvedValue({ ...connected, imageCount: 98, durableImageCount: 98 })
  const onPrepare = vi.fn(async () => ({ ok: true }))
  render(<WebsiteListingPublicationPanel {...props} onPrepare={onPrepare} />)
  fireEvent.click(await screen.findByText('Manage'))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('Not visible on website')).toBeTruthy()
  expect(mocks.set).not.toHaveBeenCalled()
  expect(onPrepare).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Publish to website' }))
  await waitFor(() => expect(mocks.set).toHaveBeenCalledWith('listing-1', 'update'))
  expect(onPrepare).toHaveBeenCalledTimes(1)
  await screen.findByText('Live on website')
})

it('keeps real website setup blockers visible and disables publishing', async () => {
  mocks.get.mockResolvedValue({ ...connected, websiteStatus: 'draft', status: 'unpublished', blockers: ['Publish the organisation website before publishing listing stock.'] })
  render(<WebsiteListingPublicationPanel {...props} />)
  fireEvent.click(await screen.findByText('Manage'))
  expect(screen.getByText('Make your agency website live in Website settings.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Publish to website' }).disabled).toBe(true)
  expect(mocks.set).not.toHaveBeenCalled()
})

it('shows a missing listing photo as something the agent must fix', async () => {
  mocks.get.mockResolvedValue({ ...connected, status: 'unpublished', imageCount: 0, blockers: ['Add at least one public HTTPS listing image.'] })
  render(<WebsiteListingPublicationPanel {...props} />)
  fireEvent.click(await screen.findByText('Manage'))
  expect(screen.getByText('Add at least one photo to this listing.')).toBeTruthy()
  expect(mocks.set).not.toHaveBeenCalled()
})

it('opening Manage and refreshing status never prepares or publishes a listing', async () => {
  const onPrepare = vi.fn()
  render(<WebsiteListingPublicationPanel {...props} onPrepare={onPrepare} />)
  fireEvent.click(await screen.findByText('Manage'))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
  expect(onPrepare).not.toHaveBeenCalled()
  expect(mocks.set).not.toHaveBeenCalled()
})
it('Edit listing opens the shared editor without saving or publishing', async () => {
 const onEdit=vi.fn()
 render(<WebsiteListingPublicationPanel {...props} onEdit={onEdit} />)
 fireEvent.click(await screen.findByText('Manage'))
 fireEvent.click(screen.getByRole('button',{name:'Edit listing'}))
 expect(onEdit).toHaveBeenCalledTimes(1)
 expect(mocks.set).not.toHaveBeenCalled()
})
