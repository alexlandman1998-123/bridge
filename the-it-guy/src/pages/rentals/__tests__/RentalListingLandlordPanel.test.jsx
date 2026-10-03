// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RentalListingLandlordPanel from '../RentalListingLandlordPanel'
const api=vi.hoisted(()=>({load:vi.fn(),save:vi.fn()}))
vi.mock('../../../services/rentals/rentalListingLandlordService',()=>({loadListingLandlordSetup:api.load,saveListingLandlord:api.save,rentalListingHasLandlord:(listing,lead)=>Boolean(listing.sellerCanonicalFacts?.landlordContactId || lead?.id)}))
const listing={id:'listing-1',listingCategory:'rental',organisationId:'org-1'}
const scope={organisationId:'org-1',assignedAgentId:'agent-1'}
beforeEach(()=>{vi.clearAllMocks();api.load.mockResolvedValue({contacts:[{id:'contact-1',name:'Existing Landlord',email:'owner@example.test',phone:'0123456789'}],linkedLead:null})})
afterEach(cleanup)
function open(onSaved=vi.fn(),current=listing){return render(<MemoryRouter><RentalListingLandlordPanel listing={current} scope={scope} onSaved={onSaved}/></MemoryRouter>)}
it('locks the profile until an existing landlord is actually saved',async()=>{
 const onSaved=vi.fn();open(onSaved)
 await screen.findByRole('button',{name:/Existing Landlord/})
 expect(screen.getByText('Landlord profile locked')).toBeTruthy()
 expect(screen.getByRole('button',{name:'Connect selected landlord'}).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:/Existing Landlord/}))
 expect(onSaved).not.toHaveBeenCalled()
 api.save.mockResolvedValue({...listing,sellerCanonicalFacts:{landlordContactId:'contact-1'}})
 fireEvent.click(screen.getByRole('button',{name:'Connect selected landlord'}))
 await waitFor(()=>expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({sellerCanonicalFacts:{landlordContactId:'contact-1'}})))
 expect(api.save).toHaveBeenCalledWith('listing-1',expect.objectContaining({landlordName:'Existing Landlord'}),expect.objectContaining({mode:'existing',contactId:'contact-1',organisationId:'org-1'}))
})
it('retains entered details and one client identity on a failed creation retry',async()=>{
 open();await screen.findByRole('button',{name:/Existing Landlord/})
 fireEvent.change(screen.getByLabelText('Landlord or entity name'),{target:{value:'New Owner'}})
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'new@example.test'}})
 api.save.mockRejectedValueOnce(new Error('Connection save failed')).mockResolvedValueOnce({...listing,sellerCanonicalFacts:{landlordContactId:'new-contact'}})
 fireEvent.click(screen.getByRole('button',{name:'Create and connect landlord'}))
 await screen.findByText('Connection save failed')
 expect(screen.getByText('Landlord profile locked')).toBeTruthy()
 expect(screen.getByLabelText('Landlord or entity name').value).toBe('New Owner')
 fireEvent.click(screen.getByRole('button',{name:'Create and connect landlord'}))
 await waitFor(()=>expect(api.save).toHaveBeenCalledTimes(2))
 expect(api.save.mock.calls[0][2].contactId).toBe(api.save.mock.calls[1][2].contactId)
})
it('opens the existing profile after reloading a saved landlord connection',async()=>{
 open(vi.fn(),{...listing,sellerCanonicalFacts:{landlordContactId:'contact-1',landlordName:'Existing Landlord',landlordEmail:'owner@example.test',landlordType:'company'}})
 expect(screen.getByRole('heading',{name:'Landlord profile'})).toBeTruthy()
 expect(screen.queryByText('Landlord profile locked')).toBeNull()
 expect(screen.getByLabelText('Landlord or entity name').value).toBe('Existing Landlord')
 expect(screen.getByLabelText('Landlord type').value).toBe('company')
})
