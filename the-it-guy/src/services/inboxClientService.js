import { supabase } from '../lib/supabaseClient'
import { metaIntegrationRequest } from './metaIntegrationService'

async function invalidateClients(){const { invalidateAgentClientDirectoryCache }=await import('../core/clients/agentClientDirectory');invalidateAgentClientDirectoryCache()}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function id(value){if(!UUID.test(String(value||'')))throw Error('Choose a saved workspace record.');return value}
async function result(query){const response=await query;if(response.error){if(['42P01','PGRST205'].includes(response.error.code))throw Error('Shared client tags and enquiries need the database update before they can be used.');throw response.error}return response.data}
const profileFields='id,organisation_id,name,primary_email,primary_phone,version,merged_into'
const clientView=row=>({identityId:row.id,identityVersion:row.version,organisationId:row.organisation_id,name:row.name,email:row.primary_email||'',phone:row.primary_phone||''})
export async function clientForInboxLead(organisationId,leadId){
 id(organisationId);id(leadId)
 const link=await result(supabase.from('agency_client_links').select('client_id').eq('organisation_id',id(organisationId)).eq('source_kind','lead').eq('source_id',id(leadId)).maybeSingle());if(!link)return null
 let row=await result(supabase.from('agency_client_profiles').select(profileFields).eq('organisation_id',organisationId).eq('id',link.client_id).maybeSingle());if(row?.merged_into)row=await result(supabase.from('agency_client_profiles').select(profileFields).eq('organisation_id',organisationId).eq('id',row.merged_into).maybeSingle());return row?clientView(row):null
}
async function clientIds(client){const rows=await result(supabase.from('agency_client_profiles').select('id').eq('organisation_id',id(client.organisationId)).eq('merged_into',id(client.identityId)));return [client.identityId,...rows.map(row=>row.id)]}
export async function searchInboxClients(organisationId,search=''){
 const clean=String(search).replace(/[^\p{L}\p{N}\s@.+_-]/gu,'').trim().slice(0,100)
 let query=supabase.from('agency_client_profiles').select(profileFields).eq('organisation_id',id(organisationId)).is('merged_into',null).order('name').limit(50)
 if(clean)query=query.or(`name.ilike.%${clean}%,primary_phone.ilike.%${clean}%,primary_email.ilike.%${clean}%`)
 return (await result(query)||[]).map(clientView)
}
export async function loadClientTags(client){const ids=await clientIds(client);const rows=await result(supabase.from('agency_client_tags').select('tag,client_id').eq('organisation_id',client.organisationId).in('client_id',ids).order('tag'));return [...new Set(rows.map(row=>row.tag))]}
export async function findClientTags(organisationId){const rows=await result(supabase.from('agency_client_tags').select('tag').eq('organisation_id',id(organisationId)).order('tag').limit(1000));return [...new Set(rows.map(row=>row.tag))]}
export async function addClientTag(client,value){const tag=String(value||'').trim().toLowerCase();if(!tag||tag.length>60)throw Error('Use a tag of 1–60 characters.');const response=await supabase.from('agency_client_tags').insert({organisation_id:id(client.organisationId),client_id:id(client.identityId),tag});if(response.error&&response.error.code!=='23505')await result(response);return tag}
export async function removeClientTag(client,tag){const ids=await clientIds(client);await result(supabase.from('agency_client_tags').delete().eq('organisation_id',client.organisationId).in('client_id',ids).eq('tag',tag))}
function imageUrl(value){
 if(Array.isArray(value)){for(const item of value){const url=imageUrl(item);if(url)return url}return ''}
 if(value&&typeof value==='object')return imageUrl(value.url||value.file_url||value.imageUrl||value.src)
 return /^https?:\/\//i.test(String(value||''))?String(value):''
}
export async function searchClientProperties(organisationId,kind,search=''){
 const org=id(organisationId),development=kind==='development'
 let options
 if(development){
  const rows=await result(supabase.from('developments').select('id,name,status').eq('organisation_id',org).order('name'))
  options=(rows||[]).filter(row=>!['archived','deleted','cancelled','closed'].includes(String(row.status||'').toLowerCase())).map(row=>({id:row.id,title:row.name||'Untitled development',kind}))
 }else{
  const rows=await result(supabase.from('private_listings').select('id,title,suburb,assigned_agent_id').eq('organisation_id',org).order('title').limit(500))
  options=(rows||[]).map(row=>({id:row.id,title:row.title||row.suburb||'Untitled',kind,assignedAgentId:row.assigned_agent_id||null}))
 }
 const clean=String(search).trim().toLowerCase();options=options.filter(row=>!clean||row.title.toLowerCase().includes(clean))
 if(!options.length)return options
 const ids=options.map(row=>row.id),images=new Map()
 // Optional pictures may be inaccessible; that must never broaden the option scope.
 if(development){
  const response=await supabase.from('development_profiles').select('development_id,image_links,marketing_content').in('development_id',ids)
  if(!response.error){
   const {refreshDevelopmentMedia}=await import('../lib/developmentMediaStorage')
   for(const row of await refreshDevelopmentMedia(supabase,response.data||[],{strict:false})){
    const library=row.marketing_content?.mediaLibrary||row.marketing_content?.media_library||{}
    images.set(row.development_id,imageUrl([library.heroImageUrl,library.hero_image_url,library.coverImageUrl,library.cover_image_url,library.galleryImageUrls,library.gallery_image_urls,row.image_links]))
   }
  }
 }else{
  const response=await supabase.from('listing_media').select('id,listing_id,media_type,file_url,is_cover,sort_order,storage_bucket,storage_path').in('listing_id',ids).eq('media_type','image').order('is_cover',{ascending:false}).order('sort_order')
  if(!response.error){
   const {refreshListingPhotoUrls}=await import('./listings/listingPhotoStorage')
   for(const row of await refreshListingPhotoUrls(supabase,response.data||[],{strict:false}))if(!images.has(row.listing_id)&&imageUrl(row.file_url))images.set(row.listing_id,imageUrl(row.file_url))
  }
 }
 return options.map(row=>({...row,imageUrl:images.get(row.id)||''}))
}
export async function loadClientPropertyEnquiries(client){
 const ids=await clientIds(client),rows=await result(supabase.from('agency_client_property_enquiries').select('id,listing_id,development_id,created_at,private_listings(id,title),developments(id,name)').eq('organisation_id',client.organisationId).in('client_id',ids).order('created_at',{ascending:false}))
 return [...new Map(rows.map(row=>{const development=Boolean(row.development_id),target=row.development_id||row.listing_id;return [`${development}:${target}`,{id:row.id,targetId:target,title:development?row.developments?.name:row.private_listings?.title,kind:development?'development':'listing',createdAt:row.created_at,path:development?`/developments/${target}`:`/listings/${target}`}]})).values()]
}
export async function addClientPropertyEnquiry(client,kind,targetId){if(!['listing','development'].includes(kind))throw Error('Choose a listing or development.');const response=await supabase.from('agency_client_property_enquiries').insert({organisation_id:id(client.organisationId),client_id:id(client.identityId),[kind==='development'?'development_id':'listing_id']:id(targetId)});if(response.error&&response.error.code!=='23505')await result(response)}
export async function linkInboxLead({organisationId,conversationId,kind,recordId,channel,actorId}){
 if(channel==='email'){const response=await supabase.from('revo_inbox_associations').upsert({organisation_id:id(organisationId),conversation_id:id(conversationId),entity_type:'lead',entity_id:id(recordId),created_by:id(actorId)},{onConflict:'conversation_id,entity_type,entity_id',ignoreDuplicates:true});if(response.error)throw response.error;await invalidateClients();return}
 const context=await metaIntegrationRequest(organisationId,'crm_context',{conversationId});if(context.linked?.recordId===recordId)return
 await metaIntegrationRequest(organisationId,'link_crm',{conversationId,kind,recordId,linkVersion:context.version,assignmentVersion:context.assignmentVersion});await invalidateClients()
}
export async function createInboxLead({organisationId,current,actor,firstName,lastName,email,phone,category,property}){
 if(!['buyer','seller'].includes(category))throw Error('Choose a buyer or seller lead.');if(!String(firstName||'').trim())throw Error('Enter a first name.')
 const { createAgencyCrmLeadRecord }=await import('../lib/agencyCrmRepository')
 const lead=await createAgencyCrmLeadRecord(organisationId,{contact:{firstName:firstName.trim(),lastName:String(lastName||'').trim(),phone:phone||current.contact_phone||'',email:String(email||'').trim(),contactType:category},assignedAgent:actor,assignedUserId:actor.id,createdBy:actor.id,leadCategory:category,leadDirection:'Inbound',propertyInterest:category==='buyer'?property?.title:'',listingId:category==='buyer'&&property?.kind==='listing'?property.id:null,leadSource:current.channel==='email'?'Email':'WhatsApp',stage:'New Lead',priority:'Medium',notes:`Created from an ${current.channel==='email'?'email':'WhatsApp'} inbox conversation.`},{actor,notifyAgent:false});await invalidateClients();return {recordId:lead.leadId,kind:category}
}

