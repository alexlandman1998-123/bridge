// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ListingShowDaysPanel from '../ListingShowDaysPanel'
const api = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn() }))
vi.mock('../../../services/marketingEventRepository', () => ({ canPersistMarketingEvents: () => true, createMarketingEvent: api.create, listMarketingEvents: api.list }))
const listing = { id: 'listing-1', title: 'Family home', address: '1 Main Road', agentId: 'agent-1', agentName: 'Original Agent' }
beforeEach(() => { vi.clearAllMocks(); api.list.mockResolvedValue([]); api.create.mockResolvedValue({id:'event-1',listingId:'listing-1',status:'Upcoming',publicToken:'public-1'}) })
afterEach(cleanup)
async function open() {
  render(<MemoryRouter><ListingShowDaysPanel organisationId="org-1" listing={listing} publicListingReady /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', {name:'Create show day'}))
  fireEvent.change(screen.getByLabelText('Date'), {target:{value:'2099-10-03'}})
}
it('saves the canonical listing, clears a custom host account, exposes RSVP and reloads only linked events', async () => {
  await open()
  fireEvent.change(screen.getByLabelText('Host agent'), {target:{value:'Guest host'}})
  api.list.mockResolvedValue([{id:'event-1',listingId:'listing-1',title:'Saved show day',status:'Upcoming'}, {id:'unrelated',listingId:'other',title:'Other property'}])
  fireEvent.click(screen.getByRole('button', {name:'Publish and create RSVP'}))
  await screen.findByText('Show day published. The RSVP link is ready to share.')
  expect(api.create).toHaveBeenCalledWith('org-1','showDays',expect.objectContaining({subjectId:'listing-1',hostName:'Guest host',hostUserId:null,status:'upcoming',registrationEnabled:true}))
  expect(screen.getByRole('link',{name:'Preview RSVP page'}).getAttribute('href')).toBe('/marketing/rsvp/public-1')
  expect(screen.getByRole('link',{name:/Open in Show Days/}).getAttribute('href')).toContain('id=event-1')
  expect(screen.getByText('Saved show day')).toBeTruthy()
  expect(screen.queryByText('Other property')).toBeNull()
})
it('blocks past dates and retains the form on save failure', async () => {
  await open()
  fireEvent.change(screen.getByLabelText('Date'),{target:{value:'2000-01-01'}})
  fireEvent.click(screen.getByRole('button',{name:'Save draft'}))
  expect(api.create).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toContain('current or future')
  fireEvent.change(screen.getByLabelText('Date'),{target:{value:'2099-10-03'}})
  api.create.mockRejectedValue(new Error('Save unavailable'))
  fireEvent.click(screen.getByRole('button',{name:'Save draft'}))
  await screen.findByText('Save unavailable')
  expect(screen.getByLabelText('Date').value).toBe('2099-10-03')
  expect(screen.queryByRole('link',{name:'Preview RSVP page'})).toBeNull()
})
it('locks duplicate submissions and cannot close while saving', async () => {
  let resolve
  api.create.mockReturnValue(new Promise((done) => {resolve=done}))
  await open()
  const button=screen.getByRole('button',{name:'Publish and create RSVP'})
  fireEvent.click(button); fireEvent.click(button)
  expect(api.create).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button',{name:'Close dialog'}))
  expect(screen.getByRole('dialog')).toBeTruthy()
  resolve({id:'event-1',status:'Upcoming',publicToken:'public-1'})
  await waitFor(() => expect(within(screen.getByRole('dialog')).getByText(/Show day published/)).toBeTruthy())
})
