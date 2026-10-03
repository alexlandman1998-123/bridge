import { expect, it, vi } from 'vitest'
vi.mock('../../../lib/supabaseClient',()=>({supabase:null,isSupabaseConfigured:false}))
import { loadListingLandlordSetup, saveListingLandlord } from '../rentalListingLandlordService'
const values={landlordName:'Landlord',landlordEmail:'owner@example.test',landlordPhone:'0123456789',landlordType:'company'}
const listing={id:'listing-1',organisationId:'org-1',listingCategory:'rental',sellerCanonicalFactReadiness:{monthlyRent:true,propertyAddress:false,landlordName:false},sellerCanonicalFacts:{propertyProfile:{bedrooms:3},mandateStatus:'signed'}}
function api() {
 return {getListing:vi.fn().mockResolvedValue(listing),listContacts:vi.fn().mockResolvedValue([]),saveContact:vi.fn().mockResolvedValue({}),updateListing:vi.fn(async(id,patch)=>({...listing,sellerCanonicalFacts:patch.sellerCanonicalFacts}))}
}
it('creates a reusable client and persists its connection without changing property facts or media',async()=>{
 const dependencies=api()
 const saved=await saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'new',contactId:'contact-1'},dependencies)
 expect(dependencies.saveContact).toHaveBeenCalledWith('org-1',expect.objectContaining({contactId:'contact-1',contactType:'landlord',name:'Landlord'}),expect.anything())
 expect(saved.sellerCanonicalFacts.landlordContactId).toBe('contact-1')
 expect(saved.sellerCanonicalFacts.propertyProfile).toEqual({bedrooms:3})
 expect(dependencies.updateListing.mock.calls[0][1]).not.toHaveProperty('listingPublicationData')
 expect(saved.sellerCanonicalFacts.mandateStatus).toBe('signed')
 expect(dependencies.updateListing.mock.calls[0][1].sellerCanonicalFactReadiness).toEqual({monthlyRent:true,propertyAddress:false,landlordName:true,landlordContact:true})
})
it('uses the selected workspace contact as the source of name, email and phone',async()=>{
 const dependencies=api();dependencies.listContacts.mockResolvedValue([{id:'contact-2',name:'Existing landlord',email:'saved@example.test',phone:'0999999999'}])
 const saved=await saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'existing',contactId:'contact-2'},dependencies)
 expect(dependencies.saveContact).not.toHaveBeenCalled()
 expect(saved.sellerCanonicalFacts.landlordName).toBe('Existing landlord')
 expect(saved.sellerCanonicalFacts.landlordEmail).toBe('saved@example.test')
 expect(saved.sellerCanonicalFacts.landlordContactId).toBe('contact-2')
})
it('rejects another workspace, invalid contacts and duplicates before writing',async()=>{
 const dependencies=api()
 await expect(saveListingLandlord('listing-1',values,{organisationId:'other',mode:'new',contactId:'contact-1'},dependencies)).rejects.toThrow('selected workspace')
 await expect(saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'existing',contactId:'missing'},dependencies)).rejects.toThrow('available')
 dependencies.listContacts.mockResolvedValue([{id:'duplicate',email:'owner@example.test'}])
 await expect(saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'new',contactId:'contact-1'},dependencies)).rejects.toThrow('already in Clients')
 expect(dependencies.updateListing).not.toHaveBeenCalled();expect(dependencies.saveContact).not.toHaveBeenCalled()
})
it('keeps one contact identity when the listing save fails and is retried',async()=>{
 const dependencies=api();dependencies.updateListing.mockRejectedValueOnce(new Error('Listing save failed'))
 const context={organisationId:'org-1',mode:'new',contactId:'retry-contact'}
 await expect(saveListingLandlord('listing-1',values,context,dependencies)).rejects.toThrow('Listing save failed')
 await saveListingLandlord('listing-1',values,context,dependencies)
 expect(dependencies.saveContact.mock.calls.map((call)=>call[1].contactId)).toEqual(['retry-contact','retry-contact'])
})
it('preserves a landlord lead connection, including a portfolio listing',async()=>{
 const linkedLead={id:'lead-1',role:'landlord',relationships:{listingId:'listing-1'}}
 const result=await loadListingLandlordSetup(listing,{organisationId:'org-1',scopeLevel:'assigned'},{listContacts:async()=>[],listLeads:async()=>[linkedLead]})
 expect(result.linkedLead).toBe(linkedLead)
 const dependencies=api()
 const saved=await saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'profile',linkedLead},dependencies)
 expect(saved.sellerCanonicalFacts.landlordName).toBe('Landlord')
 expect(dependencies.saveContact).not.toHaveBeenCalled()
})
