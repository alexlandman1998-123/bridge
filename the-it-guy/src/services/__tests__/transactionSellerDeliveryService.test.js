import {it,expect,vi} from 'vitest'
import {prepareSellerWorkspaceDelivery} from '../transactionSellerDeliveryService.js'
const c={revision:{listingId:null,updatedAt:'original'},details:{email:'seller@example.test',phone:'0801',name:'Seller'}}
it('prepares a scoped transaction seller link without creating a listing',async()=>{
 const prepare=vi.fn().mockResolvedValue({email:c.details.email,name:'Seller',linkId:'link',link:'https://app.example.test/seller/transaction/token'})
 const listing=vi.fn()
 const result=await prepareSellerWorkspaceDelivery({transactionId:'tx',context:c,mutationId:'m',dependencies:{load:vi.fn().mockResolvedValue(c),prepareTransaction:prepare,prepareListing:listing}})
 expect(result).toMatchObject({transactionId:'tx',transactionSellerLinkId:'link',to:c.details.email})
 expect(prepare).toHaveBeenCalledWith({transactionId:'tx',context:c,mutationId:'m'})
 expect(listing).not.toHaveBeenCalled()
})
it('reuses the existing listing seller preparation without restarting the listing lifecycle',async()=>{
 const linked={...c,authority:'listing',revision:{listingId:'listing'},listing:{id:'listing'}}
 const prepare=vi.fn().mockResolvedValue({link:'https://app.example.test/seller/onboarding/token',onboarding:{id:'onboarding'}})
 const result=await prepareSellerWorkspaceDelivery({transactionId:'tx',context:linked,mutationId:'m',dependencies:{load:vi.fn().mockResolvedValue(linked),prepareListing:prepare}})
 expect(result.listingId).toBe('listing')
 expect(prepare).toHaveBeenCalledWith('listing',expect.objectContaining({listingSnapshot:linked.listing,deferStatusTransition:true,sellerContactEmail:c.details.email}))
})
it('never prepares or sends to a stale reviewed recipient',async()=>{
 const prepare=vi.fn()
 await expect(prepareSellerWorkspaceDelivery({transactionId:'tx',context:c,mutationId:'m',dependencies:{load:vi.fn().mockResolvedValue({...c,revision:{updatedAt:'newer'}}),prepareTransaction:prepare}})).rejects.toThrow('Seller details changed')
 expect(prepare).not.toHaveBeenCalled()
})
