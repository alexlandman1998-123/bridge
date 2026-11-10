import { expect,it,vi } from 'vitest'
import { listingPriceChange,priceUpdateProperty24Status,publishListingPriceUpdate } from '../listingPriceUpdate.js'
const channels=['Property24','Private Property','Agency Website','Kingdom Website']
function setup(){return {save:vi.fn(async()=>({ok:true})),check:vi.fn(async()=>{}),recordStarted:vi.fn(async()=>{}),recordStage:vi.fn(async()=>{}),send:vi.fn(async()=>{}),recordFinished:vi.fn(async()=>{}),onProgress:vi.fn()}}
const input=(overrides={})=>({previousPrice:1000000,price:900000,showReducedBanner:true,listingStatus:'active',activeChannels:channels,...overrides})
it.each(['0','-1','NaN','12abc','1.234','1e6','Infinity'])('rejects invalid price %s before saving',price=>{expect(()=>listingPriceChange(input({price}))).toThrow()})
it('supports price increases and optional reduction labels without reactivating under-offer listings',()=>{
 expect(priceUpdateProperty24Status(input())).toBe('ReducedPrice')
 expect(priceUpdateProperty24Status(input({showReducedBanner:false}))).toBe('Active')
 expect(priceUpdateProperty24Status(input({price:1100000,showReducedBanner:false}))).toBe('RaisedPrice')
 expect(priceUpdateProperty24Status(input({listingStatus:'under_offer'}))).toBe('Pending')
 expect(()=>listingPriceChange(input({price:1100000}))).toThrow(/lower/)
 expect(()=>listingPriceChange(input({pricePresentation:'poa'}))).toThrow(/fixed price/)
 expect(()=>listingPriceChange(input({listingStatus:'sold'}))).toThrow(/Reopen/)
})
it('saves once before publishing every active channel with the same price and Reduced selection',async()=>{
 const deps=setup(),order=[]
 deps.save.mockImplementation(async c=>{order.push('save');expect(c.price).toBe(900000);return {ok:true}})
 deps.send.mockImplementation(async(channel,c)=>{order.push(channel);expect(c.showReducedBanner).toBe(true);expect(c.price).toBe(900000)})
 const result=await publishListingPriceUpdate(input(),deps)
 expect(result.ok).toBe(true);expect(order).toEqual(['save',...channels]);expect(deps.recordStarted).toHaveBeenCalledOnce()
 expect(result.results.find(row=>row.channel==='Private Property').detail).toContain('does not expose a Reduced flag')
})
it('never publishes when saving or preparing advertising data fails',async()=>{
 const deps=setup();deps.save.mockResolvedValue({ok:false,error:new Error('Save failed')})
 await expect(publishListingPriceUpdate(input(),deps)).rejects.toThrow('Save failed');expect(deps.send).not.toHaveBeenCalled()
 deps.save.mockResolvedValue({ok:true,distributionSync:{skipped:true}})
 const result=await publishListingPriceUpdate(input(),deps)
 expect(result.results[0].status).toBe('saved');expect(result.ok).toBe(false);expect(deps.send).not.toHaveBeenCalled()
})
it('retries only confirmed failures and never resaves or resends accepted channels',async()=>{
 const first=setup();first.send.mockImplementation(async channel=>{if(channel==='Private Property')throw new Error('Validation rejected')})
 const result=await publishListingPriceUpdate(input(),first)
 const retry=setup();const second=await publishListingPriceUpdate(input({retryResults:result.results,currentPrice:900000,currentReduced:true}),retry)
 expect(second.ok).toBe(true);expect(retry.save).not.toHaveBeenCalled();expect(retry.send.mock.calls.map(call=>call[0])).toEqual(['Private Property'])
 expect(second.results.find(row=>row.channel==='Property24').status).toBe('sent')
 await expect(publishListingPriceUpdate(input({retryResults:result.results,currentPrice:850000,currentReduced:true}),setup())).rejects.toThrow(/saved price changed/)
})
it('keeps uncertain requests out of retries while allowing other published channels to update',async()=>{
 const deps=setup();deps.check.mockImplementation(async channel=>{if(channel==='Property24')throw Object.assign(new Error('Previous request is unconfirmed'),{code:'LISTING_PUBLICATION_UNSETTLED'})})
 const result=await publishListingPriceUpdate(input(),deps)
 expect(result.results.find(row=>row.channel==='Property24').status).toBe('uncertain');expect(deps.send.mock.calls.map(call=>call[0])).toEqual(channels.slice(1))
 const network=setup();network.send.mockRejectedValue(new TypeError('Network failure'))
 const failed=await publishListingPriceUpdate(input({activeChannels:['Property24']}),network)
 expect(failed.results.at(-1)).toMatchObject({status:'uncertain',retryable:false})
})
it('a confirmed provider acceptance remains accepted when recording its receipt fails',async()=>{
 const deps=setup();deps.recordStage.mockImplementation(async(_channel,stage)=>{if(stage==='accepted')throw new Error('Audit down')})
 const result=await publishListingPriceUpdate(input({activeChannels:['Property24']}),deps)
 expect(result.results.at(-1).status).toBe('sent');expect(result.results.at(-1).detail).toContain('history needs attention')
})
it('a failure to start monitoring prevents all external sends and retains the saved price receipt',async()=>{
 const deps=setup();deps.recordStarted.mockRejectedValue(new Error('No audit permission'))
 const result=await publishListingPriceUpdate(input(),deps)
 expect(result.ok).toBe(false);expect(result.results[0].status).toBe('saved');expect(deps.send).not.toHaveBeenCalled()
})
it('leaves unpublished channels untouched',async()=>{
 const deps=setup();const result=await publishListingPriceUpdate(input({activeChannels:[]}),deps)
 expect(result.ok).toBe(true);expect(result.results).toHaveLength(1);expect(deps.send).not.toHaveBeenCalled()
})

