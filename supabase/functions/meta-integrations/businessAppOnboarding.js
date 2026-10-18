import { isMetaId, text } from '../_shared/metaIntegrationCore.js'
const result=async query=>{const {data,error}=await query;if(error)throw Error(error.message);return data}
const publicSender=row=>Object.fromEntries(['id','organisation_id','owner_user_id','ownership_version','waba_id','phone_number_id','display_phone_number','business_display_name','connection_status','verification_status','last_error_message','onboarding_mode','business_app_session','business_app_connected_at'].map(key=>[key,row[key]]))
export async function startBusinessAppSync({db,org,actor,sender,graph,senderToken}) {
  if(sender.onboarding_mode!=='coexistence')throw Error('Choose a WhatsApp Business phone app number.')
  for(const type of ['smb_app_state_sync','history']) {
    const claimed=await result(db.rpc('whatsapp_business_app_claim_request',{p_org:org,p_actor:actor.userId,p_sender:sender.id,p_version:sender.ownership_version,p_type:type,p_session:sender.business_app_session}))
    if(!claimed.claimed)continue
    let patch
    try {
      const response=await graph(await senderToken(sender),`${sender.phone_number_id}/smb_app_data`,{messaging_product:'whatsapp',sync_type:type})
      const id=text(response.request_id)
      if(!id||id.length>500)throw Error('Meta did not confirm the sync request.')
      patch={status:'requested',provider_request_id:id,error_message:null}
    }catch(error){patch={status:error.definitive?'failed':'unknown',error_message:'The initial phone app sync request was not confirmed. Check progress before reconnecting.'}}
    await result(db.from('whatsapp_business_app_requests').update(patch).eq('channel_id',sender.id).eq('organisation_id',org).eq('session_id',sender.business_app_session).eq('sync_type',type).eq('status','processing'))
  }
  return result(db.rpc('whatsapp_business_app_status',{p_org:org,p_actor:actor.userId,p_sender:sender.id}))
}
export async function finishWhatsAppAuthorization({db,org,actor,payload,session,graph,decrypt,encrypt,hash,now,senderToken}) {
  const wabaId=text(payload.wabaId),requestedPhone=text(payload.phoneNumberId)
  if(!session.token_ciphertext||!isMetaId(wabaId)||(requestedPhone&&!isMetaId(requestedPhone)))throw Error('Choose a WhatsApp Business Account and phone number in Meta.')
  const token=await decrypt(session.token_ciphertext),numbers=[];let after=''
  const business=await graph(token,`${wabaId}?fields=id,name`)
  if(text(business.id)!==wabaId)throw Error('Meta did not confirm this business account.')
  for(let page=0;page<5;page++) {
    const response=await graph(token,`${wabaId}/phone_numbers?fields=id,display_phone_number,is_on_biz_app,platform_type&limit=100${after?`&after=${encodeURIComponent(after)}`:''}`)
    numbers.push(...(response.data||[]));after=text(response.paging?.cursors?.after)
    if(!response.paging?.next)break
    if(!after||after.length>1000||page===4)throw Error('Meta returned an incomplete phone number list. Reconnect after reviewing the account.')
  }
  const available=numbers.filter(row=>isMetaId(text(row.id))&&(!session.coexistence||row.is_on_biz_app===true&&row.platform_type==='CLOUD_API'))
  if(!requestedPhone&&available.length!==1)return {requiresPhoneSelection:true,wabaId,phones:available.map(row=>({id:row.id,displayPhoneNumber:text(row.display_phone_number)}))}
  const phoneId=requestedPhone||available[0]?.id
  if(!numbers.some(row=>text(row.id)===phoneId))throw Error('The selected phone number does not belong to the authorized WhatsApp business account.')
  const phone=await graph(token,`${phoneId}?fields=id,display_phone_number,verified_name,code_verification_status,status,is_on_biz_app,platform_type`)
  if(text(phone.id)!==phoneId)throw Error('Meta did not confirm the selected phone number.')
  if(session.coexistence&&(phone.is_on_biz_app!==true||phone.platform_type!=='CLOUD_API'))throw Error('Meta has not confirmed this number for both the phone app and Arch9. Complete the phone verification in Meta and reconnect.')
  if(!session.coexistence&&phone.is_on_biz_app===true)throw Error('Reconnect using the WhatsApp Business phone app option for this number.')
  const existing=await result(db.from('organisation_communication_channels').select('id,organisation_id,owner_user_id').eq('phone_number_id',phoneId).eq('provider','meta').eq('channel_type','whatsapp').eq('connection_status','connected').maybeSingle())
  if(existing&&existing.organisation_id!==org)throw Error('This phone number is already connected to another workspace.')
  const own=existing||await result(db.from('organisation_communication_channels').select('id,owner_user_id').eq('organisation_id',org).eq('phone_number_id',phoneId).eq('provider','meta').eq('channel_type','whatsapp').maybeSingle())
  if(!actor.isAdmin&&(session.owner_user_id!==actor.userId||(own&&own.owner_user_id!==actor.userId)))throw Error('An administrator must transfer an existing agency or agent number.')
  await graph(token,`${wabaId}/subscribed_apps`,{})
  const metadata={at:now().toISOString(),display_phone_number:text(phone.display_phone_number),business_display_name:text(phone.verified_name)||text(business.name),connection_status:session.coexistence||phone.status==='CONNECTED'?'connected':'pending',verification_status:phone.code_verification_status==='VERIFIED'||session.coexistence?'verified':'pending',is_on_biz_app:phone.is_on_biz_app===true,platform_type:text(phone.platform_type)}
  const saved=(await result(db.rpc('whatsapp_finish_authorization',{p_org:org,p_actor:actor.userId,p_state:await hash(payload.state),p_waba:wabaId,p_phone:phoneId,p_metadata:metadata,p_encrypted:await encrypt(token)}))).sender
  let sync=null,syncWarning=''
  if(session.coexistence)try{sync=await startBusinessAppSync({db,org,actor,sender:saved,graph,senderToken})}catch{syncWarning='Phone app connected. Check initial sync progress below; keep the phone app open.'}
  return {sender:publicSender(saved),sync,syncWarning}
}
