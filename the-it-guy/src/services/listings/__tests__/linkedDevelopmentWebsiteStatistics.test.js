import {it,expect,vi} from 'vitest'
import {loadLinkedDevelopmentWebsiteStatistics} from '../linkedDevelopmentWebsiteStatistics.js'
const client=(error=null)=>({rpc:vi.fn().mockResolvedValue({data:error?null:{summary:{sceneViews:153,enquiries:4,submittedEnquiries:2}},error}),from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='developments'?{name:'Madison Place'}:{marketing_content:{listingConfiguration:{publicVisibility:true,marketingStatus:'live'}}}})})})})})
it('uses authenticated development analytics and actual live website configuration',async()=>{
 const api=client(),result=await loadLinkedDevelopmentWebsiteStatistics('dev',30,{client:api})
 expect(result.published).toBe(true);expect(result.metrics.views.value).toBe(153);expect(result.metrics.enquiries.value).toBe(2)
 expect(api.rpc).toHaveBeenCalledWith('get_development_visual_analytics',{requested_development_id:'dev',requested_days:30})
})
it('retains live publication state when statistics are unavailable',async()=>{
 const result=await loadLinkedDevelopmentWebsiteStatistics('dev',7,{client:client({message:'Unavailable'})})
 expect(result.published).toBe(true);expect(result.statisticsUnavailable).toBe(true);expect(result.metrics.views.available).toBe(false)
})
it('does not request development data for an unlinked listing',async()=>{
 const api=client();expect(await loadLinkedDevelopmentWebsiteStatistics(null,30,{client:api})).toBeNull();expect(api.rpc).not.toHaveBeenCalled()
})
