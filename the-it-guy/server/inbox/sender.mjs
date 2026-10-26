import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import { pinnedHost } from './providers/imap.mjs'
import { accessToken,rpc } from './receiver.mjs'
import { ReceiveError,readBytes } from './common.mjs'
const error = code => { throw new ReceiveError(code) }
export async function buildOutgoingMime(job,prepared,attachments) {
 const payload=job.payload_json
 // Bcc belongs in the transport envelope / provider submission, never in a
 // delivered message header. HTTP providers consume and remove a Bcc header.
 const options={from:prepared.sender,to:payload.to,cc:payload.cc,bcc:payload.bcc,subject:payload.subject,
  text:job.rendered_json.text,html:job.rendered_json.html,messageId:prepared.message.internetMessageId,
  inReplyTo:prepared.message.inReplyTo||undefined,references:prepared.message.references||[],attachments,
  disableFileAccess:true,disableUrlAccess:true,date:new Date(job.created_at)}
 const mime=new MailComposer(options).compile()
 const raw=await mime.build()
 const envelope={from:prepared.sender,to:[...new Set([...payload.to,...payload.cc,...payload.bcc])]}
 // Gmail/Graph need Bcc in submitted MIME so it can build the envelope. SMTP
 // receives a separate envelope and the built MIME deliberately omits Bcc.
 const bcc=payload.bcc.length?Buffer.from(`Bcc: ${payload.bcc.join(', ')}\r\n`):Buffer.alloc(0)
 return {raw,apiRaw:Buffer.concat([bcc,raw]),envelope}
}
export async function smtpOperation(transport,operation,timeoutMs=60000) {
 let timer
 try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>{try{transport.close()}catch{/* no credentials in logs */}reject(new ReceiveError('smtp_timeout'))},timeoutMs)})])}
 finally{clearTimeout(timer)}
}
export async function smtpTransport(secret,{resolver,createTransport=nodemailer.createTransport}={}) {
 if(![465,587].includes(Number(secret?.port)))error('smtp_configuration_invalid')
 const host=await pinnedHost(secret.host,resolver)
 return createTransport({host,port:Number(secret.port),secure:Number(secret.port)===465,requireTLS:true,auth:{user:secret.username,pass:secret.password},
  tls:{servername:secret.host,rejectUnauthorized:true,minVersion:'TLSv1.2'},logger:false,debug:false,pool:false,
  connectionTimeout:20000,greetingTimeout:20000,socketTimeout:45000,disableFileAccess:true,disableUrlAccess:true})
}
export async function submitOutgoing(connection,prepared,mail,token,{fetcher=fetch,transport}={}) {
 if(connection.provider_key==='other_email') {
  try {
   const result=await smtpOperation(transport,()=>transport.sendMail({envelope:mail.envelope,raw:mail.raw,disableFileAccess:true,disableUrlAccess:true}))
   if(!result.accepted?.length)return {status:'failed',code:'smtp_recipients_rejected'}
   return {status:'accepted',providerId:null,rejected:result.rejected?.length||0,rejectedAddresses:(result.rejected||[]).map(value=>String(value)).filter(value=>mail.envelope.to.includes(value))}
  } catch(e) {return {status:e.code==='EAUTH'||Number(e.responseCode)>=400?'failed':'uncertain',code:e.code==='EAUTH'?'smtp_auth_failed':Number(e.responseCode)>=400?'smtp_submission_rejected':'provider_confirmation_unknown'}}
 }
 const google=connection.provider_key==='google_workspace'
 const account=connection.connection_kind==='delegated_shared_mailbox'?`users/${encodeURIComponent(connection.mailbox_address)}`:'me'
 const url=google?'https://gmail.googleapis.com/gmail/v1/users/me/messages/send':`https://graph.microsoft.com/v1.0/${account}/sendMail`
 const body=google?JSON.stringify({raw:mail.apiRaw.toString('base64url'),...(prepared.message.threadId?{threadId:prepared.message.threadId}:{})}):mail.apiRaw.toString('base64')
 let response
 try {response=await fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{authorization:`Bearer ${token}`,'content-type':google?'application/json':'text/plain'},body})}
 catch {return {status:'uncertain',code:'provider_confirmation_unknown'}}
 // Only explicit rejection is a definitive failure. A server error can occur
 // after acceptance, so it must never trigger an automatic duplicate send.
 if(!response.ok) {await response.body?.cancel();return {status:response.status>=400&&response.status<500?'failed':'uncertain',code:response.status===429?'provider_rate_limited':response.status===401||response.status===403?'provider_send_access_denied':response.status>=500?'provider_confirmation_unknown':'provider_submission_rejected'}}
 if(!google) {await response.body?.cancel();return response.status===202?{status:'accepted',providerId:null}:{status:'uncertain',code:'provider_confirmation_unknown'}}
 try {const result=JSON.parse((await readBytes(response,65536)).toString('utf8'));return result.id?{status:'accepted',providerId:result.id,threadId:result.threadId}:{status:'uncertain',code:'provider_confirmation_unknown'}}
 catch{return {status:'uncertain',code:'provider_confirmation_unknown'}}
}
export async function verifySender(connection,token,fetcher=fetch) {
 const google=connection.provider_key==='google_workspace',shared=connection.connection_kind==='delegated_shared_mailbox'
 if(google&&shared)error('google_delegation_unsupported')
 const url=google?'https://gmail.googleapis.com/gmail/v1/users/me/profile':shared?`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(connection.mailbox_address)}/mailFolders/inbox?$select=id`:'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName'
 let response
 try{response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{authorization:`Bearer ${token}`}})}catch{error('provider_unavailable')}
 if(!response.ok){await response.body?.cancel();error('provider_send_access_denied')}
 const profile=JSON.parse((await readBytes(response,65536)).toString('utf8'))
 if(!shared&&!(google?[profile.emailAddress]:[profile.mail,profile.userPrincipalName]).some(value=>String(value||'').toLowerCase()===connection.mailbox_address.toLowerCase()))error('mailbox_identity_mismatch')
}
export async function sendOne(db,{log=console.info,fetcher=fetch,makeTransport=smtpTransport,buildMime=buildOutgoingMime,env=process.env}={}) {
 const claimed=await rpc(db,'shared_inbox_claim_outgoing')
 if(!claimed)return false
 if(claimed.recovered)return true
 const {job,connection,token}=claimed,args={p_job:job.id,p_token:token}
 let begun=false,transport,receipt=null
 const prepare=()=>rpc(db,'shared_inbox_prepare_outgoing',args)
 const finish=result=>rpc(db,'shared_inbox_finish_outgoing',{...args,p_status:result.status,p_provider_id:result.providerId||null,p_thread_id:result.threadId||null,p_error:result.code||null,p_rejected:result.rejected||0,p_rejected_addresses:result.rejectedAddresses||[]})
 try {
  const prepared=await prepare();let access
  if(connection.provider_key==='other_email') {transport=await makeTransport(prepared.smtp);await smtpOperation(transport,()=>transport.verify())}
  else {access=await accessToken(connection,prepared.credential,secret=>rpc(db,'shared_inbox_rotate_mailbox_credential',{p_connection:connection.id,p_token:token,p_secret:secret}),{env,fetcher});await verifySender(connection,access,fetcher)}
  const attachments=[];let total=0
  for(const file of prepared.attachments) {
   await prepare()
   const result=await db.storage.from('shared-inbox-attachments').download(file.path)
   if(result.error||!result.data)error('outgoing_attachment_unavailable')
   const content=Buffer.from(await result.data.arrayBuffer());total+=content.length
   if(content.length!==file.size||content.length>10485760||total>20971520)error('outgoing_attachment_invalid')
   attachments.push({filename:file.filename,content,contentType:'application/octet-stream'})
  }
  const mail=await buildMime(job,prepared,attachments)
  if(connection.provider_key==='microsoft_365'&&mail.apiRaw.toString('base64').length>3900000)error('provider_message_too_large')
  await rpc(db,'shared_inbox_begin_submission',args);begun=true
  const result=await submitOutgoing(connection,prepared,mail,access,{fetcher,transport});receipt=result
  await finish(result)
  log(JSON.stringify({outboxId:job.id,status:result.status,code:result.code||null}))
 }catch(e){
  const result=receipt||{status:begun?'uncertain':'failed',code:begun?'provider_confirmation_unknown':e instanceof ReceiveError?e.code:e.code==='EAUTH'?'smtp_auth_failed':'email_preparation_failed'}
  let recorded=false
  try{await finish(result);recorded=true}catch{/* Keep the known receipt intact; never repeat provider submission. */}
  log(JSON.stringify({outboxId:job.id,status:result.status,code:result.code||null,recorded}))
 }finally{try{transport?.close()}catch{/* no provider logs */}}
 return true
}
