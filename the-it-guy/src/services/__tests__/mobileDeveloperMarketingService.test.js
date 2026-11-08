import { expect, it, vi } from 'vitest'
import { loadMobileDeveloperMarketing, recentDeveloperLeads } from '../mobileDeveloperMarketingService.js'
const dev='00000000-0000-4000-8000-000000000001'
const listing='00000000-0000-4000-8000-000000000002'
function setup(failWebsite=false) {
 const scope=[]
 const client={from:vi.fn(table=>{expect(table).toBe('private_listings');const q={select:()=>q,in:(key,ids)=>{scope.push([key,ids]);return q},order:()=>q,range:()=>q,abortSignal:async()=>({data:[{id:listing,organisation_id:'owning-agency'}]})};return q}),rpc:vi.fn(()=>({abortSignal:async()=>failWebsite?{error:{message:'denied'}}:{data:{summary:{sceneViews:152,enquiries:4}}}}))}
 const readListing=vi.fn(async()=>({property24:{metrics:{views:{available:true,value:12,complete:true}},lastAttempt:{status:'completed',failed:false}},privateProperty:{metrics:{views:{available:true,value:8,complete:true}}}}))
 return {client,readListing,scope}
}
it('loads each connected development once, preserving listing ownership and channel order data',async()=>{
 const setupData=setup();const signal=new AbortController().signal
 const result=await loadMobileDeveloperMarketing([dev,dev],signal,setupData)
 expect(setupData.scope).toEqual([['development_id',[dev]]])
 expect(setupData.readListing).toHaveBeenCalledWith({organisationId:'owning-agency',listingId:listing,days:30,signal})
 expect(setupData.client.rpc).toHaveBeenCalledTimes(1)
 expect(result.property24.metrics.views.value).toBe(12)
 expect(result.privateProperty.metrics.views.value).toBe(8)
 expect(result.website.metrics.views.value).toBe(152)
 expect(result.website.metrics.enquiries.value).toBe(4)
})
it('does not fabricate zero website views when analytics are denied',async()=>{
 const result=await loadMobileDeveloperMarketing([dev],new AbortController().signal,setup(true))
 expect(result.website.metrics.views).toMatchObject({available:false,value:null})
})
it('only counts developer leads created in the last thirty days, including the boundary',()=>{
 const now=Date.parse('2026-11-06T08:00:00Z'),day=86400000
 const rows=[{id:'new',createdAt:new Date(now).toISOString()},{id:'boundary',created_at:new Date(now-30*day).toISOString()},{id:'old',createdAt:new Date(now-30*day-1).toISOString()},{id:'future',createdAt:new Date(now+1).toISOString()},{id:'unknown'}]
 expect(recentDeveloperLeads(rows,now).map(row=>row.id)).toEqual(['new','boundary'])
})
