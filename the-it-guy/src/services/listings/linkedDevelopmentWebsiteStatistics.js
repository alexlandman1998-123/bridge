import {supabase} from '../../lib/supabaseClient.js'
export async function loadLinkedDevelopmentWebsiteStatistics(developmentId,days,{client=supabase}={}){
 if(!developmentId)return null
 const [analytics,profile,development]=await Promise.all([
  client.rpc('get_development_visual_analytics',{requested_development_id:developmentId,requested_days:days}),
  client.from('development_profiles').select('marketing_content').eq('development_id',developmentId).maybeSingle(),
  client.from('developments').select('name').eq('id',developmentId).maybeSingle(),
 ])
 const config=profile.data?.marketing_content?.listingConfiguration||profile.data?.marketing_content?.listing_configuration
 const published=profile.error||!config?null:Boolean(config.publicVisibility&&config.marketingStatus==='live')
 const metric=value=>({available:typeof value==='number'&&Number.isFinite(value)&&value>=0,value:typeof value==='number'?value:null,complete:false})
 const summary=analytics.error?null:analytics.data?.summary
 return {scope:'development',developmentName:development.data?.name||'Linked development',published,statisticsUnavailable:!summary,complete:false,
  periodLabel:`Whole development · Last ${days} days, including today. Scene visits and saved website enquiries; not individual listing visits.`,
  metrics:{views:metric(summary?.sceneViews),enquiries:metric(summary?.submittedEnquiries)}}
}
