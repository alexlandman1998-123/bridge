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
