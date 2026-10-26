import { requireInboxMailboxUser } from './sharedInboxAccess.ts';
import { receivingClient,receivingCors,receivingJson } from './inboxReceiving.ts';
import { normalizeOutgoing,outgoingBody,OUTGOING_FILE_LIMIT } from './inboxOutgoing.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function boundedBody(req:Request,maximum:number):Promise<Blob>{
 if(Number(req.headers.get('content-length'))>maximum)throw Error('Choose a smaller email or attachment.');
 const reader=req.body?.getReader();if(!reader)throw Error('Missing request body');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maximum)throw Error('Choose a smaller email or attachment.');chunks.push(part.value)}}finally{await reader.cancel().catch(()=>{})}
 return new Blob(chunks as BlobPart[]);
}
export function inboxSendingHandler(kind:'send'|'upload'|'smtp',client:()=>any=receivingClient){return async(req:Request):Promise<Response>=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:receivingCors});
 if(req.method!=='POST')return receivingJson(405,{error:'method_not_allowed'});
 try{
  const db=client();
  const bearer=String(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const session=bearer?await db.auth.getUser(bearer):null;
  if(!session?.data?.user||session.error)return receivingJson(401,{error:'Sign in before sending email.'});
  const userId=session.data.user.id;
  if(kind==='upload'){
   const maximum=OUTGOING_FILE_LIMIT+16384;
   if(Number(req.headers.get('content-length'))>maximum)return receivingJson(413,{error:'Choose an attachment smaller than 10 MiB.'});
   const form=await new Response(await boundedBody(req,maximum),{headers:{'content-type':req.headers.get('content-type')||''}}).formData();
   const org=String(form.get('organisationId')||''),channel=String(form.get('channelId')||''),actor=await requireInboxMailboxUser(db,org,userId,channel,'send');
   const file=form.get('file');if(!(file instanceof File)||file.size>OUTGOING_FILE_LIMIT)throw Error('Choose an attachment smaller than 10 MiB');
   const id=crypto.randomUUID(),path=`${org}/${channel}/outgoing/${id}`,filename=file.name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,500)||'attachment';
   const upload=await db.storage.from('shared-inbox-attachments').upload(path,file,{contentType:'application/octet-stream',upsert:false});
   if(upload.error)throw Error('Attachment could not be uploaded');
   const registered=await db.rpc('shared_inbox_register_outgoing_file',{p_org:org,p_channel:channel,p_actor:actor,p_id:id,p_filename:filename,p_size:file.size,p_path:path});
   if(registered.error)throw Error('Attachment access changed. Upload it again');
   return receivingJson(201,{id,filename,size:file.size});
  }
  const raw=await (await boundedBody(req,kind==='smtp'?8192:160000)).text();
  const body=JSON.parse(raw),org=String(body.organisationId||''),channel=String(body.channelId||''),actor=await requireInboxMailboxUser(db,org,userId,channel,kind==='send'?'send':'manage');
  if(kind==='smtp'){
   const secret={host:String(body.host||'').trim().toLowerCase(),port:Number(body.port),username:String(body.username||'').trim(),password:String(body.password||'')};
   const result=await db.rpc('shared_inbox_configure_smtp',{p_org:org,p_channel:channel,p_actor:actor,p_secret:secret});
   if(result.error)throw Error('Connect the IMAP mailbox, check SMTP settings, and wait for any active send to finish.');
   return receivingJson(200,{status:'configured'});
  }
  if(!UUID.test(String(body.requestId)))throw Error('Reload the email composer');
  const payload=normalizeOutgoing(body.email||{});
  const signature=await db.from('shared_inbox_mailbox_signatures').select('signature_json,revision').eq('organisation_id',org).eq('channel_id',channel).maybeSingle();
  if(signature.error)throw Error('Mailbox signature could not be loaded');
  if(payload.useSignature && (signature.data?.revision||0)!==payload.signatureRevision)throw Error('Signature changed. Reload the composer before sending');
  const result=await db.rpc('shared_inbox_queue_email',{p_org:org,p_channel:channel,p_actor:actor,p_request:body.requestId,p_payload:payload,p_rendered:outgoingBody(payload,signature.data?.signature_json||{})});
  if(result.error)throw Error('Email could not be queued. Check mailbox access, connection, signature and attachments.');
  return receivingJson(202,result.data);
 }catch(error){return receivingJson(400,{error:error instanceof Error && /^(Enter |Choose |Write |Reload |Signature changed|Mailbox signature|Email could not|Attachment|Connect the IMAP)/.test(error.message)?error.message:'Email action failed. Check your mailbox access and settings.'});}
};}
