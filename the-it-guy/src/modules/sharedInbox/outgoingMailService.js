import { isSupabaseConfigured,supabase } from '../../lib/supabaseClient.js'
function client(){if(!isSupabaseConfigured||!supabase)throw Error('Email sending is not configured.');return supabase}
async function invoke(name,options){
 const response=await client().functions.invoke(name,{...options,timeout:60000})
 if(response.error?.context instanceof Response){try{const body=await response.error.context.clone().json();if(body?.error)throw Error(body.error)}catch(cause){if(cause instanceof Error&&cause.name!=='SyntaxError')throw cause}}
 return result(response)
}
function result(response){if(response.error)throw response.error;if(response.data?.error)throw Error(response.data.error);return response.data}
export async function loadSendingMailboxes(organisationId){return result(await client().rpc('shared_inbox_sending_mailboxes',{p_org:organisationId}).abortSignal(AbortSignal.timeout(20000)))||[]}
export async function queueOutgoingEmail({organisationId,channelId,requestId,email}){return invoke('shared-inbox-send',{body:{organisationId,channelId,requestId,email}})}
export async function uploadOutgoingAttachment({organisationId,channelId,file}){
 const body=new FormData();body.append('organisationId',organisationId);body.append('channelId',channelId);body.append('file',file)
 return invoke('shared-inbox-upload',{body})
}
export async function loadOutgoingEmails(organisationId,requestId=null){return result(await client().rpc('shared_inbox_outgoing',{p_org:organisationId,p_request:requestId}).abortSignal(AbortSignal.timeout(20000)))||[]}
export async function changeOutgoingEmail({organisationId,jobId,action}){return result(await client().rpc('shared_inbox_outgoing_action',{p_org:organisationId,p_job:jobId,p_action:action}).abortSignal(AbortSignal.timeout(20000)))}
export async function configureSmtpMailbox(input){return invoke('shared-inbox-smtp',{body:input})}

export async function loadReplyContext({organisationId,conversationId}){return result(await client().rpc('shared_inbox_reply_context',{p_org:organisationId,p_conversation:conversationId}).abortSignal(AbortSignal.timeout(20000)))}
