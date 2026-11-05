import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
function client() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Inbox is not configured.')
  return supabase
}
export async function loadConversationPage({ organisationId, conversationId, before }) {
  const { data, error } = await client().rpc('shared_inbox_conversation_page', {
    p_organisation_id: organisationId, p_conversation_id: conversationId,
    p_before_time: before?.occurred_at || null, p_before_id: before?.id || null,
  })
  if (error) throw error
  const drafts=(data?.messages||[]).filter(message=>message.message_type==='draft').map(message=>message.id)
  if(drafts.length){
    const owners=await client().from('revo_inbox_messages').select('id,created_by').eq('organisation_id',organisationId).eq('conversation_id',conversationId).eq('message_type','draft').in('id',drafts)
    if(!owners.error){const byId=new Map((owners.data||[]).map(row=>[row.id,row.created_by]));data.messages=data.messages.map(message=>({...message,created_by:byId.get(message.id)}))}
  }
  return data
}
export async function loadConversationActivity({ organisationId, conversationId }) {
  const { data, error } = await client().from('revo_inbox_activity').select('id,action,metadata_json,created_at')
    .eq('organisation_id',organisationId).eq('conversation_id',conversationId).order('created_at',{ascending:false}).limit(50)
  if (error) throw error
  return (data || []).reverse()
}
export async function downloadMailAttachment({ organisationId, attachmentId }) {
  const { data, error } = await client().functions.invoke('revo-inbox-attachment', { body: { organisationId, attachmentId } })
  if (error) throw error
  if (!(data instanceof Blob)) throw new Error('Attachment could not be downloaded.')
  return data
}

export async function loadInlineMailImages({ organisationId, messageId }) {
  const { data, error } = await client().from('shared_inbox_attachments')
    .select('id,content_id,content_type,byte_size').eq('organisation_id', organisationId)
    .eq('message_id', messageId).eq('state', 'available').not('content_id', 'is', null)
  if (error) throw error
  const images = {}
  let total = 0
  for (const file of data || []) {
    if (!/^image\/(png|jpeg|gif|webp|avif)$/i.test(file.content_type) || file.byte_size > 5 * 1024 * 1024) continue
    total += file.byte_size
    if (total > 20 * 1024 * 1024) break
    const blob = await downloadMailAttachment({ organisationId, attachmentId: file.id })
    if (blob.size > 5 * 1024 * 1024) continue
    const bytes = new Blob([blob], { type: file.content_type })
    images[file.content_id.replace(/^<|>$/g, '')] = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Embedded image unavailable.'))
      reader.readAsDataURL(bytes)
    })
  }
  return images
}

export async function deletePrivateMailDraft({organisationId,conversationId,messageId,userId}) {
 if(!userId)throw Error('Sign in to delete your draft.')
 const {data,error}=await client().from('revo_inbox_messages').delete()
   .eq('organisation_id',organisationId).eq('conversation_id',conversationId).eq('id',messageId)
   .eq('created_by',userId).eq('message_type','draft').eq('direction','internal').eq('delivery_status','queued')
   .select('id').maybeSingle()
 if(error)throw error
 if(!data)throw Error('This draft is unavailable or you do not have permission to delete it.')
}
