import { canReply, isMetaId, isUuid, text } from '../_shared/metaIntegrationCore.js'
import { buildTemplateMessage, previewTemplate, templateIdentity } from '../_shared/whatsappCampaign.js'
import { decodeInboxAttachment, inboxTemplateFields } from '../_shared/whatsappInboxMessaging.js'

const safeMessage = row => row && Object.fromEntries(['id','conversation_id','direction','message_type','body_text','media_json','delivery_status','error_message','event_at','created_at','created_by','template_json'].map(key=>[key,row[key]]))
const safeUpload = row => row && ({ id:row.id,status:row.status,filename:row.filename,mimeType:row.mime_type })
const result = async query => { const {data,error}=await query;if(error)throw new Error(error.message);return data }

export async function handleInboxMessaging({ db,actor,org,action,payload,conversation,channel,senderToken,graph,uploadMedia,hash,now }) {
  const rpc = (name,fields) => result(db.rpc(name,{p_org:org,p_actor:actor.userId,...fields}))
  if (['inbox_page','message_page','inbox_notifications'].includes(action)) {
    const cursor=payload.cursor
    if (cursor && (!isUuid(cursor.id)||!Number.isFinite(Date.parse(cursor.at)))) throw new Error('Invalid history cursor.')
    if(payload.knownIds&&(!Array.isArray(payload.knownIds)||payload.knownIds.length>1000||!payload.knownIds.every(isUuid)))throw new Error('Invalid conversation cache.')
    if (action==='message_page'&&!isUuid(payload.conversationId)) throw new Error('Choose a conversation.')
    const data=await rpc('whatsapp_inbox_page',{p_action:action==='inbox_page'?'list':action==='message_page'?'thread':'notifications',p_conversation:payload.conversationId||null,p_before_at:cursor?.at||null,p_before_id:cursor?.id||null,p_search:text(payload.search),p_known:payload.knownIds||[]})
    return data.conversation?{...data,conversation:{...data.conversation,canReply:canReply(data.conversation,now().getTime())}}:data
  }
  const thread=await conversation(org,actor,payload.conversationId)
  if (action==='message_permission') {
    if (payload.operation==='save' && payload.confirmed!==true) throw new Error('Confirm the recipient agreed to these WhatsApp messages.')
    return rpc('whatsapp_inbox_permission',{p_conversation:thread.id,p_action:payload.operation||'read',p_version:payload.version??null,p_assignment_version:payload.assignmentVersion??null,p_source:text(payload.source)||null,p_consent_at:payload.consentAt||null})
  }
  if (action==='message_receipt') {
    if (!isUuid(payload.requestId)) throw new Error('Choose a message attempt.')
    const message=await result(db.from('whatsapp_inbox_messages').select('*').eq('id',payload.requestId).eq('organisation_id',org).eq('conversation_id',thread.id).eq('created_by',actor.userId).maybeSingle())
    return {message:safeMessage(message)}
  }
  const sender=await channel(org,thread.channel_id)
  async function templates() {
    if (sender.connection_status!=='connected'||!isMetaId(sender.waba_id)) throw new Error('Reconnect this WhatsApp number to load templates.')
    const token=await senderToken(sender),rows=[];let after=''
    for(let page=0;page<5;page++) {
      const response=await graph(token,`${sender.waba_id}/message_templates?fields=id,name,language,status,category,components&limit=100${after?`&after=${encodeURIComponent(after)}`:''}`)
      rows.push(...(response.data||[]));after=text(response.paging?.cursors?.after)
      if (!response.paging?.next||!after) return rows
      if(after.length>1000)throw new Error('Meta returned an invalid template cursor.')
    }
    throw new Error('Too many templates to load. Narrow your template library in WhatsApp Manager.')
  }
  if(action==='inbox_templates') return {templates:await templates()}
  const requestId=text(payload.requestId)
  if(!isUuid(requestId)||!Number.isInteger(payload.assignmentVersion)) throw new Error('Refresh the conversation before sending.')
  const claim = fields=>rpc('whatsapp_inbox_claim',{p_conversation:thread.id,p_request:requestId,p_assignment_version:payload.assignmentVersion,p_sender_version:sender.ownership_version,p_at:now().toISOString(),...fields})
  if(action==='upload_attachment') {
    const file=decodeInboxAttachment(payload.file)
    const intent={filename:file.filename,mimeType:file.mimeType,sha256:await hash(file.bytes),size:file.bytes.length}
    const claimed=await claim({p_upload:true,p_intent:intent})
    if(!claimed.claimed) return {upload:safeUpload(claimed.upload)}
    try {
      const response=await uploadMedia(await senderToken(sender),sender.phone_number_id,file)
      if(!isMetaId(text(response.id))) throw new Error('Meta did not confirm the attachment upload.')
      await conversation(org,actor,thread.id)
      await result(db.from('whatsapp_inbox_uploads').update({status:'ready',provider_media_id:text(response.id)}).eq('id',requestId).eq('organisation_id',org))
    } catch(error) {
      await db.from('whatsapp_inbox_uploads').update({status:error.definitive?'failed':'unknown'}).eq('id',requestId).eq('organisation_id',org).eq('status','uploading')
      throw new Error('The attachment upload was not confirmed. Check the conversation and choose the file again.')
    }
    return {upload:safeUpload(await result(db.from('whatsapp_inbox_uploads').select('*').eq('id',requestId).eq('organisation_id',org).single()))}
  }
  const kind=text(payload.kind),body=text(payload.message),values=payload.values||{}
  if(!['text','image','document','template'].includes(kind)||body.length>4096||(!body&&kind==='text')) throw new Error('Write a message or choose a supported attachment/template.')
  const intent={kind,body,uploadId:payload.uploadId||null,template:kind==='template'?payload.template:null,values:kind==='template'?values:{}}
  const previous=await result(db.from('whatsapp_inbox_messages').select('*').eq('id',requestId).eq('organisation_id',org).maybeSingle())
  // Reconciliation uses the database intent, not a new provider send.
  if(previous) {
    const receipt=await claim({p_intent:intent,p_type:kind})
    return {message:safeMessage(receipt.message)}
  }
  let upload=null,media={},provider={messaging_product:'whatsapp',to:thread.contact_phone,type:kind},preview=body,template=null
  if(payload.uploadId) {
    if(!isUuid(payload.uploadId)) throw new Error('Choose a valid attachment.')
    upload=await result(db.from('whatsapp_inbox_uploads').select('*').eq('id',payload.uploadId).eq('organisation_id',org).eq('conversation_id',thread.id).eq('created_by',actor.userId).maybeSingle())
    if(!upload||upload.status!=='ready') throw new Error('Choose a confirmed attachment for this conversation.')
    media={id:upload.provider_media_id,mimeType:upload.mime_type,filename:upload.filename}
  }
  if(kind==='template') {
    template=(await templates()).find(row=>row.id===payload.template?.id)
    if(!template||templateIdentity(template)!==templateIdentity(payload.template)) throw new Error('The Meta template changed. Refresh templates before sending.')
    const {fields,unsupported}=inboxTemplateFields(template)
    if(unsupported.length) throw new Error(unsupported.join(' '))
    const mediaField=fields.find(field=>field.kind!=='text')
    if(mediaField&&(!upload||(mediaField.kind==='image')!==upload.mime_type.startsWith('image/'))) throw new Error('Choose the matching photo or PDF header attachment.')
    provider=buildTemplateMessage(template,{...values,...(mediaField?{'header.media':{source:'text',text:'https://arch9.example/owned-media'}}:{})},{phone:thread.contact_phone,full_name:thread.contact_name})
    if(mediaField) provider.template.components.find(part=>part.type==='header').parameters=[{type:mediaField.kind,[mediaField.kind]:{id:upload.provider_media_id,...(mediaField.kind==='document'?{filename:upload.filename}:{})}}]
    preview=previewTemplate(template,values,{full_name:thread.contact_name})
  } else if(kind==='text') provider.text={body}
  else {
    if(!upload||(kind==='image')!==upload.mime_type.startsWith('image/')) throw new Error('Choose the matching photo or PDF attachment.')
    if(body.length>1024)throw new Error('Attachment captions are limited to 1,024 characters.')
    provider[kind]={id:upload.provider_media_id,...(kind==='document'?{filename:upload.filename}:{}),...(body?{caption:body}:{})}
    preview=body||upload.filename
  }
  const claimed=await claim({p_intent:intent,p_type:kind,p_body:preview,p_media:media,p_upload_id:upload?.id||null,p_template:template?{name:template.name,language:template.language,category:template.category}:null})
  if(!claimed.claimed)return {message:safeMessage(claimed.message)}
  const sentAt=now().toISOString()
  try {
    const response=await graph(await senderToken(sender),`${sender.phone_number_id}/messages`,{...provider,biz_opaque_callback_data:`arch9-inbox:${requestId}`})
    const messageId=text(response.messages?.[0]?.id)
    if(!messageId)throw new Error('Meta did not confirm this message.')
    await result(db.rpc('whatsapp_inbox_status',{p_phone_id:sender.phone_number_id,p_waba_id:sender.waba_id,p_message_id:messageId,p_callback:`arch9-inbox:${requestId}`,p_status:'sent',p_at:now().toISOString(),p_error:null}))
    await result(db.from('whatsapp_inbox_conversations').update({last_message_at:sentAt,last_message_preview:preview.slice(0,240),updated_at:sentAt}).eq('id',thread.id).eq('organisation_id',org).lte('last_message_at',sentAt))
  } catch(error) {
    await db.from('whatsapp_inbox_messages').update({delivery_status:error.definitive?'failed':'unknown',error_message:error.definitive?text(error.message).slice(0,500):'The send result is unconfirmed. Check this message before sending again.'}).eq('id',requestId).eq('organisation_id',org).eq('delivery_status','sending')
  }
  return {message:safeMessage(await result(db.from('whatsapp_inbox_messages').select('*').eq('id',requestId).eq('organisation_id',org).single()))}
}