it('keeps an unconfirmed provider response out of retry while retaining other delivery receipts',async()=>{
 const deps=setup();deps.send.mockImplementation(async channel=>{if(channel==='Property24')throw new Error('Property24 did not confirm the price update.');if(channel==='Private Property')throw new Error('Validation rejected')})
 const first=await publishListingPriceUpdate(input(),deps)
 const retry=setup();const second=await publishListingPriceUpdate(input({retryResults:first.results,currentPrice:900000,currentReduced:true}),retry)
 expect(retry.send.mock.calls.map(call=>call[0])).toEqual(['Private Property'])
 expect(second.ok).toBe(false);expect(second.results.find(row=>row.channel==='Property24').status).toBe('uncertain')
 expect(second.results.find(row=>row.channel==='Agency Website').status).toBe('sent')
})

it('does not allow retry to bypass failed preparation of the advertising data',async()=>{
 const deps=setup();deps.save.mockResolvedValue({ok:true,distributionSync:{skipped:true}})
 const first=await publishListingPriceUpdate(input(),deps)
 expect(first.results.filter(row=>row.status==='failed').every(row=>row.retryable===false)).toBe(true)
 const retry=setup();await publishListingPriceUpdate(input({retryResults:first.results,currentPrice:900000,currentReduced:true}),retry)
 expect(retry.send).not.toHaveBeenCalled()
})

it('retains Reduced in rental saved facts and publication snapshots, and removes it when unchecked',async()=>{
 const { buildRentalListingEditForm,buildRentalListingEditPublicationDraft }=await import('../../rentals/rentalListingEditModel.js')
 const { buildRentalCanonicalFacts }=await import('../../rentals/rentalListingDraftModel.js')
 const { buildRentalPublicationSnapshot }=await import('../../rentals/rentalListingChannelModel.js')
 const listing={id:'rental',listingType:'Rental',listingStatus:'active',askingPrice:9000,listingPublicationData:{features:['reduced_banner','Private garden']},listingMedia:[]}
 const form=buildRentalListingEditForm(listing)
 expect(form.showReducedBanner).toBe(true)
 expect(buildRentalCanonicalFacts(form).propertyProfile.showReducedBanner).toBe(true)
 expect(buildRentalListingEditPublicationDraft(form).features).toContain('reduced_banner')
 expect(buildRentalPublicationSnapshot(listing).showReducedBanner).toBe(true)
 const cleared=buildRentalListingEditPublicationDraft({...form,showReducedBanner:false,selectedFeatures:['reduced_banner','Private garden']})
 expect(cleared.features).not.toContain('reduced_banner');expect(cleared.features).toContain('Private garden')
})
