import {it,expect,vi} from 'vitest'
import {loadTransactionSellerWorkspace,saveTransactionSellerWorkspace} from '../transactionSellerWorkspaceService.js'
import {createListingSellerProfileBuilderDraft} from '../../lib/listingSellerProfileBuilderModel.js'
const edit={revision:{listingId:'listing',transactionId:'tx'},details:{name:'Seller',email:'seller@example.test'}}
const listing={id:'listing',organisationId:'org',sellerOnboarding:{id:'onboarding',updatedAt:'original',formData:{sellerFirstName:'Old',sellerSurname:'Owner',sellerLegalType:'individual',email:'seller@example.test',propertyAddress:'Original address',mandateType:'sole'}}}
it('uses the exact linked listing and the same profile builder, not a transaction copy',async()=>{
 const dependencies={loadEdit:vi.fn().mockResolvedValue(edit),getListing:vi.fn().mockResolvedValue(listing),loadCapture:vi.fn()}
 const c=await loadTransactionSellerWorkspace({transactionId:'tx',dependencies})
 expect(c).toMatchObject({authority:'listing',listing})
 expect(c.captureDraft).toEqual(createListingSellerProfileBuilderDraft(listing))
 expect(dependencies.getListing).toHaveBeenCalledWith('listing',{includeRequirementsAndDocuments:false})
 expect(dependencies.loadCapture).not.toHaveBeenCalled()
})
it('uses transaction capture when there is no linked listing',async()=>{
 const c={profile:{},revision:{listingId:null},details:{},roster:[]}
 const dependencies={loadEdit:vi.fn().mockResolvedValue({...edit,revision:{listingId:null}}),loadCapture:vi.fn().mockResolvedValue(c),getListing:vi.fn()}
 expect(await loadTransactionSellerWorkspace({transactionId:'tx',dependencies})).toBe(c)
 expect(dependencies.getListing).not.toHaveBeenCalled()
})
it('saves linked corrections through the listing canonical command using the original revision',async()=>{
 const c={...edit,authority:'listing',listing,captureDraft:createListingSellerProfileBuilderDraft(listing)}
 const next={...listing,sellerOnboarding:{...listing.sellerOnboarding,updatedAt:'saved'}}
 const save=vi.fn().mockResolvedValue({listing:next,receipt:{mutationId:'mutation'},update:{mutationId:'mutation'}})
 const draft={...c.captureDraft,sellerFirstName:'Updated',propertyAddress:'Do not change property',mandateType:'open',popiConsent:true}
 const result=await saveTransactionSellerWorkspace({transactionId:'tx',context:c,draft,mutationId:'mutation',dependencies:{loadEdit:vi.fn().mockResolvedValue(edit),saveListing:save}})
 const input=save.mock.calls[0][0]
 expect(input.listing).toBe(listing)
 expect(input.mutationId).toBe('mutation')
 expect(input.formPatch.sellerFirstName).toBe('Updated')
 expect(input.formPatch.propertyAddress).toBeUndefined()
 expect(input.formPatch.mandateType).toBeUndefined()
 expect(input.formPatch.popiConsent).toBeUndefined()
 expect(result.captureDraft).toEqual(createListingSellerProfileBuilderDraft(next))
})
it('does not save when the transaction has been linked to a different seller listing',async()=>{
 const save=vi.fn()
 await expect(saveTransactionSellerWorkspace({transactionId:'tx',context:{...edit,authority:'listing',listing},draft:{},mutationId:'m',dependencies:{loadEdit:vi.fn().mockResolvedValue({revision:{listingId:'other'}}),saveListing:save}})).rejects.toThrow('linked seller profile changed')
 expect(save).not.toHaveBeenCalled()
})
it('keeps uncertain and stale canonical saves as errors without writing a transaction fallback',async()=>{
 const fallback=vi.fn(),save=vi.fn().mockRejectedValue(new Error('Newer listing profile saved'))
 await expect(saveTransactionSellerWorkspace({transactionId:'tx',context:{...edit,authority:'listing',listing},draft:createListingSellerProfileBuilderDraft(listing),mutationId:'m',dependencies:{loadEdit:vi.fn().mockResolvedValue(edit),saveListing:save,saveCapture:fallback}})).rejects.toThrow('Newer listing')
 expect(fallback).not.toHaveBeenCalled()
})
