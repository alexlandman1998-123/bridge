import { audienceDraft, audienceFilters } from '../_shared/whatsappAudience.js'
import { isUuid } from '../_shared/metaIntegrationCore.js'
const result=async query=>{const {data,error}=await query;if(error)throw new Error(error.message);return data}
export async function handleAudiences({db,actor,org,action,payload}){
  const fields={p_org:org,p_actor:actor.userId,p_action:action.replace('audience_',''),p_id:payload.audienceId||null,p_version:payload.version??null}
  if(fields.p_id&&!isUuid(fields.p_id))throw new Error('Choose a saved audience.')
  if(action==='audience_save')fields.p_config=audienceDraft(payload.audience)
  if(action==='audience_preview'){
    fields.p_config={filters:audienceFilters(payload.filters)}
    fields.p_limit=Number.isInteger(payload.limit)?payload.limit:500
    fields.p_search=String(payload.search||'').trim().slice(0,100)
  }
  return result(db.rpc('whatsapp_audiences_request',fields))
}
export async function handleCampaignRoutes({db,actor,org,action,payload}){
  if(!actor.isAdmin)throw new Error('Agency management must manage Meta campaign routing.')
  if(payload.routeId&&!isUuid(payload.routeId))throw new Error('Choose a saved campaign route.')
  return result(db.rpc('meta_campaign_routes_request',{p_org:org,p_actor:actor.userId,p_action:action.replace('meta_routes_',''),p_id:payload.routeId||null,p_version:payload.version??null,p_config:payload.route||null}))
}
