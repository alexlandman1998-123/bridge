// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), persisted: true }))
vi.mock('../../../context/OrganisationContext', () => ({ useOrganisation: () => ({ organisation: { id: 'org-1' } }) }))
vi.mock('../../../services/privateListingService', () => ({ getOrganisationPrivateListings: api.list }))
vi.mock('../../../lib/marketingEventStore', () => ({ useMarketingEvents: () => ({ createEvent: api.create, updateEvent: api.update, persisted: api.persisted }), formatEventDate: (value) => value }))
import ShowDayCreate from '../ShowDayCreate'
const listing = { id: 'listing-1', title: 'Parkhurst home', askingPrice: 2200000, formattedAddress: '7 Sixth Street', listingStatus: 'active', assignedAgentName: 'Agent One', assignedAgentId: 'agent-1' }
beforeEach(() => { vi.clearAllMocks(); api.persisted = true; api.list.mockResolvedValue([listing, {...listing, id: 'listing-2', title: 'Second home', assignedAgentName: 'Agent Two', assignedAgentId: 'agent-2'}]); api.create.mockResolvedValue({ id: 'event-1', publicToken: 'token-1' }); api.update.mockResolvedValue({ id: 'event-1', publicToken: 'token-1' }) })
afterEach(cleanup)
const open = (onCreated = vi.fn()) => render(<ShowDayCreate onBack={vi.fn()} onCreated={onCreated} />)
const choose = async () => fireEvent.click(await screen.findByRole('button', {name: /Parkhurst home/}))
const complete = async () => { await choose(); fireEvent.change(screen.getByLabelText('Date'), {target: {value: '2099-10-03'}}) }
const review = () => { fireEvent.click(screen.getByRole('button', {name: 'Guest experience'})); fireEvent.click(screen.getByRole('button', {name: 'Review show day'})) }
it('allows an incomplete draft and updates the same saved event', async () => {
 open(); await choose(); fireEvent.click(screen.getByRole('button', {name: 'Save draft'})); await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', startDate: '', subjectId: 'listing-1' })))
 await screen.findByText('Draft saved'); fireEvent.change(screen.getByLabelText('Date'), {target: {value: '2099-10-03'}}); fireEvent.click(screen.getByRole('button', {name: 'Save draft'})); await waitFor(() => expect(api.update).toHaveBeenCalledWith('event-1', expect.objectContaining({startDate: '2099-10-03'})))
 expect(api.create).toHaveBeenCalledTimes(1)
})
it('blocks past dates and invalid time ranges before proceeding', async () => {
 open(); await complete(); fireEvent.change(screen.getByLabelText('Date'), {target: {value: '2000-01-01'}}); expect(screen.getByRole('button', {name: 'Guest experience'}).disabled).toBe(true)
 fireEvent.change(screen.getByLabelText('Date'), {target: {value: '2099-10-03'}}); fireEvent.change(screen.getByLabelText('End time'), {target: {value: '09:00'}}); expect(screen.getByRole('button', {name: 'Guest experience'}).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button', {name: 'Save draft'})); await screen.findByRole('alert'); expect(api.create).not.toHaveBeenCalled()
})
it('changes the linked host with the listing and clears account assignment for custom names', async () => {
 open(); await choose(); fireEvent.click(screen.getByRole('button', {name: 'Change listing'})); fireEvent.click(screen.getByRole('button', {name: /Second home/})); expect(screen.getByLabelText(/Host agent/).value).toBe('Agent Two')
 fireEvent.change(screen.getByLabelText(/Host agent/), {target: {value: 'Guest host'}}); fireEvent.click(screen.getByRole('button', {name: 'Save draft'})); await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({hostName: 'Guest host', hostUserId: null, subjectId: 'listing-2'})))
})
it('reviews all guest settings and publishes only once, then opens the saved event', async () => {
 const onCreated = vi.fn(); let resolveSave; api.create.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))
 open(onCreated); await complete(); expect(screen.queryByRole('button', {name: 'Publish show day'})).toBeNull(); fireEvent.click(screen.getByRole('button', {name: 'Guest experience'})); fireEvent.click(screen.getByLabelText(/Guest registration/)); expect(screen.getByLabelText(/Create leads/).disabled).toBe(true); fireEvent.click(screen.getByRole('button', {name: 'Review show day'}))
 const publish = screen.getByRole('button', {name: 'Publish show day'}); fireEvent.click(publish); fireEvent.click(publish); expect(api.create).toHaveBeenCalledTimes(1); expect(api.create).toHaveBeenCalledWith(expect.objectContaining({status: 'upcoming', registrationEnabled: false, createLeadsForRegistrations: false}))
 resolveSave({id: 'event-1'}); await waitFor(() => expect(onCreated).toHaveBeenCalledWith('event-1'))
})
it('prevents fake publication when shared persistence is unavailable', async () => {
 api.persisted = false; open(); await complete(); review(); expect(screen.getByRole('button', {name: 'Publish show day'}).disabled).toBe(true); expect(screen.getByText(/Drafts stay on this device/)).toBeTruthy(); expect(api.create).not.toHaveBeenCalled()
})
it('blocks public publication for inactive listings but allows a private event', async () => {
 api.list.mockResolvedValue([{...listing, listingStatus: 'draft'}]); open(); await complete(); review(); expect(screen.getByRole('button', {name: 'Publish show day'}).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button', {name: /Property & timing/})); fireEvent.click(screen.getByRole('button', {name: /Invitation only/})); review(); expect(screen.getByRole('button', {name: 'Publish show day'}).disabled).toBe(false)
})
it('shows listings beyond the original eight and surfaces load/save failures', async () => {
 api.list.mockResolvedValue(Array.from({length: 10}, (_, index) => ({...listing, id: String(index), title: `Property ${index}`}))); open(); await screen.findByRole('button', {name: /Property 0/}); expect(screen.queryByRole('button', {name: /Property 9/})).toBeNull(); fireEvent.click(screen.getByRole('button', {name: 'Show more listings'})); fireEvent.click(screen.getByRole('button', {name: /Property 9/})); api.create.mockRejectedValue(new Error('Permission denied')); fireEvent.click(screen.getByRole('button', {name: 'Save draft'})); expect((await screen.findByRole('alert')).textContent).toBe('Permission denied')
})