// The authenticated client preserves lead and contact RLS for every search result.
export async function searchInboxLeads(organisationId,search='') {
 const rows=await result(supabase.rpc('whatsapp_crm_search_leads',{p_org:id(organisationId),p_search:String(search).trim().slice(0,100)}))
 return rows||[]
}

export async function saveInboxLeadProperty({organisationId,recordId,property}) {
 const client=await clientForInboxLead(organisationId,recordId)
 if(!client)throw Error('The lead is saved. Its client profile is not ready yet; retry to attach the property.')
 await addClientPropertyEnquiry(client,property.kind,property.id)
}

export async function routeInboxLead({organisationId,recordId,listingId,expectedAgentId,mode,actor}) {
 if(!['refer','share'].includes(mode))throw Error('Choose Refer or Share.')
 const listing=await result(supabase.from('private_listings').select('id,assigned_agent_id').eq('organisation_id',id(organisationId)).eq('id',id(listingId)).single())
 const agentId=listing?.assigned_agent_id
 if(!agentId)throw Error('This listing has no assigned agent.')
 if(agentId!==expectedAgentId)throw Error('The listing’s assigned agent changed. Close this form and review the listing before handing over the lead.')
 if(agentId===actor?.id)return
 if(mode==='share') {
  const {addLeadCollaborator}=await import('./leadCollaboratorService')
  await addLeadCollaborator({organisationId,leadId:recordId,userId:agentId})
 } else {
  const lead=await result(supabase.from('leads').select('assigned_user_id,assigned_agent_id').eq('organisation_id',id(organisationId)).eq('lead_id',id(recordId)).single())
  if(lead.assigned_user_id===agentId&&lead.assigned_agent_id===agentId)return
  const {assignLeadToAgent}=await import('./leadAssignmentService')
  await assignLeadToAgent({organisationId,leadId:recordId,agentId,reason:'Referred from Inbox to the listing’s assigned agent'},{actor,notifyAgentEmail:false})
 }
 await invalidateClients()
}
