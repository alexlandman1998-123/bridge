import { canPublishPage, canReply, isMetaId, isUuid, publicListingPost, text } from '../_shared/metaIntegrationCore.js'

const result = async (query) => { const {data,error}=await query; if(error) throw new Error(error.message); return data }
const safeSender = 'id,organisation_id,waba_id,phone_number_id,display_phone_number,business_display_name,connection_status,verification_status,last_error_message'
const safePage = 'id,page_id,page_name,connection_status,granted_scopes,page_tasks,last_error_message'
const safeMessages = 'id,conversation_id,direction,message_type,body_text,media_json,delivery_status,error_message,event_at,created_at'
const safePosts = 'id,listing_id,connection_id,snapshot_json,status,provider_post_id,public_url,error_message,created_at,published_at'

export function createMetaIntegrationHandler({db,authorize,graph,encrypt,decrypt,exchangeCode,hash,config,loadListing,assertPublishable,downloadMedia,now=()=>new Date()}) {
  async function channel(org,id) {
    if(!isUuid(id)) throw new Error('Choose a WhatsApp sender.')
    const row=await result(db.from('organisation_communication_channels').select('*').eq('organisation_id',org).eq('id',id).eq('provider','meta').eq('channel_type','whatsapp').maybeSingle())
    if(!row) throw new Error('WhatsApp sender not found in this workspace.')
    return row
  }
  async function conversation(org,id) {
    if(!isUuid(id)) throw new Error('Choose a conversation.')
    const row=await result(db.from('whatsapp_inbox_conversations').select('*').eq('organisation_id',org).eq('id',id).maybeSingle())
    if(!row) throw new Error('Conversation not found in this workspace.')
    return row
  }
  async function page(org,id) {
    if(!isUuid(id)) throw new Error('Choose a connected Facebook Page.')
    const row=await result(db.from('meta_lead_ads_connections').select('*').eq('organisation_id',org).eq('id',id).eq('connection_status','connected').maybeSingle())
    if(!row) throw new Error('Facebook Page not found in this workspace.')
    return row
  }
  const senderToken = async row => row.token_ciphertext ? decrypt(row.token_ciphertext) : text(row.meta_access_token)
  async function authSession(org,actor,state) {
    if(!text(state) || text(state).length>200) throw new Error('Restart the WhatsApp connection.')
    const row=await result(db.from('meta_whatsapp_authorizations').select('*').eq('state_hash',await hash(state)).eq('organisation_id',org).eq('requested_by',actor.userId).is('consumed_at',null).gt('expires_at',now().toISOString()).maybeSingle())
    if(!row) throw new Error('WhatsApp authorization expired. Start the connection again.')
    return row
  }
  return async function handle(payload,authorization) {
    const org=text(payload.organisationId),action=text(payload.action)
    if(!isUuid(org)) throw new Error('Choose an organisation workspace.')
    const actor=await authorize(authorization,org)
    if(!actor?.userId) throw new Error('Active staff membership is required.')
    const adminActions=['begin_whatsapp','exchange_whatsapp_code','finish_whatsapp','register_sender','health_sender','disconnect_sender']
    if(adminActions.includes(action)&&!actor.isAdmin) throw new Error('An organisation administrator must manage Meta connections.')
    if(action==='workspace') {
      const [senders,pages]=await Promise.all([
        result(db.from('organisation_communication_channels').select(safeSender).eq('organisation_id',org).eq('provider','meta').eq('channel_type','whatsapp').order('created_at')),
        result(db.from('meta_lead_ads_connections').select(safePage).eq('organisation_id',org).order('connected_at')),
      ])
      return {senders:senders||[],pages:(pages||[]).map(p=>({...p,canPost:canPublishPage(p)})),canManage:actor.isAdmin}
    }
    if(action==='begin_whatsapp') {
      if(!config.appId||!config.whatsappConfigId) throw new Error('WhatsApp embedded signup is not configured.')
      const state=crypto.randomUUID()+crypto.randomUUID()
      await result(db.from('meta_whatsapp_authorizations').insert({state_hash:await hash(state),organisation_id:org,requested_by:actor.userId,expires_at:new Date(now().getTime()+600000).toISOString()}))
      return {state,appId:config.appId,configurationId:config.whatsappConfigId,graphVersion:config.graphVersion}
    }
    if(action==='exchange_whatsapp_code') {
      const session=await authSession(org,actor,payload.state)
      if(!text(payload.code)||text(payload.code).length>8192) throw new Error('Meta returned no authorization code. Start again.')
      const claimed=await result(db.from('meta_whatsapp_authorizations').update({exchange_claimed_at:now().toISOString()}).eq('state_hash',session.state_hash).is('exchange_claimed_at',null).select('state_hash').maybeSingle())
      if(!claimed) throw new Error('This authorization code was already handled. Start again if the connection did not finish.')
      const token=await exchangeCode(text(payload.code))
      await result(db.from('meta_whatsapp_authorizations').update({token_ciphertext:await encrypt(token)}).eq('state_hash',session.state_hash))
      return {exchanged:true}
    }
    if(action==='finish_whatsapp') {
      const session=await authSession(org,actor,payload.state)
      const wabaId=text(payload.wabaId),phoneId=text(payload.phoneNumberId)
      if(!session.token_ciphertext||!isMetaId(wabaId)||!isMetaId(phoneId)) throw new Error('Choose a WhatsApp Business Account and phone number in Meta.')
      const token=await decrypt(session.token_ciphertext)
      const [business,phone,numbers]=await Promise.all([graph(token,`${wabaId}?fields=id,name`),graph(token,`${phoneId}?fields=id,display_phone_number,verified_name,code_verification_status,status`),graph(token,`${wabaId}/phone_numbers?fields=id&limit=100`)])
      if(text(business.id)!==wabaId||text(phone.id)!==phoneId||!numbers.data?.some(n=>text(n.id)===phoneId)) throw new Error('The selected phone number does not belong to the authorized WhatsApp business account.')
      const existing=await result(db.from('organisation_communication_channels').select('id,organisation_id').eq('phone_number_id',phoneId).eq('provider','meta').eq('channel_type','whatsapp').eq('connection_status','connected').maybeSingle())
      if(existing&&existing.organisation_id!==org) throw new Error('This phone number is already connected to another workspace.')
      const consumed=await result(db.from('meta_whatsapp_authorizations').update({consumed_at:now().toISOString(),token_ciphertext:null}).eq('state_hash',session.state_hash).is('consumed_at',null).select('state_hash').maybeSingle())
      if(!consumed) throw new Error('This WhatsApp connection was already completed.')
      await graph(token,`${wabaId}/subscribed_apps`,{})
      const fields={organisation_id:org,provider:'meta',channel_type:'whatsapp',waba_id:wabaId,phone_number_id:phoneId,display_phone_number:text(phone.display_phone_number),business_display_name:text(phone.verified_name)||text(business.name),connection_status:phone.status==='CONNECTED'?'connected':'pending',verification_status:phone.code_verification_status==='VERIFIED'?'verified':'pending',meta_access_token:'',token_ciphertext:await encrypt(token),connected_at:now().toISOString(),created_by:actor.userId,last_error_message:null}
      const own=existing||await result(db.from('organisation_communication_channels').select('id').eq('organisation_id',org).eq('phone_number_id',phoneId).maybeSingle())
      const saved=own?await result(db.from('organisation_communication_channels').update(fields).eq('id',own.id).eq('organisation_id',org).select(safeSender).single()):await result(db.from('organisation_communication_channels').insert(fields).select(safeSender).single())
      return {sender:saved}
    }
    if(action==='register_sender'||action==='health_sender'||action==='disconnect_sender') {
      const row=await channel(org,payload.senderId)
      if(action==='disconnect_sender') {
        await result(db.from('organisation_communication_channels').update({connection_status:'disconnected',disconnected_at:now().toISOString(),meta_access_token:'',token_ciphertext:null,is_default:false}).eq('id',row.id).eq('organisation_id',org))
        return {disconnected:true}
      }
      const token=await senderToken(row)
      if(action==='register_sender') {
        if(row.connection_status!=='pending'||!/^\d{6}$/.test(text(payload.pin))) throw new Error('Choose a pending sender and enter its six-digit registration PIN.')
        try { await graph(token,`${row.phone_number_id}/register`,{messaging_product:'whatsapp',pin:text(payload.pin)}) }
        catch { throw new Error('Meta could not register this number. Check the PIN and phone verification in WhatsApp Manager, then check the connection before retrying.') }
      }
      const phone=await graph(token,`${row.phone_number_id}?fields=id,status,display_phone_number,code_verification_status`)
      const sender=await result(db.from('organisation_communication_channels').update({connection_status:phone.status==='CONNECTED'?'connected':'pending',last_checked_at:now().toISOString(),last_error_message:null}).eq('id',row.id).eq('organisation_id',org).select(safeSender).single())
      return {sender}
    }
    if(action==='inbox') {
      const conversations=await result(db.from('whatsapp_inbox_conversations').select('*').eq('organisation_id',org).order('last_message_at',{ascending:false}).limit(100))
      return {conversations:(conversations||[]).map(c=>({...c,canReply:canReply(c,now().getTime())}))}
    }
    if(action==='messages'||action==='conversation_status') {
      const row=await conversation(org,payload.conversationId)
      if(action==='conversation_status') {
        if(!['open','closed'].includes(payload.status)) throw new Error('Choose open or closed.')
        await result(db.from('whatsapp_inbox_conversations').update({status:payload.status,updated_at:now().toISOString()}).eq('id',row.id).eq('organisation_id',org))
        return {status:payload.status}
      }
      const messages=await result(db.from('whatsapp_inbox_messages').select(safeMessages).eq('organisation_id',org).eq('conversation_id',row.id).order('event_at',{ascending:false}).order('id',{ascending:false}).limit(100))
      await result(db.from('whatsapp_inbox_conversations').update({unread_count:0}).eq('id',row.id).eq('organisation_id',org).eq('last_inbound_at',row.last_inbound_at))
      return {conversation:{...row,canReply:canReply(row,now().getTime())},messages:(messages||[]).reverse()}
    }
    if(action==='reply') {
      const row=await conversation(org,payload.conversationId),body=text(payload.message),id=text(payload.requestId)
      if(!isUuid(id)||!body||body.length>4096) throw new Error('Write a reply of 1 to 4,096 characters.')
      const previous=await result(db.from('whatsapp_inbox_messages').select('id,conversation_id,body_text,delivery_status,created_by').eq('id',id).eq('organisation_id',org).maybeSingle())
      if(previous) {
        if(previous.conversation_id!==row.id||previous.body_text!==body||previous.created_by!==actor.userId) throw new Error('This reply identifier was already used for a different message.')
        return {message:previous}
      }
      if(!canReply(row,now().getTime())) throw new Error('The 24-hour reply window has closed. Use an approved WhatsApp template campaign to contact this person.')
      const sender=await channel(org,row.channel_id)
      if(sender.connection_status!=='connected') throw new Error('Reconnect the WhatsApp sender before replying.')
      const sentAt=now().toISOString()
      const insert=await db.from('whatsapp_inbox_messages').insert({id,organisation_id:org,conversation_id:row.id,channel_id:row.channel_id,direction:'outbound',message_type:'text',body_text:body,delivery_status:'sending',event_at:sentAt,created_by:actor.userId})
      if(insert.error?.code==='23505') {
        const receipt=await result(db.from('whatsapp_inbox_messages').select('id,conversation_id,body_text,delivery_status,created_by').eq('id',id).eq('organisation_id',org).maybeSingle())
        if(!receipt||receipt.conversation_id!==row.id||receipt.body_text!==body||receipt.created_by!==actor.userId) throw new Error('This reply identifier was already used for a different message.')
        return {message:receipt}
      }
      if(insert.error) throw new Error(insert.error.message)
      try {
        const response=await graph(await senderToken(sender),`${sender.phone_number_id}/messages`,{messaging_product:'whatsapp',to:row.contact_phone,type:'text',text:{body},biz_opaque_callback_data:`arch9-inbox:${id}`})
        const messageId=text(response.messages?.[0]?.id)
        if(!messageId) throw new Error('Meta did not confirm this reply. Check its status before sending again.')
        await result(db.rpc('whatsapp_inbox_status',{p_phone_id:sender.phone_number_id,p_waba_id:sender.waba_id,p_message_id:messageId,p_callback:`arch9-inbox:${id}`,p_status:'sent',p_at:now().toISOString(),p_error:null}))
        await result(db.from('whatsapp_inbox_conversations').update({last_message_at:sentAt,last_message_preview:body.slice(0,240),updated_at:now().toISOString()}).eq('id',row.id).eq('organisation_id',org).lte('last_message_at',sentAt))
      } catch(error) {
        await db.from('whatsapp_inbox_messages').update({delivery_status:error.definitive?'failed':'unknown',error_message:error.definitive?text(error.message).slice(0,500):'The send result is unconfirmed. Check delivery before sending again.'}).eq('id',id).eq('organisation_id',org).eq('delivery_status','sending')
      }
      return {message:await result(db.from('whatsapp_inbox_messages').select(safeMessages).eq('id',id).eq('organisation_id',org).single())}
    }
    if(action==='media') {
      if(!isUuid(payload.messageId)) throw new Error('Choose a message attachment.')
      const message=await result(db.from('whatsapp_inbox_messages').select('channel_id,media_json').eq('id',payload.messageId).eq('organisation_id',org).maybeSingle())
      if(!message||!isMetaId(message.media_json?.id)) throw new Error('Attachment not found in this workspace.')
      const sender=await channel(org,message.channel_id)
      return await downloadMedia(await senderToken(sender),message.media_json.id)
    }
    if(['listing_posts','preview_post','publish_post'].includes(action)) {
      let job
      if(action==='publish_post') {
        if(!isUuid(payload.postId)) throw new Error('Preview the listing post first.')
        job=await result(db.from('meta_listing_posts').select('*').eq('id',payload.postId).eq('organisation_id',org).eq('created_by',actor.userId).maybeSingle())
        if(!job) throw new Error('Post preview not found. Prepare a new preview.')
      }
      const listingId=job?.listing_id||payload.listingId
      if(!isUuid(listingId)) throw new Error('Choose a saved listing.')
      const loaded=await loadListing(actor,org,listingId)
      if(!loaded?.listing) throw new Error('You do not have access to this listing.')
      if(action==='listing_posts') return {posts:await result(db.from('meta_listing_posts').select(safePosts).eq('organisation_id',org).eq('listing_id',listingId).order('created_at',{ascending:false}).limit(10))}
      await assertPublishable(actor,org,listingId)
      const connection=await page(org,job?.connection_id||payload.connectionId)
      if(!canPublishPage(connection)) throw new Error('Reconnect this Facebook Page with Page posting permission and a profile that can create Page content.')
      if(action==='preview_post') {
        const snapshot=publicListingPost(loaded.listing,loaded.media,payload,config.storageOrigin)
        const post=await result(db.from('meta_listing_posts').insert({organisation_id:org,listing_id:listingId,connection_id:connection.id,snapshot_json:snapshot,created_by:actor.userId}).select(safePosts).single())
        return {post,pageName:connection.page_name}
      }
      if(job.status!=='draft') return {post:job.status==='published'?Object.fromEntries(safePosts.split(',').map(k=>[k,job[k]])):{id:job.id,status:job.status,error_message:'This post was already submitted. Check its status before creating another post.'}}
      const checked=publicListingPost(loaded.listing,loaded.media,{caption:job.snapshot_json.caption,mode:job.snapshot_json.mode,imageId:job.snapshot_json.imageId},config.storageOrigin)
      if(Object.keys(checked).some(key=>checked[key]!==job.snapshot_json[key])) throw new Error('The listing changed after this preview. Prepare and review a new preview.')
      const claimed=await result(db.from('meta_listing_posts').update({status:'publishing'}).eq('id',job.id).eq('organisation_id',org).eq('status','draft').select('id').maybeSingle())
      if(!claimed) return {post:{id:job.id,status:'publishing'}}
      try {
        const snapshot=job.snapshot_json
        const response=await graph(await decrypt(connection.token_ciphertext),`${connection.page_id}/${snapshot.mode==='photo'?'photos':'feed'}`,snapshot.mode==='photo'?{url:snapshot.imageUrl,caption:[snapshot.caption,snapshot.link].filter(Boolean).join('\n\n'),published:true}:{message:snapshot.caption,...(snapshot.link?{link:snapshot.link}:{}),published:true})
        const postId=text(response.post_id||response.id)
        if(!/^[0-9_]+$/.test(postId)) throw new Error('Meta did not confirm the post. Check the Page before posting again.')
        await result(db.from('meta_listing_posts').update({status:'published',provider_post_id:postId,public_url:`https://www.facebook.com/${postId}`,published_at:now().toISOString(),error_message:null}).eq('id',job.id).eq('organisation_id',org))
      } catch(error) {
        await db.from('meta_listing_posts').update({status:error.definitive?'failed':'unknown',error_message:error.definitive?text(error.message).slice(0,500):'The publish result is unconfirmed. Check the Page before posting again.'}).eq('id',job.id).eq('organisation_id',org).eq('status','publishing')
      }
      return {post:await result(db.from('meta_listing_posts').select(safePosts).eq('id',job.id).eq('organisation_id',org).single())}
    }
    throw new Error('Unknown Meta integration action.')
  }
}
