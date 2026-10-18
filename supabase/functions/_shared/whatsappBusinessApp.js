const text=value=>typeof value==='string'?value.trim():''
const phone=value=>{const number=text(value).replace(/^\+/, '');return /^[1-9][0-9]{6,14}$/.test(number)?number:''}
const list=value=>Array.isArray(value)?value:[]
const metaId=value=>/^\d{1,32}$/.test(text(value))
function at(value,milliseconds=false) {
  const number=Number(value),date=new Date(milliseconds&&number>1e12?number:number*1000)
  return Number.isFinite(number)&&number>0&&Number.isFinite(date.getTime())?date.toISOString():''
}
function canonical(value) {
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export async function captureBusinessAppWebhook(db,payload) {
  let saved=0
  if(payload.object!=='whatsapp_business_account')return saved
  for(const entry of list(payload.entry))for(const change of list(entry.changes)) {
    const value=change.value||{},field=text(change.field),waba=text(entry.id),phoneId=text(value.metadata?.phone_number_id)
    if(!metaId(waba))continue
    if(field==='account_update'&&['PARTNER_REMOVED','ACCOUNT_OFFBOARDED','ACCOUNT_RECONNECTED'].includes(value.event)) {
      const timestamp=at(entry.time),number=phone(text(value.phone_number).replace(/[^0-9]/g,''))
      if(Object.hasOwn(value,'phone_number')&&!number)continue
      if(timestamp){const result=await db.rpc('whatsapp_business_app_account',{p_waba_id:waba,p_phone:number,p_event:value.event,p_at:timestamp,p_reason:text(value.disconnection_info?.reason)});if(result.error)throw Error('Unable to save the phone app connection update.')}
      continue
    }
    if(!metaId(phoneId)||!['history','smb_app_state_sync','smb_message_echoes','messages'].includes(field))continue
    const body=field==='messages'?{...value,messages:list(value.messages).filter(message=>['edit','revoke'].includes(message.type))}:value
    if(field==='messages'&&!body.messages.length)continue
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical({field,value:body}))))).map(byte=>byte.toString(16).padStart(2,'0')).join('')
    const result=await db.rpc('whatsapp_business_app_enqueue',{p_phone_id:phoneId,p_waba_id:waba,p_field:field,p_payload:body,p_hash:hash})
    if(result.error)throw Error('Unable to save the phone app update.')
    if(result.data)saved++
  }
  return saved
}
function content(message) {
  const type=text(message?.type)||'unsupported',asset=message?.[type]||{}
  const body=text(type==='text'?asset.body:['image','document','video'].includes(type)?asset.caption:type==='button'?asset.text:type==='interactive'?asset.button_reply?.title||asset.list_reply?.title:type==='location'?asset.name||asset.address:'')
  const media=['image','document','video','audio','sticker'].includes(type)&&metaId(asset.id)?{id:text(asset.id),mimeType:text(asset.mime_type),filename:text(asset.filename),caption:text(asset.caption)}:{}
  return {type:type.slice(0,32),body:body.slice(0,16000),media}
}
function observation(message,{source,thread='',business='',name=''}) {
  const from=phone(message?.from),to=phone(message?.to),id=text(message?.id),timestamp=at(message?.timestamp)
  if(!from||!id||id.length>500||!timestamp)return null
  let contact,direction
  if(source==='business_app'){if(!to||(business&&from!==business))return null;contact=to;direction='outbound'}
  else if(thread){contact=phone(thread);if(!contact)return null;direction=from===contact?'inbound':from===business&&(!to||to===contact)||!business&&to===contact?'outbound':''}
  else{direction=to&&from===business?'outbound':'inbound';contact=direction==='outbound'?to:from}
  if(!direction||contact===business)return null
  if(['edit','revoke'].includes(message.type)) {
    const original=text(message[message.type]?.original_message_id)
    if(!original||original.length>500)return null
    return {kind:'mutation',contact,direction,original,at:timestamp,action:message.type,...(message.type==='edit'?content(message.edit.message):{type:'unsupported',body:'',media:{}})}
  }
  return {kind:'message',contact,direction,id,at:timestamp,source,name,status:direction==='inbound'?'received':text(message.history_context?.status).toLowerCase()||'sent',...content(message)}
}
export function businessAppItems(field,value) {
  const items=[],business=phone(text(value.metadata?.display_phone_number).replace(/[^0-9]/g,''))
  if(field==='smb_app_state_sync') {
    for(const row of list(value.state_sync)) {
      const contact=phone(row.contact?.phone_number),timestamp=at(row.metadata?.timestamp,true)
      if(row.type==='contact'&&contact&&timestamp&&['add','remove'].includes(row.action))items.push({kind:'contact',contact,name:text(row.contact?.full_name||row.contact?.first_name).slice(0,160),removed:row.action==='remove',at:timestamp})
    }
  } else if(field==='history') {
    for(const chunk of list(value.history)) {
      for(const error of list(chunk.errors))items.push({kind:'history_error',code:String(error.code)})
      for(const thread of list(chunk.threads))for(const message of list(thread.messages)) {
        const item=observation(message,{source:'history',thread:thread.id,business});if(item)items.push(item)
      }
      const progress=chunk.metadata?.progress
      if(Number.isInteger(progress)&&progress>=0&&progress<=100)items.push({kind:'progress',progress})
    }
    for(const message of [...list(value.messages),...list(value.message_echoes)]) {
      const item=observation(message,{source:'history',business});if(item)items.push(item)
    }
  } else if(field==='smb_message_echoes'||field==='messages') {
    for(const message of list(field==='messages'?value.messages:value.message_echoes)) {
      const name=text(list(value.contacts).find(contact=>contact.wa_id===message.from)?.profile?.name)
      const item=observation(message,{source:field==='messages'?'cloud_api':'business_app',business,name})
      if(item&&(field!=='messages'||item.kind==='mutation'))items.push(item)
    }
  }
  return items
}

export async function readWhatsAppWebhookBody(request) {
  const max=12*1024*1024
  if(Number(request.headers.get('content-length'))>max)throw Error('Webhook too large.')
  const reader=request.body?.getReader();if(!reader)return ''
  const chunks=[];let size=0
  try{for(;;){const row=await reader.read();if(row.done)break;size+=row.value.length;if(size>max)throw Error('Webhook too large.');chunks.push(row.value)}}finally{await reader.cancel()}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  return new TextDecoder().decode(bytes)
}
