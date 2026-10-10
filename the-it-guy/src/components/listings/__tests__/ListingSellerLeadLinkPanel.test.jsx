// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ListingSellerLeadLinkPanel from '../ListingSellerLeadLinkPanel'
const api = vi.hoisted(() => ({ search: vi.fn(), link: vi.fn() }))
vi.mock('../../../services/listings/listingSellerLeadLinkService', () => ({
  getListingSellerLeadId: listing => listing?.sellerLeadId || listing?.originatingCrmLeadId || '',
  searchListingSellerLeads: api.search, linkListingSellerLead: api.link,
}))
const listing = { id: 'listing-1', organisationId: 'org-1', sellerName: 'Saved Owner', sellerOnboarding: { formData: { fullName: 'Saved Owner' } } }
const lead = { leadId: 'lead-1', name: 'Jane Seller', email: 'jane@example.test', phone: '0721234567', propertyAddress: '12 Main Road' }
beforeEach(() => { vi.clearAllMocks(); api.search.mockResolvedValue([lead]); api.link.mockResolvedValue({ listingId: listing.id, sellerLeadId: lead.leadId, originatingCrmLeadId: lead.leadId }) })
afterEach(cleanup)
async function chooseLead(props = {}) {
  render(<ListingSellerLeadLinkPanel listing={listing} {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Link seller lead' }))
  fireEvent.change(screen.getByLabelText('Search seller leads'), { target: { value: 'Jane' } })
  fireEvent.click(await screen.findByRole('radio', { name: /Jane Seller/ }))
}
it('searches only after opening and entering a name, then links the selected lead and opens it', async () => {
  const onLinked = vi.fn(), onOpenLead = vi.fn()
  await chooseLead({ onLinked, onOpenLead })
  expect(api.search).toHaveBeenCalledWith({ listing: { id: listing.id, organisationId: listing.organisationId }, search: 'Jane' })
  fireEvent.click(screen.getByRole('button', { name: 'Link seller lead' }))
  await screen.findByText('Linked to Jane Seller.')
  expect(api.link).toHaveBeenCalledWith({ listing, leadId: lead.leadId })
  expect(onLinked).toHaveBeenCalledWith(expect.objectContaining({ sellerLeadId: lead.leadId }))
  expect(listing.sellerOnboarding.formData.fullName).toBe('Saved Owner')
  fireEvent.click(screen.getByRole('button', { name: /Open seller lead/ }))
  expect(onOpenLead).toHaveBeenCalledWith(lead.leadId)
})
it('an already linked listing offers open only and does not search', () => {
  render(<ListingSellerLeadLinkPanel listing={{ ...listing, originatingCrmLeadId: 'existing' }} />)
  expect(screen.queryByRole('button', { name: 'Link seller lead' })).toBeNull()
  expect(screen.getByRole('button', { name: /Open seller lead/ })).toBeTruthy()
  expect(api.search).not.toHaveBeenCalled()
})
it('keeps the selected lead on a failed save and allows a safe retry', async () => {
  const onLinked = vi.fn()
  api.link.mockRejectedValueOnce(new Error('This lead was linked to another listing.'))
  await chooseLead({ onLinked })
  fireEvent.click(screen.getByRole('button', { name: 'Link seller lead' }))
  await screen.findByRole('alert')
  expect(onLinked).not.toHaveBeenCalled()
  expect(screen.getByRole('radio', { name: /Jane Seller/ }).checked).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Link seller lead' }))
  await screen.findByText('Linked to Jane Seller.')
})
it('locks duplicate submissions and cancellation until the link finishes', async () => {
  let resolve
  api.link.mockReturnValue(new Promise(done => { resolve = done }))
  await chooseLead()
  const button = screen.getByRole('button', { name: 'Link seller lead' })
  fireEvent.click(button); fireEvent.click(button)
  expect(api.link).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
  resolve({ listingId: listing.id, sellerLeadId: lead.leadId, originatingCrmLeadId: lead.leadId })
  await screen.findByText('Linked to Jane Seller.')
})
it('discards an old search response when a different search is entered', async () => {
  let resolveFirst
  api.search.mockReturnValueOnce(new Promise(done => { resolveFirst = done }))
  render(<ListingSellerLeadLinkPanel listing={listing} />)
  fireEvent.click(screen.getByRole('button', { name: 'Link seller lead' }))
  fireEvent.change(screen.getByLabelText('Search seller leads'), { target: { value: 'Old' } })
  await waitFor(() => expect(api.search).toHaveBeenCalledTimes(1))
  fireEvent.change(screen.getByLabelText('Search seller leads'), { target: { value: 'Jane' } })
  await screen.findByRole('radio', { name: /Jane Seller/ })
  resolveFirst([{ ...lead, name: 'Old Seller' }])
  await waitFor(() => expect(screen.queryByText('Old Seller')).toBeNull())
})
it('shows failed searches as errors instead of claiming no matching leads', async () => {
  api.search.mockRejectedValue(new Error('Access unavailable'))
  render(<ListingSellerLeadLinkPanel listing={listing} />)
  fireEvent.click(screen.getByRole('button', { name: 'Link seller lead' }))
  fireEvent.change(screen.getByLabelText('Search seller leads'), { target: { value: 'Jane' } })
  await screen.findByText('Access unavailable')
  expect(screen.queryByText(/No available seller leads/)).toBeNull()
})
