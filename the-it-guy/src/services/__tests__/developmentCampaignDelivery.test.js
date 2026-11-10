import {expect,it,vi} from 'vitest'
import {checkCampaignSourceFreshness} from '../../../../supabase/functions/_shared/emailCampaignSourceFreshness.js'
import {createCampaignDelivery} from '../../../../supabase/functions/_shared/whatsappCampaignDelivery.js'
import {createCampaignHandler} from '../../../../supabase/functions/whatsapp-campaigns/handler.js'
const org='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001'
const context={source:'development_workspace',version:1,organisation_id:org,development_id:'dev',event_id:'event',event_snapshot:{title:'Launch',starts_at:'2030-11-20T10:00:00Z',location:'Centre'}}
function client(campaign,{error=null}={}){return{from(table){const row=table==='whatsapp_campaigns'?campaign:table==='developments'?{id:'dev',status:'active'}:table==='marketing_events'?{id:'event',status:'cancelled'}:null;const q={select:()=>q,eq:()=>q,single:async()=>({data:row,error:null}),maybeSingle:async()=>({data:row,error})};if(!['whatsapp_campaigns','developments','marketing_events'].includes(table))throw Error('Sender or recipient touched before source validation');return q}}}
it('blocks stale development invitations in the real email source pipeline',async()=>{
 const campaign={organisation_id:org,content_json:{arch9_context:context}}
 expect(await checkCampaignSourceFreshness({db:client(),campaign})).toMatchObject({ready:false,retryable:false,code:'development_review_required'})
})
it('blocks stale development invitations in the WhatsApp review handler and delivery worker before contacting Meta',async()=>{
 const row={id,organisation_id:org,status:'draft',revision:1,parameter_values:{__arch9_context:context}},meta=vi.fn(),db=client(row)
 const handler=createCampaignHandler({db,meta,authorize:async()=> 'actor'})
 await expect(handler({organisationId:org,campaignId:id,action:'preflight',revision:1},'token')).rejects.toThrow('cancelled')
 await expect(createCampaignDelivery({db,meta}).deliver(row,'lease')).rejects.toThrow('cancelled')
 expect(meta).not.toHaveBeenCalled()
})
it('leaves WhatsApp recipients unclaimed for the next worker tick on a temporary source failure',async()=>{
 const row={id,organisation_id:org,parameter_values:{__arch9_context:context}},meta=vi.fn(),db=client(row,{error:Error('temporary')})
 await createCampaignDelivery({db,meta}).deliver(row,'lease')
 expect(meta).not.toHaveBeenCalled()
 expect(await checkCampaignSourceFreshness({db,campaign:{...row,content_json:{arch9_context:context}}})).toMatchObject({ready:false,retryable:true})
})
